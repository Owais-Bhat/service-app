// Stage 6 acceptance tests: bringing what already exists into the books, the
// owner's summary, payment reminders, and the evening digest.
//
//   node --test tests/migration-stage6.test.mjs
//
// The digest wording is checked without a database; everything else needs the
// local API and test database and skips without them. Everything it creates is
// removed at the end.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const reports = require('../server/modules/reports/service.cjs');
const API = 'http://127.0.0.1:5000/api';

// ── wording, no database needed ─────────────────────────────────────────

const sample = () => ({
  today: { sales_paise: 1250000, collected_paise: 800000 },
  month: { sales_paise: 30000000, expenses_paise: 12000000, profit_paise: 18000000 },
  money: { with_technicians_paise: 0, technician_cash_oldest_days: 0 },
  receivable: { total_paise: 5500000, overdue_paise: 0 },
  payable: { total_paise: 0 },
  stock: { low_items: 0 },
  attention: { unposted_tickets: 0, failing_checks: [] },
});

test('the digest says the day in a few plain lines, in Indian grouping', () => {
  const t = reports.digestText(sample());
  assert.match(t, /Aaj: bikri ₹12,500, paisa aaya ₹8,000\./);
  assert.match(t, /munafa ₹1,80,000/, 'lakhs are grouped the Indian way');
  assert.match(t, /Customers ka baaki ₹55,000\./);
  assert.doesNotMatch(t, /Technicians|Suppliers|kam stock|atke|gadbad/, 'nothing to warn about, nothing said');
});

test('the digest names what needs attention', () => {
  const s = sample();
  s.receivable.overdue_paise = 2000000;
  s.money.with_technicians_paise = 400000; s.money.technician_cash_oldest_days = 4;
  s.payable.total_paise = 900000;
  s.stock.low_items = 3;
  s.attention.unposted_tickets = 2;
  s.attention.failing_checks = ['Stock value vs Inventory account'];
  const t = reports.digestText(s);
  assert.match(t, /₹20,000 30 din se purana/);
  assert.match(t, /Technicians ke paas cash ₹4,000 \(sabse purana 4 din\)/);
  assert.match(t, /Suppliers ko dena ₹9,000/);
  assert.match(t, /3 item kam stock/);
  assert.match(t, /2 ticket books me nahi/);
  assert.match(t, /Health check me gadbad: Stock value vs Inventory account/);
});

test('a phone number is only usable for WhatsApp when it has ten digits', () => {
  assert.equal(reports.phoneFor('+91 90000-70007'), '9000070007');
  assert.equal(reports.phoneFor('090000 70007'), '9000070007');
  assert.equal(reports.phoneFor('12345'), null);
  assert.equal(reports.phoneFor(null), null);
});

// ── against the database ────────────────────────────────────────────────

let mysql; let jwt; let db; let tokens; let reachable = false;
let businessBefore = null;
let businessId = null;
const startedAt = new Date();
const made = { inquiries: [], installations: [], items: [], logs: [], parties: [], journals: [], runs: [], salesDocs: [], locks: [], phones: [] };
let digestSettingBefore = null;

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/migration/runs`).catch(() => null);
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
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const TODAY = daysAgo(0);

let acct = {};
const postManual = async (date, lines, narration = 'ZZ M6') => {
  const r = await call('POST', '/accounting/journals', {
    date, narration,
    lines: lines.map(([code, debit, credit, party]) => ({ account_id: acct[code], debit: debit || 0, credit: credit || 0, party_id: party || null })),
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  made.journals.push(r.body.id);
  return r.body;
};
const net = async (ids) => {
  const [rows] = await db.query(
    `SELECT a.code, SUM(jl.debit_paise - jl.credit_paise) AS bal FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id
       JOIN accounts a ON a.id = jl.account_id WHERE j.source_id IN (?) GROUP BY a.code`, [ids]
  );
  return Object.fromEntries(rows.map((r) => [r.code, Number(r.bal)]));
};
const partyBalance = async (id) => Number((await db.query('SELECT COALESCE(SUM(debit_paise - credit_paise), 0) AS b FROM journal_lines WHERE party_id = ?', [id]))[0][0].b);
const checkOf = (snap, key) => snap.checks.find((c) => c.key === key);

const ticket = async (over = {}, kind = 'inquiry') => {
  const id = randomUUID();
  const phone = over.phone || `90006${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;
  made.phones.push(phone);
  if (kind === 'inquiry') {
    await db.query('INSERT INTO inquiries SET ?', [{
      id, full_name: over.name || 'ZZ M6 Customer', phone, ticket_no: `ZZM6-${id.slice(0, 6)}`, service_item: 'CCTV repair', location: 'Srinagar',
      bill_total: 1180, gst_amount: 180, discount_amount: 0, bill_amount: 1000, payment_status: 'unpaid', status: 'resolved', ...over.row,
    }]);
    made.inquiries.push(id);
  }
  return { id, phone, ticket_no: `ZZM6-${id.slice(0, 6)}` };
};

