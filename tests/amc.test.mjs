// Annual maintenance contracts: the term is invoiced once, visits are counted
// against the free ones, renewal chains, and what is about to lapse is found.
//
//   node --test tests/amc.test.mjs
//
// The first tests need nothing but the code. The rest need the local API and
// test database and skip without them. Everything they create is removed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const amc = require('../server/modules/amc/service.cjs');
const { upiLink, tableColumns, renderDocumentPdf } = require('../server/modules/sales/pdf.cjs');
const API = 'http://127.0.0.1:5000/api';

// ── no database needed ──────────────────────────────────────────────────
const at = (y, m, d) => new Date(y, m - 1, d);

test('a contract is worked out as running, expired, renewed or cancelled from its dates', () => {
  const c = { status: 'active', start_date: '2026-01-01', end_date: '2026-12-31', renewed_to_id: null };
  assert.equal(amc.stateOf(c, at(2026, 6, 1)), 'active');
  assert.equal(amc.stateOf(c, at(2026, 12, 31)), 'active', 'the last day is still covered');
  assert.equal(amc.stateOf(c, at(2027, 1, 1)), 'expired');
  assert.equal(amc.stateOf(c, at(2025, 12, 31)), 'upcoming');
  assert.equal(amc.stateOf({ ...c, renewed_to_id: 'x' }, at(2027, 3, 1)), 'renewed');
  assert.equal(amc.stateOf({ ...c, status: 'cancelled' }, at(2026, 6, 1)), 'cancelled');
});

test('the summary counts what runs, what is about to lapse, and what lapsed', () => {
  const make = (state, days, amount, extra = {}) => amc.shape({
    status: state === 'cancelled' ? 'cancelled' : 'active', renewed_to_id: null, amount_paise: amount, visits_included: 4, visits_used: 1,
    start_date: '2026-01-01', end_date: days, invoice_id: null, ...extra,
  }, at(2026, 9, 29));
  const list = [
    make('active', '2026-12-31', 1000000),          // 93 days left
    make('active', '2026-10-10', 500000),           // 11 days left — lapsing
    make('expired', '2026-09-01', 300000),          // expired 28 days ago
    make('expired', '2025-01-01', 900000),          // long gone: not worth chasing
    make('cancelled', '2026-12-31', 700000),
  ];
  const s = amc.summarise(list);
  assert.equal(s.running, 2);
  assert.equal(s.running_value_paise, 1500000);
  assert.equal(s.lapsing_30, 1);
  assert.equal(s.lapsing_30_value_paise, 500000);
  assert.equal(s.lapsed, 1, 'a contract that ended long ago is not counted as a live loss');
  assert.equal(s.not_invoiced, 2);
});

test('visits left, and visits beyond the free ones', () => {
  const row = (used, included) => amc.shape({ status: 'active', start_date: '2026-01-01', end_date: '2026-12-31', amount_paise: 1, visits_included: included, visits_used: used }, at(2026, 6, 1));
  assert.equal(row(1, 4).visits_left, 3);
  assert.equal(row(4, 4).visits_left, 0);
  assert.equal(row(6, 4).visits_over, 2);
  assert.equal(row(9, null).visits_left, null, 'unlimited');
});

test('the reminder names the customer, the contract, the date and the amount', () => {
  const contract = amc.shape({ status: 'active', start_date: '2026-01-01', end_date: '2026-10-10', amount_paise: 1200000, tax_rate_bps: 1800, contract_no: 'AMC-2627-0001', title: 'CCTV — 8 cameras', party_name: 'Hotel Heevan', visits_included: 4, visits_used: 0 }, at(2026, 9, 29));
  const text = amc.reminderMessage({ business: { trade_name: 'Networking Experts' }, contract });
  assert.match(text, /Hotel Heevan/);
  assert.match(text, /AMC-2627-0001/);
  assert.match(text, /10 October 2026/);
  assert.match(text, /12,000/);
  assert.match(text, /\+ GST/);
  assert.equal(amc.phoneFor('+91 98700 00001'), '9870000001');
  assert.equal(amc.phoneFor('098700 00001'), '9870000001');
  assert.equal(amc.phoneFor('12345'), null);
});

