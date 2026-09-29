// Service and installation money in the books.
//
//   node --test tests/service-ledger.test.mjs
//
// The first group is arithmetic and needs nothing. The second walks real
// tickets through billing, payment, cash handover, revision and deletion
// against the local API and test database, and skips without them. Everything
// it creates is removed at the end.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const { describe } = require('../server/modules/service-ledger/service.cjs');
const API = 'http://127.0.0.1:5000/api';

// ── the arithmetic ──────────────────────────────────────────────────────

const FROM = '2026-09-01';
const bill = (over = {}) => ({
  bill_total: '1729.00', gst_amount: '279.00', discount_amount: '100.00',
  bill_generated_at: '2026-09-29 10:00:00', created_at: '2026-09-29 09:00:00',
  payment_status: 'unpaid', payment_method: null,
  ...over,
});

test('a bill is split back into what was sold, its GST and its discount', () => {
  const d = describe('inquiry', bill(), { itemsPaise: 50000, from: FROM });
  assert.equal(d.eligible, true);
  assert.deepEqual(d.income, { total: 172900, discount: 10000, tax: 27900, goods: 50000, services: 105000, date: '2026-09-29' });
  // Dr receivable + discount = Cr goods + services + tax
  assert.equal(d.income.total + d.income.discount, d.income.goods + d.income.services + d.income.tax);
  assert.equal(d.collect, null, 'unpaid means nothing collected');
});

test('goods can never exceed what was sold', () => {
  const d = describe('inquiry', bill(), { itemsPaise: 99999999, from: FROM });
  assert.equal(d.income.services, 0);
  assert.equal(d.income.goods, 172900 + 10000 - 27900);
});

test('where the money lands depends on how it was paid', () => {
  const online = describe('inquiry', bill({ payment_status: 'paid', payment_method: 'razorpay', payment_received_at: '2026-09-29 12:00:00' }), { from: FROM });
  assert.equal(online.collect.where, 'bank');

  const noMethod = describe('inquiry', bill({ payment_status: 'paid' }), { from: FROM });
  assert.equal(noMethod.collect.where, 'bank', 'a payment link settles online');

  const office = describe('inquiry', bill({ payment_status: 'paid', payment_method: 'cash' }), { from: FROM });
  assert.equal(office.collect.where, 'office', 'cash nobody carried out goes straight into the till');

  const carried = describe('inquiry', bill({ payment_status: 'paid', payment_method: 'cash', cash_collected_at: '2026-09-29 13:00:00' }), { from: FROM });
  assert.equal(carried.collect.where, 'technician');
  assert.equal(carried.handover, null, 'still in the technician\'s pocket');

  const handed = describe('inquiry', bill({ payment_status: 'paid', payment_method: 'cash', cash_collected_at: '2026-09-29 13:00:00', cash_submitted_at: '2026-09-30 09:00:00' }), { from: FROM });
  assert.equal(handed.handover.date, '2026-09-30');
  assert.notEqual(handed.sigs.handover, null);
});

test('an installation has no handover step, and its labour is not a repair', () => {
  const d = describe('installation', {
    bill_total: '11800.00', gst_amount: '1800.00', items_total: '7000.00', labour_charge: '3000.00',
    bill_generated_at: '2026-09-29 10:00:00', payment_status: 'paid', payment_method: 'cash',
    payment_received_at: '2026-09-29 11:00:00', cash_collected_at: '2026-09-29 11:00:00',
  }, { from: FROM });
  assert.equal(d.income.goods, 700000);
  assert.equal(d.income.services, 300000);
  assert.equal(d.collect.where, 'office', 'installations do not track cash carried by the technician');
  assert.equal(d.handover, null);
});

test('things that must not be posted are turned away with a reason', () => {
  assert.equal(describe('inquiry', bill({ bill_total: '0' }), { from: FROM }).eligible, false);
  assert.equal(describe('inquiry', bill({ payment_status: 'foc' }), { from: FROM }).eligible, false);
  const early = describe('inquiry', bill({ bill_generated_at: '2026-08-31 10:00:00' }), { from: FROM });
  assert.equal(early.eligible, false);
  assert.equal(early.before, true, 'before the start date is old money, not a mistake');
  assert.equal(describe('inquiry', bill(), { from: null }).eligible, false, 'no start date means the feature is off');
  assert.equal(describe('inquiry', bill({ bill_total: '100', gst_amount: '500', discount_amount: '0' }), { from: FROM }).eligible, false,
    'a total smaller than its own GST cannot be true');
});

