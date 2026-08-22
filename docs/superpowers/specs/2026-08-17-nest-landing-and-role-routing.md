# NEST Landing + Role Routing (Phase 2) — Design

Date: 2026-08-17
Status: Approved for planning

## 1. Purpose

Phase 1 (visual foundation) re-skinned the app's existing 5 screens but changed no navigation structure — the app still opens straight to the staff login form, with client self-service (Submit/Track Ticket) reachable only via text links on that screen. This phase adds NEST's **Landing** screen as the real entry point, matching the design's actual information architecture: a public marketing/self-service front door, with staff login as a secondary path from it.

## 2. Branding decision

Per user direction: mobile app **display text** adopts NEST's branding (wordmark, headers) going forward. This is cosmetic only — ticket number prefixes (`NE-...`, server-generated), the web app, and the business email domain (`networkingexperts.in`) are unchanged and out of scope. Concretely:

- New `LandingScreen` uses "NEST" as the wordmark.
- Existing `LoginScreen`'s brand text changes from "Networking Experts" to "NEST" (Phase 1 shipped the old text; this phase updates it for consistency — everything else on that screen is unchanged).
- Ticket-number placeholder text (`ClientTrackTicketScreen`'s "e.g. NE-260812-1234") **stays as-is** — it documents the real, unchanged server-generated format, not the app's display branding.

## 3. Auth reconciliation

The NEST design's landing page has a "Continue as staff" bottom sheet with separate **Technician** / **Admin** buttons — in the prototype these just switch a mock `appMode` flag with no real authentication. That doesn't translate to a real app: role isn't something a user picks, it's determined server-side by who they authenticate as. So the sheet is **dropped**: tapping "Staff Login" on Landing navigates straight to the existing `LoginScreen` (real email/password auth); after signing in, `RootNavigator`'s existing role check (`user.role === 'admin' ? Admin : Employee`) routes them exactly as it does today. No new navigation concept, just a new front door in front of the existing one.

## 4. Screen content (from the NEST design file, verbatim except branding)

- **Header**: brand chip ("N" monogram, brand gradient) + "NEST" wordmark, "Staff Login" button (top-right, `Panel`-styled pill)
- **Badge**: "Resolved in 12 hours, guaranteed" (green-tinted pill)
- **Headline**: "Reliable CCTV, Networking & Access Control" (title-scale, `SpaceGrotesk_700Bold`)
- **Subcopy**: "Installation, service & AMC for CCTV, networking, biometric access and gate automation — one call away."
- **Primary CTA**: "Raise a Service Request" (`GlowButton`, full width) → navigates to `SubmitTicket`
- **Secondary CTA**: "Track Your Ticket" (`Panel`-styled full-width button) → navigates to `TrackTicket`
- **Stats row**: 4.8★ Rated / 500+ Installs / 12hr SLA, inside a `Panel`
- **Services grid**: "Our Services" label + 2-column grid of 5 rows (CCTV, Networking, Biometric & Access, Gate Automation, VDP Installation), each a `Panel` row with a small colored icon chip. Colors come straight from `theme/tokens.ts`'s existing `categoryColors` (already has all 5 categories — no new tokens needed) and are informational only, no `onPress`.

## 5. Navigation changes

`RootNavigator.tsx`'s `GuestStack` gets a new initial route:

```
Landing (new, initial) → Login (via "Staff Login")
Landing → SubmitTicket (via "Raise a Service Request")
Landing → TrackTicket (via "Track Your Ticket")
```

`LoginScreen` is no longer the stack root, so it needs a manual back link (matching the existing pattern already used in `ClientSubmitTicketScreen`/`ClientTrackTicketScreen`, since the whole guest stack runs with `headerShown: false`). Its now-redundant guest shortcut links ("Not staff? Submit a service request →" / "Track an existing request →") are removed — Landing is the real entry point for those now, and NEST's own staff-login screen doesn't have them either.

## 6. Component changes

No new reusable components beyond the screen itself — `GlassCard`... actually this screen doesn't need blur (NEST's landing background is the mesh, with flat `Panel` rows on top, no `--surface` glass cards), so it only needs `MeshBackground`, `Panel`, and `GlowButton`, all of which already exist from Phase 1.

| File | Change |
|---|---|
| `mobile/src/screens/LandingScreen.tsx` (new) | Content per §4 |
| `mobile/src/screens/LoginScreen.tsx` | Brand text → "NEST" (§2); add back link; remove guest shortcut links (§5) |
| `mobile/src/navigation/RootNavigator.tsx` | Add `Landing` route as new stack initial route (§5) |

## 7. Explicitly out of scope for this phase

- The Technician/Admin role-picker sheet concept (§3 — dropped, not translated)
- Any of NEST's Technician/Admin app screens — phases 3–4
- Ticket-number format, web app, or domain/email changes — never in scope for mobile work
- Making the services grid interactive (e.g. deep-linking into a category-filtered request form) — NEST's own design doesn't do this either; informational only
