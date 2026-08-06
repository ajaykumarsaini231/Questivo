import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  SITE_URL,
  SITE_NAME,
  TWITTER_HANDLE,
  DEFAULT_OG_IMAGE,
  getRouteSeo,
  buildBreadcrumbs,
  buildExamJsonLd,
  getExamForPath,
  buildCityJsonLd,
  buildCollegeJsonLd,
  getCityForPath,
  getCollegeForPath,
} from "../lib/seo";

/**
 * Keeps <head> in sync with the current route.
 *
 * Tags are updated in place rather than appended. The prerendered HTML already
 * carries the correct tags for the entry URL, so on first paint this is a no-op;
 * it only does real work on client-side navigation. Appending instead of
 * updating would leave two <title> elements and the browser would keep the
 * stale one.
 */
function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

const BREADCRUMB_ID = "breadcrumb-jsonld";
const EXAM_JSONLD_ID = "exam-jsonld";
/** City and college graphs share one slot: no route is ever both. */
const GEO_JSONLD_ID = "geo-jsonld";

/** Replace a per-route JSON-LD block, removing any left over from the last route. */
function setJsonLd(id: string, data: unknown | null) {
  document.getElementById(id)?.remove();
  if (!data) return;
  const script = document.createElement("script");
  script.id = id;
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

export default function Seo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const route = getRouteSeo(pathname);
    // Dynamic segments (/tests/:id) fall back to the home entry, but their
    // canonical must not claim to be the homepage.
    const isKnown = route.path === pathname;
    const canonical = `${SITE_URL}${isKnown ? route.path : pathname}`;
    const image = route.ogImage ?? DEFAULT_OG_IMAGE;

    // An unknown path renders NotFoundPage, so the tab and any shared preview
    // should say so rather than inheriting the homepage's title.
    const isDynamic = /^\/(tests|interviews|admin|pyq)\//.test(pathname);
    const title = isKnown || isDynamic ? route.title : "Page not found | Questivo";
    const description =
      isKnown || isDynamic
        ? route.description
        : "This page doesn't exist. Browse Questivo's free AI mock tests by exam instead.";

    document.title = title;
    setMeta("name", "description", description);
    setMeta("name", "keywords", route.keywords);
    setLink("canonical", canonical);

    // Private/utility screens must never be indexed, and neither should the
    // dynamic per-session URLs, which are unique per user and have no value in
    // an index.
    setMeta(
      "name",
      "robots",
      route.noindex || !isKnown
        ? "noindex, nofollow"
        : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
    );

    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", SITE_NAME);
    setMeta("property", "og:url", canonical);
    setMeta("property", "og:title", route.title);
    setMeta("property", "og:description", route.description);
    setMeta("property", "og:image", image);
    setMeta("property", "og:locale", "en_IN");

    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:site", TWITTER_HANDLE);
    setMeta("name", "twitter:url", canonical);
    setMeta("name", "twitter:title", route.title);
    setMeta("name", "twitter:description", route.description);
    setMeta("name", "twitter:image", image);

    // These are per-route, so the previous route's graphs have to go.
    setJsonLd(BREADCRUMB_ID, isKnown ? buildBreadcrumbs(route) : null);
    const exam = getExamForPath(pathname);
    setJsonLd(EXAM_JSONLD_ID, exam ? buildExamJsonLd(exam) : null);

    // Geo pages carry a Service/areaServed or a college WebPage graph. Cleared
    // on every navigation for the same reason the exam graph is: a leftover
    // block would tell a crawler that the page it is now on serves a city it
    // has nothing to do with.
    const city = getCityForPath(pathname);
    const college = city ? undefined : getCollegeForPath(pathname);
    setJsonLd(
      GEO_JSONLD_ID,
      city ? buildCityJsonLd(city) : college ? buildCollegeJsonLd(college) : null
    );
  }, [pathname]);

  return null;
}
