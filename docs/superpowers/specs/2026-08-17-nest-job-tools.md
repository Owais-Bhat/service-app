# NEST Job Tools (Phase 3c) — Design

Date: 2026-08-17
Status: Approved for planning

## 1. Purpose

Third slice of Phase 3: the Job Tools hub (Estimator, Device Follow-up, EOD Report), becoming the employee tab set's third real tab.

## 2. Backend reality (researched, not assumed)

- **Estimator**: `service_pricing` table (`id, name, category, sub_category, sub_sub_category, cost, description`), fully readable by employees. There is **no quote/estimate persistence anywhere** — NEST's own mockup source confirms this: its "add" handler is a literal no-op (`add: () => {}`). This is a look-up-and-total tool used during a customer conversation, not a saved document. Built as: fetch the real catalog, tap items to add to a running **local, ephemeral** total — nothing is submitted to the server.
- **Device Follow-up** turns out to be a genuinely complete, already-working subsystem — richer than NEST's mockup, not thinner:
  - `GET /api/device-tracking/employee/:employeeId` — this employee's inquiries with device-tracking fields + the latest taken/return log embedded.
  - `GET /api/device-tracking/status/:inquiryId` — full detail: taken log, return log, and the **full follow-up log history** (not just current status).
  - `POST /api/device-tracking/taken` — `{inquiry_id, description, device_image_url}` — logs the device going into service, pauses that ticket's SLA clock server-side.
  - `POST /api/device-tracking/followup` — `{inquiry_id, status, notes}` — appends a follow-up log entry and updates the inquiry's current follow-up status. **`status` is free text, not a fixed enum** — the server accepts any string. A small picker (`diagnosing`, `awaiting_parts`, `in_repair`, `ready_for_pickup`) is used for convenience; nothing about it is schema-enforced, so it's trivially adjustable later if the real business vocabulary differs.
  - `POST /api/device-tracking/return` — `{inquiry_id, device_condition, return_notes, return_image_url}` — resumes the SLA clock.
  - Devices are tracked at the **inquiry** level (`inquiry_id`), a different identifier than the `ticket_id` used everywhere in phase 3a/3b — this phase calls these endpoints directly (not through the generic `/api/data/:table` layer), matching exactly what the web app already does, rather than trying to unify it with the tickets model.
  - `device_image_url`/`return_image_url` are **optional** — the feature is fully functional without a photo attached. **Photo capture is deliberately not built this phase** (would mean adding `expo-image-picker` and an upload step for a field that isn't required); this is a scope simplification, not a broken placeholder — nothing in the UI implies a photo is expected.
  - The employee list endpoint returns *all* of an employee's inquiries, not just device-related ones — the mobile list filters client-side to inquiries where `device_service_enabled` is truthy or `device_status` is already set, so plain non-device tickets don't clutter this screen.
- **EOD Report**: `eod_reports` table (`id, employee_id, content, date`), fully employee-writable, no gaps. Straightforward submit + list, mirroring the leave-request pattern from phase 3b.

## 3. Screens

- **Job Tools** (hub, new tab — replaces the old dashboard-only "Dashboard" position pattern by becoming a sibling, same as Attendance): three navigation rows — Estimator, Device Follow-up, EOD Report — matching NEST's hub layout.
- **Estimator**: the real pricing catalog as a list (name, sub-category, cost); tapping a row adds it to a running total shown at the bottom. Nothing persists — closing the screen clears it, matching the tool's actual purpose (a live quote to show a customer, not a saved record).
- **Device Follow-up** (list): this employee's device-tracking-relevant inquiries (§2 filter), each showing customer name, device type, and a status badge (Pending / Taken / Returned). Tapping opens **Device Detail**.
- **Device Detail** (new sub-screen): customer + device info, the taken/return log if present, the full follow-up history, and three real actions — **Mark Device Taken** (if not yet taken), **Log Follow-up Update** (status picker + notes, always available once taken), **Mark Returned** (if taken and not yet returned) — each a real call to the endpoints in §2.
- **EOD Report**: a text area + submit (same shape as the leave-request form), plus a list of this employee's past reports.

## 4. Navigation

`Job Tools` becomes the employee tab bar's 4th entry (Dashboard, Attendance, **Job Tools**, More), joining the pattern established in phase 3b (`animation: 'none'` sibling swap with Dashboard/Attendance). `Estimator`, `DeviceFollowUp`, `DeviceDetail`, and `EodReport` are drill-down pushes from the Job Tools hub (slide transition, tab bar hidden), the same pattern `TaskDetail`/`LeaveForm` already established.

## 5. API changes

| File | Change |
|---|---|
| `mobile/src/api/pricing.ts` (new) | `fetchServicePricing()` — reads `service_pricing` via the generic data layer |
| `mobile/src/api/deviceTracking.ts` (new) | Calls the bespoke `/api/device-tracking/*` endpoints directly (§2) — `fetchEmployeeDevices`, `fetchDeviceStatus`, `markDeviceTaken`, `logFollowUp`, `markDeviceReturned` |
| `mobile/src/api/eod.ts` (new) | `fetchEodReports`, `submitEodReport` — mirrors `attendance.ts`'s leave-request functions |

## 6. Explicitly out of scope for this phase

- Device/return photo capture — optional fields, not built (§2)
- A fixed, schema-enforced follow-up status vocabulary — the picker's 4 options are a UI convenience over a free-text field, not a real constraint
- Earnings and Profile tabs — later Phase 3 slices
- Any change to how SLA pause/resume works server-side — already correct, untouched
