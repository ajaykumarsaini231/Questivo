# SEO / GEO setup

How search engines and AI answer engines see Questivo, and what you have to keep
in sync when changing the app.

## The problem this solves

Questivo is a Vite + React SPA. Before this setup, every URL returned the same
`index.html` with an empty `<div id="root">` and one hard-coded `<title>`. That
meant:

- every route shared the homepage's title, description and canonical URL;
- crawlers that do not execute JavaScript saw a blank page.

The second point is what matters for **GEO** (generative engine optimisation).
Googlebot renders JavaScript, but most AI crawlers — `GPTBot`, `ClaudeBot`,
`PerplexityBot`, `OAI-SearchBot`, `CCBot` — largely fetch raw HTML. A
client-rendered SPA is effectively invisible to them.

## How it works

### 0. The domain

`SITE_URL` in `src/lib/seo.ts` is the one hostname Questivo claims. It is
stamped into every canonical, `og:url`, sitemap entry, `llms.txt` link, JSON-LD
`@id` and the generated `robots.txt`.

It is read from `VITE_SITE_URL`, defaulting to `https://questivo.sutradharlabs.me`.

This is not cosmetic, and it has already gone wrong once. The value read
`https://questivo.vercel.app` while the site was live on the custom domain, so
every page served from `questivo.sutradharlabs.me` carried
`<link rel="canonical" href="https://questivo.vercel.app/">` — each page telling
Google the real version of itself lived on another host. `questivo.vercel.app`
answered 200 for the whole site at the same time, so there were two complete,
crawlable copies and the branded domain was donating its ranking signal to the
deployment URL.

Two things keep that fixed, and they must stay in agreement:

1. `SITE_URL` (or `VITE_SITE_URL`) names the domain to keep.
2. `vercel.json` **redirects** every other host to it with a 308. The `has:
   host` value must be the host being redirected *away from* — point it at the
   host it redirects *to* and the site redirects to itself forever.

If you add another domain to the Vercel project, add a redirect for it too.

### 1. Single source of truth: `src/lib/seo.ts`

Route titles, descriptions, keywords, FAQ entries and all JSON-LD live here.
Nothing else hard-codes this copy.

```
ROUTES[]              per-route <head> content + crawler-visible facts
FAQS[]                feeds BOTH the FAQPage JSON-LD and the on-page FAQ section
LLMS_FACTS[]          quotable claims for answer engines — held to a factual bar
buildJsonLd()         Organization + WebSite + SoftwareApplication + FAQPage graph
buildBreadcrumbs()    BreadcrumbList for non-home routes
buildExamListJsonLd() CollectionPage + ItemList for the /exams hub
buildPyqJsonLd()      CollectionPage + LearningResource for the /pyq archive
buildRobotsTxt()      robots.txt, so its Sitemap: line cannot name a stale host
```

### 1b. Per-exam landing pages: `src/lib/exams.ts`

`EXAMS` drives `/mock-test/<slug>` pages, rendered by
`src/pages/ExamLandingPage.tsx`. Adding an entry to `EXAMS` automatically
produces a prerendered page, a sitemap entry, an `llms.txt` entry, Course +
FAQPage JSON-LD, and footer/homepage links. Nothing else needs touching.

**Accuracy policy:** these pages contain no exam dates, vacancy counts,
cut-offs or marking-scheme numbers. Competitors maintain those with editorial
teams; a stale one is worse than none. `officialFacts` / `officialSource` exist
for when you have a verified source.

### 2. Build-time prerender: `scripts/prerender.mjs`

`npm run build` runs three steps:

```
build:client   vite build                              -> dist/
build:ssr      vite build --ssr src/entry-server.tsx   -> dist-ssr/
prerender      node scripts/prerender.mjs              -> rewrites dist/
```

The prerender step renders each public route with `renderToString` and writes a
real HTML document per route:

```
dist/index.html                     28 KB of markup, full JSON-LD graph
dist/GenerateTestPage/index.html
dist/resume_ats_score/index.html
```

It also generates `dist/sitemap.xml` from `INDEXABLE_ROUTES`, so the sitemap can
never drift from the routes that actually exist.

Data fetching in this app all happens in `useEffect`, which does not run during
`renderToString`. Each route therefore prerenders its *initial* state — exactly
what a user sees on first paint — so hydration matches and the markup is honest.

### 3. Runtime: `src/componenets/Seo.tsx`

