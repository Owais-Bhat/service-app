# NEST — Web features vs Mobile app (audit, 2026-10-14)

One text file: **every feature of the web Admin portal and Employee portal**, and for each one whether the
mobile app (`mobile/`) has it.

How this was checked
1. Every page in `src/pages/*.js` was read (headers, functions, buttons, modals, API calls).
2. **Server routes:** all 298 `/api/...` routes in `server/` were searched for in the web source and in
   `mobile/src`. Routes the web calls and mobile never calls are listed in section 5.
3. **Table writes:** every `supabase.from(t).insert/update/delete` on the web was compared with
   `dataPost/dataPatch/dataDelete` on mobile.
4. **Labels:** every button / card / modal title on the web was searched for in the mobile source.
5. Mobile status below is what exists in the code and is covered by `npm test` (75 tests) + `tsc`.
   Nothing was run on a real phone — see section 6.

Legend: ✅ on mobile · ⚠️ partly · ❌ missing · ➖ does not apply on a phone

---

## 1. ADMIN PORTAL

### 1.1 Dashboard
| Feature | Mobile |
|---|---|
| Counts: tickets, open requests, attendance, low stock, complaints, EOD warnings, installations | ✅ AdminHome |
| Online Now list, Needs-attention queue, recent requests / installations / complaints | ✅ AdminHome |
| Register a request on a customer's behalf | ✅ AdminRegisterRequest |
| Services-by-company report, Top technicians widget | ✅ Finance page (by company, by technician) + Request Reports |
| Auto-assignment on/off from the dashboard | ✅ AutoAssignment |

### 1.2 Work
| Feature | Mobile |
|---|---|
| **Service Requests** list, status tabs, company filter, detail, assign / reassign | ✅ |
| Transfer to another technician, release to public pool, delete | ✅ |
| Bill detail + PDF, SLA, device, photos, feedback in detail | ✅ |
| Per-technician grouping, Technician Report, "Most requested services", month-calendar filter, CSV | ✅ Request Reports (technician report, top services, export) |
| **Queries & Follow-ups** add / list / delete | ✅ |
| **Installations** list, assign, status, bill, mark paid / unpaid | ✅ |
| Installation book / edit / delete | ✅ |
| Installation "Technician Report", "Most booked types", logs tab, CSV | ✅ Request Reports → Installations |
| Installation materials used + customer bill (admin side) | ✅ bill sheet + Record Materials |
| **Job Costing** approve / reject materials, margins | ✅ |
| Job Costing: per-job costs, remove cost, prepare invoice, technician vans | ✅ |
| Job Costing: admin "Record materials" on a job | ✅ Record Materials (Work menu) |
| **Device Tracking** list, follow-up updates, mark returned, closed-without-return flag | ✅ |

### 1.3 Customers
| Feature | Mobile |
|---|---|
| Customers & Suppliers: create / edit, GSTIN lookup, merge duplicates, statement | ✅ |
| Whole-record PDF of a party | ✅ |
| Sites & Devices: add, edit, history, replace, put back, warranty | ✅ |
| AMC: create, invoice term, renew, cancel, visits, WhatsApp renewal | ✅ |
| Contacts directory (call / WhatsApp / copy) | ✅ |
| Contacts tabs Today / Week / Month / Unique | ✅ |
| Complaints: list, respond (SMS), status | ✅ |
| Complaints: "All complaints" export | ✅ Export all |
| Customer equipment panel on a request (phone → what is installed, warranty, AMC) | ✅ CustomerEquipment on request detail + task modal |
| "Count this as an AMC visit" when servicing an AMC customer | ✅ |
| Customers (role client) list + CSV export | ➖ client login is disabled on the server |

### 1.4 Sales
| Feature | Mobile |
|---|---|
| Quotation → invoice → credit / debit note → receipt; issue / amend / revise / cancel | ✅ |
| Send on WhatsApp, PDF | ✅ (PDF via share-link; needs server deploy) |
| Record a receipt | ✅ |
| **Allocate** an on-account payment to invoices after the fact | ✅ Receipt detail → Apply |
| Past Records (Vyapar) list | ✅ |
| Past Record **detail** (lines, linked records) | ✅ Record detail with lines and linked records |