test('set up: accounts, a business with a state, and the ledger starting today', { skip }, async () => {
  const accounts = await get('/accounting/accounts');
  acct = Object.fromEntries(accounts.map((a) => [a.code, a.id]));
  const [[biz]] = await db.query('SELECT * FROM businesses WHERE is_default = 1 LIMIT 1');
  businessBefore = biz;
  businessId = biz.id;
  await db.query(`UPDATE businesses SET state_code = '01', state_name = 'Jammu and Kashmir' WHERE id = ?`, [biz.id]);
  const [[s]] = await db.query("SELECT setting_value FROM app_settings WHERE setting_key = 'last_owner_digest'");
  digestSettingBefore = s ? s.setting_value : null;
  assert.equal((await call('PUT', '/service-ledger/settings', { from: TODAY })).status, 200);
});

test('a technician cannot reach the migration tools, the summary or the reminders', { skip }, async () => {
  for (const [m, p] of [['GET', '/migration/tickets/preview?from=2020-01-01'], ['POST', '/migration/tickets/apply'], ['GET', '/migration/stock/preview'],
    ['POST', '/migration/stock/apply'], ['GET', '/migration/service-log/preview'], ['POST', '/migration/service-log/apply'], ['GET', '/migration/runs'],
    ['PUT', '/migration/automation'], ['POST', '/migration/automation/send-now'], ['GET', '/reports/owner-summary'], ['GET', '/reports/reminders'], ['POST', '/reports/reminders/mark']]) {
    assert.equal((await call(m, p, m === 'GET' ? null : {}, 'employee')).status, 403, `${m} ${p}`);
  }
});

// ── 1. tickets billed before the ledger started ────────────────────────

let tA; let tB; let tC; let tE;

test('the preview of older tickets counts what would be posted and writes nothing', { skip }, async () => {
  tA = await ticket({ name: 'ZZ M6 Paid Online', row: { bill_generated_at: `${daysAgo(40)} 10:00:00`, payment_status: 'paid', payment_method: 'razorpay', payment_received_at: `${daysAgo(38)} 10:00:00` } });
  tB = await ticket({ name: 'ZZ M6 Owes Us', row: { bill_total: 2360, gst_amount: 360, bill_amount: 2000, bill_generated_at: `${daysAgo(100)} 10:00:00` } });
  tC = await ticket({ name: 'ZZ M6 Cash Carried', row: { bill_total: 590, gst_amount: 90, bill_amount: 500, bill_generated_at: `${daysAgo(40)} 11:00:00`, payment_status: 'paid', payment_method: 'cash', payment_received_at: `${daysAgo(40)} 12:00:00`, cash_collected_at: `${daysAgo(40)} 12:00:00` } });
  tE = await ticket({ name: 'ZZ M6 Invoiced', row: { bill_generated_at: `${daysAgo(40)} 12:00:00` } });
  const doc = randomUUID();
  await db.query('INSERT INTO sales_documents SET ?', [{ id: doc, business_id: businessId, doc_type: 'invoice', doc_no: 'ZZ-M6-INV', doc_date: daysAgo(40), status: 'issued', source_type: 'inquiry', source_id: tE.id, taxable_paise: 100000, total_paise: 118000 }]);
  made.salesDocs.push(doc);

  const [[before]] = await db.query('SELECT COUNT(*) AS n FROM service_ledger_links');
  const p = await get(`/migration/tickets/preview?from=${daysAgo(120)}`);
  assert.equal(p.current_from, TODAY);
  assert.equal(p.totals.tickets, 3, 'three tickets qualify');
  assert.equal(p.totals.billed_paise, 118000 + 236000 + 59000);
  assert.equal(p.totals.collected_paise, 118000 + 59000);
  assert.equal(p.totals.outstanding_paise, 236000, 'only the unpaid one is still owed');
  assert.equal(p.totals.with_technicians_paise, 59000, 'and the cash a technician is carrying');
  assert.equal(p.totals.tax_paise, 18000 + 36000 + 9000);
  assert.equal(p.months.length, 2, 'two different months');
  assert.ok(p.skipped.some((s) => s.reason === 'Already invoiced through Sales' && s.count >= 1), 'one was invoiced through Sales, so it is left to Sales');
  assert.equal((await db.query('SELECT COUNT(*) AS n FROM service_ledger_links'))[0][0].n, before.n, 'a preview writes nothing');

  const bad = await call('GET', `/migration/tickets/preview?from=${TODAY}`);
  assert.equal(bad.status, 400, 'a date that is not earlier than the current start is refused');
  assert.equal((await call('GET', '/migration/tickets/preview?from=nonsense')).status, 400);
});

