# NEST Attendance (Phase 3b) — Design

Date: 2026-08-17
Status: Approved for planning

## 1. Purpose

Second slice of Phase 3 (Technician app screens): a real Attendance screen — clock in/out, weekly hours, history, and leave requests — added as the employee tab set's second real tab (after Dashboard/Tasks from phase 3a).

## 2. Backend reality (researched, not assumed)

- **Gig workers** clock in via a plain insert: `POST /api/data/attendance` with `{user_id, date, clock_in, status}`. Clock-out is `PATCH /api/data/attendance?eq=id:<id>` with `{clock_out}`. Both already covered by the generic data layer; employee-writable attendance fields are `id, user_id, clock_in, clock_out, date, status, location, latitude, longitude`.
- **Fixed employees** clock in via a dedicated endpoint: `POST /api/attendance/clock-in-photo` (multipart). The server decides per-request whether a photo and/or GPS coordinates are actually required, based on **global settings** (`photoClockInEnabled`, `geofenceClockInEnabled`) **and a per-employee exemption flag** neither of which the client can fully know in advance — so the client's job is to always attempt the call with whatever it has (GPS coords via `expo-location`, no photo) and let the server's response drive the UI, not to pre-compute the rules itself.
- `GET /api/settings/clockin-requirements` (public, no auth) returns `{photoRequired, geofenceRequired}` — the **global** flags, useful as an upfront hint but not authoritative for a specific employee's exemptions.
- **Photo/face-match clock-in cannot be built in this phase.** The server expects a client-computed 128-value face descriptor (`req.body.faceDescriptor`, JSON) in the same format the web app's `face-api.js` produces. Building a compatible on-device face-detection pipeline in React Native is a separate, significant effort (new ML dependency, model bundling, format compatibility with already-enrolled faces) — not something to fold into an attendance screen. Per user decision: **build everything else; when the server rejects a clock-in specifically because it needs a photo, show a clear "Photo clock-in isn't supported in the mobile app yet — use the web app" message.** No fake camera UI.
- Geofence (GPS) **is** buildable — `expo-location` is a standard, lightweight Expo module. Coordinates are sent as plain multipart fields `lat`, `lng`, `accuracy` (numbers) alongside the (here, always-absent) `photo` file.
- `leave_requests` employee-writable fields: `id, employee_id, start_date, end_date, reason, status` (status must start `'pending'` — server-enforced). Straightforward create + list, no gaps.
- History: the generic `GET /api/data/:table` endpoint supports `eq`/`order` but **not** `limit` — history is fetched as all rows for the user (ordered `date:desc`) and sliced client-side to the last 14 for display / last 7 for the hours bar. Acceptable for now; revisit if an employee's full history ever gets large enough to matter.
- No "streak" data exists anywhere in the backend. NEST's mockup shows a hardcoded "23-day streak" — **not built**, since it would be fabricated, not real data.

## 3. Screen content

**Attendance tab** (segmented: Attendance / Leave, matching NEST):

- **Attendance segment**: clock status chip (in/out), current time, a **Clock In / Clock Out** button wired to the real flow in §2, a "Hours this week" bar (7 bars, computed client-side from history), and a History list (date, in/out times, hours worked).
- **Leave segment**: "New Leave Request" button → pushes a **LeaveForm** sub-screen (dates + reason, mirroring the existing form patterns already in the app) → `POST leave_requests`. Below the button, a list of the employee's own leave requests with status badges (pending/approved/rejected — reusing the same badge-token pattern as ticket status).

## 4. Navigation

The employee tab bar grows from 2 items (Dashboard, More) to 3 (**Dashboard, Attendance, More**) — the first real use of the "5-tab technician nav" concept from the original NEST design, built incrementally as each tab actually has content. `Attendance` and `Dashboard` become sibling screens on the existing `EmployeeStack`, navigated between with `animation: 'none'` (an instant swap approximating tab-switching, since the custom `GlassTabBar` isn't a real React Navigation tab navigator) — a deliberate, scoped approximation, not a full navigation-architecture rebuild. `LeaveForm` pushes as a normal stack screen (slide transition, hides the tab bar), the same drill-down pattern `TaskDetail` already established.

## 5. API changes

| File | Change |
|---|---|
| `mobile/src/api/attendance.ts` (new) | Moves `AttendanceRow`/`fetchTodayAttendance` out of `employee.ts` (same rationale as `tickets.ts` — Phase 4's admin "Team" view will reuse attendance data). Adds `fetchAttendanceHistory`, `clockInGig`, `clockInFixed` (calls `/api/attendance/clock-in-photo` with only coords, no photo), `clockOut`, `fetchLeaveRequests`, `submitLeaveRequest`. |
| `mobile/src/api/employee.ts` | Drops `AttendanceRow`/`fetchTodayAttendance` (moved out); keeps `fetchMyTickets` |
| `mobile/src/screens/EmployeeDashboardScreen.tsx` | Updates its attendance import path; tab bar gains the `Attendance` entry |

## 6. Dependencies

One new package: `expo-location` (foreground GPS position, used only when attempting a fixed-employee clock-in or optionally for gig clock-in). Location permission is requested at the point of clocking in, not proactively on screen load — if denied, the clock-in attempt proceeds without coordinates and the server's own validation (§2) surfaces a clear error if that employee's account actually requires geofencing.

## 7. Explicitly out of scope for this phase

- Photo/face-match clock-in — no on-device face descriptor pipeline; honest "not supported" message instead (§2)
- A real "streak" feature — no backend data exists for it, not fabricated
- Reverse-geocoding GPS coordinates into a human-readable `location` string on new clock-ins (existing history rows that already have one still display correctly; new mobile clock-ins just won't populate it) — a cosmetic gap, not a functional one
- Any further Job Tools/Earnings/Profile screens — later Phase 3 slices
- A true React Navigation bottom-tab navigator replacing the custom `GlassTabBar` — the `animation: 'none'` sibling-screen approximation (§4) is intentional for now
