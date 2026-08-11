# Selfie + Geofenced Clock-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fixed employees must take a selfie and be within a configurable radius of the office to clock in; gig workers are unaffected.

**Architecture:** Extend the existing `attendance` schema and reuse three patterns already proven in this codebase: the `requiredColumns` migration bootstrap, the DB-backed `uploaded_files` photo storage (survives redeploys, unlike the on-disk `uploads/` folder), and the `/api/settings/*` admin-config convention. A new pure Haversine-distance module (mirroring `server/job-card-scoring.cjs` / `server/cache-expiry.cjs`) makes the geofence math independently unit-testable. One new dedicated endpoint (`POST /api/attendance/clock-in-photo`) replaces the plain insert for fixed employees only — gig workers keep the existing code path untouched.

**Tech Stack:** Express 5 + `mysql2` + `multer` (existing `server/index.cjs`), vanilla JS page modules (existing `src/pages/*.js`), `node --test`.

**Spec:** `docs/superpowers/specs/2026-08-10-geofenced-selfie-attendance-design.md`

---

## File Structure

- **Modify** `server/index.cjs` — schema columns, `appSettings`/`loadAppSettings` extension, 3 new endpoints (2 settings + 1 clock-in).
- **Create** `server/geo-distance.cjs` — pure Haversine distance function.
- **Create** `tests/geo-distance.test.mjs` — unit tests.
- **Modify** `package.json` — register the new test file.
- **Modify** `src/pages/employee.js` — clock-in handler branches on `worker_type`; fixed employees get camera capture + geofenced submit.
- **Modify** `src/pages/admin.js` — Settings tab gets an "Office Clock-In Location" card; Attendance Logs table gets a Photo column.

---

### Task 1: Schema + pure distance module + unit tests

**Files:**
- Modify: `server/index.cjs` (the `attendance:` array inside `requiredColumns`)
- Create: `server/geo-distance.cjs`
- Create: `tests/geo-distance.test.mjs`
- Modify: `package.json` (the `test` script)

- [ ] **Step 1: Add the new `attendance` columns**

In `server/index.cjs`, find:

```js
    attendance: [
        { name: 'latitude', definition: 'DECIMAL(10, 7)' },
        { name: 'longitude', definition: 'DECIMAL(10, 7)' },
    ],
```

Replace with:

```js
    attendance: [
        { name: 'latitude', definition: 'DECIMAL(10, 7)' },
        { name: 'longitude', definition: 'DECIMAL(10, 7)' },
        { name: 'selfie_url', definition: 'TEXT' },
        { name: 'distance_from_office_m', definition: 'DECIMAL(8, 2)' },
    ],
```

- [ ] **Step 2: Write the failing test**

Create `tests/geo-distance.test.mjs`:

```js
import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { haversineDistanceMeters } = require('../server/geo-distance.cjs');

test('distance between identical points is zero', () => {
  assert.equal(haversineDistanceMeters(19.076, 72.8777, 19.076, 72.8777), 0);
});

test('one degree of latitude is approximately 111.19km', () => {
  const d = haversineDistanceMeters(0, 0, 1, 0);
  assert.ok(d > 111000 && d < 111400, `expected ~111195m, got ${d}`);
});

test('a small nearby offset is a small distance', () => {
  // ~0.001 degree latitude offset near Mumbai — should be roughly 100-130m.
  const d = haversineDistanceMeters(19.0760, 72.8777, 19.0770, 72.8777);
  assert.ok(d > 90 && d < 140, `expected ~111m, got ${d}`);
});

test('a quarter of the globe is approximately 10,000km', () => {
  const d = haversineDistanceMeters(0, 0, 0, 90);
  assert.ok(d > 9900000 && d < 10100000, `expected ~10007km, got ${d}`);
});

test('distance is symmetric regardless of point order', () => {
  const a = haversineDistanceMeters(19.076, 72.8777, 28.6139, 77.2090);
  const b = haversineDistanceMeters(28.6139, 77.2090, 19.076, 72.8777);
  assert.equal(a, b);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/geo-distance.test.mjs`
Expected: FAIL — `Cannot find module '../server/geo-distance.cjs'`

- [ ] **Step 4: Write the implementation**

Create `server/geo-distance.cjs`:

```js
// Pure great-circle distance calculation used to enforce the attendance
// clock-in geofence. No DB/Express dependency — stays directly unit-testable
// (mirrors server/cache-expiry.cjs and server/job-card-scoring.cjs).

const EARTH_RADIUS_M = 6371000;

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle (Haversine) distance between two lat/lng points, in meters.
 */
function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

module.exports = { haversineDistanceMeters };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/geo-distance.test.mjs`
Expected: PASS — 5 tests, 0 failures

- [ ] **Step 6: Register the new test file**

In `package.json`, the `test` script lists each test file explicitly (this repo doesn't glob). Append `tests/geo-distance.test.mjs` to the end of the existing space-separated list in the `"test"` script.

- [ ] **Step 7: Run the full suite to confirm nothing broke**

Run: `npm test`
Expected: all pass except the one pre-existing, already-accepted unrelated failure in `tests/feedback-routing.test.mjs` (predates this and every other recent feature — do not attempt to fix it).

- [ ] **Step 8: Commit**

```bash
git add server/index.cjs server/geo-distance.cjs tests/geo-distance.test.mjs package.json
git commit -m "feat: add attendance selfie/distance schema and pure distance calculator"
```

---

### Task 2: Admin settings endpoints for the office geofence

**Files:**
- Modify: `server/index.cjs` — the `appSettings` object, `loadAppSettings()`, and two new routes.

- [ ] **Step 1: Add default values to `appSettings`**

Find:

```js
const appSettings = {
    autoClockOutTime: DEFAULT_AUTO_CLOCK_OUT_TIME,
    autoAssignmentEnabled: true,
    // How many times a customer may reopen one ticket (0 = unlimited).
    reopenLimit: 2,
    // Whether the "Issue not resolved" reopen button shows on the landing page.
    reopenButtonEnabled: true,
    // Minutes an assigned-but-not-yet-accepted inquiry waits before it auto-releases
    // to the public gig-worker pool.
    poolReleaseTimeoutMinutes: 30,
};
```

Replace with:

```js
const appSettings = {
    autoClockOutTime: DEFAULT_AUTO_CLOCK_OUT_TIME,
    autoAssignmentEnabled: true,
    // How many times a customer may reopen one ticket (0 = unlimited).
    reopenLimit: 2,
    // Whether the "Issue not resolved" reopen button shows on the landing page.
    reopenButtonEnabled: true,
    // Minutes an assigned-but-not-yet-accepted inquiry waits before it auto-releases
    // to the public gig-worker pool.
    poolReleaseTimeoutMinutes: 30,
    // Office clock-in geofence — null lat/lng means "not configured yet", which
    // makes /api/attendance/clock-in-photo fail safe (reject rather than allow
    // unconstrained clock-ins).
    attendanceGeofenceLat: null,
    attendanceGeofenceLng: null,
    attendanceGeofenceRadiusM: 150,
};
```

- [ ] **Step 2: Load the 3 new settings at startup**

Find:

```js
async function loadAppSettings(connection) {
    const [rows] = await connection.execute(
        'SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (?, ?, ?, ?, ?)',
        ['auto_clock_out_time', 'auto_assignment_enabled', 'reopen_limit', 'reopen_button_enabled', 'pool_release_timeout_minutes']
    );
```

Replace with:

```js
async function loadAppSettings(connection) {
    const [rows] = await connection.execute(
        'SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (?, ?, ?, ?, ?, ?, ?, ?)',
        ['auto_clock_out_time', 'auto_assignment_enabled', 'reopen_limit', 'reopen_button_enabled', 'pool_release_timeout_minutes',
         'attendance_geofence_lat', 'attendance_geofence_lng', 'attendance_geofence_radius_m']
    );
```

Then, right before the closing `}` of `loadAppSettings` (after the existing `poolTimeout` block that ends with `if (Number.isFinite(n) && n > 0) appSettings.poolReleaseTimeoutMinutes = n;\n    }`), add:

```js

    const geoLat = rows.find(row => row.setting_key === 'attendance_geofence_lat')?.setting_value;
    if (geoLat !== undefined && geoLat !== null && geoLat !== '') {
        const n = parseFloat(geoLat);
        if (Number.isFinite(n)) appSettings.attendanceGeofenceLat = n;
    }

    const geoLng = rows.find(row => row.setting_key === 'attendance_geofence_lng')?.setting_value;
    if (geoLng !== undefined && geoLng !== null && geoLng !== '') {
        const n = parseFloat(geoLng);
        if (Number.isFinite(n)) appSettings.attendanceGeofenceLng = n;
    }

    const geoRadius = rows.find(row => row.setting_key === 'attendance_geofence_radius_m')?.setting_value;
    if (geoRadius !== undefined && geoRadius !== null && geoRadius !== '') {
        const n = parseInt(geoRadius, 10);
        if (Number.isFinite(n) && n > 0) appSettings.attendanceGeofenceRadiusM = n;
    }
```

- [ ] **Step 3: Add the two new routes**

Add these near the other `/api/settings/*` routes (e.g. search for `app.get('/api/settings/pool-timeout'` and add directly after that route's closing `});`):

```js
app.get('/api/settings/attendance-geofence', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    res.json({
        lat: appSettings.attendanceGeofenceLat,
        lng: appSettings.attendanceGeofenceLng,
        radiusM: appSettings.attendanceGeofenceRadiusM,
    });
});

app.put('/api/settings/attendance-geofence', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    const radiusM = parseInt(req.body?.radiusM, 10);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return res.status(400).json({ error: 'Invalid latitude' });
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return res.status(400).json({ error: 'Invalid longitude' });
    if (!Number.isFinite(radiusM) || radiusM < 10 || radiusM > 5000) return res.status(400).json({ error: 'Radius must be between 10 and 5000 meters' });
    try {
        await saveAppSetting('attendance_geofence_lat', String(lat));
        await saveAppSetting('attendance_geofence_lng', String(lng));
        await saveAppSetting('attendance_geofence_radius_m', String(radiusM));
        appSettings.attendanceGeofenceLat = lat;
        appSettings.attendanceGeofenceLng = lng;
        appSettings.attendanceGeofenceRadiusM = radiusM;
        res.json({ lat, lng, radiusM });
    } catch (error) {
        console.error('Attendance geofence settings update error:', error);
        res.status(500).json({ error: 'Could not save office location' });
    }
});
```

- [ ] **Step 4: Manual verification**

Run: `node --check server/index.cjs` — expect clean.
Run: `npm start`, then in another terminal:
```bash
curl -H "Authorization: Bearer <admin-token>" http://localhost:5000/api/settings/attendance-geofence
```
Expected: `{"lat":null,"lng":null,"radiusM":150}` (or a real DB-connection error if local MySQL is unreachable in your environment — in that case, confirm instead via `curl http://localhost:5000/api/settings/attendance-geofence` with no token, which should return `401`, proving the route is registered and reached before any DB call).

- [ ] **Step 5: Commit**

```bash
git add server/index.cjs
git commit -m "feat: add admin settings endpoints for the attendance geofence"
```

---

### Task 3: Clock-in-photo endpoint

**Files:**
- Modify: `server/index.cjs` — add the `require`, then the new route (near the existing `/api/upload` endpoint, since it reuses the same upload middleware and `uploaded_files` pattern).

- [ ] **Step 1: Add the `require`**

Near the top of `server/index.cjs`, alongside the other `require(...)` statements (e.g. next to `const { computeLeaderboard } = require('./job-card-scoring.cjs');`), add:

```js
const { haversineDistanceMeters } = require('./geo-distance.cjs');
```

- [ ] **Step 2: Add the endpoint**

Add near `app.post('/api/upload', ...)`:

```js
app.post('/api/attendance/clock-in-photo', authenticateToken, uploadSingle('photo'), async (req, res) => {
    if (req.user.role !== 'employee') return res.sendStatus(403);
    if (req.user.worker_type === 'gig') {
        return res.status(400).json({ error: 'Gig workers use the standard clock-in, not this endpoint.' });
    }
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: 'Location is required to clock in' });
    }

    if (appSettings.attendanceGeofenceLat == null || appSettings.attendanceGeofenceLng == null) {
        return res.status(400).json({ error: 'Office location not configured yet — contact admin.' });
    }

    const distance = haversineDistanceMeters(lat, lng, appSettings.attendanceGeofenceLat, appSettings.attendanceGeofenceLng);
    const radiusM = appSettings.attendanceGeofenceRadiusM || 150;
    if (distance > radiusM) {
        return res.status(400).json({
            error: `You're ${Math.round(distance)}m from the office — must be within ${radiusM}m to clock in.`,
        });
    }

    const today = new Date().toLocaleDateString('en-CA');
    let connection;
    try {
        connection = await getConn();

        const [existing] = await connection.query(
            'SELECT id FROM attendance WHERE user_id = ? AND date = ? LIMIT 1',
            [req.user.id, today]
        );
        if (existing.length) {
            return res.status(400).json({ error: 'Already clocked in today' });
        }

        const ext = path.extname(req.file.originalname || '') || '.jpg';
        const mime = req.file.mimetype || 'image/jpeg';
        const fileId = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
        await connection.query(
            'INSERT INTO uploaded_files (id, mime, data) VALUES (?, ?, ?)',
            [fileId, mime, req.file.buffer]
        );
        const selfieUrl = `/uploads/${fileId}`;

        let locationStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        try {
            const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
            const geoData = await geoRes.json();
            if (geoData.display_name) locationStr = geoData.display_name;
        } catch { /* keep coordinate fallback */ }

        const id = uuidv4();
        await connection.query(
            `INSERT INTO attendance (id, user_id, clock_in, date, location, latitude, longitude, selfie_url, distance_from_office_m, status)
             VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, 'present')`,
            [id, req.user.id, today, locationStr, lat, lng, selfieUrl, distance]
        );

        const [[row]] = await connection.query('SELECT * FROM attendance WHERE id = ? LIMIT 1', [id]);
        res.json(row);
    } catch (err) {
        console.error('[attendance] clock-in-photo failed:', err);
        res.status(500).json({ error: 'Could not clock in' });
    } finally {
        if (connection) connection.release();
    }
});
```

- [ ] **Step 3: Manual verification**

Run: `node --check server/index.cjs` — expect clean.
Run: `npm start`, then:
```bash
curl -X POST http://localhost:5000/api/attendance/clock-in-photo
```
Expected: `401` (no token) — proves the route is registered and reached before the DB/multer logic runs. If you have a real employee token and a working local DB, test the full flow: a request with `lat`/`lng` far from the configured office should get a 400 with the distance message; a request within range with a real image file attached (`-F photo=@test.jpg -F lat=... -F lng=...`) should return the created attendance row as JSON.

- [ ] **Step 4: Commit**

```bash
git add server/index.cjs
git commit -m "feat: add geofenced selfie clock-in endpoint"
```

---

### Task 4: Frontend — employee clock-in flow

**Files:**
- Modify: `src/pages/employee.js` — the `#btn-clock-toggle` handler inside `renderEmployeeDashboard` (search for `// Single Clock In / Clock Out toggle`, don't trust line numbers — earlier tasks in other features have shifted this file).