test('a paid date earlier than the bill is moved up to the bill', () => {
  const d = describe('inquiry', bill({ payment_status: 'paid', payment_received_at: '2026-09-01 08:00:00' }), { from: FROM });
  assert.equal(d.collect.date, '2026-09-29', 'the receivable must exist before it is settled');
});

test('any change to a bill changes its signature, and no change does not', () => {
  const a = describe('inquiry', bill(), { from: FROM });
  const b = describe('inquiry', bill(), { from: FROM });
  const c = describe('inquiry', bill({ bill_total: '1800.00', gst_amount: '279.00' }), { from: FROM });
  assert.equal(a.sigs.income, b.sigs.income);
  assert.notEqual(a.sigs.income, c.sigs.income);
});

// ── against the database ────────────────────────────────────────────────

let mysql; let jwt; let db; let tokens; let reachable = false;
let businessBefore = null;
const made = { inquiries: [], installations: [], locks: [], phones: [] };

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/service-ledger/status`).catch(() => null);
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

const sync = async () => (await call('POST', '/service-ledger/sync')).body;
const TODAY = '2026-09-29';

// Net effect, per account, of everything posted for these tickets (reversals
// included, so a reversed entry nets to nothing).
const net = async (ids) => {
  const [rows] = await db.query(
    `SELECT a.code, SUM(jl.debit_paise - jl.credit_paise) AS bal
       FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id JOIN accounts a ON a.id = jl.account_id
      WHERE j.source_id IN (?) GROUP BY a.code`, [ids]
  );
  return Object.fromEntries(rows.map((r) => [r.code, Number(r.bal)]));
};
const linkOf = async (id) => (await db.query('SELECT * FROM service_ledger_links WHERE source_id = ?', [id]))[0][0];
const linesOf = async (journalId) => (await db.query(
  `SELECT a.code, jl.debit_paise, jl.credit_paise, jl.party_id FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id WHERE jl.journal_id = ?`, [journalId]
))[0].map((l) => ({ code: l.code, dr: Number(l.debit_paise), cr: Number(l.credit_paise), party: l.party_id }));
const partyBalance = async (partyId) => Number((await db.query(
  'SELECT COALESCE(SUM(debit_paise - credit_paise), 0) AS b FROM journal_lines WHERE party_id = ?', [partyId]
))[0][0].b);
const at = (sql, params) => db.query(sql, params);

// As in the app, the bill's items are saved before the ticket carries its
// total, so a sweep can never see one without the other.
const ticket = async (over = {}, items = []) => {
  const id = randomUUID();
  for (const [name, quantity, rate] of items) {
    await db.query(
      `INSERT INTO bill_items (id, ref_type, ref_id, name, quantity, rate, amount) VALUES (?, 'inquiry', ?, ?, ?, ?, ?)`,
      [randomUUID(), id, name, quantity, rate, quantity * rate]
    );
  }
  const phone = over.phone || `90000${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;
  made.phones.push(phone);
  await db.query('INSERT INTO inquiries SET ?', [{
    id, full_name: 'ZZ Ledger Customer', phone, ticket_no: `ZZL-${id.slice(0, 8)}`,
    service_item: 'CCTV repair', location: 'Srinagar',
    bill_total: 1729, gst_amount: 279, discount_amount: 100, bill_amount: 1550,
    bill_generated_at: `${TODAY} 10:00:00`, payment_status: 'unpaid', status: 'resolved',
    ...over,
  }]);
  made.inquiries.push(id);
  return { id, phone };
};

let main; let party; let netBefore;