test('a closed period blocks its tickets, says so up front, and the rest are posted anyway', { skip }, async () => {
  const lockId = randomUUID();
  await db.query('INSERT INTO period_locks SET ?', [{ id: lockId, business_id: businessId, locked_upto: daysAgo(90), reason: 'ZZ M6 test' }]);
  made.locks.push(lockId);

  const p = await get(`/migration/tickets/preview?from=${daysAgo(120)}`);
  assert.equal(p.totals.in_closed_period, 1, 'the ticket billed 100 days ago');
  assert.ok(p.warnings.some((w) => /closed accounting period/.test(w)));

  const done = await call('POST', '/migration/tickets/apply', { from: daysAgo(120) });
  assert.equal(done.status, 201, JSON.stringify(done.body));
  made.runs.push(done.body.run_id);
  assert.equal(done.body.status, 'complete');
  assert.equal(done.body.posted, 2, 'the two that could be posted');
  assert.equal(done.body.blocked, 1, 'and the one that could not');

  const [[link]] = await db.query('SELECT status, note FROM service_ledger_links WHERE source_id = ?', [tB.id]);
  assert.equal(link.status, 'blocked');
  assert.match(link.note, /closed up to/);

  await db.query('DELETE FROM period_locks WHERE id = ?', [lockId]);
  await call('POST', '/service-ledger/sync');
  const [[after]] = await db.query('SELECT status FROM service_ledger_links WHERE source_id = ?', [tB.id]);
  assert.equal(after.status, 'synced', 'once the lock is lifted the ordinary sweep brings it in');
});

test('the older tickets land on their own dates, and the books agree afterwards', { skip }, async () => {
  const a = await net([tA.id]);
  assert.equal(a['1010'], 118000, 'paid online → bank');
  assert.equal(a['1100'] || 0, 0, 'and nothing owed');
  assert.equal(a['4010'], -100000);
  const [[incomeA]] = await db.query(`SELECT j.journal_date FROM journals j JOIN service_ledger_links l ON l.income_journal_id = j.id WHERE l.source_id = ?`, [tA.id]);
  assert.equal(iso(new Date(incomeA.journal_date)), daysAgo(40), 'posted on the day it was billed, not today');

  const b = await net([tB.id]);
  assert.equal(b['1100'], 236000, 'the customer still owes it');
  const c = await net([tC.id]);
  assert.equal(c['1020'], 59000, 'cash still in a technician\'s pocket');
  assert.equal(await net([tE.id]).then((n) => Object.keys(n).length), 0, 'the invoiced ticket was not posted from the ticket');

  const oldest = (await get(`/reports/ageing?kind=receivable&as_on=${TODAY}`)).parties.find((p) => p.party === 'ZZ M6 Owes Us');
  assert.equal(oldest.d90_plus, 236000, 'and it shows as a 100-day-old debt');
  const health = await get(`/reports/reconciliation?as_on=${TODAY}`);
  for (const k of ['trial_balance', 'balance_sheet', 'receivable', 'technician_cash']) {
    assert.equal(health.checks.find((x) => x.key === k).ok, true, k);
  }
});

