# Web App Feature Inventory

**Purpose:** a standing reference for the mobile-app parity effort. Every distinct feature/capability of the production web app (`E:\service-app`, vanilla JS, no build-step React — `React.createElement` calls against a global React, pages in `src/pages/*.js`, loaded via `src/main.js` + `src/layout.js`) catalogued by page/module, so each item can be checked off as "mobile has this" / "mobile doesn't have this yet."

This is a snapshot as of 2026-08-21. Line numbers reference the file state at that commit and will drift — treat them as pointers, not guarantees.

---

## Role model

Source: `src/auth.js`, `src/supabase.js`, `src/main.js`.

Three roles exist in the `profiles.role` column: **`client`**, **`employee`**, **`admin`**. Default role for a new signup is `client` (`supabase.js` `getUserRole()` falls back to `'client'`).

- **Auth form** (`src/auth.js`) is a single login/signup card used for both employees and admins. Signup requires a **"Staff / Admin Access Key"** secret (`reg_key`) — there is no self-serve client signup through this form.
- **Login gate** (`src/main.js`, `showAuth()`): after a successful sign-in, if `role !== 'admin' && role !== 'employee'`, the app immediately signs the user back out and redirects to the public landing page with a toast ("Client accounts cannot log in here. Please use the public service request form."). **Clients never reach an authenticated dashboard** — their entire interaction is the unauthenticated public flow on the landing page (submit inquiry, track by phone + ticket number).
- Because of this, **`src/pages/client.js`** (`renderClientDashboard`, `renderClientTickets` — an authenticated client portal with a ticket list, ticket detail, comments) is **dead/unreachable code**: it is not imported by `main.js`'s `PAGE_LOADERS` and no nav config routes to it. It reads as a legacy or in-progress client-portal module. Worth flagging explicitly — if mobile is meant to have an authenticated client experience, this file is the closest prior art for what one might have looked like (ticket list, filter by status, new-ticket modal, ticket detail with comment thread), but it does not reflect current production behavior.
- **Employee session expiry**: employee (not admin) sessions are force-expired 30 days after login regardless of JWT validity, checked every minute client-side (`SESSION_MAX_AGE_MS`), matching a 30-day server JWT.
- **Employee sub-permissions** (admin-controlled, read off the profile row at login and live-updated via a Supabase realtime subscription on `profiles`):
  - `can_add_service` — gates a "Service Pricing" nav tab (employee can add ad-hoc service line items to the price list).
  - `worker_type === 'gig'` — gig workers get a "Public Jobs" tab (unassigned job pool they can self-claim) fixed employees don't see; gig work has its own payout/commission model (see Finance section).
  - `installations_enabled` — hides the "Installations" tab for that employee (defaults to visible).
  - `allowed_tabs` — a per-employee JSON array on the profile row restricting which nav tabs they can see at all (admin sets this in the Users screen). `dashboard`, `notifications`, `profile` are always-on and can never be hidden; `public-jobs` is governed by `worker_type`, not this list.
  - `can_update_profile` — gates whether an employee/admin can edit their own profile fields (`src/pages/profile.js`) vs. seeing them locked/disabled.

### Nav map (role → tabs → page module)

Source: `src/main.js` `getNavItems()` / `PAGE_LOADERS`. This is the authoritative list of every top-level screen in the app.

**Employee nav** (Main → Work → Services → Account):
`dashboard` · `my-stats` · `all-tickets` ("My Tasks") · `my-installations` (conditional) · `public-jobs` (conditional, gig only) · `notifications` · `my-attendance` · `my-leaves` · `my-eod` · `my-cash` · `my-collections` · `leaderboard` · `employee-training` ("Tutorials") · `my-training-courses` ("Training") · `device-followup` · `estimator` · `service-pricing` (conditional) · `profile`

**Admin nav** (Main → Operations → Management → Reports → Marketing → Config → Account):
`dashboard` · `stats` · `notifications` · `attendance` · `inquiries` ("Service Requests") · `installations` · `job-cards` · `auto-assignment` · `device-tracking` ("Device Follow-up") · `contacts` · `users` · `device-types` · `training-admin` ("Employee Tutorials") · `training-courses` · `finance` ("Finance Report") · `ai-report` · `payments` · `bills` · `cash` ("Cash Collections") · `collections` ("Collection Reports") · `salary` · `gig-payouts` · `leaves` ("Leave Requests") · `eod` ("EOD Summaries") · `feedback` ("Leaderboard") · `complaints` · `ads` ("Landing Ads") · `popup-ads` · `notices` · `discounts` ("Coupons") · `discount-details` · `pricing` · `settings` · `profile`

### Cross-cutting infrastructure (not a page, but app-wide)

- **`src/notify-center.js`** — every live notification (in-app toast, push, notifications-list tap) routes through this module for two things: (1) **text-to-speech** — speaks a short human-voice sentence per notification subject (`SpeechSynthesisUtterance`, prefers en-IN voice, mutable/muteable via `voice_alerts` localStorage flag, primed on first click/touch to satisfy browser autoplay policy), with per-subject spoken-line templates (payment amount + ticket, cash collected, new assignment, complaint, overdue, job completed, device update, leaderboard rank, training added, leave approved/rejected, EOD reminder, etc.); (2) a **full-screen notification detail overlay** (`openNotificationDetail`) showing icon, title, body, a readable key/value list built from the notification's `data` payload (amount formatted as ₹, pretty-printed labels), timestamp, and action buttons — an optional direct `url` link, a role-aware "Go to page →" button (subject → nav-target map mirrors `notifications.js`'s `NAV_MAP`, admin and employee often route to different pages for the same subject), and Dismiss.
- **`src/push.js`** — Web Push registration: fetches the server's VAPID public key, requests browser `Notification` permission (only if not already decided), registers a dedicated service worker at `/push-sw.js` scoped to `/app-push/` (kept separate from the main PWA service worker so it doesn't hijack it), subscribes via `PushManager`, and posts the subscription to `POST /api/push/subscribe` with the bearer auth token. No-ops silently if push isn't supported, permission is denied, or the user isn't logged in.
- **`src/ad-carousel.js`** (`AdCarousel` class) — a rotating ad widget (fixed 330×220 container) supporting image and video ads, device targeting (`device_target`: mobile/desktop/both — filtered via `matchMedia`), auto-rotate with a configurable interval, manual prev/next + dot indicators, play/pause toggle, pause-on-hover, and video ads that show a poster frame with a tap-to-play-with-sound button (autoplay-with-sound is blocked by browsers, so the click satisfies the user-gesture requirement) that also pauses carousel auto-rotation while the clip plays and resumes on end. Already documented in depth in `docs/superpowers/specs/2026-08-21-mobile-landing-liquid-glass-design.md` — see that spec for the full design treatment; this entry is just a pointer.
- **PWA install prompt** (`src/main.js`) — captures the `beforeinstallprompt` event, exposes `showPWAInstallBtn()`/`hidePWAInstallBtn()` (landing page decides when to show it), and on accept triggers the native install flow.
- **Service worker update flow** — forces the PWA service worker to activate immediately on registration (`registerSW({ immediate: true })`) and re-checks for updates hourly and on tab-focus, specifically so cached old bundles don't keep serving stale public links (e.g. SMS feedback links) after a deploy.
- **Browser back-button support** — pushes each in-app nav change onto `history` (`#pageId` hash) so the Android/PWA back gesture navigates within the app instead of backgrounding it.
- **Global search** — topbar search input (`#portal-nav-search` in `src/layout.js`) searches/filters the current role's nav items live.