- [ ] **Step 1: Replace the clock-in handler**

Find this block (currently the entire body from the `// Single Clock In / Clock Out toggle` comment through the end of the `bind('#btn-clock-toggle', ...)` call, i.e. everything up to but NOT including the `// Clock Out — EOD report popup...` comment that follows it):

```js
  // Single Clock In / Clock Out toggle
  bind('#btn-clock-toggle', async () => {
    if (canClockOut) {
      if (!eodReport) { openEodClockOutModal(); return; }
      await doClockOut();
      return;
    }
    if (strictEodBlock) {
      toast('Clock-in is restricted because you have 4 or more missed EOD reports. Contact admin.', 'error');
      return;
    }
    if (isBeforeClockInWindow()) {
      toast('Clock-in is not allowed before 8:00 AM.', 'error');
      return;
    }
    if (isPastAutoClockOut()) {
      toast(`Clock-in is closed after ${parseClockOutTime().label}. Please contact admin.`, 'error');
      return;
    }
    const btn = container.querySelector('#btn-clock-toggle');
    btn.disabled = true; btn.innerHTML = `${ICONS.crosshair}<span>Getting location…</span>`;
    let locationStr = 'Unknown';
    let coords = { lat: null, lng: null, accuracy: null };
    try {
      const pos = await getHighAccuracyPosition();
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      coords = { lat, lng, accuracy };
      try {
        locationStr = await reverseGeocode(lat, lng) || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      } catch (err) {
        locationStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }
    } catch (_) {}
    const { error } = await supabase.from('attendance').insert({
      user_id: user.id, clock_in: new Date().toISOString(), date: today, location: locationStr,
      latitude: coords.lat, longitude: coords.lng, status: 'present'
    });
    if (error) { toast(error.message, 'error'); btn.disabled = false; btn.innerHTML = `${ICONS.play}<span>Clock In</span>`; }
    else { toast('Clocked in!', 'success'); renderEmployeeDashboard(container); }
  });
```

