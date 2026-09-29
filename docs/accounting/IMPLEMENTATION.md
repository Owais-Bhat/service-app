# NEST Accounting — implementation checklist

The running record of the billing / inventory / accounting build. Updated at the
end of every stage. Anything marked ⏳ is deliberately not built yet; anything
marked 🔒 is built but stays locked until someone supplies a fact or a
credential that software must not invent.

**Issuing business:** Networking Experts (NEST is the portal, not the legal
issuer).
**Database:** MySQL, self-migrating on boot (`ensureAccountingSchema`).
**Money:** integer paise in JavaScript, DECIMAL/BIGINT in MySQL. No float ever
touches an amount.

---

## Stage 1 — Foundation ✅ (built, tested locally, **not deployed**)

### Delivered

| Piece | Where | Notes |
|---|---|---|
| Exact money arithmetic | `server/modules/money.cjs` | paise integers, half-up rounding, largest-remainder allocation, tax-inclusive split, round-off as a posting |
| GST mechanics | `server/modules/gst.cjs` | GSTIN structure + check digit, state codes, intra/inter-state decision, CGST/SGST/UTGST/IGST split |
| Schema + seeds | `server/modules/ledger/schema.cjs` | businesses, parties, party_addresses, tax_rates, hsn_codes, accounts, journals, journal_lines, number_series, period_locks, audit_log, user_permissions |
| Posting engine | `server/modules/ledger/posting.cjs` | balanced-or-refused, idempotency keys, atomic document numbers, reversal-not-edit, period locks, trial balance, party balance |
| Capabilities | `server/modules/permissions.cjs` | 26 capabilities, role defaults for admin/accountant/office/storekeeper/team_lead/employee, per-user overrides, server-enforced |
| Audit trail | `server/modules/audit.cjs` | actor, action, entity, reason, before/after diff |
| API | `server/modules/accounting-routes.cjs` | business, parties (+ duplicates + merge), accounts, tax rates, series, journals, trial balance, opening balances, period locks, audit |
| Screens | `src/pages/parties.js`, `src/pages/ledger.js`, `src/pages/business-settings.js` | Customers & Suppliers; Accounts (6 tabs); Business & Tax Setup (3 tabs) |
| Navigation | `src/main.js` | Customers → Customers & Suppliers · new Accounts group · Management → Business & Tax Setup |

### Existing tables touched (additive only, nothing backfilled)

- `inquiries.party_id`, `installations.party_id` — nullable links, unset until a
  reviewed migration in Stage 6.
- `inventory_items` — `item_type, description, brand, model, hsn_sac,
  tax_rate_id, purchase_rate_paise, selling_rate_paise, base_unit,
  secondary_unit, conversion_factor, track_serial, warranty_months,
  reorder_level, business_id`. The existing DECIMAL rate columns are untouched
  and still drive the current screens.

### Tests

`node --test tests/money.test.mjs tests/gst.test.mjs tests/accounting-stage1.test.mjs`

- money: 9 tests — parsing from DECIMAL strings, float-drift proof, INR
  formatting, bps tax, inclusive split, allocation, round-off.
- gst: 7 tests — check digit, typo rejection, intra/inter-state, union
  territory, exact tax halves.
- stage 1 (needs the local API + test DB, skips otherwise): 13 tests —
  unbalanced refused, idempotency (including 4 simultaneous retries), 12
  concurrent document numbers all distinct, reversal linkage and net-zero,
  period lock blocks and reopens, trial balance balanced + scope stated, party
  validation, duplicate detection and merge carrying the ledger, opening
  balances posted once, permissions enforced server-side, system accounts
  protected, audit trail populated.

All 29 pass locally. `npm test` remains green (the DB suite skips without a
database).

### Decisions worth remembering

1. **Money is paise.** mysql2 returns DECIMAL as a string; `toPaise()` is the
   only door in, `toDecimalString()` the only door out.
2. **The ledger is the truth.** Party balances and reports are computed from
   posted journal lines, never from a stored balance column.
3. **Nothing is edited after posting.** Reversal entries, linked both ways.
4. **Idempotency keys** on journals: a retried or double-clicked request
   re-finds its own journal. The duplicate-key recovery uses a locking read —
   a plain read inside the same transaction cannot see the winner's row.
