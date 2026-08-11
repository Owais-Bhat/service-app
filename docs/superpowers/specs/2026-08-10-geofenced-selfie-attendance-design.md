# Selfie + Geofenced Clock-In — Design

Date: 2026-08-10
Status: Approved for planning

## 1. Purpose

Networking Experts' 4 fixed technicians currently clock in from anywhere — the app
already captures GPS coordinates on clock-in (`server/index.cjs` `requiredColumns.attendance`:
`latitude`, `longitude`), but nothing is validated or enforced, and there's no photo
proof of who actually clocked in. This adds two hard requirements to clock-in for
fixed employees only:

1. A **selfie** (front-camera photo) captured at the moment of clock-in.
2. A **hard geofence check** — clock-in is rejected outright if the employee's GPS
   position is outside a configurable radius of the office location. No submission
   happens outside the radius; there is no override or "reason" escape hatch.

**Explicitly out of scope**: face-matching/recognition (the photo is captured and
stored for the owner to review manually, not automatically verified against an
enrolled reference), clock-out enforcement (unchanged — clock-out keeps today's EOD
report gate, no photo/location check), and per-employee/per-site geofences (one
office location applies to all fixed employees).

## 2. Who this applies to

Only employees with `profiles.worker_type != 'gig'` (the existing "fixed vs gig"
distinction already used elsewhere in this app, e.g. the Installations tab toggle
and the gig-worker payout system). Gig workers have no fixed base and keep today's
plain clock-in flow (`supabase.from('attendance').insert(...)` in
`src/pages/employee.js`, unchanged) — this feature does not touch that code path at
all.

## 3. Data model

New `attendance` columns (added the same way as the app's existing `requiredColumns`
pattern):

```sql
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS selfie_url TEXT,
  ADD COLUMN IF NOT EXISTS distance_from_office_m DECIMAL(8, 2);
```

Office geofence configuration reuses the existing `app_settings` key-value table
(already used for other app-wide settings via `loadAppSettings`/`saveAppSetting`) —
no new table:

- `attendance_geofence_lat` (string, decimal degrees)
- `attendance_geofence_lng` (string, decimal degrees)
- `attendance_geofence_radius_m` (string, integer meters — default `150` if unset)

If the geofence isn't configured yet (`attendance_geofence_lat`/`lng` missing), the
clock-in endpoint fails safe: it rejects with a clear "office location not
configured yet — contact admin" message rather than silently allowing an
unconstrained clock-in. This means the admin must set the office location once
before any fixed employee can clock in under the new flow.

## 4. Photo storage

Reuses the app's existing DB-backed upload pattern (`server/index.cjs`, the
`uploaded_files` table + `/uploads/:id` route) rather than the on-disk `uploads/`
folder — the codebase's own comment on that pattern explains why: the on-disk
folder is wiped on every redeploy, so anything meant to persist goes into MySQL as
bytes. The selfie is no exception; it must survive redeploys the same way every
other persisted image in this app does.

## 5. Backend: one new endpoint

`POST /api/attendance/clock-in-photo` — multipart form, fields: `photo` (image
file), `lat`, `lng`, `accuracy` (from the browser's Geolocation API, already
captured today via the existing `getHighAccuracyPosition()` helper in
`employee.js`).

Flow:

1. `authenticateToken`. Look up the caller's `worker_type` from `profiles`. If
   `gig`, reject with 400 — this endpoint is fixed-employee-only, gig workers must
   use the existing plain insert path.
2. Load `attendance_geofence_lat`/`lng`/`radius_m` from `app_settings`. If lat/lng
   are missing, reject with 400 ("office location not configured").
3. Compute great-circle distance (Haversine formula) between the submitted
   `lat`/`lng` and the configured office point.
4. If distance > radius: reject with 400, message includes how far off they are
   (e.g. "You're 420m from the office — must be within 150m to clock in.").
   **Nothing is stored** on this path — no photo write, no attendance row.
5. If within radius: store the photo via the existing `uploadSingle`/
   `uploaded_files` pattern, then insert the `attendance` row with `clock_in`,
   `date`, `location` (reverse-geocoded string, same as today), `latitude`,
   `longitude`, `selfie_url`, `distance_from_office_m`, `status: 'present'`.
6. Return the created row.

This mirrors the existing plain clock-in's DB write exactly, just gated by the
photo+distance check first and going through a dedicated endpoint (not the generic
`/api/data/:table` CRUD route, since this needs custom validation logic the generic
endpoint doesn't support).

## 6. Frontend: employee clock-in flow

In `src/pages/employee.js`, the `#btn-clock-toggle` clock-in handler branches on
`worker_type`:

- **Gig workers**: unchanged — today's exact `supabase.from('attendance').insert(...)`
  call, no photo, no geofence.
- **Fixed employees**: after getting GPS (already happens today), instead of
  inserting directly, show a camera-capture step:
  1. An `<input type="file" accept="image/*" capture="user">` (front camera) is
     triggered — same native-camera pattern already used for device-service
     photos elsewhere in this file, just `capture="user"` instead of
     `"environment"` for a front-facing selfie.
  2. On file selected, build `FormData` with the photo + `lat`/`lng`/`accuracy`,
     POST to `/api/attendance/clock-in-photo`.
  3. On a 400 (out of range / not configured / gig-worker-misroute), show the
     server's error message via `toast(..., 'error')` and do not clock in —
     button re-enables, employee can retry once actually in range.
  4. On success, same as today: toast "Clocked in!", re-render the dashboard.

## 7. Admin: configuring the geofence

New endpoints, admin-only:

- `GET /api/admin/attendance-geofence` — returns current lat/lng/radius (or nulls
  if unconfigured).
- `POST /api/admin/attendance-geofence` — body `{ lat, lng, radius_m }`, writes to
  `app_settings` via the existing `saveAppSetting` helper.

UI: a small control added to the existing Settings tab (`renderSettingsTab` in
`src/pages/admin.js`) — "Office Clock-In Location" section with:
- A "Set office location here" button that calls the browser's Geolocation API
  (from wherever the admin is standing when they click it — intended to be used
  once, at the office) and fills in the lat/lng fields.
- A radius input (meters), defaulting to 150 if unset.
- Save button → `POST /api/admin/attendance-geofence`.
- Read-only display of the currently saved lat/lng/radius, so the admin can
  confirm it's set correctly without needing to re-capture.

## 8. Admin: viewing captured selfies

The existing Attendance admin view (`renderAttendance` in `src/pages/admin.js`)
gets a small thumbnail added to each row that has a `selfie_url`, linking to the
full-size image (served from `/uploads/:id`, same as every other stored image in
this app). Rows without a `selfie_url` (gig workers, or old rows from before this
feature shipped) show nothing extra — no layout break for historical data.

## 9. Error handling summary

| Condition | Result |
|---|---|
| Gig worker hits the new endpoint | 400, use standard clock-in instead |
| Geofence not configured | 400, "office location not configured — contact admin" |
| GPS outside radius | 400, "you're Xm from the office — must be within Ym" — no data saved |
| Photo missing/invalid | 400 (multer's existing size/type error handling, same as other uploads) |
| Everything valid | 200, attendance row created with selfie + distance recorded |

## 10. Testing

`server/job-card-scoring.cjs`-style pure function for the distance calculation
(`haversineDistanceMeters(lat1, lng1, lat2, lng2)`), extracted so it's unit
testable without a DB — same pattern already established in this codebase for
`server/cache-expiry.cjs` and `server/job-card-scoring.cjs`.
