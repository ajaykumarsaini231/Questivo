import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@ricky0123/vad-web', 'onnxruntime-web']
  },
  // Strip every console call and debugger statement from the shipped bundle.
  //
  // Header.tsx logged the whole /api/auth/me user object on every page load, so
  // anyone who opened DevTools on any page — their own or someone else's screen
  // over their shoulder — read the signed-in account's name, email and role out
  // of the console. That one is deleted at the source, but deleting call sites
  // one at a time only fixes the ones that exist today; the next debugging
  // console.log someone leaves in ships to production the same way.
  //
  // Dropped at build only. `vite dev` keeps every console call, because the
  // point is to keep debugging output out of the artefact strangers download,
  // not out of the developer's own terminal.
  esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : {},
  // Mirror the production setup: in prod, vercel.json rewrites /api/* to the
  // Render backend so the API is SAME-ORIGIN with the site. That matters for
  // auth — the session cookie is SameSite=None cross-site, which browsers now
  // block as a third-party cookie, so login "succeeded" but /api/auth/me still
  // returned 401. Proxying makes the cookie first-party and it just works.
  //
  // This proxy gives dev the same shape, so VITE_API_URL can point at the
  // frontend's own origin in both environments.
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
      // Live interview uses websockets, which need their own upgrade-aware entry.
      '/socket.io': {
        target: process.env.VITE_DEV_API_TARGET || 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Route-level splitting lives in App.tsx (React.lazy) and Vite derives
        // the rest from the import graph correctly — leave that alone.
        //
        // This only peels off React itself, which changes far less often than
        // app code, so returning visitors keep it cached across deploys.
        //
        // Returning a name for anything else actively hurts: an earlier version
        // returned 'vendor' for every unmatched node_modules id, which dragged
        // socket.io-client into the entry's preload set even though only a lazy
        // route imports it. Anything not named here must fall through to
        // undefined so Vite keeps it in the chunk the graph says it belongs to.
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
            return 'vendor-react';
          }
          return undefined;
        },
      },
    },
    // The entry chunk should stay small now; warn early if that regresses.
    chunkSizeWarningLimit: 400,
  },
}));
