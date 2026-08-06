/**
 * Static prerender step.
 *
 * Runs after `vite build` (client) and `vite build --ssr` (server) and turns the
 * single empty-shell dist/index.html into one real HTML document per public
 * route.
 *
 * Why this exists: Vite ships a client-rendered SPA, so every crawler request
 * previously returned `<div id="root"></div>`. Googlebot renders JavaScript
 * eventually, but the AI crawlers that feed generative answers — GPTBot,
 * ClaudeBot, PerplexityBot, OAI-SearchBot — largely do not. Without this step
 * the site is invisible to them.
 */
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const ssrEntry = path.join(root, "dist-ssr", "entry-server.js");

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * JSON-LD is injected into a <script> body. `<` is neutralised so no string can
 * open a `</script>`, and U+2028/U+2029 are escaped because they are raw line
 * terminators in JavaScript source but legal inside a JSON string.
 */
const LINE_SEPARATORS = new RegExp(
  "[" + String.fromCharCode(0x2028, 0x2029) + "]",
  "g"
);

const escapeJsonLd = (obj) =>
  JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(LINE_SEPARATORS, (c) => "\\u" + c.charCodeAt(0).toString(16));

function buildHead(route, mod) {
  const {
    SITE_URL,
    SITE_NAME,
    SITE_LOCALE,
    TWITTER_HANDLE,
    DEFAULT_OG_IMAGE,
    buildJsonLd,
    buildBreadcrumbs,
  } = mod;
  // canonicalPath lets a duplicate URL (/test-setup) point at the one that
  // should be indexed (/pyq/setup) instead of declaring itself canonical.
  const canonicalTarget = route.canonicalPath ?? route.path;
  const canonical = `${SITE_URL}${canonicalTarget === "/" ? "/" : canonicalTarget}`;
  const image = route.ogImage ?? DEFAULT_OG_IMAGE;
  const robots = route.noindex
    ? "noindex, nofollow"
    : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";

  const tags = [
    `<title>${escapeHtml(route.title)}</title>`,
    `<meta name="description" content="${escapeHtml(route.description)}" />`,
    `<meta name="keywords" content="${escapeHtml(route.keywords)}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    // One locale, stated rather than inferred. x-default points at the same URL
    // because there is no other language version to fall back to — omitting it
    // makes the annotation incomplete, and inventing an "en" alternate that
    // does not exist would be worse.
    `<link rel="alternate" hreflang="${SITE_LOCALE}" href="${canonical}" />`,
    `<link rel="alternate" hreflang="x-default" href="${canonical}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:title" content="${escapeHtml(route.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(route.description)}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:site" content="${TWITTER_HANDLE}" />`,
    `<meta name="twitter:url" content="${canonical}" />`,
    `<meta name="twitter:title" content="${escapeHtml(route.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(route.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ];

  // Preload the hero image on the homepage ONLY. It is the LCP element there
  // and nowhere else, so emitting it sitewide made every other route download
  // a 1200px image it never renders (Chrome: "preloaded using link preload but
  // not used"). The href must stay byte-identical to the <img src> in
  // HomePage.tsx or the preload is wasted and the image is fetched twice.
  if (route.path === "/") {
    tags.unshift(
      `<link rel="preconnect" href="https://images.unsplash.com" crossorigin />`,
      `<link rel="preload" as="image" href="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&amp;w=1200&amp;auto=format&amp;fit=crop" fetchpriority="high" />`
    );
  }

  // The sitewide graph goes on the homepage only; repeating FAQPage on every
  // route is a known cause of rich-result suppression.
  if (route.path === "/") {
    tags.push(
      `<script type="application/ld+json">${escapeJsonLd(buildJsonLd())}</script>`
    );
  }
  const crumbs = buildBreadcrumbs(route);
  if (crumbs) {
    tags.push(
      `<script type="application/ld+json" id="breadcrumb-jsonld">${escapeJsonLd(
        crumbs
      )}</script>`
    );
  }

  // Exam landing pages carry their own Course + FAQPage graph.
  const exam = mod.getExamForPath(route.path);
  if (exam) {
    tags.push(
      `<script type="application/ld+json" id="exam-jsonld">${escapeJsonLd(
        mod.buildExamJsonLd(exam)
      )}</script>`
    );
  }

  // The two hub pages describe themselves as collections of the things they
  // link to, which a flat list of <a> elements does not communicate.
  if (route.path === "/exams") {
    tags.push(
      `<script type="application/ld+json" id="collection-jsonld">${escapeJsonLd(
        mod.buildExamListJsonLd()
      )}</script>`
    );
  }
  if (route.path === "/pyq") {
    tags.push(
      `<script type="application/ld+json" id="collection-jsonld">${escapeJsonLd(
        mod.buildPyqJsonLd()
      )}</script>`
    );
  }

  // City pages carry Service + areaServed; college pages carry a WebPage that
  // MENTIONS the institution plus its own FAQPage. One slot, because no route
  // is ever both — see buildCityJsonLd for why neither emits LocalBusiness.
  const city = mod.getCityForPath(route.path);
  const college = city ? undefined : mod.getCollegeForPath(route.path);
  if (city || college) {
    tags.push(
      `<script type="application/ld+json" id="geo-jsonld">${escapeJsonLd(
        city ? mod.buildCityJsonLd(city) : mod.buildCollegeJsonLd(college)
      )}</script>`
    );
  }

  return tags.join("\n    ");
}

/**
 * A short, crawler-visible summary of the route rendered inside <noscript>.
 *
 * This is a fallback for engines that fetch raw HTML and never execute React.
 * The statements must stay true to what the rendered page actually says — if
 * they diverge, this becomes cloaking rather than an accessibility net.
 */
function buildNoscript(route) {
  const facts = route.facts.map((f) => `<li>${escapeHtml(f)}</li>`).join("");
  return [
    `<noscript>`,
    `<h2>${escapeHtml(route.heading)}</h2>`,
    `<p>${escapeHtml(route.description)}</p>`,
    facts ? `<ul>${facts}</ul>` : "",
    `<p>Questivo needs JavaScript enabled to generate and run tests.</p>`,
    `</noscript>`,
  ].join("");
}

async function main() {
  if (!existsSync(ssrEntry)) {
    throw new Error(
      `SSR bundle missing at ${ssrEntry}. Run "vite build --ssr src/entry-server.tsx --outDir dist-ssr" first.`
    );
  }

  const mod = await import(pathToFileUrl(ssrEntry));
  const template = await readFile(path.join(distDir, "index.html"), "utf-8");

  if (
    !template.includes("<!--seo-start-->") ||
    !template.includes("<!--app-html-->")
  ) {
    throw new Error(
      "index.html is missing the <!--seo-start-->/<!--seo-end--> or <!--app-html--> markers."
    );
  }

  const routes = mod.ALL_ROUTES;
  let written = 0;

  for (const route of routes) {
    let appHtml = "";
    try {
      // noindex routes (auth screens, the /interviews redirect) get correct
      // <head> tags but no static body: nothing should index them, and they
      // are exactly the routes that depend on OAuth providers or redirect on
      // first render, neither of which survives a static render.
      if (!route.noindex) appHtml = mod.render(route.path);
    } catch (err) {
      // A route that cannot render statically still gets correct <head> tags;
      // it just falls back to client rendering for its body.
      console.warn(
        `  ! ${route.path} failed to prerender (${err.message}) - head only`
      );
    }

    const html = template
      .replace(/<!--seo-start-->[\s\S]*?<!--seo-end-->/, buildHead(route, mod))
      .replace("<!--app-html-->", appHtml)
      .replace("<!--seo-noscript-->", buildNoscript(route));

    const outPath =
      route.path === "/"
        ? path.join(distDir, "index.html")
        : path.join(distDir, route.path.replace(/^\//, ""), "index.html");

    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, html, "utf-8");
    written++;
    console.log(
      `  + ${route.path.padEnd(22)} -> ${path.relative(root, outPath)}`
    );
  }

  await generate404(mod, template);
  await generateSitemap(mod);
  await generateLlmsTxt(mod);
  await generateRobotsTxt(mod);

  // The SSR bundle is a build artefact; leaving it in place confuses deploys.
  await rm(path.join(root, "dist-ssr"), { recursive: true, force: true });

  console.log(`\nPrerendered ${written} routes.`);
}

function pathToFileUrl(p) {
  return new URL(`file:///${p.replace(/\\/g, "/")}`).href;
}

async function generateSitemap(mod) {
  const { INDEXABLE_ROUTES, SITE_URL } = mod;
  // Stamped at build time so the value is stable per deploy.
  const lastmod = new Date().toISOString().split("T")[0];

  const urls = INDEXABLE_ROUTES.map((r) => {
    const loc = `${SITE_URL}${r.path === "/" ? "/" : r.path}`;
    const priority = r.path === "/" ? "1.0" : "0.8";
    return [
      "  <url>",
      `    <loc>${loc}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      `    <changefreq>weekly</changefreq>`,
      `    <priority>${priority}</priority>`,
      "  </url>",
    ].join("\n");
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  await writeFile(path.join(distDir, "sitemap.xml"), xml, "utf-8");
  console.log(`  + sitemap.xml          -> ${INDEXABLE_ROUTES.length} URLs`);
}

/**
 * Emit dist/404.html.
 *
 * Vercel serves this file with a real HTTP 404 for any request that matches no
 * static file and no rewrite. That matters: the SPA fallback would otherwise
 * answer every dead URL with 200 + app shell, which Google classifies as a soft
 * 404 and which wastes crawl budget indefinitely. Pairs with the narrowed
 * rewrite list in vercel.json — see the comment there before widening it.
 */
async function generate404(mod, template) {
  let appHtml = "";
  try {
    // Any unmatched path renders NotFoundPage through the catch-all route.
    appHtml = mod.render("/__not-found__");
  } catch (err) {
    console.warn(`  ! 404 page failed to prerender (${err.message}) - head only`);
  }

  const head = [
    `<title>Page not found | Questivo</title>`,
    `<meta name="description" content="This page doesn't exist. Browse Questivo's free previous year papers and mock tests by exam instead." />`,
    `<meta name="robots" content="noindex, follow" />`,
  ].join("\n    ");

  const html = template
    .replace(/<!--seo-start-->[\s\S]*?<!--seo-end-->/, head)
    .replace("<!--app-html-->", appHtml)
    .replace(
      "<!--seo-noscript-->",
      // Built from SITE_URL rather than naming a host inline: this string spent
      // the last deploy telling visitors to go to questivo.vercel.app.
      `<noscript><h2>Page not found</h2><p>This page doesn't exist. Visit <a href="${mod.SITE_URL}/exams">${mod.SITE_URL}/exams</a> to browse free previous year papers and mock tests by exam.</p></noscript>`
    );

  await writeFile(path.join(distDir, "404.html"), html, "utf-8");
  console.log(`  + 404.html             -> real 404 status, noindex`);
}

/**
 * Generate /llms.txt: a plain-text brief for answer engines.
 *
 * Built from the same route table as the sitemap so the two can never
 * disagree, and so a new exam page shows up here automatically.
 */
async function generateLlmsTxt(mod) {
  const { INDEXABLE_ROUTES, SITE_URL, SITE_NAME, LLMS_INTRO, LLMS_FACTS, EXAMS, examPath } = mod;

  const isExam = (p) => p.startsWith("/mock-test/");
  const line = (r) =>
    `- [${r.title.replace(/\s*\|\s*Questivo\s*$/, "")}](${SITE_URL}${r.path}): ${r.description}`;

  const core = INDEXABLE_ROUTES.filter((r) => !isExam(r.path)).map(line).join("\n");
  const exams = INDEXABLE_ROUTES.filter((r) => isExam(r.path)).map(line).join("\n");

  const examSummaries = EXAMS.map(
    (e) => `- **${e.name}** (${e.category}) — ${e.summary} Practice: ${SITE_URL}${examPath(e)}`
  ).join("\n");

  const body = `# ${SITE_NAME}

> ${LLMS_INTRO}

## Pages

${core}

## Mock tests by exam

${exams}

## Exams covered

${examSummaries}

## Facts for citation

${LLMS_FACTS.map((f) => `- ${f}`).join("\n")}

## Notes

- Content is not paywalled; crawling is permitted per ${SITE_URL}/robots.txt
- Questivo does not publish official exam dates, vacancy counts or cut-offs. For those, consult the conducting body's official notification.
`;

  await writeFile(path.join(distDir, "llms.txt"), body, "utf-8");
  console.log(
    `  + llms.txt             -> ${INDEXABLE_ROUTES.length} pages, ${EXAMS.length} exams`
  );
}

/**
 * Generate /robots.txt.
 *
 * Generated, not shipped from public/, so its Sitemap: line cannot name a
 * hostname the site no longer lives on — which is precisely what the static
 * version did after the move to the custom domain. Overwrites whatever Vite
 * copied out of public/, so a leftover file there loses to this one rather than
 * silently winning.
 */
async function generateRobotsTxt(mod) {
  await writeFile(path.join(distDir, "robots.txt"), mod.buildRobotsTxt(), "utf-8");
  console.log(`  + robots.txt           -> sitemap at ${mod.SITE_URL}/sitemap.xml`);
}

main().catch((err) => {
  console.error("\nPrerender failed:\n", err);
  process.exit(1);
});
