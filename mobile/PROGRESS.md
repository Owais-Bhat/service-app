# Mobile App — Progress

Status of the Expo/React Native app (`mobile/`) vs. the web app, tracked on branch `mobile-app`. Last updated 2026-08-22.

## Manage Tasks (core parity with web)

- Full task list: status filters, job cards, accept/decline pending assignments
- Pending assignments also surfaced on the dashboard, not just Manage Tasks
- Pending assignments popup: swipeable horizontal carousel (dot indicators, X/N counter), each card independently scrollable; swipe browses cards, separate Accept/Decline buttons act on the visible card
- Job cards: customer avatar, colored status accent bar, live-status pulse dot on in-progress jobs, phone/WhatsApp/maps quick actions
- Visual pass: spring press-scale ("3D") feedback on filter pills, cards, and action buttons throughout

## Status updates

- Status options: In Progress, Reschedule, Issue Not Resolved, Case Closed, FOC, Resolved
- **Reschedule** — pure-JS calendar + time picker (`CalendarPickerModal`), no native dependency (avoids requiring a custom dev build)
- **FOC** — bill number field
- **Device Service** — separate action from status/bill, matching web: device type/serial/description + photo upload, "Mark Device Taken"/"Mark Returned" with photo on both

## Resolved / Billing

- Company name, itemized services (searchable category-grouped picker), Extra Cost (requires a reason, same as Discount)
- Redeem Coupon (validated + redeemed server-side against `coupons` table — the same system web's real Bill tab uses)
- Employee Discount (requires a reason)
- Payment Method: Cash or Online (gig workers forced online-only)
- Travel cost: auto-calculated from technician ↔ customer coordinates (haversine + road-factor), matching web's "Auto km"
- Cash flow: single-step — saving marks the amount collected in cash automatically, no separate confirmation checkbox
- Online flow: real Razorpay payment link (same endpoint as web) + QR code + "Share via WhatsApp", auto-polls and auto-finalizes the ticket once paid
- Receipt breakdown shown live in the modal (Services, Extra charges, Platform fee, Transport, GST, Discount, Total)
- **Generate Bill as PDF** — server-rendered tax invoice (same renderer as web), **Send via WhatsApp** with the same itemized caption web sends, once the PDF exists

## Live location tracking

- New `employee_live_locations` table + `/api/live-location/ping` (employee, every ~45s while clocked in, foreground-only) and `/api/live-location` (admin)
- Admin can view all technicians (fixed + gig) live on a map — **both** mobile (`LiveLocationsScreen`, `react-native-maps`) and web (`live-locations-admin.js`, Leaflet)
- Deliberately foreground-only (no background location) to stay inside Expo Go — background mode needs a custom dev build

## Known bugs fixed this session

- Server's invoice PDF generator referenced an undefined `BUSINESS` object → every `/api/bills/generate` call crashed. Fixed by defining it (matches web's copy).
- Extra Cost wasn't shown as its own line in the in-app receipt breakdown (only folded silently into the total). Added the missing row.
- Invoice PDF footer was pinned inside pdfkit's own bottom margin, so it always spilled onto a second page regardless of content length. Fixed so it only spills when content genuinely doesn't fit.

## Infra

- `mobile-app` branch merged into `main` and pushed (production deploys from `main` via Hostinger, auto-builds on push)
- Mobile's `.env` points at production (`services.networkingexperts.in`), not a local server — bugs must be chased on the deployed server, not local state
