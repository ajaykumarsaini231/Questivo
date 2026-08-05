"use client";

/**
 * "Didn't get the code?" — with the cooldown made visible.
 *
 * Disabled-with-a-number rather than disabled-and-silent: a greyed-out button
 * with no explanation reads as broken, and a user who thinks the page is broken
 * reloads it and clicks again, which is exactly the behaviour the server counts
 * as abuse. The remaining seconds are the whole message.
 */

import { RefreshCw, ShieldAlert } from "lucide-react";
import type { OtpCooldown } from "../lib/useOtpCooldown";

export default function OtpResendButton({
  cooldown,
  onResend,
  sending,
}: {
  cooldown: OtpCooldown;
  onResend: () => void;
  sending?: boolean;
}) {
  // A block is not a cooldown and must not read like one. "Wait 5s" when the
  // real answer is "tomorrow" sends the user into a retry loop that can only
  // extend the block.
  if (cooldown.blockedUntil) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-left text-sm text-amber-900">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Too many codes were requested for this account, so new ones are paused until{" "}
          <strong>
            {cooldown.blockedUntil.toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </strong>
          . If this wasn't you, your account is safe — nobody can sign in without the code.
        </span>
      </div>
    );
  }

  return (
    <div className="text-center text-sm text-slate-500">
      Didn't get the code?{" "}
      {cooldown.waiting ? (
        <span className="font-semibold text-slate-400" aria-live="polite">
          Resend in {cooldown.label}
        </span>
      ) : (
        <button
          type="button"
          onClick={onResend}
          disabled={sending}
          className="inline-flex items-center gap-1.5 font-semibold text-indigo-600 underline underline-offset-2 transition hover:text-indigo-700 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${sending ? "animate-spin" : ""}`} />
          {sending ? "Sending…" : "Resend code"}
        </button>
      )}
    </div>
  );
}
