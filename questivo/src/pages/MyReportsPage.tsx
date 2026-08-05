import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { FileText, Mic, ArrowLeft, Printer, Loader2 } from "lucide-react";

/**
 * Saved reports: past ATS analyses and past AI interviews, reopenable.
 *
 * Nothing here re-runs the model and nothing stores a PDF. Both reports were
 * already persisted as structured JSON when they were first produced
 * (ResumeAnalysis, InterviewSession + InterviewMessage), so reopening one is a
 * plain database read and re-render.
 *
 * PDF export uses the browser's own print pipeline rather than a JS PDF
 * library. html2canvas/jsPDF rasterise the DOM — slow, hundreds of KB of
 * bundle, and the output is a blurry image with no selectable text. Native
 * print is effectively instant, adds zero bytes, keeps text selectable, and
 * "Save as PDF" is built into every browser's print dialog.
 */

import { API_BASE } from "../lib/apiBase";
const api = axios.create({ baseURL: API_BASE, withCredentials: true });

type ResumeRow = {
  id: string;
  fileName: string;
  targetRole: string;
  targetCompany: string;
  overallScore: number;
  matchPercentage: number;
  createdAt: string;
};

type InterviewRow = {
  id: string;
  targetRole: string;
  targetCompany: string;
  durationMinutes: number;
  status: string;
  createdAt: string;
  evaluation?: { overallScore: number } | null;
  _count?: { messages: number };
};

type Message = { id: string; sender: string; content: string; createdAt: string };

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

const scoreColor = (n: number) =>
  n >= 75 ? "var(--c-accent)" : n >= 50 ? "#b45309" : "#b91c1c";

