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

## Verification status

| Requirement | Status |
|---|---|
| Financial reconciliation | ⏳ nothing to reconcile until invoices exist (Stage 2) |
| Migration checks | ⏳ Stage 6 |
| Permissions | ✅ server-enforced, tested |
| Document output (PDF) | ⏳ Stage 2 |
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

- **Stage 2 — Sell:** estimates → invoices → receipts → journals → PDFs, with
  document lines, customer/item snapshots, credit notes, payment allocations.
- **Stage 3 — Buy & stock:** purchase orders, goods receipt, supplier bills,
  serial numbers, warehouses, technician stock, transfers, valuation.
- **Stage 4 — Jobs:** job card ↔ materials ↔ invoice, returns, advances,
  expenses, approvals.
- **Stage 5 — Reports & tax:** ageing, ledgers, P&L, balance sheet, stock
  valuation, job profitability, GST exports.
- **Stage 6 — Migration & automation:** reviewed migration of existing bills,
  payments, cash collections and service log; reconciliation before and after;
  reminders; owner summary.

---

## Deployment

Stage 1 is committed but **not pushed**. Pushing to `main` auto-deploys to
`services.networkingexperts.in`, and the owner asked for nothing to reach
production without approval. On deploy, the schema migration runs on boot: it
only creates new tables and adds nullable columns, and touches no existing data.

**Rollback:** the new tables are unreferenced by existing code paths, so
reverting the commit is sufficient; no data migration has to be undone.
