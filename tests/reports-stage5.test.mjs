// Stage 5 acceptance tests: the reports, checked against figures worked out
// by hand from the journals and documents that feed them.
//
//   node --test tests/reports-stage5.test.mjs
//
// Skips when the API or the database is absent. Everything it creates is
// removed at the end.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const API = 'http://127.0.0.1:5000/api';

let mysql; let jwt; let db; let tokens; let reachable = false;
let businessBefore = null;
let businessId = null;
const made = { journals: [], parties: [], salesDocs: [], purchaseDocs: [], inquiries: [], costs: [] };

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/reports/reconciliation`).catch(() => null);
  reachable = !!probe && probe.status === 401;
  if (reachable) {
    db = await mysql.createConnection({
      host: process.env.DB_HOST, user: process.env.DB_USER,
      password: process.env.DB_PASS, database: process.env.DB_NAME,
    });
    const [[admin]] = await db.query("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1");
    const [[emp]] = await db.query("SELECT id FROM profiles WHERE role = 'employee' LIMIT 1");
    const sign = (id, role) => jwt.sign(
      { id, email: `${role}@test.local`, role, worker_type: 'fixed' }, process.env.JWT_SECRET, { expiresIn: '1h' }
    );
    tokens = { admin: sign(admin.id, 'admin'), employee: sign(emp.id, 'employee') };
  }
} catch { reachable = false; }

const skip = reachable ? false : 'needs the local API on port 5000 and the test database';

const call = async (method, path, body, who = 'admin') => {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const get = async (path) => {
  const r = await call('GET', path);
  assert.equal(r.status, 200, `${path} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = iso(new Date());
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

