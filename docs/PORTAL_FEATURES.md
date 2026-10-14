# NEST — Portal Feature Inventory & Mobile Parity

One file for: (1) everything the **Admin portal** does, (2) everything the **Employee portal** does,
(3) what the **mobile app** already covers, and (4) the build phases for what is missing.

Sources: `src/main.js` (`getNavItems`, `PAGE_LOADERS`), `src/pages/*.js` header notes, and
`docs/superpowers/specs/2026-08-21-web-app-feature-inventory.md` (older, deeper per-screen detail).
Status as of 2026-10-14.

Legend — ✅ done on mobile · ⚠️ partial · ❌ missing · 🅿 phase that builds it

---

## 1. Roles

| Role | Lands on | Notes |
|---|---|---|
| `admin` | Admin portal | Full access. |
| `employee` | Employee portal | Fixed or **gig** (`worker_type`). Per-user switches: `can_add_service`, `can_assign_tickets`, `installations_enabled`, `can_update_profile`, `allowed_tabs`. |
| `team_lead` | Team-lead dashboard (mobile) | Employee + oversight of own team. |
| client | no login | Public landing: request, track, complaint, installation booking, feedback link. |

---

## 2. Admin portal — features by menu group

### Dashboard
- Live ops hub: counts (tickets, open requests, attendance, low stock, complaints, EOD warnings, installations).
- Online Now, EOD warnings, Needs Attention queue, recent requests / installations / complaints / resolved.
- Services-by-Company report, auto-assignment toggle, **Register Request** on a customer's behalf.

### Work
| Page | Features |
|---|---|
| Service Requests | Master list (Active / Resolved / Issue Not Resolved / Reopened / Awaiting Payment / Paid / All), company + status filter, detail (customer, SLA, device, bill, photos, feedback), assign/reassign, **release to public pool**, delete, CSV. |
| Queries & Follow-ups | Customer queries needing a follow-up. |
| Installations | Status tabs, search, detail, assign technician, status change, delete, **materials used + bill** (`installation-materials`). |
| Job Costing | Approve technician materials, add labour/travel, margin per job, prepare invoice. |
| Device Tracking | Every device taken for repair; follow-up log; mark returned; **closed-without-return** audit flag. |

### Customers
| Page | Features |
|---|---|
| Customers & Suppliers (`parties`) | Address book: GST, credit terms, addresses, ledger balance, whole-record PDF. |
| Sites & Devices (`devices`) | Installed equipment per customer, warranty, replaced-by history. |
| AMC Contracts | Term invoicing, free-visit count, renewal chasing. |
| Contacts | Customer directory from requests, tabs (Today/Week/Month/Unique), call / WhatsApp / copy. |
| Complaints | Open/resolved, respond (SMS to customer), status. |

### Sales / Purchases & Stock / Accounts
| Page | Features |
|---|---|
| Invoices & Quotations (`sales`) | Quotation → invoice → credit note → receipt, server-priced, in-place correction with reason, cancel-not-delete. |
| Past Records (Vyapar) | Read-only imported history. |
| Purchases | Order → receive → bill → return, partial receipt safe. |
| Stock | On shelf / in vans / reserved, transfers, take-back, device history. |
| Items (`inventory`) | Items with purchase/selling rate, min-stock alerts, bulk activate/hide/delete. |
| Ledger & Journals | Journals, trial balance, chart of accounts, opening balances, period locks, audit trail. |
| Financial Reports | P&L, balance sheet, GST, receivables, health check. |
| Data Migration | Dry-run → confirm → before/after checks. |

### Operations
| Page | Features |
|---|---|
| Attendance | Logs with selfie + map, restrictions (missed EOD) + resolve, reset Face ID, CSV. |
| Job Cards | Pending entry, awaiting 3-day verification call, leaderboard, monthly bonus award. |
| Service Log | Day register (date/tech/customer/service/amount/payment). |
| Bonus Reviews | Verify employee review-bonus claims. |
| Auto Assignment | Round-robin toggle, live queue, recent assignments audit. |
| Assignment Tracker | Who has not seen the job they were given (sent → delivered → read → accepted). |
| Live Locations | Map of clocked-in employees. |
| Calendar | Dated work (installations / visits). |

### Reports
Stats · Response Time (two-hour SLA misses) · Employee Performance (leaderboard) · Finance (KPIs, trend, aging, advisor, AI report) ·
AI Reports · Payments (mark paid) · Bills (view/share PDF) · Cash Collections (record submission) · Collection Reports ·
Salary (attendance based) · Gig Payouts (mark paid) · Leave Requests (approve/reject) · EOD Summaries.