---

## Public / unauthenticated (landing.js)

`src/pages/landing.js` (~2025 lines) is the entire client-facing surface of the app — no login required. Public API layer (`postPublicApi()` helper): base `/api` in prod, `http://localhost:5000/api` in dev, no auth header.

**Shell / nav**: logo, theme toggle (persisted), "Staff login" button (routes to the authenticated login form), hero/marketing banner ("Verified Service Request" badge), ad carousel slot (see `src/ad-carousel.js`, embedded here — full design treatment already documented in `docs/superpowers/specs/2026-08-21-mobile-landing-liquid-glass-design.md`) shown when admin-configured ads exist, otherwise a static promo panel (avg resolution time, jobs completed, rating). Popup ad modal shown once per session (image/video overlay, admin-configured, respects an enable/disable flag). Fixed contact card: Call (`tel:`) and WhatsApp (`wa.me` deep link, prewritten message) buttons.

Bootstrap: `GET /landing/bootstrap` — ads, popup ads, popup-enabled flag, reopen-enabled flag + reopen limit, admin-defined service categories; cached client-side (localStorage, 10 min TTL).

**Four top-level tabs** (New Request / Track / Complaint / Installation):

- **New Request wizard** (3-step, phone → OTP → details):
  1. Phone entry (10-digit, India +91 fixed) + a client-generated CAPTCHA (5 random letters, refresh button) → `POST /otp/send`.
  2. 6-digit OTP entry (auto-advance boxes, paste support, backspace nav) → `POST /otp/verify`; 60-second resend countdown with live timer, `POST /otp/resend`.
  3. Service details form: name, location (GPS "Current" via high-accuracy-then-network-fallback geolocation + Nominatim reverse geocode, or manual text entry, "open exact pin" map link), preferred visit time (5 fixed slots), optional bill number, issue dropdown (admin-configured categories from bootstrap, "Other" free-text fallback) — or an "Installation booking" banner in place of the issue picker when arriving from the Install flow — optional description (max 1000 chars).
  4. Submit → `POST /data/inquiries` (client generates `ticket_no` as `NE-YYMMDD-XXXX`). Success screen: ticket number + copy-to-clipboard, "Track this request", "Submit another request".
- **Installation booking**: grid of 6 fixed install types (CCTV, Networking/LAN, WiFi/Access Point, Biometric/Access Control, Video Door Phone, Smart Home Automation), each with icon/tagline/feature bullets, "Book this" feeds into New Request step 3 with the install type pre-set. Note: the top tab bar's "Installation" entry actually navigates to the separate `install.js` page for the primary flow; this in-page path only handles the `?tab=install&type=...` return case.
- **Track Request**: phone + optional ticket number search (ticket number given → direct lookup; phone-only → list of all tickets for that phone, single result auto-opens). Ticket list view (ticket no, service, created date, status badge). Ticket detail view: status timeline (open→assigned→in_progress→resolved), SLA/service-commitment countdown card while unresolved, status-aware info panel (customer/location/service/description while open; assigned technician name/phone/role once assigned), billing card (amount, paid/unpaid, external "Pay now" link, PDF bill download once paid), feedback block (locked — "only via secure link"), **reopen flow**: "Issue not resolved?" textarea (min 10 chars) inserts a `complaints` row prefixed `ISSUE NOT RESOLVED:`, gated by an admin-configured reopen-enabled flag + reopen limit (shows "limit reached" once exhausted). Deep-linkable via `?tab=track&ticket=...&phone=...`. Note: this view and the OTP/inquiry-submit flow use `postPublicApi`, but ticket lookup/listing and the reopen-complaint insert go **directly through the Supabase client** (`inquiries`, `complaints` tables), bypassing the `/api` layer.
- **Complaint tab**: ticket number + phone + complaint text (min 10, max 2000 chars) — verified against the ticket, inserted into `complaints` directly via Supabase. Success screen offers "file another" or "track this ticket instead".
- **Feedback-only page** — a separate secure route (`/f/:token` path or `?token=`/`?feedback=`/`?f=` query params), resolved via `GET /api/feedback/resolve?token=`: shows ticket/status/service summary, overall + technician star ratings, comment box, submits via `POST /api/feedback/submit`. Handles loading/error/already-submitted states; has its own minimal nav (theme toggle + "back to portal").

Third-party integration: OpenStreetMap Nominatim for reverse-geocoding (no API key).

---

## Client-facing legacy module (client.js) — unreachable, informational only

`src/pages/client.js` (350 lines) is **not wired into the app** (see Role model above) but documents what an authenticated client portal once looked like or was scaffolded for:

- **Client dashboard**: a "New Service Request" form (name, phone, location/address, bill number optional, service/item needed textarea) that creates a `tickets` row directly (since the user would already be authenticated) tagged `category: 'service_request'`, `status: 'open'`; a side "Your Activity" mini-stat panel (active tasks count, completed count); a promo card linking to "My Tickets".
- **My Tickets list**: search-by-title, status filter (Received/Assigned/In Progress/Resolved), ticket cards (id, status badge, title, created date), "+ New Ticket" modal (title, category: network/hardware/software/other, priority: low/medium/high, description).
- **Ticket detail modal**: full description, status + priority badges, threaded comments (`ticket_comments` table joined to `profiles` for author name) with a send-message box that appends a new comment and re-opens the detail view.

Note for mobile parity planning: since this flow is dead in production, it should **not** be treated as a spec to match — the real client experience is the public landing-page inquiry/tracking flow (unauthenticated), documented below.

---

## Device tracking module (device-tracking*.js)

