// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { installAuthTransport } from './lib/authTransport';

// Before the first render, so the /api/auth/me that every page fires on mount
// already carries the session. See lib/session.ts for why a header is needed
// alongside the cookie.
installAuthTransport();

// --- LOAD CLIENT ID FROM ENV ---
const GOOGLE_CLIENT_ID =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID) ||
  (typeof process !== "undefined" && (process.env as any).NEXT_PUBLIC_GOOGLE_CLIENT_ID) ||
  (typeof process !== "undefined" && (process.env as any).REACT_APP_GOOGLE_CLIENT_ID) ||
  ""; // Fallback to empty string if not found

if (!GOOGLE_CLIENT_ID) {
  console.error("Google Client ID is missing! Check your .env file.");
}

const container = document.getElementById('root')!;

const tree = (
  <React.StrictMode>
    {
      GOOGLE_CLIENT_ID ? (
        <GoogleOAuthProvider
          clientId={
            GOOGLE_CLIENT_ID
          }
        >
          <App />
        </GoogleOAuthProvider>
      ) : (
        <App />
      )
    }
  </React.StrictMode>
);

// Prerendered routes (see scripts/prerender.mjs) ship real markup inside #root,
// so adopt it instead of throwing it away — that keeps the first paint the
// browser already has and avoids a blank flash. Routes served through the SPA
// fallback have an empty container and mount normally.
if (container.firstElementChild) {
  ReactDOM.hydrateRoot(container, tree);
} else {
  ReactDOM.createRoot(container).render(tree);
}