Replace it with:

```js
  // Opens the device's front camera via a native file input and resolves with
  // the captured File, or null if the user backed out without taking a photo.
  // Uses the same native-camera pattern already used for device-service photos
  // elsewhere in this file, just capture="user" (front camera) for a selfie.
  const capturePhoto = () => new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'user';
    input.style.display = 'none';
    document.body.appendChild(input);
    let resolved = false;
    input.addEventListener('change', () => {
      resolved = true;
      const file = input.files && input.files[0] ? input.files[0] : null;
      document.body.removeChild(input);
      resolve(file);
    });
    window.addEventListener('focus', function onFocus() {
      window.removeEventListener('focus', onFocus);
      setTimeout(() => {
        if (!resolved && document.body.contains(input)) {
          document.body.removeChild(input);
          resolve(null);
        }
      }, 500);
    }, { once: true });
    input.click();
  });

  // Gig workers: unchanged plain clock-in, no photo/geofence requirement.
  const plainClockIn = async () => {
    const btn = container.querySelector('#btn-clock-toggle');
    btn.disabled = true; btn.innerHTML = `${ICONS.crosshair}<span>Getting location…</span>`;
    let locationStr = 'Unknown';
    let coords = { lat: null, lng: null, accuracy: null };
    try {
      const pos = await getHighAccuracyPosition();
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      coords = { lat, lng, accuracy };
      try {
        locationStr = await reverseGeocode(lat, lng) || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      } catch (err) {
        locationStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }
    } catch (_) {}
    const { error } = await supabase.from('attendance').insert({
      user_id: user.id, clock_in: new Date().toISOString(), date: today, location: locationStr,
      latitude: coords.lat, longitude: coords.lng, status: 'present'
    });
    if (error) { toast(error.message, 'error'); btn.disabled = false; btn.innerHTML = `${ICONS.play}<span>Clock In</span>`; }
    else { toast('Clocked in!', 'success'); renderEmployeeDashboard(container); }
  };

  // Fixed employees: selfie + hard geofence check via the dedicated endpoint.
  const photoClockIn = async () => {
    const btn = container.querySelector('#btn-clock-toggle');
    btn.disabled = true; btn.innerHTML = `${ICONS.crosshair}<span>Getting location…</span>`;
    let coords;
    try {
      const pos = await getHighAccuracyPosition();
      coords = pos.coords;
    } catch (err) {
      toast('Could not get your location. Enable location access and try again.', 'error');
      btn.disabled = false; btn.innerHTML = `${ICONS.play}<span>Clock In</span>`;
      return;
    }

    btn.innerHTML = `${ICONS.crosshair}<span>Opening camera…</span>`;
    const file = await capturePhoto();
    if (!file) {
      btn.disabled = false; btn.innerHTML = `${ICONS.play}<span>Clock In</span>`;
      return;
    }

    btn.innerHTML = `${ICONS.crosshair}<span>Clocking in…</span>`;
    const formData = new FormData();
    formData.append('photo', file);
    formData.append('lat', String(coords.latitude));
    formData.append('lng', String(coords.longitude));
    formData.append('accuracy', String(coords.accuracy || ''));

    try {
      const token = localStorage.getItem('auth_token');
      const apiBase = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
        ? '/api' : 'http://localhost:5000/api';
      const res = await fetch(`${apiBase}/attendance/clock-in-photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'Could not clock in', 'error');
        btn.disabled = false; btn.innerHTML = `${ICONS.play}<span>Clock In</span>`;
        return;
      }
      toast('Clocked in!', 'success');
      renderEmployeeDashboard(container);
    } catch (err) {
      toast('Network error — could not clock in', 'error');
      btn.disabled = false; btn.innerHTML = `${ICONS.play}<span>Clock In</span>`;
    }
  };

  // Single Clock In / Clock Out toggle
  bind('#btn-clock-toggle', async () => {
    if (canClockOut) {
      if (!eodReport) { openEodClockOutModal(); return; }
      await doClockOut();
      return;
    }
    if (strictEodBlock) {
      toast('Clock-in is restricted because you have 4 or more missed EOD reports. Contact admin.', 'error');
      return;
    }
    if (isBeforeClockInWindow()) {
      toast('Clock-in is not allowed before 8:00 AM.', 'error');
      return;
    }
    if (isPastAutoClockOut()) {
      toast(`Clock-in is closed after ${parseClockOutTime().label}. Please contact admin.`, 'error');
      return;
    }
    if (isGigWorker) {
      await plainClockIn();
    } else {
      await photoClockIn();
    }
  });
