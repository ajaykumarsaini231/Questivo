"use client";

/**
 * The upgrade prompt shown instead of generating a mock test.
 *
 * Deliberately not a toast and not an inline banner: the visitor pressed a
 * button expecting a paper, so the answer has to occupy the same place the
 * paper would have and has to be dismissed on purpose. It says what the
 * feature is, what it costs them to get it (a phone call), and gives them a
 * way out — which is the whole difference between an upsell and a dead end.
 *
 * Escape closes it and focus moves to the primary action on open, because a
 * modal a keyboard user cannot leave is a trap rather than an offer.
 */

import { useEffect, useRef } from "react";
import { Phone, Sparkles, X } from "lucide-react";
import { PREMIUM_CONTACT_EMAIL, PREMIUM_CONTACT_PHONE, telHref } from "../lib/premium";

export default function PremiumDialog({
  open,
  onClose,
  feature = "Generated Mock Tests",
}: {
  open: boolean;
  onClose: () => void;
  /** What the visitor just tried to use, so the dialog names it. */
  feature?: string;
}) {
  const callRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    callRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="premium-dialog-title"
      // A click on the backdrop is a click outside the dialog, which every
      // modal on the web treats as "close".
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-600 to-violet-600" />

        <div className="relative p-7">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100">
            <Sparkles className="h-6 w-6 text-indigo-600" />
          </div>

          <h2 id="premium-dialog-title" className="text-xl font-bold text-slate-900">
            {feature} are a premium feature
          </h2>

          <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
            Generated Mock Tests are available in the premium version. Please contact us to unlock
            unlimited AI-generated mock tests.
          </p>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Call us on</p>
            <p className="mt-1 text-lg font-bold tracking-tight text-slate-900">
              {PREMIUM_CONTACT_PHONE}
            </p>
            {PREMIUM_CONTACT_EMAIL && (
              <a
                href={`mailto:${PREMIUM_CONTACT_EMAIL}`}
                className="mt-1 inline-block text-sm text-indigo-600 underline"
              >
                {PREMIUM_CONTACT_EMAIL}
              </a>
            )}
          </div>

          {/* Previous year papers stay free, and saying so here is the point:
              the visitor came to sit a paper and there is one they can sit. */}
          <p className="mt-4 text-sm text-slate-500">
            Every previous year paper on this site remains free — pick any exam, year and shift and
            sit it in full.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
            <a
              ref={callRef}
              href={telHref(PREMIUM_CONTACT_PHONE)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
            >
              <Phone className="h-4 w-4" /> Call Now
            </a>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border-2 border-slate-200 px-6 py-3 text-sm font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
