import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import CourseRequestForm from "./CourseRequestForm";

/**
 * "Request a course" as a modal.
 *
 * Uses the native <dialog> element rather than a div-with-z-index. That gets
 * focus trapping, Escape-to-close, inert background and top-layer stacking from
 * the browser instead of from hand-written code — and top layer is the part
 * that matters here, because it lets the modal escape the sticky header and the
 * overflow-hidden cards it is opened from.
 *
 * It also solves a real bug in the previous inline version on the generate-test
 * page: a <form> nested inside another <form> is invalid HTML, and the browser
 * silently drops the inner one.
 */
interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-fills the exam name, e.g. from a mistyped URL. */
  prefill?: string;
}

const CourseRequestModal: React.FC<Props> = ({ open, onClose, prefill }) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  /**
   * Escape is routed through React state instead of letting the platform close
   * the dialog behind React's back.
   *
   * Verified in the browser: when Escape closed the dialog directly, React
   * still believed it was open. Nothing could recover from that — the state
   * never changed, so the effect above never re-ran, the trigger button was
   * dead and the page stayed scroll-locked for good.
   *
   * preventDefault on `cancel` stops the native close. onClose() then flips the
   * state, and the effect above performs the actual close. React stays the
   * single source of truth, so the two cannot drift apart. The `close` listener
   * is a safety net for any close() we did not initiate.
   *
   * Native listeners rather than React's onCancel/onClose props: these events
   * do not bubble, and the synthetic handlers did not fire for them here.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const closed = () => onClose();
    el.addEventListener("cancel", cancel);
    el.addEventListener("close", closed);
    return () => {
      el.removeEventListener("cancel", cancel);
      el.removeEventListener("close", closed);
    };
  }, [onClose]);

  // The page behind a modal should not scroll away under it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Clicking the backdrop targets the dialog element itself; clicking anything
  // inside targets a descendant. That difference is the whole check.
  const handleClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === ref.current) onClose();
  };

  return (
    <dialog
      ref={ref}
      className="modal"
      onClick={handleClick}
      aria-labelledby="course-request-title"
    >
      <div className="flex items-start justify-between gap-4 border-b px-6 py-5" style={{ borderColor: "var(--c-border)" }}>
        <div>
          <h2 id="course-request-title" className="text-lg font-bold" style={{ color: "var(--c-heading)" }}>
            Request a course
          </h2>
          <p className="mt-1 text-sm muted">
            Tell us which exam you're preparing for and we'll build it.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-2 -mt-1 rounded-md p-2 hover:bg-slate-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="p-6">
        {/* `compact` drops the form's own intro copy, which the header above
            now carries. Remounting on each open clears a previous submission. */}
        {open && <CourseRequestForm prefill={prefill} compact bare onDone={onClose} />}
      </div>
    </dialog>
  );
};

export default CourseRequestModal;
