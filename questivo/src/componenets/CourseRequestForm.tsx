import React, { useState } from "react";
import { Check, Send } from "lucide-react";
import { submitCourseRequest } from "../lib/pyq";

/**
 * "Request a course" — for exams Questivo does not cover yet.
 *
 * Repeat asks for the same exam increment a vote server-side rather than
 * creating duplicate rows, so the backlog is ordered by real demand. That is
 * also why the confirmation reports the vote count back: it tells the visitor
 * their request landed somewhere that is actually counted.
 *
 * Email is optional. Asking for it as a hard requirement on a request form
 * costs more submissions than the address is worth.
 */
interface Props {
  prefill?: string;
  /** Drop the intro paragraph — used when a surrounding header already says it. */
  compact?: boolean;
  /** Drop the card chrome — used inside the modal, which brings its own. */
  bare?: boolean;
  /** Called when the visitor dismisses the confirmation. */
  onDone?: () => void;
}

const CourseRequestForm: React.FC<Props> = ({
  prefill = "",
  compact = false,
  bare = false,
  onDone,
}) => {
  const [examName, setExamName] = useState(prefill);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [result, setResult] = useState<{ examName: string; votes: number } | null>(null);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (examName.trim().length < 2) {
      setError("Please tell us which exam you want.");
      setState("error");
      return;
    }
    setState("sending");
    setError("");
    try {
      const data = await submitCourseRequest({
        examName: examName.trim(),
        email: email.trim() || undefined,
        note: note.trim() || undefined,
      });
      setResult(data);
      setState("done");
    } catch (err: any) {
      setError(err?.message || "Could not send that. Please try again.");
      setState("error");
    }
  };

  const shell = bare ? "" : "card p-6";

  if (state === "done" && result) {
    return (
      <div className={shell} role="status" aria-live="polite">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: "var(--c-brand)" }}
          >
            <Check className="h-4 w-4" />
          </span>
          <div>
            <p className="font-semibold" style={{ color: "var(--c-heading)" }}>
              Request recorded for {result.examName}
            </p>
            <p className="mt-1 text-sm muted">
              {result.votes > 1
                ? `${result.votes} people have asked for this exam. It is near the top of the queue.`
                : "You are the first to ask for this one. We prioritise by how many people request an exam."}
              {email.trim() ? " We'll email you when it goes live." : ""}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setExamName("");
                  setNote("");
                  setState("idle");
                  setResult(null);
                }}
              >
                Request another exam
              </button>
              {onDone && (
                <button type="button" className="btn btn-primary btn-sm" onClick={onDone}>
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={shell}>
      {!compact && (
        <p className="text-sm muted">
          Questivo covers six exams today. Tell us which one you are preparing for and we will
          build it — requests are prioritised by how many people ask for the same exam.
        </p>
      )}

      <div className={compact ? "" : "mt-5"}>
        <label htmlFor="cr-exam" className="block text-sm font-semibold">
          Which exam? <span aria-hidden="true">*</span>
        </label>
        <input
          id="cr-exam"
          required
          value={examName}
          onChange={(e) => setExamName(e.target.value)}
          placeholder="e.g. GATE Computer Science, CAT, NDA, CLAT"
          className="mt-1.5 w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:ring-2"
          style={{ borderColor: "var(--c-border)" }}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cr-email" className="block text-sm font-semibold">
            Email <span className="font-normal muted">(optional)</span>
          </label>
          <input
            id="cr-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="So we can tell you when it's ready"
            className="mt-1.5 w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:ring-2"
            style={{ borderColor: "var(--c-border)" }}
          />
        </div>
        <div>
          <label htmlFor="cr-note" className="block text-sm font-semibold">
            Anything specific? <span className="font-normal muted">(optional)</span>
          </label>
          <input
            id="cr-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Paper, subject or year you need"
            className="mt-1.5 w-full rounded-md border px-3 py-2.5 text-sm outline-none focus:ring-2"
            style={{ borderColor: "var(--c-border)" }}
          />
        </div>
      </div>

      {state === "error" && error && (
        <p className="mt-3 text-sm" role="alert" style={{ color: "#b42318" }}>
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary mt-5" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Request this course"}
        <Send className="h-4 w-4" />
      </button>
    </form>
  );
};

export default CourseRequestForm;
