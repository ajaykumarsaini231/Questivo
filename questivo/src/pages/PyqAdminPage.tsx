/**
 * The PYQ question bank, as a worklist.
 *
 * Every other screen that reads these questions reads them for a candidate and
 * therefore hides the broken ones — a question with no answer key cannot be
 * scored and a question whose text did not survive extraction cannot be read,
 * so both are filtered out of the browse list, the paper player and the
 * generator alike. That makes them invisible everywhere, which is why they have
 * stayed broken. This screen shows exactly those rows and lets them be fixed.
 *
 * The drawer is a ROUTE (/admin/pyq/:id), not a piece of state. An editor
 * working a queue of hundreds needs to send someone a link to the row they are
 * arguing about, and needs Back to close the drawer rather than leave the
 * screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, ChevronLeft, ChevronRight, Crop, HelpCircle, Image as ImageIcon,
  Layers, Loader2, RotateCcw, Save, Search, SlidersHorizontal, X,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, handleApiError } from "../lib/api";
import SafeMathRenderer from "../componenets/SafeMathRenderer";
import PyqFigure from "../componenets/PyqFigure";
import FigureCropper from "../componenets/FigureCropper";
// The player's own rules for how a question is drawn — which of its two forms
// wins, and how much of each crop is shown. Imported rather than restated: this
// screen's whole claim is that it shows what the candidate will see, and a
// second copy of those decisions would eventually disagree.
import {
  renderMode,
  cropOf,
  hasCrops,
  IMAGE_FIELDS as CROPPABLE_FIELDS,
  PLAYER_QUESTION_WIDTH,
  type CropWindow,
  type ImageCrops,
  type PyqImageField,
} from "../lib/pyqPapers";

/* --------------------------------- types -------------------------------- */

type Row = {
  id: string;
  examCode: string;
  year: number;
  session: string | null;
  sessionLabel: string | null;
  dateLabel: string | null;
  shiftLabel: string | null;
  subject: string;
  topic: string | null;
  chapter: string | null;
  section: string | null;
  questionNumber: number | null;
  paperQuestionNumber: number | null;
  paperId: string | null;
  questionText: string;
  questionType: string;
  correctAnswer: string | null;
  status: string;
  needsFigure: boolean;
  questionImage: string | null;
  renderAs: "image" | "text" | null;
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  optionAImage: string | null;
  optionBImage: string | null;
  optionCImage: string | null;
  optionDImage: string | null;
  /** How much of each of those is drawn. Null means all of it. */
  imageCrops: ImageCrops | null;
};

/** Everything the drawer edits, plus the context it shows above the form. */
type FullRow = Row & {
  solutionImage: string | null;
  figureHint: string | null;
  sourceUrl: string | null;
  marksCorrect: number;
  marksIncorrect: number;
};

type Facet = { value: string | number; count: number; label?: string };
type Facets = {
  exams: Facet[];
  years: Facet[];
  sessions: Facet[];
  subjects: Facet[];
  chapters: Facet[];
};

const QUESTION_TYPES = ["mcq_single", "mcq_multiple", "numerical", "integer"];
const STATUSES = ["ok", "needs_figure", "bonus", "needs_review"];

/** Every field the drawer can write, in the order the form lays them out. */
const IMAGE_FIELDS = [
  ["questionImage", "Question"],
  ["optionAImage", "Option A"],
  ["optionBImage", "Option B"],
  ["optionCImage", "Option C"],
  ["optionDImage", "Option D"],
  ["solutionImage", "Solution"],
] as const;

/* ------------------------------- the table ------------------------------ */