5. **Legal details are never invented.** The business row is created with the
   name Networking Experts and `setup_complete = 0`; tax features check it.
6. **Tax treatments are distinct.** gst / exempt / nil_rated / zero_rated /
   non_gst are five values, not one switch. Rates are effective-dated; a change
   closes the old row and opens a new one.

---

## Stage 2 — Sell ✅ (built, tested locally, **not deployed**)

The whole selling path works end to end: quotation → acceptance → invoice →
receipt → ledger → PDF.

### Delivered

| Piece | Where | Notes |
|---|---|---|
| Pricing engine | `server/modules/tax-engine.cjs` | one pure function prices every document — line and document discounts, tax-inclusive or exclusive, charges, fractional quantities, rate-wise summary, rounding reported separately |
| Documents | `server/modules/sales/schema.cjs` | `sales_documents`, `sales_document_lines`, `payments`, `payment_allocations` |
| Document service | `server/modules/sales/service.cjs` | draft → issue → cancel, conversion, snapshots, payments, allocations, ledger posting |
| API | `server/modules/sales/routes.cjs` | documents, live pricing preview, issue/cancel/convert/acceptance, payments, allocation, receivables ageing, PDF |
| PDF | `server/modules/sales/pdf.cjs` | A4, repeating table header, multipage, letterhead, bank block, signature, page numbers |
| Screen | `src/pages/sales.js` | Invoices · Quotations · Credit Notes · Receipts · Outstanding, with an editor priced live by the server |
| Navigation | `src/main.js` | new **Sales** group → Invoices & Quotations |

### Rules the code enforces

1. **A quotation is paper, an invoice is an event.** Estimates and proformas
   take a number and print, but post nothing to the ledger. Only invoices and
   credit notes post.
2. **Issued means frozen.** Issuing snapshots the customer (name, GSTIN,
   address, treatment) and each item (name, HSN, unit) onto the document.
   Editing the customer or repricing the product later changes nothing on it.
   An issued document has no edit path — only cancel, which reverses its
   journal and records the reason.
3. **Payment status is derived** from posted allocations. There is no "mark as
   paid" field anywhere in the system.
4. **An estimate converts once.** A second conversion returns the invoice that
   already exists.
5. **Advances stay visible.** Money received and not allocated credits Customer
   Advances (2200), not income and not the receivable. Applying it later moves
   it to the receivable without pretending new money arrived.
6. **Tax follows the states.** Same state → CGST + SGST (UTGST in a union
   territory); different state → IGST. Exempt, nil-rated, zero-rated and
   non-GST carry no tax whatever rate is passed with them.
7. **Nothing issues into a locked period**, and a refused issue leaves the
   document a draft rather than half-issued.
8. **A tax document cannot be issued** until the business details are confirmed
   (and, for a regular registration, the GSTIN is on file).

### Tests

`node --test tests/tax-engine.test.mjs tests/sales-stage2.test.mjs`

- tax engine: 15 pure tests — intra/inter-state, inclusive prices reconciling to
  the paisa, fractional quantities, line and document discounts, rate-wise
  summary, non-GST treatments, charges, rounding, union territory, and the
  inputs it refuses.
- Stage 2: 18 acceptance tests against the local API and database — estimate
  posts nothing, converts exactly once, invoice journal balanced and account by
  account, issued document not editable, part payment then advance then paid,
  over-payment and over-allocation refused, credit note reversing sale and tax,
  IGST on an inter-state sale, cancellation reversing to nil, receivables
  buckets adding up to the total, ledger-versus-invoices reconciliation, a
  one-line invoice printing on one page and a 60-line one running to several,
  permissions, and the period lock.

Full suite: **107 of 108 pass**. The one failure, `feedback-routing`, predates
this work (verified by stashing the changes and re-running on HEAD) and is
tracked separately.

### Two bugs this stage found and fixed

- **Paise counted twice.** A field named `*_paise` was being run through the
  rupee parser, multiplying every such amount by a hundred — a ₹5,000 advance
  arrived as ₹5,00,000. One helper now decides which spelling is which.
