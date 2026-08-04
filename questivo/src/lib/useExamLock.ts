/**
 * Keep a running paper in fullscreen, and count the times the candidate leaves.
 *
 * WHAT COUNTS AS LEAVING
 *
 * Three separate signals, because no single one catches every way out:
 *   - `fullscreenchange` — Escape, or F11.
 *   - `visibilitychange` — switching tab, or minimising.
 *   - `blur` on the window — switching application, or a second monitor.
 *
 * They overlap. Alt-tabbing away fires blur AND visibilitychange, and on some
 * browsers drops fullscreen as well, so a naive counter would charge one
 * departure as three and end the paper on the first slip. Everything inside a
 * short window is therefore folded into a single violation.
 *
 * WHY THE LIMIT IS ENFORCED HERE AND NOT TRUSTED
 *
 * This is a deterrent, not a security control. A determined candidate can
 * disable JavaScript, and nothing in the browser can stop them. It exists so an
 * honest candidate practises under exam conditions, and it is deliberately
 * visible — a warning after each strike, and the count on screen — because a
 * proctor that fails silently teaches nothing.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Overlapping events within this many ms are one departure. */
const DEBOUNCE_MS = 1200;

export interface ExamLock {
  /** How many times the candidate has left. */
  violations: number;
  /** True while the document is genuinely fullscreen. */
  isFullscreen: boolean;
  /** Set on the strike that ends the paper, so the UI can explain the submit. */
  lockedOut: boolean;
  /** The most recent strike, for the warning banner. Cleared by `dismiss`. */
  warning: number | null;
  dismiss: () => void;
  /** Ask for fullscreen. Safe to call when already in it. */
  enter: () => Promise<void>;
  /** Leave fullscreen without counting it — used after submitting. */
  release: () => void;
}

export function useExamLock({
  active,
  limit = 3,
  onLimitReached,
}: {
  active: boolean;
  limit?: number;
  onLimitReached: () => void;
}): ExamLock {
  const [violations, setViolations] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [warning, setWarning] = useState<number | null>(null);
  const [lockedOut, setLockedOut] = useState(false);

  const lastAt = useRef(0);
  const finished = useRef(false);
  // Held in a ref so the effect below does not re-subscribe on every render and
  // miss an event during the gap.
  const onLimit = useRef(onLimitReached);
  useEffect(() => {
    onLimit.current = onLimitReached;
  }, [onLimitReached]);

  const enter = useCallback(async () => {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    try {
      if (!document.fullscreenElement) {
        await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
      }
    } catch {
      // Fullscreen needs a user gesture and can be refused outright. The paper
      // still runs; the candidate simply is not locked in.
    }
  }, []);

  const release = useCallback(() => {
    finished.current = true;
    const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> };
    if (document.fullscreenElement) {
      (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())?.catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    finished.current = false;

    const strike = () => {
      if (finished.current) return;
      const now = Date.now();
      if (now - lastAt.current < DEBOUNCE_MS) return;
      lastAt.current = now;

      setViolations((n) => {
        const next = n + 1;
        if (next >= limit) {
          finished.current = true;
          setLockedOut(true);
          // Let the state commit before the paper is torn down.
          setTimeout(() => onLimit.current(), 0);
        } else {
          setWarning(next);
        }
        return next;
      });
    };

    const onFsChange = () => {
      const on = Boolean(document.fullscreenElement);
      setIsFullscreen(on);
      if (!on) strike();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") strike();
    };

    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", strike);

    setIsFullscreen(Boolean(document.fullscreenElement));

    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", strike);
    };
  }, [active, limit]);

  return {
    violations,
    isFullscreen,
    lockedOut,
    warning,
    dismiss: () => setWarning(null),
    enter,
    release,
  };
}
