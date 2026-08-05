/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Origin the REST API is called on.
   *
   * Set to the FRONTEND's own origin, not the backend's. vercel.json rewrites
   * /api/* to the Render backend, so the API is same-origin with the site and
   * the session cookie stays first-party — browsers block it as a third-party
   * cookie otherwise, which made login appear to fail.
   *   prod: https://questivo.sutradharlabs.me
   *   dev:  http://localhost:5173   (vite.config.ts proxies /api)
   *
   * NOTE: production is currently set to https://questivo.onrender.com — the
   * backend directly, not the site's own origin. That defeats the reasoning
   * above: the session cookie is then third-party and depends on the browser
   * still allowing those.
   */
  readonly VITE_API_URL: string

  /**
   * The canonical public origin, e.g. https://questivo.sutradharlabs.me.
   *
   * Feeds SITE_URL in lib/seo.ts, and through it every canonical, og:url,
   * sitemap entry, llms.txt link, JSON-LD @id and robots.txt Sitemap line.
   * Optional: omitted, seo.ts falls back to the production domain. Set it only
   * to move domains — and update the redirect in vercel.json in the same change.
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
