# Rami Broast — Admin app

Web dashboard for the restaurant owner and branch staff. One app, two
role-based views: the backend decides what each role may see, so branch
isolation is enforced server-side, never by hiding a control here.

Delivery is the focus. This app is where staff run the live delivery board,
assign drivers, watch drivers and destinations move on a Google map, work the
kitchen queue, and turn **delivery / pickup on and off per branch**.

## Stack

- Vite + React 18 + TypeScript (strict, `noUncheckedIndexedAccess`)
- React Router 6
- `@vis.gl/react-google-maps` for the live map
- Vitest + Testing Library

## Running

```bash
npm install
cp .env.example .env      # then fill in the values
npm run dev
```

### Environment

| Variable | What it is |
| --- | --- |
| `VITE_API_BASE_URL` | Base URL of the backend API. |
| `VITE_GOOGLE_MAPS_API_KEY` | Browser Google Maps key. **A secret — supplied per environment, never committed.** |

Without a maps key the delivery board still works; the map panel shows a
"Map unavailable" notice instead of pins. No key is ever baked into the repo.

## Scripts

| Script | |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest |

## Layout

- `src/api/` — HTTP client (backend error envelope) + typed endpoints.
- `src/auth/` — token in `localStorage`, `useAuth` gives pages the `ApiClient`.
- `src/pages/` — Deliveries (live board + map), Orders (kitchen queue),
  Branch settings (delivery/pickup/COD toggles + fees).
- `src/components/` — `MapPanel` (Google map with graceful no-key fallback),
  small UI primitives.
- `src/theme/` — brand tokens (magenta `#E5178B`, orange, blue) as CSS vars,
  `prefers-reduced-motion` respected.

## Rules this app obeys

- **Displays** totals; never computes a payable amount. Prices and VAT come
  from the backend.
- **Client success is never proof of payment** — payment state is whatever the
  server reports.
- Every branch-scoped view is filtered server-side; this UI cannot widen it.