test('the run keeps the books\' checks from before and after', { skip }, async () => {
  const runs = await get('/migration/runs');
  const run = runs.find((r) => r.id === made.runs[0]);
  assert.equal(run.kind, 'tickets');
  assert.equal(run.summary.expected.tickets, 3);
  assert.ok(Array.isArray(run.before.checks) && Array.isArray(run.after.checks));
  assert.ok(checkOf(run.before, 'trial_balance').ok && checkOf(run.after, 'trial_balance').ok);

  const again = await call('POST', '/migration/tickets/apply', { from: daysAgo(120) });
  assert.equal(again.status, 400, 'it cannot be done twice');
});

// ── 2. stock already on the shelf ──────────────────────────────────────

let L1; let L2; let L3; let L4;

test('stock the books were never told about is listed, and stock that is wrong is flagged, not hidden', { skip }, async () => {
  const mk = async (name, quantity, avg, value) => {
    const id = randomUUID();
    await db.query('INSERT INTO inventory_items SET ?', [{ id, sku: `ZZM6-${id.slice(0, 5)}`, name, unit: 'pcs', base_unit: 'pcs', purchase_rate: avg / 100, selling_rate: avg / 50, quantity, avg_cost_paise: avg, stock_value_paise: value, business_id: businessId }]);
    made.items.push(id);
    return id;
  };
  const move = (item, type, q, value) => db.query('INSERT INTO inventory_movements SET ?', [{ id: randomUUID(), item_id: item, type, quantity: q, value_paise: value, business_id: businessId }]);

  L1 = await mk('ZZ M6 Shelf Only', 10, 5000, 50000);                      // on the shelf, no history at all
  L2 = await mk('ZZ M6 Old System', 7, 5000, 35000);                       // old movements that carried quantity but no value
  await move(L2, 'purchase', 10, null); await move(L2, 'consume', -3, null);
  L3 = await mk('ZZ M6 Overcounted', 2, 1000, 2000);                      // history says 5, the shelf says 2
  await move(L3, 'purchase', 5, 5000);
  L4 = await mk('ZZ M6 Already Fine', 4, 1000, 4000);                     // the books already know about it
  await move(L4, 'purchase', 4, 4000);

  const p = await get('/migration/stock/preview');
  const b = (id) => p.bookable.find((r) => r.item_id === id);
  assert.equal(b(L1).unbooked_qty, 10);
  assert.equal(b(L1).unbooked_value_paise, 50000);
  assert.equal(b(L2).unbooked_qty, 0, 'its quantity was already in its movements');
  assert.equal(b(L2).unbooked_value_paise, 35000, 'but its value never was');
  assert.equal(b(L4), undefined, 'an item the books know is left alone');
  const flagged = p.flagged.find((r) => r.item_id === L3);
  assert.ok(flagged, 'the overcounted item is flagged');
  assert.match(flagged.reason, /more stock than is recorded/);
  assert.equal(p.bookable.find((r) => r.item_id === L3), undefined, 'and not booked');
});

