# Employee Portal — Visual Polish + Feature Parity Roadmap

**Purpose:** reference doc for making the mobile app's employee (technician) portal look as attractive as the redesigned landing/login screens, and for tracking which of the web app's employee-facing features (`src/pages/employee.js` + related modules) still need a mobile equivalent — customized for a phone, not a 1:1 port of the desktop UI.

**Scope:** employee/technician-facing screens only. Admin screens (`AdminDashboardScreen.tsx` and beyond) are a separate, larger effort and out of scope here.

**Status:** reference/planning document — no code changes in this doc. Each unchecked item below should get its own brainstorm → spec → plan cycle before implementation, same as the landing-screen work.

---

## Part 1 — Design direction: making it attractive

The visual language already exists and is proven across 6+ employee screens (Attendance, TaskDetail, DeviceDetail, plus Landing/Login on the guest side). "Attractive" here means **finishing the rollout of that language**, not inventing a new one.

### The established toolkit

| Piece | What it gives you | Where it already lives |
|---|---|---|
| `MeshBackground` | Drifting blurred color blobs behind every screen | Nearly every screen already |
| `GlassCard` / `GlassSurface` | Blurred translucent panels (two blur intensities) | Most screens |
| `GlowButton` | Gradient + pulsing-glow primary CTA, now with optional icon | Landing, Login, RequestWizard, Track, Complaint, TaskDetail, Attendance, DeviceDetail |
| `PulseDot` | Looping glow-pulse "live status" dot | Attendance's clocked-in chip |
| `SegmentedTabs` / `GlassTabBar` | Glass segmented control (in-screen) vs. opaque neumorphic chrome (bottom nav) — deliberately two different materials, don't blur them together | Landing (tabs) vs. every employee screen (bottom nav) |
| Icon registry (`theme/icons.ts`) | ~30 hand-drawn stroke icons, consistent 24×24 grid, outline + filled modes | `Icon.tsx` |
| `Animated.View entering={FadeInUp.delay(n).duration(550)}` | Staggered rise-in on screen load | Landing, Login |
| NEST emerald tokens (`theme/tokens.ts`) | Single source of truth for brand/status/category colors, light+dark | Everywhere |

### What's not finished yet

1. **Staggered entrance animations** only exist on Landing and Login. Every other employee screen renders instantly with no motion — `EmployeeDashboardScreen`, `AttendanceScreen`, `JobToolsScreen`, `EarningsScreen`, `LeaderboardScreen`, `TrainingCoursesScreen`, `NotificationsScreen`, `SettingsScreen`, `ProfileScreen` all render flat. Wrapping each screen's major sections in `FadeInUp` with staggered delays (as done on Landing/Login) is the single highest-leverage "make it feel alive" change, and it's mechanical — no design decisions needed, just apply the existing pattern.
2. **`GlowButton` adoption is now current** for genuine primary CTAs (just finished this session: TaskDetail, Attendance, DeviceDetail). Sweep the remaining employee screens (`LeaveFormScreen`, `EodReportScreen`, `EstimatorScreen`) for any leftover flat `backgroundColor: brand.primary` Pressables and confirm they're already converted or intentionally left flat (e.g. small inline chips where `GlowButton`'s fixed 52px height doesn't fit — see `CoursePlayerScreen`'s "Mark Complete").
3. **Flat `Panel` vs. blurred `GlassCard`** — per the existing design note in `Panel.tsx`, NEST intentionally uses both tiers (flat for list rows, blurred for hero/primary content). Worth an audit pass to confirm each screen picked the right tier rather than defaulting to `Panel` everywhere out of habit.
4. **Theme toggle** only exists on the Landing screen header. Employee-side has no equivalent control — likely belongs in `SettingsScreen` or a header affordance on `EmployeeDashboardScreen`, matching how Landing exposes it.
5. **Real photography/imagery**: web's admin dashboard and finance screens lean on data-viz (SVG charts, gauges, donuts — see `dashboard-widgets.js` below); mobile's employee stats are currently plain stat cards (`AnimatedStatCard`). Porting even 2–3 of the simpler chart types (gauge ring, donut) would visually elevate `EarningsScreen`/`LeaderboardScreen` without needing new dependencies (both `react-native-svg` and `@shopify/react-native-skia` are already installed).

---

## Part 2 — Feature parity: web's employee.js vs. mobile

Reference: `docs/superpowers/specs/2026-08-21-web-app-feature-inventory.md` §"Employee pages (employee.js)" has the full web-side detail for every item below — this table is the mobile-status cross-reference, not a re-derivation.

Legend: ✅ have it · ⚠️ partial · ❌ missing