test('set up: the ledger starts today, in a business with a state', { skip }, async () => {
  const [[biz]] = await db.query('SELECT * FROM businesses WHERE is_default = 1 LIMIT 1');
  businessBefore = biz;
  await db.query(`UPDATE businesses SET state_code = '01', state_name = 'Jammu and Kashmir' WHERE id = ?`, [biz.id]);

  const denied = await call('POST', '/service-ledger/sync', {}, 'employee');
  assert.equal(denied.status, 403, 'a technician cannot run it');

  const set = await call('PUT', '/service-ledger/settings', { from: TODAY });
  assert.equal(set.status, 200);
  assert.equal(set.body.from, TODAY);
  const bad = await call('PUT', '/service-ledger/settings', { from: 'not a date' });
  assert.equal(bad.status, 400);
  await call('PUT', '/service-ledger/settings', { from: TODAY });
});

test('a billed ticket becomes a receivable with its sales, GST and discount', { skip }, async () => {
  main = await ticket({}, [['ZZ Camera', 2, 250]]);
  // The server's own sweep may get to the ticket first; either way it must
  // end up posted, so the ticket is checked rather than the count.
  await sync();

  const link = await linkOf(main.id);
  assert.equal(link.status, 'synced');
  assert.ok(link.income_journal_id, 'the bill was posted');
  assert.equal(link.collect_journal_id, null, 'nothing was paid');

  const by = Object.fromEntries((await linesOf(link.income_journal_id)).map((l) => [l.code, l]));
  assert.equal(by['1100'].dr, 172900, 'the customer owes the bill total');
  assert.equal(by['4900'].dr, 10000, 'the discount is shown, not hidden');
  assert.equal(by['4000'].cr, 50000, 'the parts');
  assert.equal(by['4010'].cr, 105000, 'the service');
  assert.equal(by['2100'].cr, 13950, 'half the GST is central');
  assert.equal(by['2110'].cr, 13950, 'and half is state');
  assert.ok(by['1100'].party, 'the receivable is against the customer');

  party = by['1100'].party;
  const [[p]] = await db.query('SELECT display_name, phone FROM parties WHERE id = ?', [party]);
  assert.equal(p.display_name, 'ZZ Ledger Customer');
  assert.equal(await partyBalance(party), 172900, 'the customer\'s ledger shows what they owe');
});

test('syncing again changes nothing', { skip }, async () => {
  const before = await linkOf(main.id);
  const out = await sync();
  assert.equal(out.checked, 0, 'nothing has moved, so nothing is looked at twice');
  const after = await linkOf(main.id);
  assert.equal(after.income_journal_id, before.income_journal_id);
  assert.equal(after.income_ver, before.income_ver);
});

test('paying online moves the money into the bank and clears the debt', { skip }, async () => {
  netBefore = await net([main.id]);
  await at(`UPDATE inquiries SET payment_status = 'paid', payment_method = 'razorpay', payment_received_at = ? WHERE id = ?`, [`${TODAY} 12:00:00`, main.id]);
  await sync();
  const link = await linkOf(main.id);
  assert.ok(link.collect_journal_id);
  const lines = await linesOf(link.collect_journal_id);
  assert.equal(lines.find((l) => l.code === '1010').dr, 172900, 'bank');
  assert.equal(lines.find((l) => l.code === '1100').cr, 172900, 'receivable');
  assert.equal(await partyBalance(party), 0, 'paid up');
});

test('cash a technician is carrying stays out of the till until it is handed in', { skip }, async () => {
  await at(`UPDATE inquiries SET payment_method = 'cash', cash_collected_at = ? WHERE id = ?`, [`${TODAY} 13:00:00`, main.id]);
  await sync();
  let n = await net([main.id]);
  assert.equal(n['1010'] || 0, 0, 'the earlier online entry was reversed, not left standing');
  assert.equal(n['1020'], 172900, 'the technician is holding it');
  assert.equal(n['1000'] || 0, 0, 'the till has not got it');
  assert.equal(await partyBalance(party), 0);

  await at(`UPDATE inquiries SET cash_submitted_at = ? WHERE id = ?`, [`${TODAY} 18:00:00`, main.id]);
  await sync();
  n = await net([main.id]);
  assert.equal(n['1020'] || 0, 0, 'the technician handed it in');
  assert.equal(n['1000'], 172900, 'the till has it');
  const link = await linkOf(main.id);
  assert.ok(link.handover_journal_id);
});