```

Note: `isGigWorker` is already declared earlier in `renderEmployeeDashboard` (`const isGigWorker = user.worker_type === 'gig';`) and is in scope here — do not redeclare it.

- [ ] **Step 2: Verify the build**

Run: `node --check src/pages/employee.js` — this will report a syntax note about ESM `import`/`export` (expected, not a real error) but will catch a genuinely broken edit. The real check is:
Run: `npm run build`
Expected: succeeds with no errors, and the `employee` chunk in the build output changes size (confirms the edit was picked up).

- [ ] **Step 3: Commit**

```bash
git add src/pages/employee.js
git commit -m "feat: require selfie + geofence check for fixed-employee clock-in"
```

---

### Task 5: Admin Settings UI — office location control

**Files:**
- Modify: `src/pages/admin.js` — `renderSettingsTab` (search for `Auto Clock-Out Time`, don't trust line numbers).

- [ ] **Step 1: Fetch the geofence settings alongside the others**

Find the `let autoClockOutTime = "18:00";` declaration near the top of `renderSettingsTab`, and the `Promise.all([...])` block that fetches `attendanceRes, keysRes, popupRes, deviceRes, reopenRes, poolTimeoutRes`. Add a matching declaration and fetch:

Right after `let poolTimeoutMinutes = 30;`, add:

```js
  let geofenceLat = null;
  let geofenceLng = null;
  let geofenceRadiusM = 150;
