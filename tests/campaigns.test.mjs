// WhatsApp announcements: who a campaign reaches, the list frozen at scheduling,
// sending hours, the slow careful sender, the do-not-message list, and a campaign
// that stops itself when messages keep failing.
//
//   node --test tests/campaigns.test.mjs
//
// The first tests need nothing but the code. The rest need the local API and the
// test database and skip without them. Nothing here reaches Fast2SMS — the sender
// is handed a stand-in for `fetch` — and everything created is removed afterwards.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

// Raised above the default so a test database that holds real customers cannot
// push the test's own recipients past the first batch.
process.env.CAMPAIGN_RATE_PER_MINUTE = '500';

const require = createRequire(import.meta.url);
const camp = require('../server/modules/campaigns/service.cjs');
const wa = require('../server/modules/whatsapp/service.cjs');
const API = 'http://127.0.0.1:5000/api';

// ── no database needed ──────────────────────────────────────────────────
test('sending hours are 9 to 9 in India, whatever the server clock says', () => {
  assert.equal(camp.inSendingHours(new Date('2026-09-30T03:30:00Z')), true, '09:00 IST');
  assert.equal(camp.inSendingHours(new Date('2026-09-30T03:29:00Z')), false, '08:59 IST');
  assert.equal(camp.inSendingHours(new Date('2026-09-30T15:29:00Z')), true, '20:59 IST');
  assert.equal(camp.inSendingHours(new Date('2026-09-30T15:30:00Z')), false, '21:00 IST');
  assert.equal(camp.inSendingHours(new Date('2026-09-30T19:00:00Z')), false, 'the small hours of the night');
  assert.equal(camp.indiaHour(new Date('2026-09-30T18:30:00Z')), 0, 'midnight reads as 0, not 24');
});

test('the blanks are filled from the customer, the business, or fixed words', () => {
  const spec = [{ type: 'name' }, { type: 'text', value: '20% off AMC till Diwali' }, { type: 'business' }];
  assert.deepEqual(camp.resolveVariables(spec, { name: 'Sami Ullah', business: 'Networking Experts' }), ['Sami Ullah', '20% off AMC till Diwali', 'Networking Experts']);
  assert.deepEqual(camp.resolveVariables([{ type: 'name' }], { name: null, business: 'x' }), ['Customer'], 'never an empty name');
});

