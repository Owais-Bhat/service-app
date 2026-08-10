# Job Card & Technician Reward System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Job Card tab (admin-only) that records completed jobs as facts, gates a 3-day customer verification call, and computes a single ₹2000/month reward for the top technician based on verified rating + time efficiency.

**Architecture:** Extend the existing `inquiries` table (mirroring the app's existing `requiredColumns`/`requiredTables` bootstrap-migration pattern) with job-card fields; add two small new tables (`job_card_items`, `technician_awards`). A background reminder job mirrors the existing `runSlaChecks` pattern. All new business math (time efficiency, leaderboard ranking) lives in a pure, unit-tested CommonJS module, the same pattern already used by `server/cache-expiry.cjs`. A new focused frontend page module (`src/pages/job-cards.js`, styled like `src/pages/device-tracking-admin.js`) is wired into the existing lazy-loaded admin nav in `src/main.js`.

**Tech Stack:** Express 5 + `mysql2` (existing `server/index.cjs`), vanilla JS page modules (existing `src/pages/*.js`), `node --test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-08-10-job-card-reward-system-design.md`

---

## Important: don't confuse with existing features

- There is already a `startLeaderboardJob()` / `runMonthlyLeaderboard()` in `server/index.cjs` (~line 983-1030) and a nav tab labeled **"Leaderboard"** (id `feedback`, ~`src/main.js:156`). That existing feature ranks employees by **revenue collected** and only sends a congratulations notification — it has nothing to do with this plan. Do not rename, repurpose, or merge into it. All new job/functions/tables in this plan use `job_card` / `verification_call` / `technician_award` naming to stay unambiguous.
- The existing `feedback_rating` column on `inquiries` is currently populated by the public self-service tracker. This plan repurposes it: the verification call **overwrites** it. No new rating column is added.

## File Structure

- **Modify** `server/index.cjs` — schema entries, 5 new endpoints, 1 new background job, finance summary addition, `startServer()` wiring.
- **Create** `server/job-card-scoring.cjs` — pure functions: time-efficiency calc, per-technician monthly leaderboard aggregation. No DB or Express dependency, so it's directly unit-testable.
- **Create** `tests/job-card-scoring.test.mjs` — unit tests for the above.
- **Modify** `package.json` — add the new test file to the `test` script's explicit file list (this repo doesn't glob).
- **Create** `src/pages/job-cards.js` — the admin page module (4 views: Pending Entry, Awaiting Verification, + New Job Card, Leaderboard), styled after `src/pages/device-tracking-admin.js`.
- **Modify** `src/main.js` — add the `job-cards` nav entry and `PAGE_LOADERS.admin` lazy-import.
- **Modify** `src/pages/finance.js` — add a "Job Card Activity" KPI card next to the existing Gig Worker Pool card.

---

### Task 1: Schema — new columns and tables

**Files:**
- Modify: `server/index.cjs:1097-1168` (the `inquiries:` array inside `requiredColumns`)
- Modify: `server/index.cjs:1200` (the `requiredTables` array, add two new `CREATE TABLE` entries)

- [ ] **Step 1: Add the new `inquiries` columns**

In `server/index.cjs`, inside `requiredColumns.inquiries` (the array that currently ends with `{ name: 'gig_payout_paid_at', definition: 'TIMESTAMP NULL' },` around line 1167), add:

```js
        { name: 'job_card_type', definition: "VARCHAR(20) DEFAULT NULL COMMENT \"'service' or 'installation'\"" },
        { name: 'secondary_employee_id', definition: 'VARCHAR(36) DEFAULT NULL' },
        { name: 'job_start_time', definition: 'TIMESTAMP NULL' },
        { name: 'job_end_time', definition: 'TIMESTAMP NULL' },
        { name: 'expected_time_minutes', definition: 'INT DEFAULT NULL' },
        { name: 'work_done_note', definition: 'TEXT' },
        { name: 'rework_required', definition: 'TINYINT(1) DEFAULT 0' },
        { name: 'job_card_filled_by', definition: 'VARCHAR(36) DEFAULT NULL' },
        { name: 'job_card_filled_at', definition: 'TIMESTAMP NULL' },
        { name: 'verification_due_at', definition: 'TIMESTAMP NULL' },
        { name: 'verification_call_status', definition: "VARCHAR(20) DEFAULT NULL COMMENT \"'confirmed_ok' | 'issue_found' | 'unreachable'\"" },
        { name: 'verification_call_note', definition: 'TEXT' },
        { name: 'verification_call_at', definition: 'TIMESTAMP NULL' },
        { name: 'verification_reminder_sent', definition: 'TINYINT(1) DEFAULT 0' },
```

- [ ] **Step 2: Add the two new tables**

