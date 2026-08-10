# Job Card & Technician Reward System — Design

Date: 2026-08-10
Status: Approved for planning

## 1. Purpose

Networking Experts runs a 4-technician field team doing both **installations**
(new CCTV, networking, video door phone, locks, gate automation, access
control/biometric, fire alarm) and **service** calls (repair/maintenance on
existing systems). Today there's no structured way to:

- record what actually happened on a job in a consistent, reviewable format
- reward technicians for speed *and* quality without one crowding out the other
- gate any bonus payout on a real quality check, not a technician's own claim
- see, at a glance, who's earning what and who's this month's top performer

This system adds a **Job Card** — the record of a completed job — as the
single input that drives scoring, bonus calculation, a verification-gated
payout, and a monthly leaderboard. It plugs into the existing `inquiries`
table and mirrors patterns already used in this codebase (see §3).

## 2. Real-world workflow

1. Technician(s) complete a job on-site. They fill a **paper job card**
   (designed/printed by the business owner, out of scope for this build) with
   objective facts only — times, items used, customer signature. They do
   **not** self-score quality; that would be gameable.
2. Paper card reaches the office. Admin transcribes it into the app via the
   **Job Card entry form**, and fills the "office scoring" section
   (quality / cabling-finish / config&test), using their own judgment (and
   the paper card's notes) — not the technician's opinion.
3. Saving the job card computes a provisional score and bonus amount, but
   the bonus is **locked**.
4. Three days later, the system reminds the admin to call the customer and
   verify: is everything still working, any issues, and the customer's
   satisfaction rating. Admin logs the outcome.
5. Logging the verification call **unlocks** the bonus for payout. This call
   is the real quality gate — a job never pays a bonus on the technician's
   word alone.
6. At month end, a leaderboard ranks technicians by a combination of
   average verified customer rating and average time efficiency across all
   their jobs (service or installation, combined — see §6). Admin confirms
   the Technician-of-the-Month award from this leaderboard.

## 3. Data model

Extend `inquiries` — the table that already represents jobs and already
carries a similar bolt-on pattern for gig-worker payouts
(`gig_payout_amount`, `gig_payout_status`, `gig_payout_paid_at` — see
`server/index.cjs` around line 1164). New columns:

```sql
ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS job_card_type VARCHAR(20),              -- 'service' | 'installation'
  ADD COLUMN IF NOT EXISTS secondary_employee_id VARCHAR(36),       -- 2nd technician on 2-person jobs
  ADD COLUMN IF NOT EXISTS job_start_time TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS job_end_time TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS expected_time_minutes INT,               -- set by admin at assignment
  ADD COLUMN IF NOT EXISTS work_done_note TEXT,
  ADD COLUMN IF NOT EXISTS score_time INT,                          -- 0-25, derived from actual vs expected
  ADD COLUMN IF NOT EXISTS score_quality INT,                       -- 0-20, admin-entered
  ADD COLUMN IF NOT EXISTS score_cabling INT,                       -- 0-15, admin-entered
  ADD COLUMN IF NOT EXISTS score_config INT,                        -- 0-20, admin-entered
  ADD COLUMN IF NOT EXISTS rework_required TINYINT(1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS job_score_total INT,                     -- computed, capped at 65 if rework_required=1
  ADD COLUMN IF NOT EXISTS bonus_amount DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS bonus_payout_status VARCHAR(20) DEFAULT 'locked',  -- locked | approved | paid
  ADD COLUMN IF NOT EXISTS bonus_paid_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS scored_by VARCHAR(36),
  ADD COLUMN IF NOT EXISTS scored_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS verification_due_at TIMESTAMP NULL,      -- = scored_at + 3 days
  ADD COLUMN IF NOT EXISTS verification_call_status VARCHAR(20),    -- null | confirmed_ok | issue_found | unreachable
  ADD COLUMN IF NOT EXISTS verification_call_rating INT,            -- 1-5, from the call
  ADD COLUMN IF NOT EXISTS verification_call_note TEXT,
  ADD COLUMN IF NOT EXISTS verification_call_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS verification_reminder_sent TINYINT(1) DEFAULT 0;
```

`job_card_type` is independent of the existing `category` field (which
already holds values like `'Video Door Phone'` and drives `service_pricing`)
— `category` says *what* was worked on, `job_card_type` says whether it was
a new install or a service call.

New table for the items-used list (one job can have several items; this
also gives a reusable materials-per-job record):

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

Penalties (rework/complaint/damage deductions) get their own small ledger,
since they aren't 1:1 with a single scoring event:

```sql
CREATE TABLE IF NOT EXISTS technician_penalties (
  id VARCHAR(36) PRIMARY KEY,
  employee_id VARCHAR(36) NOT NULL,
  inquiry_id VARCHAR(36),
  amount DECIMAL(10,2) NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE SET NULL
);
```

Monthly awards (Technician of the Month ₹2000 / Runner-up ₹1000) are
computed on the fly from `inquiries` + `technician_penalties` for a given
month — no stored monthly table, so numbers stay accurate if a verification
call is logged late. When admin confirms a winner, write one row per
recipient into a lightweight `technician_awards` table:

```sql
CREATE TABLE IF NOT EXISTS technician_awards (
  id VARCHAR(36) PRIMARY KEY,
  employee_id VARCHAR(36) NOT NULL,
  month VARCHAR(7) NOT NULL,      -- 'YYYY-MM'
  rank INT NOT NULL,              -- 1 = winner, 2 = runner-up
  amount DECIMAL(10,2) NOT NULL,
  awarded_by VARCHAR(36),
  awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_month_rank (month, rank)
);
```

## 4. Scoring & bonus formula

**Time score (0-25)**: `expected_time_minutes` vs actual
(`job_end_time - job_start_time`). Full points if actual ≤ expected;
proportionally reduced if over, floor at 0. Same formula for every category
— no per-category standards table, since expected time is set per job by
the admin at assignment (confirmed: a 4-camera job and a full VDP set land
around the same expected time in practice).

**Quality (0-20) / Cabling-Finish (0-15) / Config&Test (0-20)**: entered by
admin at transcription time, from the paper card notes and their own
judgment. Never entered by the technician.

**Rework rule**: if `rework_required = 1`, `job_score_total` is capped at 65
regardless of the other components — matches the earlier agreed rule that
speed/quality can't paper over a callback.

**Job bonus tiers** (per job, split between 1-2 technicians):

| Score | Bonus |
|---|---|
| 90-100 | ₹600 |
| 80-89 | ₹400 |
| 70-79 | ₹200 |
| <70 | ₹0 |

Bonus is written to `bonus_amount` at scoring time but `bonus_payout_status`
stays `'locked'` until the verification call is logged.

## 5. Verification call

Mirrors the existing SLA-reminder mechanism in `server/index.cjs`
(`runSlaChecks`, `setInterval(..., 60_000)`): a new `runVerificationCallReminders()`
polls for jobs where `verification_due_at <= now`, `verification_call_status IS NULL`,
and `verification_reminder_sent = 0`, and calls the existing
`recordNotification()` to alert the admin role. Same one-shot-notification
guard pattern already used for SLA breaches.

`verification_call_rating` is separate from the existing `feedback_rating`
column (the self-service rating a customer can already leave via the public
tracker). `feedback_rating`, if present, may be shown to the admin as a
reference during the call, but only `verification_call_rating` — captured
by the admin directly, on the phone — feeds the bonus/leaderboard math.
This keeps the bonus gate from depending on whether a customer bothers to
use the public tracker.

Logging the call (`verification_call_status`, `verification_call_rating`,
`verification_call_note`, `verification_call_at`) does two things:
- if `confirmed_ok`: `bonus_payout_status` → `'approved'`
- if `issue_found`: `rework_required` is set to 1, `job_score_total`
  recalculated (capped at 65), bonus recalculated — the job can end up
  paying less or nothing after the call, even if it looked good at
  transcription time
- if `unreachable`: stays locked, re-surfaces in the reminder queue for a
  retry (does not auto-approve)

## 6. Monthly leaderboard & award

For a given month, per technician:
- **Avg verified rating** = average of `verification_call_rating` across
  their jobs that month (only calls with `confirmed_ok` or `issue_found`
  count — `unreachable` jobs are excluded, not treated as 0 or 5)
- **Avg time efficiency** = average of (expected / actual) across their
  jobs that month, capped at 1.0 (finishing early doesn't earn >100%
  efficiency credit, to avoid rewarding rushed jobs)

These two numbers are shown side by side on the leaderboard, plus a
default combined score (simple average of the two, each normalized to 0-100)
for sorting. The combined score is a sort aid, not an auto-decision — admin
reviews both numbers and confirms the winner via an explicit "Award" action,
which writes to `technician_awards`. This matches the stated preference:
ranking is data-assisted, the final call is manual.

Winner: ₹2000. Runner-up: ₹1000.

## 7. New "Job Cards" tab (admin)

Four views, as mocked and approved:

1. **Pending Entry** — jobs marked complete but no job card transcribed yet
   (`job_card_type IS NULL` or no `scored_at`). Table: ticket, customer,
   type, assigned technician(s), date received → "Enter" action opens the
   entry form.
2. **Awaiting Verification** — `scored_at IS NOT NULL AND verification_call_status IS NULL`,
   sorted by `verification_due_at`. Shows "Due today" / "Due in N days" /
   overdue styling. → "Log call" action.
3. **+ New Job Card** — the entry form: job type, category (CCTV /
   Networking / Video Door Phone / Locks / Gate Automation / Access
   Control-Biometric / Fire Alarm / Other), ticket, technician(s), rework
   flag, start/end time, expected time, the items-installed repeatable list,
   and the office-scoring fields.
4. **Leaderboard** — current month by default, with a month picker for
   history. Rank, technician, avg rating, avg time efficiency, jobs count,
   bonus earned, and the Award action for the current month.

## 8. Finance tab integration

Add a **"Technician Bonus Pool"** card to `src/pages/finance.js`, using the
same `kpi()` helper already used for the existing "Gig Worker Pool" card
(finance.js:386-394): Bonuses Earned (this month) / Awaiting Payout (locked
+ approved-but-unpaid) / Paid This Month / Penalties Deducted.

## 9. API endpoints

- `POST /api/inquiries/:id/job-card` — create/update job card fields +
  items list (transcription + office scoring in one call)
- `POST /api/inquiries/:id/verification-call` — log call outcome, triggers
  bonus lock/unlock/recalculation per §5
- `POST /api/employees/:id/penalty` — log a penalty
- `GET /api/job-cards?status=pending|awaiting-verification` — the two queue
  views
- `GET /api/admin/leaderboard?month=YYYY-MM` — computed ranking for §6
- `POST /api/admin/leaderboard/:month/award` — confirm winner/runner-up,
  writes `technician_awards`
- `POST /api/inquiries/:id/bonus/mark-paid` — mirrors the existing gig
  payout "mark paid" action

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
- **Employee-facing "My Performance" widget** on `employee.js` — useful
  follow-on, but not confirmed as required for this build; revisit after
  the admin-side system is live.
- **Per-category time-standard tables** — deliberately replaced by
  per-job "Expected Time" set at assignment (§4), since categories were
  shown to have comparable time footprints in practice.
