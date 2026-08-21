# Mobile Landing Screen — Liquid Glass Redesign + Feature Parity

**Status:** Approved, proceeding to implementation
**Date:** 2026-08-21
**Related:** [[project-technician-polish-phase]] (prior phase — technician-only scope; this phase extends to the client-facing landing screen)

## Context

The user shared a reference zip (`nest-liquid-glass-ui`) — a Lovable-built prototype ("NEST Portal — Liquid Glass") demonstrating a blurred-glass visual style (backdrop blur, translucent panels, gradient glow, staggered rise-in animation) for the same "Networking Experts" product. The ask: bring that visual language to the mobile app's landing screen, keep the app's existing NEST emerald color tokens (not the zip's teal/violet), and bring the landing screen to feature parity with what the web app's landing page (`src/pages/landing.js`) already does — which is significantly more than the current `mobile/src/screens/LandingScreen.tsx`.

Scope is **mobile app only**. Web app is unchanged. Other mobile screens (technician, admin) are unchanged in this phase.

## Deliverable 1 — Web feature inventory

A written catalogue of every page/feature in `src/pages/*` (web app), to serve as a standing reference for this and future mobile-parity phases. Produced alongside this spec (see `docs/` — written as a separate research artifact, not implementation).

## Deliverable 2 — Landing screen v2

### Screen structure — one screen, four tabs

A glass segmented tab bar (mirrors web's `.srf-mode-tab`) with four modes: **New Request**, **Track**, **Complaint**, **Installation**. The hero (headline, badge, stats row) and tab bar stay fixed above a swapping body card.

**New Request** and **Installation** share the same 3-step wizard the web app uses (`stepper`: Verify → OTP → Details) — confirmed from `src/pages/landing.js`:

1. **Verify** — phone number input + a client-side captcha (5 random letters, regenerable) as a bot-check. "Send OTP by SMS" calls `POST /api/otp/send { phone }`.
2. **OTP** — 6-digit code entry (auto-advancing boxes), "Verify code" calls `POST /api/otp/verify { phone, otp }`; "Resend code" calls `POST /api/otp/resend { phone }`.
3. **Details** —
   - *New Request*: issue dropdown (from `issueOptions`, sourced from `landing/bootstrap`'s `categories`) + optional description → submit.
   - *Installation*: instead of the issue dropdown, an install-type banner (picked in a prior grid step) with a "Change" affordance, same optional description → submit.

Installation's entry point is a grid of the 6 fixed types (ported verbatim from web's `INSTALL_TYPES`): CCTV Camera Installation, Networking & LAN Setup, WiFi/Access Point Setup, Biometric & Access Control, Video Door Phone/Intercom, Smart Home Automation — each with icon, tagline, and an "includes" list. Picking one moves into the same 3-step wizard as New Request, with `installType` set.

**Track** and **Complaint** are single-step forms, no OTP:
- *Track*: ticket number (optional) + phone → list/detail of matching tickets. Reuses `ClientTrackTicketScreen`'s existing `trackInquiry` logic, pulled inline as a tab body instead of a separate screen.
- *Complaint*: ticket number + phone + complaint text → submit. **New** — no existing mobile backend call. The web app's complaint-submission endpoint needs to be located (grep `src/` for the complaint POST target) during implementation and wired the same way.

Existing `ClientSubmitTicketScreen` currently submits directly via `submitInquiry` with **no OTP step** — this is a gap relative to web and gets replaced by the wizard above (OTP verification is being added, not already present on mobile).

### New components (`mobile/src/components/`)

- `TabSwitcher` — glass segmented control, reusable across the 4 modes.
- `StepWizard` / step indicator — mirrors web's Verify/OTP/Details progress bar.
- `AdCarousel` — banner ads (landing placement), auto-rotating, sourced from `landing/bootstrap`.
- `PopupAd` — modal for popup-placement ads, dismissible, respecting `popupEnabled`.
- `ThemeToggleButton` — sun/moon icon button in the header. The light/dark mechanism already exists in `ThemeContext`; only the UI control is missing.
- `ContactCard` — call + WhatsApp glass panel, `+91 88991 33144` (same as web's `SERVICE_CONTACT_PHONE`).
- `InstallTypeGrid` — the 6-card install-type picker described above.

### Data flow

New `mobile/src/api/landing.ts`, following the existing `api.get<T>()` / `api.post<T>()` pattern in `mobile/src/api/client.ts`:

- `GET /landing/bootstrap` → `{ ads, popupAds, popupEnabled, reopenButtonEnabled, reopenLimit, categories }`. Same backend endpoint the web app hits — no server changes needed. Ad filtering by `placement` (`landing` vs `popup_landing`), `target` (mobile vs desktop), and `starts_at`/`expires_at` date range gets ported from web's `filterAds()`.
- `POST /otp/send`, `POST /otp/verify`, `POST /otp/resend` — `{ phone }` / `{ phone, otp }`, same shape as web's `postPublicApi` calls.
- Complaint submission endpoint — TBD, to be located in web source during implementation.

### Visual style — full liquid glass (Option B, user-selected via mockup comparison)

- Swap flat `Panel` for blurred `GlassCard`-tier surfaces on: hero stats row, tab switcher, service grid, install-type grid, and form cards.
- Gradient glow on the primary CTA (extends the existing `GlowButton` treatment already used elsewhere in the app).
- Gradient-clipped text on the headline's second line.
- Staggered rise-in animation on load (Reanimated `withDelay` per section, mirroring the zip's `animate-rise` stagger) — consistent with the existing mesh/blob background (`MeshBackground`) and press-scale (`Pressable` + scale transform) patterns already in the codebase.
- All colors stay on the existing NEST emerald token set (`theme/tokens.ts`, `ThemeContext`) — no new palette introduced.

## Non-goals

- Not touching the web app.
- Not extending liquid-glass styling to technician/admin mobile screens in this phase.
- Not guaranteed to keep New Request/Track as physically separate screens — pulling their logic inline as tab bodies is the plan, but if that proves messier than expected during implementation, falling back to tab-tap-navigates-to-existing-screen is an acceptable adjustment.