### 1.5 Purchases & Stock
| Feature | Mobile |
|---|---|
| Purchases: order, receive, bill, return, payables | ✅ |
| Pay a supplier (payment out) | ✅ (check on device) |
| Stock: on shelf / vans, moves, adjust, count, locations, serials | ✅ |
| Stock **availability** per item per location | ✅ Availability button on each item |
| Stock / items **Excel import** (+ template download) | ✅ CSV import (save the sheet as CSV) with the same checks |
| Items: create / edit, rates, min stock, bulk activate / hide / delete, ledger | ✅ |

### 1.6 Accounts
| Feature | Mobile |
|---|---|
| Ledger: journals, manual entry, reverse, accounts, opening balances, period locks, audit | ✅ |
| Financial Reports: all 11 tabs | ✅ |
| Reports CSV export | ✅ Export CSV on every report tab |
| Data Migration: backup email, Vyapar import, tickets, stock, register, history, evening summary | ✅ |
| Backup ZIP direct download | ❌ (email instead) |

### 1.7 Operations
| Feature | Mobile |
|---|---|
| Attendance logs with selfie + map, restrictions, resolve, reset face | ✅ |
| Attendance: **Employee Attendance** per-employee KPIs (days present / late / hours) | ✅ Attendance Report (per-employee KPIs) |
| Attendance: **Reports** tab (date range report, absent list, export) | ✅ Attendance Report + export |
| Attendance: device-location panel | ✅ location per log |
| Job Cards: entry, verification call, award bonus, leaderboard | ✅ |
| Service Log: add / edit / delete, link to ticket, summary | ✅ |
| Service Log: **Unlink** from ticket, CSV | ✅ Unlink ticket + Export CSV |
| Bonus Reviews approve / reject | ✅ |
| Auto Assignment queue + recent assignments | ✅ |
| Assignment Tracker + **WhatsApp again** | ✅ |
| Assignment Tracker "Share to group" | ✅ was already there |
| Live Locations map | ✅ |
| Live Locations **Day Trail** (route history for a day, playback) | ✅ Day trail with playback |
| Calendar (installations by date) | ✅ view |
| Calendar **+ Add Installation** | ✅ + on Installations (same editor) |

### 1.8 Reports
| Feature | Mobile |
|---|---|
| Stats (live ops overview) | ✅ |
| Response Time list | ✅ |
| Response Time dashboard **alerts** | ✅ "Overdue to assign" on the dashboard |
| Employee Performance / leaderboard | ✅ |
| **Client Feedback** page: all reviews, Top-3, reviews by company, rankings, export | ✅ Client Feedback (rankings, by company, all reviews, export) |
| **Finance** (Business Health, revenue trend 12 months, by category, receivables aging, technician collected-vs-billed, growth advisor, PDF/CSV) | ✅ Finance (business health, trend, aging, advisor, export) |
| **AI Business Report** (narration) | ✅ Generate report / ask a question |
| AI Report (employee progress + notes) | ✅ |
| Payments (mark paid), Bills (view / share), Cash Collections (record) | ✅ |
| Collection Reports | ✅ |
| Salary, Gig Payouts, Leave Requests, EOD Summaries | ✅ |

### 1.9 Management
| Feature | Mobile |
|---|---|
| Employees panel (per-employee overview) | ✅ |
| Users: create, edit, role, worker type, access switches, exemptions, delete | ✅ |
| User detail by id (`GET /profiles/:id`) | ✅ |
| Device Types & Companies CRUD | ✅ |
| **Service Pricing admin**: add / edit / delete price, import from Excel/CSV, remove duplicates, template | ✅ add / edit / delete / CSV import / remove duplicates / bulk delete |
| Business & Tax Setup | ✅ |
| Employee Tutorials | ✅ |
| Training Courses: create, lessons, quiz, assign, progress | ✅ |
| Training: quiz **Excel upload**, sample template, match-the-following authoring | ✅ CSV import (all four question types) + sample |
| Settings: registration keys, clock-in requirements, auto clock-out, reopen policy, pool timeout, popup, device tracking | ✅ |
| Settings: **office clock-in location** (set geofence centre / radius) | ✅ capture my location + radius |
| Settings: **Who can book a service** (booking rules) | ✅ block on dues, ignore-below, service radius |
| Settings: required resolution for landing ads | ➖ web-only image guide, not a setting |