- **Every invoice printed two pages.** pdfkit starts a new page when text is
  written below the bottom margin, which is exactly where a footer goes.

---

## Stage 3 - Buy & stock (built, tested locally, **not deployed**)

Order -> receive -> be billed -> pay, with the goods tracked from the
supplier's van to the technician's van to the customer's wall.

### Delivered

| Piece | Where | Notes |
|---|---|---|
| Stock engine | `server/modules/stock/engine.cjs` | one door in and out of stock, moving-average valuation, unit conversion, negative-stock guard, reservations, serials, location balances, valuation-vs-ledger check |
| Schema | `server/modules/stock/schema.cjs` | `stock_locations`, `item_serials`, `stock_reservations`, `stock_counts` (+lines), `purchase_documents` (+lines), `purchase_allocations`; `inventory_movements` and `inventory_items` grew the columns this needs |
| Purchase flow | `server/modules/stock/purchases.cjs` | PO -> GRN (partial) -> supplier bill -> return, landed cost, supplier payments, order status |
| API | `server/modules/stock/routes.cjs` | purchases, payables ageing, locations, transfers, adjustments, reservations, serials, customer devices, counts, valuation |
| Screens | `src/pages/purchases.js`, `src/pages/stock.js` | Orders, Receipts, Bills, Returns, Payables; On Hand, Locations & Vans, Serial Numbers, Stock Count |
| Navigation | `src/main.js` | new **Purchases & Stock** group; the item catalogue moved here from Management |

### The rules that make the numbers trustworthy

1. **Receiving and being billed are different events.** A goods receipt puts
   stock on the shelf and parks its value in *Goods Received Not Billed*
   (2300). The supplier bill clears that account, claims the input tax and
   creates the payable - and touches no stock. One delivery, counted once.
2. **Every stock change goes through `move()`**, which writes the ledger row
   and the running quantity in the same breath. The valuation endpoint
   recomputes from the ledger and reports any disagreement instead of hiding
   it.
3. **Moving average cost**, per item, in paise per base unit - used for stock
   value, for what goods cost when they leave, and for returns.
4. **Freight is part of what the goods cost.** Charges on a receipt are spread
   across its lines by value, so a metre of cable costs what it actually cost.
5. **A roll is bought, metres are held.** Items carry a secondary unit and a
   conversion factor; the ledger is always in the base unit.
6. **A transfer is not a sale.** Store -> van -> store writes two rows that
   balance to nothing, and touches no income or expense account.
7. **A customer's device is not our stock.** It lives in a location marked
   not-ours, is tracked by serial, and never appears in the valuation.
8. **A serial number cannot arrive twice**, and it carries its cost, its
   supplier, its warranty date and the job it goes out on.
9. **Reservations are promises, not consumption.** Available = on hand minus
   reserved; a quotation reduces neither.
10. **Stock cannot go negative** without a per-item exception, and an
    adjustment needs a reason that lands in the audit trail.
11. **A count changes nothing until it is approved**, and the difference posts
    to *Inventory Write-off / Shrinkage* (5010) so a loss appears in the
    accounts rather than as a quietly edited number.

### Tests

`node --test tests/stock-stage3.test.mjs` - 18 acceptance tests:
order posts nothing; partial receipt takes only what arrived and refuses to
over-receive; receipt parks value in GRNI; **the supplier bill does not receive
the goods a second time**; freight lands in the cost of the goods; the moving
average moves when the price does; a serial cannot arrive twice and the count
must match; warranty and supplier follow the serial; a customer's device is
tracked and valued at nothing; store to van and back is neither sale nor
expense and cannot overdraw the van; reservations hold without consuming;
negative stock refused; a count posts its difference to shrinkage and settles
once; supplier payment clears the payable and cannot overpay; the ledger's
inventory account equals the stock it represents; a billed receipt cannot be
unwound; permissions.

Full suite: **125 of 126 pass** (`npm test`, now `--test-concurrency=1` because
the database-backed suites share one database). The one failure,
`feedback-routing`, predates this work and is tracked separately.

### Bugs this stage found and fixed

