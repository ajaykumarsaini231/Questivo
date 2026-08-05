import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import { AppContent } from "./App";

// Re-exported so scripts/prerender.mjs can pull the route table and JSON-LD
// out of the same compiled bundle instead of parsing TypeScript itself.
export {
  ROUTES,
  ALL_ROUTES,
  EXAM_ROUTES,
  INDEXABLE_ROUTES,
  FAQS,
  SITE_URL,
  SITE_NAME,
  SITE_LOCALE,
  TWITTER_HANDLE,
  DEFAULT_OG_IMAGE,
  buildJsonLd,
  buildBreadcrumbs,
  buildExamJsonLd,
  buildExamListJsonLd,
  buildPyqJsonLd,
  buildRobotsTxt,
  getExamForPath,
  LLMS_INTRO,
  LLMS_FACTS,
} from "./lib/seo";
export { EXAMS, examPath } from "./lib/exams";

/**
 * Build-time render used by scripts/prerender.mjs.
 *
 * Data fetching in this app all happens in useEffect, which does not run during
 * renderToString, so every route renders its empty/initial state — exactly what
 * the client shows on first paint. That keeps hydration consistent and keeps
 * the crawler-visible markup honest.
 */
export function render(url: string): string {
  return renderToString(
    <StaticRouter location={url}>
      <AppContent />
    </StaticRouter>
  );
}
