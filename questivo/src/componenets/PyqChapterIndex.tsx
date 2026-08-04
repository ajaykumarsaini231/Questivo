import React, { useEffect, useState } from "react";
import { Sparkles, ChevronRight, Layers } from "lucide-react";
import { fetchPyqTopics, type PyqSubjectChapters } from "../lib/pyq";

/**
 * Chapter index for one exam's previous year questions.
 *
 * Year is how papers are archived; CHAPTER is how candidates actually revise —
 * they finish Rotational Motion and want every question ever asked on it, not
 * the 2019 paper. The list already filtered by year and sitting, which meant
 * the topic tagging done at import had no way to reach a reader.
 *
 * Counts are the useful part: a chapter that has appeared 42 times is telling
 * you where the marks are. That same frequency table is what weights the
 * generated paper, so the number a candidate reads here and the emphasis the
 * AI applies come from one source.
 */
interface Props {
  examCode: string;
  /** Currently selected chapter, or "" for none. */
  selected: string;
  onSelect: (topic: string, subject: string) => void;
  /** Generate an AI practice set weighted to one chapter. */
  onGenerateChapter?: (topic: string, subject: string) => void;
}

const PyqChapterIndex: React.FC<Props> = ({
  examCode,
  selected,
  onSelect,
  onGenerateChapter,
}) => {
  const [subjects, setSubjects] = useState<PyqSubjectChapters[] | null>(null);
  const [openSubject, setOpenSubject] = useState<string>("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    fetchPyqTopics(examCode, ac.signal)
      .then((data) => {
        setSubjects(data);
        setOpenSubject((s) => s || data[0]?.subject || "");
      })
      .catch(() => setSubjects([]));
    return () => ac.abort();
  }, [examCode]);

  // Nothing tagged yet is a normal state, not an error — say nothing rather
  // than show an empty shelf above the questions.
  if (!subjects?.some((s) => s.chapters.length)) return null;

  const active = subjects.find((s) => s.subject === openSubject) ?? subjects[0];
  const VISIBLE = 12;
  const chapters = showAll ? active.chapters : active.chapters.slice(0, VISIBLE);
  const hidden = active.chapters.length - chapters.length;

  return (
    <section className="mt-8" aria-labelledby="pyq-chapters">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="pyq-chapters" className="flex items-center gap-2 text-lg font-bold">
          <Layers className="h-5 w-5" style={{ color: "var(--c-brand)" }} />
          Practise by chapter
        </h3>
        <p className="text-sm muted">
          Counts are how often each chapter actually appeared.
        </p>
      </div>

      {/* Subject tabs — only when there is more than one to choose between. */}
      {subjects.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {subjects.map((s) => (
            <button
              key={s.subject}
              type="button"
              onClick={() => {
                setOpenSubject(s.subject);
                setShowAll(false);
              }}
              className={
                s.subject === active.subject
                  ? "btn btn-primary btn-sm"
                  : "btn btn-secondary btn-sm"
              }
            >
              {s.subject}
              <span className="ml-1 text-xs opacity-70">{s.total}</span>
            </button>
          ))}
        </div>
      )}

      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {chapters.map((c) => {
          const isOpen = selected === c.topic;
          return (
            <li key={c.topic}>
              <div
                className="card card-hover flex items-center gap-3 p-3"
                style={isOpen ? { borderColor: "var(--c-brand)" } : undefined}
              >
                <button
                  type="button"
                  onClick={() => onSelect(isOpen ? "" : c.topic, active.subject)}
                  aria-pressed={isOpen}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-semibold">{c.topic}</span>
                  <span className="text-xs muted">
                    {c.count} question{c.count === 1 ? "" : "s"}
                  </span>
                </button>

                {onGenerateChapter && (
                  <button
                    type="button"
                    title={`Generate a fresh ${c.topic} set with AI`}
                    aria-label={`Generate a fresh ${c.topic} set with AI`}
                    onClick={() => onGenerateChapter(c.topic, active.subject)}
                    className="shrink-0 rounded-md p-2 hover:bg-slate-100"
                    style={{ color: "var(--c-brand)" }}
                  >
                    <Sparkles className="h-4 w-4" />
                  </button>
                )}
                <ChevronRight
                  className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                  style={{ color: "var(--c-text-muted)" }}
                  aria-hidden="true"
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {hidden > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAll(true)}>
            Show {hidden} more chapter{hidden === 1 ? "" : "s"}
          </button>
        )}
        {showAll && active.chapters.length > VISIBLE && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAll(false)}>
            Show fewer
          </button>
        )}
        {active.untagged > 0 && (
          // Being explicit beats a silent gap: the chapter counts do not add up
          // to the subject total, and a candidate should know why rather than
          // assume questions are missing.
          <p className="text-xs muted">
            {active.untagged} more {active.subject} question
            {active.untagged === 1 ? "" : "s"} are not sorted into a chapter yet — they
            still appear in the full list below.
          </p>
        )}
      </div>
    </section>
  );
};

export default PyqChapterIndex;