- **A van appeared to hold twice what it held.** Location balances were reading
  both `location_id` and `to_location_id`, counting the destination of a
  transfer twice. A movement belongs to one location; `to_location_id` is for
  tracing the other half.
- **Ugly document numbers.** A document type with no configured series got the
  first three letters of its name (`GOO-` for a goods receipt). There is now a
  proper prefix map - `GRN`, `SB`, `PR`, `SC`.
- **Suites interfering.** `node --test` runs files in parallel; two suites
  against one database tripped over each other's period locks.

---

## Stage 4 - Jobs (built, tested locally, **not deployed**)

The join between the work and the money: what a technician fitted, what it
cost, what the customer was charged, and what was left over.

### Delivered

| Piece | Where | Notes |
|---|---|---|
| Schema | `server/modules/jobs/schema.cjs` | `job_material_issues` (+lines), `job_costs`, `job_estimates`; `businesses` gained `require_material_approval` and default labour/travel rates |
| Job service | `server/modules/jobs/service.cjs` | submit -> approve/reject materials, other costs, job summary, invoice from job, estimate from an accepted quotation |
| API | `server/modules/jobs/routes.cjs` | approval queue, job summary, costs, job invoice, profitability report, technician-held stock |
| Screen | `src/pages/job-costing.js` | Awaiting Approval, Job Profitability, Done Not Billed, Held by Technicians |
| Navigation | `src/main.js` | Work -> Job Costing |

### The rules

1. **A technician submits; an approver accepts.** Until the submission is
   approved, no stock moves and no cost reaches the accounts. The business
   decides whether approval is required at all (`require_material_approval`,
   off by default, so the existing flow is unchanged until it is switched on).
2. **Approval is the accounting moment.** Materials used post
   Dr Cost of Goods Sold / Cr Inventory at moving average; material returned
   posts the reverse at the same cost. Approving twice is refused.
3. **A rejected submission moves nothing** and has to say why.
4. **Labour, travel and subcontractors are costs**, posted to their own
   accounts against payables. An *estimated* cost is a plan and posts nothing.
5. **The invoice is built from what was approved** - materials used less
   materials returned, priced at the selling rate, plus billable charges. Costs
   marked not billable stay costs and are never charged to the customer.
6. **One job, one invoice.** Asking again returns the draft that exists.
   Materials still awaiting approval block invoicing.
7. **A job with no linked customer cannot be invoiced** - the software will not
   guess who to bill.
8. **Cost and margin are a capability.** The same job summary serves a
   technician with the money removed; he can open the job he was sent to, and
   no other.
9. **Margin always states its basis** - revenue is invoiced value before tax,
   cost is approved materials at moving average plus actual labour, travel and
   subcontract. Submissions awaiting approval are excluded and said to be.

### Tests

`node --test tests/jobs-stage4.test.mjs` - 14 acceptance tests: submission
moves nothing; approval moves stock out of the van and posts COGS; returns come
back at the same cost; a rejection moves nothing; labour and travel reach their
accounts while an estimate does not; the invoice is built once from what was
approved, with non-billable costs excluded; the job's own numbers
(cost 2,500 / revenue 3,700 / margin 1,200 at 32.4%); a technician sees the job
but not the money and cannot approve his own materials; the profitability
report finds the job; work done and never billed is visible as exactly that;
technician-held stock; a job with no customer refuses to be invoiced; and the
books still balance.

Full suite: **139 of 140 pass**. The one failure, `feedback-routing`, predates
this work.

### Note on the existing technician bill

