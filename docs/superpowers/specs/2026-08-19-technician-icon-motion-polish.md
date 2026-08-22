# Technician App Icon & Motion Polish — Design

Date: 2026-08-19
Status: Approved for planning

## 1. Purpose

Replace every plain text-glyph icon (`←`, `›`, `★`, `●`/`○`, `✕`, "Show"/"Hide") across the technician-facing screens with real custom duotone icons, and add a consistent micro-animation "personality" — without redesigning NEST's existing dark-glass visual system. Also fixes one real security bug found while auditing: `LoginScreen`'s remember-me feature stores the password in plaintext.

Landing-page feature-parity work (logo image, neumorphic inputs, contact section, popup ads, installation booking flow) is explicitly a separate, later phase — see §6.

## 2. Decisions (from brainstorming)

- **Icon style: Duotone** — a soft tinted chip background (`rgba(<accent>,0.14)`) behind a stroke-only icon, echoing the glass/blur surfaces already used throughout the app.
- **Motion: bouncy overshoot** — icon presses and status transitions get a springy overshoot feel. Implemented with reanimated's existing spring system (a new preset, not new CSS-style constants); exact `duration`/`dampingRatio` values re-tuned per element rather than copied from the brainstorm's CSS demo.
- **Coverage: everything** — every plain-glyph icon site across all technician + shared (Login) screens gets replaced. No leftover text glyphs anywhere in scope.
- **New dependency: `react-native-svg`** (via `npx expo install react-native-svg`, SDK-57-compatible). Chosen over reusing `@shopify/react-native-skia` (already installed) because Skia's canvas-based rendering is overkill for dozens of small, independent inline icons — `react-native-svg`'s declarative per-icon components are simpler and the standard choice for this use case.
- **Security fix:** `LoginScreen`'s `saved_password` moves from `AsyncStorage` (plaintext, unencrypted) to `expo-secure-store` (already used for the auth token) — same remember-me UX, actually safe storage.

## 3. Icon inventory (every glyph site, confirmed via grep across `mobile/src`)

| # | Location | Current glyph | New icon |
|---|---|---|---|
| 1 | `GlassTabBar` — Dashboard tab | *(placeholder dot, same as every tab)* | `home` |
| 1 | `GlassTabBar` — Attendance tab | *(placeholder dot)* | `clock` |
| 1 | `GlassTabBar` — Job Tools tab | *(placeholder dot)* | `wrench` |
| 1 | `GlassTabBar` — Earnings tab | *(placeholder dot)* | `wallet` |
| 1 | `GlassTabBar` — Profile tab | *(placeholder dot)* | `user` |
| 2 | Shared back link — 12 screens (`TutorialsScreen`, `CoursePlayerScreen` ×2, `NotificationsScreen`, `EstimatorScreen`, `DeviceFollowUpScreen`, `TrainingCoursesScreen`, `LeaderboardScreen`, `EodReportScreen`, `LoginScreen`, `LeaveFormScreen`, `SettingsScreen`, `TaskDetailScreen` ×2, `DeviceDetailScreen`) | `← Back` (text) | `chevron-left` in a new shared `BackLink` component |
| 3 | `ProfileScreen` menu rows, `JobToolsScreen` tool rows | `›` | `chevron-right` |
| 4 | `EmployeeDashboardScreen` clock-in stat card | `●` / `○` | `clock` (outline) / `check-circle` (filled, when clocked in) |
| 5 | `EstimatorScreen` remove line-item | `✕` | `trash` |
| 6 | `LeaderboardScreen` rating prefix | `★` | `star` (filled) |
| 7 | `LoginScreen` password toggle | "Show" / "Hide" (text) | `eye` / `eye-off` |

Every tab bar icon is currently the *same* generic dot regardless of tab — the single most visible gap.

## 4. Architecture

- **`mobile/src/theme/icons.ts`** (new) — SVG path-data registry, one entry per icon name: `home`, `clock`, `check-circle`, `wrench`, `wallet`, `user`, `chevron-left`, `chevron-right`, `star`, `trash`, `eye`, `eye-off`.
- **`mobile/src/components/Icon.tsx`** (new) — renders a named icon via `react-native-svg`'s `<Svg>`/`<Path>`, props `{ name, size, color, filled? }`. Pure stroke by default; `filled` fills instead (for `star`, `check-circle`).
- **`mobile/src/components/IconChip.tsx`** (new) — the tinted-chip duotone background wrapper (`{ icon, size, tone }`), reused by the tab bar and icon rows so the chip treatment is defined once.
- **`mobile/src/components/BackLink.tsx`** (new) — replaces all 12 inline `← Back` instances: `{ onPress }` → chevron-left icon + "Back" label, matching the existing `styles.link` look.
- **`mobile/src/theme/motion.ts`** — add a `bouncy` spring preset alongside the existing `move`/`drawer` presets.
- **`GlassTabBar.tsx`** — replace the generic `dot` View with `Icon`/`IconChip`, keyed by each tab's `key` (needs a per-tab icon name, added to the `TabItem` interface or a local lookup keyed by tab key).

## 5. Functional audit (technician app)

- **Confirmed bug:** `LoginScreen`'s remember-me stores the password in plaintext `AsyncStorage` — fixed in this phase (§2).
- **Confirmed clean:** every screen built across Phases 3a–3e (Tasks, Attendance, Job Tools, Earnings, Profile hub, Leaderboard, Training Courses, Course Player, Tutorials, Notifications, Settings) already calls real backend endpoints — no placeholder/dead-end actions found. Job Tools' "Job Cards — Coming soon" row is an intentional, honest placeholder (real feature not yet built), not a bug.
- **Minor cleanup:** `LoginScreen`'s uncommitted diff left several routine step-tracing `console.log` calls (`'Attempting login with email:'`, `'Validation failed...'`, `'Credentials saved locally'`, `'Calling login API...'`, `'Login successful'`) — stripped in this phase, keeping only the error-path logs (`[API Request]`, `[API Error]`, `[API Fetch Error]`, `Login error:`) that are genuinely useful for diagnosing failures like the network-cancellation issue encountered during this session.
- A further per-screen pass happens while writing the implementation plan, to catch anything subtler than a grep-based glyph inventory would show.

## 6. Explicitly out of scope (separate future phase)

- Landing page: real logo image (not the "N" text placeholder), neumorphic-styled text inputs, a contact/call-support section (phone/WhatsApp CTA, matching the web app's `srf-contact-section`), the popup-ads system (web reads active ads filtered by `placement === 'popup_landing'`), and the dedicated multi-step Installation booking flow (CCTV / Video Door Phone / Smart Home Automation) that exists on web but not mobile.
- Admin app screens, other client-facing screens.
