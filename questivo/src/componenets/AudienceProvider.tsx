import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AUDIENCES,
  audienceAllows,
  clearStoredTrack,
  examsForAudience,
  getAudience,
  readTrack,
  writeTrack,
  type Audience,
  type AudienceId,
  type FeatureId,
} from "../lib/audience";
import { EXAMS, getExam, type Exam } from "../lib/exams";

/**
 * Track state for the whole app.
 *
 * Plain fetch rather than axios, for the same reason lib/pyq.ts gives: this
 * provider wraps every route including the prerendered ones, so it is eager in
 * the bundle and has to stay small.
 */
import { API_BASE } from "../lib/apiBase";

interface AudienceValue {
  /** False until localStorage and the auth check have both been read. */
  ready: boolean;
  audience: Audience | null;
  /** A single exam the visitor asked to lead with, if they picked one. */
  focusExam: Exam | null;
  /** True while the first-visit chooser should be on screen. */
  needsChoice: boolean;
  isAdmin: boolean;
  /** True when an admin has the unfiltered view — the default for admins. */
  seeingEverything: boolean;
  /** Is this feature part of the visitor's track? */
  can: (feature: FeatureId) => boolean;
  /**
   * True once a track is in force and the viewer is not an admin.
   *
   * This is the difference between narrowing as a DEFAULT and narrowing as a
   * RULE, and the product decision changed: a candidate who has told us they
   * are preparing for NEET should not be shown SSC and GATE papers, and the
   * "show all exams" links meant they were, one click from every listing. The
   * escape hatches are hidden while this is true; the way to change track is
   * the profile, which is deliberate rather than accidental.
   *
   * Admins are never locked — an operator has to be able to see the catalogue.
   */
  lockedToTrack: boolean;
  /** Exams to show in listings, narrowed to the track (and focus exam). */
  visibleExams: Exam[];
  /** Every exam, ignoring the track. Only render behind `!lockedToTrack`. */
  allExams: Exam[];
  options: Audience[];
  setTrack: (id: AudienceId, focusExam?: string | null) => void;
  /** Explicit "show me everything" — remembered, so it is not re-asked. */
  dismissChoice: () => void;
  /** Reopen the chooser without wiping the current answer. */
  reopenChoice: () => void;
  /** Admin-only: toggle between the full site and a track preview. */
  setAdminSeesEverything: (value: boolean) => void;
}

const AudienceContext = createContext<AudienceValue | null>(null);