The older `bill_items` path (the technician's bill on the mobile app) still
moves stock without posting cost of goods sold. It is untouched on purpose -
it is in daily use. The new path posts properly, and Stage 6's migration will
reconcile the two. Switching `require_material_approval` on is what moves a
business from the old flow to the new one.

---

## Stock import from Excel (built, tested locally, **not deployed**)

Stock screen → **Template** downloads `stock-import-template.xlsx` (sheet `Items` with the headings and three sample rows, sheet `How to fill`). **Import Excel** reads the sheet in the browser (`Items` sheet, else the first; `.csv` works too), sends plain rows to `POST /api/stock/import`, and shows a preview from the server's own check. The same check runs for the preview (`dry_run`) and for the real import, so what is shown is what is saved.

- Columns: Item Name*, SKU, Category, HSN/SAC, Unit, Purchase Rate*, Selling Rate*, GST %, Opening Qty, Opening Rate, Min Stock, Location, Brand, Model, Warranty (months), Track Serial, Serial Numbers. Heading spellings are forgiving (`Selling Price (₹)`, `Qty`, `Code`).
- All-or-nothing: any row with a problem stops the whole file; the errors name the row. Item, opening movement, serials and journal are one transaction.
- Match on SKU (or name when there is no SKU): existing item is **updated**, new one **created**. A row that gives Opening Qty for an item that already has stock or history is refused, so the same file uploaded twice cannot double the shelf.
- Opening stock goes through `stock.move()` (type `opening`) at the Opening Rate (blank = Purchase Rate); one journal per import: **Dr 1200 Inventory / Cr 3100 Opening Balance Equity**. Refused in a locked period.
- Serial-tracked items: serial count must equal Opening Qty; a serial already on record is refused.
- Needs `item.manage` and `stock.adjust`. Limit 1000 rows per file (request body cap is 1 MB).
- Tests: `tests/stock-import.test.mjs` (13). Code: `server/modules/stock/importer.cjs`, `src/pages/stock.js`.

## Service income in the books (built, tested locally, **not deployed**)

Service tickets (`inquiries`) and installations carry their own bill and payment fields; nothing posted them to the ledger. `server/modules/service-ledger/` now does, per ticket, up to three journals (`source_type = 'service'`, `source_id` = the ticket):

| Part | When | Dr / Cr |
|---|---|---|
| income | bill made | Dr 1100 Receivable (party) + 4900 Discounts Allowed / Cr 4000 goods, 4010 service (4020 for installation), 2100/2110 GST |
| collect | marked paid | Dr 1010 Bank (online) · 1000 Cash (cash, no technician custody) · 1020 Cash with Technicians (cash collected, not handed in) / Cr 1100 |
| handover | `cash_submitted_at` set | Dr 1000 / Cr 1020 |

- **Trigger:** `syncSoon` after a ticket is saved through `/api/data` (PATCH/DELETE), `markTicketPaid`, or the installation pay route; plus a sweep every 5 minutes (and 30 s after boot) that compares each ticket's signature with what was last posted, so any other route is still caught. `POST /api/service-ledger/sync` runs it on demand.
- **Never edited:** a changed bill, an un-marked payment or a deleted ticket reverses the old journal and posts a new one. `service_ledger_links` holds the journal ids, signatures and versions (idempotency key `svc:<kind>:<id>:<part>:<ver>`).
- **Start date:** `businesses.service_ledger_from`, set to the day the column is first created (so going live pulls in nothing old); NULL = off. Only tickets billed on/after it are posted; older money belongs in opening balances. Change it under Business & Tax Setup → Service Income.
- **Customer:** matched to an existing party by the last 10 digits of the phone, else created (`Created automatically from a service ticket`). Party balance is read from the ledger, so it shows up in Customers.
- **Blocked, not lost:** a closed period or missing business state marks the link `blocked` with the reason, shown on the Service Income tab, and is retried by every sweep.
- **Not double counted:** a ticket already invoiced through Stage 4 (`sales_documents.source_type/source_id`) is skipped. FOC tickets and bills before the start date are skipped.
- **Discount:** the billing screen takes the discount off *after* GST, so GST stays on the full base and the discount is its own Dr line.
- **Known limits:** installation cash goes straight to the till (installations have no handover flow); gig-worker payouts are not posted yet; Sales → Receivables ageing is invoice-based and does not list service receivables (the party balance and trial balance do); ticket timestamps are stored in UTC by the app, so a bill made between midnight and 05:30 IST lands on the previous date.
- Tests: `tests/service-ledger.test.mjs` (20). Code: `server/modules/service-ledger/`, `src/pages/business-settings.js` (Service Income tab), hooks in `server/index.cjs`.

## Stage 5 — Reports & GST working papers (built, tested locally, **not deployed**)

Accounts → **Financial Reports** (`src/pages/reports.js`, API `GET /api/reports/*`, `server/modules/reports/`). Read-only, gated on `report.financial`. Every report is worked out from posted journals (or the invoices/bills behind them) when opened, states its period and basis, and exports to CSV (plain numbers, no ₹ or commas, for Excel).

| Report | Source | Notes |
|---|---|---|
| Profit & Loss | income/expense accounts in the date range | income, COGS (subtype `cogs`), expenses; discounts allowed shown against income |
| Balance Sheet | everything posted up to a date | profit shown cumulatively (no year-end close yet); flags if assets ≠ liabilities + equity + profit |
| Who Owes What | ledger lines on receivable / payable accounts | FIFO ageing 0–30 / 31–60 / 61–90 / 90+ **from the day each amount was charged** (a journal has no due date); includes invoices, service tickets and opening balances; overpayment shown as "paid ahead" |
| Account Ledger | one account, opening → running balance → closing | closes at the figure the balance sheet shows |
| Party Statement | a customer's or supplier's receivable/payable lines | Dr = they owe us |
| GST | see below | working papers, **not a return, not the portal upload format, no e-invoicing/IRN** |
| Stock Value | `stock.valuation` beside account 1200 | shows the gap when stock exists that the books have not been told about |
| Job Profit | existing `/api/jobs/profitability` | now counts revenue billed on the ticket (from the ledger), not only Sales invoices |
| Health Check | `GET /api/reports/reconciliation` | debits = credits; balance sheet holds; receivable/payable control vs the named parties; stock vs Inventory; cash with technicians vs tickets; tickets stuck unposted |

**GST tabs:** *Summary* (tax collected − claimable input = payable, by CGST/SGST/IGST, sales by category, and each figure set against the tax accounts so a manual journal touching them shows as a difference); *Sales Register* (issued invoices/credit/debit notes **plus service and installation bills**, categorised B2B / B2CL (inter-state, unregistered, over ₹2.5 lakh) / B2CS / CDNR / CDNUR); *HSN Summary* (invoice lines by code and rate, credit notes taken off; tickets carry no HSN so are not in it); *Purchases & ITC* (supplier bills and returns; tax on purchases marked not claimable stays in cost and is reported separately).

**Fixed on the way:** `posting.trialBalance` summed journal lines regardless of the date range (the join filtered the journal, not the line), so a range narrower than all history leaked in lines from outside it. The tests always asked for the whole year, so it never showed. Regression test in `tests/reports-stage5.test.mjs`.

**Known limits:** ageing has no due dates (transaction date is used); the balance sheet is cumulative, not year-closed; the Health Check's inventory line will show a gap until stock that predates accounting is given an opening entry (Stage 6 / Stock → Import Excel).
Tests: `tests/reports-stage5.test.mjs` (15).

## Stage 6 — Migration, summary and reminders (built, tested locally, **not deployed**)

**Accounts → Data Migration** (`src/pages/migration.js`, API `/api/migration/*`, `server/modules/migration/`). Every migration is *look first (nothing written) → confirm → the Health Check's own reconciliation is run before and after*, and each run is kept in **History** with both readings. Every step can be repeated: what is already in is never posted twice.

| Migration | What it does | Guards |
|---|---|---|
| **Older tickets** | Moves `service_ledger_from` earlier and lets the ordinary sweep post the tickets billed in between — the same code, on each ticket's own billing date | must be earlier than the current start; tickets invoiced through Sales are left to Sales; warns if opening balances were entered as of a later date (double-count risk), if tickets fall in a closed period (they block, the rest post, and the sweep retries once the lock is lifted), or if the business state is missing; a 60 s budget, then the automatic sweep finishes the rest |
| **Stock on the shelf** | For items whose recorded value is more than their movements carry, adds an `opening` movement and one journal Dr 1200 Inventory / Cr 3100 Opening Balance Equity. Item quantity and cost are **not** touched; only the ledger catches up | legacy movements that have quantity but no value are handled (value-only); an item whose history shows *more* stock than is on hand, or less value than its movements, is **flagged and not booked**; warns if the Inventory account and the movements already differ; refuses to run twice |
| **Service register** | `service_logs` entries that are not on any ticket (no link, no matching ticket number) are booked as **service income with no GST**, dated the day written; paid ones are received into Cash in Hand or Bank as chosen; pending ones become receivables | tracked in `migration_items`, so an entry is never booked twice; an entry in a closed period fails alone and the rest go through; a ticket's entry is refused rather than double-counted |

**Owner Summary** (Financial Reports, first tab, `GET /api/reports/owner-summary`): today and this month's sales, money collected, costs and profit; cash in hand, bank and cash with technicians; what customers owe (and how much is over 30 days) and what we owe; GST payable this month; stock value; and a "needs a look" list (failing health checks, unposted tickets, technician cash held 3+ days, low stock). "Collected" counts only journals that also settle a receivable, so cash a technician hands in (a move between two cash accounts) is not double counted.

**Reminders** (Financial Reports → Reminders, `GET /api/reports/reminders`): customers with anything charged over 30 days ago and still unpaid, with a ready message and a `wa.me` link, plus suppliers we owe. **Nothing is sent by the system** — the button opens WhatsApp and a person presses send (no customer-facing template was invented). Recording that someone was reminded (`payment_reminders`) moves no money.

**Evening summary:** after 8 pm server time, once a day, the admins get one in-app/push notification (`subject: owner_summary`) with the day in a few plain lines. Deduplicated through `app_settings.last_owner_digest`; skipped if nothing is in the books yet; switch on `businesses.owner_digest_on` (default on) under Data Migration → Evening Summary, with a "send it now" button. Nothing is sent outside NEST.

**Known limits:** the older-tickets run is bounded by a 60 s request budget (the sweep completes the remainder); register entries carry no GST because the register has no GST field; the summary and digest use server-local time; reminders are per customer, not per invoice.
Tests: `tests/migration-stage6.test.mjs` (19). Code: `server/modules/migration/`, `server/modules/reports/service.cjs` (`ownerSummary`, `reminders`), `src/pages/migration.js`, `src/pages/reports.js`.

## Verification status

| Requirement | Status |
|---|---|
| Financial reconciliation | ✅ receivable in the ledger reconciles to invoices less credit notes less allocations, asserted in the Stage 2 suite |
| Migration checks | ⏳ Stage 6 |
| Permissions | ✅ server-enforced, tested |
| Document output (PDF) | ✅ renders, paginates and totals correctly — **but prints a placeholder-free letterhead only once the business details are filled in** |
| Tax configuration | 🔒 rates seeded, but **not verified against current CBIC guidance** — see below |

### 🔒 Blocked on a fact or a credential

| Needed | For | Until then |
|---|---|---|
| Legal name, registered address, state, GSTIN, PAN, registration type | Any tax document | Business stays `setup_complete = 0` |
| Bank details, logo, signature, invoice footer | Invoice PDFs | Placeholder-free: those sections are simply absent |
| Opening balances (customers, suppliers, cash, bank, stock) as on a chosen date | Correct books from day one | The opening journal can be posted at any time; run it once the figures are in |
| Statutory review of slabs, HSN/SAC and treatments by an accountant, against current CBIC guidance, with the source and date recorded here | GST correctness | Seeded slabs are a starting point, **not advice**. This file must carry the verification date before any tax document goes to a customer |
| GSP / IRP account + credentials | e-invoicing (IRN/QR), GSTIN online verification | Feature not offered in the UI. No IRN will ever be fabricated |
| WhatsApp / SMS provider decision for accounting reminders | Stage 6 automation | Existing Fast2SMS stays for service work only |

---

## Not yet started

All six stages are built. What remains is operating them: filling in Business & Tax Setup,
entering opening balances, and having an accountant check the GST slabs and the reports
against the current rules before anything is filed from them.

---

## Deployment

Stages 1 to 4 are committed but **not pushed**. Pushing to `main` auto-deploys to
`services.networkingexperts.in`, and the owner asked for nothing to reach
production without approval. On deploy, the schema migration runs on boot: it only creates new tables and
adds nullable columns, and touches no existing data. Nothing in the existing
service, installation or billing flows calls the new code — the accounting
screens are additions to the sidebar, not replacements.

**Rollback:** the new tables are unreferenced by existing code paths, so
reverting the commit is sufficient; no data migration has to be undone.
