# Mobile App — Liquid Glass Design System (Pilot) — Design

Date: 2026-08-13
Status: Approved for planning

## 1. Purpose

The mobile app (`mobile/`) has 5 screens today (Login, Client Submit
Ticket, Client Track Ticket, Employee Dashboard, Admin Dashboard) against
a web app (`src/pages/`) with ~18 feature areas (admin, admin-notices,
ai-assistant, client, collections, dashboard-widgets, device-tracking,
discounts, employee, finance, job-cards, media-training, notifications,
profile, stats, training). Closing that feature gap is the larger goal,
but it's too much to design and build as one project.

This spec covers **phase 1 only**: a "liquid glass" visual design system —
Apple-style translucent materials, spring-driven motion, and 3D accents —
built and proven on the 5 screens that exist today. It establishes the
reusable components, tokens, and navigation shell that phase 2 (feature
parity, one web section at a time) will build on. No new business features
ship in this phase.

## 2. Visual direction

Chosen via visual mockup review (three directions compared): **Aurora
Deep** — a dark background with green/violet/cyan glass blooms, extending
the app's existing brand green (`#2bbf73`) rather than replacing it.

### Tokens

Additive to `mobile/src/theme/index.ts` — nothing existing is removed or
renamed, so current screens keep compiling unchanged during the port.

| Token | Value | Use |
|---|---|---|
| `bg` | `#06100b` | Base background (existing, unchanged) |
| `auroraViolet` | `#2a1f4d` | Background bloom, top-right |
| `auroraNavy` | `#0a1030` | Background bloom, mid |
| `primary` / `primaryDim` | `#2bbf73` / `#1c8a53` | Brand green (existing, unchanged) |
| `accentViolet` | `#6a5cff` | 3D accent orbs, secondary glow |
| `accentCyan` | `#22d3ee` | 3D accent orbs, tertiary glow |
| `glassFill` | `rgba(30,25,55,0.4)` | Glass surface tint |
| `glassBorder` | `rgba(255,255,255,0.12)` | Glass edge |
| `glassHighlight` | `rgba(255,255,255,0.16)` | Top inner-edge catch-light |
| `text` / `textDim` | `#eaf5ee` / `#8fa79a` | Existing, unchanged |

Radius scale (`sm 8 / md 14 / lg 22 / full 999`) is reused as-is; glass
cards use `lg`, floating chrome (tab bar, sheets) uses `full`-ish large
radii.

Typography keeps the system font (no custom face). Per Apple's optical-type
guidance: large titles get tightened tracking (`-0.02em`) and tighter
leading; body text stays near `0` tracking with looser leading. This is a
small adjustment to the existing `typography` scale in `theme/index.ts`,
not a rewrite.

## 3. Motion rules

Applies to every component, not per-screen:

- Default transitions are critically-damped springs (`damping 1.0`, no
  overshoot) — tab switches, card mounts, sheet open/close.
- Bounce (`damping ~0.8`) only on gesture-driven motion (dragging the More
  sheet, swiping between tickets) — never on something that just faded in.
- Every touchable responds on press-down (subtle scale, ~0.97), never only
  on release.
- Sheets/drawers must be draggable-to-dismiss and interruptible mid-flight
  — grabbing a closing sheet must follow the finger, not finish closing
  first.

`mobile/src/theme/motion.ts` is a new module exporting the shared spring
presets (move/reposition, drawer, rotation — matching the apple-design
reference table) so every component pulls from one source instead of each
inventing its own timing.

## 4. New components (`mobile/src/components/`)

| Component | What it does |
|---|---|
| `AuroraBackground.tsx` | Skia radial-gradient blooms (green/violet/cyan over near-black). Replaces the flat `colors.bg` fill behind every screen so the app reads as one continuous material. |
| `GlassCard.tsx` | `expo-blur` `BlurView` + `glassFill` tint + `glassBorder`/`glassHighlight` edges. The standard card / list-row / form container going forward. |
| `GlassSurface.tsx` | Heavier-blur variant for floating chrome — tab bar, sheets, modals. |
| `AccentOrb.tsx` | The "3D accent" decoration for dashboard cards. **Implemented in Skia** (shader-drawn conic gradient + specular highlight, tilt driven by a Reanimated value) — **not** a real `three.js` `Canvas` per card. Mounting a separate WebGL context per visible card would hurt performance and risks crashes on lower-end Android once a screen has several cards on it at once. |
| `GlassTabBar.tsx` | Floating glass bottom tab bar. Generic and config-driven (`{ icon, label, route }[]`) — not hardcoded per role, so phase 2 can add tabs without touching this component. |
| `MoreSheet.tsx` | The "More" destination for the hybrid nav pattern — a glass grid sheet, draggable-to-dismiss per §3. |