test('un-marking a payment puts the debt back', { skip }, async () => {
  await at(`UPDATE inquiries SET payment_status = 'unpaid', payment_method = NULL, cash_collected_at = NULL, cash_submitted_at = NULL, payment_received_at = NULL WHERE id = ?`, [main.id]);
  await sync();
  const n = await net([main.id]);
  assert.equal(n['1000'] || 0, 0);
  assert.equal(n['1020'] || 0, 0);
  assert.equal(n['1010'] || 0, 0);
  assert.equal(n['1100'], 172900, 'owed again');
  assert.equal(await partyBalance(party), 172900);
  const link = await linkOf(main.id);
  assert.equal(link.collect_journal_id, null);
  assert.equal(link.handover_journal_id, null);
});

test('a revised bill replaces the old one; the old stays visible as reversed', { skip }, async () => {
  const old = (await linkOf(main.id)).income_journal_id;
  await at(`UPDATE inquiries SET bill_total = 2100, gst_amount = 300, discount_amount = 0, bill_amount = 1800 WHERE id = ?`, [main.id]);
  await sync();
  const link = await linkOf(main.id);
  assert.notEqual(link.income_journal_id, old, 'a new journal, not an edit');
  const [[was]] = await db.query('SELECT status, reversed_by_id FROM journals WHERE id = ?', [old]);
  assert.equal(was.status, 'reversed');
  assert.ok(was.reversed_by_id, 'and it says what reversed it');
  assert.equal(await partyBalance(party), 210000);
  const n = await net([main.id]);
  assert.equal(n['4900'] || 0, 0, 'no discount any more');
  assert.equal(n['2100'], -15000);
});

test('free of cost work is not billed to the books', { skip }, async () => {
  const foc = await ticket({ bill_total: 0, gst_amount: 0, discount_amount: 0, payment_status: 'foc' });
  await sync();
  assert.equal(await linkOf(foc.id), undefined, 'no bill, no link');
});

test('tickets billed before the start date are left alone', { skip }, async () => {
  const old = await ticket({ bill_generated_at: '2026-01-05 10:00:00' });
  await sync();
  assert.equal(await linkOf(old.id), undefined, 'old money belongs in opening balances');
});

test('an installation paid in cash goes into the till, its labour as installation income', { skip }, async () => {
  const id = randomUUID();
  await db.query('INSERT INTO installations SET ?', [{
    id, ticket_no: `ZZL-I-${id.slice(0, 6)}`, full_name: 'ZZ Ledger Installer', phone: '9000099999',
    location: 'Srinagar', installation_type: 'CCTV', preferred_date: TODAY, preferred_time: '10am', address: 'Rajbagh',
    items_total: 7000, labour_charge: 3000, gst_applied: 1, gst_amount: 1800, bill_total: 11800,
    bill_generated_at: `${TODAY} 09:00:00`, payment_status: 'paid', payment_method: 'cash',
    payment_received_at: `${TODAY} 11:00:00`,
  }]);
  made.installations.push(id);
  made.phones.push('9000099999');
  await sync();
  const n = await net([id]);
  assert.equal(n['1000'], 1180000, 'the till');
  assert.equal(n['4000'], -700000, 'the parts');
  assert.equal(n['4020'], -300000, 'installation and labour');
  assert.equal((n['2100'] || 0) + (n['2110'] || 0), -180000, 'the GST');
  assert.equal(n['1100'] || 0, 0, 'paid, so nothing owed');
});

test('a closed period blocks the entry, says why, and posts once it is reopened', { skip }, async () => {
  const [[biz]] = await db.query('SELECT id FROM businesses WHERE is_default = 1 LIMIT 1');
  const lockId = randomUUID();
  await db.query('INSERT INTO period_locks SET ?', [{ id: lockId, business_id: biz.id, locked_upto: '2026-12-31', reason: 'ZZ service ledger test' }]);
  made.locks.push(lockId);

  const late = await ticket();
  await sync();
  let link = await linkOf(late.id);
  assert.equal(link.status, 'blocked');
  assert.match(link.note, /closed up to/);
  assert.equal(link.income_journal_id, null, 'nothing half-posted');

  const status = (await call('GET', '/service-ledger/status')).body;
  assert.ok(status.attention.some((a) => a.source_id === late.id), 'the owner is shown what needs attention');

  await db.query('DELETE FROM period_locks WHERE id = ?', [lockId]);
  await sync();
  link = await linkOf(late.id);
  assert.equal(link.status, 'synced', 'the sweep tries again by itself');
  assert.ok(link.income_journal_id);
});