Handles client-side navigation. It **updates** the existing `<head>` tags in
place instead of appending, so there is never a second `<title>` fighting the
prerendered one. Unknown/dynamic routes (`/tests/:id`) get `noindex`.

### 4. Hydration: `src/main.tsx`

If `#root` already has markup, `hydrateRoot` adopts it; otherwise `createRoot`
mounts normally. That keeps the prerendered first paint instead of discarding it.

### 5. Bundle splitting and Core Web Vitals

The build shipped one 1,070 kB JavaScript chunk, which was the largest single
drag on Core Web Vitals — and CWV feeds ranking. Now:

```
initial payload  1,146 kB  ->  582 kB   (-49%)
```

`App.tsx` lazy-loads every route that is **not** prerendered. The split rule is
"prerendered vs not", not "big vs small": a lazy route renders its Suspense
fallback under `renderToString`, so the prerender step writes out the *spinner*
instead of the page, and hydration then throws that HTML away.

This bit once already. `/pyq` was promoted from noindex to indexable while
`PyqPapersPage` was still lazy, and the resulting `dist/pyq/index.html` had
`Loading…` where its content should be — an indexable page worth nothing to
exactly the non-JS AI crawlers this whole step exists for. Making it eager cost
7 kB of initial payload (582 → 589 kB).

> **Indexable implies prerendered implies eager.** If you flip a route's
> `noindex` off, check its import in `App.tsx` in the same change.

- **Eager** (prerendered with a body, must hydrate): `/`, `/GenerateTestPage`,
  `/exams`, `/resume_ats_score`, `/pyq`, `/mock-test/*`, plus Header/Seo/404.
- **Lazy**: the PYQ paper player and attempt review, the setup flow, test runner
  and result (pull in katex + react-markdown, ~332 kB), auth, profile, live
  interview (socket.io), the whole admin console.

`noindex` routes may stay lazy: the prerender step writes their `<head>` but
never renders a body for them, so there is nothing to discard.

`vite.config.ts` peels React into its own chunk for cross-deploy caching. It
deliberately returns `undefined` for everything else — an earlier version
returned `'vendor'` for all unmatched `node_modules` ids, which dragged
socket.io into the entry preload set even though only a lazy route imports it.

### 6. Real 404s

`dist/404.html` is generated by the prerender step. Vercel serves it with a
genuine HTTP 404 for anything that matches no file and no rewrite.

This is why `vercel.json` has a **narrow** rewrite list (`/tests/*`,
`/interviews/*`, `/admin*`) instead of the old catch-all. A catch-all answers
every dead URL with 200 + app shell, which Google classifies as a soft 404.

> **If you add a client-only route, you must either prerender it (add to
> `ROUTES`) or add a rewrite for it in `vercel.json`.** Otherwise a direct visit
> or refresh on that URL returns a real 404. This is the one trade-off of
> narrowing the rewrites.

This was not hypothetical. `/pyq/setup`, `/test-setup` and `/my-reports` shipped
without either, and every one of them returned a hard 404 in production on
direct visit or refresh — a bookmark or a shared link to the setup flow was
simply broken. They are in `ROUTES` now (as `noindex`, which still writes a real
file so the URL answers 200), and `/pyq/:path*` has a rewrite for the dynamic
children `/pyq/:paperId` and `/pyq/attempt/:id`.

Order matters and works in our favour: Vercel checks the filesystem *before*
rewrites, so `/pyq/setup` hits its prerendered file and only unmatched children
fall through to the rewrite.

Two URLs rendering the same component (`/test-setup` and `/pyq/setup`) is
duplicate content. `canonicalPath` on a `RouteSeo` entry points the duplicate at
the one to index; `noindex` alone does not merge them.

### 7. Design system

`src/index.css` holds the tokens. Values were **measured from production
exam-prep sites**, not invented, because the earlier look read as an AI
template. The three tells that were removed:

| Tell | Was | Now |
|---|---|---|
| Gradient headline text | `bg-gradient-to-r from-indigo-600 to-violet-600` on the `<h1>` | solid ink + one brand-coloured phrase |
| Coloured drop shadows | `shadow-xl shadow-indigo-200` | neutral `0 2px 8px rgba(16,24,40,.06)` |
| Oversized radii | `rounded-2xl` / `rounded-3xl` everywhere | 6px buttons, 10px cards |

