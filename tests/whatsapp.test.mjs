// WhatsApp through Fast2SMS: the request that is built, what counts as a failure,
// the guards before anything is sent, the log, and the public link the customer
// opens to read the PDF.
//
//   node --test tests/whatsapp.test.mjs
//
// The first tests need nothing but the code. The rest need the local API and the
// test database and skip without them. Nothing here reaches Fast2SMS: the
// in-process tests hand the sender a stand-in for `fetch`. Everything created is
// removed afterwards.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const wa = require('../server/modules/whatsapp/service.cjs');
const API = 'http://127.0.0.1:5000/api';

// ── no database needed ──────────────────────────────────────────────────
test('a variable can never break the request: no line breaks, no pipes, never empty', () => {
  assert.equal(wa.cleanVariable('Hotel\nHeevan | Dalgate'), 'Hotel Heevan Dalgate');
  assert.equal(wa.cleanVariable('  '), '-');
  assert.equal(wa.cleanVariable(null), '-');
  assert.equal(wa.cleanVariable('x'.repeat(500)).length, 200);
});

test('the request carries the template, the number, the variables in order, and the PDF', () => {
  const u = wa.requestUrl({
    phoneNumberId: '579519398574288', messageId: '9', number: '9906000001',
    variables: ['Sami Ullah', 'INV-0033', '₹16,000', 'Networking Experts'],
    mediaUrl: 'https://services.example/api/public/documents/abc/pdf', filename: 'INV-0033.pdf', udf1: 'abcd1234',
  });
  assert.equal(u.origin + u.pathname, 'https://www.fast2sms.com/dev/whatsapp');
  assert.equal(u.searchParams.get('message_id'), '9');
  assert.equal(u.searchParams.get('phone_number_id'), '579519398574288');
  assert.equal(u.searchParams.get('numbers'), '9906000001');
  assert.equal(u.searchParams.get('variables_values'), 'Sami Ullah|INV-0033|₹16,000|Networking Experts');
  assert.equal(u.searchParams.get('media_url'), 'https://services.example/api/public/documents/abc/pdf');
  assert.equal(u.searchParams.get('document_filename'), 'INV-0033.pdf');
  const bare = wa.requestUrl({ phoneNumberId: '1', messageId: '2', number: '9906000001', variables: [] });
  assert.equal(bare.searchParams.has('variables_values'), false);
  assert.equal(bare.searchParams.has('media_url'), false);
});

const reply = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('what the provider says is read honestly: accepted, refused, unreachable, or not configured', async () => {
  const base = { phoneNumberId: '1', messageId: '2', number: '9906000001', variables: ['a'] };
  const sent = await wa.callFast2Sms({ ...base, apiKey: 'k', fetchImpl: reply(200, { status: true, message: 'Message sent successfully', request_id: 'r123' }) });
  assert.deepEqual([sent.ok, sent.request_id], [true, 'r123']);

  const refused = await wa.callFast2Sms({ ...base, apiKey: 'k', fetchImpl: reply(200, { status: false, message: 'Template not approved' }) });
  assert.equal(refused.ok, false, 'HTTP 200 with status:false is still a refusal');
  assert.match(refused.error, /Template not approved/);

  const denied = await wa.callFast2Sms({ ...base, apiKey: 'k', fetchImpl: reply(401, { message: 'Invalid authorization' }) });
  assert.equal(denied.ok, false);
  assert.match(denied.error, /Invalid authorization/);

  const down = await wa.callFast2Sms({ ...base, apiKey: 'k', fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND'); } });
  assert.equal(down.ok, false);
  assert.match(down.error, /Could not reach Fast2SMS/);

  const nokey = await wa.callFast2Sms({ ...base, apiKey: '', fetchImpl: reply(200, { status: true }) });
  assert.equal(nokey.ok, false);
  assert.match(nokey.error, /SMS_API/);
});

test('each kind of message has as many variables as its suggested wording uses', () => {
  for (const [name, p] of Object.entries(wa.PURPOSES)) {
    const used = new Set([...p.suggested.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])));
    assert.equal(used.size, p.vars.length, `${name}: wording uses ${used.size} variables, list has ${p.vars.length}`);
    assert.equal(p.sample.length, p.vars.length, `${name}: sample matches the variables`);
  }
});