test('bringing stock in adds it to the books without touching the stock itself', { skip }, async () => {
  const inv = async () => Number((await db.query(`SELECT COALESCE(SUM(l.debit_paise - l.credit_paise), 0) AS b FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE a.code = '1200'`))[0][0].b);
  const ledgerBefore = await inv();

  assert.equal((await call('POST', '/migration/stock/apply', { date: TODAY, item_ids: [] })).status, 400, 'choosing nothing books nothing');
  const r = await call('POST', '/migration/stock/apply', { date: TODAY, item_ids: [L1, L2] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  made.runs.push(r.body.run_id);
  assert.equal(r.body.items, 2);
  assert.equal(r.body.value_paise, 85000);

  assert.equal(await inv() - ledgerBefore, 85000, 'the Inventory account grew by exactly that');
  const [lines] = await db.query(`SELECT a.code, jl.debit_paise, jl.credit_paise FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id WHERE jl.journal_id = ?`, [r.body.journal_id]);
  assert.equal(Number(lines.find((l) => l.code === '1200').debit_paise), 85000);
  assert.equal(Number(lines.find((l) => l.code === '3100').credit_paise), 85000, 'against Opening Balance Equity');
  made.journals.push(r.body.journal_id);

  const [[item]] = await db.query('SELECT quantity, avg_cost_paise, stock_value_paise FROM inventory_items WHERE id = ?', [L1]);
  assert.equal(Number(item.quantity), 10, 'the shelf count did not change');
  assert.equal(Number(item.stock_value_paise), 50000);

  const valuation = await get('/stock/valuation');
  assert.equal(valuation.items.find((i) => i.id === L1).quantity_matches, true, 'the item and its history now agree');
  assert.equal(valuation.items.find((i) => i.id === L2).quantity_matches, true);

  assert.equal(checkOf(r.body.before, 'inventory').difference_paise - checkOf(r.body.after, 'inventory').difference_paise, 85000,
    'the health check\'s gap closed by exactly what was booked');

  const p = await get('/migration/stock/preview');
  assert.equal(p.bookable.some((x) => [L1, L2].includes(x.item_id)), false, 'nothing left to book for them');
  assert.equal((await call('POST', '/migration/stock/apply', { date: TODAY, item_ids: [L1, L2] })).status, 400, 'and it cannot be done twice');
});

// ── 3. the service register ────────────────────────────────────────────

let S = {};

test('register entries that are not on a ticket are listed; the rest are left to their tickets', { skip }, async () => {
  const log = async (key, o) => {
    const id = randomUUID();
    await db.query('INSERT INTO service_logs SET ?', [{ id, log_date: daysAgo(20), customer_name: 'ZZ M6 Log Customer', customer_phone: '9000060001', service_type: 'DVR repair', amount: 1500, payment_status: 'paid', technician_name: 'ZZ Tech', ...o }]);
    made.logs.push(id);
    S[key] = id;
  };
  await log('paid', { amount: 1500, payment_status: 'paid' });
  await log('owed', { amount: 800, payment_status: 'pending', log_date: daysAgo(10) });
  await log('onTicket', { inquiry_id: tA.id, ticket_no: tA.ticket_no });
  await log('byNumber', { ticket_no: tB.ticket_no });
  await log('free', { amount: 0 });

  const p = await get('/migration/service-log/preview');
  const ids = p.candidates.map((c) => c.id);
  assert.ok(ids.includes(S.paid) && ids.includes(S.owed));
  for (const k of ['onTicket', 'byNumber', 'free']) assert.equal(ids.includes(S[k]), false, `${k} is not a candidate`);
  assert.ok(p.counts.on_a_ticket >= 2, 'entries already on a ticket, by link or by number');
  assert.ok(p.counts.no_amount >= 1);
  assert.match(p.note, /no GST/);
});

test('booking register entries posts income on the day written, and only once', { skip }, async () => {
  const bad = await call('POST', '/migration/service-log/apply', { ids: [S.paid], paid_into: 'wallet' });
  assert.equal(bad.status, 400);

  const r = await call('POST', '/migration/service-log/apply', { ids: [S.paid, S.owed, S.onTicket], paid_into: 'bank' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  made.runs.push(r.body.run_id);
  assert.equal(r.body.posted, 2);
  assert.equal(r.body.failed, 1);
  assert.equal(r.body.results.find((x) => x.id === S.onTicket).ok, false, 'a ticket\'s entry is refused, not double-counted');
  assert.equal(r.body.billed_paise, 150000 + 80000);
  assert.equal(r.body.collected_paise, 150000);

  const n = await net([S.paid, S.owed]);
  assert.equal(n['4010'], -230000, 'service income');
  assert.equal(n['1010'], 150000, 'the paid one reached the bank');
  assert.equal(n['1100'], 80000, 'the pending one is a receivable');
  const [[mi]] = await db.query('SELECT party_id FROM migration_items WHERE source_id = ?', [S.owed]);
  assert.equal(await partyBalance(mi.party_id), 80000, 'the customer owes what the register says');
  const [[j]] = await db.query(`SELECT j.journal_date FROM journals j JOIN migration_items m ON m.income_journal_id = j.id WHERE m.source_id = ?`, [S.owed]);
  assert.equal(iso(new Date(j.journal_date)), daysAgo(10), 'dated the day the register says');

  const again = await call('POST', '/migration/service-log/apply', { ids: [S.paid], paid_into: 'bank' });
  assert.equal(again.body.posted, 0, 'the same entry is not booked twice');
  const p = await get('/migration/service-log/preview');
  assert.ok(p.counts.already_in >= 2);
});

test('an entry in a closed period fails alone; the others go through', { skip }, async () => {
  const mk = async (date) => {
    const id = randomUUID();
    await db.query('INSERT INTO service_logs SET ?', [{ id, log_date: date, customer_name: 'ZZ M6 Locked Customer', customer_phone: '9000060002', amount: 500, payment_status: 'pending' }]);
    made.logs.push(id);
    return id;
  };
  const old = await mk(daysAgo(30));
  const recent = await mk(daysAgo(3));
  const lockId = randomUUID();
  await db.query('INSERT INTO period_locks SET ?', [{ id: lockId, business_id: businessId, locked_upto: daysAgo(25), reason: 'ZZ M6 test' }]);
  made.locks.push(lockId);
  const r = await call('POST', '/migration/service-log/apply', { ids: [old, recent], paid_into: 'cash' });
  made.runs.push(r.body.run_id);
  assert.equal(r.body.posted, 1);
  assert.equal(r.body.failed, 1);
  assert.match(r.body.results.find((x) => x.id === old).error, /closed up to/);
  assert.equal(r.body.results.find((x) => x.id === recent).ok, true);
  assert.equal(Object.keys(await net([old])).length, 0, 'nothing half-posted for the one that failed');
  await db.query('DELETE FROM period_locks WHERE id = ?', [lockId]);
});

// ── the owner's summary and the reminders ──────────────────────────────

let debtor;

test('the owner summary moves by what is posted, and money handed in does not count as money collected', { skip }, async () => {
  const before = await get(`/reports/owner-summary?on=${TODAY}`);
  const p = await call('POST', '/parties', { display_name: 'ZZ M6 Debtor', kind: 'customer', phone: '90000 70007', place_of_supply_state_code: '01' });
  debtor = p.body.id;
  made.parties.push(debtor);

  await postManual(daysAgo(60), [['1100', 4000, 0, debtor], ['4010', 0, 4000]], 'ZZ M6 old charge');
  await postManual(daysAgo(5), [['1100', 1000, 0, debtor], ['4010', 0, 1000]], 'ZZ M6 recent charge');
  await postManual(TODAY, [['1000', 2000], ['1100', 0, 2000, debtor]], 'ZZ M6 payment');
  await postManual(TODAY, [['1000', 500], ['1020', 0, 500]], 'ZZ M6 cash handed in');   // no receivable — not a collection
  await postManual(TODAY, [['1100', 700, 0, debtor], ['4010', 0, 700]], 'ZZ M6 sale today');

  const after = await get(`/reports/owner-summary?on=${TODAY}`);
  assert.equal(after.today.sales_paise - before.today.sales_paise, 70000, 'only today\'s sale is today\'s sales');
  assert.equal(after.today.collected_paise - before.today.collected_paise, 200000, 'the payment counts; the handover does not');
  assert.equal(after.receivable.total_paise - before.receivable.total_paise, 4000 * 100 + 1000 * 100 + 700 * 100 - 2000 * 100);
  assert.ok(after.receivable.overdue_paise - before.receivable.overdue_paise >= 200000, 'the old charge, less what was paid, is overdue');
  assert.match(after.text, /Customers ka baaki/);
  assert.equal(typeof after.attention.unposted_tickets, 'number');
  assert.equal(after.as_on, TODAY);
});

test('reminders list who is overdue, with a ready WhatsApp message, and remember who was reminded', { skip }, async () => {
  const list = await get(`/reports/reminders?as_on=${TODAY}`);
  const c = list.customers.find((x) => x.party_id === debtor);
  assert.ok(c, 'the debtor is listed');
  assert.equal(c.overdue_paise, 200000, '2,000 of the 4,000 charge is still unpaid after 60 days');
  assert.equal(c.outstanding_paise, 370000, '4,000 + 1,000 + 700 billed, 2,000 paid');
  assert.ok(c.oldest_days >= 60);
  assert.match(c.whatsapp_url, /^https:\/\/wa\.me\/919000070007\?text=/);
  const text = decodeURIComponent(c.whatsapp_url.split('text=')[1]);
  assert.match(text, /ZZ M6 Debtor/);
  assert.match(text, /₹3,700/, 'the whole amount pending');
  assert.equal(c.last_reminded_at, null);
  assert.ok(list.scope.basis.includes('Nothing is sent from here'), 'the page says it sends nothing');

  const mark = await call('POST', '/reports/reminders/mark', { party_id: debtor, amount_paise: c.outstanding_paise, channel: 'whatsapp' });
  assert.equal(mark.status, 201);
  assert.equal((await call('POST', '/reports/reminders/mark', { party_id: 'nope' })).status, 404);
  assert.equal((await call('POST', '/reports/reminders/mark', {})).status, 400);
  const again = (await get(`/reports/reminders?as_on=${TODAY}`)).customers.find((x) => x.party_id === debtor);
  assert.ok(again.last_reminded_at, 'remembered');
  assert.equal(again.times_reminded, 1);
  assert.equal(await partyBalance(debtor), 370000, 'reminding moves no money');
});

test('a customer without a usable phone is listed with no WhatsApp link', { skip }, async () => {
  const p = await call('POST', '/parties', { display_name: 'ZZ M6 No Phone', kind: 'customer', place_of_supply_state_code: '01' });
  made.parties.push(p.body.id);
  await postManual(daysAgo(50), [['1100', 100, 0, p.body.id], ['4010', 0, 100]], 'ZZ M6 no phone');
  const c = (await get(`/reports/reminders?as_on=${TODAY}`)).customers.find((x) => x.party_id === p.body.id);
  assert.equal(c.whatsapp_url, null);
});

// ── the evening digest ─────────────────────────────────────────────────

test('the digest can be sent on demand and switched off', { skip }, async () => {
  assert.equal((await get('/migration/automation')).owner_digest_on, true, 'on by default');
  const sent = await call('POST', '/migration/automation/send-now', {});
  assert.equal(sent.status, 200);
  assert.equal(sent.body.sent, true);
  assert.match(sent.body.text, /^Aaj: bikri/);
  const [[n]] = await db.query("SELECT COUNT(*) AS n FROM notifications WHERE subject = 'owner_summary' AND created_at >= ?", [new Date(startedAt.getTime() - 1000)]);
  assert.ok(n.n >= 1, 'it reached the admins\' notifications');

  assert.equal((await call('PUT', '/migration/automation', { owner_digest_on: false })).body.owner_digest_on, false);
  assert.equal((await get('/migration/automation')).owner_digest_on, false);
  await call('PUT', '/migration/automation', { owner_digest_on: true });
});

test('the evening job sends once a day, after eight, and only when it is on', { skip }, async () => {
  const migration = require('../server/modules/migration/service.cjs');
  const sentNotes = [];
  const getConn = async () => {
    const c = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
    c.release = () => c.end();
    return c;
  };
  const opts = { getConn, recordNotification: async (p) => { sentNotes.push(p); } };
  const at = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d; };
  await db.query("DELETE FROM app_settings WHERE setting_key = 'last_owner_digest'");

  assert.equal((await migration.sendDigest({ ...opts, now: at(14) })).why, 'Not evening yet');
  await call('PUT', '/migration/automation', { owner_digest_on: false });
  assert.equal((await migration.sendDigest({ ...opts, now: at(21) })).why, 'Switched off');
  await call('PUT', '/migration/automation', { owner_digest_on: true });

  const first = await migration.sendDigest({ ...opts, now: at(21) });
  assert.equal(first.sent, true);
  assert.equal(sentNotes.length, 1);
  assert.equal(sentNotes[0].audience.role, 'admin');
  assert.equal((await migration.sendDigest({ ...opts, now: at(22) })).why, 'Already sent today', 'not twice in one day');
  assert.equal(sentNotes.length, 1);
});

test.after(async () => {
  if (!db) return;
  try { await cleanUp(); } finally { await db.end(); }
});

async function cleanUp() {
  await call('PUT', '/service-ledger/settings', { from: null });
  await call('POST', '/service-ledger/sync');

  const tickets = [...made.inquiries, ...made.installations];
  const [links] = await db.query(`SELECT source_id FROM service_ledger_links WHERE ticket_ref LIKE 'ZZM6-%'`);
  const svc = [...new Set([...tickets, ...links.map((l) => l.source_id)])];
  const [mig] = made.logs.length ? await db.query('SELECT * FROM migration_items WHERE source_id IN (?)', [made.logs]) : [[]];
  const jids = [...made.journals];
  const sources = [...svc, ...made.logs];
  if (sources.length) {
    const [js] = await db.query('SELECT id FROM journals WHERE source_id IN (?)', [sources]);
    jids.push(...js.map((j) => j.id));
  }
  const [opening] = await db.query("SELECT id FROM journals WHERE narration LIKE 'Opening stock brought into the books%' AND journal_date = ?", [TODAY]);
  jids.push(...opening.map((j) => j.id));
  if (jids.length) {
    const [rev] = await db.query('SELECT id FROM journals WHERE reversal_of_id IN (?) OR reversed_by_id IN (?)', [jids, jids]);
    const all = [...new Set([...jids, ...rev.map((r) => r.id)])];
    await db.query('UPDATE journals SET reversed_by_id = NULL, reversal_of_id = NULL WHERE id IN (?)', [all]);
    await db.query('DELETE FROM journal_lines WHERE journal_id IN (?)', [all]);
    await db.query('DELETE FROM journals WHERE id IN (?)', [all]);
  }
  if (svc.length) await db.query('DELETE FROM service_ledger_links WHERE source_id IN (?)', [svc]);
  if (made.logs.length) {
    await db.query("DELETE FROM migration_items WHERE source_type = 'service_log' AND source_id IN (?)", [made.logs]);
    await db.query('DELETE FROM service_logs WHERE id IN (?)', [made.logs]);
  }
  void mig;
  if (made.items.length) {
    await db.query('DELETE FROM inventory_movements WHERE item_id IN (?)', [made.items]);
    await db.query('DELETE FROM inventory_items WHERE id IN (?)', [made.items]);
  }
  if (made.salesDocs.length) await db.query('DELETE FROM sales_documents WHERE id IN (?)', [made.salesDocs]);
  if (tickets.length) await db.query('DELETE FROM inquiries WHERE id IN (?)', [tickets]);
  for (const id of made.runs) await db.query('DELETE FROM migration_runs WHERE id = ?', [id]);
  await db.query('DELETE FROM migration_runs WHERE created_at >= ?', [new Date(startedAt.getTime() - 1000)]);

  const [parties] = await db.query(`SELECT id FROM parties WHERE display_name LIKE 'ZZ M6%'`);
  for (const id of [...made.parties, ...parties.map((p) => p.id)]) {
    await db.query('DELETE FROM payment_reminders WHERE party_id = ?', [id]);
    await db.query('DELETE FROM journal_lines WHERE party_id = ?', [id]);
    await db.query('DELETE FROM parties WHERE id = ?', [id]);
  }
  await db.query("DELETE FROM notifications WHERE subject = 'owner_summary' AND created_at >= ?", [new Date(startedAt.getTime() - 1000)]);
  await db.query("DELETE FROM audit_log WHERE action IN ('migration.tickets', 'migration.stock', 'migration.service_log', 'automation.owner_digest', 'service_ledger.settings') AND created_at >= ?", [new Date(startedAt.getTime() - 1000)]).catch(() => {});
  for (const id of made.locks) await db.query('DELETE FROM period_locks WHERE id = ?', [id]);
  if (digestSettingBefore === null) await db.query("DELETE FROM app_settings WHERE setting_key = 'last_owner_digest'");
  else await db.query("INSERT INTO app_settings (setting_key, setting_value) VALUES ('last_owner_digest', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)", [digestSettingBefore]);
  if (businessBefore) {
    await db.query(
      'UPDATE businesses SET state_code = ?, state_name = ?, service_ledger_from = ?, owner_digest_on = ? WHERE id = ?',
      [businessBefore.state_code, businessBefore.state_name, businessBefore.service_ledger_from ?? null, businessBefore.owner_digest_on ?? 1, businessBefore.id]
    );
  }
}
