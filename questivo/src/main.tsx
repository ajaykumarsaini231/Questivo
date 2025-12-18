// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { GoogleOAuthProvider } from '@react-oauth/google';

// --- LOAD CLIENT ID FROM ENV ---
const GOOGLE_CLIENT_ID =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID) ||
  (typeof process !== "undefined" && (process.env as any).NEXT_PUBLIC_GOOGLE_CLIENT_ID) ||
  (typeof process !== "undefined" && (process.env as any).REACT_APP_GOOGLE_CLIENT_ID) ||
  ""; // Fallback to empty string if not found

if (!GOOGLE_CLIENT_ID) {
  console.error("Google Client ID is missing! Check your .env file.");
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>,
);