// ── against the test database ───────────────────────────────────────────
let mysql; let jwt; let db; let token; let reachable = false;
let businessId = null; let before = null; let seriesBefore = 0;
const made = { parties: [], inquiries: [], campaigns: [], contracts: [] };

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/campaigns`).catch(() => null);
  reachable = !!probe && probe.status === 401;
  if (reachable) {
    db = await mysql.createConnection({
      host: process.env.DB_HOST, user: process.env.DB_USER,
      password: process.env.DB_PASS, database: process.env.DB_NAME,
    });
    const [[admin]] = await db.query("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1");
    token = jwt.sign({ id: admin.id, email: 'admin@test.local', role: 'admin', worker_type: 'fixed' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const [[biz]] = await db.query('SELECT * FROM businesses WHERE is_default = 1 LIMIT 1');
    businessId = biz.id;
    const [[s]] = await db.query('SELECT * FROM whatsapp_settings WHERE business_id = ?', [businessId]);
    const [t] = await db.query('SELECT * FROM whatsapp_templates WHERE business_id = ?', [businessId]);
    before = { biz, settings: s || null, templates: t };
    [[{ n: seriesBefore }]] = await db.query("SELECT COUNT(*) AS n FROM number_series WHERE doc_type = 'amc_contract'");
  }
} catch { reachable = false; }

const skip = reachable ? false : 'needs the local API on port 5000 and the test database';
const call = async (method, path, body) => {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDay(d); };
const NOON_IST = new Date('2026-09-30T06:30:00Z');
const MIDNIGHT_IST = new Date('2026-09-30T19:00:00Z');
const KEY = 'test-key-not-real';

const recorder = (outcome = { status: true, request_id: 'r' }) => {
  const seen = [];
  return { seen, fetchImpl: async (url) => { seen.push(new URL(url)); return { ok: true, status: 200, json: async () => outcome }; } };
};
const P = { a: '9000000951', b: '9000000953', dup: '+91 90000 00951', opt: '9000000955', c: '9000000957', d: '9000000958', contact: '9000000961', contactAlsoCustomer: '9000000953' };
const zz = (list) => list.filter((r) => String(r.name || '').startsWith('ZZ'));
const mkParty = async (name, phone, extra = {}) => {
  const r = await call('POST', '/parties', { display_name: name, phone, place_of_supply_state_code: '01', ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  made.parties.push(r.body.id);
  return r.body;
};
/** Keeps only the test's own people in a scheduled campaign, so counts are exact. */
const onlyOurs = (id) => db.query("DELETE FROM wa_campaign_recipients WHERE campaign_id = ? AND name NOT LIKE 'ZZ%'", [id]);
const newCampaign = async (over = {}) => {
  const id = await camp.createCampaign(db, { businessId, user: null, baseUrl: 'https://portal.example', payload: { name: 'ZZ campaign', message_id: '21', variables: [{ type: 'name' }, { type: 'business' }], audience: { customers: true, segment: 'all' }, ...over } });
  made.campaigns.push(id);
  return id;
};
const setWhatsapp = (enabled = true) => wa.saveSettings(db, { businessId, user: null, payload: { enabled, phone_number_id: '579519398574288', templates: [] } });

let pA; let pB; let pOpt; let pAmc; let pLapsed; let pNone; let pWarr;

test('set up: customers, a supplier, contacts, contracts and a device', { skip }, async () => {
  await db.query(`UPDATE businesses SET state_code = '01', state_name = 'Jammu and Kashmir', setup_complete = 1 WHERE id = ?`, [businessId]);
  pA = await mkParty('ZZ Camp Alpha', P.a);
  await mkParty('ZZ Camp Alpha Again', P.dup);
  pB = await mkParty('ZZ Camp Bravo', P.b);
  await mkParty('ZZ Camp Bad Number', '12345');
  await mkParty('ZZ Camp Supplier', '9000000959', { kind: 'supplier' });
  pOpt = await mkParty('ZZ Camp OptOut', P.opt);
  pAmc = await mkParty('ZZ Camp Amc', P.c);
  pLapsed = await mkParty('ZZ Camp Lapsed', P.d);
  pNone = await mkParty('ZZ Camp NoAmc', '9000000962');
  pWarr = await mkParty('ZZ Camp Warranty', '9000000963');

  for (const [pid, s, e] of [[pAmc.id, -100, 265], [pLapsed.id, -400, -35]]) {
    const c = await call('POST', '/amc/contracts', { party_id: pid, title: 'ZZ AMC', start_date: inDays(s), end_date: inDays(e), amount: '1000' });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    made.contracts.push(c.body.contract.id);
  }
  const d = await call('POST', '/devices', { party_id: pWarr.id, category: 'dvr', model: 'ZZ DVR', installed_on: inDays(-300), warranty_until: inDays(30) });
  assert.equal(d.status, 201, JSON.stringify(d.body));

  for (const [name, phone] of [['ZZ Contact Only', P.contact], ['ZZ Contact Also Customer', P.contactAlsoCustomer]]) {
    const id = randomUUID();
    await db.query('INSERT INTO inquiries SET ?', [{ id, full_name: name, phone, ticket_no: `ZZC-${id.slice(0, 6)}`, service_item: 'CCTV', location: 'Srinagar', status: 'pending' }]);
    made.inquiries.push(id);
  }
  await db.query('DELETE FROM marketing_optouts WHERE phone = ?', [P.opt]);
});

test('the audience is customers, without duplicates, bad numbers, suppliers, or people who asked to stop', { skip }, async () => {
  const before = await camp.addOptouts(db, { businessId, user: null, numbers: P.opt, reason: 'ZZ asked to stop' });
  assert.equal(before.added, 1);

  const a = await camp.buildAudience(db, businessId, { customers: true, contacts: false });
  const phones = zz(a.recipients).map((r) => r.phone);
  assert.ok(phones.includes('9000000951'), 'a customer with a valid number');
  assert.equal(phones.filter((p) => p === '9000000951').length, 1, 'the same number written two ways is one person');
  assert.ok(phones.includes('9000000958'), 'a customer whose contract lapsed is still a customer');
  assert.ok(!phones.includes(P.opt), 'a number on the do-not-message list is left out');
  assert.ok(!phones.includes('9000000959'), 'a supplier is not a customer');
  assert.ok(!zz(a.recipients).some((r) => r.name === 'ZZ Camp Bad Number'), 'a number that is not a mobile is left out');
  assert.ok(a.stats.invalid >= 1 && a.stats.duplicates >= 1 && a.stats.opted_out >= 1);
  assert.ok(!phones.includes(P.contact), 'contacts are not included unless asked for');

  const withContacts = await camp.buildAudience(db, businessId, { customers: true, contacts: true });
  const both = zz(withContacts.recipients);
  assert.ok(both.some((r) => r.phone === P.contact), 'a contact who never became a customer');
  assert.equal(both.filter((r) => r.phone === P.b).length, 1, 'a contact who is also a customer is counted once');
  assert.equal(both.find((r) => r.phone === P.b).name, 'ZZ Camp Bravo', 'and keeps the customer record');

  const contactsOnly = await camp.buildAudience(db, businessId, { customers: false, contacts: true });
  assert.ok(zz(contactsOnly.recipients).every((r) => r.party_id === null));
  await assert.rejects(() => camp.buildAudience(db, businessId, { customers: false, contacts: false }), (e) => e.code === 'no_audience');
  await assert.rejects(() => camp.buildAudience(db, businessId, { customers: false, contacts: true, segment: 'amc_running' }), (e) => e.code === 'bad_segment');
});

test('segments pick customers by their contract and equipment', { skip }, async () => {
  const names = async (segment) => zz((await camp.buildAudience(db, businessId, { customers: true, segment })).recipients).map((r) => r.name);
  const running = await names('amc_running');
  assert.deepEqual(running.filter((n) => /Amc|Lapsed|NoAmc/.test(n)), ['ZZ Camp Amc']);
  const lapsed = await names('amc_lapsed');
  assert.deepEqual(lapsed.filter((n) => /Amc|Lapsed|NoAmc/.test(n)), ['ZZ Camp Lapsed'], 'ended and not renewed');
  const none = await names('no_amc');
  assert.ok(none.includes('ZZ Camp NoAmc') && !none.includes('ZZ Camp Amc') && !none.includes('ZZ Camp Lapsed'));
  assert.deepEqual((await names('warranty_ending')).filter((n) => /Warranty/.test(n)), ['ZZ Camp Warranty']);
});

test('a campaign cannot be scheduled until WhatsApp is on, and only once, and not into the past', { skip }, async () => {
  const id = await newCampaign();
  await setWhatsapp(false);
  await assert.rejects(() => camp.schedule(db, { businessId, id }), (e) => e.code === 'not_ready');
  await setWhatsapp(true);
  await assert.rejects(() => camp.schedule(db, { businessId, id, at: new Date(Date.now() - 3600000) }), (e) => e.code === 'past');
  await assert.rejects(() => camp.schedule(db, { businessId, id, at: 'garbage' }), (e) => e.code === 'bad_time');

  const out = await camp.schedule(db, { businessId, id, now: NOON_IST });
  assert.ok(out.recipients >= 1);
  const [[row]] = await db.query('SELECT status FROM wa_campaigns WHERE id = ?', [id]);
  assert.equal(row.status, 'scheduled');
  await assert.rejects(() => camp.schedule(db, { businessId, id }), (e) => e.code === 'not_draft');
  await assert.rejects(() => camp.updateCampaign(db, { businessId, id, payload: { name: 'changed' } }), (e) => e.code === 'not_draft', 'a scheduled campaign is not edited');
  await camp.setStatus(db, { businessId, id, action: 'cancel' });
});

test('the sender sends to each person, fills the blanks, marks them, and finishes', { skip }, async () => {
  const id = await newCampaign({ variables: [{ type: 'name' }, { type: 'text', value: '20% off AMC | till Diwali' }, { type: 'business' }], media_path: '/uploads/ZZ-poster.png' });
  await camp.schedule(db, { businessId, id, now: NOON_IST });
  await onlyOurs(id);
  const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM wa_campaign_recipients WHERE campaign_id = ?", [id]);
  assert.ok(Number(n) >= 5);

  const { seen, fetchImpl } = recorder();
  const first = await camp.tick({ getConn: async () => ({ query: (...a) => db.query(...a), release() {} }), now: NOON_IST, apiKey: KEY, fetchImpl, pauseMs: 0 });
  assert.equal(first.sent, Number(n));
  assert.equal(seen.length, Number(n), 'one message per person');

  const one = seen.find((u) => u.searchParams.get('numbers') === '9000000951');
  assert.equal(one.searchParams.get('message_id'), '21');
  assert.equal(one.searchParams.get('phone_number_id'), '579519398574288');
  const vars = one.searchParams.get('variables_values').split('|');
  assert.equal(vars.length, 3, 'a pipe in the words did not add a blank');
  assert.match(vars[0], /^ZZ Camp Alpha/, 'either record of the same number supplies the name');
  assert.match(vars[1], /20% off AMC till Diwali/);
  assert.equal(one.searchParams.get('media_url'), 'https://portal.example/uploads/ZZ-poster.png');

  const c = await camp.loadCampaign(db, businessId, id);
  assert.equal(c.status, 'done');
  assert.equal(c.progress.sent, Number(n));
  assert.equal(c.progress.queued, 0);
  assert.ok(!seen.some((u) => ['9000000955', '9000000959', '12345'].includes(u.searchParams.get('numbers'))), 'nobody who should be left out was messaged');

  const again = recorder();
  await camp.tick({ getConn: async () => ({ query: (...a) => db.query(...a), release() {} }), now: NOON_IST, apiKey: KEY, fetchImpl: again.fetchImpl, pauseMs: 0 });
  assert.equal(again.seen.length, 0, 'a finished campaign sends nothing more');
});

test('nothing goes out at night; the campaign waits for the morning', { skip }, async () => {
  const id = await newCampaign();
  await camp.schedule(db, { businessId, id, now: MIDNIGHT_IST });
  await onlyOurs(id);
  const getConn = async () => ({ query: (...a) => db.query(...a), release() {} });

  const night = recorder();
  const r = await camp.tick({ getConn, now: MIDNIGHT_IST, apiKey: KEY, fetchImpl: night.fetchImpl, pauseMs: 0 });
  assert.equal(night.seen.length, 0);
  assert.equal(r.waiting, 'outside sending hours');
  assert.equal((await camp.loadCampaign(db, businessId, id)).status, 'sending', 'started, but holding until sending hours');

  const morning = recorder();
  await camp.tick({ getConn, now: NOON_IST, apiKey: KEY, fetchImpl: morning.fetchImpl, pauseMs: 0 });
  assert.ok(morning.seen.length >= 5);
  assert.equal((await camp.loadCampaign(db, businessId, id)).status, 'done');
});

test('a campaign waits for its time', { skip }, async () => {
  const id = await newCampaign();
  const later = new Date(NOON_IST.getTime() + 3 * 3600 * 1000);
  await camp.schedule(db, { businessId, id, at: later, now: NOON_IST });
  await onlyOurs(id);
  const getConn = async () => ({ query: (...a) => db.query(...a), release() {} });
  const early = recorder();
  await camp.tick({ getConn, now: NOON_IST, apiKey: KEY, fetchImpl: early.fetchImpl, pauseMs: 0 });
  assert.equal(early.seen.length, 0);
  assert.equal((await camp.loadCampaign(db, businessId, id)).status, 'scheduled');
  const due = recorder();
  await camp.tick({ getConn, now: new Date(later.getTime() + 60000), apiKey: KEY, fetchImpl: due.fetchImpl, pauseMs: 0 });
  assert.ok(due.seen.length >= 5);
});

test('someone added to the do-not-message list after scheduling is not sent to', { skip }, async () => {
  const id = await newCampaign();
  await camp.schedule(db, { businessId, id, now: NOON_IST });
  await onlyOurs(id);
  await camp.addOptouts(db, { businessId, user: null, numbers: [P.a, 'not a number'], reason: 'ZZ changed their mind' });
  const [[r]] = await db.query("SELECT status, error FROM wa_campaign_recipients WHERE campaign_id = ? AND phone = ?", [id, P.a]);
  assert.equal(r.status, 'skipped');
  assert.match(r.error, /do-not-message/);

  const { seen, fetchImpl } = recorder();
  await camp.tick({ getConn: async () => ({ query: (...a) => db.query(...a), release() {} }), now: NOON_IST, apiKey: KEY, fetchImpl, pauseMs: 0 });
  assert.ok(!seen.some((u) => u.searchParams.get('numbers') === P.a));
  assert.ok(seen.length >= 4, 'everyone else still got it');
  const out = await camp.addOptouts(db, { businessId, user: null, numbers: 'abc, 123', reason: 'x' });
  assert.deepEqual([out.added, out.unreadable], [0, 2], 'unreadable numbers are counted, not stored');
  await camp.removeOptout(db, { businessId, phone: P.a });
});

test('a run of failures pauses the campaign instead of working through the whole list', { skip }, async () => {
  const id = await newCampaign();
  await camp.schedule(db, { businessId, id, now: NOON_IST });
  await onlyOurs(id);
  const refusing = recorder({ status: false, message: 'Template is not approved' });
  const notified = [];
  await camp.tick({ getConn: async () => ({ query: (...a) => db.query(...a), release() {} }), recordNotification: async (n) => { notified.push(n); }, now: NOON_IST, apiKey: KEY, fetchImpl: refusing.fetchImpl, pauseMs: 0 });
  assert.equal(refusing.seen.length, camp.FAILURES_BEFORE_PAUSE, 'it stopped after the fifth failure');
  const c = await camp.loadCampaign(db, businessId, id);
  assert.equal(c.status, 'paused');
  assert.match(c.pause_reason, /not approved/);
  assert.equal(c.progress.failed, camp.FAILURES_BEFORE_PAUSE);
  assert.ok(c.progress.queued >= 1, 'the rest are still waiting, not lost');
  assert.equal(notified[0].subject, 'campaign_paused');

  await camp.setStatus(db, { businessId, id, action: 'resume' });
  assert.equal((await camp.loadCampaign(db, businessId, id)).status, 'sending');
  await camp.setStatus(db, { businessId, id, action: 'cancel' });
  const cancelled = await camp.loadCampaign(db, businessId, id);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.progress.queued, 0, 'what was waiting will not go out');
});

test('a test message goes to one number, and the routes are for the owner', { skip }, async () => {
  const id = await newCampaign();
  const { seen, fetchImpl } = recorder();
  const out = await camp.testSend(db, { businessId, id, phone: '99060 00001', apiKey: KEY, fetchImpl });
  assert.equal(out.ok, true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].searchParams.get('numbers'), '9906000001');
  assert.equal(seen[0].searchParams.get('variables_values').split('|')[0], 'Test');
  await assert.rejects(() => camp.testSend(db, { businessId, id, phone: '12', apiKey: KEY, fetchImpl }), (e) => e.code === 'bad_phone');
  const [[c]] = await db.query('SELECT status FROM wa_campaigns WHERE id = ?', [id]);
  assert.equal(c.status, 'draft', 'a test does not start the campaign');

  const list = await call('GET', '/campaigns');
  assert.equal(list.status, 200);
  assert.ok(list.body.some((x) => x.id === id));
  const meta = await call('GET', '/campaigns/meta');
  assert.equal(meta.body.hours.from, 9);
  const preview = await call('POST', '/campaigns/audience', { customers: true, contacts: true });
  assert.equal(preview.status, 200);
  assert.ok(preview.body.will_send >= 5);
  assert.ok(preview.body.sample.every((s) => /^\d\d••••••\d\d$/.test(s.phone)), 'a preview does not show whole numbers');

  const bad = await call('POST', '/campaigns', { name: 'x', message_id: 'a; drop', variables: [] });
  assert.equal(bad.status, 400);
  const badVar = await call('POST', '/campaigns', { name: 'x', message_id: '5', variables: [{ type: 'text' }] });
  assert.equal(badVar.status, 400);
  const badMedia = await call('POST', '/campaigns', { name: 'x', message_id: '5', media_path: 'https://evil.example/x.png' });
  assert.equal(badMedia.status, 400, 'only files uploaded here can be attached');
  const tooMany = await call('POST', '/campaigns', { name: 'x', message_id: '5', variables: Array.from({ length: 6 }, () => ({ type: 'name' })) });
  assert.equal(tooMany.status, 400);

  const del = await call('DELETE', `/campaigns/${id}`);
  assert.equal(del.status, 200);
});

test.after(async () => {
  if (!db) return;
  try {
    await db.query('DELETE FROM wa_campaigns WHERE name LIKE ?', ['ZZ%']);
    await db.query('DELETE FROM marketing_optouts WHERE phone IN (?)', [['9000000951', '9000000953', '9000000955', '9000000957', '9000000958', '9000000961', '9000000962', '9000000963']]);
    if (made.inquiries.length) await db.query('DELETE FROM inquiries WHERE id IN (?)', [made.inquiries]);
    const Pn = made.parties.length ? made.parties : ['none'];
    await db.query('DELETE FROM customer_device_events WHERE device_id IN (SELECT id FROM customer_devices WHERE party_id IN (?))', [Pn]);
    await db.query('UPDATE customer_devices SET replaced_by_id = NULL WHERE party_id IN (?)', [Pn]);
    await db.query('DELETE FROM customer_devices WHERE party_id IN (?)', [Pn]);
    await db.query('DELETE FROM customer_sites WHERE party_id IN (?)', [Pn]);
    const C = made.contracts.length ? made.contracts : ['none'];
    await db.query('DELETE FROM amc_visits WHERE contract_id IN (?)', [C]);
    await db.query('UPDATE amc_contracts SET renewed_from_id = NULL, renewed_to_id = NULL WHERE party_id IN (?)', [Pn]);
    await db.query('DELETE FROM amc_contracts WHERE party_id IN (?)', [Pn]);
    await db.query("DELETE FROM audit_log WHERE entity_type IN ('customer_device', 'customer_site', 'wa_campaign') OR (action LIKE 'amc.%' AND entity_id IN (?))", [C]);
    for (const id of made.parties) {
      await db.query('DELETE FROM journal_lines WHERE party_id = ?', [id]);
      await db.query('DELETE FROM parties WHERE id = ?', [id]);
    }
    if (!seriesBefore) await db.query("DELETE FROM number_series WHERE doc_type = 'amc_contract'");
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