// ── in-process, against the test database ───────────────────────────────
let mysql; let jwt; let db; let tokens; let reachable = false;
let businessId = null; let before = null; let seriesBefore = 0;
const made = { parties: [], contracts: [], docs: [] };

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/whatsapp/settings`).catch(() => null);
  reachable = !!probe && probe.status === 401;
  if (reachable) {
    db = await mysql.createConnection({
      host: process.env.DB_HOST, user: process.env.DB_USER,
      password: process.env.DB_PASS, database: process.env.DB_NAME,
    });
    const [[admin]] = await db.query("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1");
    const sign = (id, role) => jwt.sign({ id, email: `${role}@test.local`, role, worker_type: 'fixed' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    tokens = { admin: sign(admin.id, 'admin'), employee: sign(randomUUID(), 'employee') };
    const [[biz]] = await db.query('SELECT * FROM businesses WHERE is_default = 1 LIMIT 1');
    businessId = biz.id;
    const [[s]] = await db.query('SELECT * FROM whatsapp_settings WHERE business_id = ?', [businessId]);
    const [t] = await db.query('SELECT * FROM whatsapp_templates WHERE business_id = ?', [businessId]);
    before = { biz, settings: s || null, templates: t };
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

/** A stand-in for fetch that remembers what it was asked. */
const recorder = (outcome = { status: true, request_id: 'req-1' }, httpStatus = 200) => {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push({ url: new URL(url), headers: init.headers }); return { ok: httpStatus < 300, status: httpStatus, json: async () => outcome }; };
  return { seen, fetchImpl };
};

const KEY = 'test-key-not-real';
let party; let invoice;
const setup = (over = {}) => wa.saveSettings(db, {
  businessId, user: null,
  payload: { enabled: true, phone_number_id: '579519398574288', templates: [{ purpose: 'document', message_id: '11' }, { purpose: 'payment_reminder', message_id: '12' }, { purpose: 'amc_renewal', message_id: '13' }], ...over },
});

test('set up: a customer with an issued invoice', { skip }, async () => {
  await db.query(`UPDATE businesses SET state_code = '01', state_name = 'Jammu and Kashmir', setup_complete = 1 WHERE id = ?`, [businessId]);
  const p = await call('POST', '/parties', { display_name: 'ZZ WhatsApp Customer', phone: '9000000901', place_of_supply_state_code: '01' });
  assert.equal(p.status, 201);
  party = p.body;
  made.parties.push(party.id);
  const d = await call('POST', '/sales/documents', { doc_type: 'invoice', party_id: party.id, doc_date: inDays(0), lines: [{ description: 'ZZ item', quantity: 1, unit: 'Nos', rate: '1000', tax_rate_bps: 1800 }] });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  const issued = await call('POST', `/sales/documents/${d.body.document.id}/issue`);
  assert.equal(issued.status, 200, JSON.stringify(issued.body));
  invoice = issued.body.document;
  made.docs.push(invoice.id);
});

test('nothing is sent until WhatsApp is on, has a number id, and the template for that message is set', { skip }, async () => {
  const { seen, fetchImpl } = recorder();
  const attempt = () => wa.sendDocument(db, { businessId, user: null, documentId: invoice.id, baseUrl: 'https://portal.example', fetchImpl, apiKey: KEY });

  await wa.saveSettings(db, { businessId, user: null, payload: { enabled: false, phone_number_id: '', templates: [{ purpose: 'document', message_id: '' }] } });
  await assert.rejects(attempt, (e) => e.code === 'disabled');
  await setup({ phone_number_id: '', templates: [{ purpose: 'document', message_id: '11' }] });
  await assert.rejects(attempt, (e) => e.code === 'no_phone_number_id');
  await setup({ templates: [{ purpose: 'document', message_id: '' }] });
  await assert.rejects(attempt, (e) => e.code === 'no_template');
  await setup({ templates: [{ purpose: 'document', message_id: '11', enabled: false }] });
  await assert.rejects(attempt, (e) => e.code === 'no_template', 'a template switched off is as good as none');
  assert.equal(seen.length, 0, 'and nothing reached the provider');
  const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM document_share_links WHERE document_id = ?', [invoice.id]);
  assert.equal(Number(n), 0, 'no link was minted for a message that could not go');
});

test('an invoice goes out with its PDF link, the right variables, and is logged', { skip }, async () => {
  await setup();
  const { seen, fetchImpl } = recorder();
  const out = await wa.sendDocument(db, { businessId, user: null, documentId: invoice.id, baseUrl: 'https://portal.example/', fetchImpl, apiKey: KEY });
  assert.equal(out.ok, true);
  assert.equal(out.phone, '9000000901');
  assert.equal(seen.length, 1);
  const u = seen[0].url;
  assert.equal(seen[0].headers.authorization, KEY);
  assert.equal(u.searchParams.get('message_id'), '11');
  assert.equal(u.searchParams.get('phone_number_id'), '579519398574288');
  assert.equal(u.searchParams.get('numbers'), '9000000901');
  const vars = u.searchParams.get('variables_values').split('|');
  assert.equal(vars[0], 'ZZ WhatsApp Customer');
  assert.equal(vars[1], invoice.doc_no);
  assert.equal(vars[2], '₹1,180', '₹1,000 + 18% GST');
  assert.match(u.searchParams.get('media_url'), /^https:\/\/portal\.example\/api\/public\/documents\/[a-f0-9]{48}\/pdf$/, 'no double slash, and an https link a phone can fetch');
  assert.equal(u.searchParams.get('document_filename'), `${invoice.doc_no}.pdf`);

  const [[row]] = await db.query('SELECT * FROM whatsapp_messages WHERE id = ?', [out.id]);
  assert.equal(row.status, 'sent');
  assert.equal(row.request_id, 'req-1');
  assert.equal(row.has_media, 1);
  assert.ok(!JSON.stringify(row).includes('/api/public/documents/'), 'the bearer link is not written to the log');
});

test('the long Template ID is refused with a pointer to the short Message ID', { skip }, async () => {
  await assert.rejects(
    () => wa.saveSettings(db, { businessId, user: null, payload: { enabled: true, phone_number_id: '579519398574288', templates: [{ purpose: 'document', message_id: '2084036299216205' }] } }),
    (e) => e.code === 'long_template_id' && /MESSAGE ID/.test(e.message)
  );
  await setup(); // a short Message ID is fine
  const s = await wa.getSettings(db, businessId);
  assert.equal(s.templates.find((t) => t.purpose === 'document').message_id, '11');
});

test('a quotation goes out the same way, with its own PDF and number', { skip }, async () => {
  await setup();
  const d = await call('POST', '/sales/documents', { doc_type: 'estimate', party_id: party.id, doc_date: inDays(0), valid_until: inDays(10), lines: [{ description: 'ZZ quoted item', quantity: 2, unit: 'Nos', rate: '500', tax_rate_bps: 1800 }] });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  made.docs.push(d.body.document.id);

  // A draft has no number and cannot be sent.
  const { seen: none, fetchImpl: f0 } = recorder();
  await assert.rejects(() => wa.sendDocument(db, { businessId, user: null, documentId: d.body.document.id, baseUrl: 'https://portal.example', fetchImpl: f0, apiKey: KEY }), (e) => e.code === 'not_issued');
  assert.equal(none.length, 0);

  const issued = await call('POST', `/sales/documents/${d.body.document.id}/issue`);
  assert.equal(issued.status, 200, JSON.stringify(issued.body));
  const est = issued.body.document;
  assert.match(est.doc_no, /^EST-/);

  const { seen, fetchImpl } = recorder();
  const out = await wa.sendDocument(db, { businessId, user: null, documentId: est.id, baseUrl: 'https://portal.example', fetchImpl, apiKey: KEY });
  assert.equal(out.ok, true, JSON.stringify(out));
  const u = seen[0].url;
  const vars = u.searchParams.get('variables_values').split('|');
  assert.equal(vars[1], est.doc_no, 'the quotation number');
  assert.equal(vars[2], '₹1,180', '2 × ₹500 + 18% GST');
  assert.equal(u.searchParams.get('document_filename'), `${est.doc_no}.pdf`);
  const link = u.searchParams.get('media_url');
  assert.match(link, /\/api\/public\/documents\/[a-f0-9]{48}\/pdf$/);

  // And the customer can open that link without logging in — it is the quotation's PDF.
  const res = await fetch(`${API}/public/documents/${link.split('/')[6]}/pdf`);
  assert.equal(res.status, 200);
  assert.equal((await res.arrayBuffer()).byteLength > 2000, true);
});

test('the same message to the same number twice in a row is refused, unless forced', { skip }, async () => {
  const { seen, fetchImpl } = recorder();
  const send = (force) => wa.sendDocument(db, { businessId, user: null, documentId: invoice.id, baseUrl: 'https://portal.example', fetchImpl, force, apiKey: KEY });
  await assert.rejects(() => send(false), (e) => e.code === 'duplicate' && e.status === 409);
  assert.equal(seen.length, 0);
  assert.equal((await send(true)).ok, true);
  assert.equal(seen.length, 1);
});

test('a refusal from the provider is logged as failed, with what it said', { skip }, async () => {
  const { fetchImpl } = recorder({ status: false, message: 'Template is not approved yet' });
  const out = await wa.sendDocument(db, { businessId, user: null, documentId: invoice.id, baseUrl: 'https://portal.example', fetchImpl, force: true, apiKey: KEY });
  assert.equal(out.ok, false);
  assert.match(out.error, /not approved/);
  const [[row]] = await db.query('SELECT status, error FROM whatsapp_messages WHERE id = ?', [out.id]);
  assert.equal(row.status, 'failed');
  assert.match(row.error, /not approved/);

  const bad = await call('POST', '/parties', { display_name: 'ZZ No Phone', phone: '12345', place_of_supply_state_code: '01' });
  made.parties.push(bad.body.id);
  const d = await call('POST', '/sales/documents', { doc_type: 'invoice', party_id: bad.body.id, doc_date: inDays(0), lines: [{ description: 'x', quantity: 1, rate: '10', tax_rate_bps: 0 }] });
  made.docs.push(d.body.document.id);
  await call('POST', `/sales/documents/${d.body.document.id}/issue`);
  await assert.rejects(() => wa.sendDocument(db, { businessId, user: null, documentId: d.body.document.id, baseUrl: 'https://portal.example', fetchImpl, apiKey: KEY }), (e) => e.code === 'bad_phone');
});

test('an AMC renewal reminder carries the contract, the date and the amount, and counts as a reminder', { skip }, async () => {
  const c = await call('POST', '/amc/contracts', { party_id: party.id, title: 'ZZ CCTV', start_date: inDays(-340), end_date: inDays(25), amount: '12000', tax_rate_bps: 1800, visits_included: 2 });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  made.contracts.push(c.body.contract.id);
  const { seen, fetchImpl } = recorder();
  const out = await wa.sendAmcRenewal(db, { businessId, user: null, contractId: c.body.contract.id, fetchImpl, apiKey: KEY });
  assert.equal(out.ok, true);
  const v = seen[0].url.searchParams.get('variables_values').split('|');
  assert.equal(v[0], 'ZZ WhatsApp Customer');
  assert.equal(v[1], c.body.contract.contract_no);
  assert.match(v[3], /₹12,000 \+ GST/);
  assert.equal(seen[0].url.searchParams.get('message_id'), '13');
  assert.equal(seen[0].url.searchParams.has('media_url'), false, 'a reminder has no attachment');
  const after = (await call('GET', `/amc/contracts/${c.body.contract.id}`)).body.contract;
  assert.equal(after.reminders_sent, 1);

  const cancelled = await call('POST', `/amc/contracts/${c.body.contract.id}/cancel`, { reason: 'ZZ' });
  assert.equal(cancelled.status, 200);
  await assert.rejects(() => wa.sendAmcRenewal(db, { businessId, user: null, contractId: c.body.contract.id, fetchImpl, force: true, apiKey: KEY }), (e) => e.code === 'cancelled');
});

test('a payment reminder needs something overdue', { skip }, async () => {
  const { fetchImpl } = recorder();
  await assert.rejects(() => wa.sendPaymentReminder(db, { businessId, user: null, partyId: party.id, fetchImpl, apiKey: KEY }), (e) => e.code === 'nothing_due');
});

test('an overdue customer is reminded with the amount and how long it has been, and the reminder is recorded', { skip }, async () => {
  const p = await call('POST', '/parties', { display_name: 'ZZ Late Payer', phone: '9000000902', place_of_supply_state_code: '01' });
  made.parties.push(p.body.id);
  const d = await call('POST', '/sales/documents', { doc_type: 'invoice', party_id: p.body.id, doc_date: inDays(-100), due_date: inDays(-70), lines: [{ description: 'ZZ old job', quantity: 1, rate: '5000', tax_rate_bps: 0 }] });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  made.docs.push(d.body.document.id);
  assert.equal((await call('POST', `/sales/documents/${d.body.document.id}/issue`)).status, 200);

  const { seen, fetchImpl } = recorder();
  const out = await wa.sendPaymentReminder(db, { businessId, user: null, partyId: p.body.id, fetchImpl, apiKey: KEY });
  assert.equal(out.ok, true);
  const v = seen[0].url.searchParams.get('variables_values').split('|');
  assert.equal(v[0], 'ZZ Late Payer');
  assert.equal(v[1], '₹5,000');
  assert.ok(Number(v[2]) >= 70, `days overdue counted from the due date, got ${v[2]}`);
  assert.equal(seen[0].url.searchParams.get('message_id'), '12');
  const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM payment_reminders WHERE party_id = ? AND channel = 'whatsapp'", [p.body.id]);
  assert.equal(Number(n), 1, 'it counts as a reminder in the customer history');
});

test('the customer opens the PDF from the link without logging in; the link stops working when it should', { skip }, async () => {
  const sales = require('../server/modules/sales/service.cjs');
  const { token } = await sales.createShareLink(db, { documentId: invoice.id, user: null });
  const open = (t) => fetch(`${API}/public/documents/${t}/pdf`);

  const ok = await open(token);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await ok.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');

  assert.equal((await open('f'.repeat(48))).status, 404, 'an unknown token');
  assert.equal((await open('not-a-token')).status, 404, 'not even shaped like one');
  const hash = createHash('sha256').update(token).digest('hex');
  const [[row]] = await db.query('SELECT token_hash, opens FROM document_share_links WHERE token_hash = ?', [hash]);
  assert.notEqual(row.token_hash, token, 'only a hash is kept');
  assert.ok(Number(row.opens) >= 1, 'and opens are counted');

  await db.query('UPDATE document_share_links SET expires_at = ? WHERE token_hash = ?', [new Date(Date.now() - 1000), row.token_hash]);
  assert.equal((await open(token)).status, 404, 'an expired link');

  const fresh = await sales.createShareLink(db, { documentId: invoice.id, user: null });
  assert.equal((await open(fresh.token)).status, 200);
  const cancel = await call('POST', `/sales/documents/${invoice.id}/cancel`, { reason: 'ZZ test' });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
  assert.equal((await open(fresh.token)).status, 404, 'a cancelled invoice is no longer handed out');
  await assert.rejects(() => sales.createShareLink(db, { documentId: invoice.id, user: null }), (e) => e.code === 'cancelled');
});

test('settings can be read and saved by the owner only, and the routes refuse politely when it is not set up', { skip }, async () => {
  assert.equal((await call('GET', '/whatsapp/settings', null, 'employee')).status, 403);
  assert.equal((await call('PUT', '/whatsapp/settings', { enabled: true }, 'employee')).status, 403);

  const bad = await call('PUT', '/whatsapp/settings', { phone_number_id: 'abc', templates: [] });
  assert.equal(bad.status, 400);
  const badId = await call('PUT', '/whatsapp/settings', { phone_number_id: '123456', templates: [{ purpose: 'document', message_id: '9; DROP' }] });
  assert.equal(badId.status, 400);

  const put = await call('PUT', '/whatsapp/settings', { enabled: false, phone_number_id: '123456789', templates: [{ purpose: 'document', message_id: '7' }] });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.equal(put.body.phone_number_id, '123456789');
  assert.equal(put.body.templates.find((t) => t.purpose === 'document').message_id, '7');
  assert.deepEqual(put.body.templates.map((t) => t.purpose), ['document', 'payment_reminder', 'job_assignment', 'amc_renewal']);

  const off = await call('POST', '/whatsapp/send/document', { document_id: invoice.id });
  assert.equal(off.status, 409, 'switched off');
  assert.equal(off.body.code, 'disabled');
  assert.equal((await call('POST', '/whatsapp/send/document', { document_id: invoice.id }, 'employee')).status, 403);
  assert.equal((await call('POST', '/whatsapp/send/payment-reminder', {})).status, 400);
  assert.equal((await call('POST', '/whatsapp/test', { purpose: 'nonsense' })).status, 400);
});

test.after(async () => {
  if (!db) return;
  try {
    await db.query('DELETE FROM whatsapp_messages WHERE party_id IN (?)', [made.parties.length ? made.parties : ['none']]);
    await db.query('DELETE FROM whatsapp_messages WHERE business_id = ? AND ref_type = ?', [businessId, 'test']);
    const C = made.contracts.length ? made.contracts : ['none'];
    await db.query('DELETE FROM amc_visits WHERE contract_id IN (?)', [C]);
    await db.query('DELETE FROM amc_contracts WHERE id IN (?)', [C]);
    await db.query('DELETE FROM audit_log WHERE entity_id IN (?) OR action LIKE ?', [[...made.docs, ...made.contracts, 'none'], 'whatsapp.%']);

    const [docs] = await db.query('SELECT id, journal_id FROM sales_documents WHERE party_id IN (?)', [made.parties.length ? made.parties : ['none']]);
    for (const d of docs) {
      await db.query('DELETE FROM document_share_links WHERE document_id = ?', [d.id]);
      await db.query('DELETE FROM sales_document_lines WHERE document_id = ?', [d.id]);
    }
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
      await db.query('DELETE FROM payment_reminders WHERE party_id = ?', [id]);
      await db.query('DELETE FROM journal_lines WHERE party_id = ?', [id]);
      await db.query('DELETE FROM parties WHERE id = ?', [id]);
    }
    if (!seriesBefore) await db.query("DELETE FROM number_series WHERE doc_type = 'amc_contract'");

    // Put the settings back the way they were.
    await db.query('DELETE FROM whatsapp_templates WHERE business_id = ?', [businessId]);
    for (const t of before.templates) await db.query('INSERT INTO whatsapp_templates SET ?', [t]);
    await db.query('DELETE FROM whatsapp_settings WHERE business_id = ?', [businessId]);
    if (before.settings) await db.query('INSERT INTO whatsapp_settings SET ?', [before.settings]);
    await db.query('UPDATE businesses SET state_code = ?, state_name = ?, setup_complete = ? WHERE id = ?',
      [before.biz.state_code, before.biz.state_name, before.biz.setup_complete, businessId]);
  } finally {
    await db.end();
  }
});
