

// src/lib/api.ts
import axios from 'axios';

const API_BASE =
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_URL) ||
    (typeof process !== "undefined" && (process.env as any).NEXT_PUBLIC_API_URL) ||
    (typeof process !== "undefined" && (process.env as any).REACT_APP_API_URL) ||
    "http://localhost:4000";
const API_URL = `${API_BASE}/api/admin`; 

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // <--- THIS IS THE MOST IMPORTANT LINE
});

export const handleApiError = (error: any) => {
  const message = error.response?.data?.message || error.response?.data?.error || "An error occurred";
  return message;
};