| # | Web feature | Mobile status | Mobile screen | Customization notes |
|---|---|---|---|---|
| 1 | Dashboard (clock in/out, EOD gate, notice board, public-jobs widget, today's route, reopened tickets) | ⚠️ partial | `EmployeeDashboardScreen` | Clock in/out and task list exist; **no selfie/face-verification clock-in**, **no Notice Board**, **no gig-pool widget**, **no "Today's Route" progress bar**, **no reopened-tickets section**. Selfie clock-in needs `expo-camera` (not yet a dependency) + on-device face matching — the web app uses `face-api` models in-browser; a mobile equivalent would need a different library (e.g. `vision-camera-face-detector`) since face-api doesn't run in RN. This is the single most involved gap on this list. |
| 2 | Attendance Records | ✅ | `AttendanceScreen` | Done. |
| 3 | Leave Requests (list + new) | ✅ | `AttendanceScreen` (list) + `LeaveFormScreen` (new) | Done. |
| 4 | EOD Reports | ✅ | `EodReportScreen` | Done. |
| 5 | My Cash | ✅ | `EarningsScreen` ("My Cash" segment) | Done. |
| 6 | Salary estimate | ✅ | `EarningsScreen` ("Salary" segment) | Done. |
| 7 | Leaderboard | ✅ | `LeaderboardScreen` | Done — verify it hits the dedicated `/api/leaderboard` endpoint like web, not a stripped-down dashboard version. |
| 8 | Estimator (client-quote builder) | ✅ | `EstimatorScreen` | Verify fee/discount/GST math matches web's formula exactly — worth a side-by-side spot check since it's pure client-side calc with no server validation to catch drift. |
| 9 | My Installations | ❌ | — | Missing entirely. Web shows installation-table jobs assigned to the employee with one-tap status advance (Start → in_progress → Mark Completed). On mobile this could be a filtered view within the existing task list rather than a fully separate screen — worth deciding during brainstorming whether it's a new screen or a tab/filter on an existing one. |
| 10 | Public Jobs / Gig Pool | ❌ | — | Missing entirely. Only relevant for `worker_type === 'gig'` employees (claim an unassigned job from a shared pool, race-safe). Should be conditionally rendered, same as web — most fixed employees never see it. |
| 11 | My Tasks (list + filters) | ✅ | `EmployeeDashboardScreen` task list | Verify filter parity (web filters by In Progress/Reopened/Resolved/Issue Not Resolved/Device Follow Up + search) — confirm mobile's current filtering covers the same set. |
| 12 | Manage Service — **Status tab** | ✅ | `TaskDetailScreen` | Done (status advance, now via `GlowButton`). |
| 12 | Manage Service — **Device tab** (company/device type/serial) | ⚠️ check | `TaskDetailScreen` or `DeviceDetailScreen` | Confirm company/device-type/serial capture exists somewhere in the flow — wasn't confirmed present during this doc's research pass. |
| 12 | Manage Service — **Device Service tab** | ✅ | `DeviceDetailScreen` | Taken/Return/Follow-up all present, now on `GlowButton`. |
| 12 | Manage Service — **Bill tab** (pricing, discount, coupon, transport, PDF bill, payment link) | ❌ | — | The biggest single gap. This is genuinely complex on web (cascading service picker, live price breakdown, coupon redemption, PDF generation via html2canvas/jsPDF, Razorpay payment-link + polling). A mobile version needs real scoping of its own — likely its own brainstorm/spec, not a quick add. Consider whether a first pass can skip PDF generation (defer bill viewing to web) and just cover: add line items, see live total, mark cash collected. |
| 13 | Device Follow-up (standalone) | ✅ | `DeviceFollowUpScreen` | Done. |
| 14 | Service Pricing management | ❌ | — | Missing. Lower priority — this is a catalog-editing tool (add/edit/delete price-list items), more admin-shaped even though some employees have `can_add_service` access. Web's UI is `prompt()`-dialog based, which doesn't translate directly to mobile anyway — needs a proper form/modal design. |
| 15 | Self-registered Service Request (employee books a walk-in customer) | ❌ | — | Missing. Functionally close to `RequestWizard` (already built for the landing screen) minus the OTP step, since the employee is already authenticated — likely the fastest of the "missing" items to build by reusing `RequestWizard`'s form fields. |

### Cross-cutting infrastructure gaps (not employee.js itself, but shared plumbing web has that mobile doesn't)

- **Push notifications** (`src/push.js` on web) — mobile has an `api/notifications.ts` for the notification list, but worth confirming Expo push tokens are registered the same way web registers a service worker for Web Push. Different mechanism (Expo Notifications vs. browser Push API) but same end goal.
- **Notice Board** — admin-authored notices shown on the employee dashboard (priority-colored, expiring). No mobile equivalent yet; ties into gap #1 above.
- **AI Assistant floating chat** (`ai-assistant.js`) — internal troubleshooting bot, mounted globally on web for both admin and employee. Not present on mobile. Lower priority — nice-to-have, not core workflow.
- **Employee popup ads** (`popup_employee` placement, `media-training.js`) — mobile's `PopupAd` component (built for Landing) only wires up the `popup_landing`/landing-page placement. Extending it to also show on employee-side post-login with the `popup_employee` placement would be a small, mostly-mechanical addition given the component already exists.

---

## Suggested phasing

Given the size, doing this as one pass isn't realistic. A reasonable order, roughly cheapest/highest-impact first:

1. **Visual polish sweep** (Part 1) — staggered animations + any remaining flat-button conversions across existing screens. Mechanical, no new backend work, immediate visible payoff across the whole portal.
2. **Self-registered Service Request** (#15) — mostly reuses `RequestWizard`.
3. **My Installations** (#9) — likely a filtered view, not a new screen from scratch.
4. **Public Jobs / Gig Pool** (#10) — self-contained, only affects gig workers.
5. **Notice Board** — self-contained read-only feature, pairs naturally with dashboard polish.
6. **Selfie/face-verification clock-in** (part of #1) — needs a new camera/face-matching dependency; scope this one carefully before starting.
7. **Bill tab** (part of #12) — the largest, most complex item; deserves its own dedicated brainstorm → spec → plan cycle, likely split into its own sub-phases (line items + total → coupon/discount → payment link → PDF).
8. **Service Pricing management** (#14) — lowest priority; smaller audience (only `can_add_service` employees), and web's own UI for it isn't a great model to copy anyway.

Each numbered item above should go through the same brainstorm → spec → plan → implement discipline used for the landing screen work, not be built ad hoc — several of these (Bill tab especially) have enough hidden complexity that skipping straight to code would likely miss requirements.
