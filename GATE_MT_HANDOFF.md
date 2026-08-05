# Task: add GATE Metallurgical Engineering (MT) to the Questivo PYQ archive

Paste everything below into a fresh Claude Code tab opened at
`C:\Users\LSE\Downloads\Questivo`.

---

Add GATE Metallurgical Engineering (MT) previous year papers to the Questivo PYQ
archive, matching what already exists for JEE Main 2022 and 2023. Read
`server-qusestivo/scripts/convertJeeMain.mjs` and the modules it imports before
writing anything — the pipeline, its schema and its failure modes are all
established, and this is an extension of it, not a new thing.

## Source files

`C:\Users\LSE\Downloads\ch\QPs GATE 2007 to 2025-20260804T185121Z-1-001\QPs GATE 2007 to 2025\MT\`

- `MT2007.pdf` … `MT2025.pdf` — 19 question papers
- `MT-2019 answer key.pdf` … `MT-2025 answer key.pdf` — 7 answer keys

**Do 2019–2025 only.** Those are the years with a key. A question with no
verified key must not be served: a wrong answer teaches the mistake. If you
convert the older papers at all, import them with `status: "needs_review"` and
`correctAnswer: null`.

## What the sources actually look like — verified, not assumed

**Question paper** (`MT2023.pdf`): `Q.1`, `Q.2` … at line starts, options
`(A) (B) (C) (D)`. Two sections: General Aptitude (GA) is Q.1–Q.10, the subject
paper is Q.11–Q.65. Single column.

**Answer key** (`MT-2023 answer key.pdf`): a six-column table —

| Q. No. | Session | Question Type (QT) | Subject Name (SN) | Key/Range (KY) | Mark (MK) |
|---|---|---|---|---|---|
| 1 | 6 | MCQ | GA | B | 1 |
| 28 | 6 | MSQ | MT | … | 2 |
| 30 | 6 | NAT | MT | … | 2 |

Column x-positions on the 612pt page: Q.No 105, Session 146, QT 154, SN 254,
KY 347, MK 424.

### This is materially easier than JEE — do not port the JEE inference

GATE **states the question type** (MCQ / MSQ / NAT) and the **marks per
question**. The whole `scripts/lib/sectionKeys.mjs` machinery — content-based
classification, interleave detection, key remapping — exists because the JEE
sources do not. Do not reuse it here. Read the type from the key table.

- `MCQ` → `mcq_single`
- `MSQ` → `mcq_multiple` (multiple-select; the key is several letters)
- `NAT` → `numerical`

## The one trap that will bite you

`scripts/lib/pdfLayout.mjs` splits a page into columns before reading it. That
is correct for two-up coaching booklets and **wrong for a table** — run on the
answer key it silently drops the Subject, Key and Mark columns and yields
`"1 6 MCQ"`, so every answer disappears and nothing reports an error.

Give `extractLines` a way to skip column splitting (e.g. an option), and use it
for the key. Verify by asserting that the parsed key for MT-2023 Q.1 is `B`
before you build anything on top.

## Marking scheme

GATE is not JEE. Per question, from the key's Mark column:

- 1-mark MCQ: +1, wrong −1/3
- 2-mark MCQ: +2, wrong −2/3
- NAT and MSQ: **no negative marking**

`PyqPaper.marksCorrect` / `marksIncorrect` are per-paper, so per-question marks
must come off `PreviousYearQuestion.marksCorrect` / `marksIncorrect`, which
already exist. Check `markPaper()` in `src/controllers/pyqController.js` uses the
per-question values — it does — and that MSQ scoring is right for
`mcq_multiple`, which the player has never actually exercised.

**The player cannot render MSQ today.** `PyqPaperRunner.tsx` shows radio buttons
for `mcq_single` and a number field otherwise. Multiple-select needs checkboxes
and a comma-joined answer. Either build it or import MSQ questions as
`needs_review` — do not silently serve them as single-choice.

## What to produce

1. `scripts/convertGateMt.mjs`, modelled on `convertJeeMain.mjs`, emitting the
   same row shape. `examCode: "GATE_MT"`. Confirm that code in
   `src/lib/pyqPattern.js` and add its subjects if missing.
2. Figure crops via `scripts/lib/figures.mjs` — stem, each option, solution —
   into `pyq-figures/gate-mt/`. It takes `baseName`, `wantOptions`,
   `wantSolution`, and auto-detects `(1)-(4)` vs `(A)-(D)`. GATE uses letters.
3. A `PyqPaper` row per year (GATE MT is one 3-hour paper of 65 questions,
   100 marks, no shifts) via `scripts/importPyqPapers.mjs`.
4. Import with `scripts/importPyq.mjs`, then link crops with
   `scripts/linkPyqFigures.mjs --base https://cdn.jsdelivr.net/gh/ajaykumarsaini231/Questivo@main/pyq-figures/gate-mt`.

## Rules this codebase already enforces — keep them

- **Never drop a question.** Unreadable ones are kept and flagged
  `needsFigure`, with the crop serving as the question.
- **Never invent a key.** No key → `status: "needs_review"`, `correctAnswer:
  null`. Keep that distinct from `"bonus"` (board awarded marks to everyone) —
  collapsing them scores an unknown question as full marks for all.
- **`questionHash` is positional, never text-derived**
  (`paperId|subject|questionNumber`). Hashing text means every extraction
  improvement inserts a duplicate archive instead of updating it. This has
  happened three times; each cost a manual cleanup of ~2,000 rows.
- **Run `node scripts/auditPyq.mjs --exam GATE_MT` when done.** It checks what a
  stored question would actually RENDER and exits non-zero on failure. Aim for
  zero on: `stem-empty`, `mcq-no-options`, `key-points-nowhere`,
  `unbalanced-math`, `displaced-astral`.

## Gotchas already paid for in this codebase

- Maths letters arrive as displaced astral scalars (U+1D465 as U+D465, a Hangul
  syllable) and Greek sits in the Symbol font's private-use area. Both are
  handled in `pdfLayout.mjs` / `symbolFont.mjs` — use `extractLines`, never
  `pdf-parse` directly.
- On Git Bash, a leading `/` argument is rewritten to a Windows path, so
  `--base /pyq-figures/x` arrives as `C:/Program Files/Git/pyq-figures/x`. This
  silently wrote 1,081 unusable paths. `linkPyqFigures.mjs` now rejects it.
- Images live at the repo ROOT in `pyq-figures/`, not `questivo/public/` —
  Vercel builds from `questivo/` and would bundle every megabyte.

## Ask before you do these

The repo is **public**, and `server-qusestivo/.gitignore` deliberately excludes
`data/pyq/*` because these papers are third-party copyright and pushing them
republishes them. The JEE images were pushed anyway, as an explicit decision by
the operator. Confirm with them before pushing GATE images rather than assuming
the precedent carries.