Shared model: a ticket/inquiry (`inquiries` table) can have a `device_status` and `follow_up_status`, with related log tables `device_taken_logs`, `device_return_logs`, `device_follow_up_logs` (each joined to `profiles` for the acting user's name). All requests use `Authorization: Bearer <auth_token>`. This module tracks devices sent off-site for repair (e.g. a DVR pulled from a client site and brought to a service center).

### Shared API layer — `src/pages/device-tracking.js` (200 lines, the write/read primitives used by the other two files)
- `GET /device-tracking/status/:inquiryId` — full status bundle (taken/return/followup logs).
- `saveDeviceTaken(inquiryId, employeeId, imageFile, description)` — uploads a photo (client-compressed to ≤1440px JPEG q0.72 first) via `POST /upload`, then `POST /device-tracking/taken`.
- `saveDeviceReturn(inquiryId, imageFile, condition, notes)` — same upload pattern, then `POST /device-tracking/return` (condition: repaired/good/damaged/lost).
- `saveFollowUpStatus(inquiryId, status, notes)` — `POST /device-tracking/followup` (status: awaiting_parts/repair_progress/ready_return/returned).
- `getAllDeviceTracking()` — `GET /device-tracking/all`, admin-only full list.

### Admin — `src/pages/device-tracking-admin.js` (366 lines) — `renderDeviceTrackingTab`
- Full cross-job table of every device-tracking record: free-text search (ticket/phone/customer), device-status filter (taken/returned), follow-up-status filter (4 states), "⚠️ Closed without return" audit checkbox.
- **Audit flag**: a ticket whose status is resolved/closed/case_closed/foc/issue_not_resolved but has no device-return log gets a red badge — catches devices that were never returned before the ticket closed.
- Table columns: ticket, customer, service, device-status badge, follow-up badge, taken-by/date, "View / Follow-up" button.
- **Detail modal**: read-only device-taken info (photo/description/who/when) and device-return info (photo/condition/notes/when), full follow-up history log; admin actions to **add a follow-up update** (status + notes) and **mark device returned** (optional photo, condition dropdown, notes) — the only role with a confirmed write UI for both actions in these three files.

### Employee — `src/pages/device-tracking-employee.js` (190 lines)
- `getEmployeeDevices(employeeId)` — `GET /device-tracking/employee/:employeeId`, devices currently assigned/in-service for this employee.
- Read helpers (`getDeviceStatus`, `getDeviceTakenInfo`, `getDeviceReturnInfo`, `getFollowUpLogs`) plus pure HTML-string render helpers (`renderDeviceTrackingTab`, `renderFollowUpTab`) meant to be embedded inside the technician's job/service detail modal — this file itself has no click handlers for taking/returning a device; the actual writes (`saveDeviceTaken`/`saveDeviceReturn`) are wired up from `employee.js`'s task modal "Device Service" tab (see Employee pages below).
- `getDeviceStatusBadge(status)` — small badge helper (taken/returned/pending).

### Role summary
- **Client/public**: no direct device-tracking UI — the public ticket-tracking detail view in `landing.js` does not surface `device_status`/logs.
- **Employee**: views devices assigned to them; takes/returns devices with photo + notes from within a job's "Device Service" tab (mandatory photos, condition select, quick-fill note chips, full history timeline); resolving a ticket is blocked until its device is marked returned.
- **Admin**: full cross-job oversight table with audit flag for devices closed-without-return, add follow-up updates, and mark-returned.

---

## Admin pages (admin.js, admin-notices.js)

`src/pages/admin.js` (6058 lines) is the largest module in the app — 25 distinct screens/tabs, all admin-only. Backend pattern: most CRUD is direct `supabase.from(...)` access; a smaller set of privileged operations go through the Express API (`/api/admin/*`, `/api/settings/*`, `/api/auto-assignment/*`, `/api/attendance/*`, `/api/device-tracking/*`, `/api/inquiries/*`, `/api/upload`), all bearer-token authenticated.

1. **Admin Dashboard** (`renderAdminDashboard`) — live operations hub: counts of tickets, open inquiries, active attendance, low stock, complaints, EOD warnings, installations. "Online Now" card (clocked-in employees, fixed vs gig badge, pulsing status dot, clock-in time/location). EOD Warnings card. "Needs Attention" queue (unassigned/declined/stale requests). Recent Service Requests / Installations / Complaints / Resolved Services swappable list-cards. "Services by Company" report table (company/date-range/status filters, per-row drill-down modal, CSV export). Auto-Assignment on/off toggle inline. "Register Request" — admin creates a ticket on a customer's behalf (bypasses OTP; GPS capture + reverse geocode; assign to an online employee). Live Supabase realtime subscription driving browser notifications (new inquiry, new/updated installation, payment received, new feedback, new/updated complaint, employee clock-in/out).
2. **Service Request Detail Modal** (`openInquiryDetail`) — full ticket detail: customer info, service item, description, location (+ exact-pin map link), preferred time, SLA countdown, device type/serial, extra charges, decline-reason banner, assignment-locked banner, customer feedback. Generated bill breakdown + "View & Download Premium Bill". **"Release to Public Pool"** action (converts to a gig-worker job, online-payment-only). Device-service photos block (taken/returned photos + follow-up timeline). Assign/reassign technician dropdown (only clocked-in employees + "always-assign" exempted ones); auto-creates a linked `tickets` row on first assignment.
3. **Attendance Logs** (`renderAttendance`) — full log table (date, employee, clock in/out, hours, location, selfie photo). Stats: today's attendance, currently active, forgot-EOD count, restricted-users count, avg hours today. "Clock-in Restrictions" panel (employees over the missed-EOD threshold, one-click "Resolve restriction"). Name/date filters, CSV export, "View on map" (Leaflet modal) per GPS-tagged clock-in, "Reset Face ID" per employee.
4. **Service Requests / Inquiries** (`renderInquiries`) — master table with tabs: Active, Resolved, Issue Not Resolved, Reopened (🔁), Awaiting Payment, Paid, All. Company filter, status filter panel, CSV export, "Register Request", delete request (cascades `inquiry_services`/`ticket_comments`/`tickets`/`inquiries`).
5. **Inventory / Stocks** (`renderStocks`) — item/quantity/unit table with low-stock badge, CSV export.
6. **Daily Summaries / EOD Reports** (`renderEODReports`) — staff EOD report list, name/date filters.
7. **All Tickets & Tasks** (`renderAllTickets`) — master ticket list joined to inquiries (customer, contact, assigned staff, status, created date), "Manage" opens inquiry detail.
8. **Leave Requests** (`renderLeaveRequests`) — approve/reject employee leave, shows date range + reason.
9. **Salary Overview** (`renderSalaryOverview`) — attendance-based monthly salary estimate per employee ((present + approved-leave days) ÷ days-in-month × monthly salary), employee count, total payroll, total estimated-earned.
10. **Contacts** (`renderContacts`) — customer directory sourced from inquiries, filter tabs (All/Today/Week/Month/Unique Customers), CSV export, per-row Call/WhatsApp/copy-phone.
11. **Clients** (`renderClients`) — simple client list (name/email/company) from `profiles` role=client, CSV export.
12. **User Management** (`renderUsers` + `openUserModal`) — full staff/client/admin table with inline per-employee toggles: Service-Add access, Profile-Edit access, Always-Assign priority, EOD Exempt, Photo Clock-In Exempt, Location/Geofence Clock-In Exempt, and per-tab visibility (Attendance/Leave/Collections/Stats). Create/Edit modal: name, email, password, role (client/employee/admin), phone, salary, worker type (Fixed vs Gig, with explanatory copy on gig-pool/online-only payment behavior), company, address, Installations-tab visibility checkbox, granular 14-item "which tabs can this staff see" checklist. Delete user (purges auth + profile).
13. **Payment Tracker** (`renderPaymentsTab`) — all billed inquiries, paid/unpaid stats, search + status tabs, "Mark Paid", "Details" → inquiry modal.
14. **Bills** (`renderBillsTab` + `showBillShareModal`) — all generated invoices (date, ticket, customer, device, total, payment status); "View" opens the full premium bill preview; "Share" generates a public PDF link with copy-link and pre-filled WhatsApp send. Stats: total/received/pending/total billed; search + paid/unpaid filter.
15. **Gig Worker Payouts** (`renderGigPayoutsTab`) — jobs completed by gig/public-pool workers: bill total, company-kept portion (GST+platform fee), payout amount, "Mark Paid".
16. **Devices & Companies Management** (`renderDeviceTypesTab`) — CRUD for "Device Types" (technician picklist) and "Companies Registry" (default "Networking Experts" protected from edit/delete); read-only "Reported Customer Devices" table, CSV export.
17. **Cash Collections** (`renderCashCollectionsTab`) — per-employee cards of pending vs submitted cash-collected bills, checkbox multi-select with live selected-total, "Record Submission", collapsible submission history.
18. **Service Pricing (admin)** (`renderPricingTab`) — full price-list CRUD (category/sub-category/sub-sub-category/cost), cascading filters, search, select-all + bulk delete, "Remove Duplicates", bulk Excel/CSV import with smart column detection + template download, CSV export.
19. **Client Feedback / Leaderboard** (`renderFeedbackTab`) — stats (total reviews, overall avg rating, 5-star count, employee count, "Most Reviews This Month"); top-3 podium visualization; monthly + all-time employee ranking tables; "Reviews by Company" breakdown; full reviews table with search; live realtime updates.
20. **Complaints** (`renderComplaintsTab` + `openComplaintResponder`) — open/resolved stats, search; respond modal (admin writes a customer-facing response, auto-sent via SMS, plus status update open/in_progress/resolved, tracks `resolved_at`); live realtime updates.
21. **Landing Page Ads** (`renderAdsTab` + `openAdEditor`) — manage the public landing-page carousel: position/order, caption, duration, device targeting (desktop/mobile/both), scheduled start/expiry, active toggle, audio-enabled flag for video; file upload or direct URL; required-resolution guide (desktop 1600×1200, mobile 1080×1350, square logo 512×512, popup 1200×800).
22. **Employee Pricing View** (`renderEmployeePricingTab`, admin-facing but scoped) — read-only pricing table scoped to what's assigned to the logged-in employee.
23. **Settings** (`renderSettingsTab`) — registration secret keys (employee/admin signup, view/copy/regenerate); Auto Clock-Out Time (global fallback); Office Clock-In Geofence (capture current GPS as office location + radius); Fixed-Employee Clock-In Requirements (photo required / precise-location required toggles); Landing Page Popup enable/disable; Device Service Tracking master on/off switch; Ticket Reopen Policy (max reopens + button visibility); Gig Worker Pool Timeout (auto-release-to-pool minutes); Restrictions panel (unlock employees blocked from clock-in by repeated missed EOD).
24. **Auto Assignment** (`renderAutoAssignmentTab`) — global on/off toggle for round-robin auto-assignment; live queue table (position, clock-in time, assignments today, Priority/Next badges, Always-Assign-offline employees shown separately); Recent Assignments audit log.
25. **Installation Requests** (`renderInstallationsTab` + `openInstallationDetail`) — full table with status tabs (Active/Pending/Assigned/In Progress/Completed/Cancelled/All), keyword search, CSV export; detail modal with assign-technician dropdown, status dropdown (auto-advances pending→assigned on assignment), delete request.

**Cross-cutting note for mobile parity**: the gig-worker vs fixed-employee distinction (`worker_type`, always-assign, public-pool release/claim, payout split) touches Users, Inquiry Detail, Gig Payouts, Auto Assignment, and Settings — likely the single largest cross-cutting feature area to verify. Some admin UX is desktop-shaped (drag-order via numeric position for ads, `prompt()`-based edit dialogs for pricing/device types, Leaflet map popups) and may need a different interaction pattern on mobile rather than a direct port.

### `src/pages/admin-notices.js` (183 lines) — Notice Board
- `renderNoticesTab` + `openNoticeEditor`: publish staff notices directly to the employee dashboard.
- Stats: total notices, active count, hidden count.
- Card grid — priority-colored (normal/high/urgent, with matching icon), Active/Hidden badge, posted date + optional expiry date.
- Create/Edit modal: title (max 160 chars), body message, priority (normal/high/urgent), expires-at datetime picker, "Publish to employee dashboard" checkbox.
- Per-notice actions: Edit, Hide/Show (toggles active), Delete (confirm).

---

## Employee pages (employee.js)

`src/pages/employee.js` (6118 lines) covers all employee-facing screens except Stats (`stats.js`), Profile (`profile.js`), and Training (`training.js`/`media-training.js`). Two API base patterns: relative `/api` in prod, `http://localhost:5000/api` in dev, `Authorization: Bearer <auth_token>`; most data access is direct `supabase.from(...)`.

1. **Dashboard** (`renderEmployeeDashboard`) — live clock + clocked-in/out chip + session duration. Clock In/Out toggle:
   - **Fixed employees** ("smart" clock-in): GPS (high-accuracy→low-accuracy fallback), optional front-camera selfie + on-device face-descriptor extraction/verification (face-api models), submitted via `POST /api/attendance/clock-in-photo`.
   - **Gig workers** ("plain" clock-in): GPS + reverse geocode only, direct insert.
   - Clock-in requirements (photo required / geofence required) and per-employee exemptions read from `/api/settings/clockin-requirements` + profile flags.
   - Clock-in window enforcement (opens 8:30 AM, closes at the admin-configured auto clock-out time).
   - Mandatory clock-in gate modal (no close button) blocks portal use until clocked in.
   - Clock-out forces an EOD report submission first, then updates the attendance row.
   - EOD status button/modal (submitted/warning/restricted state); **strict EOD block** locks clock-in after 4+ missed EOD reports (unless exempt).
   - Notice Board (admin notices list + detail modal).
   - Public Jobs widget (gig workers only) — preview of pool jobs, links to full tab.
   - Pending assignment requests: Accept / Decline (with reason prompt).
   - "Today's Route" — timeline/progress-bar of all active + accepted tasks with per-stop status and progress %.
   - Reopened Tickets section (customer marked "issue not resolved" → free rework).
   - Accepted Requests list with Update/Map buttons.
   - "Devices in Service" card (shared with Tasks page) — daily throttled reminder notification.
   - Realtime Supabase subscription → browser notification + sound on new assignment or payment received, auto re-render.
2. **Attendance Records** (`renderEmployeeAttendanceRecords`) — stat cards (days present this month, active sessions, missed EOD count, total logged hours), full history table, "Auto clock-out pending" flag for forgotten clock-outs.
3. **Leave Requests** (`renderEmployeeLeaveRequests` + `openLeaveModal`) — stat cards (pending requests, approved leave days), full table, "New Request" modal (start/end date, reason).
4. **EOD Reports** (`renderEmployeeEODReports`) — today's summary card (or submit textarea), full history table.
5. **My Cash** (`renderEmployeeCash`) — cash-collected jobs (paid, cash payment method), Pending vs Submitted split (submitted once admin records it), stat cards (pending total, submitted total, total cash jobs, all-time total), status filter.
6. **Salary** (`renderEmployeeSalary`) — month-to-date estimate `(monthlySalary / daysInMonth) × (presentDays + approvedLeaveDays)`, pure client-side calc, stat cards + formula breakdown.
7. **Leaderboard** (`renderEmployeeLeaderboard`) — `/api/leaderboard?month=` (separate endpoint from the dashboard's inline mini version); top-3 podium (medal icons, avatar initials, height-scaled bars); "Your rank" cards for monthly + all-time.
8. **Estimator** (`renderEmployeeEstimatorTab`) — pre-service client-quote builder (no ticket created): client details form (name, WhatsApp, service title, location, company incl. custom), cascading service picker (Main→Sub→Issue from `service_pricing`) + live search, fees/discount (extra charge+reason, platform fee, travel km×rate, GST %, admin discount preset or manual discount w/ required reason), live-updating estimate slip, copy-to-clipboard, Send via WhatsApp. Pure client-side, no persistence.
9. **My Installations** (`renderEmployeeInstallations`) — jobs from `installations` assigned to the employee, status badges, Call/Directions buttons, one-tap status advance (Start Installation → in_progress, Mark Completed → completed).
10. **Public Jobs / Gig Pool** (`renderEmployeeGigPool`) — `inquiries` where `pool_status='pool'`; "Claim Job" → `POST /api/inquiries/:id/claim` (race-safe, 409 if already claimed); online-payment-only note.
11. **My Tasks** (`renderEmployeeTasks`) — combines `tickets` + `inquiries` (pending/accepted) into one list. "New Assignments Pending" (Accept/Decline w/ reason). Filter panel: status (In Progress/Reopened/Resolved/Issue Not Resolved/Device Follow Up/Case Closed) + search. Job cards: Call/WhatsApp/Open-Maps, SLA timer ("paused — device in service" state), reopened badge. "Devices in Service" panel via the Device Follow Up filter. Realtime channel + notification on new assignment.
12. **Manage Service modal** (`openTaskModal`) — the core per-ticket workflow, 3 tabs:
    - **Status tab**: transitions — In Progress, Resolved, Reschedule (date/time picker, sends SMS, resets SLA), Issue Not Resolved, Case Closed (final, locks ticket), FOC (Free of Cost for reopened/rework, requires existing bill number, no new bill). Mandatory Work Details textarea. Feedback link generator + WhatsApp share. Ticket summary panel. Employee-pin vs client-pin map links.
    - **Device tab**: company (dropdown of `companies` + custom), device type (datalist + quick-pick chips), device serial — saved to the inquiry, shown on the bill.
    - **Device Service tab** (conditional on device-tracking flag): "send to service center" toggle; device-taken (mandatory photo, notes w/ quick-fill chips); device-return (mandatory photo, condition select, notes); follow-up log (4 statuses, notes, quick-fill chips, full history); resolving is blocked until the device is marked returned.
    - **Bill tab**: cascading service picker + search to add priced line items; additional charges + reason; coupon redemption (`POST /api/coupons/validate`, `/redeem`); employee/manual discount + required reason, admin discount presets; transport distance (manual km, "Capture My Location", "Auto km" from clock-in coords); live breakdown (services, extra charges, platform fee, transport, GST 18%, discount, total); **"Generate & Send Premium Bill"** (PDF via html2canvas+jsPDF or server-side `/api/bills/generate`, upload to `/api/bills/upload`, Print/Save, WhatsApp send with formatted caption + PDF link); payment method toggle (Online/Razorpay vs Cash — cash disabled for gig workers); "Mark Cash Collected"; payment link + QR generation (`POST /api/payments/create-link`), live status polling (`POST /api/payments/check-status`), payment-received notification.
13. **Device Follow-up** (`renderEmployeeFollowUp`) — standalone sidebar page for devices currently in service (separate entry point from the Tasks filter). Per-device card: customer/device grid, follow-up status update + notes, history timeline, "Open ticket to complete service". Fully gated off when the device-tracking master flag is disabled.
14. **Service Pricing management** (`renderEmployeePricingTab`) — employees (not just admins) can manage the pricing catalog: add/edit/delete via prompt() dialogs, bulk delete selected, "Remove Duplicates", filter by category + search, Excel/CSV import (template + column mapping), CSV export.
15. **Self-registered Service Request** (`openEmployeeRequestModal`) — employee registers a walk-in/phone-in customer and auto-accepts it for themselves: customer name, phone (validated), company (dropdown+custom, auto-created), preferred time, issue category (from `service_pricing` or custom), location (manual + GPS w/ reverse geocode), description. Creates a `tickets` row + linked `inquiries` row + a `ticket_comments` audit entry (rolls back the ticket if the inquiry insert fails); client-generated ticket number.

Third-party integrations used across these screens: OpenStreetMap Nominatim reverse-geocoding, `wa.me` WhatsApp deep links, CDN-loaded html2canvas/jsPDF for PDF bills, face-api models for selfie clock-in.

---

## Finance cluster (job-cards.js, finance.js, collections.js, discounts.js)

### `src/pages/job-cards.js` — Admin tab: Job Cards

Role-gated: **Admin only** (talks to the Express `/api` REST backend with bearer-token auth, not direct Supabase). Backend: `GET/POST /api/job-cards`, `/api/inquiries/:id/verification-call`, `/api/inquiries/:id/job-card`, `/api/admin/leaderboard`, `/api/admin/leaderboard/:month/award`.

- **Pending Entry view**: lists completed jobs (`status=pending`) awaiting a job-card write-up — ticket #, customer, service, assigned technician(s), completion date — with an "Enter →" action per row.
- **New Job Card entry form**: manual inquiry-ID entry (or pre-filled context when launched from a row); Job Type (Installation/Service); Category (CCTV, Networking, Video Door Phone, Locks, Gate Automation, Access Control/Biometric, Fire Alarm, Other); secondary technician ID; start/end datetime; expected time (minutes); rework-needed checkbox; work-done note; dynamic "Items Installed/Used" line list (item name, qty, notes, add/remove rows). Saving schedules an automatic 3-day verification-call reminder.
- **Awaiting Verification view**: jobs due for the 3-day follow-up call, due-date badge (Overdue / Due today / Due in N days), customer phone shown, "Log call →" action.
- **Verification Call modal**: outcome dropdown (Confirmed OK / Issue found / Could not reach customer), 1–5 rating, free-text note.
- **Leaderboard view**: monthly technician leaderboard (month picker), ranked by performance — avg rating, avg time efficiency (% vs expected time), jobs verified count, gold-medal styling for #1.
- **Monthly bonus award**: admin awards ₹2000 to the top technician for a given month (confirm dialog), button disables and shows "Awarded ₹X" once awarded; one award per month max.

### `src/pages/finance.js` — Finance & Growth Dashboard

Role-gated: **Admin only**. Backend: `GET /api/finance/summary?from&to`, `POST /api/ai/finance` (AI narration).

- **Date-range filter**: This Month / Last Month / This Year / All Time presets, plus custom from/to.
- **KPI cards**: Total Billed, Received, Collection Rate %, Pending, Avg Ticket — each with a period-over-period delta badge (▲/▼/flat).
- **Revenue Trend chart**: custom SVG line/area chart, last 12 months, Billed vs Received, animated draw-in.
- **Revenue by Category donut** (top 8 + Other) and **Payment Method donut** (Online/Cash/Unspecified).
- **Business Health gauge**: animated radial gauge of collection rate %, plus received/pending/GST-collected figures.
- **Receivables Aging**: stacked bar of 0–7 / 8–30 / 31+ day overdue buckets.
- **Gig Worker Pool card** (conditional, shown only if gig jobs exist): gig billed total, company's cut (GST+platform fee), worker payouts, awaiting-payout amount.
- **Job Card Activity card** (conditional): jobs logged this month, awaiting verification, verified count, current Technician-of-the-Month award (name + amount).
- **Growth Advisor panel**: rule-based (client-side, no AI) insight cards — collection-rate health, 31+ day overdue warning, month-over-month revenue growth/decline, top-earning category, top-collecting technician, undeposited cash-in-hand warning, average-ticket tip.
- **AI Business Report panel**: free-text "Ask" box + "Generate Report" button calling `/api/ai/finance` for a narrative growth analysis of the selected period; renders lightweight markdown (bold, bullets).
- **Technician Performance bars**: per-technician billed vs received horizontal bars (animated), up to 8 technicians, avatar initials.
- **By Service Category table** and **By Company table**.
- **Export to PDF**: opens a print-formatted letterhead report in a new tab (auto-triggers print dialog) — summary, by-technician, by-category, by-month tables.
- **Export to CSV**: totals, GST, discounts, cash-in-hand, per-technician/month/category breakdown.

### `src/pages/collections.js` — Collections (Employee "My Collections" + Admin "Collection Reports")

Two entry points: `renderEmployeeCollections` (own view) and `renderAdminCollections` (all-employee oversight). Backend: direct Supabase (`inquiries`, `service_pricing`, `inquiry_services`, `profiles` — no REST layer).

- **Bill breakdown logic**: derives net, GST, GST rate, platform fee, travel/transport fee, discount, extra cost, taxable amount, services subtotal, and gross service amount from `bill_total` + component fields — reconciles the full financial breakdown per ticket.
- **Bill Detail modal** (any row): line-item breakdown from `service_pricing`/`inquiry_services`.
  - **Employee view**: Service + Additional charges + Travel + Total only (no discount/profit/GST visibility).
  - **Admin view**: adds platform fee, discount given ("profit cut"), taxable amount, GST (with rate %), net collected, payment mode (Cash/Online).
- **Employee "My Collections"**: period filter (Today/This Week/This Month/This Year/Custom/All Time); stat cards (Service total, Travel total, Total Collected + count); **Gig Pool Earnings card** (conditional — total earned, paid out, awaiting payout, independent of the payment-status filter); table of collected tickets, row-click → Bill Detail modal.
- **Admin "Collection Reports"**: same period filter + Employee filter dropdown; stat cards (Service, Travel, Platform Fee, GST 18%, Discount Given, Net Collected); **Gig Pool Earnings section** (conditional — gig billed, company's keep, worker payouts, per-worker breakdown table with unpaid-count flag); **By Employee summary table** (sorted by net desc); **full transaction table** (date/ticket/customer/employee/service/travel/platform/GST/discount/net/mode, row-click → admin Bill Detail modal); **CSV export** of the filtered transaction set.

### `src/pages/discounts.js` — Coupons & Discount Reporting

Role-gated: **Admin only**. Backend: direct Supabase (`coupons`, `inquiries`, `profiles`).

- **Coupons list/table**: code, discount value (percent w/ optional max-discount cap, or fixed ₹), min bill amount, usage count/limit, expiry ("Never" if none), computed status badge (Active/Hidden/Expired/Used up).
- **Add/Edit Coupon modal**: code (auto-uppercase, `[A-Z0-9_-]{2,40}` validated), type (Fixed ₹ or Percentage — percent reveals an optional max-discount cap field), optional min bill amount, optional usage limit (unlimited if blank), optional expiry (datetime-local), optional internal note, Active checkbox. Validates code required/format, value > 0, percent ≤ 100. Duplicate-code conflicts surfaced as a friendly message.
- **Hide/Show toggle** per coupon (soft-disable, flips `active`) and **Delete** with confirm dialog.
- **Discount Details / Discount Requests report** (separate tab): all billed inquiries where an employee applied any discount — stat cards (total discounted-bill count, total ₹ discount given, count with manually-typed reason); full table (date, ticket, customer, employee, discount amount + label/source, reason text or fallback label).

*Note: job-cards.js and finance.js use the Express `/api` REST layer with bearer-token auth; collections.js and discounts.js talk to Supabase directly. Mobile needs to mirror both integration patterns depending on which screen it's matching.*

---

## Training / install cluster (install.js, media-training.js, training.js)

### `src/pages/install.js` (844 lines) — public installation booking page

**Public, unauthenticated** — reached via a "Book Installation" entry point before login, separate from the landing page's in-flow installation banner.

- **Service catalog grid**: 6 static installation types (CCTV, Networking/LAN, WiFi/Access Point, Biometric/Access Control, Video Door Phone/Intercom, Smart Home Automation), each with icon, tagline, color accent, 4 "includes" bullets, 3 highlight tags.
- Marketing hero + trust strip (Certified technicians, Same-day dispatch, 4.9★ rating, 30-day warranty).
- Direct contact bar (click-to-call, WhatsApp deep link, hardcoded phone number).
- **Booking modal, 4-step wizard**: (1) phone entry + OTP send (`POST /otp/send`); (2) OTP verify (`POST /otp/verify`, 60s resend countdown, `POST /otp/resend`); (3) booking details — full name, company (optional), location name, preferred date (min tomorrow) + time slot (3 fixed slots), full address, special instructions (optional); (4) submit — client-generates a ticket number (`INST-YYMMDD-####`), `POST /data/installations` with status `pending`, success screen shows the ticket number + SMS-confirmation notice. Step-progress indicator and per-button loading spinners throughout.

### `src/pages/media-training.js` (1038 lines) — mixed: popup ads, tutorial authoring/consumption, AI business report

- **Popup ads (admin)** (`renderPopupAdsTab`) — upload full-screen popup image/video for two placements (landing page or employee portal), device targeting, caption, position/order, duration (seconds), active toggle. File upload with live progress bar. Media table (thumbnail/video preview, placement badge, device target, status, position; Edit/Show-Hide/Delete). Edit modal supports "upload file" or "enter URL" directly.
- **Employee-facing popup ad display** (`mountEmployeePopupAds`, mounted globally post-login regardless of role) — auto-shows one active popup ad (placement `popup_employee`) once per session, respecting device targeting and start/expiry dates, full-screen overlay with close button.
- **Employee tutorial admin** (`renderTrainingAdminTab`) — dashboard stats (total tutorials, employee count, avg completion %, count fully completed by all employees). Upload tutorial: title, category (free text), position, description, required/optional toggle, single image or video file (guidance: videos <3min, ≤50MB, MP4/WebM). Per-tutorial admin card: thumbnail (autoplay-muted video preview or image), video/image badge, Required/Optional badge, Hidden badge, completion progress bar, collapsible "pending" list of employees who haven't completed it, actions (Watch/Edit/Show-Hide/Delete — delete cascades to completion records). Edit modal with optional media replacement. **Live watch tracking panel** (video tutorials only) — per-video list of employees with % watched + "time ago", auto-polls every 6 seconds.
- **Employee tutorial consumption** (`renderEmployeeTrainingTab`) — animated circular progress ring for overall completion %, chip row (completed/pending/required-pending counts). Filter bar: All/Required/Pending/Completed/per-category, plus live text search. Tutorial grid cards (thumbnail, type badge, Required/Optional badge, category chip, done checkmark, per-video watch-progress bar, Watch/Mark Complete buttons). Tutorial viewer modal (full-screen lightbox, image or video with controls) — while playing, **reports watch progress to the backend** (throttled ~every 4s + at video end + on close/pause), live-updates the card's watch bar. "Mark Complete" inserts a completion record, disables the button, toasts.
- **AI Report (admin)** (`renderAIReportTab`) — cross-module business summary: paid revenue, unpaid/awaiting-payment total, cash pending, resolved-services count, issue-not-resolved count, active-services count, gig-pool revenue + payout totals (conditional). **Auto-generated "Business Notes"** — plain-language sentences synthesized from the data (e.g. "Collect ₹X from unpaid bills," "N services need follow-up"). Employee Progress table (worker type badge, assigned/resolved/issue counts, online/offline status from today's attendance). Read-only report — no writes.

### `src/pages/training.js` (977 lines) — full LMS ("Training Academy")

Course/lesson/quiz authoring for admin, course player for employees. All calls go through the Express `/training/*` REST API (bearer auth) — distinct from media-training.js's direct-Supabase pattern for ads/tutorials.

- **Admin: course list** (`renderTrainingCoursesAdmin`) — stat tiles (total courses/lessons/quizzes/completions); course cards with category-based theme/icon, Hidden badge, animated completion ring, lesson/quiz/assigned-count meta; actions New Course / Progress / Manage / Delete (cascades lessons/quiz).
- **Admin: course create/edit form** — title, category (datalist suggestions), description.
- **Admin: course editor modal, 4 tabs**:
  - *Lessons* — add lesson (title, type video/image/pdf/file/text-only, optional media upload, notes/content), list with per-lesson delete.
  - *Quiz* — bulk Excel upload (downloadable sample workbook covering all 4 question types via SheetJS from CDN, client-side row validation with per-row error reporting); **4 question types**: MCQ, Fill-in-the-blank, Image question, Match-the-following (paired rows sharing a group id); manual single-question add (type selector, optional image, up to 4 options with correct-answer radio); quiz list with type chip, correct-answer checkmark, per-question delete.
  - *Assign* — "assign to all employees" (current + future) toggle, or pick individuals (checkbox list w/ avatars), optional due date.
  - *Progress* (lazy-loaded) — summary ring (completion %, started/not-started counts, lesson/quiz-question counts); per-employee row (avatar, name, status dot Completed/In progress/Not started, last-activity timestamp, overdue flag if due date passed, per-employee progress ring, expandable timeline of every lesson completion + quiz pass/fail + score, assigned-at/first-activity timestamps).
- **Employee: course list** (`renderEmployeeCourses`) — stat tiles (assigned/completed/avg progress %); same themed cards, employee-facing (progress ring, status label, due-date warning chip if overdue).
- **Employee: course player modal** (`openCoursePlayer`) — hero with progress ring + lesson/quiz counts; expandable lessons list with text/media content and per-lesson "Mark complete"; quiz section (once lessons render) rendering all 4 question types grouped back from flat DB rows, live "N/Total answered" progress bar, **Submit quiz** (pass threshold 70%) — pass/fail banner, per-question correct/wrong marking (reveals correct answer on wrong), auto-scroll to first wrong answer, retry allowed; on pass: confetti burst animation, toast, completion recorded with score + timestamp.

**Role-gating summary for this cluster**: install.js is pre-login/public; popup ads authoring, employee tutorial authoring/watch-tracking, AI Report, and course/lesson/quiz authoring+assignment+progress are admin-only; employee popup ad display, tutorial consumption+watch reporting, and course player are employee-only. No `client` role touches any of these three files.

---

## Misc pages (dashboard-widgets.js, ai-assistant.js, notifications.js, profile.js, stats.js)

### `src/pages/dashboard-widgets.js` — reusable chart/widget library

No fetch/DB calls — pure SVG string builders consumed by `stats.js` (and `admin.js`'s dashboard hero):

- **Gauge ring** (`gauge()`) — 270° open-arc SVG ring with centered percentage, configurable color/size/stroke.
- **KPI card** (`kpiCard()`) — gauge + label/value/context-line, used for Resolution Rate, Assignment Rate, Collection Rate, Attendance Rate.
- **Smooth area/line chart** (`areaChart()`) — gradient-filled cubic-bezier trend line with per-point dots and x-axis labels (6-month Service Requests Trend).
- **Vertical bar chart** (`vbars()`) — per-bar coloring, used for "Today's Pipeline" and "Alerts & Health".
- **Horizontal stacked bar chart** (`companyBars()`) — resolved vs active segments per company, top 8, sorted by volume.
- **Donut chart** (`donut()`) — ring + center total + color legend, used for category breakdown or status fallback.
- **Chart card wrapper** (`chartCard()`) — titled card shell with optional header-right content (e.g. legend).
- **Top Technicians leaderboard widget** (`techLeaderboard()`) — ranked list (#1 highlighted), inline progress bar by resolved-job count, top 6.
- **Full analytics hero composer** (`renderDashboardHero()`) — assembles all of the above into the admin dashboard's KPI row + chart grid + company/leaderboard row (only rendered if data exists).

### `src/pages/ai-assistant.js` — floating AI support chat widget

Mounted globally on admin & employee pages (an internal troubleshooting bot, not client-facing). Backend: `POST /api/ai/assistant` with the full conversation history, bearer-token auth — the app's own Node backend, presumably proxying to an LLM provider server-side.

- **Floating action button (FAB)** toggling an open/close chat panel (auto-hides FAB when open), Escape-to-close.
- **Chat panel**: header with avatar/title/"Online · powered by AI" status, scrollable message body, text input + send.
- **Greeting with 4 quick-suggestion chips**: "CCTV shows no signal", "View CCTV on mobile", "Weak WiFi at site", "Door lock not opening" — tapping auto-asks it.
- **Markdown-lite answer renderer**: paragraphs/bullet lists/`**bold**`, input HTML-escaped first (XSS-safe).
- **Solution video cards**: three states per matched topic — inline embedded iframe when a specific video URL is configured, a "search YouTube for this topic" link-out, or a "Video coming soon" placeholder.
- **In-memory conversation state** resent each turn for multi-turn context; not persisted across reloads.
- **Typing indicator** while awaiting a response; inline error bubble on failure.

### `src/pages/notifications.js` — notification history/list page

Distinct from the toast/voice `notify-center.js`. Backend: `GET /api/notifications`, `GET /api/settings/device-tracking` (feature flag), `POST /api/notifications/read-all`, `POST /api/notifications/:id/read` — all bearer-token auth.

- **Full notification history list** — emoji icon per subject type, title/body/relative timestamp.
- **Filter bar**: All / Unread / Payments, each with a live count badge.
- **"Mark all read" bulk action** with optimistic local update + toast confirmation.
- **Per-row tap-to-read** — marks read on click, then navigates.
- **Role-aware subject→page navigation map** (`NAV_MAP`) — tapping a notification jumps to the relevant screen; destinations differ by role (e.g. `new_service_request` → `inquiries` for admin vs `all-tickets` for employee; `leave_approved` → `my-leaves`, employee-only).
- **Fallback full-screen detail modal** (via `notify-center.js`) when a subject has no mapped page target.
- **Device-tracking-gated filtering** — hides `device_status`/`device_followup_reminder` notifications entirely when the device-tracking feature is disabled org-wide.
- **Unread indicator dot** per row plus a "Go to →" affordance when a nav target exists.

### `src/pages/profile.js` — account/profile page

Backend: direct Supabase (`auth.getUser`, `profiles` select/update, `auth.updateUser` for password).

- **View/edit account info**: Full Name, Email (read-only), Phone, Company.
- **Admin-gated editing**: non-admin users can only edit if `can_update_profile` is set on their profile row; otherwise fields are disabled with a "Profile editing is locked" banner explaining an admin must grant access.
- **Save profile** persists Full Name/Phone/Company with toast feedback.
- **Change password**: new-password input (min 8 chars client-side), show/hide eye-icon toggle, submits via `supabase.auth.updateUser`.
- No avatar/photo upload in this file.

### `src/pages/stats.js` — analytics/reporting dashboard

Two entry points: `renderAdminStats()` (org-wide) and `renderEmployeeStats()` (personal-only). Entirely Supabase-driven (no REST `/api`).

- **Admin backend**: parallel queries on `inquiries`, `attendance`, `complaints`, `profiles`, `eod_reports`, `inventory`.
- **Employee backend**: parallel queries scoped to the user — today's `attendance`, `tickets` joined with `inquiries`, today's `eod_reports`, assigned `inquiries`, full attendance/EOD history.
- **Custom user-defined stat cards** — both roles can add/edit/delete arbitrary "custom" stat tiles (label, value, note, icon from a 20-icon palette, color from a 7-color palette) via a modal; persisted per-role in `localStorage` only (not backend-synced).
- **Admin: Today's Scorecard** — Resolved-Today vs editable Daily Target (localStorage-persisted, progress bar, "🎯 Goal reached!" state), On-Time Rate Today (color-graded SLA compliance %), New Today (with in-progress/unassigned pill badges and a net-change message).
- **Admin: Quick Metrics grid** (8 live cards) — New Today, Pending Assignment, In Progress, Resolved Today, Unpaid Bills, Cash Pending (₹), Open Complaints, EOD Warnings.
- **Admin: full analytics hero** (via `dashboard-widgets.js`) — 4 KPI gauges, 6-month trend chart, category-breakdown donut (CCTV/Networking/Biometric/Gate Automation/Other, keyword-classified from free-text `service_item`), Today's Pipeline bars, Alerts & Health bars, Services-by-Company stacked bars (top 8), Top Technicians leaderboard (top 6).
- **Employee: Jobs Overview donut** — Active/Completed/Issues breakdown (assigned tickets + accepted inquiries combined), SVG donut + legend + 4 stat tiles.
- **Employee: Live Stats grid** (10 cards) — Clock Status (IN/OUT/—), Completed vs personal Daily Target (progress bar), On-Time Rate Today, Active Tasks, Accepted Requests, Pending Review, Total Completed (all-time), EOD Today (done/pending), Missed EODs (past days with attendance but no EOD), Days Worked (this month).
- **Employee: editable personal Daily Target** (separate localStorage key).
- **Employee: mini KPI row** — Clock Status, Active Tasks, Accepted Requests, Completed, each as a gauge/share-of-total card.
- **Shared SLA on-time calculation** via a `calculateSLA()` util (12-hour SLA window).
