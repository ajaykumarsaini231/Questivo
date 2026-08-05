# Read one rendered page with the OCR engine built into Windows, and print the
# words with their bounding boxes as JSON.
#
# WHY OCR AT ALL
#
# GATE MT 2019, 2020 and 2021 are image scans with no text layer. The crops for
# every other year are placed by reading where each "Q.n" SITS on the page, and
# with no text layer there is nothing to read. Segmenting on pixels alone —
# whitespace bands and table rules — was tried and produced 76, 37 and 98 blocks
# on papers that all have exactly 65 questions, so a question would have been
# paired with the next question's answer.
#
# Only the question NUMBERS have to be recognised, not the questions. A number
# in a large clean scan is the easiest thing OCR does, and the result is checked
# against a known invariant — the numbers must run 1..65 in order — so a
# misread is caught rather than shipped.
#
# Windows.Media.Ocr ships with Windows 10/11; no install, no service, no upload.
#
# Usage:
#   powershell -File scripts/ocrPage.ps1 -Image page.png
#   powershell -File scripts/ocrPage.ps1 -Folder pages\    # one JSON per line
#
# The folder form exists because starting PowerShell and loading the WinRT
# projections costs about two seconds, and a paper is thirty pages.

param(
  [string]$Image,
  [string]$Folder,
  # Where to write the JSONL. Writing to a FILE rather than stdout is not a
  # convenience: PowerShell formats what goes to its output stream against the
  # host's buffer width, so a long single-line JSON object comes back wrapped
  # at 80-odd columns and the reader fails on a truncated string — several
  # minutes into a run that has already rendered and recognised every page.
  [string]$Out
)
if (-not $Image -and -not $Folder) { throw "Pass -Image or -Folder." }

$ErrorActionPreference = "Stop"

[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null

# WinRT methods return IAsyncOperation; PowerShell needs the generic
# AsTask/GetAwaiter dance to wait on them.
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object {
    $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq "IAsyncOperation``1"
  } | Select-Object -First 1

function Await($op, $type) {
  $m = $asTask.MakeGenericMethod($type)
  $t = $m.Invoke($null, @($op))
  try {
    $t.Wait(-1) | Out-Null
  } catch {
    # The real reason is inside the AggregateException; without unwrapping it
    # every failure reads "One or more errors occurred."
    $inner = $_.Exception
    while ($inner.InnerException) { $inner = $inner.InnerException }
    throw $inner.Message
  }
  $t.Result
}

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) { throw "No OCR language pack is installed." }

function Read-Page($path) {
  # StorageFile needs a rooted Windows path with backslashes; a forward-slash
  # path is rejected with a bare "value does not fall within the expected range".
  $full = (Resolve-Path -LiteralPath $path).ProviderPath
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($full)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

  $words = foreach ($line in $result.Lines) {
    foreach ($w in $line.Words) {
      [pscustomobject]@{
        # Control characters stripped before serialising. OCR of a scan emits
        # them for marks it cannot place, and ConvertTo-Json on Windows
        # PowerShell 5.1 passes them through raw — which produces JSON the
        # reader rejects with "bad control character in string literal", after
        # the whole paper has already been rendered and recognised.
        text = ($w.Text -replace '[\x00-\x1F\x7F]', '')
        x    = [math]::Round($w.BoundingRect.X, 1)
        y    = [math]::Round($w.BoundingRect.Y, 1)
        w    = [math]::Round($w.BoundingRect.Width, 1)
        h    = [math]::Round($w.BoundingRect.Height, 1)
      }
    }
  }

  $bitmap.Dispose()
  $stream.Dispose()

  [pscustomobject]@{
    file   = [System.IO.Path]::GetFileName($full)
    width  = $decoder.PixelWidth
    height = $decoder.PixelHeight
    words  = @($words)
  }
}

$lines = if ($Folder) {
  # One compact JSON object per line, so the caller can stream them.
  Get-ChildItem -LiteralPath $Folder -Filter *.png | Sort-Object Name | ForEach-Object {
    (Read-Page $_.FullName) | ConvertTo-Json -Depth 4 -Compress
  }
} else {
  (Read-Page $Image) | ConvertTo-Json -Depth 4 -Compress
}

if ($Out) {
  [System.IO.File]::WriteAllLines($Out, [string[]]$lines, [System.Text.UTF8Encoding]::new($false))
} else {
  $lines
}
