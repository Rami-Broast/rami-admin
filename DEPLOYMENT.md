# Deployment

The admin app is a Vite SPA deployed on Vercel. It is a pure client of the
backend API — it holds no business logic and computes no payable amounts.

## Environment

Set in the Vercel project (Settings → Environment Variables), baked in at build
time (Vite), so a change requires a redeploy:

- `VITE_API_BASE_URL` — the backend API base, e.g.
  `https://<cloud-run-service>-<hash>.a.run.app/api/v1`
- `VITE_GOOGLE_MAPS_API_KEY` — Google Maps JS key (Live Ops / Deliveries maps).

## Backend

The backend runs on Google Cloud Run (region `me-central1`) with Cloud SQL for
PostgreSQL and Secret Manager. Its allowed CORS origins must include this app's
Vercel URL (`CORS_ALLOWED_ORIGINS` on the Cloud Run service). Auth is JWT; the
demo customer OTP is the fixed `123456` while `NODE_ENV=staging`.