const MyReportsPage: React.FC = () => {
  const [tab, setTab] = useState<"resume" | "interview">("resume");
  const [resumes, setResumes] = useState<ResumeRow[]>([]);
  const [interviews, setInterviews] = useState<InterviewRow[]>([]);
  const [anonymous, setAnonymous] = useState(false);
  const [loading, setLoading] = useState(true);

  // Whichever single report is open.
  const [openResume, setOpenResume] = useState<any | null>(null);
  const [openInterview, setOpenInterview] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [r, i] = await Promise.all([
          api.get("/api/resume/history"),
          api.get("/api/interview/history"),
        ]);
        if (!alive) return;
        setResumes(r.data?.data || []);
        setInterviews(i.data?.data || []);
        setAnonymous(Boolean(r.data?.anonymous || i.data?.anonymous));
      } catch {
        if (alive) setAnonymous(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const openResumeReport = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/api/resume/${id}`);
      setOpenResume(data.data);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openInterviewReport = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/api/interview/transcript/${id}`);
      setOpenInterview(data.data);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  /* ------------------------------ detail views ------------------------------ */

  if (openResume) {
    const lint = openResume.lintChecks || {};
    return (
      <div className="min-h-screen">
        <main className="shell py-10">
          <div className="print-hide mb-6 flex items-center justify-between">
            <button onClick={() => setOpenResume(null)} className="btn btn-secondary btn-sm">
              <ArrowLeft className="h-4 w-4" /> Back to reports
            </button>
            <button onClick={() => window.print()} className="btn btn-primary btn-sm">
              <Printer className="h-4 w-4" /> Save as PDF
            </button>
          </div>

          <article className="printable">
            <h1 className="text-3xl font-extrabold">ATS Resume Report</h1>
            <p className="mt-1 text-sm muted">
              {openResume.fileName} · {openResume.targetRole}
              {openResume.targetCompany ? ` · ${openResume.targetCompany}` : ""} ·{" "}
              {fmtDate(openResume.createdAt)}
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                ["Overall score", openResume.overallScore],
                ["Match", openResume.matchPercentage],
              ].map(([label, val]) => (
                <div key={String(label)} className="card p-5">
                  <p className="text-sm muted">{label}</p>
                  <p className="text-4xl font-extrabold" style={{ color: scoreColor(Number(val)) }}>
                    {String(val)}
                    <span className="text-xl">/100</span>
                  </p>
                </div>
              ))}
            </div>

            {[
              ["Strengths", openResume.strengths],
              ["Weaknesses", openResume.weaknesses],
              ["Missing skills", openResume.missingSkills],
            ].map(([title, list]) =>
              Array.isArray(list) && list.length ? (
                <section key={String(title)} className="mt-8">
                  <h2 className="section-title">{String(title)}</h2>
                  <ul className="mt-3 space-y-2">
                    {(list as string[]).map((x, i) => (
                      <li key={i} className="card p-3 text-sm">
                        {typeof x === "string" ? x : JSON.stringify(x)}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null
            )}

            {Array.isArray(lint.rewrittenBullets) && lint.rewrittenBullets.length ? (
              <section className="mt-8">
                <h2 className="section-title">Rewritten bullet points</h2>
                <div className="mt-3 space-y-3">
                  {lint.rewrittenBullets.map((b: any, i: number) => (
                    <div key={i} className="card p-4">
                      <p className="text-sm muted line-through">{b.original}</p>
                      <p className="mt-2 text-sm font-medium">{b.improved}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {lint.finalVerdict ? (
              <section className="mt-8">
                <h2 className="section-title">Verdict</h2>
                <p className="mt-3 leading-relaxed">
                  {typeof lint.finalVerdict === "string"
                    ? lint.finalVerdict
                    : JSON.stringify(lint.finalVerdict)}
                </p>
              </section>
            ) : null}
          </article>
        </main>
      </div>
    );
  }

  if (openInterview) {
    const messages: Message[] = openInterview.messages || [];
    const ev = openInterview.evaluation;
    return (
      <div className="min-h-screen">
        <main className="shell py-10">
          <div className="print-hide mb-6 flex items-center justify-between">
            <button onClick={() => setOpenInterview(null)} className="btn btn-secondary btn-sm">
              <ArrowLeft className="h-4 w-4" /> Back to reports
            </button>
            <button onClick={() => window.print()} className="btn btn-primary btn-sm">
              <Printer className="h-4 w-4" /> Save as PDF
            </button>
          </div>

          <article className="printable">
            <h1 className="text-3xl font-extrabold">Interview Transcript</h1>
            <p className="mt-1 text-sm muted">
              {openInterview.targetRole} · {openInterview.experienceLevel} ·{" "}
              {fmtDate(openInterview.createdAt)} · {messages.length} messages
            </p>

            {ev ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-4">
                {[
                  ["Overall", ev.overallScore],
                  ["Technical", ev.technicalScore],
                  ["Communication", ev.communicationScore],
                  ["Problem solving", ev.problemSolving],
                ].map(([l, v]) => (
                  <div key={String(l)} className="card p-4">
                    <p className="text-xs muted">{String(l)}</p>
                    <p className="text-2xl font-bold" style={{ color: scoreColor(Number(v)) }}>
                      {String(v)}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            <section className="mt-8 space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className="card p-4"
                  style={
                    m.sender === "ai"
                      ? { borderLeft: "3px solid var(--c-brand)" }
                      : { borderLeft: "3px solid var(--c-accent)" }
                  }
                >
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide muted">
                    {m.sender === "ai" ? "Interviewer" : "You"}
                  </p>
                  <p className="text-sm leading-relaxed">{m.content}</p>
                </div>
              ))}
              {!messages.length && <p className="muted">No messages were recorded for this session.</p>}
            </section>
          </article>
        </main>
      </div>
    );
  }

  /* -------------------------------- list view ------------------------------- */

  return (
    <div className="min-h-screen">
      <main className="shell py-10">
        <h1 className="text-3xl font-extrabold">My reports</h1>
        <p className="mt-2 muted">
          Your past ATS analyses and AI interviews. Open any one to review it again, or save it as a
          PDF.
        </p>

        {anonymous && (
          <div className="card mt-6 p-5">
            <p className="font-semibold">Sign in to keep your reports</p>
            <p className="mt-1 text-sm muted">
              Reports are saved to your account. Without signing in they are not listed here.
            </p>
            <Link to="/signin" className="btn btn-primary btn-sm mt-4">
              Sign in
            </Link>
          </div>
        )}

        <div className="print-hide mt-8 flex gap-2 border-b" style={{ borderColor: "var(--c-border)" }}>
          {(
            [
              ["resume", "Resume analyses", resumes.length, <FileText key="a" className="h-4 w-4" />],
              ["interview", "Interviews", interviews.length, <Mic key="b" className="h-4 w-4" />],
            ] as const
          ).map(([key, label, count, icon]) => (
            <button
              key={key}
              onClick={() => setTab(key as "resume" | "interview")}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium"
              style={
                tab === key
                  ? { color: "var(--c-brand)", boxShadow: "inset 0 -3px 0 var(--c-brand)" }
                  : { color: "var(--c-text-muted)" }
              }
            >
              {icon}
              {label} ({count})
            </button>
          ))}
        </div>

        {loading || detailLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--c-brand)" }} />
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {tab === "resume" &&
              (resumes.length ? (
                resumes.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => openResumeReport(r.id)}
                    className="card card-hover flex w-full items-center justify-between p-4 text-left"
                  >
                    <span>
                      <span className="block font-semibold">{r.fileName}</span>
                      <span className="text-sm muted">
                        {r.targetRole}
                        {r.targetCompany ? ` · ${r.targetCompany}` : ""} · {fmtDate(r.createdAt)}
                      </span>
                    </span>
                    <span
                      className="text-2xl font-extrabold"
                      style={{ color: scoreColor(r.overallScore) }}
                    >
                      {r.overallScore}
                    </span>
                  </button>
                ))
              ) : (
                <EmptyState
                  text="No resume analyses yet."
                  cta="Analyse a resume"
                  to="/resume_ats_score"
                />
              ))}

            {tab === "interview" &&
              (interviews.length ? (
                interviews.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => openInterviewReport(s.id)}
                    className="card card-hover flex w-full items-center justify-between p-4 text-left"
                  >
                    <span>
                      <span className="block font-semibold">{s.targetRole}</span>
                      <span className="text-sm muted">
                        {fmtDate(s.createdAt)} · {s._count?.messages ?? 0} messages · {s.status}
                      </span>
                    </span>
                    {s.evaluation ? (
                      <span
                        className="text-2xl font-extrabold"
                        style={{ color: scoreColor(s.evaluation.overallScore) }}
                      >
                        {s.evaluation.overallScore}
                      </span>
                    ) : (
                      <span className="text-sm muted">not scored</span>
                    )}
                  </button>
                ))
              ) : (
                <EmptyState
                  text="No interviews yet."
                  cta="Start a mock interview"
                  to="/interviews"
                />
              ))}
          </div>
        )}
      </main>
    </div>
  );
};

const EmptyState: React.FC<{ text: string; cta: string; to: string }> = ({ text, cta, to }) => (
  <div className="card p-8 text-center">
    <p className="muted">{text}</p>
    <Link to={to} className="btn btn-primary btn-sm mt-4">
      {cta}
    </Link>
  </div>
);

export default MyReportsPage;