Reference measurements: Testbook `#f6f8f9` bg / `#181b1f` heading / 4–8px radius;
Adda247 `#090023` heading at weight 900 / 8px radius; Oliveboard
`rgba(0,0,0,.1) 0 2px 8px` shadow / 4–7px radius.

Use `.btn`, `.card`, `.chip`, `.data-table`, `.section-title`, `.muted`. Every
token pairing meets WCAG AA — `--c-text-muted` (5.9:1) is the lightest value
allowed for real text.

### 8. Exam patterns and syllabus

`src/lib/examSyllabus.ts` (display) mirrors the server's
`src/agentic-mock-test/examSyllabus.js` + `examPatterns.js` (generation). They
are separate deployables, so **change both**.

JEE Main and NEET are transcribed from the current NTA PDFs, parsed from the
primary source on 2026-08-03, and render with the source cited. The rest carry
`official: false` and render a visible "not yet verified" warning — a wrong
exam pattern on a public page is worse than none.

A **full mock test reproduces that exam's real paper**: `buildSectionPlan()`
emits JEE Main as 20 MCQ + 5 numerical per subject, NEET as 45/45/90 single
correct, GATE as MCQ + MSQ + NAT with negative marking only on the MCQs. All
six shapes are asserted distinct in `src/test/sectionPlan.test.mjs`.

## Rules to keep this working

1. **Adding a public route?** Add it to `ROUTES` in `src/lib/seo.ts` *and*
   `App.tsx`. Sitemap and prerendering follow automatically.
2. **Never put copy only in `index.html`.** Everything between
   `<!--seo-start-->` and `<!--seo-end-->` is replaced at build time; that block
   is only the `npm run dev` fallback.
3. **Do not delete the markers** `<!--seo-start-->`, `<!--seo-end-->`,
   `<!--app-html-->`, `<!--seo-noscript-->` from `index.html`. The build fails
   loudly if the first two go missing.
4. **FAQ schema must stay visible.** `FAQS` renders both as JSON-LD and as the
   on-page `#faq` section. Google requires FAQ structured data to match visible
   content — do not render one without the other.
5. **Keep the hero `<img>` src identical to the `<link rel="preload">`** in
   `index.html`, including the `w=` parameter, or the preload is wasted and the
   browser fetches the image twice.
6. **noindex vs robots.txt are not interchangeable.** A page blocked in
   `robots.txt` is never fetched, so its `noindex` is never read and it can
   still be indexed from inbound links. Use `noindex` for pages you want
   *removed* from the index; use `robots.txt` only for pages you do not want
   *fetched* at all.

## AI crawler policy

`robots.txt` names each AI crawler explicitly and allows it, so the decision is
visible rather than implied. To opt out of a specific company, change its
`Allow: /` to `Disallow: /`. Note that `Google-Extended` controls Gemini/AI
Overviews only — blocking it does not affect normal Search ranking.

**It is generated, not a file in `public/`.** Edit `buildRobotsTxt()` in
`src/lib/seo.ts`. It used to be static, which meant a hardcoded hostname in its
`Sitemap:` line, and that line went on pointing every crawler at the old
vercel.app sitemap long after the move. Building it from `SITE_URL` alongside
`sitemap.xml` and `llms.txt` makes that drift impossible.

`llms.txt` is a plain-text brief for answer engines: what Questivo is, which
exams it covers, and a set of self-contained facts safe to quote.

`LLMS_FACTS` and `FAQS` are held to a higher bar than marketing copy. A
generative engine repeats them to a candidate as fact, with Questivo's name on
them and no way for the reader to check. One of them — "Questivo generates new
questions rather than reusing previous-year papers" — was true when written and
became false the day the PYQ archive shipped, and it sat there contradicting the
site's own homepage. **A claim in those two arrays that stops being true is a
bug, not stale copy.**

## Verifying a deploy

```bash
curl -s https://questivo.sutradharlabs.me/ | grep -c "Previous year papers"
```

Should return `1` or more. `0` means the prerender step did not run and the site
is back to shipping an empty shell — check that the build ran `npm run build`
and not just `vite build`.

```bash
curl -s https://questivo.sutradharlabs.me/pyq | grep -o "<title>.*</title>"
```

```bash
curl -sI https://questivo.vercel.app/ | grep -iE "^(HTTP|location)"
```

Should be `308` to `questivo.sutradharlabs.me`. A `200` means the duplicate copy
of the site is live again.

```bash
curl -s https://questivo.sutradharlabs.me/sitemap.xml | grep -c vercel.app
```

