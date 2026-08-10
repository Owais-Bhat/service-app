# Job Card & Technician Reward System — Design

Date: 2026-08-10
Status: Approved for planning (revised after simplification pass)

## 1. Purpose

Networking Experts runs a 4-technician field team doing both **installations**
(new CCTV, networking, video door phone, locks, gate automation, access
control/biometric, fire alarm) and **service** calls (repair/maintenance on
existing systems). Today there's no structured way to:

- record what actually happened on a job in a consistent, reviewable format
- verify job quality with a real customer check, not a technician's own claim
- reward the best-performing technician each month based on real data
- see this activity reflected in the finance report

This system adds a **Job Card** — the record of a completed job — as a
factual record that drives a verification step and a single monthly
reward. It plugs into the existing `inquiries` table and mirrors patterns
already used in this codebase (e.g. the SLA-reminder mechanism).

**Revision note:** an earlier version of this spec included per-job point
scoring (0-100) and per-job bonuses (₹200-600, split between technicians).
That has been dropped. The only money in this system is a single **₹2000/month**
award to the top technician — no per-job payouts, no runner-up prize.

## 2. Real-world workflow

1. Technician(s) complete a job on-site. They fill a **paper job card**
   (designed/printed by the business owner, out of scope for this build) with
   objective facts — times, items used, customer signature.
2. Paper card reaches the office. Admin transcribes it into the app via the
   **Job Card entry form**: job type, category, technician(s), times, items
   used, rework flag, notes. No scoring happens here — it's a factual record.
3. Three days after entry, the system reminds the admin to call the
   customer and verify: is everything still working, any issues, and get a
   rating (1-5). Admin logs the outcome.
4. Logging the verification call writes the rating into the existing
   `feedback_rating` column on the job (see §3) — this is the rating that
   counts, not whatever a customer may or may not have submitted through
   the public tracker on their own.
5. At month end, a leaderboard ranks technicians by a combination of
   average verified rating and average time efficiency across all their
   jobs (service or installation, combined). Admin reviews the leaderboard
   and confirms the ₹2000 winner.

## 3. Data model

Extend `inquiries` — the table that already represents jobs:

```sql
ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS job_card_type VARCHAR(20),              -- 'service' | 'installation'
  ADD COLUMN IF NOT EXISTS secondary_employee_id VARCHAR(36),       -- 2nd technician on 2-person jobs
  ADD COLUMN IF NOT EXISTS job_start_time TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS job_end_time TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS expected_time_minutes INT,               -- set by admin at assignment
  ADD COLUMN IF NOT EXISTS work_done_note TEXT,
  ADD COLUMN IF NOT EXISTS rework_required TINYINT(1) DEFAULT 0,    -- informational only, no score to cap
  ADD COLUMN IF NOT EXISTS job_card_filled_by VARCHAR(36),
  ADD COLUMN IF NOT EXISTS job_card_filled_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS verification_due_at TIMESTAMP NULL,      -- = job_card_filled_at + 3 days
  ADD COLUMN IF NOT EXISTS verification_call_status VARCHAR(20),    -- null | confirmed_ok | issue_found | unreachable
  ADD COLUMN IF NOT EXISTS verification_call_note TEXT,
  ADD COLUMN IF NOT EXISTS verification_call_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS verification_reminder_sent TINYINT(1) DEFAULT 0;
```

**No new rating column.** The verification call writes into the
**existing** `feedback_rating` column already on `inquiries` (currently
populated only via the self-service public tracker). When the admin logs a
verification call, it overwrites `feedback_rating` with the value given on
the call — one rating field total, and it's always the admin-verified one
that counts for the monthly leaderboard, regardless of whether the
customer separately used the public tracker.

`job_card_type` is independent of the existing `category` field (which
already holds values like `'Video Door Phone'` and drives `service_pricing`)
— `category` says *what* was worked on, `job_card_type` says whether it was
a new install or a service call.

Items-used list (one job can have several items; also doubles as a
materials-per-job record):

```sql
CREATE TABLE IF NOT EXISTS job_card_items (
  id VARCHAR(36) PRIMARY KEY,
  inquiry_id VARCHAR(36) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  quantity VARCHAR(50),           -- text, not strictly numeric: "80m", "4", "1 set"
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE
);
```

Monthly award — one row per month, written when admin confirms a winner:

```sql
CREATE TABLE IF NOT EXISTS technician_awards (
  id VARCHAR(36) PRIMARY KEY,
  employee_id VARCHAR(36) NOT NULL,
  month VARCHAR(7) NOT NULL,      -- 'YYYY-MM'
  amount DECIMAL(10,2) NOT NULL DEFAULT 2000,
  avg_rating DECIMAL(3,2),        -- snapshot of the numbers behind the decision
  avg_time_efficiency DECIMAL(5,2),
  awarded_by VARCHAR(36),
  awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_month (month)   -- one winner per month
);
```

Not building (dropped in this revision): per-job score columns
(time/quality/cabling/config points), `job_score_total`, `bonus_amount`,
`bonus_payout_status`, per-job penalty ledger. Nothing in this system
computes a per-job payout anymore.

