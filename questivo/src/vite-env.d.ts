/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Origin the REST API is called on.
   *
   * Set to the FRONTEND's own origin, not the backend's. vercel.json rewrites
   * /api/* to the Render backend, so the API is same-origin with the site and
   * the session cookie stays first-party — browsers block it as a third-party
   * cookie otherwise, which made login appear to fail.
   *   prod: https://questivo.vercel.app
   *   dev:  http://localhost:5173   (vite.config.ts proxies /api)
   */
  readonly VITE_API_URL: string

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
