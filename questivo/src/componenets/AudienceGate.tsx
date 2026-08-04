import React, { useEffect, useRef, useState } from "react";
import { ChevronRight, GraduationCap, Landmark, Briefcase, Check } from "lucide-react";
import { useAudience } from "./AudienceProvider";
import { examsForAudience, getAudience, type Audience, type AudienceId } from "../lib/audience";

/**
 * The question asked once, on the first visit: who are you?
 *
 * Two steps. The first picks a track and is the only one that matters. The
 * second offers to point the whole site at a single exam, and is skippable —
 * a visitor who is not sure yet keeps the full track, which is the safer
 * default of the two.
 *
 * Native <dialog>, matching CourseRequestModal: focus trapping, Escape and top
 * layer come from the browser rather than from hand-written z-index. Escape is
 * routed through React state for the reason documented there — letting the
 * platform close the dialog behind React's back leaves the two out of sync and
 * the page scroll-locked.
 */

const ICONS: Record<AudienceId, React.ComponentType<{ className?: string }>> = {
  "jee-neet": GraduationCap,
  government: Landmark,
  college: Briefcase,
};

/** Plain-language summary of what a track turns off, so the choice is informed. */
function trackSummary(a: Audience): string {
  const on: string[] = ["mock tests", "previous year questions"];
  if (a.features.resumeAts) on.push("ATS resume checker");
  if (a.features.aiInterview) on.push("AI interview studio");
  return on.join(", ");
}

const AudienceGate: React.FC = () => {
  const { needsChoice, options, setTrack, dismissChoice } = useAudience();
  const ref = useRef<HTMLDialogElement>(null);
  const [picked, setPicked] = useState<AudienceId | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (needsChoice && !el.open) el.showModal();
    if (!needsChoice && el.open) el.close();
  }, [needsChoice]);

  // Escape and backdrop both mean "don't narrow anything" rather than "ask me
  // again on every page", which would be the more annoying reading.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cancel = (e: Event) => {
      e.preventDefault();
      dismissChoice();
    };
    el.addEventListener("cancel", cancel);
    return () => el.removeEventListener("cancel", cancel);
  }, [dismissChoice]);

  useEffect(() => {
    if (!needsChoice) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [needsChoice]);

  if (!needsChoice) return null;

  const pickedAudience = getAudience(picked);
  const focusOptions = pickedAudience ? examsForAudience(pickedAudience) : [];

  return (
    <dialog ref={ref} className="modal" aria-labelledby="track-title">
      <div className="border-b px-6 py-5" style={{ borderColor: "var(--c-border)" }}>
        <h2 id="track-title" className="text-lg font-bold" style={{ color: "var(--c-heading)" }}>
          {pickedAudience ? "Which exam are you preparing for?" : "What are you preparing for?"}
        </h2>
        <p className="mt-1 text-sm muted">
          {pickedAudience
            ? "Pick one to lead with, or keep the whole track. You can change this any time."
            : "We'll show you the exams and tools for your track, and hide the rest."}
        </p>
      </div>

      <div className="p-6">
        {!pickedAudience ? (
          <>
            <div className="grid gap-3">
              {options.map((a) => {
                const Icon = ICONS[a.id];
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setPicked(a.id)}
                    className="card card-hover group flex items-start gap-4 p-4 text-left"
                  >
                    <span className="mt-0.5 shrink-0 rounded-lg bg-indigo-50 p-2 text-indigo-600">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold group-hover:text-indigo-600">
                        {a.label}
                      </span>
                      <span className="mt-0.5 block text-sm muted">{a.tagline}</span>
                      <span className="mt-2 block text-xs muted">
                        You'll see: {trackSummary(a)}.
                      </span>
                    </span>
                    <ChevronRight className="mt-1 h-5 w-5 shrink-0 muted" />
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={dismissChoice}
              className="mt-5 text-sm font-medium underline muted"
            >
              Skip — show me everything
            </button>
          </>
        ) : (
          <>
            <div className="grid gap-2">
              {focusOptions.map((exam) => (
                <button
                  key={exam.slug}
                  type="button"
                  onClick={() => setTrack(pickedAudience.id, exam.slug)}
                  className="card card-hover group flex items-center justify-between gap-3 p-4 text-left"
                >
                  <span>
                    <span className="block font-semibold group-hover:text-indigo-600">
                      {exam.name}
                    </span>
                    <span className="text-sm muted">{exam.category}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 muted" />
                </button>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => setTrack(pickedAudience.id, null)}
                className="btn btn-primary"
              >
                <Check className="h-4 w-4" />
                Keep all {pickedAudience.label.toLowerCase()} exams
              </button>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="text-sm font-medium underline muted"
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
};

export default AudienceGate;
