// The assignment tracker: a job is given to someone, they are told on WhatsApp, and the
// owner can see who has not noticed it — from WhatsApp receipts, from the job being
// opened in the portal, or from it being accepted.
//
//   node --test tests/assignments.test.mjs
//
// The logic tests need only the code; the rest need the local API and the test
// database and skip without them. Nothing reaches Fast2SMS (a stand-in for `fetch`
// is handed to the sender). Everything created is removed afterwards.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const svc = require('../server/modules/assignments/service.cjs');
const wa = require('../server/modules/whatsapp/service.cjs');
const API = 'http://127.0.0.1:5000/api';

// ── no database needed ──────────────────────────────────────────────────
test('the text pasted into the team group names the job, the customer and the technician', () => {
  const text = svc.groupText({
    kind: 'inquiry', ticket_no: 'TKT-9', service: 'CCTV repair', customer_name: 'Hotel Heevan', customer_phone: '9876543210',
    place: 'Dalgate', employee_name: 'Rashid',
  });
  for (const part of ['TKT-9', 'CCTV repair', 'Hotel Heevan', '9876543210', 'Dalgate', 'Rashid']) assert.ok(text.includes(part), `the message should say ${part}`);
  assert.match(text, /New service assigned/);
  assert.match(svc.groupText({ kind: 'installation', customer_name: 'x' }), /New installation assigned/);
});

test('the job_assignment message lists its details in the order the template is written', () => {
  const def = wa.PURPOSES.job_assignment;
  assert.equal(def.vars.length, 5);
  assert.equal(def.sample.length, 5);
  assert.equal((def.suggested.match(/\{\{\d\}\}/g) || []).length, 5);
  assert.equal(def.media, false);
});