test('the printed document has a Unit column and a UPI link the payer\'s app understands', async () => {
  const cols = tableColumns({ doc: { supply_type: 'intra', cgst_paise: 900, sgst_paise: 900 }, lines: [{ tax_rate_bps: 1800 }], width: 515 });
  assert.ok(cols.cols.some((c) => c.key === 'unit'));
  assert.equal(cols.cols.reduce((n, c) => n + c.w, 0), 515);

  const link = upiLink({ upi: 'shop@bank', name: 'Networking Experts', amountPaise: 1491880, note: 'INV-1' });
  assert.equal(link, 'upi://pay?pa=shop%40bank&pn=Networking%20Experts&am=14918.80&cu=INR&tn=INV-1');
  assert.equal(upiLink({ upi: '', name: 'x' }), null, 'no UPI id, no QR');
  assert.ok(!upiLink({ upi: 'a@b', name: 'x', amountPaise: 0 }).includes('am='), 'nothing owing, no amount');

  const doc = {
    doc_type: 'invoice', doc_no: 'INV-1', doc_date: '2026-09-29', supply_type: 'intra', taxable_paise: 100000, cgst_paise: 9000, sgst_paise: 9000,
    utgst_paise: 0, igst_paise: 0, line_discount_paise: 0, doc_discount_paise: 0, round_off_paise: 0, total_paise: 118000, party_snapshot: { display_name: 'X' },
  };
  const line = { description: '3+1 cable', quantity: 90, unit: 'Meter', rate_paise: 1111, tax_rate_bps: 1800, taxable_paise: 100000, cgst_paise: 9000, sgst_paise: 9000, igst_paise: 0, amount_paise: 118000 };
  const pdf = await renderDocumentPdf({ business: { legal_name: 'NE', upi_id: 'shop@bank', bank_name: 'HDFC' }, document: doc, lines: [line], paid_paise: 0 });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length, 1);
});

