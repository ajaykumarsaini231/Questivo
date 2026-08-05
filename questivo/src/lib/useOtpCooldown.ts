/**
 * The client half of the OTP resend limit.
 *
 * The server is the authority — see server/src/lib/otpThrottle.js — and it will
 * refuse a code inside the cooldown whatever this file does. This exists so a
 * real user never finds that out: the button is visibly disabled with a
 * countdown, so the only requests that ever hit the limit are the ones that
 * ignored the UI.
 *
 * THE COUNTDOWN SURVIVES A RELOAD, AND THAT IS THE POINT
 *
 * The server counts a request made inside the window as a STRIKE, and enough
 * strikes block the account for a day. Keeping the deadline only in React state
 * would mean a refresh — or the browser reclaiming a backgrounded tab on a
 * phone, which happens constantly on the exam-hall demographic this site
 * serves — re-enables the button instantly, the user clicks it, and takes a
 * strike for doing nothing wrong. localStorage keyed by address and purpose
 * makes the countdown outlive the page, so the UI cannot walk a user into a
 * lockout.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

export type OtpPurpose = "SIGNUP" | "LOGIN" | "RESET_PASSWORD";

/** Fallback only. A live server always states its own number in the response. */
const DEFAULT_COOLDOWN_SECONDS = 60;

const storageKey = (purpose: OtpPurpose, identifier: string) =>
  `questivo.otp.${purpose}.${identifier.trim().toLowerCase()}`;

/** localStorage throws in private mode and in some embedded webviews. */
const readDeadline = (key: string): number => {
  try {
    return Number(window.localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
};

const writeDeadline = (key: string, at: number) => {
  try {
    if (at > Date.now()) window.localStorage.setItem(key, String(at));
    else window.localStorage.removeItem(key);
  } catch {
    /* the countdown degrades to in-memory; the server still holds the line */
  }
};

export interface OtpCooldown {
  /** Seconds until another code may be requested. 0 means "go ahead". */
  secondsLeft: number;
  /** True while a code cannot be requested for any reason. */
  waiting: boolean;
  /** Set when the server has blocked this address outright, not merely cooled it. */
  blockedUntil: Date | null;
  /** "00:47" — ready to drop into a button label. */
  label: string;
  /** Call after a code was successfully sent. */
  startCooldown: (seconds?: number) => void;
  /**
   * Feed a failed request in. A 429 from the throttle carries the authoritative
   * remaining time, so the countdown resynchronises from the server rather than
   * from a guess this file made.
   * @returns true when the error was a throttle refusal.
   */
  noteError: (error: unknown) => boolean;
  /** Forget the countdown — used when the address being verified changes. */
  clear: () => void;
}

export function useOtpCooldown(purpose: OtpPurpose, identifier: string): OtpCooldown {
  const key = useMemo(() => storageKey(purpose, identifier), [purpose, identifier]);
  const [deadline, setDeadline] = useState<number>(() =>
    typeof window === "undefined" ? 0 : readDeadline(key)
  );
  const [blockedUntil, setBlockedUntil] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Re-read when the address changes: two different emails have two different
  // cooldowns, and carrying one over would disable the button for an address
  // that was never sent anything.
  useEffect(() => {
    setDeadline(readDeadline(key));
    setBlockedUntil(null);
  }, [key]);

  // One interval, and only while something is actually counting down. A timer
  // left running on a finished countdown re-renders the whole auth screen once
  // a second forever.
  const secondsLeft = Math.max(0, Math.ceil((deadline - now) / 1000));
  useEffect(() => {
    if (deadline <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline]);

  const startCooldown = useCallback(
    (seconds = DEFAULT_COOLDOWN_SECONDS) => {
      const at = Date.now() + Math.max(1, seconds) * 1000;
      writeDeadline(key, at);
      setDeadline(at);
      setNow(Date.now());
    },
    [key]
  );

  const clear = useCallback(() => {
    writeDeadline(key, 0);
    setDeadline(0);
    setBlockedUntil(null);
  }, [key]);

  const noteError = useCallback(
    (error: unknown) => {
      // Shaped for axios, which is what the auth screen uses, but tolerant of a
      // bare fetch Response body being handed in instead.
      const body =
        (error as any)?.response?.data ??
        (error as any)?.data ??
        (typeof error === "object" ? error : null);
      const status = (error as any)?.response?.status ?? (error as any)?.status;
      if (status !== 429 && !body?.retryAfterSeconds) return false;

      const seconds = Number(body?.retryAfterSeconds) || DEFAULT_COOLDOWN_SECONDS;
      startCooldown(seconds);
      if (body?.blocked) {
        setBlockedUntil(
          body.blockedUntil ? new Date(body.blockedUntil) : new Date(Date.now() + seconds * 1000)
        );
      }
      return true;
    },
    [startCooldown]
  );

  const mm = Math.floor(secondsLeft / 60);
  const ss = secondsLeft % 60;

  return {
    secondsLeft,
    waiting: secondsLeft > 0,
    blockedUntil,
    label: mm > 0 ? `${mm}:${String(ss).padStart(2, "0")}` : `${ss}s`,
    startCooldown,
    noteError,
    clear,
  };
}
