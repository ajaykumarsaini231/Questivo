
// import { defineConfig } from "vite";
// import react from "@vitejs/plugin-react";

// export default defineConfig({
//   plugins: [react()],

//   optimizeDeps: {
//     exclude: [
//       "@ricky0123/vad-react",
//       "onnxruntime-web",
//     ],
//   },

//   worker: {
//     format: "es",
//   },
// });


import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@ricky0123/vad-web', 'onnxruntime-web']
  }
});