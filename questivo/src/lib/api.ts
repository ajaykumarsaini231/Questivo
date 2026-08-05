

// src/lib/api.ts
import axios from 'axios';

import { API_BASE } from './apiBase';

const API_URL = `${API_BASE}/api/admin`;

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // <--- THIS IS THE MOST IMPORTANT LINE
});

export const handleApiError = (error: any) => {
  const message = error.response?.data?.message || error.response?.data?.error || "An error occurred";
  return message;
};