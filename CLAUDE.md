# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

lpGym Buddy is a mobile-first workout log (exercises, sets, reps, weight per day). It is meant to be used from a phone browser and installed to the home screen as a full-screen PWA. It's a Vite + React 19 + TypeScript SPA, with a single Netlify Function as the API and Netlify Database (managed Postgres via `@netlify/database`) for storage.

## Commands

```sh
npm run dev         # netlify dev: frontend + functions + DB at http://localhost:8888 (needs a linked site with NETLIFY_DATABASE_URL)
npm run dev:ui      # Vite only; every /api call fails without netlify dev
npm run typecheck   # tsc for both projects: tsconfig.json (src, shared) and tsconfig.functions.json (netlify, shared)
npm run build       # typecheck, then vite build into dist/
node scripts/make-icons.mjs   # regenerate the PNG icons in public/ (dependency-free rasterizer; keep in sync with public/icon.svg)
```

There is no test suite and no linter. `npm run typecheck` is the correctness gate, and it is strict, with `noUnusedLocals` and `noUnusedParameters`. Deploys go through `netlify deploy --prod` or a Netlify-linked GitHub repo (config in `netlify.toml`).

## Architecture

**Three code roots, two tsconfigs.** `src/` is the browser app, `netlify/` is server code, and `shared/types.ts` holds the request and response shapes used by both. When you change an API payload, update `shared/types.ts`, the handler in `netlify/functions/api.ts` and the client in `src/lib/api.ts` together. Server code is typechecked without DOM-only React types (`types: []`), so don't import from `src/` there.

**One function, hand-rolled router.** `netlify/functions/api.ts` serves every `/api/*` route (`config.path`). The route table is in the comment at the top of the file, and `route()` dispatches on `resource/id/sub` path segments. Conventions:
- Validate every input with the `parseX()` helpers, which throw `HttpError(status, message)`. Those messages go straight to the user as toasts, so write them for the user.
- Any other error is logged and returned as a generic 500.
- Responses use `json()`, which sets `no-store`. Deletes return 204.
- SQL uses the `sql()` tagged template, or `query(text, params)` for plain-text queries (for example when the string is built from `SET_COLUMNS`). Columns are aliased to camelCase in SQL (`AS "exerciseId"`), and `numeric` weights are cast with `::float8` so they arrive as JS numbers.

**Schema via migrations.** SQL migrations in `netlify/database/migrations/` (Netlify Database, `@netlify/database`) are applied automatically on deploy, and locally with `npm run db:migrate`. Never edit an applied migration; add a new one (`npm run db:new`). `netlify/lib/db.ts` exposes `sql()` (tagged template) and `query(text, params)`.

**Accounts.** Email + password, implemented in `netlify/lib/auth.ts`: scrypt password hashes, a random session token in an HttpOnly `gb_session` cookie (the `sessions` table stores only its SHA-256), sliding 180-day sessions, and a per-email limit on failed sign-ins. `/api/auth/*` is the only part of the API that works signed out. Every other handler gets `uid` from `requireUser()` and must scope every query to it: `exercises`, `workouts` and `routines` have a `user_id`, and `sets`, `routine_workouts` and `routine_workout_exercises` belong to a user through those, so join to the owning table. Any id that arrives in a request body, such as an `exerciseId`, must also be checked for ownership. Rows with `user_id NULL` predate accounts and are claimed by the first sign-up. On the client, any 401 outside `/auth/` fires `onSignedOut` (`src/lib/api.ts`), and `App.tsx` then shows `AuthScreen`.

**Data model.** There is one `workouts` row per user per calendar day (unique `(user_id, performed_on)`). It is created implicitly by the upsert CTE in `createSet`, and the API never creates or deletes workouts directly. Each `sets` row references a workout and an exercise, both `ON DELETE CASCADE`. Exercise names are unique case-insensitively (`lower(name)` index). `POST /exercises` returns the existing row on a name conflict instead of an error.

**Dates are local-day strings.** Days are always `"YYYY-MM-DD"` in the user's local time. Use the helpers in `src/lib/dates.ts` (`todayISO`, `fromISO`, `shiftDate`). Don't use `new Date("YYYY-MM-DD")` or `toISOString()`, which shift days in UTC.

**Frontend state.** There is no router and no state library:
- `App.tsx` owns the tab, the selected date, the unit (lb/kg, persisted to localStorage by `useUnit`) and the `ExerciseDetail` overlay.
- Screens fetch their own data with `useLoad(fn, deps)` from `src/lib/hooks.ts`, which returns `{ data, setData, error, reload }`. They update `setData` optimistically or locally after mutations.
- The `.view` is keyed on `tab` + a `refresh` counter, so bumping `refresh` remounts the screen and refetches. This is how cross-screen invalidation works, for example after deleting an exercise.
- Errors from mutations go through `toast(errorMessage(e))` (`src/lib/toast.ts`, a window CustomEvent bus rendered by `Toaster` in `App.tsx`).

**Back-button handling.** Overlays and sheets call `useBackToClose(onClose)`, which pushes a history entry so the phone's Back gesture closes the overlay instead of leaving the app. That's why `main.tsx` deliberately does not use `<StrictMode>`: its double-run effects would break the push/pop pairing. Don't add it.

**Mobile/PWA styling.** All styles are in `src/styles.css`, with design tokens as CSS variables on `:root`. The theme is dark-only. The page itself never scrolls (each screen scrolls internally), and layout respects `env(safe-area-inset-*)`. PWA metadata is in `index.html` and `public/manifest.webmanifest`.

## Caveats

- There's no password reset or email verification yet. Both need an email-sending service.