`GlowButton.tsx` gets a small restyle (gradient shifts from green-only to
green→violet) to match Aurora. Its existing Skia (gradient) + Reanimated
(pulse) split is already the right pattern and isn't changed structurally.

`NetworkScene3D.tsx` (the real `three.js` scene) is unchanged and stays
the **only** live WebGL canvas in the app, on the login screen.

## 5. Navigation

Confirmed via visual mockup review: **hybrid** — a small set of tab-bar
destinations plus a "More" sheet for everything else, rather than a plain
5-icon tab bar (too few slots for ~13 admin sections eventually) or a
side drawer (buries everything one tap deeper).

Current `RootNavigator.tsx` behavior: guest flow (Login → Submit/Track
Ticket) is a native stack with slide transitions; each signed-in role
renders a single dashboard directly, with a code comment already
anticipating growth ("add one per role as each grows past a single
screen").

**This phase's nav changes:**

- **Guest flow (Submit/Track Ticket) stays a native stack**, not tabs.
  It's a one-directional task (pick one, do it, go back), not a
  persistent switcher — forcing tabs here would fight the UX rather than
  help it. It gets the visual glass treatment (`AuroraBackground`,
  `GlassCard`) but no navigation restructuring.
- **Employee and Admin dashboards each get `GlassTabBar` with two tabs:
  "Dashboard" and "More."** Neither role has a second real screen yet, so
  rather than leave the hybrid-nav decision unproven, "More" opens
  `MoreSheet` listing the web app's other sections for that role (Job
  Cards, Finance, Discounts, Device Tracking, etc.) as rows in an explicit
  "Coming soon" state — a complete, working nav shell, not a half-built
  feature. Phase 2 fills it in by swapping "Coming soon" rows for real
  routes one at a time, without touching `GlassTabBar` itself.

## 6. Screen-by-screen changes

- **`LoginScreen.tsx`** — `AuroraBackground` behind the existing
  `NetworkScene3D` orb; the form wrapped in `GlassCard`; `GlowButton`
  restyled.
- **`ClientSubmitTicketScreen.tsx`, `ClientTrackTicketScreen.tsx`** —
  `AuroraBackground` + `GlassCard` around forms/results. Navigation
  unchanged (native stack, per §5).
- **`EmployeeDashboardScreen.tsx`, `AdminDashboardScreen.tsx`** —
  `AuroraBackground`; existing stat/summary cards become `GlassCard` with
  an `AccentOrb` per card (the main showcase of the 3D-accent direction);
  gains `GlassTabBar` + `MoreSheet` per §5.

## 7. Dependencies

One new package: `expo-blur` (native `BlurView`, real backdrop blur on
iOS and Android — the difference between genuine "liquid glass" and a
flat translucent box). Everything else needed (`react-native-skia`,
`react-native-reanimated`, `three`/`@react-three/fiber`/`expo-gl`,
`expo-linear-gradient`) is already in `mobile/package.json`.

## 8. Explicitly out of scope for this phase

- **Any new business feature or web-app section** (job cards, finance,
  discounts, device tracking, training, media-training, ai-assistant,
  collections, notifications, profile, stats, admin-notices,
  dashboard-widgets). These are phase 2+, one at a time, each through its
  own brainstorm → spec → plan cycle once this design system is in place.
- **Real per-card `three.js` 3D** — deliberately replaced with Skia
  pseudo-3D orbs (§4) for performance; `NetworkScene3D` remains the one
  true 3D scene.
- **Tabs/nav restructuring for the guest (client) flow** — stays a native
  stack (§5).
- **Design changes to the web app** (`src/pages/`) — this phase is mobile
  (`mobile/`) only; the web app is the source of truth for future feature
  parity but isn't itself being redesigned here.