Must be `0`. Anything else means `SITE_URL` regressed.

## Competitor benchmark

Measured directly from the ten sites that rank for Questivo's keywords
(homepages unless noted):

| Site | llms.txt | Schema on exam pages | Notes |
|---|---|---|---|
| Testbook | no | FAQPage, BreadcrumbList, Product, AggregateRating, Review | `/ssc-cgl-exam`: **8,776 words, 17 tables, 745 internal links, 50 headings (19 question-form)** |
| Adda247 | **yes** | Course, CourseInstance, FAQPage, SoftwareApplication, Offer | llms.txt is 50KB — one `[title](url): description` line per page, 185 sections |
| Oliveboard | **yes** | none | 1,345 internal links on the homepage |
| Vedantu | **yes** | none | 3,395 words, 1,070 internal links |
| Unacademy | **yes** | Course, ItemList, WebSite/SearchAction | JS-rendered; only 299 words in raw HTML |
| BYJU'S | no | MobileApplication, AggregateRating, MathSolver | **186 sitemaps** listed in robots.txt |
| PhysicsWallah | no | none | 2,060 words |
| PracticeMock | no | none | 366 internal links |
| Embibe | no | none | 511 words, no structured data at all |
| Doubtnut | no | Article, WebPage | now redirects to allen.in |

What this implies, and what was adopted:

1. **Homepages are nobody's ranking asset.** Traffic sits on per-exam pages.
   Questivo had none — this was the single biggest gap, now closed with
   `/mock-test/<slug>`.
2. **Question-phrased headings.** Testbook's top page uses 19. Questivo's exam
   pages now run 10–11 question headings out of 14–15.
3. **FAQPage + BreadcrumbList + Course** is the schema stack that ranks here.
   Adopted. `AggregateRating` was **not** adopted — Questivo has no review data
   and fabricating ratings invites a manual action.
4. **Dense internal linking.** Questivo's homepage exam cards were `<div onClick>`
   and uncrawlable; they are now real links. Homepage internal links went from
   ~11 (mostly dead `href="#"`) to 27.
5. **4 of 10 already ship `llms.txt`** — it is becoming standard in this
   vertical, not an experiment. Questivo's is now generated from the route table.
6. **Nobody names AI crawlers in robots.txt.** All ten leave them to the
   wildcard. Questivo's explicit allow-list is a differentiator, not a risk.
7. **Not adopted: the year in titles.** Competitors use "2026", which helps CTR
   but only while somebody keeps it current. Nothing here re-runs on 1 January,
   and a stale year reads as an abandoned site.

## Known gaps

- **`/interviews` is `noindex`.** It redirects immediately into a random session
  id, so it has no stable content of its own. To rank for "AI mock interview",
  give it a real landing page that renders for visitors, then drop the
  `noindex` flag in `src/lib/seo.ts`.
- **No privacy policy or terms pages.** The footer links to them were removed
  because the routes do not exist. This is the most pressing gap on the list:
  Google AdSense is already embedded on the site and requires a privacy policy,
  and the app now takes email addresses, Google OAuth sign-in and uploaded
  resumes — so the policy has real content to describe. It was not written here
  because it is a legal commitment about data handling, not copy to be inferred
  from the codebase.
- **Exam pages are ~800 words; Testbook's equivalent is 8,776.** Closing that
  gap honestly means adding verified exam data (pattern, eligibility, important
  dates, previous-year analysis) via `officialFacts` — which needs someone who
  will keep it current each cycle. Do not close it by padding.
- **7 exams have pages**, though the app advertises 50+ categories. Each
  additional entry in `EXAMS` is a new indexable page; this is the cheapest
  remaining growth lever.
- **`/pyq` is one page for the whole archive.** It is indexable and carries
  `CollectionPage` + `LearningResource` schema, but the archive underneath it is
  a live query, so a crawler gets the heading and the `facts` block and nothing
  per-paper. The real prize is a page per exam-year — "JEE Advanced 2019 Paper 1
  with solutions" is a query with volume that Questivo can answer from data it
  already holds. That needs a route like `/pyq/<exam>/<year>` prerendered from
  the API at build time, which is a bigger change than this pass: the prerender
  step currently reads only static tables and would need to fetch.
- **`officialFacts` is still empty for every exam**, so no exam page states a
  marking scheme or pattern. Deliberate — see the accuracy policy — but it is
  the ceiling on how well those pages can rank.