// ── the API ─────────────────────────────────────────────────────────────
let mysql; let jwt; let db; let tokens; let reachable = false;
let businessBefore = null; let seriesBefore = 0;
const made = { parties: [], contracts: [] };

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/amc/contracts`).catch(() => null);
  reachable = !!probe && probe.status === 401;
  if (reachable) {
    db = await mysql.createConnection({
      host: process.env.DB_HOST, user: process.env.DB_USER,
      password: process.env.DB_PASS, database: process.env.DB_NAME,
    });
    const [[admin]] = await db.query("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1");
    const sign = (id, role) => jwt.sign({ id, email: `${role}@test.local`, role, worker_type: 'fixed' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const techId = randomUUID();
    tokens = { admin: sign(admin.id, 'admin'), employee: sign(techId, 'employee') };
    [[{ n: seriesBefore }]] = await db.query("SELECT COUNT(*) AS n FROM number_series WHERE doc_type = 'amc_contract'");
  }
} catch { reachable = false; }

const skip = reachable ? false : 'needs the local API on port 5000 and the test database';

const call = async (method, path, body, who = 'admin') => {
  const res = await fetch(API + path, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDay(d); };

let party; let contract;

test('set up: a customer', { skip }, async () => {
  const [[biz]] = await db.query('SELECT * FROM businesses WHERE is_default = 1 LIMIT 1');
  businessBefore = biz;
  await db.query(`UPDATE businesses SET state_code = '01', state_name = 'Jammu and Kashmir', setup_complete = 1 WHERE id = ?`, [biz.id]);
  const p = await call('POST', '/parties', { display_name: 'ZZ AMC Customer', phone: '9000000701', place_of_supply_state_code: '01' });
  assert.equal(p.status, 201);
  party = p.body;
  made.parties.push(party.id);
});

test('a contract is created with its own number, and read back with plain dates', { skip }, async () => {
  const r = await call('POST', '/amc/contracts', {
    party_id: party.id, title: 'ZZ CCTV — 8 cameras', site: 'Rajbagh, Srinagar', start_date: inDays(-344), end_date: inDays(20),
    amount: '12000', tax_rate_bps: 1800, visits_included: 2,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  contract = r.body.contract;
  made.contracts.push(contract.id);
  assert.match(contract.contract_no, /^AMC-/);
  assert.equal(contract.start_date, inDays(-344), 'a date is a date, not a timestamp that lands on the day before');
  assert.equal(contract.state, 'active');
  assert.equal(contract.days_left, 20);
  assert.equal(Number(contract.amount_paise), 1200000);
  assert.equal(contract.has_invoice, false);

  assert.equal((await call('POST', '/amc/contracts', { party_id: party.id, title: 'x', start_date: inDays(5), end_date: inDays(1) })).status, 400, 'ends before it starts');
  assert.equal((await call('POST', '/amc/contracts', { title: 'x', start_date: inDays(0), end_date: inDays(9) })).status, 400, 'no customer');
  assert.equal((await call('POST', '/amc/contracts', { party_id: randomUUID(), title: 'x', start_date: inDays(0), end_date: inDays(9) })).status, 400, 'no such customer');
});

test('the invoice for a term is raised once, at the contract rate, and posts to the ledger', { skip }, async () => {
  const r = await call('POST', `/amc/contracts/${contract.id}/invoice`, {});
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const inv = r.body.invoice;
  assert.match(inv.doc_no, /^INV-/);
  assert.equal(inv.status, 'issued');
  assert.equal(Number(inv.taxable_paise), 1200000);
  assert.equal(Number(inv.total_paise), 1416000, '₹12,000 + 18% GST');
  assert.ok(inv.journal_id, 'it is in the books');
  assert.equal(r.body.contract.has_invoice, true);
  assert.equal(Number(r.body.contract.invoice_due_paise), 1416000);

  const [[line]] = await db.query('SELECT description, unit, hsn_sac FROM sales_document_lines WHERE document_id = ?', [inv.id]);
  assert.match(line.description, /^AMC — ZZ CCTV/);
  assert.equal(line.unit, 'Job');
  assert.equal(line.hsn_sac, '9987');

  const again = await call('POST', `/amc/contracts/${contract.id}/invoice`, {});
  assert.equal(again.status, 409, 'billing the same term twice is refused');
  assert.equal(again.body.code, 'already_invoiced');
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM sales_documents WHERE party_id = ?', [party.id]);
  assert.equal(Number(n), 1);
});

test('once invoiced, the amount is fixed, but the dates and free visits can still change', { skip }, async () => {
  assert.equal((await call('PATCH', `/amc/contracts/${contract.id}`, { amount: '9999' })).status, 409);
  const ok = await call('PATCH', `/amc/contracts/${contract.id}`, { visits_included: 3, notes: 'ZZ note' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.contract.visits_included, 3);
  assert.equal(Number(ok.body.contract.amount_paise), 1200000);
  await call('PATCH', `/amc/contracts/${contract.id}`, { visits_included: 2 });
});

test('visits are counted, and the ones past the free allowance are marked chargeable', { skip }, async () => {
  const v = (extra) => call('POST', `/amc/contracts/${contract.id}/visits`, { visit_date: inDays(-1), ...extra });
  const one = await v({ kind: 'scheduled', note: 'quarterly check' });
  assert.equal(one.status, 201, JSON.stringify(one.body));
  assert.equal(one.body.chargeable, false);
  assert.equal(one.body.contract.visits_left, 1);

  const two = await v({ kind: 'complaint', ticket_ref: 'ZZ-T-1' });
  assert.equal(two.body.chargeable, false);
  assert.equal(two.body.contract.visits_left, 0);

  assert.equal((await v({ ticket_ref: 'ZZ-T-1' })).status, 409, 'the same ticket is not counted twice');

  const three = await v({ kind: 'complaint', ticket_ref: 'ZZ-T-2' });
  assert.equal(three.body.chargeable, true, 'the third is not free');
  assert.equal(three.body.contract.visits_over, 1);

  // Removing an early visit hands the free one back to the visit that was charged.
  const first = three.body.visits.find((x) => x.note === 'quarterly check');
  const removed = await call('DELETE', `/amc/visits/${first.id}`);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.contract.visits_used, 2);
  assert.equal(removed.body.contract.visits_over, 0);
  assert.ok(removed.body.visits.every((x) => !x.chargeable), 'both remaining visits are free again');
});

test('what is about to lapse is found, with a WhatsApp message written for the customer', { skip }, async () => {
  const r = await call('GET', '/amc/renewals?days=45');
  assert.equal(r.status, 200);
  const mine = r.body.contracts.find((c) => c.id === contract.id);
  assert.ok(mine, 'a contract ending in 20 days is on the list');
  assert.equal(mine.urgency, 'month', '20 days out is inside the 45-day window but not yet urgent');
  assert.match(mine.whatsapp_url, /^https:\/\/wa\.me\/919000000701\?text=/);
  assert.match(decodeURIComponent(mine.whatsapp_url), /ZZ AMC Customer/);

  const sent = await call('POST', `/amc/contracts/${contract.id}/reminded`);
  assert.equal(sent.body.contract.reminders_sent, 1);
});

test('renewing starts the next term the day after, points back, and drops off the chase list', { skip }, async () => {
  const r = await call('POST', `/amc/contracts/${contract.id}/renew`, { amount: '13000' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const next = r.body.contract;
  made.contracts.push(next.id);
  assert.equal(next.start_date, inDays(21), 'the day after the old one ends');
  assert.equal(next.end_date, isoDay(new Date(new Date(next.start_date + 'T00:00:00').getFullYear() + 1, new Date(next.start_date + 'T00:00:00').getMonth(), new Date(next.start_date + 'T00:00:00').getDate() - 1)), 'a year later, less a day');
  assert.equal(Number(next.amount_paise), 1300000);
  assert.equal(next.has_invoice, false, 'the new term is not invoiced until asked');
  assert.equal(r.body.earlier_terms.length, 1);

  const old = (await call('GET', `/amc/contracts/${contract.id}`)).body.contract;
  assert.equal(old.renewed_to_id, next.id);
  assert.equal(old.state, 'renewed');

  assert.equal((await call('POST', `/amc/contracts/${contract.id}/renew`, {})).status, 409, 'not renewed twice');
  const list = (await call('GET', '/amc/renewals?days=45')).body.contracts;
  assert.ok(!list.some((c) => c.id === contract.id), 'the renewed contract is no longer chased');
});

test('a cancelled contract cannot be edited, invoiced or renewed', { skip }, async () => {
  const id = made.contracts[1];
  const c = await call('POST', `/amc/contracts/${id}/cancel`, { reason: 'ZZ customer left' });
  assert.equal(c.status, 200);
  assert.equal(c.body.contract.state, 'cancelled');
  assert.equal((await call('PATCH', `/amc/contracts/${id}`, { title: 'again' })).status, 409);
  assert.equal((await call('POST', `/amc/contracts/${id}/invoice`, {})).status, 409);
  assert.equal((await call('POST', `/amc/contracts/${id}/renew`, {})).status, 409);
});

test('the list carries a summary, and only people who may see contracts can', { skip }, async () => {
  const r = await call('GET', '/amc/contracts');
  assert.equal(r.status, 200);
  assert.ok(r.body.summary && typeof r.body.summary.running === 'number');
  assert.ok(r.body.contracts.some((c) => c.id === contract.id));
  assert.equal((await call('GET', '/amc/contracts', null, 'employee')).status, 403);
  assert.equal((await call('POST', '/amc/contracts', { party_id: party.id, title: 'x', start_date: inDays(0), end_date: inDays(9) }, 'employee')).status, 403);
});

test.after(async () => {
  if (!db) return;
  try {
    await db.query('DELETE FROM amc_visits WHERE contract_id IN (?)', [made.contracts.length ? made.contracts : ['none']]);
    await db.query('UPDATE amc_contracts SET renewed_from_id = NULL, renewed_to_id = NULL WHERE id IN (?)', [made.contracts.length ? made.contracts : ['none']]);
    await db.query('UPDATE amc_contracts SET invoice_id = NULL WHERE id IN (?)', [made.contracts.length ? made.contracts : ['none']]);
    await db.query('DELETE FROM amc_contracts WHERE id IN (?)', [made.contracts.length ? made.contracts : ['none']]);

    const [docs] = await db.query('SELECT id, journal_id FROM sales_documents WHERE party_id IN (?)', [made.parties.length ? made.parties : ['none']]);
    for (const d of docs) await db.query('DELETE FROM sales_document_lines WHERE document_id = ?', [d.id]);
    for (const d of docs) {
      await db.query('DELETE FROM sales_documents WHERE id = ?', [d.id]);
      if (d.journal_id) {
        const [[rev]] = await db.query('SELECT reversed_by_id FROM journals WHERE id = ?', [d.journal_id]);
        for (const jid of [d.journal_id, rev?.reversed_by_id].filter(Boolean)) {
          await db.query('UPDATE journals SET reversed_by_id = NULL, reversal_of_id = NULL WHERE id = ?', [jid]);
          await db.query('DELETE FROM journal_lines WHERE journal_id = ?', [jid]);
          await db.query('DELETE FROM journals WHERE id = ?', [jid]);
        }
      }
    }
    for (const id of made.parties) {
      await db.query('DELETE FROM journal_lines WHERE party_id = ?', [id]);
      await db.query('DELETE FROM parties WHERE id = ?', [id]);
    }
    await db.query("DELETE FROM audit_log WHERE action LIKE 'amc.%' AND entity_id IN (?)", [made.contracts.length ? made.contracts : ['none']]);
    if (!seriesBefore) await db.query("DELETE FROM number_series WHERE doc_type = 'amc_contract'");
    if (businessBefore) {
      await db.query('UPDATE businesses SET state_code = ?, state_name = ?, setup_complete = ? WHERE id = ?',
        [businessBefore.state_code, businessBefore.state_name, businessBefore.setup_complete, businessBefore.id]);
    }
  } finally {
    await db.end();
  }
});
