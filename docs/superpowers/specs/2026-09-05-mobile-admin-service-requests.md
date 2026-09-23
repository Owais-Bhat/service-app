# Mobile Admin: Service Requests — Design

Date: 2026-09-05
Status: Approved for planning

## 1. Purpose

First slice of the mobile admin feature-parity effort (identified via a full audit: web's admin panel has 32 nav sections, mobile has 3 functional ones — Dashboard stats, Notifications, Live Locations). Service Requests was chosen as the highest-priority gap: it's the core "see and manage any job" admin tool, used constantly on web (`src/pages/admin.js`'s inquiries tab), and currently has zero mobile equivalent (only a "Coming soon" label in `AdminDashboardScreen`'s More sheet).

Job Cards (`src/pages/job-cards.js` — transcription, 3-day verification calls, monthly bonus leaderboard) was identified in the same audit as a related but functionally separate admin workflow and is explicitly **out of scope** here — it gets its own spec/plan cycle later.

## 2. Backend reality (researched, not assumed)

- **No new server endpoints needed.** Everything reuses existing, already-authenticated routes:
  - `GET /api/data/inquiries?select=*&order=created_at:desc` — the generic data endpoint. Admin role bypasses row-scoping entirely (`appendRoleScope` returns `null` immediately for `role === 'admin'`), so this already returns every inquiry with no additional server work.
  - `GET /api/admin/inquiries/:id/manage-context` — already exists (`server/index.cjs`), already used by web's `openInquiryDetail`. Returns `{ inquiry, employees, billServices }` in one call: the full inquiry row, every employee with `clockedIn`/`restricted`/`always_assign` flags precomputed, and itemized bill services if billed.
  - `PATCH /api/data/inquiries` (via the generic data endpoint, same one `dataPatch()` in `mobile/src/api/client.ts` already calls elsewhere) — setting `assigned_employee_id` here already triggers the server's own `assigned_at` stamping logic (`server/index.cjs` line ~6843: stamps `assigned_at` server-side the moment `assigned_employee_id` changes to a different technician). No mobile-side timestamp logic needed.
- **The `tickets`-table insert in web's `openInquiryDetail` is legacy, not load-bearing.** Web's assign flow does an extra direct-Supabase insert into `tickets` alongside the `inquiries` PATCH. Mobile's existing employee-side assignment flow (`PendingAssignments.tsx` accept/decline, already shipped this session) reads and writes `inquiries` directly and never touches `tickets` — confirming `inquiries` is the current source of truth and the `tickets` insert is redundant bookkeeping this spec does not replicate.
- **Assignment-lock business rule** (must match web exactly, it's a real data-integrity guard): an inquiry with `assigned_employee_id` set AND `assignment_status !== 'declined'` is locked — reassignment is blocked client-side (button disabled) until the employee declines. Re-derive this from the fresh `manage-context` response every time the detail modal opens, not from a cached list-row value, so a web-side change since the last mobile list refresh can't be clobbered.
- **Employee assignability**: an employee can receive a new assignment only if `clockedIn === true`, OR `always_assign === true` (the admin-controlled "allowed while offline" override). `restricted` employees are shown but disabled. Mirrors web's `activeEmployeeIds`/`isOfflineAllowed` logic exactly.

## 3. Screens

**`AdminServiceRequestsScreen.tsx`** (new) — list view, reachable via a new **"Requests"** entry added directly to `AdminDashboardScreen`'s tab bar (currently just `Dashboard`/`More` — this is core admin work, not a "More" sheet item). Structure mirrors `ManageTasksScreen.tsx` (the employee-side equivalent):
- `AppHeaderBar` + pull-to-refresh `ScrollView`.
- Horizontal filter chips, all 7 matching web exactly, each with a live count: Active, Resolved, Issue Not Resolved, Reopened (shown only when count > 0, matching web), Awaiting Payment, Paid, All.
- Search box: matches against ticket number, customer name, or service item (client-side filter, same pattern as `ManageTasksScreen`'s `search` state).
- Company-name filter: a second text field below search (client-side substring match against `company_name`, same as web's `companyFilter`).
- Rows: `GlassCard` per inquiry — ticket #, customer name, service item, assigned employee name (or "Unassigned"), status badge, payment badge (Paid/Unpaid/—). Tap opens the detail modal.

**`AdminServiceRequestDetailModal.tsx`** (new) — fetches `manage-context` on open (loading state while in flight). Shows, read-only:
- Ticket #, status badge, created/updated timestamps.
- Customer name, phone, service item, description (if present).
- Location text + "Open in Maps" button when `customer_lat`/`customer_lng` are present (reuse the same `mapsLink`-style URL construction already used elsewhere in mobile, e.g. `LiveLocationsScreen`).
- Preferred time, SLA deadline/timer (reuse or port the same SLA-formatting logic web uses — `calculateSLA`/`formatSLADeadline`/`formatTimeRemaining` — as a small shared util rather than reimplementing).
- Device type/serial if present, extra charges if present.
- Banners: "Employee Declined" (with reason) when `assignment_status === 'declined'`; "Assignment locked" / "Waiting for employee response" when locked — exact same copy/conditions as web.
- Bill summary (line items + total) when `bill_total` is set — **read-only**, no download/regenerate action.
- Customer feedback (rating + comment) if present.

Then, the one interactive part:
- Employee picker: rendered **inline** within the detail modal's `ScrollView` (not a separate sub-modal — avoids stacking a modal on top of a modal) as a vertical list of pressable rows, each showing the employee's name + status label (Online / Offline ⭐ Allowed / Offline / Restricted), matching web's label logic exactly. Selecting a row marks it active (radio-style, single selection); disabled rows: `restricted`, or offline without `always_assign`.
- "Save Assignment" button — disabled when locked (with the same explanatory copy as web). On save: `dataPatch('inquiries', id, { assigned_employee_id, assignment_status: empId ? 'pending' : null, decline_reason: null })`, matching web's update payload minus the `tickets` insert (§2).

## 4. API changes

| File | Change |
|---|---|
| `mobile/src/api/adminInquiries.ts` (new) | `fetchInquiries(): Promise<AdminInquiryRow[]>` — `dataGet('inquiries', { select: '*', order: 'created_at:desc' })`. `fetchInquiryManageContext(id): Promise<ManageContext>` — `api.get('/admin/inquiries/' + id + '/manage-context')`. `assignInquiryEmployee(id, employeeId: string \| null): Promise<void>` — the `dataPatch` call described in §3. |
| `mobile/src/screens/AdminServiceRequestsScreen.tsx` (new) | List screen, per §3. |
| `mobile/src/components/AdminServiceRequestDetailModal.tsx` (new) | Detail/assign modal, per §3. |
| `mobile/src/screens/AdminDashboardScreen.tsx` | Add a `Requests` tab to the existing `TABS` array; remove "Service Requests"-adjacent ambiguity from the More sheet if present (it currently isn't listed there at all — this is a net-new addition, not a promotion of an existing placeholder). |

No changes to `server/index.cjs` or any web file.

## 5. Navigation

Admin's tab bar (`AdminDashboardScreen.tsx`'s `TABS`) grows from 2 entries (`Dashboard`, `More`) to 3 (`Dashboard`, `Requests`, `More`), using the same `GlassTabBar` component already in place. `Requests` renders `AdminServiceRequestsScreen` as a sibling swap, matching the `animation: 'none'` pattern employee-side top-level tabs already use.

## 6. Error handling & testing

Same conventions as every other mobile screen this session: pull-to-refresh, inline error text on load failure, `ApiError` messages surfaced directly (no generic fallback swallowing a real server message). Cannot be device-tested from this environment — typecheck + `vite`/`tsc` build clean is the automatable bar; a manual smoke test (view list, filter by each of the 7 tabs, search, open a ticket, assign an employee, confirm the locked-state banner appears correctly afterward) is required before considering this done.

## 7. Explicitly out of scope for this phase

- Delete a service request, Export, Register a brand-new request from mobile, Release to Public Pool, bill PDF view/download — all confirmed out of scope by the user during brainstorming.
- Job Cards (separate spec).
- Any change to the assignment business logic itself (SLA calculation rules, auto-assignment, pool release conditions) — read/reuse only, no behavior changes.