let acct = {};
const post = async (date, lines, narration = 'ZZ report test') => {
  const r = await call('POST', '/accounting/journals', {
    date, narration,
    lines: lines.map(([code, debit, credit, party]) => ({
      account_id: acct[code], debit: debit || 0, credit: credit || 0, party_id: party || null,
    })),
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  made.journals.push(r.body.id);
  return r.body;
};
const amountOf = (list, code) => list.find((r) => r.code === code)?.amount_paise || 0;
const balanceOf = (list, code) => list.find((r) => r.code === code)?.balance_paise || 0;

const D1 = '2026-08-10';
const D2 = '2026-08-11';

test('set up: accounts and a business the reports can read', { skip }, async () => {
  const accounts = await get('/accounting/accounts');
  acct = Object.fromEntries(accounts.map((a) => [a.code, a.id]));
  for (const code of ['1000', '1100', '2000', '4010', '5500']) assert.ok(acct[code], `account ${code} should exist`);
  const [[biz]] = await db.query('SELECT * FROM businesses WHERE is_default = 1 LIMIT 1');
  businessBefore = biz;
  businessId = biz.id;
  await db.query(`UPDATE businesses SET state_code = '01', state_name = 'Jammu and Kashmir' WHERE id = ?`, [biz.id]);
});

test('only people who may see financial reports can', { skip }, async () => {
  for (const path of ['profit-loss', 'balance-sheet', 'ageing', 'gst/summary', 'reconciliation']) {
    assert.equal((await call('GET', `/reports/${path}`, null, 'employee')).status, 403, path);
  }
  assert.equal((await call('GET', '/reports/profit-loss?from=nonsense')).status, 400);
  assert.equal((await call('GET', '/reports/profit-loss?from=2026-09-01&to=2026-08-01')).status, 400, 'a range that runs backwards');
  assert.equal((await call('GET', '/reports/account-ledger')).status, 400);
  assert.equal((await call('GET', '/reports/account-ledger?account=NOPE')).status, 404);
});

// ── profit and loss, and the trial balance's date range ────────────────

let plBefore; let tbBefore;

test('profit and loss counts income, cost and expense inside the dates and nothing outside', { skip }, async () => {
  plBefore = await get(`/reports/profit-loss?from=${D1}&to=${D1}`);
  tbBefore = await get(`/accounting/trial-balance?from=${D1}&to=${D1}`);

  await post(D1, [['1000', 1000], ['4010', 0, 1000]], 'ZZ sale');
  const rent = await post(D1, [['5500', 300], ['1000', 0, 300]], 'ZZ rent');
  await post(D2, [['1000', 777], ['4010', 0, 777]], 'ZZ next day');   // must not show on D1

  const pl = await get(`/reports/profit-loss?from=${D1}&to=${D1}`);
  assert.equal(amountOf(pl.income, '4010') - amountOf(plBefore.income, '4010'), 100000, 'only the sale on the day');
  assert.equal(amountOf(pl.expenses, '5500') - amountOf(plBefore.expenses, '5500'), 30000);
  assert.equal(pl.totals.net_profit_paise - plBefore.totals.net_profit_paise, 70000, '1000 in, 300 out');
  assert.equal(pl.totals.gross_profit_paise, pl.totals.income_paise - pl.totals.cogs_paise);

  // The trial balance takes the same range and must not leak the next day in.
  const tb = await get(`/accounting/trial-balance?from=${D1}&to=${D1}`);
  const row = (t, code) => t.accounts.find((a) => a.code === code);
  assert.equal(Number(row(tb, '4010').credit_paise) - Number(row(tbBefore, '4010').credit_paise), 100000,
    'a journal dated the next day is not in a one-day trial balance');
  assert.equal(tb.totals.debit_paise, tb.totals.credit_paise, 'and it still balances');

  // A reversal takes the rent back out, and both stay in the books.
  const rev = await call('POST', `/accounting/journals/${rent.id}/reverse`, { reason: 'ZZ test', date: D1 });
  assert.equal(rev.status, 201);
  made.journals.push(rev.body.id);
  const after = await get(`/reports/profit-loss?from=${D1}&to=${D1}`);
  assert.equal(amountOf(after.expenses, '5500') - amountOf(plBefore.expenses, '5500'), 0, 'the reversed rent nets to nothing');
});

// ── balance sheet ───────────────────────────────────────────────────────

test('the balance sheet balances and moves by what was posted', { skip }, async () => {
  const a = await get(`/reports/balance-sheet?as_on=${D1}`);
  const b = await get(`/reports/balance-sheet?as_on=${D2}`);
  assert.equal(a.balanced, true, `assets ${a.totals.assets_paise} vs ${a.totals.liabilities_and_equity_paise}`);
  assert.equal(b.balanced, true);
  assert.equal(balanceOf(b.assets, '1000') - balanceOf(a.assets, '1000'), 77700, 'the next day\'s takings arrive on the next day');
  assert.equal(b.totals.profit_to_date_paise - a.totals.profit_to_date_paise, 77700, 'and are profit');
  assert.equal(b.totals.equity_paise, a.totals.equity_paise, 'equity itself did not move');
});

// ── an account's ledger ─────────────────────────────────────────────────

test('an account ledger runs a balance line by line to the figure the balance sheet shows', { skip }, async () => {
  const led = await get(`/reports/account-ledger?account=1000&from=${D1}&to=${D2}`);
  assert.equal(led.account.code, '1000');
  const mine = led.rows.filter((r) => /ZZ/.test(r.narration || ''));
  assert.equal(mine.length, 4, 'the sale, the rent, its reversal, and the next day takings');
  assert.equal(mine[0].narration, 'ZZ sale');
  assert.equal(mine[1].narration, 'ZZ rent');
  assert.match(mine[2].narration, /^Reversal of /);
  assert.equal(mine[3].narration, 'ZZ next day');
  let running = led.opening_paise;
  for (const r of led.rows) {
    running += r.debit_paise - r.credit_paise; // cash is debit-natured
    assert.equal(r.balance_paise, running, `running balance at ${r.journal_no}`);
  }
  assert.equal(led.closing_paise, running);
  const bs = await get(`/reports/balance-sheet?as_on=${D2}`);
  assert.equal(led.closing_paise, balanceOf(bs.assets, '1000'), 'the ledger closes where the balance sheet says the account stands');
});

// ── ageing and statements ───────────────────────────────────────────────

let customer; let supplier;

test('receivables age oldest-first, and a payment reaches the oldest charge first', { skip }, async () => {
  const c = await call('POST', '/parties', { display_name: 'ZZ Ageing Customer', kind: 'customer', phone: '9000000501', place_of_supply_state_code: '01' });
  assert.equal(c.status, 201);
  customer = c.body.id;
  made.parties.push(customer);

  const row = async (asOn) => (await get(`/reports/ageing?kind=receivable&as_on=${asOn}`)).parties.find((p) => p.party_id === customer);

  await post(daysAgo(60), [['1100', 5000, 0, customer], ['4010', 0, 5000]], 'ZZ old bill');
  await post(daysAgo(5), [['1100', 3000, 0, customer], ['4010', 0, 3000]], 'ZZ recent bill');
  let r = await row(TODAY);
  assert.equal(r.d31_60, 500000, 'a bill 60 days old');
  assert.equal(r.d0_30, 300000, 'a bill 5 days old');

  await post(TODAY, [['1000', 4000], ['1100', 0, 4000, customer]], 'ZZ part payment');
  r = await row(TODAY);
  assert.equal(r.d31_60, 100000, '4,000 went against the oldest 5,000');
  assert.equal(r.d0_30, 300000, 'the recent bill is untouched');
  assert.equal(r.outstanding_paise, 400000);
  assert.equal(r.oldest_days, 60);

  await post(TODAY, [['1000', 2000], ['1100', 0, 2000, customer]], 'ZZ second payment');
  r = await row(TODAY);
  assert.equal(r.d31_60, 0, 'the old bill is cleared');
  assert.equal(r.d0_30, 200000, 'and the rest went against the next one');

  // Looked at as it stood 30 days ago, only the old bill existed, and it was 30 days old.
  const then = await row(daysAgo(30));
  assert.equal(then.d0_30, 500000);
  assert.equal(then.outstanding_paise, 500000);

  await post(TODAY, [['1000', 5000], ['1100', 0, 5000, customer]], 'ZZ overpayment');
  r = await row(TODAY);
  assert.equal(r.outstanding_paise, 0, 'nothing is owed any more');
  assert.equal(r.advance_paise, 300000, 'and the 3,000 paid beyond the bills is shown as paid ahead');
  assert.equal(r.d0_30 + r.d31_60 + r.d61_90 + r.d90_plus, 0, 'not as a negative bucket');
});

test('a payment ahead of any bill shows as an advance, not as a negative debt', { skip }, async () => {
  const totals = (await get(`/reports/ageing?kind=receivable&as_on=${TODAY}`)).totals;
  assert.ok(totals.advance_paise >= 300000, 'the advance is in the report totals');
  // 5,000 + 3,000 billed, 4,000 + 2,000 + 5,000 paid → 3,000 paid ahead
  const statement = await get(`/reports/party-statement?party_id=${customer}&from=${daysAgo(90)}&to=${TODAY}`);
  assert.equal(statement.closing_paise, -300000, 'we owe them 3,000');
  assert.equal(statement.opening_paise, 0);
  let running = 0;
  for (const r of statement.rows) { running += r.debit_paise - r.credit_paise; assert.equal(r.balance_paise, running); }
  assert.equal(statement.rows.length, 5);

  // a smaller window opens with what went before it
  const later = await get(`/reports/party-statement?party_id=${customer}&from=${daysAgo(10)}&to=${TODAY}`);
  assert.equal(later.opening_paise, 500000, 'the 5,000 bill from 60 days ago is carried in');
  assert.equal(later.closing_paise, -300000);
});

test('payables age the same way, from the supplier side', { skip }, async () => {
  const s = await call('POST', '/parties', { display_name: 'ZZ Ageing Supplier', kind: 'supplier', phone: '9000000502', place_of_supply_state_code: '01' });
  supplier = s.body.id;
  made.parties.push(supplier);
  await post(daysAgo(45), [['5500', 1500], ['2000', 0, 1500, supplier]], 'ZZ supplier bill');
  await post(TODAY, [['2000', 500, 0, supplier], ['1000', 0, 500]], 'ZZ paid supplier');
  const p = (await get(`/reports/ageing?kind=payable&as_on=${TODAY}`)).parties.find((x) => x.party_id === supplier);
  assert.equal(p.outstanding_paise, 100000, '1,500 owed less 500 paid');
  assert.equal(p.d31_60, 100000);
});

// ── do the books agree with themselves? ─────────────────────────────────

test('the reconciliation notices money posted to receivables with no customer, and clears when it is reversed', { skip }, async () => {
  const key = (r, k) => r.checks.find((c) => c.key === k);
  const clean = await get(`/reports/reconciliation?as_on=${TODAY}`);
  for (const k of ['trial_balance', 'balance_sheet', 'receivable', 'payable']) {
    assert.equal(key(clean, k).ok, true, `${k}: ${JSON.stringify(key(clean, k))}`);
  }
  const inv = key(clean, 'inventory');
  assert.equal(inv.difference_paise, inv.a_paise - inv.b_paise, 'the stock check shows both sides and the gap');

  const stray = await post(TODAY, [['1100', 100], ['4010', 0, 100]], 'ZZ no customer');
  const dirty = await get(`/reports/reconciliation?as_on=${TODAY}`);
  assert.equal(key(dirty, 'receivable').ok, false, 'a receivable with nobody attached is flagged');
  assert.equal(key(dirty, 'receivable').difference_paise, 10000);
  assert.equal(dirty.ok, false);
  assert.equal(key(dirty, 'trial_balance').ok, true, 'though the books still balance');

  const rev = await call('POST', `/accounting/journals/${stray.id}/reverse`, { reason: 'ZZ test' });
  made.journals.push(rev.body.id);
  assert.equal(key(await get(`/reports/reconciliation?as_on=${TODAY}`), 'receivable').ok, true);
});

// ── GST working papers ──────────────────────────────────────────────────

const G = '2031-05-10';
const snap = (name, gstin) => JSON.stringify({ name, gstin: gstin || null });

const insertSales = async (o) => {
  const id = randomUUID();
  await db.query('INSERT INTO sales_documents SET ?', [{
    id, business_id: businessId, doc_date: G, status: 'issued', supply_type: 'intra', place_of_supply_state_code: '01',
    cgst_paise: 0, sgst_paise: 0, utgst_paise: 0, igst_paise: 0, ...o,
  }]);
  made.salesDocs.push(id);
  return id;
};
const insertLine = (docId, o) => db.query('INSERT INTO sales_document_lines SET ?', [{
  id: randomUUID(), document_id: docId, description: 'ZZ item', unit: 'pcs', tax_rate_bps: 1800,
  cgst_paise: 0, sgst_paise: 0, utgst_paise: 0, igst_paise: 0, ...o,
}]);
const insertPurchase = async (o) => {
  const id = randomUUID();
  await db.query('INSERT INTO purchase_documents SET ?', [{
    id, business_id: businessId, doc_date: G, status: 'issued', input_credit_eligible: 1,
    cgst_paise: 0, sgst_paise: 0, utgst_paise: 0, igst_paise: 0, ...o,
  }]);
  made.purchaseDocs.push(id);
  return id;
};

test('the sales register sorts every document into the category a return would put it in', { skip }, async () => {
  const d1 = await insertSales({ doc_type: 'invoice', doc_no: 'ZZ-R5-1', party_snapshot: snap('ZZ Registered Buyer', '01ABCDE1234F1Z5'), taxable_paise: 100000, cgst_paise: 9000, sgst_paise: 9000, total_paise: 118000 });
  await insertLine(d1, { hsn_sac: '85258900', quantity: 2, taxable_paise: 100000, cgst_paise: 9000, sgst_paise: 9000, amount_paise: 118000 });
  const d2 = await insertSales({ doc_type: 'invoice', doc_no: 'ZZ-R5-2', party_snapshot: snap('ZZ Walk-in'), taxable_paise: 50000, cgst_paise: 4500, sgst_paise: 4500, total_paise: 59000 });
  await insertLine(d2, { hsn_sac: '85258900', quantity: 1, taxable_paise: 50000, cgst_paise: 4500, sgst_paise: 4500, amount_paise: 59000 });
  const d3 = await insertSales({ doc_type: 'invoice', doc_no: 'ZZ-R5-3', party_snapshot: snap('ZZ Far Buyer'), supply_type: 'inter', place_of_supply_state_code: '07', taxable_paise: 25000000, igst_paise: 4500000, total_paise: 29500000 });
  await insertLine(d3, { hsn_sac: '85219090', quantity: 10, taxable_paise: 25000000, igst_paise: 4500000, amount_paise: 29500000 });
  const d4 = await insertSales({ doc_type: 'credit_note', doc_no: 'ZZ-R5-4', party_snapshot: snap('ZZ Registered Buyer', '01ABCDE1234F1Z5'), taxable_paise: 20000, cgst_paise: 1800, sgst_paise: 1800, total_paise: 23600 });
  await insertLine(d4, { hsn_sac: '85258900', quantity: 1, taxable_paise: 20000, cgst_paise: 1800, sgst_paise: 1800, amount_paise: 23600 });
  await insertSales({ doc_type: 'invoice', doc_no: 'ZZ-R5-5', status: 'draft', party_snapshot: snap('ZZ Draft'), taxable_paise: 999900, cgst_paise: 89991, sgst_paise: 89991, total_paise: 1179882 });
  await insertSales({ doc_type: 'invoice', doc_no: 'ZZ-R5-6', status: 'cancelled', party_snapshot: snap('ZZ Cancelled'), taxable_paise: 888800, total_paise: 888800 });

  const { rows } = await get(`/reports/gst/sales-register?from=${G}&to=${G}`);
  assert.equal(rows.length, 4, 'a draft and a cancelled invoice are not sales');
  const by = Object.fromEntries(rows.map((r) => [r.doc_no, r]));
  assert.equal(by['ZZ-R5-1'].category, 'B2B');
  assert.equal(by['ZZ-R5-2'].category, 'B2CS');
  assert.equal(by['ZZ-R5-3'].category, 'B2CL', 'inter-state, unregistered, over 2.5 lakh');
  assert.equal(by['ZZ-R5-4'].category, 'CDNR');
  assert.equal(by['ZZ-R5-4'].taxable_paise, -20000, 'a credit note takes away');
  assert.equal(by['ZZ-R5-4'].total_paise, -23600);
  assert.equal(by['ZZ-R5-1'].gstin, '01ABCDE1234F1Z5');
});

test('the HSN summary adds lines up by code and rate, with credit notes taken off', { skip }, async () => {
  const { rows } = await get(`/reports/gst/hsn-summary?from=${G}&to=${G}`);
  const a = rows.find((r) => r.hsn_sac === '85258900');
  assert.equal(a.quantity, 2, '2 + 1 − 1');
  assert.equal(a.taxable_paise, 130000);
  assert.equal(a.cgst_paise, 11700);
  assert.equal(a.sgst_paise, 11700);
  assert.equal(a.rate_pct, 18);
  const b = rows.find((r) => r.hsn_sac === '85219090');
  assert.equal(b.igst_paise, 4500000);
});

test('the purchase register keeps tax you cannot claim apart from tax you can', { skip }, async () => {
  await insertPurchase({ doc_type: 'supplier_bill', doc_no: 'ZZ-P5-1', supplier_ref: 'S-1', party_snapshot: snap('ZZ Supplier One', '01AAAAA1111A1Z1'), taxable_paise: 60000, cgst_paise: 5400, sgst_paise: 5400, total_paise: 70800 });
  await insertPurchase({ doc_type: 'supplier_bill', doc_no: 'ZZ-P5-2', supplier_ref: 'S-2', party_snapshot: snap('ZZ Supplier Two'), input_credit_eligible: 0, taxable_paise: 10000, cgst_paise: 900, sgst_paise: 900, total_paise: 11800 });
  await insertPurchase({ doc_type: 'purchase_return', doc_no: 'ZZ-P5-3', party_snapshot: snap('ZZ Supplier One', '01AAAAA1111A1Z1'), taxable_paise: 6000, cgst_paise: 540, sgst_paise: 540, total_paise: 7080 });
  await insertPurchase({ doc_type: 'supplier_bill', doc_no: 'ZZ-P5-4', status: 'draft', party_snapshot: snap('ZZ Draft'), taxable_paise: 5000000, total_paise: 5000000 });

  const { rows } = await get(`/reports/gst/purchase-register?from=${G}&to=${G}`);
  assert.equal(rows.length, 3, 'no drafts');
  const ret = rows.find((r) => r.doc_no === 'ZZ-P5-3');
  assert.equal(ret.taxable_paise, -6000, 'a return takes away');
  assert.equal(rows.find((r) => r.doc_no === 'ZZ-P5-2').eligible, false);
});

test('the GST summary works out what is payable, and shows where it disagrees with the tax accounts', { skip }, async () => {
  const s = await get(`/reports/gst/summary?from=${G}&to=${G}`);
  assert.equal(s.output.taxable_paise, 100000 + 50000 + 25000000 - 20000);
  assert.equal(s.output.cgst_paise, 9000 + 4500 - 1800);
  assert.equal(s.output.sgst_paise, 9000 + 4500 - 1800);
  assert.equal(s.output.igst_paise, 4500000);
  assert.deepEqual(Object.keys(Object.fromEntries(s.output.by_category.map((c) => [c.category, 1]))).sort(), ['B2B', 'B2CL', 'B2CS', 'CDNR']);

  assert.equal(s.input.taxable_paise, 60000 - 6000, 'only claimable purchases, less returns');
  assert.equal(s.input.cgst_paise, 5400 - 540);
  assert.equal(s.input.ineligible_tax_paise, 1800, 'tax left in the cost is reported, not claimed');

  assert.equal(s.payable.cgst_paise, 11700 - 4860);
  assert.equal(s.payable.igst_paise, 4500000);
  assert.equal(s.payable.total_paise, s.payable.cgst_paise + s.payable.sgst_paise + s.payable.igst_paise);

  // No journal touched the tax accounts on that date, so the ledger says 0 and
  // the difference is the whole of what the documents claim.
  assert.equal(s.against_ledger.output_cgst.ledger_paise, 0);
  assert.equal(s.against_ledger.output_cgst.difference_paise, s.output.cgst_paise);
  assert.match(s.scope.basis, /not a return/);
});

// ── service tickets in the tax papers and in job profitability ─────────

test('a service ticket appears in the sales register and in job profitability, and leaves them when deleted', { skip }, async () => {
  await call('PUT', '/service-ledger/settings', { from: TODAY });
  const id = randomUUID();
  made.inquiries.push(id);
  await db.query('INSERT INTO inquiries SET ?', [{
    id, full_name: 'ZZ Reports Customer', phone: '9000000503', ticket_no: `ZZR-${id.slice(0, 6)}`, service_item: 'CCTV repair',
    location: 'Srinagar', bill_total: 1180, gst_amount: 180, discount_amount: 0, bill_amount: 1000,
    bill_generated_at: `${TODAY} 10:00:00`, payment_status: 'paid', payment_method: 'razorpay', payment_received_at: `${TODAY} 11:00:00`, status: 'resolved',
  }]);
  const costId = randomUUID();
  made.costs.push(costId);
  await db.query('INSERT INTO job_costs SET ?', [{
    id: costId, business_id: businessId, job_type: 'inquiry', job_id: id, kind: 'labour', basis: 'actual',
    description: 'ZZ labour', quantity: 1, rate_paise: 20000, amount_paise: 20000, status: 'approved',
  }]);
  await call('POST', '/service-ledger/sync');

  const ref = `ZZR-${id.slice(0, 6)}`;
  const find = async () => (await get(`/reports/gst/sales-register?from=${TODAY}&to=${TODAY}`)).rows.find((r) => r.doc_no === ref);
  let row = await find();
  assert.equal(row.source, 'ticket');
  assert.equal(row.category, 'B2CS');
  assert.equal(row.taxable_paise, 100000);
  assert.equal(row.cgst_paise, 9000);
  assert.equal(row.sgst_paise, 9000);

  // A revised bill nets in the register rather than showing two bills.
  await db.query('UPDATE inquiries SET bill_total = 2360, gst_amount = 360, bill_amount = 2000 WHERE id = ?', [id]);
  await call('POST', '/service-ledger/sync');
  row = await find();
  assert.equal(row.taxable_paise, 200000, 'the register shows the bill as it stands now');

  const jobs = await get(`/jobs/profitability?from=${TODAY}&to=${TODAY}`);
  const job = jobs.jobs.find((j) => j.job_id === id);
  assert.ok(job, 'a job billed on its ticket is in the profitability report');
  assert.equal(job.revenue_paise, 200000, 'its revenue is what was sold, before GST');
  assert.equal(job.total_cost_paise, 20000);
  assert.equal(job.margin_paise, 180000);
  assert.equal(job.unbilled, false);

  await db.query('DELETE FROM inquiries WHERE id = ?', [id]);
  await call('POST', '/service-ledger/sync');
  assert.equal(await find(), undefined, 'a deleted ticket nets to nothing and drops out');
});

test('stock valuation shows the stock, the ledger, and the gap between them', { skip }, async () => {
  const v = await get('/reports/stock-valuation');
  assert.equal(typeof v.total_value_paise, 'number');
  assert.equal(v.difference_paise, v.total_value_paise - v.ledger_inventory_paise);
  assert.match(v.scope.basis, /moving average/i);
});

test.after(async () => {
  if (!db) return;
  // Stop the server posting against tickets while they are removed.
  await call('PUT', '/service-ledger/settings', { from: null });
  await call('POST', '/service-ledger/sync');

  const tickets = made.inquiries;
  const [links] = await db.query(`SELECT source_id FROM service_ledger_links WHERE ticket_ref LIKE 'ZZR-%'`);
  const svc = [...new Set([...tickets, ...links.map((l) => l.source_id)])];
  const jids = [...made.journals];
  if (svc.length) {
    const [js] = await db.query('SELECT id FROM journals WHERE source_id IN (?)', [svc]);
    jids.push(...js.map((j) => j.id));
    await db.query('DELETE FROM service_ledger_links WHERE source_id IN (?)', [svc]);
  }
  if (jids.length) {
    const [rev] = await db.query('SELECT id FROM journals WHERE reversal_of_id IN (?) OR reversed_by_id IN (?)', [jids, jids]);
    const all = [...new Set([...jids, ...rev.map((r) => r.id)])];
    await db.query('UPDATE journals SET reversed_by_id = NULL, reversal_of_id = NULL WHERE id IN (?)', [all]);
    await db.query('DELETE FROM journal_lines WHERE journal_id IN (?)', [all]);
    await db.query('DELETE FROM journals WHERE id IN (?)', [all]);
  }
  if (made.costs.length) await db.query('DELETE FROM job_costs WHERE id IN (?)', [made.costs]);
  if (tickets.length) await db.query('DELETE FROM inquiries WHERE id IN (?)', [tickets]);
  if (made.salesDocs.length) {
    await db.query('DELETE FROM sales_document_lines WHERE document_id IN (?)', [made.salesDocs]);
    await db.query('DELETE FROM sales_documents WHERE id IN (?)', [made.salesDocs]);
  }
  if (made.purchaseDocs.length) await db.query('DELETE FROM purchase_documents WHERE id IN (?)', [made.purchaseDocs]);
  const [auto] = await db.query(`SELECT id FROM parties WHERE display_name LIKE 'ZZ Reports%' AND notes LIKE 'Created automatically%'`);
  for (const id of [...made.parties, ...auto.map((p) => p.id)]) {
    await db.query('DELETE FROM journal_lines WHERE party_id = ?', [id]);
    await db.query('DELETE FROM parties WHERE id = ?', [id]);
  }
  if (businessBefore) {
    await db.query(
      'UPDATE businesses SET state_code = ?, state_name = ?, service_ledger_from = ? WHERE id = ?',
      [businessBefore.state_code, businessBefore.state_name, businessBefore.service_ledger_from ?? null, businessBefore.id]
    );
  }
  await db.end();
});
