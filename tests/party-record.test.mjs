// A customer's whole record on one PDF: what they bought, what they paid, jobs, the statement.
//
//   node --test tests/party-record.test.mjs
//
// Needs the local API and the test database; skips without them. Everything it creates is removed at the end.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const API = 'http://127.0.0.1:5000/api';

let mysql; let jwt; let db; let adminToken; let employeeToken; let reachable = false;
let businessBefore;
const made = { docs: [], payments: [], parties: [], inquiries: [] };
let customer; let invoiceId;
const PHONE = '9000000663';

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/reports/party-record?party_id=x`).catch(() => null);
  reachable = !!probe && probe.status === 401;
  if (reachable) {
    db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
    const [[admin]] = await db.query("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1");
    const sign = (id, role) => jwt.sign({ id, email: `${role}@test.local`, role, worker_type: 'fixed' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    adminToken = sign(admin.id, 'admin');
    employeeToken = sign(randomUUID(), 'employee');
  }
} catch { reachable = false; }

const skip = reachable ? false : 'needs the local API on port 5000 and the test database';
const call = async (method, path, body, tk = adminToken) => {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

test('set up: a customer with a sale of two kinds of item, a part payment, and a service job', { skip }, async () => {
  const [[biz]] = await db.query('SELECT * FROM businesses WHERE is_default = 1 LIMIT 1');
  businessBefore = biz;
  await db.query("UPDATE businesses SET state_code = '01', state_name = 'Jammu and Kashmir', setup_complete = 1 WHERE id = ?", [biz.id]);

  const party = await call('POST', '/parties', { display_name: 'ZZ Record Customer', phone: PHONE, kind: 'customer', place_of_supply_state_code: '01' });
  assert.equal(party.status, 201, JSON.stringify(party.body));
  customer = party.body;
  made.parties.push(customer.id);

  const draft = await call('POST', '/sales/documents', {
    doc_type: 'invoice', party_id: customer.id, doc_date: '2026-09-10',
    lines: [
      { description: 'ZZ Record Dome Camera', quantity: 2, rate: '2500', tax_rate_bps: 1800 },
      { description: 'ZZ Record Cable 90m', quantity: 1, rate: '1200', tax_rate_bps: 1800 },
    ],
  });
  assert.equal(draft.status, 201, JSON.stringify(draft.body));
  invoiceId = draft.body.document.id;
  made.docs.push(invoiceId);
  assert.equal((await call('POST', `/sales/documents/${invoiceId}/issue`)).status, 200);

  const issued = (await call('GET', `/sales/documents/${invoiceId}`)).body;
  const half = Math.round(Number(issued.document.total_paise) / 2);
  const pay = await call('POST', '/payments', {
    party_id: customer.id, payment_date: '2026-09-12', method: 'upi', amount_paise: half, reference: 'ZZ-REC-1',
    allocations: [{ document_id: invoiceId, amount_paise: half }],
  });
  assert.equal(pay.status, 201, JSON.stringify(pay.body));
  made.payments.push(pay.body.payment.id);

  const ticket = randomUUID();
  await db.query('INSERT INTO inquiries SET ?', [{
    id: ticket, full_name: 'ZZ Record Customer', phone: `+91${PHONE}`, ticket_no: `ZZREC-${ticket.slice(0, 6)}`,
    service_item: 'DVR not recording', status: 'resolved', bill_total: 900, payment_status: 'paid',
    created_at: '2026-09-20 10:00:00',
  }]);
  made.inquiries.push(ticket);
});

test('the record says what they bought, what they paid and what is still owed', { skip }, async () => {
  const r = await call('GET', `/reports/party-record?party_id=${customer.id}&from=2026-04-01&to=2026-12-31`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const rec = r.body;
  assert.equal(rec.party.display_name, 'ZZ Record Customer');
  assert.equal(rec.summary.invoices, 1);
  assert.equal(rec.summary.sold_paise, 4 * 0 + (2 * 250000 + 120000) * 118 / 100, 'two cameras and a cable, with 18% GST');
  assert.equal(rec.summary.received_paise, rec.summary.sold_paise / 2);
  assert.equal(rec.summary.outstanding_paise, rec.summary.sold_paise / 2);
  assert.equal(rec.summary.services, 1);

  const camera = rec.sold_items.find((i) => i.description === 'ZZ Record Dome Camera');
  assert.equal(camera.quantity, 2);
  assert.equal(rec.sales[0].lines.length, 2);
  assert.equal(rec.payments.length, 1);
  assert.equal(rec.services[0].service_item, 'DVR not recording');
});

test('the same record as a PDF, for a period or from the beginning', { skip }, async () => {
  for (const query of ['from=2026-04-01&to=2026-12-31', 'all=1']) {
    const res = await fetch(`${API}/reports/party-record.pdf?party_id=${customer.id}&${query}`, { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/pdf/);
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.ok(bytes.length > 3000, 'there is real content in it');
  }
});

test('only someone who may see the accounts can print it; an unknown party is a 404', { skip }, async () => {
  const res = await fetch(`${API}/reports/party-record.pdf?party_id=${customer.id}`, { headers: { Authorization: `Bearer ${employeeToken}` } });
  assert.equal(res.status, 403);
  const missing = await call('GET', `/reports/party-record?party_id=${randomUUID()}`);
  assert.equal(missing.status, 404);
  const none = await call('GET', '/reports/party-record');
  assert.equal(none.status, 400);
});

test.after(async () => {
  if (!db) return;
  try {
    const journals = new Set();
    for (const id of made.payments) {
      const [[p]] = await db.query('SELECT journal_id FROM payments WHERE id = ?', [id]);
      if (p?.journal_id) journals.add(p.journal_id);
      await db.query('DELETE FROM payment_allocations WHERE payment_id = ?', [id]);
      await db.query('DELETE FROM payments WHERE id = ?', [id]);
    }
    for (const id of made.docs) {
      const [[d]] = await db.query('SELECT journal_id FROM sales_documents WHERE id = ?', [id]);
      if (d?.journal_id) journals.add(d.journal_id);
      await db.query('DELETE FROM payment_allocations WHERE document_id = ?', [id]);
      await db.query('DELETE FROM sales_document_lines WHERE document_id = ?', [id]);
      await db.query('DELETE FROM sales_documents WHERE id = ?', [id]);
    }
    for (const id of journals) {
      await db.query('UPDATE journals SET reversed_by_id = NULL, reversal_of_id = NULL WHERE id = ?', [id]);
      await db.query('DELETE FROM journal_lines WHERE journal_id = ?', [id]);
      await db.query('DELETE FROM journals WHERE id = ?', [id]);
    }
    for (const id of made.inquiries) await db.query('DELETE FROM inquiries WHERE id = ?', [id]);
    for (const id of made.parties) {
      await db.query('DELETE FROM journal_lines WHERE party_id = ?', [id]);
      await db.query('DELETE FROM party_addresses WHERE party_id = ?', [id]);
      await db.query('DELETE FROM parties WHERE id = ?', [id]);
    }
    if (businessBefore) {
      await db.query('UPDATE businesses SET state_code = ?, state_name = ?, setup_complete = ? WHERE id = ?',
        [businessBefore.state_code, businessBefore.state_name, businessBefore.setup_complete, businessBefore.id]);
    }
  } finally {
    await db.end();
  }
});
