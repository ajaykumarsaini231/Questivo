import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Compass, ChevronRight } from "lucide-react";
import { useAudience } from "./AudienceProvider";
import { AUDIENCES, type FeatureId } from "../lib/audience";

interface Props {
  feature: FeatureId;
  /** Human name of the tool, used in the explanation. */
  title: string;
  children: React.ReactNode;
}

/**
 * Hides a tool that is not part of the visitor's track — without pretending it
 * does not exist.
 *
 * Navigation and the homepage simply omit an off-track tool, which is what
 * "hidden" means for anyone browsing. This component covers the other way in:
 * a typed URL, an old bookmark, a link from a friend. Answering those with a
 * 404 would be a lie, and answering with a redirect would strand someone who
 * deliberately went looking. So it explains whose track the tool belongs to,
 * offers to switch, and lets them through anyway if they insist.
 *
 * Two cases deliberately render the children untouched:
 *
 *   - `ready` is false. That covers the prerender and the first hydration pass,
 *     so the static HTML of every page is the complete page. A crawler and a
 *     first-time visitor both get the full site; the narrowing only ever
 *     happens afterwards, from a choice the visitor made.
 *   - the visitor is an admin, who is never filtered.
 */
const FeatureGate: React.FC<Props> = ({ feature, title, children }) => {
  const { ready, can, audience, setTrack } = useAudience();
  const [override, setOverride] = useState(false);

  if (!ready || can(feature) || override) return <>{children}</>;

  // Which tracks DO include this tool, so the offer to switch is concrete
  // rather than "change your settings somewhere".
  const tracksWithFeature = AUDIENCES.filter((a) => a.features[feature]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <main className="shell py-16">
        <div className="card mx-auto max-w-2xl p-8">
          <span className="inline-flex rounded-lg bg-indigo-50 p-2.5 text-indigo-600">
            <Compass className="h-6 w-6" />
          </span>

          <h1 className="mt-5 text-2xl font-bold">
            The {title} isn't part of your track
          </h1>
          {/* Never lowercased: "ATS" is an acronym, and toLowerCase() turned it
              into "ats resume checker" in the middle of a sentence. */}
          <p className="mt-3 leading-relaxed text-slate-600">
            Your track is <strong>{audience?.label ?? "exam practice"}</strong>, so Questivo
            keeps the {title} out of your pages to leave them about the exam. It still works —
            nothing has been taken away.
          </p>

          {tracksWithFeature.length > 0 && (
            <>
              <p className="mt-6 text-sm font-semibold">
                The {title} is part of{" "}
                {tracksWithFeature.length === 1 ? "this track" : "these tracks"}:
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {tracksWithFeature.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setTrack(a.id)}
                    className="btn btn-secondary btn-sm"
                  >
                    Switch to {a.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-4 border-t pt-6" style={{ borderColor: "var(--c-border)" }}>
            <button type="button" onClick={() => setOverride(true)} className="btn btn-primary">
              Use the {title} anyway <ChevronRight className="h-4 w-4" />
            </button>
            {/* "Show me everything from now on" was here, and it permanently
                cleared the track — a one-click way to undo the narrowing for
                good, offered on a page the visitor only reached by wandering
                outside their track in the first place. Using the tool once
                (the button beside this) still works; switching track for good
                belongs in the profile, where it is a decision rather than a
                side effect. */}
            <Link to="/profile" className="text-sm font-medium underline muted">
              Change my track
            </Link>
            <Link to="/exams" className="text-sm font-medium underline muted">
              Back to exams
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default FeatureGate;