### Management
Employees (`employee-panel`: per-employee overview) · Users (create/edit, per-tab access, exemptions, worker type) ·
Device Types & Companies · Pricing (price-list CRUD + import) · Business & Tax Setup · Employee Tutorials ·
Training Courses (lessons, quizzes, assign, progress) · Settings (keys, geofence, clock-in rules, reopen policy, gig timeout, restrictions).

### Marketing
Landing Ads · Popup Ads · WhatsApp Campaigns · Notices (priority, expiry) · Coupons · Discount Details.

### Cross-cutting
Notifications list + push + voice alert · AI Assistant chat · global search · profile / password.

---

## 3. Employee portal — features

| Page | Features |
|---|---|
| Dashboard | Clock in/out (GPS, selfie + face match for fixed), EOD gate, notice board, pending assignments (accept/decline), today's route, reopened tickets, public-jobs widget, devices in service. |
| My Tasks | Tickets + accepted requests; filters; call / WhatsApp / maps; SLA timer; **Manage** modal: Status · Device · Device Service · **Bill** (items, coupon, discount, transport, GST, PDF, Razorpay link/QR, cash). |
| Installations | Assigned installs, start → complete, call / directions, materials. |
| Public Jobs | Gig pool — claim a job (race-safe). Gig only. |
| Assign Requests | `can_assign_tickets` only: assign open requests to technicians. |
| Device Follow-up | Devices in service, status + notes, history. |
| My Stats | Live stats, daily target, jobs donut. |
| Attendance / Leaves / EOD | Records, leave request, end-of-day report. |
| My Cash / Collections / Salary | Cash pending vs submitted, period collections + gig earnings, salary estimate. |
| Estimator | Client quote builder (no ticket), WhatsApp share. |
| Service Pricing | `can_add_service` only: price-list management. |
| Leaderboard / Bonus Reviews | Monthly + all-time rank; claim review bonus. |
| Tutorials / Training | Watch-tracked tutorials; course player + quiz. |
| Calendar | Own dated work. |
| Self-registered request | Register a walk-in customer and auto-accept. |
| Job materials | Record van stock used / returned on a job. |
| Notifications / Profile | List + deep link; edit profile (if allowed), change password. |

---

## 4. Mobile app today

Stack: Expo SDK 57, React Native 0.86, react-navigation native-stack, reanimated, NEST dark-glass design system.
Checked by `npm test` in `mobile/` (70 render + interaction tests) and `npx tsc --noEmit`.

### Employee navigator — full parity

