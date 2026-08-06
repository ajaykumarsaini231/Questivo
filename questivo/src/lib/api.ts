// src/lib/api.ts
import axios from 'axios';
import type { AxiosInstance } from 'axios';

import { API_BASE } from './apiBase';
import { attachSessionInterceptors } from './authTransport';

/**
 * An axios client pointed at this app's API, carrying the session both ways.
 *
 * `withCredentials` sends the httpOnly cookie, which is the preferred carrier
 * and the only one on hosts where it survives. The interceptors add the bearer
 * token for the hosts where it does not, and store the token that comes back
 * from a sign-in. See session.ts.
 *
 * Five files had each built their own `axios.create({ baseURL: API_BASE,
 * withCredentials: true })`. They now share this, so a client that talks to
 * this API cannot be created without the session going with it.
 *
 * `prefix` is appended to the base — pass it for a client that only ever calls
 * one router, leave it off for one that spells out full "/api/..." paths.
 */
export function createApiClient(prefix = ''): AxiosInstance {
  return attachSessionInterceptors(
    axios.create({
      baseURL: `${API_BASE}${prefix}`,
      withCredentials: true, // <--- THIS IS THE MOST IMPORTANT LINE
    })
  );
}

/** The admin client. Its callers pass paths relative to /api/admin. */
export const api = createApiClient('/api/admin');

export const handleApiError = (error: any) => {
  const message = error.response?.data?.message || error.response?.data?.error || "An error occurred";
  return message;
};