### 1.10 Marketing
| Feature | Mobile |
|---|---|
| Landing ads + popup ads: upload, edit, hide, delete | ✅ |
| Landing ad drag-order | ➖ position field instead |
| WhatsApp Campaigns: compose, test, schedule, publish, monthly auto, opt-outs | ✅ |
| Notices (priority, expiry) | ✅ |
| Coupons, Discount Details | ✅ |

### 1.11 Cross-cutting
| Feature | Mobile |
|---|---|
| Notifications list + read / read-all | ✅ |
| Notification **voice** announcement | ➖ native push sound instead |
| AI Assistant | ✅ |
| Profile + password | ✅ |
| Live refresh (`/events/poll`) | ➖ push + pull-to-refresh |
| Web-push subscribe | ➖ native push |

---

## 2. EMPLOYEE PORTAL

| Feature | Mobile |
|---|---|
| Dashboard: clock in / out with selfie + location, EOD gate, notices, pending assignments, route, reopened, devices in service | ✅ |
| Clock-in face match (web uses face-api) | ⚠️ server uses the stored reference selfie for the phone |
| Popup ad | ✅ |
| My Tasks: filters, call / WhatsApp / maps, SLA timer | ✅ |
| Manage: status (in progress, reschedule, issue not resolved, closed, FOC, resolved) | ✅ |
| Device Service tab: taken / returned with photos | ✅ |
| **Per-ticket "device service" switch** (`/device-tracking/toggle`) | ✅ switch in the Device Service tab |
| Bill: items search + price, extra cost, coupon, discount, transport (auto km), GST, platform fee | ✅ |
| "Capture My Location" at the customer site (precise GPS for km) | ✅ km from where you stand |
| Bill PDF, Send on WhatsApp, Razorpay link + QR, cash | ✅ |
| Share **Feedback Link** via WhatsApp to the customer | ➖ the box is never shown on the web either; the link goes out after payment |
| Assignment **"seen"** ping when the job is opened | ✅ sent when a job or installation is opened |
| Upload bill PDF (`/bills/upload`) | ➖ server renders the PDF |
| Customer equipment / AMC visit counter on a ticket | ✅ |
| Register Service Request (walk-in) | ✅ |
| Installations: accept, start, update, complete, bill, call / directions | ✅ |
| Public jobs (gig pool) claim | ✅ |
| Assign requests (can_assign_tickets) | ✅ |
| Device Follow-up | ✅ |
| My Stats | ✅ |
| Attendance records, Leave request, EOD report | ✅ |
| My Cash, Collections, Salary | ✅ |
| Estimator + WhatsApp share | ✅ |
| Service Pricing view | ✅ |
| **Service Pricing manage** (`can_add_service`: add / edit / delete / import) | ✅ |
| Leaderboard, Bonus Reviews (claim up to 30 pts) | ✅ |
| Tutorials (watch tracked), Training courses + quiz (all question types) | ✅ |
| Calendar | ✅ |
| Job materials used / returned | ✅ |
| Export Tasks CSV | ✅ Export tasks |
| Notifications, Profile, Account + password, AI Assistant | ✅ |
| Team lead dashboard | ✅ |

---

## 3. CLIENT / PUBLIC (landing page, no login)

| Feature | Mobile |
|---|---|
| Submit service request, installation booking, complaint | ✅ LandingScreen / ClientSubmitTicket |
| Track a request by ticket | ✅ ClientTrackTicket |
| Rate / feedback via link (`/feedback/resolve`, `/feedback/submit`), recommend | ➖ the link opens the web feedback page in the browser |
| Booking-rules precheck (`/booking/precheck`) before a request | ✅ checked before the request is sent |
| Client portal (login, my tickets, support tickets, chat history) | ➖ server rejects client logins |

---

## 4. Status after the gap pass

Everything listed as missing in the first audit was built, except what is marked ➖ above because the web does
not really have it either (client logins are disabled on the server; the feedback link is sent after payment).

Genuinely still different from the web:
- Excel files (.xlsx): imports take CSV on the phone — save the sheet as CSV first.
- The full backup ZIP is emailed (`Data Migration → Backup`); the direct download stays on the web.
- Drag-to-reorder of landing ads (a Position field is used instead).

## 6. What this audit could not prove

- No emulator / device was available. Layout, scrolling, keyboard behaviour and the
  camera / picker flows are **unverified on a phone**.
- New endpoints (share-link, Vyapar upload, campaigns, migration, AI) were tested against fixtures, not production.
- Labels matched by text only show a feature exists, not that every edge case behaves the same.