```

In the `Promise.all([...])` array, add a 7th entry (matching the style of the existing 6):

```js
      fetch(`${settingsApiBase}/settings/attendance-geofence`, {
        headers: authHeaders(),
      }),
```

And capture it in the destructured result — change:

```js
    const [attendanceRes, keysRes, popupRes, deviceRes, reopenRes, poolTimeoutRes] = await Promise.all([
```

to:

```js
    const [attendanceRes, keysRes, popupRes, deviceRes, reopenRes, poolTimeoutRes, geofenceRes] = await Promise.all([
```

Then, near the other `if (xRes.ok) { ... }` blocks that follow (e.g. right after the block handling `poolTimeoutRes`), add:

```js
    if (geofenceRes.ok) {
      const data = await geofenceRes.json();
      geofenceLat = data.lat;
      geofenceLng = data.lng;
      geofenceRadiusM = data.radiusM || 150;
    }
```

- [ ] **Step 2: Add the settings card**

Find this block (the end of the Auto Clock-Out Time card):

```js
        <p class="settings-helper">
          Employees clocked in after this time will be auto-clocked out. Current: <b id="current-clockout-time">${autoClockOutTime}</b>
        </p>
      </div>
```

Add a new `.settings-card` directly after it (before the next card in the file, "Landing Page Popup"):

```js
        <p class="settings-helper">
          Employees clocked in after this time will be auto-clocked out. Current: <b id="current-clockout-time">${autoClockOutTime}</b>
        </p>
      </div>

      <div class="settings-card">
        <div class="settings-card-head">
          <span class="settings-card-icon">${ICONS.pin}</span>
          <div>
            <h3>Office Clock-In Location</h3>
            <p>Fixed employees must be within this radius (and take a selfie) to clock in.</p>
          </div>
        </div>

        <div class="settings-alert settings-alert-danger">
          <span>${ICONS.alert}</span>
          <small>Until this is set, fixed employees cannot clock in at all — the check fails safe.</small>
        </div>

        <div class="settings-form-row">
          <button class="btn btn-secondary" id="capture-office-location" type="button">${ICONS.crosshair}<span>Set office location here</span></button>
        </div>

        <div class="settings-form-row">
          <label class="sr-only" for="geofence-lat">Latitude</label>
          <input type="text" id="geofence-lat" placeholder="Latitude" value="${geofenceLat ?? ''}" class="settings-time-input" style="width:140px;">
          <label class="sr-only" for="geofence-lng">Longitude</label>
          <input type="text" id="geofence-lng" placeholder="Longitude" value="${geofenceLng ?? ''}" class="settings-time-input" style="width:140px;">
          <label class="sr-only" for="geofence-radius">Radius (meters)</label>
          <input type="number" id="geofence-radius" placeholder="Radius (m)" value="${geofenceRadiusM}" min="10" max="5000" class="settings-time-input" style="width:110px;">
          <button class="btn btn-primary settings-save-btn" id="save-geofence">
            ${ICONS.check}
            <span>Save</span>
          </button>
        </div>

        <p class="settings-helper" id="geofence-current-helper">
          Current: <b id="current-geofence">${geofenceLat != null && geofenceLng != null ? `${geofenceLat}, ${geofenceLng} (±${geofenceRadiusM}m)` : 'Not configured yet'}</b>
        </p>
      </div>
```

- [ ] **Step 3: Wire up the handlers**

Find `container.querySelector("#save-clockout-time").onclick = async () => { ... };` and add the following directly after its closing `};`:

```js

  container.querySelector("#capture-office-location").onclick = () => {
    if (!navigator.geolocation) {
      toast("Geolocation is not supported in this browser", "error");
      return;
    }
    const btn = container.querySelector("#capture-office-location");
    const restore = setButtonLoading(btn, "Locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        container.querySelector("#geofence-lat").value = pos.coords.latitude.toFixed(7);
        container.querySelector("#geofence-lng").value = pos.coords.longitude.toFixed(7);
        toast("Location captured — review and click Save", "success");
        restore();
      },
      (err) => {
        toast(err.message || "Could not get your location", "error");
        restore();
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  container.querySelector("#save-geofence").onclick = async () => {
    const lat = Number(container.querySelector("#geofence-lat").value);
    const lng = Number(container.querySelector("#geofence-lng").value);
    const radiusM = parseInt(container.querySelector("#geofence-radius").value, 10);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast("Enter a valid latitude and longitude (or use \"Set office location here\")", "warning");
      return;
    }
    const btn = container.querySelector("#save-geofence");
    const restore = setButtonLoading(btn, "Saving");
    try {
      const res = await fetch(`${settingsApiBase}/settings/attendance-geofence`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ lat, lng, radiusM }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save office location");
      geofenceLat = data.lat;
      geofenceLng = data.lng;
      geofenceRadiusM = data.radiusM;
      const current = container.querySelector("#current-geofence");
      if (current) current.textContent = `${geofenceLat}, ${geofenceLng} (±${geofenceRadiusM}m)`;
      toast("Office location saved", "success");
    } catch (err) {
      toast(err.message || "Could not save office location", "error");
    } finally {
      restore();
    }
  };
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin.js
git commit -m "feat: add admin settings UI for the office clock-in geofence"
```

---

### Task 6: Admin Attendance view — selfie thumbnail

**Files:**
- Modify: `src/pages/admin.js` — `renderAttendance` (search for `attendance-log-rows`, don't trust line numbers).

- [ ] **Step 1: Add the Photo column to the table header and empty state**

Find:

```js
      ? '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No records found</td></tr>'
```

Change `colspan="6"` to `colspan="7"`.

Find:

```js
<thead><tr><th>Date</th><th>Employee</th><th>Clock In</th><th>Clock Out</th><th>Hours Worked</th><th>Location</th></tr></thead>
```

Change to:

```js
<thead><tr><th>Date</th><th>Employee</th><th>Clock In</th><th>Clock Out</th><th>Hours Worked</th><th>Location</th><th>Photo</th></tr></thead>
```

- [ ] **Step 2: Add the thumbnail cell to each row**

Find the row template (a single-line template literal starting `return \`<tr>` inside the `.map((x) => { ... })` in `rowHtml`). It currently ends with the Location `<td>` and closes with `</tr>\``. Right before the final `</tr>\`;`, add a new `<td>` for the photo:

The row currently ends with (abbreviated — the real line is long, locate it by the `att-view-map` button and the trailing `</tr>` ):

```js
...${hasCoords ? `<button type="button" class="btn-icon att-view-map" data-lat="${x.latitude}" data-lng="${x.longitude}" data-name="${escapeHtml(x.profiles?.full_name || "Employee")}" title="View on map" style="border:none;background:transparent;cursor:pointer;color:var(--primary);display:inline-flex;padding:2px;">${ICONS.pin}</button>` : ""}</td>        </tr>`;
```

Change the very end of that string, right before the closing `</tr>\`;`, from:

```js
</td>        </tr>`;
```

to:

```js
</td>          <td>${x.selfie_url ? `<a href="${x.selfie_url}" target="_blank" rel="noopener"><img src="${x.selfie_url}" alt="Clock-in selfie" style="width:32px;height:32px;border-radius:6px;object-fit:cover;border:1px solid var(--border);"/></a>` : '<span style="color:var(--text-dim)">—</span>'}</td>        </tr>`;
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin.js
git commit -m "feat: show clock-in selfie thumbnail in the admin attendance log"
```

---

### Task 7: Consistency audit + full test/build run

**Files:** none (verification only)

- [ ] **Step 1: Cross-file consistency audit**

Read across every file this feature touched and confirm they agree on data shapes (this is the check that catches "frontend expects field X, endpoint returns field Y" bugs that neither `node --check` nor `npm run build` catch, since JS doesn't type-check object shapes):

- `src/pages/employee.js`'s `photoClockIn` sends `FormData` fields `photo`, `lat`, `lng`, `accuracy` — confirm `server/index.cjs`'s `POST /api/attendance/clock-in-photo` reads exactly `req.file` (from the `photo` field, via `uploadSingle('photo')`), `req.body.lat`, `req.body.lng`.
- `src/pages/admin.js`'s geofence save handler POSTs `{lat, lng, radiusM}` — confirm the `PUT /api/settings/attendance-geofence` endpoint reads exactly those three field names from `req.body`.
- `src/pages/admin.js`'s geofence fetch expects `{lat, lng, radiusM}` back from `GET /api/settings/attendance-geofence` — confirm the response shape matches.
- `src/pages/admin.js`'s attendance row template reads `x.selfie_url` — confirm the `attendance` table actually has this column (Task 1) and the clock-in-photo endpoint actually writes it (Task 3).
- Confirm `appSettings.attendanceGeofenceLat`/`Lng`/`RadiusM` are spelled identically everywhere they're referenced (the object definition, `loadAppSettings`, both settings routes, and the clock-in-photo endpoint).

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all pass except the one pre-existing, already-accepted unrelated failure in `tests/feedback-routing.test.mjs`.

- [ ] **Step 3: Run a full production build**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 4: Honest verification-limits note**

This feature's actual runtime behavior (geolocation permission prompts, real camera capture on a phone, the geofence math against real GPS noise, the multipart upload actually reaching the DB) has not been exercised against a live database or a real device in this environment, for the same reason noted in prior features built in this session (local MySQL access has been unreliable throughout). Record this plainly in the final report rather than implying full verification.

---

## Self-Review Notes

- **Spec coverage:** §2 (gig-worker exclusion) → Tasks 3-4. §3 (schema) → Task 1. §4 (photo storage) → Task 3. §5 (endpoint + fail-safe when unconfigured) → Task 3. §6 (frontend flow) → Task 4. §7 (admin geofence config) → Tasks 2, 5. §8 (viewing selfies) → Task 6. §9 (error table) → Task 3's exact status codes/messages match the table. §10 (testing) → Task 1.
- **Naming consistency:** `haversineDistanceMeters` (Task 1) is the exact name imported and called in Task 3. `attendanceGeofenceLat`/`Lng`/`RadiusM` are spelled identically across Tasks 2 and 3. `selfie_url`/`distance_from_office_m` are spelled identically across Tasks 1, 3, and 6.
- **Scope check:** self-contained — no dependency on the Job Card feature or any other in-flight work. Produces working, testable software on its own.
