"use client";

/**
 * A route that only exists while its feature is switched on.
 *
 * WHY A ROUTE GUARD AND NOT JUST A DISABLED BUTTON
 *
 * The API already refuses — POST /api/tests/generate sits behind
 * requireEntitlement("aiGeneration") and answers 402. But an open route with a
 * refusing endpoint behind it is the worst of both: the visitor picks an exam,
 * ticks fourteen topics, chooses a difficulty and a duration, presses Generate,
 * and only then is told the feature is not available to them. The work is
 * thrown away and the refusal reads as a bug.
 *
 * So the gate moves to the door. The form is never rendered while the feature
 * is off, and the visitor is pointed at the thing that IS free and does very
 * nearly the same job — a paper built from the previous year question bank.
 *
 * THE SWITCH IS THE SERVER'S
 *
 * Nothing here decides anything. It asks GET /api/features and follows the
 * answer, so flipping PREMIUM_AI_GENERATION in the environment and restarting
 * the API moves the badge, the menu entry, this route and the endpoint itself
 * together. No frontend deploy, and no way for the UI to disagree with what the
 * API would actually serve.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { Lock, Sparkles, ArrowRight } from "lucide-react";
import PremiumDialog from "./PremiumDialog";
import { usePremiumGate, type FeatureKey } from "../lib/premium";

export default function PremiumRoute({
  feature,
  title,
  children,
}: {
  feature: FeatureKey;
  /** What the visitor was trying to reach, named in the lock screen. */
  title: string;
  children: React.ReactNode;
}) {
  const gate = usePremiumGate(feature);

  /**
   * Nothing is rendered until the server has answered.
   *
   * Deliberately not "render the page optimistically and swap it out". This is
   * the page being withheld; showing it for a frame and then taking it away
   * both leaks it and looks like a fault. The wait is one request against an
   * endpoint that reads a couple of environment variables.
   */
  if (!gate.ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
      </div>
    );
  }

  if (!gate.premium) return <>{children}</>;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-16">
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
          <Lock className="h-6 w-6 text-slate-500" />
        </div>

        <h1 className="text-2xl font-bold text-slate-900">{title} is a premium feature</h1>

        {/* The server's own reason, not a generic one. A paywall that does not
            say why reads as arbitrary, and this reason is specific and true:
            a model writing new questions is metered and costs per paper. */}
        <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
          {gate.reason || "This feature is not available on the free plan."}
        </p>

        {/* The free thing that does very nearly the same job, offered as the
            primary action rather than buried under the upsell. A visitor who
            came here to practise should leave with a paper, not a phone
            number. */}
        <div className="mt-7 rounded-xl border border-indigo-100 bg-indigo-50/60 p-5 text-left">
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            Build a paper from previous year questions instead
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            Free, instant, and every question was actually examined. Choose a full
            paper in the official pattern, or pick your own subjects and chapters.
          </p>
          <Link
            to="/pyq/setup"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700"
          >
            Set up a test <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
          <Link to="/pyq" className="font-semibold text-indigo-600 underline">
            Previous year papers
          </Link>
          <Link to="/exams" className="font-medium text-slate-500 underline">
            All exams
          </Link>
        </div>
      </div>

      {/* The contact route, for someone who does want the paid feature. */}
      <div className="mx-auto mt-6 max-w-xl">
        <PremiumDialogTrigger title={title} />
      </div>
    </div>
  );
}

/**
 * "Unlock it" as an inline control rather than a modal that opens itself.
 *
 * A dialog that appears unbidden on page load is an interstitial, and the
 * visitor has already been told what is going on by the card above.
 */
function PremiumDialogTrigger({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto block text-sm font-semibold text-slate-500 underline hover:text-slate-700"
      >
        {/* Not lower-cased: the titles are proper nouns and acronyms, and
            "unlock ai paper generation" reads as a typo. */}
        Contact us to unlock {title}
      </button>
      <PremiumDialog open={open} onClose={() => setOpen(false)} feature={title} />
    </>
  );
}