// ── against the database ────────────────────────────────────────────────
let mysql; let jwt; let db; let tokens; let reachable = false;
let businessId; let before;
const made = { employees: [], inquiries: [], installations: [], phones: [] };

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/assignments/tracker`).catch(() => null);
  reachable = !!probe && probe.status === 401;
  if (reachable) {
    db = await mysql.createConnection({
      host: process.env.DB_HOST, user: process.env.DB_USER,
      password: process.env.DB_PASS, database: process.env.DB_NAME,
    });
    const [[admin]] = await db.query("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1");
    const sign = (id, role) => jwt.sign({ id, email: `${role}@test.local`, role, worker_type: 'fixed' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    tokens = { admin: sign(admin.id, 'admin'), sign };
    const [[biz]] = await db.query('SELECT id FROM businesses WHERE is_default = 1 LIMIT 1');
    businessId = biz.id;
    const [[s]] = await db.query('SELECT * FROM whatsapp_settings WHERE business_id = ?', [businessId]);
    const [t] = await db.query('SELECT * FROM whatsapp_templates WHERE business_id = ?', [businessId]);
    before = { settings: s || null, templates: t };
  }
} catch { reachable = false; }

const skip = reachable ? false : 'needs the local API on port 5000 and the test database';
const call = async (method, path, body, token = tokens?.admin) => {
  const res = await fetch(API + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const KEY = 'test-key-not-real';
const recorder = () => {
  const seen = [];
  const fetchImpl = async (url) => { seen.push(new URL(url)); return { ok: true, status: 200, json: async () => ({ status: true, request_id: `req-${seen.length}` }) }; };
  return { seen, fetchImpl };
};
const setupWhatsapp = (over = {}) => wa.saveSettings(db, {
  businessId, user: null,
  payload: { enabled: true, phone_number_id: '579519398574288', templates: [{ purpose: 'job_assignment', message_id: '21' }], ...over },
});
const getConn = async () => ({ query: db.query.bind(db), release() {} });
// Messages are stamped to the second, so two sent in the same second would not have an order.
const nextSecond = () => new Promise((r) => setTimeout(r, 1100));

let tech; let techToken; let job;
const trackerRow = async (id, filter = 'all') => (await call('GET', `/assignments/tracker?filter=${filter}`)).body.rows.find((r) => r.id === id);

test('set up: a technician and a service request assigned to them', { skip }, async () => {
  tech = { id: randomUUID(), name: 'ZZ Assign Tech', phone: '9000000951' };
  await db.query('INSERT INTO profiles SET ?', [{ id: tech.id, full_name: tech.name, role: 'employee', phone: tech.phone }]);
  made.employees.push(tech.id);
  techToken = tokens.sign(tech.id, 'employee');

  job = { id: randomUUID(), ticket_no: `ZZAS-${Date.now() % 100000}` };
  await db.query('INSERT INTO inquiries SET ?', [{
    id: job.id, full_name: 'ZZ Assign Customer', phone: '9000000952', service_item: 'ZZ CCTV repair', location: 'ZZ Lane, Srinagar',
    ticket_no: job.ticket_no, status: 'assigned', assignment_status: 'pending', assigned_employee_id: tech.id,
  }]);
  await db.query('UPDATE inquiries SET assigned_at = NOW() WHERE id = ?', [job.id]);
  made.inquiries.push(job.id);
});

test('with WhatsApp not set up the job is still tracked, as "not sent"', { skip }, async () => {
  await db.query('DELETE FROM whatsapp_templates WHERE business_id = ?', [businessId]);
  await db.query('DELETE FROM whatsapp_settings WHERE business_id = ?', [businessId]);
  await db.query('UPDATE inquiries SET assignment_seen_at = NOW() WHERE id = ?', [job.id]);

  const { seen, fetchImpl } = recorder();
  const out = await svc.announce(getConn, { kind: 'inquiry', id: job.id, employeeId: tech.id, fetchImpl, apiKey: KEY });
  assert.equal(out.ok, false, 'nothing can be sent yet');
  assert.equal(seen.length, 0);
  const [[row]] = await db.query('SELECT assignment_seen_at FROM inquiries WHERE id = ?', [job.id]);
  assert.equal(row.assignment_seen_at, null, 'a new assignment starts unseen, whatever happened before');

  const r = await trackerRow(job.id, 'not_seen');
  assert.ok(r, 'it is on the not-seen list');
  assert.equal(r.whatsapp.state, 'not_sent');
  assert.equal(r.seen, false);
  assert.equal(r.employee_name, tech.name);
  assert.ok(r.group_text.includes(job.ticket_no));
});

test('assigning sends the WhatsApp message with the right details, and logs it', { skip }, async () => {
  await setupWhatsapp();
  const { seen, fetchImpl } = recorder();
  const out = await svc.announce(getConn, { kind: 'inquiry', id: job.id, employeeId: tech.id, fetchImpl, apiKey: KEY });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(seen.length, 1);
  const u = seen[0];
  assert.equal(u.searchParams.get('message_id'), '21');
  assert.equal(u.searchParams.get('numbers'), tech.phone, 'it goes to the technician, not the customer');
  assert.deepEqual(u.searchParams.get('variables_values').split('|'), [tech.name, job.ticket_no, 'ZZ Assign Customer', '9000000952', 'ZZ Lane, Srinagar']);

  const [[m]] = await db.query("SELECT * FROM whatsapp_messages WHERE ref_id = ? AND purpose = 'job_assignment'", [job.id]);
  assert.equal(m.ref_type, 'inquiry');
  assert.equal(m.status, 'sent');
  const r = await trackerRow(job.id);
  assert.equal(r.whatsapp.state, 'sent');
  assert.equal(r.seen, false, 'sent is not seen');
});

test('delivered and read arrive from the webhook and only move forward', { skip }, async () => {
  const hook = (status, extra = {}) => svc.handleWebhook(db, { webhook_type: 'status_update', status, message_id: 'wamid.ZZ-ASSIGN-1', recipient_id: `91${tech.phone}`, timestamp: String(Math.floor(Date.now() / 1000)), ...extra });

  const delivered = await hook('delivered');
  assert.equal(delivered.handled, true, JSON.stringify(delivered));
  let r = await trackerRow(job.id);
  assert.equal(r.whatsapp.state, 'delivered');
  assert.equal(r.seen, false, 'delivered is not seen either');
  const [[m]] = await db.query("SELECT provider_message_id FROM whatsapp_messages WHERE ref_id = ? AND purpose = 'job_assignment'", [job.id]);
  assert.equal(m.provider_message_id, 'wamid.ZZ-ASSIGN-1', 'the first update tells us the provider id');

  await hook('read');
  r = await trackerRow(job.id);
  assert.equal(r.whatsapp.state, 'read');
  assert.equal(r.seen, true);
  assert.equal(r.seen_via, 'whatsapp');
  assert.equal(((await call('GET', '/assignments/tracker?filter=not_seen')).body.rows).some((x) => x.id === job.id), false, 'a read job leaves the not-seen list');

  await hook('delivered');
  assert.equal((await trackerRow(job.id)).whatsapp.state, 'read', 'a late "delivered" does not undo "read"');

  // The next updates find the message by its provider id, even for a number that has had other messages since.
  const again = await svc.handleWebhook(db, { webhook_type: 'status_update', status: 'read', message_id: 'wamid.ZZ-ASSIGN-1', recipient_id: '910000000000' });
  assert.equal(again.handled, true);

  assert.equal((await svc.handleWebhook(db, { webhook_type: 'status_update', status: 'read', message_id: 'wamid.NO-SUCH', recipient_id: '919111111111' })).handled, false, 'an update for a message we never sent is ignored');
  assert.equal((await svc.handleWebhook(db, { webhook_type: 'status_update', status: 'weird', recipient_id: tech.phone })).handled, false);
});

test('a failed delivery is shown with its reason', { skip }, async () => {
  // A fresh assignment, then the phone cannot be reached.
  await nextSecond();
  const { fetchImpl } = recorder();
  await svc.announce(getConn, { kind: 'inquiry', id: job.id, employeeId: tech.id, force: true, fetchImpl, apiKey: KEY });
  await svc.handleWebhook(db, { webhook_type: 'status_update', status: 'failed', message_id: 'wamid.ZZ-ASSIGN-2', recipient_id: tech.phone, error_message: 'Number is not on WhatsApp' });
  const r = await trackerRow(job.id);
  assert.equal(r.whatsapp.state, 'failed');
  assert.match(r.whatsapp.error, /not on WhatsApp/);
  assert.equal(r.seen, false);
});

test('opening the job counts as seen — but only for the person it was assigned to', { skip }, async () => {
  const stranger = tokens.sign(randomUUID(), 'employee');
  assert.equal((await call('POST', `/assignments/inquiry/${job.id}/seen`, null, stranger)).body.ok, false, 'someone else opening it proves nothing');
  assert.equal((await trackerRow(job.id)).app_opened_at, null);

  const mine = await call('POST', `/assignments/inquiry/${job.id}/seen`, null, techToken);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.ok, true);
  const r = await trackerRow(job.id);
  assert.ok(r.app_opened_at);
  assert.equal(r.seen, true);
  assert.equal(r.seen_via, 'app');

  const first = r.app_opened_at;
  await call('POST', `/assignments/inquiry/${job.id}/seen`, null, techToken);
  assert.equal(new Date((await trackerRow(job.id)).app_opened_at).getTime(), new Date(first).getTime(), 'the first time is kept');

  assert.equal((await call('POST', `/assignments/nonsense/${job.id}/seen`, null, techToken)).status, 404);
});

test('giving the job to someone again makes it unseen again', { skip }, async () => {
  await nextSecond();
  const { fetchImpl } = recorder();
  await svc.announce(getConn, { kind: 'inquiry', id: job.id, employeeId: tech.id, force: true, fetchImpl, apiKey: KEY });
  const r = await trackerRow(job.id);
  assert.equal(r.app_opened_at, null);
  assert.equal(r.whatsapp.state, 'sent', 'the new message is the one shown');
  assert.equal(r.seen, false);
});

test('accepting counts as seen, and a finished job is no longer chased', { skip }, async () => {
  await db.query("UPDATE inquiries SET assignment_status = 'accepted' WHERE id = ?", [job.id]);
  let r = await trackerRow(job.id);
  assert.equal(r.accepted, true);
  assert.equal(r.seen, true);
  assert.equal(r.seen_via, 'accepted');
  assert.equal((await call('GET', '/assignments/tracker?filter=not_accepted')).body.rows.some((x) => x.id === job.id), false);

  await db.query("UPDATE inquiries SET status = 'resolved' WHERE id = ?", [job.id]);
  assert.equal(await trackerRow(job.id), undefined, 'a resolved job leaves the list');
  await db.query("UPDATE inquiries SET status = 'assigned', assignment_status = 'pending' WHERE id = ?", [job.id]);
});

test('the list can be narrowed, counted, and resent from', { skip }, async () => {
  const all = await call('GET', '/assignments/tracker?filter=all');
  assert.equal(all.status, 200);
  assert.ok(all.body.counts.all >= 1 && all.body.counts.not_seen >= 1);
  assert.equal(all.body.filter, 'all');
  assert.equal((await call('GET', '/assignments/tracker?filter=rubbish')).body.filter, 'not_seen', 'an unknown filter falls back to the useful one');

  const denied = await call('GET', '/assignments/tracker', null, techToken);
  assert.equal(denied.status, 403, 'a technician cannot read everyone\'s tracker');

  // (Resending itself is not exercised here: the route uses the real sender, which would reach Fast2SMS.)
  assert.equal((await call('POST', `/assignments/inquiry/${randomUUID()}/resend`)).status, 404, 'a job that does not exist');
  const [[unassigned]] = [[{ id: randomUUID() }]];
  await db.query('INSERT INTO inquiries SET ?', [{ id: unassigned.id, full_name: 'ZZ Nobody', phone: '9000000955', ticket_no: `ZZASN-${Date.now() % 100000}` }]);
  made.inquiries.push(unassigned.id);
  assert.equal((await call('POST', `/assignments/inquiry/${unassigned.id}/resend`)).status, 409, 'a job nobody has been given');
});

test('an installation is tracked the same way', { skip }, async () => {
  const id = randomUUID();
  await db.query('INSERT INTO installations SET ?', [{
    id, ticket_no: `ZZASI-${Date.now() % 100000}`, full_name: 'ZZ Install Customer', phone: '9000000954', location: 'ZZ', installation_type: 'ZZ 4 cameras',
    preferred_date: '2026-10-05', preferred_time: 'Morning', address: 'ZZ Install Road', status: 'assigned', assignment_status: 'pending', assigned_employee_id: tech.id,
  }]);
  await db.query('UPDATE installations SET assigned_at = NOW() WHERE id = ?', [id]);
  made.installations.push(id);

  const { seen, fetchImpl } = recorder();
  const out = await svc.announce(getConn, { kind: 'installation', id, employeeId: tech.id, fetchImpl, apiKey: KEY });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(seen[0].searchParams.get('variables_values').split('|')[4], 'ZZ Install Road');

  let r = await trackerRow(id);
  assert.equal(r.kind, 'installation');
  assert.equal(r.seen, false);
  assert.match(r.group_text, /New installation assigned/);

  assert.equal((await call('POST', `/assignments/installation/${id}/seen`, null, techToken)).body.ok, true);
  r = await trackerRow(id);
  assert.equal(r.seen, true);
});

test('the webhook route takes status updates, and a STOP only from a request that proves who it is', { skip }, async () => {
  // Through the real route, without our secret (the local server has none set): receipts are taken…
  const res = await call('POST', '/webhook/fast2sms-whatsapp', { webhook_type: 'status_update', status: 'delivered', message_id: 'wamid.ZZ-ROUTE', recipient_id: '919000000999' }, null);
  assert.equal(res.status, 200);

  // …but a STOP from an unproven request is ignored,
  const stranger = '9000000953';
  made.phones.push(stranger);
  const ignored = await svc.handleWebhook(db, { webhook_type: 'incoming_message', status: 'received', from: `91${stranger}`, body: 'STOP' }, { trusted: false });
  assert.equal(ignored.handled, false);
  assert.equal((await db.query('SELECT 1 FROM marketing_optouts WHERE phone = ?', [stranger]))[0].length, 0);

  // while the same from a trusted one opts the number out of offers.
  const stopped = await svc.handleWebhook(db, { webhook_type: 'incoming_message', status: 'received', from: `91${stranger}`, body: ' Stop. ' }, { trusted: true });
  assert.equal(stopped.handled, true);
  assert.equal((await db.query('SELECT 1 FROM marketing_optouts WHERE phone = ?', [stranger]))[0].length, 1);

  // An ordinary reply is not a STOP.
  const chat = await svc.handleWebhook(db, { webhook_type: 'incoming_message', from: '919000000960', body: 'ok, on my way' }, { trusted: true });
  assert.equal(chat.handled, false);
});

test.after(async () => {
  if (!db) return;
  try {
    const ids = made.inquiries.length ? made.inquiries : ['none'];
    await db.query('DELETE FROM whatsapp_messages WHERE ref_id IN (?)', [[...ids, ...made.installations, 'none']]);
    await db.query('DELETE FROM inquiries WHERE id IN (?)', [ids]);
    if (made.installations.length) await db.query('DELETE FROM installations WHERE id IN (?)', [made.installations]);
    if (made.employees.length) await db.query('DELETE FROM profiles WHERE id IN (?)', [made.employees]);
    if (made.phones.length) await db.query('DELETE FROM marketing_optouts WHERE phone IN (?)', [made.phones]);
    await db.query("DELETE FROM whatsapp_messages WHERE provider_message_id LIKE 'wamid.ZZ-%'");

    await db.query('DELETE FROM whatsapp_templates WHERE business_id = ?', [businessId]);
    for (const t of before.templates) await db.query('INSERT INTO whatsapp_templates SET ?', [t]);
    await db.query('DELETE FROM whatsapp_settings WHERE business_id = ?', [businessId]);
    if (before.settings) await db.query('INSERT INTO whatsapp_settings SET ?', [before.settings]);
  } finally {
    await db.end();
  }
});
