/** Runtime config from Vite env. No secrets in the repo; supplied per build. */
// The fallback points at the live Cloud Run backend so a Vercel deploy without
// VITE_API_BASE_URL set still lands on a real API rather than localhost. Local
// dev overrides it via `.env.local` (see `.env.example`).
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'https://rami-api.example.com/api/v1';

export const GOOGLE_MAPS_API_KEY: string =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '';