export const AudienceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Deliberately NOT initialised from localStorage.
  //
  // Every public route is prerendered, and main.tsx hydrates that markup. If
  // the first client render already knew the track it would produce different
  // output than the HTML on the page and React would throw the prerendered
  // markup away — the exact failure App.tsx's eager/lazy split exists to
  // avoid. So the first render matches the server (no track, everything
  // visible) and the stored choice is applied one effect later.
  const [audienceId, setAudienceId] = useState<AudienceId | null>(null);
  const [focusExamSlug, setFocusExamSlug] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [storageRead, setStorageRead] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminSeesEverything, setAdminSeesEverything] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  // Set when the chooser is reopened deliberately. Without it an admin could
  // never bring the dialog back — admins are excluded from the automatic
  // prompt, so the "change" control in the header did nothing for them.
  const [forceChoice, setForceChoice] = useState(false);

  useEffect(() => {
    const stored = readTrack();
    if (stored) {
      setAudienceId(stored.audience);
      setFocusExamSlug(stored.focusExam);
      setDismissed(Boolean(stored.dismissed));
    }
    setStorageRead(true);
  }, []);

  /**
   * Write the track to the signed-in account.
   *
   * Fire-and-forget: the local state has already changed and the browser copy
   * is already written, so a failed sync costs this device nothing today — it
   * only means the next device has to be told again. Blocking the UI on it, or
   * rolling the choice back when it fails, would be worse on both counts.
   */
  const syncToAccount = useCallback((audience: AudienceId | null, focus: string | null) => {
    fetch(`${API_BASE}/api/user/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ audienceId: audience, focusExam: focus }),
    }).catch(() => {
      /* offline or signed out; the browser copy still holds */
    });
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    fetch(`${API_BASE}/api/auth/me`, { credentials: "include", signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const user = body?.user;
        const role = user?.role;
        setIsAdmin(role === "admin" || role === "superadmin");
        if (!user) return;

        // THE ACCOUNT WINS.
        //
        // The track is a property of the candidate, not of the machine they
        // happen to be sitting at. A device that has never been told anything —
        // a new phone, a college lab browser, a fresh profile after clearing
        // site data — must still show a NEET aspirant only NEET, and that can
        // only come from the server. So whatever this browser remembered is
        // overwritten by whatever the account says.
        if (user.audienceId && getAudience(user.audienceId)) {
          setAudienceId(user.audienceId);
          setFocusExamSlug(user.focusExam ?? null);
          setDismissed(false);
          writeTrack({ audience: user.audienceId, focusExam: user.focusExam ?? null });
          return;
        }

        // Signed in, but the account has never recorded a track. Everyone who
        // chose one before it was stored server-side is in this state, so the
        // browser's answer is promoted rather than thrown away and re-asked.
        const local = readTrack();
        if (local?.audience) syncToAccount(local.audience, local.focusExam ?? null);
      })
      // A logged-out visitor 401s here, which is the normal case, not an error.
      .catch(() => setIsAdmin(false))
      .finally(() => setAuthChecked(true));
    return () => ac.abort();
  }, [syncToAccount]);

  const persist = useCallback(
    (next: { audience: AudienceId | null; focusExam: string | null; dismissed?: boolean }) => {
      writeTrack({
        audience: next.audience,
        focusExam: next.focusExam,
        dismissed: next.dismissed,
      });
    },
    []
  );

  const setTrack = useCallback(
    (id: AudienceId, focusExam: string | null = null) => {
      setAudienceId(id);
      setFocusExamSlug(focusExam);
      setDismissed(false);
      setForceChoice(false);
      // An admin who picks a track means it: they are previewing what that
      // visitor sees, so the admin-wide view steps aside until they ask for it
      // back. Nothing is lost — the chip in the header switches it on again.
      setAdminSeesEverything(false);
      persist({ audience: id, focusExam, dismissed: false });
      // Both stores, always. The browser copy is what the next render reads;
      // the account copy is what the next DEVICE reads.
      syncToAccount(id, focusExam);
    },
    [persist, syncToAccount]
  );

  const dismissChoice = useCallback(() => {
    setAudienceId(null);
    setFocusExamSlug(null);
    setDismissed(true);
    setForceChoice(false);
    setAdminSeesEverything(true);
    persist({ audience: null, focusExam: null, dismissed: true });
  }, [persist]);

  const reopenChoice = useCallback(() => {
    // Clears the stored answer and puts the dialog back up. Nothing else about
    // the session is disturbed.
    setDismissed(false);
    setAudienceId(null);
    setFocusExamSlug(null);
    setForceChoice(true);
    clearStoredTrack();
  }, []);

  const audience = useMemo(() => getAudience(audienceId), [audienceId]);
  const focusExam = useMemo(() => getExam(focusExamSlug ?? undefined) ?? null, [focusExamSlug]);

  // An admin is never narrowed unless they explicitly ask to preview a track.
  const effectiveAudience = isAdmin && adminSeesEverything ? null : audience;

  const can = useCallback(
    (feature: FeatureId) => audienceAllows(effectiveAudience, feature),
    [effectiveAudience]
  );

  const visibleExams = useMemo(() => {
    const inTrack = examsForAudience(effectiveAudience);
    if (!focusExam || effectiveAudience === null) return inTrack;
    /**
     * A focus exam REPLACES the track's list, it does not merely lead it.
     *
     * It used to lead: focus exam first, then the rest of the track. The
     * reasoning was that nothing should be locked away. But the candidate who
     * bothers to name one exam has said something quite specific — "I am
     * preparing for NEET" — and answering it with NEET, JEE Main and JEE
     * Advanced ignores them. The whole point of picking is to stop seeing the
     * other two.
     *
     * Nothing is unreachable: clearing the focus exam in the profile brings the
     * whole track back, which is the deliberate act it should be.
     */
    return [focusExam];
  }, [effectiveAudience, focusExam]);

  /**
   * Readiness deliberately does NOT wait on the auth request.
   *
   * The track comes from localStorage, which resolves in this provider's first
   * effect — before any network response can arrive. Gated pages run their own
   * auth check on mount, and while the gate was waiting on /api/auth/me too,
   * the two raced: the ATS page's check would sometimes land first and redirect
   * to the login screen before the gate had decided anything.
   *
   * Waiting only on storage makes the gate win deterministically. Nothing is
   * lost by it: `isAdmin` only ever WIDENS access, and an admin has no stored
   * track, so `audience` is already null for them and nothing is gated while
   * the role is still in flight.
   */
  const ready = storageRead;

  const value: AudienceValue = {
    ready,
    audience: effectiveAudience,
    focusExam,
    // The chooser, unlike the feature gate, DOES wait for the auth check —
    // it must not flash up in front of an admin before their role is known.
    // An explicit reopen bypasses that entirely, including for admins.
    needsChoice:
      forceChoice || (storageRead && authChecked && !audienceId && !dismissed && !isAdmin),
    isAdmin,
    seeingEverything: effectiveAudience === null,
    lockedToTrack: Boolean(effectiveAudience) && !isAdmin,
    can,
    visibleExams,
    allExams: EXAMS,
    options: AUDIENCES,
    setTrack,
    dismissChoice,
    reopenChoice,
    setAdminSeesEverything,
  };

  return <AudienceContext.Provider value={value}>{children}</AudienceContext.Provider>;
};

/**
 * Falls back to an unrestricted value rather than throwing when no provider is
 * above it. The prerenderer mounts route components through a StaticRouter, and
 * a hard throw there would fail the build for every page at once.
 */
export function useAudience(): AudienceValue {
  const ctx = useContext(AudienceContext);
  if (ctx) return ctx;
  return {
    ready: false,
    audience: null,
    focusExam: null,
    needsChoice: false,
    isAdmin: false,
    seeingEverything: true,
    lockedToTrack: false,
    can: () => true,
    visibleExams: EXAMS,
    allExams: EXAMS,
    options: AUDIENCES,
    setTrack: () => {},
    dismissChoice: () => {},
    reopenChoice: () => {},
    setAdminSeesEverything: () => {},
  };
}