test('deleting a ticket takes its money back out of the books', { skip }, async () => {
  const gone = await ticket({ payment_status: 'paid', payment_method: 'razorpay', payment_received_at: `${TODAY} 12:00:00` });
  await sync();
  const link = await linkOf(gone.id);
  const party2 = (await linesOf(link.income_journal_id)).find((l) => l.code === '1100').party;
  assert.ok((await net([gone.id]))['1010'] > 0, 'it was in the books');

  await db.query('DELETE FROM inquiries WHERE id = ?', [gone.id]);
  made.inquiries = made.inquiries.filter((x) => x !== gone.id);
  await sync();
  const n = await net([gone.id]);
  assert.ok(Object.values(n).every((v) => v === 0), `every account nets to nothing: ${JSON.stringify(n)}`);
  assert.equal(await partyBalance(party2), 0);
  const after = await linkOf(gone.id);
  assert.equal(after.status, 'skipped');
  assert.match(after.ticket_ref, /^ZZL-/, 'a deleted ticket is still named in the trail');
});

test('every journal it made balances', { skip }, async () => {
  const ids = [...made.inquiries, ...made.installations];
  const [rows] = await db.query(
    `SELECT j.id, SUM(jl.debit_paise) AS d, SUM(jl.credit_paise) AS c
       FROM journals j JOIN journal_lines jl ON jl.journal_id = j.id WHERE j.source_id IN (?) GROUP BY j.id`, [ids]
  );
  assert.ok(rows.length >= 8, 'there is something to check');
  for (const r of rows) assert.equal(Number(r.d), Number(r.c), `journal ${r.id} is out of balance`);
});

test.after(async () => {
  if (!db) return;
  // Switch the feature off and let any sweep already in flight finish, so the
  // server cannot post against these tickets while they are being removed.
  await call('PUT', '/service-ledger/settings', { from: null });
  await call('POST', '/service-ledger/sync');
  const ids = [...made.inquiries, ...made.installations];
  // Deleted tickets leave links behind on purpose; sweep them up by phone too.
  const [links] = await db.query(`SELECT source_id FROM service_ledger_links WHERE ticket_ref LIKE 'ZZL-%'`);
  const all = [...new Set([...ids, ...links.map((l) => l.source_id)])];
  if (all.length) {
    const [js] = await db.query('SELECT id FROM journals WHERE source_id IN (?)', [all]);
    const jids = js.map((j) => j.id);
    if (jids.length) {
      await db.query('UPDATE journals SET reversed_by_id = NULL, reversal_of_id = NULL WHERE id IN (?)', [jids]);
      await db.query('DELETE FROM journal_lines WHERE journal_id IN (?)', [jids]);
      await db.query('DELETE FROM journals WHERE id IN (?)', [jids]);
    }
    await db.query('DELETE FROM service_ledger_links WHERE source_id IN (?)', [all]);
    await db.query(`DELETE FROM bill_items WHERE ref_id IN (?)`, [all]);
  }
  if (made.inquiries.length) await db.query('DELETE FROM inquiries WHERE id IN (?)', [made.inquiries]);
  if (made.installations.length) await db.query('DELETE FROM installations WHERE id IN (?)', [made.installations]);
  const [parties] = await db.query(
    `SELECT id FROM parties WHERE notes = 'Created automatically from a service ticket' AND display_name LIKE 'ZZ Ledger%'`
  );
  for (const { id } of parties) {
    await db.query('DELETE FROM journal_lines WHERE party_id = ?', [id]);
    await db.query('DELETE FROM parties WHERE id = ?', [id]);
  }
  for (const id of made.locks) await db.query('DELETE FROM period_locks WHERE id = ?', [id]);
  if (businessBefore) {
    await db.query(
      'UPDATE businesses SET state_code = ?, state_name = ?, service_ledger_from = ? WHERE id = ?',
      [businessBefore.state_code, businessBefore.state_name, businessBefore.service_ledger_from ?? null, businessBefore.id]
    );
  }
  await db.end();
});