export const PyqAdminPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  // The filter selection lives in the URL, so a queue is a link. Nothing else
  // in this admin is deep-linkable and every triage conversation starts with
  // "which rows are you looking at".
  const [params, setParams] = useSearchParams();

  const [rows, setRows] = useState<Row[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [counts, setCounts] = useState({ all: 0, needsFigure: 0, missingAnswer: 0, priority: 0 });
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const view = params.get("view") || "priority";
  const page = Number(params.get("page")) || 1;
  const search = params.get("q") || "";

  /** One place that writes the query string, so a filter change always resets
   *  the page — landing on page 9 of a 2-page result reads as "no rows". */
  const setFilter = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (!("page" in patch)) next.delete("page");
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  /**
   * What is actually asked for, which is not quite what the URL says.
   *
   * The screen opens on the work queue rather than on 9,000 rows, but the API
   * defaults a bare GET to everything — a list endpoint that silently returns a
   * filtered subset is a trap for its next caller. So the default lives here,
   * and is sent explicitly, while the URL stays clean: /admin/pyq means the
   * queue, and only a deliberate choice puts `view` in the address bar.
   *
   * Sending the URL verbatim instead showed "Needs attention" selected while
   * the table listed every question in the archive.
   */
  const query = useMemo(() => {
    const next = new URLSearchParams(params);
    if (!next.get("view")) next.set("view", "priority");
    return next.toString();
  }, [params]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [list, facetRes] = await Promise.all([
          api.get(`/pyq?${query}`),
          api.get(`/pyq/facets?${query}`),
        ]);
        if (cancelled) return;
        setRows(list.data.data);
        setTotal(list.data.meta.total);
        setPages(list.data.meta.pages);
        setCounts(list.data.counts);
        setFacets(facetRes.data.data);
      } catch (err) {
        if (!cancelled) toast.error(handleApiError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [query]);

  /** Re-fetch after a save, so an edited row leaves the queue it was fixed in. */
  const [savedAt, setSavedAt] = useState(0);
  useEffect(() => {
    if (!savedAt) return;
    api
      .get(`/pyq?${query}`)
      .then((res) => {
        setRows(res.data.data);
        setTotal(res.data.meta.total);
        setPages(res.data.meta.pages);
        setCounts(res.data.counts);
      })
      .catch(() => {});
  }, [savedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const views = [
    { key: "priority", label: "Needs attention", count: counts.priority },
    { key: "needsFigure", label: "No readable text", count: counts.needsFigure },
    { key: "missingAnswer", label: "No answer key", count: counts.missingAnswer },
    { key: "all", label: "All questions", count: counts.all },
  ];

  /** The address-bar filters — not `query` — so opening a row does not stamp
   *  the default view into the URL of every link an editor shares. */
  const urlQuery = params.toString();
  const qs = urlQuery ? `?${urlQuery}` : "";

  return (
    <div className="space-y-6">
      {/* SafeMathRenderer wraps its output in Tailwind's `prose`, which sets a
          paragraph margin sized for an article. Inside a table cell and an
          option chip that margin is most of the row, so it is removed for these
          previews only — the renderer itself is shared with the player and must
          keep its article spacing there. */}
      <style>{`
        .pyq-preview .math-renderer-context > :first-child { margin-top: 0; }
        .pyq-preview .math-renderer-context > :last-child { margin-bottom: 0; }
        .pyq-preview p { margin: 0; }
        .pyq-preview .katex { font-size: 1em; }
      `}</style>

      <div>
        <h2 className="text-3xl font-bold text-slate-800">Question bank</h2>
        <p className="text-gray-500 mt-1">
          Previous year questions, including the ones no candidate-facing screen can show.
        </p>
      </div>

      {/* The queues. These are the reason the screen exists, so they sit above
          the filters rather than inside them. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {views.map((v) => {
          const active = view === v.key;
          return (
            <button
              key={v.key}
              onClick={() => setFilter({ view: v.key === "priority" ? null : v.key })}
              className={`text-left rounded-xl border p-4 transition-colors ${
                active
                  ? "bg-indigo-50 border-indigo-200 ring-1 ring-indigo-100"
                  : "bg-white border-gray-100 hover:border-indigo-200"
              }`}
            >
              <div className={`text-2xl font-bold ${active ? "text-indigo-700" : "text-slate-800"}`}>
                {v.count.toLocaleString()}
              </div>
              <div className="text-sm text-slate-500 mt-0.5">{v.label}</div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 mb-3">
          <SlidersHorizontal size={16} /> Filters
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Select
            label="Exam"
            value={params.get("examCode") || ""}
            options={(facets?.exams || []).map((e) => ({
              value: String(e.value),
              label: `${e.label || e.value} (${e.count})`,
            }))}
            onChange={(v) => setFilter({ examCode: v })}
          />
          <Select
            label="Year"
            value={params.get("year") || ""}
            options={(facets?.years || []).map((y) => ({
              value: String(y.value),
              label: `${y.value} (${y.count})`,
            }))}
            onChange={(v) => setFilter({ year: v })}
          />
          <Select
            label="Session"
            value={params.get("session") || ""}
            options={(facets?.sessions || []).map((s) => ({
              value: String(s.value),
              label: `${s.value} (${s.count})`,
            }))}
            onChange={(v) => setFilter({ session: v })}
          />
          <Select
            label="Subject"
            value={params.get("subject") || ""}
            options={(facets?.subjects || []).map((s) => ({
              value: String(s.value),
              label: `${s.value} (${s.count})`,
            }))}
            onChange={(v) => setFilter({ subject: v })}
          />
          <Select
            label="Chapter"
            value={params.get("chapter") || ""}
            options={(facets?.chapters || []).map((c) => ({
              value: String(c.value),
              label: `${c.value} (${c.count})`,
            }))}
            onChange={(v) => setFilter({ chapter: v })}
          />
          <Select
            label="Figure"
            value={params.get("hasImage") || ""}
            options={[
              { value: "no", label: "No crop stored" },
              { value: "yes", label: "Crop stored" },
            ]}
            onChange={(v) => setFilter({ hasImage: v })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-3">
          <SearchBox value={search} onChange={(v) => setFilter({ q: v })} />
          {Array.from(params.keys()).some((k) => k !== "view" && k !== "page") && (
            <button
              onClick={() => setParams(view === "priority" ? {} : { view }, { replace: true })}
              className="text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1.5"
            >
              <RotateCcw size={14} /> Clear filters
            </button>
          )}
          <span className="text-sm text-slate-400 ml-auto">
            {loading ? "Loading…" : `${total.toLocaleString()} question${total === 1 ? "" : "s"}`}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[900px]">
            <thead className="bg-slate-50 border-b border-gray-100 text-gray-500 text-xs uppercase font-semibold">
              <tr>
                <th className="px-6 py-4">Question</th>
                <th className="px-6 py-4 w-52">Paper</th>
                <th className="px-6 py-4 w-40">Subject</th>
                <th className="px-6 py-4 w-32">Answer</th>
                <th className="px-6 py-4 w-44">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    Loading questions…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                    {view === "all"
                      ? "No questions match these filters."
                      : "Nothing in this queue — every question here is readable and keyed."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => navigate(`/admin/pyq/${row.id}${qs}`)}
                    className={`cursor-pointer transition-colors ${
                      row.id === id ? "bg-indigo-50/60" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="px-6 py-4">
                      <QuestionPreview q={row} />
                      <div className="text-xs text-slate-400 mt-1.5">
                        {row.questionType}
                        {row.paperQuestionNumber ? ` · Q${row.paperQuestionNumber}` : ""}
                        {" · draws as "}
                        <span className="font-medium text-slate-500">
                          {renderMode(row)}
                          {row.renderAs ? " (pinned)" : ""}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      <div className="font-medium">
                        {row.examCode} {row.year}
                      </div>
                      <div className="text-xs text-slate-400">
                        {[row.session || row.sessionLabel, row.shiftLabel]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      <div>{row.subject}</div>
                      <div className="text-xs text-slate-400 truncate max-w-[10rem]">
                        {row.chapter || row.topic || "Untagged"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {row.correctAnswer ? (
                        <span className="font-mono text-sm text-slate-700">{row.correctAnswer}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded-full">
                          <HelpCircle size={12} /> None
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {row.needsFigure && (
                          <Pill tone={row.questionImage ? "amber" : "red"}>
                            <AlertTriangle size={11} />
                            {row.questionImage ? "figure" : "no figure"}
                          </Pill>
                        )}
                        {row.questionImage && (
                          <Pill tone="slate">
                            <ImageIcon size={11} /> crop
                          </Pill>
                        )}
                        {hasCrops(row) && (
                          <Pill tone="slate">
                            <Crop size={11} /> cropped
                          </Pill>
                        )}
                        {row.status !== "ok" && <Pill tone="slate">{row.status}</Pill>}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50">
          <button
            disabled={page <= 1}
            onClick={() => setFilter({ page: String(page - 1) })}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white text-gray-600 text-sm disabled:opacity-50 hover:text-indigo-600"
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <span className="text-sm font-medium text-gray-600">
            Page {page} of {pages || 1}
          </span>
          <button
            disabled={page >= pages}
            onClick={() => setFilter({ page: String(page + 1) })}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white text-gray-600 text-sm disabled:opacity-50 hover:text-indigo-600"
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {id && (
        <EditDrawer
          id={id}
          onClose={() => navigate(`/admin/pyq${qs}`)}
          onSaved={() => setSavedAt(Date.now())}
        />
      )}
    </div>
  );
};

/* ------------------------------ the preview ----------------------------- */

/**
 * One question drawn the way the candidate will see it.
 *
 * The table used to print `questionText` verbatim, which for this archive means
 * `$s F(s)=_{22} (s- a)$` — and a screen whose job is deciding whether a
 * question is intact cannot be showing markup instead of the question. Worse,
 * the raw text is not even what the paper renders: where a crop exists the
 * player draws the crop and never the text at all, so a row could read as
 * mangled here while being perfect in the paper, and the reverse.
 *
 * So this resolves the same way the player does, through the shared
 * `renderMode`, and renders whichever form wins.
 */
function QuestionPreview({ q, compact = true }: { q: Row; compact?: boolean }) {
  const mode = renderMode(q);
  const stem = q.questionText?.trim();
  // Clamped by height rather than by line count: `line-clamp` needs the text to
  // be the element's own, and this text sits inside the renderer's block
  // children, so it would not clamp at all.
  const clamp = compact ? "max-h-[4.5rem] overflow-hidden" : "";

  return (
    <div className={compact ? "max-w-xl" : ""}>
      {mode === "image" && q.questionImage ? (
        // Height as a prop rather than as a `max-h-*` class: a cropped figure
        // is drawn in a box with a fixed ratio, and clamping that box's height
        // in CSS leaves its width alone and stretches the crop.
        <PyqFigure
          src={q.questionImage}
          crop={cropOf(q, "questionImage")}
          alt="Question as printed"
          loading="lazy"
          maxHeight={compact ? 96 : 288}
          className={`rounded border border-slate-200 bg-white ${compact ? "" : "mx-auto"}`}
        />
      ) : stem ? (
        <div className={`text-sm text-slate-700 pyq-preview ${clamp}`}>
          <SafeMathRenderer text={stem} />
        </div>
      ) : (
        <span className="text-sm italic text-slate-400">No text extracted</span>
      )}

      {/* The choices, drawn the same way. A stem alone cannot tell you whether
          the question is answerable — a mangled option is just as broken, and
          it is the more common defect in this archive. */}
      <OptionStrip q={q} compact={compact} />
    </div>
  );
}

function OptionStrip({ q, compact }: { q: Row; compact: boolean }) {
  const mode = renderMode(q);
  const letters = ["A", "B", "C", "D"] as const;
  const shown = letters
    .map((letter) => {
      const text = (q as any)[`option${letter}`] as string | null;
      const crop = (q as any)[`option${letter}Image`] as string | null;
      // Same fallback the player applies: honour the setting only where the
      // chosen form exists.
      const image = mode === "text" && text?.trim() ? null : crop;
      return { letter, text, image };
    })
    .filter((o) => o.text?.trim() || o.image);

  if (!shown.length) return null;

  return (
    <div className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 ${compact ? "" : "flex-col"}`}>
      {shown.map((o) => (
        <div key={o.letter} className="flex items-start gap-1.5 text-xs text-slate-600 min-w-0">
          <span className="font-semibold text-slate-400 shrink-0">({o.letter})</span>
          {o.image ? (
            <PyqFigure
              src={o.image}
              crop={cropOf(q, `option${o.letter}Image`)}
              alt={`Option ${o.letter}`}
              loading="lazy"
              maxHeight={compact ? 32 : 80}
            />
          ) : (
            <span className={`pyq-preview min-w-0 ${compact ? "truncate max-w-[12rem]" : ""}`}>
              <SafeMathRenderer text={o.text as string} />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- the drawer ------------------------------ */

function EditDrawer({
  id,
  onClose,
  onSaved,
}: {
  id: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [question, setQuestion] = useState<FullRow | null>(null);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** Which part's crop dialog is open, if any. */
  const [cropping, setCropping] = useState<PyqImageField | null>(null);
  /** Preview at the player's width rather than the drawer's — see the toggle. */
  const [wide, setWide] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDraft({});
    api
      .get(`/pyq/${id}`)
      .then((res) => {
        if (cancelled) return;
        setQuestion(res.data.data);
      })
      .catch((err) => {
        if (!cancelled) toast.error(handleApiError(err));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Esc closes, which is the one keyboard habit every drawer owes its user —
  // but only the topmost thing. Both this and the cropper listen on window, so
  // without the guard one Escape would dismiss the crop dialog and the drawer
  // under it together.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !cropping) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, cropping]);

  /** Only what actually changed is sent — the endpoint is a PATCH because two
   *  editors working different fields of the same row must not clobber each
   *  other, and because an import may have rewritten the rest since load. */
  const changed = useMemo(() => {
    if (!question) return {};
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(draft)) {
      // imageCrops is the one field that is not a scalar. Identity comparison
      // would call it changed the moment the cropper is opened and cancelled,
      // and `?? ""` below would compare null against "" and disagree with
      // itself, so it is compared by value.
      if (key === "imageCrops") {
        if (!sameCrops(value, question.imageCrops)) out[key] = value;
        continue;
      }
      const before = (question as any)[key] ?? (typeof value === "boolean" ? false : "");
      if (value !== before) out[key] = value;
    }
    return out;
  }, [draft, question]);

  const dirty = Object.keys(changed).length > 0;

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      // Sent as typed. "" is how a text box says "clear this", and the server
      // turns it into null for every nullable column — an empty optionC has to
      // become a question with three choices, not one with a blank fourth.
      const res = await api.patch(`/pyq/${id}`, changed);
      setQuestion(res.data.data);
      setDraft({});
      toast.success(`Saved ${res.data.meta.updated.length} field(s)`);
      onSaved();
    } catch (err) {
      toast.error(handleApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof FullRow) =>
    draft[key] !== undefined ? draft[key] : ((question?.[key] as any) ?? "");
  const set = (key: string, value: any) => setDraft((d) => ({ ...d, [key]: value }));

  /** The row as it would be if saved now, which is what the preview draws. */
  const preview = { ...(question as FullRow), ...draft } as Row;

  /** The crop windows as they stand in the form, saved or not. */
  const crops: ImageCrops | null =
    (draft.imageCrops !== undefined ? draft.imageCrops : question?.imageCrops) ?? null;

  /**
   * Write one part's window into the set.
   *
   * A window is dropped from the object rather than stored as null, and the
   * whole object becomes null once the last one goes, so "no crops" is one
   * state on the row and not two.
   */
  const setCrop = (part: PyqImageField, win: CropWindow | null) => {
    const next: ImageCrops = { ...(crops ?? {}) };
    if (win) next[part] = win;
    else delete next[part];
    set("imageCrops", Object.keys(next).length ? next : null);
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-white shadow-2xl flex flex-col">
        <header className="px-6 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h3 className="font-bold text-slate-800">Edit question</h3>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">{id}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:bg-slate-50 rounded-full"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading || !question ? (
            <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-full">
                  <Layers size={12} /> {question.examCode} {question.year}
                </span>
                <span className="bg-slate-100 px-2.5 py-1 rounded-full">{question.subject}</span>
                {question.chapter && (
                  <span className="bg-slate-100 px-2.5 py-1 rounded-full">{question.chapter}</span>
                )}
                {question.sourceUrl && (
                  <a
                    href={question.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 hover:underline"
                  >
                    source
                  </a>
                )}
              </div>

              {/* The question as the candidate will actually get it, built from
                  what is in the form rather than from what is stored — so
                  fixing a mangled option shows the fix before it is saved.
                  This is the only thing on the screen that answers the question
                  an editor is actually asking. */}
              <figure className="rounded-lg border border-gray-100 bg-slate-50 p-3">
                <figcaption className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
                  <span>As the candidate sees it · drawn as {renderMode(preview)}</span>
                  {/* The drawer is ~600px and the player's question column is
                      1012. A crop that fits here and overflows there is exactly
                      what this panel is for, so it can be shown at the width it
                      will actually be given. */}
                  <button
                    onClick={() => setWide((w) => !w)}
                    className="shrink-0 rounded-full border border-gray-200 bg-white px-2 py-0.5 font-medium normal-case tracking-normal text-slate-500 hover:border-indigo-200 hover:text-indigo-600"
                  >
                    {wide ? `at ${PLAYER_QUESTION_WIDTH}px — the player` : "at this drawer's width"}
                  </button>
                </figcaption>
                <div className={wide ? "overflow-x-auto" : undefined}>
                  <div style={wide ? { width: PLAYER_QUESTION_WIDTH } : undefined}>
                    <QuestionPreview q={preview} compact={false} />
                  </div>
                </div>
              </figure>

              <Labelled label="Question text">
                <textarea
                  value={field("questionText") as string}
                  onChange={(e) => set("questionText", e.target.value)}
                  rows={5}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 outline-none"
                />
                {(field("questionText") as string)?.trim() && (
                  <div className="mt-2 rounded-lg bg-slate-50 border border-gray-100 px-3 py-2 text-sm">
                    <SafeMathRenderer text={field("questionText") as string} />
                  </div>
                )}
              </Labelled>

              <div className="grid grid-cols-2 gap-3">
                {(["optionA", "optionB", "optionC", "optionD"] as const).map((key) => {
                  const value = field(key) as string;
                  return (
                    <Labelled key={key} label={`Option ${key.slice(-1)}`}>
                      <textarea
                        value={value}
                        onChange={(e) => set(key, e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 outline-none"
                      />
                      {/* Rendered under the box it is typed in, because these
                          are where the archive's mangling actually shows —
                          "$s F(s)=_{22} (s- a)$" only looks wrong once it is
                          set. */}
                      {value?.trim() && (
                        <div className="mt-1 rounded bg-slate-50 border border-gray-100 px-2 py-1 text-xs pyq-preview">
                          <SafeMathRenderer text={value} />
                        </div>
                      )}
                    </Labelled>
                  );
                })}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Labelled label="Correct answer">
                  <input
                    value={field("correctAnswer") as string}
                    onChange={(e) => set("correctAnswer", e.target.value)}
                    placeholder="A, or A,C, or 4.5"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 outline-none"
                  />
                </Labelled>
                <Labelled label="Type">
                  <select
                    value={field("questionType") as string}
                    onChange={(e) => set("questionType", e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:border-indigo-400 outline-none"
                  >
                    {QUESTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Labelled>
                <Labelled label="Status">
                  <select
                    value={field("status") as string}
                    onChange={(e) => set("status", e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:border-indigo-400 outline-none"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Labelled>
              </div>

              {/* Which of the question's two forms a candidate is given.
                  Separate from the paths below: those say whether a crop
                  EXISTS, this says whether it is the one that gets drawn — so a
                  figure cut off the wrong part of the page is fixed by showing
                  the text, without throwing away the path to the crop. */}
              <Labelled label="Show at test time">
                <select
                  value={(field("renderAs") as string) || ""}
                  onChange={(e) => set("renderAs", e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:border-indigo-400 outline-none"
                >
                  <option value="">
                    Default — the crop when there is one, otherwise the text
                  </option>
                  <option value="image">Always the crop image</option>
                  <option value="text">Always the text</option>
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  {renderAsNote(preview)}
                </p>
              </Labelled>

              {/* Clearing this is the last step of a figure fix: the flag is
                  what keeps the row out of every generated paper, so a question
                  whose crop is now linked stays unusable until it is cleared. */}
              <label className="flex items-start gap-3 rounded-lg border border-gray-100 bg-slate-50 px-3 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(
                    draft.needsFigure !== undefined ? draft.needsFigure : question.needsFigure
                  )}
                  onChange={(e) => set("needsFigure", e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  <span className="font-medium text-slate-700">Text cannot be read on its own</span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    While this is ticked the question is shown as its crop and is kept out of every
                    generated paper. Untick it once the text above is complete.
                  </span>
                </span>
              </label>

              <div>
                <div className="text-sm font-semibold text-slate-600 mb-2">Figures</div>
                <p className="text-xs text-slate-400 mb-3">
                  Paths into the figure CDN. Editing one re-points the question at an existing
                  crop — publishing a new image is a commit to the pyq-figures repo, not a save
                  here. Crop narrows how much of the file is drawn, without changing it, and is
                  undone by clearing the window.
                </p>
                <div className="space-y-2">
                  {IMAGE_FIELDS.map(([key, label]) => {
                    const path = field(key as keyof FullRow) as string;
                    const win = cropOf({ imageCrops: crops }, key as PyqImageField);
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 w-20 shrink-0">{label}</span>
                        <input
                          value={path}
                          onChange={(e) => set(key, e.target.value)}
                          placeholder="https://cdn.jsdelivr.net/gh/…"
                          className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-mono focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 outline-none"
                        />
                        {win && (
                          <button
                            onClick={() => setCrop(key as PyqImageField, null)}
                            className="shrink-0 inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
                            title="Draw the whole file again"
                          >
                            {Math.round(100 - win.top - win.bottom)}% tall
                            <X size={10} />
                          </button>
                        )}
                        <button
                          onClick={() => setCropping(key as PyqImageField)}
                          disabled={!path}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-slate-400"
                          title={path ? "Crop" : "No image on this part yet"}
                        >
                          <Crop size={14} />
                        </button>
                        {path && (
                          <a
                            href={path}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 text-slate-400 hover:text-indigo-600"
                            title="Open"
                          >
                            <ImageIcon size={14} />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {question.figureHint && (
                <div className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <span className="font-medium">Figure hint:</span> {question.figureHint}
                </div>
              )}
            </>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-slate-50">
          <span className="text-xs text-slate-500">
            {dirty
              ? `${Object.keys(changed).length} unsaved change${
                  Object.keys(changed).length === 1 ? "" : "s"
                }`
              : "No changes"}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm text-slate-600 hover:bg-gray-50"
            >
              Close
            </button>
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save
            </button>
          </div>
        </footer>
      </aside>

      {/* Applied to the draft, not saved. The crop shows up in the preview
          above immediately and reaches the row through the same Save as every
          other field, so an editor can back out of it with Close. */}
      {cropping && (field(cropping as keyof FullRow) as string) && (
        <FigureCropper
          src={field(cropping as keyof FullRow) as string}
          label={(IMAGE_FIELDS.find(([k]) => k === cropping)?.[1] ?? cropping).toLowerCase()}
          value={cropOf({ imageCrops: crops }, cropping)}
          onApply={(win) => {
            setCrop(cropping, win);
            setCropping(null);
          }}
          onClose={() => setCropping(null)}
        />
      )}
    </>
  );
}

/**
 * Do two sets of crop windows say the same thing?
 *
 * Compared field by field in a fixed order rather than by stringifying both:
 * the server builds its JSON in one key order and the cropper builds its in
 * another, so two identical sets can serialise differently and every save
 * would report a change nobody made.
 */
function sameCrops(a: ImageCrops | null | undefined, b: ImageCrops | null | undefined) {
  return CROPPABLE_FIELDS.every((field) => {
    const x = cropOf({ imageCrops: a ?? null }, field);
    const y = cropOf({ imageCrops: b ?? null }, field);
    if (!x || !y) return x === y || (!x && !y);
    return x.top === y.top && x.right === y.right && x.bottom === y.bottom && x.left === y.left;
  });
}

/* -------------------------------- controls ------------------------------- */

/**
 * What the render setting will actually do to THIS row, including when it
 * cannot be honoured.
 *
 * A control that silently does nothing is worse than no control: pinning a
 * figure-only question to "text" would draw an empty question, so the player
 * falls back to the form that exists — and an editor who is not told that will
 * think the setting took and move on.
 */
function renderAsNote(q: Row) {
  if (q.renderAs === "text" && !q.questionText?.trim()) {
    return "There is no extracted text for this question, so its crop is still shown.";
  }
  if (q.renderAs === "image" && !q.questionImage) {
    return "No crop is stored for this question, so its text is still shown.";
  }
  return renderMode(q) === "image"
    ? "Drawn as the crop image. The text below is not shown to the candidate."
    : "Drawn as text. Any crop stored below is not shown to the candidate.";
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:border-indigo-400 outline-none"
      >
        <option value="">Any</option>
        {/* A chosen value that the facets no longer offer — because another
            filter narrowed it away — is still listed, or the select would
            silently show "Any" while the query is still filtering by it. */}
        {value && !options.some((o) => o.value === value) && (
          <option value={value}>{value}</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Debounced, so typing does not fire a query per keystroke. */
function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setText(value), [value]);

  const update = (v: string) => {
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(v), 350);
  };

  return (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={text}
        onChange={(e) => update(e.target.value)}
        placeholder="Search question text…"
        className="w-72 rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 outline-none"
      />
    </div>
  );
}

function Pill({ tone, children }: { tone: "amber" | "red" | "slate"; children: ReactNode }) {
  const tones = {
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    red: "bg-red-50 text-red-600 border-red-100",
    slate: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export default PyqAdminPage;