In `server/index.cjs`, inside the `requiredTables` array (it's a plain array of template-literal SQL strings — add two more entries anywhere in the array, e.g. right after the `installations` entry around line 1494-1548):

```js
    `CREATE TABLE IF NOT EXISTS job_card_items (
        id VARCHAR(36) PRIMARY KEY,
        inquiry_id VARCHAR(36) NOT NULL,
        item_name VARCHAR(255) NOT NULL,
        quantity VARCHAR(50),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_job_card_items_inquiry (inquiry_id),
        FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS technician_awards (
        id VARCHAR(36) PRIMARY KEY,
        employee_id VARCHAR(36) NOT NULL,
        month VARCHAR(7) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL DEFAULT 2000,
        avg_rating DECIMAL(3, 2),
        avg_time_efficiency DECIMAL(5, 2),
        awarded_by VARCHAR(36),
        awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_month (month),
        FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE CASCADE
    )`,
```

- [ ] **Step 3: Verify the migration runs**

Run: `npm start` (from the project root; this runs `node server.cjs`, which loads `server/index.cjs`)
Expected: console shows `[Schema] Adding missing column inquiries.job_card_type` (and the rest of the new columns) followed by `✅ Database connected successfully!` and `🚀 Server running on port 5000`. Stop the server with Ctrl+C once confirmed — `ensureRequiredColumns` is idempotent, so it's safe to leave running or restart.

- [ ] **Step 4: Commit**

```bash
git add server/index.cjs
git commit -m "feat: add job card schema (columns + job_card_items + technician_awards)"
```

---

### Task 2: Pure scoring/leaderboard module + unit tests

**Files:**
- Create: `server/job-card-scoring.cjs`
- Create: `tests/job-card-scoring.test.mjs`
- Modify: `package.json:8` (the `test` script)

- [ ] **Step 1: Write the failing test**

Create `tests/job-card-scoring.test.mjs`:

```js
import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { computeTimeEfficiency, computeLeaderboard } = require('../server/job-card-scoring.cjs');

test('time efficiency is 1.0 when actual matches expected', () => {
  assert.equal(computeTimeEfficiency(240, 240), 1);
});

test('time efficiency is capped at 1.0 when finishing early', () => {
  assert.equal(computeTimeEfficiency(240, 120), 1);
});

test('time efficiency drops below 1.0 when running over', () => {
  assert.equal(computeTimeEfficiency(240, 480), 0.5);
});

test('time efficiency is null when inputs are missing or invalid', () => {
  assert.equal(computeTimeEfficiency(null, 120), null);
  assert.equal(computeTimeEfficiency(240, null), null);
  assert.equal(computeTimeEfficiency(240, 0), null);
});

test('leaderboard credits both technicians on a 2-person job', () => {
  const jobs = [
    {
      assigned_employee_id: 'emp-1', assigned_employee_name: 'Amit',
      secondary_employee_id: 'emp-2', secondary_employee_name: 'Rohan',
      feedback_rating: 5, expected_time_minutes: 240, actual_minutes: 240,
    },
  ];
  const board = computeLeaderboard(jobs);
  assert.equal(board.length, 2);
  const amit = board.find(r => r.employeeId === 'emp-1');
  const rohan = board.find(r => r.employeeId === 'emp-2');
  assert.equal(amit.jobsCount, 1);
  assert.equal(rohan.jobsCount, 1);
  assert.equal(amit.avgRating, 5);
  assert.equal(amit.avgTimeEfficiency, 1);
});

test('leaderboard averages across multiple jobs and sorts by combined score descending', () => {
  const jobs = [
    { assigned_employee_id: 'emp-1', assigned_employee_name: 'Amit', secondary_employee_id: null, secondary_employee_name: null, feedback_rating: 5, expected_time_minutes: 240, actual_minutes: 240 },
    { assigned_employee_id: 'emp-1', assigned_employee_name: 'Amit', secondary_employee_id: null, secondary_employee_name: null, feedback_rating: 3, expected_time_minutes: 240, actual_minutes: 480 },
    { assigned_employee_id: 'emp-2', assigned_employee_name: 'Sunil', secondary_employee_id: null, secondary_employee_name: null, feedback_rating: 4, expected_time_minutes: 240, actual_minutes: 240 },
  ];
  const board = computeLeaderboard(jobs);
  assert.equal(board[0].employeeId, 'emp-2'); // Sunil: rating 4, efficiency 1.0 -> beats Amit's average
  assert.equal(board.length, 2);
  const amit = board.find(r => r.employeeId === 'emp-1');
  assert.equal(amit.jobsCount, 2);
  assert.equal(amit.avgRating, 4); // (5+3)/2
  assert.equal(amit.avgTimeEfficiency, 0.75); // (1.0 + 0.5) / 2
});

test('leaderboard skips jobs with no rating for the rating average but still counts time efficiency', () => {
  const jobs = [
    { assigned_employee_id: 'emp-1', assigned_employee_name: 'Amit', secondary_employee_id: null, secondary_employee_name: null, feedback_rating: null, expected_time_minutes: 240, actual_minutes: 240 },
  ];
  const board = computeLeaderboard(jobs);
  assert.equal(board[0].avgRating, null);
  assert.equal(board[0].avgTimeEfficiency, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/job-card-scoring.test.mjs`
Expected: FAIL — `Cannot find module '../server/job-card-scoring.cjs'`

- [ ] **Step 3: Write the implementation**

Create `server/job-card-scoring.cjs`:

```js
// Pure functions for job-card time scoring and the monthly technician
// leaderboard. No DB or Express dependency — keep it that way so it stays
// directly unit-testable (mirrors the server/cache-expiry.cjs pattern).

/**
 * Ratio of expected time to actual time, capped at 1.0 so finishing early
 * doesn't earn more than full credit (avoids rewarding rushed jobs).
 * Returns null if either input is missing/invalid.
 */
function computeTimeEfficiency(expectedMinutes, actualMinutes) {
  const expected = Number(expectedMinutes);
  const actual = Number(actualMinutes);
  if (!expected || expected <= 0 || !actual || actual <= 0) return null;
  return Math.min(1, expected / actual);
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * jobs: array of
 *   { assigned_employee_id, assigned_employee_name,
 *     secondary_employee_id, secondary_employee_name,
 *     feedback_rating, expected_time_minutes, actual_minutes }
 * Only verified jobs (verification_call_status IN confirmed_ok/issue_found)
 * should be passed in — filtering happens at the SQL layer, not here.
 *
 * Returns an array sorted by combinedScore descending:
 *   { employeeId, name, avgRating, avgTimeEfficiency, jobsCount, combinedScore }
 */
function computeLeaderboard(jobs) {
  const byEmployee = new Map();

  const credit = (id, name, rating, efficiency) => {
    if (!id) return;
    let entry = byEmployee.get(id);
    if (!entry) {
      entry = { employeeId: id, name: name || 'Unknown', ratings: [], efficiencies: [], jobsCount: 0 };
      byEmployee.set(id, entry);
    }
    entry.jobsCount += 1;
    if (rating != null) entry.ratings.push(Number(rating));
    if (efficiency != null) entry.efficiencies.push(efficiency);
  };

  for (const job of jobs) {
    const efficiency = computeTimeEfficiency(job.expected_time_minutes, job.actual_minutes);
    credit(job.assigned_employee_id, job.assigned_employee_name, job.feedback_rating, efficiency);
    if (job.secondary_employee_id) {
      credit(job.secondary_employee_id, job.secondary_employee_name, job.feedback_rating, efficiency);
    }
  }

  const avg = (arr) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : null);

  const rows = Array.from(byEmployee.values()).map((e) => {
    const avgRating = avg(e.ratings);
    const avgTimeEfficiency = avg(e.efficiencies);
    const components = [];
    if (avgRating != null) components.push((avgRating / 5) * 100);
    if (avgTimeEfficiency != null) components.push(avgTimeEfficiency * 100);
    const combinedScore = components.length ? round2(avg(components)) : 0;
    return {
      employeeId: e.employeeId,
      name: e.name,
      avgRating: avgRating != null ? round2(avgRating) : null,
      avgTimeEfficiency: avgTimeEfficiency != null ? round2(avgTimeEfficiency) : null,
      jobsCount: e.jobsCount,
      combinedScore,
    };
  });

  rows.sort((a, b) => b.combinedScore - a.combinedScore);
  return rows;
}

module.exports = { computeTimeEfficiency, computeLeaderboard };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/job-card-scoring.test.mjs`
Expected: PASS — 7 tests, 0 failures

- [ ] **Step 5: Register the new test file**

In `package.json`, the `test` script currently lists each test file explicitly:

```json
"test": "node --test tests/pdf-rendering.test.mjs tests/fast2sms.test.mjs tests/feedback-routing.test.mjs tests/landing-performance.test.mjs tests/ai-assistant-provider.test.mjs tests/manage-task-context.test.mjs tests/cache-expiry.test.mjs",
```

Append `tests/job-card-scoring.test.mjs` to the end of that space-separated list.

- [ ] **Step 6: Run the full suite to confirm nothing broke**

Run: `npm test`
Expected: all test files pass, including the new one.

- [ ] **Step 7: Commit**

```bash
git add server/job-card-scoring.cjs tests/job-card-scoring.test.mjs package.json
git commit -m "feat: add pure time-efficiency and leaderboard scoring module"
```

---

### Task 3: Job Card create/update endpoint

**Files:**
- Modify: `server/index.cjs` — add near the other `/api/inquiries/:id/*` handlers (e.g. after the `claim` handler around line 5243-5270)

- [ ] **Step 1: Add the endpoint**

```js
app.post('/api/inquiries/:id/job-card', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { id } = req.params;
    const {
        job_card_type, category, secondary_employee_id,
        job_start_time, job_end_time, expected_time_minutes,
        work_done_note, rework_required, items,
    } = req.body || {};

    if (!['service', 'installation'].includes(job_card_type)) {
        return res.status(400).json({ error: 'job_card_type must be "service" or "installation"' });
    }

    let connection;
    try {
        connection = await getConn();
        const [existing] = await connection.query('SELECT id FROM inquiries WHERE id = ? LIMIT 1', [id]);
        if (!existing.length) return res.status(404).json({ error: 'Job not found' });

        await connection.query(
            `UPDATE inquiries SET
                job_card_type = ?, category = COALESCE(?, category), secondary_employee_id = ?,
                job_start_time = ?, job_end_time = ?, expected_time_minutes = ?,
                work_done_note = ?, rework_required = ?,
                job_card_filled_by = ?, job_card_filled_at = NOW(),
                verification_due_at = DATE_ADD(NOW(), INTERVAL 3 DAY),
                verification_reminder_sent = 0
             WHERE id = ?`,
            [
                job_card_type, category || null, secondary_employee_id || null,
                job_start_time || null, job_end_time || null, expected_time_minutes || null,
                work_done_note || null, rework_required ? 1 : 0,
                req.user.id, id,
            ]
        );

        await connection.query('DELETE FROM job_card_items WHERE inquiry_id = ?', [id]);
        const itemList = Array.isArray(items) ? items.filter(it => it && it.item_name) : [];
        for (const item of itemList) {
            await connection.query(
                'INSERT INTO job_card_items (id, inquiry_id, item_name, quantity, notes) VALUES (?, ?, ?, ?, ?)',
                [uuidv4(), id, String(item.item_name).slice(0, 255), item.quantity ? String(item.quantity).slice(0, 50) : null, item.notes || null]
            );
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('[job-card] save failed:', err);
        res.status(500).json({ error: 'Could not save job card' });
    } finally {
        if (connection) connection.release();
    }
});
```

- [ ] **Step 2: Manual verification**

Run: `npm start` in one terminal. In another:

```bash
curl -X POST http://localhost:5000/api/inquiries/<a-real-inquiry-id>/job-card \
  -H "Authorization: Bearer <admin-token>" -H "Content-Type: application/json" \
  -d '{"job_card_type":"installation","expected_time_minutes":240,"job_start_time":"2026-08-10 10:00:00","job_end_time":"2026-08-10 14:00:00","items":[{"item_name":"Dome Camera 2MP","quantity":"4"}]}'
```

Expected: `{"ok":true}`. Then confirm in the DB (`SELECT job_card_type, job_card_filled_at, verification_due_at FROM inquiries WHERE id = ?` and `SELECT * FROM job_card_items WHERE inquiry_id = ?`) that the row and items were written.

- [ ] **Step 3: Commit**

```bash
git add server/index.cjs
git commit -m "feat: add job card create/update endpoint"
```

---

### Task 4: Job Card queues endpoint (Pending Entry / Awaiting Verification)

**Files:**
- Modify: `server/index.cjs` — add directly after the Task 3 endpoint

- [ ] **Step 1: Add the endpoint**

```js
const JOB_CARD_ELIGIBLE_STATUSES = ['resolved', 'closed', 'case_closed', 'foc', 'issue_not_resolved'];

app.get('/api/job-cards', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const status = req.query.status;
    if (!['pending', 'awaiting-verification'].includes(status)) {
        return res.status(400).json({ error: 'status must be "pending" or "awaiting-verification"' });
    }

    let connection;
    try {
        connection = await getConn();
        if (status === 'pending') {
            const [rows] = await connection.query(
                `SELECT i.id, i.ticket_no, i.full_name, i.service_item, i.status, i.created_at,
                        pa.full_name AS assigned_name, ps.full_name AS secondary_name
                   FROM inquiries i
                   LEFT JOIN profiles pa ON pa.id = i.assigned_employee_id
                   LEFT JOIN profiles ps ON ps.id = i.secondary_employee_id
                  WHERE i.job_card_filled_at IS NULL
                    AND i.status IN (?)
                  ORDER BY i.created_at DESC
                  LIMIT 200`,
                [JOB_CARD_ELIGIBLE_STATUSES]
            );
            return res.json(rows);
        }
        const [rows] = await connection.query(
            `SELECT i.id, i.ticket_no, i.full_name, i.phone, i.verification_due_at
               FROM inquiries i
              WHERE i.job_card_filled_at IS NOT NULL
                AND i.verification_call_status IS NULL
              ORDER BY i.verification_due_at ASC
              LIMIT 200`
        );
        res.json(rows);
    } catch (err) {
        console.error('[job-cards] queue fetch failed:', err);
        res.status(500).json({ error: 'Could not load job cards' });
    } finally {
        if (connection) connection.release();
    }
});
```

- [ ] **Step 2: Manual verification**

Run: `curl -H "Authorization: Bearer <admin-token>" "http://localhost:5000/api/job-cards?status=pending"`
Expected: JSON array. A job you saved a job-card for in Task 3 should now be absent from this list (since `job_card_filled_at` is set), and should instead show up when you query `?status=awaiting-verification`.

- [ ] **Step 3: Commit**

```bash
git add server/index.cjs
git commit -m "feat: add job card pending/awaiting-verification queue endpoint"
```

---

### Task 5: Verification call endpoint

**Files:**
- Modify: `server/index.cjs` — add directly after the Task 4 endpoint

- [ ] **Step 1: Add the endpoint**

```js
app.post('/api/inquiries/:id/verification-call', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { id } = req.params;
    const { status, rating, note } = req.body || {};

    if (!['confirmed_ok', 'issue_found', 'unreachable'].includes(status)) {
        return res.status(400).json({ error: 'status must be confirmed_ok, issue_found, or unreachable' });
    }
    if (status !== 'unreachable') {
        const r = Number(rating);
        if (!Number.isInteger(r) || r < 1 || r > 5) {
            return res.status(400).json({ error: 'rating must be an integer from 1 to 5' });
        }
    }

    let connection;
    try {
        connection = await getConn();
        await connection.query(
            `UPDATE inquiries SET
                verification_call_status = ?,
                verification_call_note = ?,
                verification_call_at = NOW(),
                feedback_rating = CASE WHEN ? = 'unreachable' THEN feedback_rating ELSE ? END,
                rework_required = CASE WHEN ? = 'issue_found' THEN 1 ELSE rework_required END
             WHERE id = ?`,
            [status, note || null, status, rating || null, status, id]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('[job-card] verification call save failed:', err);
        res.status(500).json({ error: 'Could not save verification call' });
    } finally {
        if (connection) connection.release();
    }
});
```

- [ ] **Step 2: Manual verification**

```bash
curl -X POST http://localhost:5000/api/inquiries/<id>/verification-call \
  -H "Authorization: Bearer <admin-token>" -H "Content-Type: application/json" \
  -d '{"status":"confirmed_ok","rating":5,"note":"All good, camera feed confirmed live."}'
```

Expected: `{"ok":true}`. Confirm `SELECT feedback_rating, verification_call_status FROM inquiries WHERE id = ?` shows `feedback_rating = 5` and `verification_call_status = 'confirmed_ok'`. Re-run the `?status=awaiting-verification` query from Task 4 — this job should no longer appear.

- [ ] **Step 3: Commit**

```bash
git add server/index.cjs
git commit -m "feat: add verification call logging endpoint"
```

---

### Task 6: Background verification-reminder job

**Files:**
- Modify: `server/index.cjs` — add the function near `runSlaChecks` (~line 864-905), and add its `startX Job()` wrapper near `startEodReminderJob` (~line 1073-1076), then wire it into `startServer()` (~line 6818-6824)

- [ ] **Step 1: Add the reminder function**

Add near `runSlaChecks`:

```js
// Reminds admin to make the 3-day post-job verification call. One
// notification per job (verification_reminder_sent guard), same pattern as
// runSlaChecks.
async function runVerificationCallReminders() {
    let connection;
    try {
        connection = await getConn();
        const [rows] = await connection.query(
            `SELECT id, ticket_no, full_name, phone
               FROM inquiries
              WHERE job_card_filled_at IS NOT NULL
                AND verification_call_status IS NULL
                AND COALESCE(verification_reminder_sent, 0) = 0
                AND verification_due_at IS NOT NULL
                AND verification_due_at <= NOW()`
        );
        for (const r of rows) {
            await connection.query('UPDATE inquiries SET verification_reminder_sent = 1 WHERE id = ?', [r.id]);
            recordNotification({
                subject: 'verification_call_due',
                title: '📞 Verification call due',
                body: `Call ${r.full_name || 'the customer'} (${r.phone || 'no phone on file'}) for ticket ${r.ticket_no || ''} — 3-day check-in.`,
                audience: { role: 'admin' },
                data: { inquiry_id: r.id, ticket_no: r.ticket_no },
            }).catch(() => {});
        }
        if (rows.length) console.log(`[job-card] ${rows.length} verification call reminder(s) sent`);
    } catch (err) {
        console.error('[job-card] verification reminder job failed:', err.message);
    } finally {
        if (connection) connection.release();
    }
}

function startVerificationReminderJob() {
    console.log('[job-card] verification call reminder job active');
    setInterval(runVerificationCallReminders, 60_000).unref();
}
```

- [ ] **Step 2: Wire it into server startup**

In `startServer()` (~line 6818-6824), add `startVerificationReminderJob();` alongside the other `startXJob()` calls:

```js
        startAutoClockOutJob();
        startDeviceReminderJob();
        startSlaJob();
        startFinanceSummaryJob();
        startLeaderboardJob();
        startEodReminderJob();
        startPoolReleaseSweepJob();
        startVerificationReminderJob();
```

- [ ] **Step 3: Manual verification**

Take a job that already has a job card filled in (from Task 3) and manually backdate its due time so the reminder fires immediately:

```sql
UPDATE inquiries SET verification_due_at = NOW() - INTERVAL 1 MINUTE, verification_reminder_sent = 0 WHERE id = '<id>';
```

Run: `npm start`
Expected: within ~60 seconds, console logs `[job-card] 1 verification call reminder(s) sent`. Confirm a row was added to the `notifications` table with `subject = 'verification_call_due'`.

- [ ] **Step 4: Commit**

```bash
git add server/index.cjs
git commit -m "feat: add background job for verification call reminders"
```

---

### Task 7: Leaderboard + award endpoints

**Files:**
- Modify: `server/index.cjs` — add near the Task 5 endpoint. Requires `const { computeLeaderboard } = require('./job-card-scoring.cjs');` near the top of the file with the other `require`s.

- [ ] **Step 1: Add the `require`**

Near the top of `server/index.cjs`, alongside the other `require(...)` statements, add:

```js
const { computeLeaderboard } = require('./job-card-scoring.cjs');
```

- [ ] **Step 2: Add the leaderboard endpoint**

```js
app.get('/api/admin/leaderboard', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const month = String(req.query.month || '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: 'month must be formatted YYYY-MM' });
    }

    let connection;
    try {
        connection = await getConn();
        const [rows] = await connection.query(
            `SELECT i.assigned_employee_id, pa.full_name AS assigned_employee_name,
                    i.secondary_employee_id, ps.full_name AS secondary_employee_name,
                    i.feedback_rating, i.expected_time_minutes,
                    TIMESTAMPDIFF(MINUTE, i.job_start_time, i.job_end_time) AS actual_minutes
               FROM inquiries i
               LEFT JOIN profiles pa ON pa.id = i.assigned_employee_id
               LEFT JOIN profiles ps ON ps.id = i.secondary_employee_id
              WHERE i.verification_call_status IN ('confirmed_ok', 'issue_found')
                AND DATE_FORMAT(i.job_card_filled_at, '%Y-%m') = ?`,
            [month]
        );
        const board = computeLeaderboard(rows);

        const [[existingAward]] = await connection.query(
            'SELECT employee_id, amount FROM technician_awards WHERE month = ? LIMIT 1',
            [month]
        );

        res.json({ month, leaderboard: board, awarded: existingAward || null });
    } catch (err) {
        console.error('[leaderboard] job-card leaderboard fetch failed:', err);
        res.status(500).json({ error: 'Could not load leaderboard' });
    } finally {
        if (connection) connection.release();
    }
});
```

- [ ] **Step 3: Add the award endpoint**

```js
app.post('/api/admin/leaderboard/:month/award', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { month } = req.params;
    const { employee_id } = req.body || {};
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month must be formatted YYYY-MM' });
    if (!employee_id) return res.status(400).json({ error: 'employee_id is required' });

    let connection;
    try {
        connection = await getConn();
        const [rows] = await connection.query(
            `SELECT i.assigned_employee_id, pa.full_name AS assigned_employee_name,
                    i.secondary_employee_id, ps.full_name AS secondary_employee_name,
                    i.feedback_rating, i.expected_time_minutes,
                    TIMESTAMPDIFF(MINUTE, i.job_start_time, i.job_end_time) AS actual_minutes
               FROM inquiries i
               LEFT JOIN profiles pa ON pa.id = i.assigned_employee_id
               LEFT JOIN profiles ps ON ps.id = i.secondary_employee_id
              WHERE i.verification_call_status IN ('confirmed_ok', 'issue_found')
                AND DATE_FORMAT(i.job_card_filled_at, '%Y-%m') = ?`,
            [month]
        );
        const board = computeLeaderboard(rows);
        const winner = board.find(r => r.employeeId === employee_id);
        if (!winner) return res.status(400).json({ error: 'This technician has no verified jobs for that month' });

        await connection.query(
            `INSERT INTO technician_awards (id, employee_id, month, amount, avg_rating, avg_time_efficiency, awarded_by)
             VALUES (?, ?, ?, 2000, ?, ?, ?)
             ON DUPLICATE KEY UPDATE employee_id = VALUES(employee_id), avg_rating = VALUES(avg_rating),
                avg_time_efficiency = VALUES(avg_time_efficiency), awarded_by = VALUES(awarded_by), awarded_at = NOW()`,
            [uuidv4(), employee_id, month, winner.avgRating, winner.avgTimeEfficiency, req.user.id]
        );

        recordNotification({
            subject: 'technician_award',
            title: '🏆 Technician of the Month!',
            body: `Congratulations ${winner.name}! You're this month's top technician — ₹2000 awarded.`,
            audience: { userId: employee_id },
            data: { month, amount: 2000, voice: 'Congratulations! You are this month’s top technician.' },
        }).catch(() => {});

        res.json({ ok: true, winner });
    } catch (err) {
        console.error('[leaderboard] award failed:', err);
        res.status(500).json({ error: 'Could not record award' });
    } finally {
        if (connection) connection.release();
    }
});
```

- [ ] **Step 4: Manual verification**

Run: `curl -H "Authorization: Bearer <admin-token>" "http://localhost:5000/api/admin/leaderboard?month=2026-08"`
Expected: `{"month":"2026-08","leaderboard":[...],"awarded":null}` with entries for any technicians who have verified jobs this month (from Tasks 3+5). Then:

```bash
curl -X POST http://localhost:5000/api/admin/leaderboard/2026-08/award \
  -H "Authorization: Bearer <admin-token>" -H "Content-Type: application/json" \
  -d '{"employee_id":"<the top employeeId from the leaderboard response>"}'
```

Expected: `{"ok":true,"winner":{...}}`. Re-run the `GET` — `awarded` should now show that employee. Confirm a `notifications` row with `subject = 'technician_award'` was created.

- [ ] **Step 5: Commit**

```bash
git add server/index.cjs
git commit -m "feat: add monthly leaderboard and award endpoints"
```

---

### Task 8: Finance summary integration

**Files:**
- Modify: `server/index.cjs:4048-4060` (the `return { ... }` object inside `/api/finance/summary`)
- Modify: `src/pages/finance.js:386-397` (right after the Gig Worker Pool card)

- [ ] **Step 1: Add a job-card query to the finance summary endpoint**

Inside the `/api/finance/summary` handler (~line 3900-4070), after the existing three parallel queries (`rows`, `catRows`, `trendRows` — see ~line 3934-3969), add a fourth independent query for the current month's job-card activity. The simplest approach: add it to the same `Promise.all` array.

Change:

```js
        const [[rows], [catRows], [trendRows]] = await Promise.all([
```

to:

```js
        const nowMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const [[rows], [catRows], [trendRows], [jobCardRows]] = await Promise.all([
```

and add a fourth entry to that same array (after the `trendRows` query, before the closing `]);`):

```js
            pool.query(
                `SELECT
                    SUM(CASE WHEN job_card_filled_at IS NOT NULL AND DATE_FORMAT(job_card_filled_at, '%Y-%m') = ? THEN 1 ELSE 0 END) AS logged,
                    SUM(CASE WHEN job_card_filled_at IS NOT NULL AND verification_call_status IS NULL THEN 1 ELSE 0 END) AS awaitingVerification,
                    SUM(CASE WHEN verification_call_status IN ('confirmed_ok','issue_found') AND DATE_FORMAT(job_card_filled_at, '%Y-%m') = ? THEN 1 ELSE 0 END) AS verified
                   FROM inquiries`,
                [nowMonth, nowMonth]
            ),
```

Then, in the `return { ... }` object (~line 4048), add a `jobCards` section alongside the existing `gig` section:

```js
            jobCards: {
                logged: Number(jobCardRows[0]?.logged) || 0,
                awaitingVerification: Number(jobCardRows[0]?.awaitingVerification) || 0,
                verified: Number(jobCardRows[0]?.verified) || 0,
            },
```

Also fetch this month's award, right before the `return`:

```js
        const [[monthAward]] = await pool.query(
            `SELECT p.full_name, ta.amount
               FROM technician_awards ta JOIN profiles p ON p.id = ta.employee_id
              WHERE ta.month = ?`,
            [nowMonth]
        );
```

and add it into `jobCards`:

```js
            jobCards: {
                logged: Number(jobCardRows[0]?.logged) || 0,
                awaitingVerification: Number(jobCardRows[0]?.awaitingVerification) || 0,
                verified: Number(jobCardRows[0]?.verified) || 0,
                award: monthAward ? { name: monthAward.full_name, amount: Number(monthAward.amount) } : null,
            },
```

- [ ] **Step 2: Add the finance.js card**

In `src/pages/finance.js`, right after the existing Gig Worker Pool block (ends at line 397 with `` </div>` : ''}``), add:

```js
      ${d.jobCards ? `
      <div class="card fin-in" style="margin-bottom:20px;">
        <div class="card-header"><span class="card-title">Job Card Activity — this month</span></div>
        <div class="card-body">
          <div class="fin-kpis" style="margin-bottom:0;">
            ${kpi('Jobs Logged', d.jobCards.logged, 'var(--primary)', null, 'job cards entered this month')}
            ${kpi('Awaiting Verification', d.jobCards.awaitingVerification, 'var(--warning)', null, '3-day call not yet logged')}
            ${kpi('Verified', d.jobCards.verified, 'var(--success)', null, 'verification call completed')}
            ${kpi('Monthly Award', d.jobCards.award ? `₹${d.jobCards.award.amount} — ${esc(d.jobCards.award.name)}` : 'Not yet awarded', 'var(--text)', null, 'Technician of the Month')}
          </div>
        </div>
      </div>` : ''}
```

- [ ] **Step 3: Manual verification**

Run: `npm start`, then `curl -H "Authorization: Bearer <admin-token>" http://localhost:5000/api/finance/summary`
Expected: response JSON includes a `jobCards` object with `logged`, `awaitingVerification`, `verified`, `award`. Then open the Finance Report tab in the browser (see Task 11 for how it's wired) and confirm the "Job Card Activity" card renders with those numbers.

- [ ] **Step 4: Commit**

```bash
git add server/index.cjs src/pages/finance.js
git commit -m "feat: surface job card activity in the finance report"
```

---

### Task 9: Frontend — job-cards.js page shell, Pending Entry, New Job Card form

**Files:**
- Create: `src/pages/job-cards.js`

- [ ] **Step 1: Write the page module**

```js
// Job Cards — admin tab for transcribing completed jobs, tracking the
// 3-day verification call, and awarding the monthly technician bonus.
import { toast } from '../utils.js';
import { ICONS } from '../icons.js';

const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

const authHeaders = (json = true) => {
  const h = { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
};

async function apiGet(path) {
  const res = await fetch(`${API}${path}`, { headers: authHeaders(false) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CATEGORIES = ['CCTV', 'Networking', 'Video Door Phone', 'Locks', 'Gate Automation', 'Access Control / Biometric', 'Fire Alarm', 'Other'];

let currentView = 'pending';

export async function renderJobCardsTab(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 style="display:flex;align-items:center;gap:10px;">
          <span style="width:26px;height:26px;display:inline-flex;flex-shrink:0;color:var(--primary);">${ICONS.clipboard}</span>
          <span>Job Cards</span>
        </h1>
        <p>Transcribe completed jobs, track the 3-day verification call, and award the monthly technician bonus.</p>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">
      <button class="btn btn-secondary jc-nav" data-view="pending">Pending Entry</button>
      <button class="btn btn-secondary jc-nav" data-view="verify">Awaiting Verification</button>
      <button class="btn btn-secondary jc-nav" data-view="entry">+ New Job Card</button>
      <button class="btn btn-secondary jc-nav" data-view="board">Leaderboard</button>
    </div>
    <div id="jc-body"></div>
  `;

  container.querySelectorAll('.jc-nav').forEach(btn => {
    btn.addEventListener('click', () => {
      currentView = btn.dataset.view;
      renderView(container);
    });
  });

  renderView(container);
}

async function renderView(container) {
  const body = container.querySelector('#jc-body');
  container.querySelectorAll('.jc-nav').forEach(b => b.classList.toggle('btn-primary', b.dataset.view === currentView));
  body.innerHTML = '<p style="padding:20px;color:var(--text-dim);">Loading…</p>';
  try {
    if (currentView === 'pending') return renderPending(body, container);
    if (currentView === 'verify') return renderVerify(body, container);
    if (currentView === 'entry') return renderEntryForm(body, container, null);
    if (currentView === 'board') return renderLeaderboard(body);
  } catch (err) {
    body.innerHTML = `<p style="padding:20px;color:var(--danger);">${esc(err.message)}</p>`;
  }
}

async function renderPending(body, container) {
  const rows = await apiGet('/job-cards?status=pending');
  if (!rows.length) {
    body.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--text-dim);">No jobs waiting on a job card.</div></div>';
    return;
  }
  body.innerHTML = `
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Ticket</th><th>Customer</th><th>Service</th><th>Technician(s)</th><th>Completed</th><th></th></tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td><strong>${esc(r.ticket_no || '—')}</strong></td>
                <td>${esc(r.full_name || 'Client')}</td>
                <td>${esc(r.service_item || '—')}</td>
                <td>${esc(r.assigned_name || '—')}${r.secondary_name ? ', ' + esc(r.secondary_name) : ''}</td>
                <td>${new Date(r.created_at).toLocaleDateString('en-IN')}</td>
                <td><button class="btn btn-primary btn-sm jc-enter" data-id="${r.id}">Enter →</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  body.querySelectorAll('.jc-enter').forEach(btn => {
    btn.addEventListener('click', () => renderEntryForm(body, container, btn.dataset.id));
  });
}

async function renderVerify(body, container) {
  const rows = await apiGet('/job-cards?status=awaiting-verification');
  if (!rows.length) {
    body.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--text-dim);">No verification calls due.</div></div>';
    return;
  }
  const dueLabel = (iso) => {
    const due = new Date(iso), now = new Date();
    const days = Math.ceil((due - now) / 86400000);
    if (days <= 0) return `<span style="color:var(--danger);font-weight:700;">Due now</span>`;
    return `Due in ${days} day${days === 1 ? '' : 's'}`;
  };
  body.innerHTML = `
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Ticket</th><th>Customer</th><th>Phone</th><th>Call due</th><th></th></tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td><strong>${esc(r.ticket_no || '—')}</strong></td>
                <td>${esc(r.full_name || 'Client')}</td>
                <td>${esc(r.phone || '—')}</td>
                <td>${dueLabel(r.verification_due_at)}</td>
                <td><button class="btn btn-secondary btn-sm jc-log-call" data-id="${r.id}" data-name="${esc(r.full_name || '')}" data-phone="${esc(r.phone || '')}">Log call →</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  body.querySelectorAll('.jc-log-call').forEach(btn => {
    btn.addEventListener('click', () => openVerificationModal(btn.dataset.id, btn.dataset.name, btn.dataset.phone, () => renderView(container)));
  });
}

function openVerificationModal(inquiryId, name, phone, onDone) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width:500px;">
      <div class="modal-header">
        <span class="modal-title">Verification Call — ${esc(name)} (${esc(phone)})</span>
        <button class="modal-close" id="jc-vc-close">✕</button>
      </div>
      <div class="modal-body">
        <label style="display:block;margin-bottom:8px;font-weight:600;">Outcome</label>
        <select id="jc-vc-status" style="width:100%;padding:8px;margin-bottom:12px;">
          <option value="confirmed_ok">Confirmed OK</option>
          <option value="issue_found">Issue found</option>
          <option value="unreachable">Could not reach customer</option>
        </select>
        <label style="display:block;margin-bottom:8px;font-weight:600;">Rating (1-5)</label>
        <input id="jc-vc-rating" type="number" min="1" max="5" style="width:100%;padding:8px;margin-bottom:12px;"/>
        <label style="display:block;margin-bottom:8px;font-weight:600;">Note</label>
        <textarea id="jc-vc-note" rows="3" style="width:100%;padding:8px;"></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="jc-vc-cancel">Cancel</button>
        <button class="btn btn-primary" id="jc-vc-save">Save</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('#jc-vc-close').onclick = close;
  modal.querySelector('#jc-vc-cancel').onclick = close;
  modal.querySelector('#jc-vc-save').onclick = async () => {
    const status = modal.querySelector('#jc-vc-status').value;
    const ratingVal = modal.querySelector('#jc-vc-rating').value;
    const note = modal.querySelector('#jc-vc-note').value.trim();
    try {
      await apiPost(`/inquiries/${inquiryId}/verification-call`, {
        status, rating: ratingVal ? Number(ratingVal) : null, note,
      });
      toast('Verification call logged', 'success');
      close();
      onDone?.();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

async function renderEntryForm(body, container, inquiryId) {
  body.innerHTML = `
    <div class="card"><div class="card-body">
      ${!inquiryId ? `<label style="display:block;margin-bottom:8px;font-weight:600;">Inquiry ID (paste from the Pending Entry list, or use "Enter →" there instead)</label>
      <input id="jc-manual-id" style="width:100%;padding:8px;margin-bottom:16px;" placeholder="paste inquiry id"/>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
        <div><label>Job Type</label><select id="jc-type" style="width:100%;padding:8px;"><option value="installation">Installation</option><option value="service">Service</option></select></div>
        <div><label>Category</label><select id="jc-category" style="width:100%;padding:8px;">${CATEGORIES.map(c => `<option>${c}</option>`).join('')}</select></div>
        <div><label>Secondary Technician ID (optional)</label><input id="jc-secondary" style="width:100%;padding:8px;"/></div>
        <div><label>Start Time</label><input id="jc-start" type="datetime-local" style="width:100%;padding:8px;"/></div>
        <div><label>End Time</label><input id="jc-end" type="datetime-local" style="width:100%;padding:8px;"/></div>
        <div><label>Expected Time (minutes)</label><input id="jc-expected" type="number" style="width:100%;padding:8px;"/></div>
      </div>
      <div style="margin:16px 0;"><label><input type="checkbox" id="jc-rework"/> Rework needed</label></div>
      <label style="display:block;margin-bottom:8px;font-weight:600;">Work done note</label>
      <textarea id="jc-note" rows="2" style="width:100%;padding:8px;margin-bottom:16px;"></textarea>
      <label style="display:block;margin-bottom:8px;font-weight:600;">Items Installed / Used</label>
      <div id="jc-items"></div>
      <button class="btn btn-secondary btn-sm" id="jc-add-item" type="button">+ Add Item</button>
      <div style="margin-top:20px;"><button class="btn btn-primary" id="jc-save">Save Job Card</button></div>
    </div></div>`;

  const itemsEl = body.querySelector('#jc-items');
  const addItemRow = () => {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 2fr auto;gap:8px;margin-bottom:8px;';
    row.innerHTML = `
      <input class="jc-item-name" placeholder="Item name"/>
      <input class="jc-item-qty" placeholder="Qty"/>
      <input class="jc-item-notes" placeholder="Notes"/>
      <button class="btn btn-secondary btn-sm jc-item-remove" type="button">✕</button>`;
    row.querySelector('.jc-item-remove').onclick = () => row.remove();
    itemsEl.appendChild(row);
  };
  body.querySelector('#jc-add-item').onclick = addItemRow;
  addItemRow();

  body.querySelector('#jc-save').onclick = async () => {
    const id = inquiryId || body.querySelector('#jc-manual-id')?.value.trim();
    if (!id) return toast('Inquiry ID is required', 'error');
    const items = Array.from(itemsEl.querySelectorAll('div')).map(row => ({
      item_name: row.querySelector('.jc-item-name').value.trim(),
      quantity: row.querySelector('.jc-item-qty').value.trim(),
      notes: row.querySelector('.jc-item-notes').value.trim(),
    })).filter(it => it.item_name);

    const toIso = (v) => v ? v.replace('T', ' ') + ':00' : null;
    try {
      await apiPost(`/inquiries/${id}/job-card`, {
        job_card_type: body.querySelector('#jc-type').value,
        category: body.querySelector('#jc-category').value,
        secondary_employee_id: body.querySelector('#jc-secondary').value.trim() || null,
        job_start_time: toIso(body.querySelector('#jc-start').value),
        job_end_time: toIso(body.querySelector('#jc-end').value),
        expected_time_minutes: Number(body.querySelector('#jc-expected').value) || null,
        work_done_note: body.querySelector('#jc-note').value.trim(),
        rework_required: body.querySelector('#jc-rework').checked,
        items,
      });
      toast('Job card saved — verification call reminder scheduled', 'success');
      currentView = 'pending';
      renderView(container);
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

async function renderLeaderboard(body) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const data = await apiGet(`/admin/leaderboard?month=${month}`);
  const rows = data.leaderboard;
  body.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Leaderboard — ${month}</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Technician</th><th>Avg Rating</th><th>Avg Time Efficiency</th><th>Jobs Verified</th><th></th></tr></thead>
          <tbody>
            ${rows.length ? rows.map((r, i) => `
              <tr>
                <td>${i === 0 ? '🥇' : i + 1}</td>
                <td>${esc(r.name)}</td>
                <td>${r.avgRating != null ? r.avgRating.toFixed(1) : '—'}</td>
                <td>${r.avgTimeEfficiency != null ? Math.round(r.avgTimeEfficiency * 100) + '%' : '—'}</td>
                <td>${r.jobsCount}</td>
                <td>${data.awarded?.employee_id === r.employeeId
                  ? `<span style="color:var(--success);font-weight:700;">Awarded ₹${data.awarded.amount}</span>`
                  : `<button class="btn btn-primary btn-sm jc-award" data-id="${r.employeeId}" ${data.awarded ? 'disabled' : ''}>Award ₹2000</button>`}</td>
              </tr>`).join('') : `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-dim);">No verified jobs yet this month</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
  body.querySelectorAll('.jc-award').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Award ₹2000 to this technician for ' + month + '?')) return;
      try {
        await apiPost(`/admin/leaderboard/${month}/award`, { employee_id: btn.dataset.id });
        toast('Award recorded', 'success');
        renderLeaderboard(body);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/job-cards.js
git commit -m "feat: add job cards admin page (queues, entry form, verification, leaderboard)"
```

---

### Task 10: Wire the tab into navigation

**Files:**
- Modify: `src/main.js:136-138` (admin nav items array)
- Modify: `src/main.js:202` area (`PAGE_LOADERS.admin`)

- [ ] **Step 1: Add the nav entry**

In `src/main.js`, in the admin tabs array (~line 130-169), add a new entry in the "Operations" section, right after the `installations` entry (~line 136):

```js
    { id: 'installations', icon: ICONS.plus, label: 'Installations' },
    { id: 'job-cards', icon: ICONS.clipboard, label: 'Job Cards' },
```

- [ ] **Step 2: Add the lazy loader**

In `PAGE_LOADERS.admin` (~line 197-231), add right after the `installations` entry:

```js
    installations: () => import('./pages/admin.js').then(m => m.renderInstallationsTab),
    'job-cards': () => import('./pages/job-cards.js').then(m => m.renderJobCardsTab),
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, log in as an admin user, open the app. Confirm a "Job Cards" nav item appears in the Operations section, and clicking it loads the Pending Entry view without console errors.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat: wire Job Cards tab into admin navigation"
```

---

### Task 11: End-to-end smoke test

**Files:** none (manual verification only)

- [ ] **Step 1: Full workflow walkthrough**

With `npm start` (backend) and `npm run dev` (frontend) both running:

1. Find an existing inquiry with `status = 'resolved'` (or update one via the DB to that status) that has no job card yet — it should appear under **Job Cards → Pending Entry**.
2. Click **Enter →**, fill the form (job type, category, times, at least one item), click **Save Job Card**. Confirm a toast success message and that the job disappears from Pending Entry.
3. Switch to **Awaiting Verification** — the job should now appear with "Due in 3 days".
4. Manually run the SQL from Task 6 Step 3 to backdate `verification_due_at`, restart the server, and confirm a notification fires.
5. Back in **Awaiting Verification**, click **Log call →**, fill in a rating and "Confirmed OK", save.
6. Switch to **Leaderboard** — the technician should now appear with the correct avg rating and time efficiency.
7. Click **Award ₹2000** — confirm the row updates to show "Awarded ₹2000" and a notification was recorded for that employee.
8. Open **Finance Report** — confirm the new "Job Card Activity" card shows Jobs Logged ≥ 1, Verified ≥ 1, and the Monthly Award line showing the winner's name.

Expected: all 8 steps complete without errors, and the numbers are internally consistent (job counted once in Pending→Verify→Leaderboard→Finance).

- [ ] **Step 2: Run the full automated test suite one more time**

Run: `npm test`
Expected: all tests pass, including `tests/job-card-scoring.test.mjs`.

---

## Self-Review Notes

- **Spec coverage:** §3 data model → Task 1. §4 job card facts → Task 3 + 9. §5 verification call → Tasks 5, 6. §6 leaderboard/award → Tasks 2, 7, 9. §7 tab views → Task 9. §8 finance integration → Task 8. §9 endpoints → Tasks 3-7. §10 out-of-scope items are intentionally not covered by any task.
- **Naming consistency:** `computeTimeEfficiency` / `computeLeaderboard` (Task 2) are the exact names imported and called in Task 7's endpoints. `job_card_filled_at` / `verification_due_at` / `verification_call_status` are spelled identically across Tasks 1, 3, 4, 5, 6, 7, 8.
- **Existing-feature collision check:** confirmed distinct naming from the pre-existing `startLeaderboardJob`/`runMonthlyLeaderboard` (revenue-based) and the `feedback` nav tab labeled "Leaderboard" — this plan's leaderboard lives entirely inside the new `job-cards` tab and its own `/api/admin/leaderboard` endpoint, not touching the existing ones.
