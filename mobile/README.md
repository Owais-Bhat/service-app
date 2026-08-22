# Networking Experts — Mobile App

Expo (React Native + TypeScript) client for the same backend the web app
(`server/index.cjs`) already serves. Talks to the real API — there is no
mock/fake data layer.

## Stack

- **Expo SDK 57**, TypeScript, New Architecture (default in this SDK).
- **Navigation:** `@react-navigation` (native-stack for the guest flow;
  role-based dashboards are a single screen each for now — see "Scope").
- **Live animated UI:** `react-native-reanimated` (entrance/pulse
  animations) + `@shopify/react-native-skia` (GPU-drawn gradient in
  `GlowButton`).
- **3D:** `three` via `@react-three/fiber/native` + `expo-gl` —
  `NetworkScene3D` is a real, live-rendered rotating node network, not a
  video loop or static image.
- **Auth:** `expo-secure-store` for the JWT (mirrors the web app's
  `localStorage.auth_token`, just in the OS keychain instead).

## Setup

```console
cd mobile
npm install
cp .env.example .env   # then set EXPO_PUBLIC_API_BASE_URL — see comments in the file
npx expo start
```

`EXPO_PUBLIC_API_BASE_URL` **must** point at a reachable backend origin —
unlike the web app, a phone can't fall back to `localhost`. Use your dev
machine's LAN IP for local testing on a physical device/emulator, or your
deployed domain for anything else.

## Backend contract

Every API call in `src/api/*.ts` mirrors an existing web-app code path
exactly — same endpoints, same request/response shapes, same edge cases:

- `src/api/auth.ts` → `POST /api/auth/signin`, `GET /api/auth/me`
  (`server/index.cjs`). **Client accounts are rejected by that endpoint**
  ("Client accounts cannot log in") — this is why the Client flow below
  never calls it.
- `src/api/inquiries.ts` → `GET`/`POST /api/data/inquiries`, the same
  public (no-auth) rules the landing page's ticket form and "Track
  Request" tab use (`dataAuth` in `server/index.cjs`): anyone can submit a
  new ticket, but reading one back requires the exact `ticket_no` **and**
  `phone` together (anti-enumeration).
- `src/api/employee.ts`, `src/api/admin.ts` → the generic
  `/api/data/:table` compatibility layer (`src/supabase.js`'s server-side
  counterpart), authenticated.

## Scope — what's real vs. what's a starting point

This is a working foundation, not full feature parity with the web app
(that's realistically weeks of work, not one pass). What's functionally
real right now:

- **Login** (employee/admin) — real JWT auth, session restore on relaunch.
- **Employee dashboard** — today's attendance status + assigned tickets,
  live from the API.
- **Admin dashboard** — employee count, open-ticket count, unassigned-ticket
  count, live from the API.
- **Client (guest) flow** — submit a new service request, and track an
  existing one by ticket number + phone. No login, matching how the
  backend actually treats clients.

Not yet built: employee clock-in/job-card/leaderboard screens, admin's
full ticket/staff/settings management, push notifications, offline
support. Each role's dashboard is intentionally a single screen for now;
`@react-navigation` is already wired so adding a tab/stack per role as
these screens are built is a small, additive change — see the comment in
`src/navigation/RootNavigator.tsx`.

## Project layout

```
src/
  api/           Backend calls — one file per domain, typed responses
  components/    NetworkScene3D (3D), AnimatedStatCard + GlowButton (2D animation)
  context/       AuthContext — session state, login/logout
  navigation/     RootNavigator — guest stack vs. role dashboards
  screens/       One file per screen
  theme/         Colors/typography matching the web app's dark theme
```