| Web feature | Mobile | Screen |
|---|---|---|
| Dashboard (clock in/out with selfie + location, notices, pending assignments, today's route, reopened, gig widget) | ✅ | `EmployeeDashboardScreen` |
| My Tasks + Manage (status / device / device service / bill / payment) | ✅ | `ManageTasksScreen`, `TaskDetailScreen`, `DeviceDetailScreen` |
| Installations | ✅ | `InstallationsScreen` |
| Public Jobs (gig) | ✅ | `GigPoolScreen` |
| Assign Requests (gated) | ✅ | `AdminServiceRequestsScreen` |
| Device Follow-up | ✅ | `DeviceFollowUpScreen` |
| My Stats | ✅ | `MyStatsScreen` |
| Attendance / Leaves / EOD | ✅ | `AttendanceScreen`, `LeaveFormScreen`, `EodReportScreen` |
| Cash / Collections / Salary | ✅ | `EarningsScreen` |
| Estimator | ✅ | `EstimatorScreen` |
| Service Pricing | ✅ | `ServicePricingScreen` |
| Leaderboard / Bonus Reviews | ✅ | `LeaderboardScreen`, `BonusReviewsScreen` |
| Tutorials / Training | ✅ | `TutorialsScreen`, `TrainingCoursesScreen`, `CoursePlayerScreen` |
| Notifications / Profile / Settings | ✅ | `NotificationsScreen`, `ProfileScreen`, `SettingsScreen` |
| Profile edit (name / phone / company, gated by admin) + change password | ✅ new | `AccountScreen` (Profile → Account details & password) |
| Calendar | ✅ new | `CalendarScreen` (Job Tools → Calendar) |
| Self-registered request | ✅ new | `RegisterRequestScreen` (Job Tools → Register Customer, `can_add_service` only) |
| Job materials (van stock) | ✅ new | `JobMaterialsScreen` (Job Tools → Materials Used) |
| Employee popup ad | ✅ new | `EmployeePopupAd` on the dashboard, once per session |
| AI Assistant (fix steps + solution videos) | ✅ new | `AiAssistantScreen` (Job Tools → AI Assistant) |
| Quiz questions: fill-in-the-blank, image, match-the-following | ✅ new | `QuizModal` decodes the `_qz` envelope the web editor writes |

### Admin navigator — every web menu page is a real route

`AdminNavigator` (stack) with a Dashboard tab and a grouped Menu tab. The menu is `navigation/adminMenu.ts`; a page is live
when its route is in `ADMIN_SCREENS`. Every web menu page is live, plus the ones that used to be web-only.

| Group | Pages |
|---|---|
| Work | Service Requests · Queries & Follow-ups · Installations (book, edit, delete, assign, bill) · Job Costing (approve materials, margins, per-job costs and invoice, technician vans) · Device Tracking |
| Customers | Customers & Suppliers · Sites & Devices · AMC Contracts · Contacts · Complaints (respond) |
| Sales | Invoices & Quotations (+ owed to us) · Past Records |
| Purchases & Stock | Purchases (+ we owe) · Stock · Items |
| Accounts | Ledger & Journals (entry, reverse, accounts, opening balances, period locks, audit) · Financial Reports (summary, reminders, P&L, balance sheet, ageing, account ledger, party statement, GST, stock value, job margins, health check) · Data Migration (backup email, Vyapar import, older tickets, shelf stock, service register, history, evening summary) |
| Operations | Attendance · Job Cards (entry, verification call, award) · Service Log · Bonus Reviews (approve / reject) · Assignment Queue · Live Locations · Calendar |
| Reports | Stats · Response Time · Employee Performance · Finance · AI Reports · Payments (mark paid) · Bills · Cash Collections (record submission) · Collection Reports (by employee, period, gig pool, bill detail) · Salary · Gig Payouts (mark paid) · Leave Requests · EOD Summaries |
| Management | Employees · Users (create, edit, role, access switches) · Device Types · Service Pricing · Business & Tax Setup (legal details, numbering, tax rates, service income, WhatsApp templates) · Employee Tutorials (upload, edit, completion, live watch) · Training Courses (create, lessons, quiz, assign, progress) · My Profile · Settings (clock-in rules, reopen policy, pool timeout, popup) |
| Marketing | Notices · Coupons · Discount Details · Landing & Popup Ads (upload, edit) · WhatsApp Campaigns (compose, test, schedule, publish, monthly automatic, opt-outs) |
| Also | AI Assistant · Notifications · Calendar · Auto Assignment · Assignment Tracker |

Still web-only, honestly: spreadsheet-driven authoring (quiz questions imported from an Excel/CSV file, match-the-following
questions), the direct ZIP download of the full backup (the phone gets the emailed copy instead) and CSV export buttons.
Everything else a web admin or employee can do is on the phone.

## 5. Build phases

| Phase | Scope | State |
|---|---|---|
| 0 — Foundations | This file; every `KeyboardAvoidingView` removed; `keyboardShouldPersistTaps` on form scroll views | ✅ done |
| A — Admin structure | `AdminNavigator`, grouped menu, shared building blocks (`components/admin/*`), dashboard | ✅ done |
| B — Operations | Attendance, EOD, Job Cards, Device Tracking, Response Time, Service Log, Bonus Reviews | ✅ done |
| C — Money | Payments, Bills, Cash, Salary, Gig Payouts, Coupons, Discount Details | ✅ done |
| D — People & customers | Users, Complaints, Queries, Parties, Sites & Devices, AMC | ✅ done |
| E — Books (read-only) | Sales, Purchases, Stock, Items, Ledger, Financial Reports, Past Records, Job Costing | ✅ done |
| F — Marketing & config | Notices, Ads, Campaigns, Settings, Training, Performance | ✅ done |
| H — Depth pass | Editing flows: ledger entry/reverse, parties, items, stock, sales, purchases, AMC, users, service log, installations, ads upload, tutorials, course authoring, campaigns, job costing, business setup, migration; all report tabs | ✅ done |
| G — Employee gaps | Calendar, Register Customer, Materials Used, popup ad | ✅ done |
| Next | A visual pass on a real device; spreadsheet quiz import if wanted | open |

## 6. UI rules for every mobile screen

- Keep the NEST dark-glass system (`MeshBackground`, `GlassCard` / `Panel`, `GlowButton`, `Icon`, tokens). No new visual language.
- **No `KeyboardAvoidingView`.** Forms live in a `ScrollView` with `keyboardShouldPersistTaps="handled"`; Android resizes the
  window itself (`windowSoftInputMode=adjustResize`, `softwareKeyboardLayoutMode: resize`). A test fails if it comes back.
- Portal list screens use `components/admin/AdminScreen` (header, pinned search / filter, pull-to-refresh, loading / error / empty).
- Every action disables itself while running and reports the result; destructive and money actions ask first.
- Back is always `onBack` / `navigation.goBack()`; no screen swaps itself in with local state.
- Touch targets ≥ 44 px; text from `typography`; colours from `theme` / `semantic`, not hex literals in new code.

## 7. How to check

```bash
cd mobile
npx tsc --noEmit   # types, including the tests
npm test           # 70 tests: every admin screen against server-shaped data, forms, employee flows
```