## 4. Job card — facts only

The entry form (and the transcription step) captures:

- Job type (service / installation) and category (CCTV, Networking, Video
  Door Phone, Locks, Gate Automation, Access Control/Biometric, Fire Alarm,
  Other)
- Ticket, technician(s) — 1 or 2
- Start time, end time, expected time (set by admin at assignment — used
  only for the time-efficiency number in §6, not for any per-job score)
- Items installed/used (repeatable list)
- Rework required — yes/no, with a note if yes. Informational: it doesn't
  cap or reduce anything by itself, but a rework flag is exactly the kind
  of thing that should come up on the verification call and show up in that
  job's rating.
- Free-text work-done note

No numeric scoring fields. Nothing here computes money.

## 5. Verification call

Mirrors the existing SLA-reminder mechanism in `server/index.cjs`
(`runSlaChecks`, `setInterval(..., 60_000)`): a new
`runVerificationCallReminders()` polls for jobs where
`verification_due_at <= now`, `verification_call_status IS NULL`, and
`verification_reminder_sent = 0`, and calls the existing
`recordNotification()` to alert the admin role — same one-shot-notification
guard pattern already used for SLA breaches.

Logging the call records `verification_call_status`
(`confirmed_ok` / `issue_found` / `unreachable`), a note, the timestamp, and
a 1-5 rating that overwrites `feedback_rating` on that job. `unreachable`
jobs get no rating and are excluded from that technician's monthly average
(not counted as a 0) — the reminder can be re-sent for a retry.

## 6. Monthly leaderboard & award

For a given month, per technician, computed from jobs where
`verification_call_status IN ('confirmed_ok', 'issue_found')`:

- **Avg rating** = average `feedback_rating` across those jobs
- **Avg time efficiency** = average of (expected / actual duration),
  capped at 1.0 per job so finishing early doesn't earn more than 100%
  credit (avoids rewarding rushed jobs)

Both numbers are shown side by side on the leaderboard, plus a combined
score (simple average of the two, each normalized to 0-100) as a sort aid.
Admin reviews and confirms the winner with an explicit "Award ₹2000"
action — the combined score ranks, but the decision is manual, matching
the stated preference for the admin verifying and deciding personally.

One winner per month, ₹2000. No runner-up.

## 7. New "Job Cards" tab (admin)

Four views:

1. **Pending Entry** — jobs completed but no job card transcribed yet
   (`job_card_filled_at IS NULL`). Table: ticket, customer, type, assigned
   technician(s), date → "Enter" opens the entry form.
2. **Awaiting Verification** — `job_card_filled_at IS NOT NULL AND
   verification_call_status IS NULL`, sorted by `verification_due_at`,
   with "Due today" / "Due in N days" / overdue styling → "Log call" action.
3. **+ New Job Card** — the entry form from §4 (no scoring fields).
4. **Leaderboard** — current month by default with a month picker for
   history. Technician, avg rating, avg time efficiency, jobs verified this
   month, and the "Award ₹2000" action.

## 8. Finance tab integration

Add a **"Job Card Activity"** card to `src/pages/finance.js`, using the
same `kpi()` helper already used for the existing "Gig Worker Pool" card
(finance.js:386-394): Jobs Logged This Month / Awaiting Verification /
Verified / this month's Monthly Award (₹2000 — winner's name, once
confirmed, or "Not yet awarded"). This is a much lighter card than a
payout ledger, since there's no per-job money to track.

## 9. API endpoints

- `POST /api/inquiries/:id/job-card` — create/update job card fields +
  items list (facts only, §4)
- `POST /api/inquiries/:id/verification-call` — log call outcome, sets
  `feedback_rating` per §5
- `GET /api/job-cards?status=pending|awaiting-verification` — the two
  queue views
- `GET /api/admin/leaderboard?month=YYYY-MM` — computed ranking for §6
- `POST /api/admin/leaderboard/:month/award` — confirm the ₹2000 winner,
  writes `technician_awards`

## 10. Explicitly out of scope for this build

- **Physical card design/printing** — the business owner is designing and
  printing the paper card themselves. The digital entry form's fields
  should stay reasonably close to whatever the printed card ends up asking,
  but the print artifact itself isn't part of this build.
- **Marketing data capture** (before/after photos, testimonial quotes,
  usage permissions) — explicitly deferred; not planned yet. The structured
  data this system already captures (customer, category, location, items,
  date) is enough to query for marketing later without adding dedicated
  fields now.
- **Per-job monetary bonuses and per-job point scoring** — dropped in this
  revision. The only reward is the single monthly ₹2000 award (§6).
- **Employee-facing "My Performance" widget** on `employee.js` — possible
  follow-on, not required for this build.
- **Per-category time-standard tables** — replaced by a per-job "Expected
  Time" set at assignment (§4), since categories were shown to have
  comparable time footprints in practice.
- **Rework/penalty ledger with monetary deductions** — with no per-job
  bonus pool to deduct from, this isn't needed. A rework flag is still
  captured (§4) as context for the verification call and, indirectly, that
  job's rating.
