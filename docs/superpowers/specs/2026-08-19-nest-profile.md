# NEST Profile (Phase 3e) — Design

Date: 2026-08-19
Status: Approved for planning

## 1. Purpose

Final slice of Phase 3: the Profile tab (Leaderboard, Training Courses, Tutorials, Notifications, Settings), replacing the placeholder "More" tab with NEST's actual 5th tab — matching the design's real 5-tab structure (Dashboard, Attendance, Job Tools, Earnings, Profile) instead of carrying the "More" scaffold added in phase 1.

## 2. Backend reality (researched, not assumed)

- **Leaderboard**: the ranking computation (`fetchVerifiedJobsForMonth` + `computeLeaderboard`, in `server/job-card-scoring.cjs`) is real and correct, but `GET /api/admin/leaderboard` is admin-only — no employee-facing route exists. Per user decision: **add `GET /api/leaderboard`**, a small server change reusing the same helpers without the admin gate, scoped to the requesting employee's own visibility (read-only, no new data exposed beyond the existing ranking). This is the one change in this phase outside `mobile/`.
- **Training Courses**: a complete, real system — `GET /api/training/my` (assigned courses + lesson/quiz counts + progress), `GET /api/training/course/:id` (lessons + quiz + my progress), `POST /api/training/lessons/:id/complete`. Quiz-taking (`POST /api/training/course/:id/quiz-submit`) exists too but **isn't built this phase** — NEST's own Course Player mockup doesn't show a quiz UI, and it's a genuinely separate scope (grading, pass/fail) worth its own pass later.
- **Tutorials**: `training_items` (readable via the generic data layer) + `training_watch_progress` (`GET /api/training/watch-progress/mine` for existing progress). **Playback happens via the device's browser/video app** (`Linking.openURL` on the item's `url` — no new dependency), not an in-app player — building a custom video player is a different scope than a Profile tab. Because there's no in-app player, this phase **can't accurately measure new watch time** (no player to report seconds-watched from), so it shows whatever progress already exists (e.g. from web usage) read-only, rather than faking new tracking.
- **Notifications**: `GET /api/notifications` (returns `{items, unread}`), `POST /api/notifications/:id/read`, `POST /api/notifications/read-all` — complete, no gaps.
- **Settings**: only **Dark Mode** is real and buildable — it's wired to `ThemeContext.toggleTheme()`, the theme infrastructure phase 1 built and nothing has used interactively until now. NEST's mockup also shows a "Push notifications" toggle; **not built** — there's no push-subscription system anywhere in the backend, so a toggle here would control nothing. Log Out stays on the Profile hub screen (matching NEST), not Settings.

## 3. Tab bar restructuring

Per user decision: **Profile replaces "More"** as the employee tab bar's 5th entry, matching NEST's actual design (Dashboard, Attendance, Job Tools, Earnings, Profile — 5 tabs, not 6). This touches all 4 existing top-level screens (`EmployeeDashboardScreen`, `AttendanceScreen`, `JobToolsScreen`, `EarningsScreen`): each drops its `MoreSheet`/`moreVisible` state (no longer needed — `activeKey` becomes a direct prop, not `moreVisible ? 'more' : ownKey`) and gains an `onGoProfile` prop. `MoreSheet` the *component* stays in the codebase — NEST's own admin design has a real "More" tab, so phase 4 will use it there; only the employee side stops rendering it.

The one remaining item that was in the employee "More" list and still isn't built — **Job Cards** — relocates into the **Job Tools** hub as a 4th "Coming soon" row (thematically it's a job-tools concept, technician job documentation, not a personal/account one).

## 4. Screens

- **Profile** (hub, new 5th tab): avatar-initials chip, name, role/email, then rows — Leaderboard, Training Courses, Tutorials, Notifications, Settings, Log Out.
- **Leaderboard**: current month's ranking from the new endpoint (§2) — rank, name, avg rating, jobs count; the viewer's own row highlighted.
- **Training Courses** (list) → **Course Player** (sub-screen): lessons list with completion state, tap a lesson to mark it complete for real.
- **Tutorials**: list with existing watch-progress shown per item (read-only, §2); tap opens the video via the device's browser/video app.
- **Notifications**: list, unread visually distinguished, tap marks read; pull-to-refresh.
- **Settings**: Dark Mode toggle, wired to the real theme system.

## 5. API changes

| File | Change |
|---|---|
| `server/index.cjs` | Add `GET /api/leaderboard` (employee-facing, reuses existing helpers, no admin gate) |
| `mobile/src/api/leaderboard.ts` (new) | `fetchLeaderboard(month)` |
| `mobile/src/api/training.ts` (new) | `fetchMyCourses`, `fetchCourseDetail`, `completeLesson`, `fetchTrainingItems`, `fetchWatchProgress` |
| `mobile/src/api/notifications.ts` (new) | `fetchNotifications`, `markNotificationRead` |

## 6. Explicitly out of scope for this phase

- Quiz-taking on training courses — server supports it, UI doesn't show it (§2)
- An in-app video player for Tutorials / new watch-time tracking — external playback only (§2)
- A working "Push notifications" toggle — no push-subscription backend exists (§2)
- Job Cards itself (the reward/verification system) — relocated in the IA (§3) but still not built; its own future phase
- Admin's own Profile-equivalent or "More" tab — phase 4
