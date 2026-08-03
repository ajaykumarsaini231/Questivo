import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@ricky0123/vad-web', 'onnxruntime-web']
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
});
