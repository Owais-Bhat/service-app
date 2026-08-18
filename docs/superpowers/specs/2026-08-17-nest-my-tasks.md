# NEST "My Tasks" — Tasks List + Task Detail (Phase 3a) — Design

Date: 2026-08-17
Status: Approved for planning

## 1. Purpose

First slice of Phase 3 (Technician app screens): turn the dashboard's existing flat ticket list into a real, filterable Tasks list, and add a Task Detail screen with a working status-advance action against the real backend. Everything else in the NEST Technician tab set (Attendance, Job Tools, Earnings, Profile and their sub-screens) is later slices.

## 2. Backend reality (researched, not assumed)

- `tickets` table has `id, client_id, assigned_to, title, description, category, priority, status, created_at` — enough for a real detail screen. Confirmed via `server/index.cjs`.
- Status advance is a real, working endpoint today: `PATCH /api/data/tickets?eq=id:<id>` with body `{ "status": "<value>" }`. Employees may only write the `status` field (server-enforced `EMPLOYEE_WRITE_FIELDS.tickets = ['status']`), and rows are scoped to `assigned_to = self` server-side — the mobile client can't write to someone else's ticket even if it tried.
- Real status values in use: `open, assigned, in_progress, resolved, case_closed, foc, issue_not_resolved, paid, closed` — richer than NEST's 4-state mockup.
- Real category values (from `src/pages/job-cards.js`'s `CATEGORIES` constant): `CCTV, Networking, Video Door Phone, Locks, Gate Automation, Access Control / Biometric, Fire Alarm, Other` — 8, not NEST's 5.
- **No backend exists for**: before/after job photos, or customer signature capture. No columns, no endpoints, nothing (checked `tickets`/`inquiries`/server routes). `POST /api/upload` is a generic file-upload primitive but isn't linked to tickets in any way.
- Customer contact info (name/phone/location) isn't a `tickets` column — it lives on the linked `inquiries` row (`inquiries.ticket_id → tickets.id`), captured at submission time. The generic `/api/data/:table` endpoint supports Supabase-style embedded relations (e.g. `select=*,inquiries(full_name,phone,location)`), so a single fetch can pull both.

## 3. Status handling

A technician self-advances through exactly the 4 states NEST's stepper models — **open → assigned → in_progress → resolved** — via one contextual button ("Mark as Assigned" / "Mark as In Progress" / "Mark as Resolved" / done). The remaining real states (`case_closed`, `foc`, `issue_not_resolved`, `paid`, `closed`) are admin/finance workflow states a technician doesn't self-select; if a ticket happens to be in one of them, Task Detail shows it as a read-only badge with no advance button, rather than force-fitting it into the 4-step flow.

`theme/tokens.ts`'s `statusColors` gets widened to cover all real values (not just the 4 NEST originally had, and fixing the key mismatch — NEST used `progress`, the real column value is `in_progress`), each with a `label` field. `ClientTrackTicketScreen`'s separate, duplicate `STATUS_LABEL` map is replaced with this same source so there's one place status labels live, not two.

## 4. Category handling

`theme/tokens.ts`'s `categoryColors` gets widened from NEST's 5 keys to all 8 real category strings (used as literal string keys, since several contain spaces/slashes and can't be bare identifiers). 5 keep NEST's original colors (CCTV, Networking, Video Door Phone→VDP's indigo, Gate Automation, Access Control / Biometric→purple); the 3 NEST doesn't cover (Locks, Fire Alarm, Other) get assigned unused hues already present in the app's palette (blue, red, neutral grey) rather than inventing new colors. A `DEFAULT_CATEGORY_COLOR` fallback (neutral grey, "—" initials) covers any future/unmapped value so nothing renders broken.

## 5. Screens

**Tasks list** (upgrades the existing "My Tickets" section on `EmployeeDashboardScreen`, doesn't replace the screen):
- Filter chips: All / Open / In Progress / Resolved (client-side filter over the already-fetched list, matching NEST's own approach)
- Each row: category icon chip (color from §4), ticket title (not just a truncated id), status badge (color from §3), tap → Task Detail

**Task Detail** (new screen, `TaskDetailScreen`):
- Header: ticket id (monospace), status badge
- Title + description
- Customer block: name, phone, location (from the embedded `inquiries` relation)
- Status section: current status stepper (4-state) + the contextual advance button, wired to the real `PATCH` call (§2)
- Before/after photo tiles and a signature tile, shown per the design **but marked "Coming soon" and non-interactive** — same honest pattern already used for the More sheet's unbuilt sections, since there's genuinely no backend for either yet (§2). This is a deliberate choice, not an oversight: building tap targets that silently do nothing would be worse than admitting the feature isn't there.

## 6. Navigation

The employee side has been a single screen since Phase 1's comment anticipated this moment ("add one per role as each grows past a single screen"). It becomes a real native stack: `EmployeeStack` with `Dashboard` (initial) → `TaskDetail`. `AdminDashboardScreen` stays a single screen for now — it gets its own stack in the Phase 4 admin work.

## 7. API changes

| File | Change |
|---|---|
| `mobile/src/api/client.ts` | Add `dataPatch<T>(table, eq, body)`, mirroring the existing `dataPost` |
| `mobile/src/api/employee.ts` | Widen `TicketRow` to include `title`, `category` (list needs these now) |
| `mobile/src/api/tickets.ts` (new) | `TicketDetail` interface (full ticket + embedded customer contact), `fetchTicketDetail(id)`, `updateTicketStatus(id, status)`. Lives separately from `employee.ts` because ticket detail/update isn't employee-exclusive — Phase 4's admin ticket screens will reuse it. |

## 8. Explicitly out of scope for this phase

- Before/after photo capture and customer signature — no backend exists; shown as "Coming soon" (§5), not built
- Attendance, Job Tools, Earnings, Profile and their sub-screens — later Phase 3 slices
- Admin's own ticket detail/list screens — Phase 4, though they'll reuse `tickets.ts` from this phase
- `ticket_comments` (a real, working notes-thread feature on tickets that NEST's design doesn't show) — noted as a good candidate for a future slice, not pulled into this one to keep it focused
