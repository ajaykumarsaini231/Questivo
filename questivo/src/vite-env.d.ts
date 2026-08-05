/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Origin the REST API is called on. LEAVE EMPTY.
   *
   * Empty means same-origin: the call goes to whichever host served the page,
   * and vercel.json rewrites /api/* on from there to the Render backend, so the
   * session cookie is set by that host and is first-party to it.
   *
   * It has to be empty rather than a hostname because one build answers on more
   * than one: questivo.sutradharlabs.me and questivo.vercel.app both serve it.
   * Any absolute origin written here is first-party on at most one of them and a
   * third-party cookie on the rest — which is login working on one hostname and
   * silently not sticking on the other.
   *   prod: (empty)
   *   dev:  (unset) — vite.config.ts proxies /api to VITE_DEV_API_TARGET
   *
   * Read only by lib/apiBase.ts. Read it anywhere else with `||` and the empty
   * value reads as absent and collapses to localhost.
   */
  readonly VITE_API_URL?: string

  /**
   * The canonical public origin, e.g. https://questivo.sutradharlabs.me.
   *
   * Feeds SITE_URL in lib/seo.ts, and through it every canonical, og:url,
   * sitemap entry, llms.txt link, JSON-LD @id and robots.txt Sitemap line.
   * Optional: omitted, seo.ts falls back to the production domain. Set it only
   * to move domains. It names the ONE host that should be indexed; the others
   * still serve the site, and their pages point here with rel=canonical.
   */
  readonly VITE_SITE_URL?: string

  /**
   * Backend origin for websockets, dialed DIRECTLY.
   *
   * The /api rewrite cannot carry a websocket upgrade, so the live interview
   * socket must bypass the proxy.
   *   prod: https://questivo.onrender.com
   *   dev:  http://localhost:4000
   */
  readonly VITE_SOCKET_URL?: string

  /** Where the dev proxy forwards /api. Build-time only, never shipped. */
  readonly VITE_DEV_API_TARGET?: string

  /** Google Sign-In client id for @react-oauth/google. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
