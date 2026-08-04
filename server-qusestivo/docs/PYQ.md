# Previous year questions (PYQs)

How the PYQ feature works, and how to load real questions into it.

---

## 1. Why there is no scraper

JEE, NEET and GATE question papers are the **copyright of NTA and the IITs**.
Harvesting ten years of them into a commercial product is a real legal exposure,
so nothing in this codebase downloads a paper. The import tool reads a file
**you** supply, and records where it came from on every row.

Sources that are safe to import:

- papers you are licensed or permitted to republish
- questions authored in-house by your own faculty
- a dataset whose licence permits redistribution — put the licence in `--source`

`sourceUrl` and `sourceNote` are stored per question and returned by the API, so
the origin of anything published can always be traced.

Everything else in the feature — storage, browsing, solutions, pattern
derivation, the PYQ-backed test runner — is built and tested. The only missing
input is the questions themselves.

---

### What is loaded today

**469 JEE Main 2025 Mathematics questions** from
[PhysicsWallahAI/JEE-Main-2025-Math](https://huggingface.co/datasets/PhysicsWallahAI/JEE-Main-2025-Math)
on Hugging Face — **Apache-2.0**, published by PhysicsWallah themselves as an AI
evaluation set. That licence permits commercial use and redistribution with
attribution, so this content is genuinely clear to publish. Both the URL and the
licence are recorded on every row.

Reproduce it end to end:

```bash
curl -L -o data/raw/jan.jsonl https://huggingface.co/datasets/PhysicsWallahAI/JEE-Main-2025-Math/resolve/main/main2025-jan.jsonl
curl -L -o data/raw/apr.jsonl https://huggingface.co/datasets/PhysicsWallahAI/JEE-Main-2025-Math/resolve/main/main2025-apr.jsonl
cat data/raw/jan.jsonl data/raw/apr.jsonl > data/raw/jee-main-2025-maths.jsonl
node scripts/convertDataset.mjs --file data/raw/jee-main-2025-maths.jsonl --exam JEE_MAIN --subject Mathematics --year 2025 --tag-topics JEE_MAIN --write data/pyq/jee-main-2025-maths.json
node scripts/verifyPyq.mjs --file data/pyq/jee-main-2025-maths.json --sample 20
node scripts/importPyq.mjs --file data/pyq/jee-main-2025-maths.json --exam JEE_MAIN --year 2025 --source "https://huggingface.co/datasets/PhysicsWallahAI/JEE-Main-2025-Math"
```

Still missing: Physics, Chemistry, and years before 2025. The same three
commands take any dataset with those.

### JEE Advanced — 513 questions, 2016–2023, both papers

From [daman1209arora/jeebench](https://huggingface.co/datasets/daman1209arora/jeebench)
(**MIT**), joined with
[joyboseroy/jee-advanced-skill-tags-2016-2023](https://huggingface.co/datasets/joyboseroy/jee-advanced-skill-tags-2016-2023)
(**MIT**) for chapter topics.

```bash
curl -L -o data/raw/jeebench.json https://huggingface.co/datasets/daman1209arora/jeebench/resolve/main/test.json
curl -L -o data/raw/jee-adv-skilltags.csv https://huggingface.co/datasets/joyboseroy/jee-advanced-skill-tags-2016-2023/resolve/main/jee_advanced_2016-2023_tagged.csv
node scripts/convertJeeAdvanced.mjs --file data/raw/jeebench.json --tags data/raw/jee-adv-skilltags.csv --write data/pyq/jee-advanced.json
node scripts/importPyq.mjs --file data/pyq/jee-advanced.json --exam JEE_ADVANCED --source "https://huggingface.co/datasets/daman1209arora/jeebench"
```

Stored per question: **year**, **paper** (`session` = "Paper 1"/"Paper 2"),
subject, question type, and **marks including the negative**:

| type | stored as | correct | wrong |
|---|---|---|---|
| MCQ | `mcq_single` | +3 | **−1** |
| MCQ (multiple) | `mcq_multiple` | +4 | **−2** |
| Integer | `integer` | +4 | 0 |
| Numeric | `numerical` | +4 | 0 |

Paper 1: 270 · Paper 2: 243. Mathematics 236 / Chemistry 156 / Physics 121.

> JEE Advanced **changes its marking scheme between years by design**. These are
> the modern per-type rules and are recorded on every row as indicative. The
> answer keys are unaffected — only the marks attached to them. Verify against
> the official paper for a given year before presenting a score as official.

Three parsing traps this archive sets, all of which silently lose questions:

- **2017 labels its options `[A] [B]`**, every other year uses `(A) (B)`.
  Assuming round brackets lost 39 of 50 questions from that single year — a
  loss concentrated in one year, which skews a year-over-year pattern badly.
- Some chemistry stems run their choices **inline** mid-paragraph.
- Relaxing the parser for that then broke prose like `…with coke (C) at 2500°C`
  — a bare `(C)` before `(B)` destroys the ascending run. Fixed by trying the
  strict line-anchored parse first and falling back to the loose one.

Result: 513 of 515. The remaining 2 (both 2017 Paper 2) genuinely have no
options in the source text.

### Sources assessed, and what they turned out to be

| source | verdict |
|---|---|
| `PhysicsWallahAI/JEE-Main-2025-Math` (HF) | **Used.** Apache-2.0, publisher's own AI eval set, 475 rows, clean |
| `daman1209arora/jeebench` (HF) | **Used.** MIT, 515 real JEE Advanced questions with year + paper |
| `joyboseroy/jee-advanced-skill-tags-2016-2023` (HF) | **Used.** MIT, 110 chapter-tagged rows, joined for topics |
| `11-47/jee_advanced_25k` (HF) | **Rejected.** Ships a `dataset_generator.py` and calls itself a "Reasoning Dataset" with `difficulty_level: JEE Advanced` — AI-generated questions *styled* like the exam, not real papers. Licence unstated. Publishing these as "previous year questions" would misrepresent them to candidates |
| `eQOURSE/jee-advanced-questions` (HF) | Not yet used. CC-BY-4.0, but ships as page images — needs OCR |
| `EduDevCommons/JEE-MAINS-ADVANCED` (HF) | Not yet used. MIT, delivered as a single ZIP |
| `Reja1/jee-neet-benchmark` (HF) | Not yet used. MIT, JEE + NEET, but scanned images — needs OCR |
| `samyakrajbayar/jee-mains-dataset…` (Kaggle) | **Not usable.** 43 KB of marks/percentile/rank data — no questions at all. Good for a rank predictor, not for PYQs |
| `mrutyunjaybiswal/questions-chapter-classification` (Kaggle) | CC0, 13.6 MB. Question→chapter labels; useful for topic coverage, needs Kaggle auth |
| MathonGo / eSaral PDF archives | Not used — coaching companies' own compilations, no licence to redistribute |

## 2. Importing

```bash
node scripts/importPyq.mjs --file data/pyq/jee-main-2024.json --exam JEE_MAIN --year 2024 --source "<url or licence>"
```

Validate without writing:

```bash
node scripts/importPyq.mjs --file data/pyq/jee-main-2024.json --exam JEE_MAIN --year 2024 --dry-run
```

Import ten years at once — exam and year are read from each filename:

```bash
node scripts/importPyq.mjs --dir data/pyq --source "<url or licence>"
```

Flags: `--file` `--dir` `--exam` `--year` `--session` `--source` `--note`
`--format txt` `--dry-run` `--help`.

Re-running an import is safe. Rows are upserted on a SHA-256 of the normalised
question text, so the same file twice does not duplicate anything, and a cached
solution is never overwritten with null.

### File formats

`data/pyq/TEMPLATE-jee-main-2024.json` is a working example. JSON is an array or
`{ "questions": [...] }`:

| field | required | notes |
|---|---|---|
| `subject` | yes | must match the exam's subject list (below) |
| `topic` | **strongly recommended** | this is what the AI pattern is derived from |
| `questionText` | yes | ≥ 10 chars; LaTeX in `\( ... \)` |
| `optionA`–`optionD` | MCQs only | omit entirely for numerical/integer |
| `correctAnswer` | yes | `"B"` · `"A,C"` · `"12.5"` |
| `questionType` | no | `mcq_single` (default) · `mcq_multiple` · `numerical` · `integer` |
| `marksCorrect` / `marksIncorrect` | no | default `+4` / `-1` (`0` for numerical) |
| `solution` | no | generated on demand and cached if absent |
| `session` | no | e.g. `"Jan Shift 1"` |
| `year` | no | overrides `--year` for that row |

A plain-text format is also accepted (`--format txt`) — one block per question
separated by `---`, using `Subject:` `Topic:` `Question:` `A)`…`D)` `Correct:`
`Explanation:` lines. It is the same layout the generator already emits, so a
paper can be typed up without writing JSON.

### Supported exams

| code | label | subjects accepted |
|---|---|---|
| `JEE_MAIN` | JEE Main | Physics, Chemistry, Mathematics |
| `NEET` | NEET UG | Physics, Chemistry, Biology |
| `GATE_MT` | GATE Metallurgical Engineering (MT/MME) | Thermodynamics and Rate Processes, Extractive Metallurgy, Physical Metallurgy, Mechanical Metallurgy, Manufacturing Processes, Engineering Mathematics, General Aptitude |

Anything else routes to the course request form instead. JEE **Advanced** is
deliberately excluded — it is a different paper, and serving it JEE Main history
would be worse than serving none.

The subject list is enforced at import: a mislabelled subject silently corrupts
every pattern derived from the table afterwards, so it is rejected up front.
Keep it in step with `questivo/src/lib/exams.ts`.

### What gets rejected

Loudly, with the file and row index:

- answer key pointing at an option that is empty or does not exist
- answer key that is not A–D (or not a number on a numerical question)
- a decimal answer on an `integer` question
- a subject that does not belong to that exam
- an implausible year, an unknown question type, a stub question
- an MCQ with fewer than two options

A question with **no topic** imports but warns. It will show in the PYQ list and
contribute nothing to the pattern.

---

## 3. How the AI paper uses PYQs

The obvious implementation — putting the PYQs in the prompt — costs about
**90,000 input tokens per generation** for JEE Main (≈750 questions × ~120
tokens), on every section of every paper. Against the measured Groq limits
(`compound-mini`: 70,000 TPM, 250 requests/day/key) one mock test would exhaust
the per-minute budget before finishing its first section.

Almost none of those tokens carry information the generator needs. What makes a
paper "JEE-like" is the *distribution*: which topics recur, how often, in what
proportion, with what question types. That is a frequency table.

```
PYQ rows ──(SQL + JS aggregation, 0 tokens)──▶ profile ──(~250 tokens)──▶ prompt
```

Concretely:

- `src/lib/pyqPattern.js` — pure aggregation and prompt text. No I/O, fully tested.
- `src/lib/pyqProfile.js` — the query plus a 10-minute in-memory cache, so a
  six-section JEE paper runs **one** aggregation, not six.
- `questionGenerator.js` — injects a **subject-scoped** brief per section
  (~300 chars) rather than the whole-paper table, and picks that section's
  topics from the PYQ frequency ranking instead of the full syllabus list.

That last point is both a token saving and a quality win: the model stops
sampling uniformly from a syllabus the examiner never samples uniformly from.

Guardrails that are deliberate:

- With fewer than 3 recurring topics for a subject, the syllabus list is used
  instead — three questions is not a pattern.
- When the user picks specific topics for a practice set, the PYQ weighting is
  skipped. They asked for Thermodynamics; a table favouring Mechanics would
  override their own choice.
- No PYQs, or a database error, falls back silently to the static exam pattern.
  Generation never fails because of this feature.

Other token savings:

- **Solutions are generated once and cached on the row.** A popular question is
  explained once for every reader it ever has, not once per view. Measured:
  2.8 s first call, 0.31 s cached.
- **A `sessionType: "pyq"` test costs zero tokens** — it is assembled from
  stored rows.

---

## 4. API

| method | route | notes |
|---|---|---|
| `GET` | `/api/pyq/coverage` | exams and per-year counts; lists supported exams at 0 too |
| `GET` | `/api/pyq?examCode=&year=&subject=&page=` | paged list; solution bodies excluded |
| `GET` | `/api/pyq/:id/solution` | cached, else generated. 60/hr per IP |
| `GET` | `/api/pyq/pattern/:examCode` | the derived profile + the prompt brief |
| `POST` | `/api/pyq/course-request` | `{examName, email?, note?}`. 10/hr per IP |
| `GET` | `/api/pyq/course-request` | admin; needs `x-admin-token: $Secret_Token` |

`examCode` accepts a slug (`jee-main`), a database code (`NTA_JEE_MAIN_2025`) or
a display name — all resolve to the same bucket. Unsupported exams return
`404 {canRequest: true}` so the UI can offer the request form.

To read the request queue:

```bash
curl -H "x-admin-token: $Secret_Token" https://questivo.onrender.com/api/pyq/course-request
```

Repeat requests for the same exam increment `votes` rather than creating
duplicate rows, so the queue is ordered by real demand.

---

## 5. Frontend

- `PyqSection` sits directly under the hero on `/mock-test/jee-main`,
  `/mock-test/neet-ug` and `/mock-test/gate-metallurgy`, with **Generate test
  paper by AI** pinned to the top of the block.
- The heading and that button are prerendered into the static HTML, so there is
  no layout shift at the top of the page. Only the question list waits on the
  network.
- `SafeMathRenderer` (katex + react-markdown, 396 kB) stays lazy inside it and
  loads only once a question is on screen.
- With no PYQs stored, the block shows an honest empty state and still offers
  the AI paper.
- `CourseRequestForm` appears on every exam page, on the exam-not-found page
  (pre-filled from the URL), and behind "Can't find your exam?" on
  `/GenerateTestPage`.

---

## 6. Converting and auditing a new dataset

Two tools sit in front of the importer. Both are plain Node — no Python.

**`scripts/convertDataset.mjs`** maps a third-party file onto the import format.
Public datasets each invent their own column names, so it detects them, prints
the mapping it inferred, and writes nothing until you pass `--write`. It handles
CSV/TSV/JSON/JSONL, options as four columns or one array, and answer keys given
as a letter, a 0- or 1-based index, or the option's text.

`--tag-topics` fills in missing topics by keyword-matching the question against
the official syllabus units (`src/lib/topicTagger.js`). Zero tokens, and it
declines to guess below a confidence floor — a wrong topic silently skews every
generated paper afterwards, so a blank is better. On the PhysicsWallah set it
classified 241 of 469; the rest are left blank.

**`scripts/verifyPyq.mjs`** audits before you publish:

```bash
node scripts/verifyPyq.mjs --file data/pyq/x.json --sample 20
node scripts/verifyPyq.mjs --exam JEE_MAIN --structural-only   # free
```

1. **Structural checks** over the whole batch, no model: unbalanced LaTeX,
   duplicate options, keys pointing at empty options, broken encoding, missing
   topics.
2. **Independent re-solve** of a sample: each question is solved from scratch
   and compared to the dataset's stated key.

Step 2 matters because a dataset's answer key is an assertion, not a fact, and a
wrong key is worse than a missing question — the candidate marks their correct
working wrong. Exits non-zero below `--threshold` (default 80%) so it can gate an
import.

Validated against a fixture with two deliberately mis-keyed rows: it flagged
exactly those two and nothing else.

> One caution on reading the report. The structural pass deliberately does *not*
> flag questions that merely lack end punctuation — plenty of real ones stop at
> "…is equal to". An earlier version did, and flagged 90 intact questions,
> burying the real defects. Truncation is judged from unbalanced `$` and braces.

## 7. Tests

```bash
node src/test/pyq.test.mjs
```

70+ checks over exam resolution, pattern derivation, prompt size, topic
selection, import validation, hashing and the text parser. No database or
network required.

The size assertions are load-bearing: they fail if someone later "improves" the
feature by inlining questions into the prompt and 100×-ing the cost of every
generation.
