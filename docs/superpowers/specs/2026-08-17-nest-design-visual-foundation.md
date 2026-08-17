# NEST Design — Visual Foundation (Phase 1) — Design

Date: 2026-08-17
Status: Approved for planning

## 1. Purpose

The user supplied a complete, high-fidelity mobile design (`NEST Technician App.dc.html`, from a Claude Design project) covering three app modes — Landing, Technician, Admin — across ~20 screens. Decision: **adopt this design exactly**, superseding the "Aurora Deep" glass system built in the prior phase (`docs/superpowers/specs/2026-08-13-mobile-liquid-glass-design-system-design.md`).

This spec covers **phase 1 only**: extract NEST's design language (tokens, fonts, background, card materials, tab-bar chrome, buttons) into reusable mobile components and a real theme system, then re-skin the 5 screens that already exist. It does **not** build any of NEST's new screens (Tasks, Attendance, Job Tools, Earnings, Admin Tickets/Team/Finance, etc.) — that's phase 3 per the phase breakdown agreed with the user:

1. Visual foundation (this spec)
2. Landing + role routing
3. Technician app screens
4. Admin app screens
5. Remaining web-only features NEST doesn't cover (AI Assistant, Discounts, Dashboard Widgets, Collections, per-role Device Tracking)

## 2. Source of truth

All values below are copied directly from the NEST design file's `DARK_TOKENS`/`LIGHT_TOKENS`/`CAT`/`STATUS_STYLE` objects and inline styles — this is a translation task, not a fresh design exercise. Where CSS has no direct React Native equivalent, §5 documents the translation decision.

### Color tokens

| Token | Dark | Light |
|---|---|---|
| `bg` | `#06100b` | `#eef3ef` |
| `surface` | `rgba(22,38,31,0.62)` | `rgba(255,255,255,0.68)` |
| `surfaceStrong` | `rgba(20,34,28,0.86)` | `rgba(255,255,255,0.9)` |
| `border` | `rgba(255,255,255,0.14)` | `rgba(16,50,36,0.12)` |
| `text` | `#e9f1ec` | `#0e1d16` |
| `text2` | `#a3b6ad` | `#41584d` |
| `text3` | `#6d8278` | `#7a8d84` |
| `line` | `rgba(255,255,255,0.09)` | `rgba(16,50,36,0.1)` |
| `panel2` | `rgba(255,255,255,0.06)` | `rgba(16,50,36,0.05)` |
| `meshOp` / `meshOp2` / `meshOp3` | `0.28` / `0.2` / `0.16` | `0.1` / `0.08` / `0.06` |
| `neuLight` | `rgba(255,255,255,0.04)` | `rgba(255,255,255,0.9)` |
| `neuDark` | `rgba(0,20,12,0.5)` | `rgba(163,182,173,0.45)` |

Brand green (mode-independent): `#15a05a` → `#0f8a4c` (buttons, primary gradient), `#0c6f3d` (avatar-chip gradient end). Danger: `#f0556d`.

Category colors: CCTV `#15a05a`, Networking `#0ea5a5`, Biometric `#7c5cfc`, VDP `#6366f1`, Gate Automation `#e08a14` (each with a `rgba(…,0.16)` background tint).

Status colors: open `#2e9bff`, assigned `#7c5cfc`, progress `#e08a14`, resolved `#15a05a` (each with a `rgba(…,0.14–0.16)` background tint).

### Typography

- **Space Grotesk** (500/600/700) — brand wordmark, screen titles, big numbers (money, stats, timer)
- **Manrope** (400/500/600/700/800) — body text, the default face
- **JetBrains Mono** (500/700) — ticket IDs, money amounts, clock time

### Radii

Hero/surface cards: 22–24px. Panel rows: 14–20px. Buttons/inputs/icon chips: 11–16px. Tab bar container: 26px. Avatars: 50% (circular) or 11–14px (squircle chips).

## 3. Materials

Two card tiers, matching NEST's own distinction:

