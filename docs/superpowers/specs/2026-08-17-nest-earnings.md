# NEST Earnings (Phase 3d) — Design

Date: 2026-08-17
Status: Approved for planning

## 1. Purpose

Fourth slice of Phase 3: the Earnings tab (Cash, Collections, Salary), becoming the employee tab set's fifth real tab.

## 2. Backend reality (researched, not assumed)

- **`cash_collections`, `payments`, and `bills`** — all three appear in `ALLOWED_DATA_TABLES`, but none has a `CREATE TABLE` statement anywhere, none is written to anywhere, and none is in `EMPLOYEE_READ_TABLES`. They are vestigial table names, not a real feature. NEST's "My Cash"/"Collections" segments **cannot** be built against them.
- The real cash/billing data lives directly on **`inquiries`**: `bill_amount`, `bill_total`, `payment_status`, `payment_method`, `cash_collected_at`, `cash_submitted_at`, scoped to an employee via `assigned_employee_id` (the same column phase 3c's device tracking uses). This is exactly the data NEST's Cash/Collections segments need — it just lives somewhere different than the design's fictional table names imply.
- Employees *can* write `payment_status`/`payment_method`/`cash_collected_at` on their own inquiries (confirmed in `EMPLOYEE_WRITE_FIELDS.inquiries`) — meaning "record a cash collection" is technically buildable. **Deliberately not built this phase**: recording a collection is really a job-completion-time action (it belongs with the "mark resolved" moment on Task Detail, phase 3a), not a standalone form on the Earnings tab. Building it here would mean inventing a UI moment NEST itself doesn't show and that doesn't match how the real workflow happens. This phase is **read-only**: view what's been collected, not record new collections.
- **`profiles.salary`** is real (`DECIMAL(10,2)`), already returned by `/api/auth/me` and `/api/auth/signin` (`SELECT * FROM profiles`) — just not yet in the mobile `AuthUser` TypeScript type, which under-declares what the server already sends. Adding it to the type costs nothing (the data is already there).
- "Days present," "leave taken," and "payable days" aren't separate backend concepts — they're computed client-side from data phase 3b's `attendance.ts`/the leave-request functions already fetch (attendance history + leave requests), filtered to the current calendar month. No new attendance/leave API needed.

## 3. Screens

**Earnings tab** (segmented: My Cash / Collections / Salary, matching NEST):

- **My Cash**: sum + list of this employee's cash payments **collected but not yet submitted to the office** (`payment_method` contains "cash", `payment_status = 'paid'`, `cash_collected_at` set, `cash_submitted_at` null).
- **Collections**: sum + list of **all** of this employee's cash payments ever collected (same filter, minus the "not yet submitted" condition) — the full history "My Cash" is a subset of.
- **Salary**: this month's estimate (prorated from `profiles.salary` by payable-days ÷ days-in-month), plus the supporting numbers: monthly salary, days present this month (from attendance history), leave taken this month (from approved leave requests), payable days (present + approved leave).

## 4. API changes

| File | Change |
|---|---|
| `mobile/src/api/auth.ts` | Add `salary: string \| number` to `AuthUser` — data the server already sends, just untyped |
| `mobile/src/api/earnings.ts` (new) | `fetchCashInquiries(employeeId)` — reads `inquiries` scoped to `assigned_employee_id` + `payment_status:paid`, client-filtered to cash payments (mirroring the server's own `.toLowerCase().includes('cash')` check, since `payment_method` isn't a clean enum suitable for an exact-match server-side filter) |

## 5. Navigation

`Earnings` becomes the employee tab bar's 5th entry (Dashboard, Attendance, Job Tools, **Earnings**, More) — same `animation: 'none'` sibling-swap pattern as the other three top-level tabs.

## 6. Explicitly out of scope for this phase

- Recording a new cash collection or marking cash as submitted to the office — read-only this phase (§2); the natural place for this is Task Detail's completion flow, a future revisit, not invented here
- Profile tab and its sub-screens (Leaderboard, Training, Tutorials, Notifications, Settings) — the last Phase 3 slice
- Any change to how billing/payment fields are written server-side — untouched