- **`GlassCard`** (maps to NEST's `--surface`) — blurred hero-style container: real backdrop blur, `border` token, `borderRadius` 22–24. Used for hero panels (task detail header, attendance clock card, profile header, KPI cards). Optional drop shadow (`0 14px 34px -18px rgba(0,0,0,0.5)`) — NEST applies this selectively (e.g. task list rows), not universally, so it's an opt-in prop, not baked into every card.
- **`Panel`** (new — maps to NEST's `--panel2`) — flat, unblurred container: `panel2` fill, `line` border, `borderRadius` 14–20. Used for list rows, secondary info blocks. This tier didn't exist in the Aurora Deep system (which only had one card tier); NEST consistently uses two.

## 4. Mesh-blob background

Three blurred floating circles over the base `bg` color, replacing `AuroraBackground`'s Skia radial gradients:

- Blob 1: 220px, green (`meshOp`), top-left, 20s float
- Blob 2: 200px, teal (`meshOp2`), upper-right, 24s float, -6s delay
- Blob 3: 180px, indigo (`meshOp3`), lower-left, 26s float, -11s delay

Float animation: ping-pong between `translate(0,0) scale(1)` and `translate(4%,5%) scale(1.15)`, ease-in-out, alternating infinite. `prefers-reduced-motion` disables it in the source — the RN equivalent is checking `AccessibilityInfo.isReduceMotionEnabled()` and skipping the `withRepeat` loop (holding position 0) when true.

## 5. React Native translation decisions

1. **Fonts** — not on-device by default. Add `@expo-google-fonts/space-grotesk`, `@expo-google-fonts/manrope`, `@expo-google-fonts/jetbrains-mono` (3 new dependencies), loaded via `expo-font`'s `useFonts` at app root, with a loading gate (render nothing / splash until loaded).

2. **Self-blurred blobs** — CSS `filter: blur(50px)` blurs the shape's own edges, which `expo-blur` (a *backdrop* blur) can't do. Render each blob as a Skia `Circle` with a `BlurMask` paint effect — Skia's self-blur primitive, same library already used for `AccentOrb`/`GlowButton`/current `AuroraBackground`, just a different Skia feature.

3. **Neumorphic tab bar** — RN has no multi-shadow or inset-shadow support on a single `View`. Approximation: one outer drop shadow on the bar container (close enough to the dual light/dark neumorphic shadow — the light component is barely visible at these opacities anyway), and a solid two-tone fill instead of a true inset shadow for the active icon's "pressed" circle. Documented simplification, confirmed with the user.

4. **Theme switching** — today's `theme/index.ts` exports a static `colors` object; every existing component (`GlassCard`, `GlassSurface`, `AccentOrb`, `GlowButton`, `AnimatedStatCard`, `GlassTabBar`, `MoreSheet`, all 5 screens) imports it directly. This phase replaces that with a `ThemeProvider` (React Context) exposing `{ theme, mode, toggleTheme }`, backed by the token tables in §2. Default mode follows `useColorScheme()` (system setting) on first launch; the user's explicit choice (once Settings ships in phase 3) is persisted via `AsyncStorage` (already a dependency) and overrides the system default thereafter. **Every existing component that currently does `import { colors } from '../theme'` is migrated to `const { theme } = useTheme()`** — this is a mechanical but real refactor touching every file from the prior phase.

## 6. Component changes

| Component | Change |
|---|---|
| `ThemeProvider` / `useTheme()` (new) | React Context wrapping the app; see §5.4 |
| `theme/tokens.ts` (new) | `DARK_TOKENS` / `LIGHT_TOKENS` objects per §2, plus category/status color maps |
| `MeshBackground` (replaces `AuroraBackground`) | Skia `BlurMask` blobs per §4 |
| `GlassCard` (restyled) | NEST `--surface` treatment per §3; reads from `useTheme()` instead of static `colors` |
| `Panel` (new) | NEST `--panel2` treatment per §3 |
| `GlassTabBar` (restyled) | Neumorphic chrome per §5.3; stays generic/config-driven — still takes `{ items, activeKey, onSelect }`, so phase 3's real tab configs plug in without touching this component again |
| `MoreSheet` (restyled) | `surfaceStrong` blur treatment matching NEST's role-sheet/sidebar-drawer look (rounded top corners, grabber, blur 30-equivalent) |
| `GlowButton` (restyled) | Gradient becomes `#15a05a → #0f8a4c` (was green→violet from Aurora Deep) |
| `AccentOrb` | **Dropped from card usage.** NEST's KPI/stat cards use a plain icon chip (colored rounded-square, line-icon), not a floating 3D orb — that motif doesn't exist in NEST's language. The component itself stays in the codebase (valid Skia technique, e.g. NEST's own conic-gradient course-progress rings use a related approach) but `AnimatedStatCard` stops rendering it. |
| `AnimatedStatCard` (restyled) | Icon chip instead of `AccentOrb`; glass/panel treatment per §3; springs unchanged from prior phase |

## 7. Screens touched

All 5 existing screens (`LoginScreen`, `ClientSubmitTicketScreen`, `ClientTrackTicketScreen`, `EmployeeDashboardScreen`, `AdminDashboardScreen`) get re-skinned with the components in §6 — new fonts, mesh background, card/panel materials, restyled buttons and tab bar. **No structural/content changes in this phase** — the 2-tab "Dashboard/More" shell keeps its current tabs, just NEST's visual chrome. Phase 3 replaces the tab content and count.

## 8. Dependencies

Three new packages: `@expo-google-fonts/space-grotesk`, `@expo-google-fonts/manrope`, `@expo-google-fonts/jetbrains-mono`, plus `expo-font` (commonly bundled with Expo SDK already — verify during implementation). No other new packages; `expo-blur`, `react-native-skia`, `react-native-reanimated` are already present from phase 1 of the prior spec.

## 9. Explicitly out of scope for this phase

- Any of NEST's new screens (Tasks, Attendance, Job Tools, Earnings, Leaderboard, Training, Tutorials, Notifications, Settings UI, Admin Tickets/Auto-Assignment/Team/Finance/More, Landing page, role-picker sheet) — phases 2–4.
- Backend work for features NEST introduces that don't exist yet (Estimator, Device Follow-up, EOD Reports, Earnings/Cash/Collections/Salary, Auto-Assignment matching) — phase 3/4, and only once each screen is actually being built.
- Web-app features NEST doesn't cover (AI Assistant, Discounts, Dashboard Widgets, Collections, per-role Device Tracking split) — phase 5.
- Pixel-perfect neumorphic shadows — approximated per §5.3.
