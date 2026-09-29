// The site and device register: what is installed where, warranty worked out
// from dates, a swap that keeps the old record, the phone lookup a service
// request uses, and devices following a contract through its renewal.
//
//   node --test tests/devices.test.mjs
//
// The first tests need nothing but the code. The rest need the local API and
// test database and skip without them. Everything they create is removed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const devices = require('../server/modules/devices/service.cjs');
const API = 'http://127.0.0.1:5000/api';

// ── no database needed ──────────────────────────────────────────────────
const at = (y, m, d) => new Date(y, m - 1, d);

test('warranty is worked out from the date: in warranty, ending soon, expired, or not recorded', () => {
  const today = at(2026, 9, 29);
  assert.deepEqual(devices.warrantyOf(null, today), { state: 'none', days: null });
  assert.equal(devices.warrantyOf('2027-09-29', today).state, 'in_warranty');
  assert.equal(devices.warrantyOf('2026-11-20', today).state, 'ending', '52 days out');
  assert.equal(devices.warrantyOf('2026-11-28', today).state, 'ending', 'exactly 60 days is still "ending"');
  assert.equal(devices.warrantyOf('2026-11-29', today).state, 'in_warranty', '61 days is not');
  assert.equal(devices.warrantyOf('2026-09-29', today).state, 'ending', 'the last day is still covered');
  const gone = devices.warrantyOf('2026-09-01', today);
  assert.equal(gone.state, 'expired');
  assert.equal(gone.days, -28);
});

test('the summary counts units, not just entries', () => {
  const row = (over) => devices.shape({ party_id: 'p1', category: 'camera', quantity: 1, status: 'working', installed_on: '2026-01-01', warranty_until: '2027-01-01', ...over }, at(2026, 9, 29));
  const s = devices.summarise([
    row({ quantity: 8 }),
    row({ party_id: 'p2', category: 'dvr', warranty_until: '2026-10-15' }),
    row({ category: 'hdd', status: 'faulty', warranty_until: '2026-01-01' }),
    row({ status: 'replaced', quantity: 3 }),
  ]);
  assert.equal(s.devices, 3, 'a replaced device is not registered any more');
  assert.equal(s.units, 10);
  assert.equal(s.customers, 2);
  assert.equal(s.faulty, 1);
  assert.equal(s.warranty_ending, 1);
  assert.equal(s.in_warranty, 2);
});

test('a phone number matches whatever way it was written', () => {
  assert.equal(devices.last10('+91 98700-00001'), '9870000001');
  assert.equal(devices.last10('09870000001'), '9870000001');
  assert.equal(devices.last10('12345'), null);
});

// ── the API ─────────────────────────────────────────────────────────────
let mysql; let jwt; let db; let tokens; let reachable = false;
let businessBefore = null; let seriesBefore = 0;
const made = { parties: [], contracts: [] };

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/devices`).catch(() => null);
  reachable = !!probe && probe.status === 401;
  if (reachable) {
    db = await mysql.createConnection({
      host: process.env.DB_HOST, user: process.env.DB_USER,
      password: process.env.DB_PASS, database: process.env.DB_NAME,
    });
    const [[admin]] = await db.query("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1");
    const sign = (id, role) => jwt.sign({ id, email: `${role}@test.local`, role, worker_type: 'fixed' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    tokens = { admin: sign(admin.id, 'admin'), employee: sign(randomUUID(), 'employee') };
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
const SERIAL = `ZZDVR${Date.now().toString(36).toUpperCase()}`;

let party; let other; let site; let dvr; let contract;

test('set up: two customers and a site', { skip }, async () => {
  const [[biz]] = await db.query('SELECT * FROM businesses WHERE is_default = 1 LIMIT 1');
  businessBefore = biz;
  await db.query(`UPDATE businesses SET state_code = '01', state_name = 'Jammu and Kashmir', setup_complete = 1 WHERE id = ?`, [biz.id]);
  const a = await call('POST', '/parties', { display_name: 'ZZ Register Customer', phone: '9000000801', place_of_supply_state_code: '01' });
  const b = await call('POST', '/parties', { display_name: 'ZZ Other Customer', phone: '9000000802', place_of_supply_state_code: '01' });
  assert.equal(a.status, 201);
  party = a.body; other = b.body;
  made.parties.push(party.id, other.id);

  const s = await call('POST', '/device-sites', { party_id: party.id, name: 'ZZ Main shop', address: 'Lal Chowk' });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  site = s.body.site;
  assert.equal((await call('POST', '/device-sites', { party_id: party.id, name: '' })).status, 400, 'a site needs a name');
});

test('a device is registered with its history started, and read back with plain dates', { skip }, async () => {
  const r = await call('POST', '/devices', {
    party_id: party.id, site_id: site.id, category: 'dvr', brand: 'Hikvision', model: 'DS-7208HQHI', serial_no: SERIAL,
    location_note: 'Rack behind the counter', installed_on: inDays(-300), warranty_until: inDays(45), install_ref: 'ZZ-INV-1',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  dvr = r.body.device;
  assert.equal(dvr.installed_on, inDays(-300), 'a date is a date');
  assert.equal(dvr.warranty_state, 'ending');
  assert.equal(dvr.status, 'working');
  assert.equal(r.body.events.length, 1);
  assert.equal(r.body.events[0].kind, 'installed');

  const dup = await call('POST', '/devices', { party_id: other.id, category: 'dvr', model: 'x', serial_no: SERIAL });
  assert.equal(dup.status, 409, 'the same serial cannot be registered twice');
  assert.match(dup.body.error, /ZZ Register Customer/, 'and it says who has it');

  assert.equal((await call('POST', '/devices', { party_id: other.id, site_id: site.id, category: 'camera', model: 'x' })).status, 400, 'a site of a different customer');
  assert.equal((await call('POST', '/devices', { category: 'camera', model: 'x' })).status, 400, 'no customer');
  assert.equal((await call('POST', '/devices', { party_id: party.id, category: 'toaster', model: 'x' })).status, 400, 'not a kind of device');
  assert.equal((await call('POST', '/devices', { party_id: party.id, category: 'camera', model: 'x', installed_on: inDays(0), warranty_until: inDays(-5) })).status, 400, 'warranty before installation');
  assert.equal((await call('POST', '/devices', { party_id: party.id, category: 'camera', model: 'x', quantity: 0 })).status, 400);
});

test('several identical cameras are one entry with a quantity; the list filters and totals', { skip }, async () => {
  const cams = await call('POST', '/devices', {
    party_id: party.id, site_id: site.id, category: 'camera', brand: 'Hikvision', model: 'DS-2CE56 5MP', quantity: 8,
    installed_on: inDays(-300), warranty_until: inDays(400),
  });
  assert.equal(cams.status, 201);

  const all = await call('GET', `/devices?party_id=${party.id}`);
  assert.equal(all.body.devices.length, 2);
  assert.equal(all.body.summary.units, 9);
  assert.equal(all.body.summary.warranty_ending, 1);

  const ending = await call('GET', `/devices?party_id=${party.id}&warranty=ending`);
  assert.equal(ending.body.devices.length, 1);
  assert.equal(ending.body.devices[0].id, dvr.id);

  const bySerial = await call('GET', `/devices?q=${SERIAL}`);
  assert.equal(bySerial.body.devices.length, 1);
});

test('marking a device faulty and back is kept in its history', { skip }, async () => {
  const bad = await call('PATCH', `/devices/${dvr.id}`, { status: 'faulty' });
  assert.equal(bad.status, 200);
  assert.equal(bad.body.device.status, 'faulty');
  const ok = await call('PATCH', `/devices/${dvr.id}`, { status: 'working' });
  assert.equal(ok.body.device.status, 'working');
  assert.ok(ok.body.events.some((e) => /faulty/i.test(e.note)));
  assert.ok(ok.body.events.some((e) => /working order/i.test(e.note)));

  const ev = await call('POST', `/devices/${dvr.id}/events`, { kind: 'repair', note: 'ZZ changed the adapter', ticket_ref: 'ZZ-T-5' });
  assert.equal(ev.status, 201);
  assert.equal((await call('POST', `/devices/${dvr.id}/events`, { kind: 'repair' })).status, 400, 'a line about what was done');
  assert.equal((await call('POST', `/devices/${dvr.id}/events`, { kind: 'dance', note: 'x' })).status, 400);
});

test('a swap: the new device takes the old one\'s place, the old is kept as replaced', { skip }, async () => {
  const r = await call('POST', `/devices/${dvr.id}/replace`, { brand: 'Dahua', model: 'XVR5108', serial_no: `${SERIAL}N`, reason: 'ZZ burnt in a surge', ticket_ref: 'ZZ-T-6', warranty_until: inDays(700) });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const fresh = r.body.device;
  assert.equal(fresh.site_id, site.id, 'same site');
  assert.equal(fresh.location_note, 'Rack behind the counter', 'same spot');
  assert.equal(fresh.category, 'dvr');
  assert.equal(r.body.replaces.id, dvr.id);
  assert.ok(r.body.events.some((e) => /in place of/i.test(e.note)));

  const old = (await call('GET', `/devices/${dvr.id}`)).body;
  assert.equal(old.device.status, 'replaced');
  assert.equal(old.replaced_by.id, fresh.id);
  assert.ok(old.events.some((e) => e.kind === 'replaced' && /burnt/.test(e.note)));

  assert.equal((await call('PATCH', `/devices/${dvr.id}`, { notes: 'edit' })).status, 409, 'a swapped device keeps its record as it was');
  assert.equal((await call('POST', `/devices/${dvr.id}/replace`, { model: 'again' })).status, 409, 'and cannot be swapped twice');
  const list = await call('GET', `/devices?party_id=${party.id}`);
  assert.ok(!list.body.devices.some((d) => d.id === dvr.id), 'the replaced one is off the working list');
  assert.equal((await call('GET', `/devices?party_id=${party.id}&status=replaced`)).body.devices.length, 1, 'but still findable');
  dvr = fresh;
});

test('a device taken away can be put back, and only that', { skip }, async () => {
  const cam = (await call('GET', `/devices?party_id=${party.id}`)).body.devices.find((d) => d.category === 'camera');
  assert.equal((await call('PATCH', `/devices/${cam.id}`, { status: 'removed' })).status, 200);
  assert.equal((await call('PATCH', `/devices/${cam.id}`, { model: 'other' })).status, 409);
  const back = await call('PATCH', `/devices/${cam.id}`, { status: 'working' });
  assert.equal(back.status, 200);
  assert.equal(back.body.device.status, 'working');
});

test('a service request\'s phone number finds the customer, their equipment and their running contract', { skip }, async () => {
  const c = await call('POST', '/amc/contracts', { party_id: party.id, title: 'ZZ CCTV AMC', start_date: inDays(-100), end_date: inDays(265), amount: '10000', visits_included: 3 });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  contract = c.body.contract;
  made.contracts.push(contract.id);

  for (const written of ['9000000801', '+91 90000 00801', '090000-00801']) {
    const r = await call('GET', `/devices/lookup?phone=${encodeURIComponent(written)}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.parties.length, 1, `matched ${written}`);
    assert.equal(r.body.parties[0].party, 'ZZ Register Customer');
    assert.equal(r.body.parties[0].devices.length, 2);
    assert.equal(r.body.parties[0].sites[0].name, 'ZZ Main shop');
    assert.equal(r.body.parties[0].contracts[0].contract_no, contract.contract_no);
    assert.equal(r.body.parties[0].contracts[0].visits_left, 3);
  }
  assert.equal((await call('GET', '/devices/lookup?phone=9111111111')).body.parties.length, 0, 'an unknown number finds nobody');
  assert.equal((await call('GET', '/devices/lookup?phone=123')).body.parties.length, 0);
});

test('covering a customer\'s equipment with a contract, and the cover following a renewal', { skip }, async () => {
  const cover = await call('POST', `/amc/contracts/${contract.id}/cover-devices`, {});
  assert.equal(cover.status, 200, JSON.stringify(cover.body));
  assert.equal(cover.body.covered, 2);
  assert.equal((await call('POST', `/amc/contracts/${contract.id}/cover-devices`, {})).body.covered, 0, 'only what is not already covered');

  const linked = (await call('GET', `/devices?party_id=${party.id}`)).body.devices;
  assert.ok(linked.every((d) => d.amc_contract_id === contract.id));
  assert.equal(linked[0].amc_contract_no, contract.contract_no);

  const theirs = await call('POST', '/amc/contracts', { party_id: other.id, title: 'ZZ other AMC', start_date: inDays(0), end_date: inDays(300), amount: '1' });
  made.contracts.push(theirs.body.contract.id);
  assert.equal((await call('POST', '/devices', { party_id: party.id, category: 'camera', model: 'y', amc_contract_id: theirs.body.contract.id })).status, 400, 'a contract of a different customer');

  const renewed = await call('POST', `/amc/contracts/${contract.id}/renew`, {});
  assert.equal(renewed.status, 201, JSON.stringify(renewed.body));
  made.contracts.push(renewed.body.contract.id);
  const after = (await call('GET', `/devices?party_id=${party.id}`)).body.devices;
  assert.ok(after.every((d) => d.amc_contract_id === renewed.body.contract.id), 'the equipment is on the new term');
});

test('who may look and who may change', { skip }, async () => {
  assert.equal((await call('GET', '/devices', null, 'employee')).status, 200, 'a technician can look things up');
  assert.equal((await call('POST', '/devices', { party_id: party.id, category: 'camera', model: 'x' }, 'employee')).status, 403);
  assert.equal((await call('PATCH', `/devices/${dvr.id}`, { notes: 'x' }, 'employee')).status, 403);
  assert.equal((await call('POST', '/device-sites', { party_id: party.id, name: 'x' }, 'employee')).status, 403);
});

test('a site that still has devices cannot be closed', { skip }, async () => {
  const r = await call('PATCH', `/device-sites/${site.id}`, { active: false });
  assert.equal(r.status, 409);
  assert.equal((await call('PATCH', `/device-sites/${site.id}`, { name: 'ZZ Main shop (renamed)' })).status, 200);
});

test.after(async () => {
  if (!db) return;
  try {
    const P = made.parties.length ? made.parties : ['none'];
    await db.query('DELETE FROM customer_device_events WHERE device_id IN (SELECT id FROM customer_devices WHERE party_id IN (?))', [P]);
    await db.query('UPDATE customer_devices SET replaced_by_id = NULL WHERE party_id IN (?)', [P]);
    await db.query('DELETE FROM customer_devices WHERE party_id IN (?)', [P]);
    await db.query('DELETE FROM customer_sites WHERE party_id IN (?)', [P]);
    const C = made.contracts.length ? made.contracts : ['none'];
    await db.query('DELETE FROM amc_visits WHERE contract_id IN (?)', [C]);
    await db.query('UPDATE amc_contracts SET renewed_from_id = NULL, renewed_to_id = NULL WHERE party_id IN (?)', [P]);
    await db.query('DELETE FROM amc_contracts WHERE party_id IN (?)', [P]);
    for (const id of made.parties) {
      await db.query('DELETE FROM journal_lines WHERE party_id = ?', [id]);
      await db.query('DELETE FROM parties WHERE id = ?', [id]);
    }
    await db.query("DELETE FROM audit_log WHERE entity_type IN ('customer_device', 'customer_site') OR (action LIKE 'amc.%' AND entity_id IN (?))", [C]);
    if (!seriesBefore) await db.query("DELETE FROM number_series WHERE doc_type = 'amc_contract'");
    if (businessBefore) {
      await db.query('UPDATE businesses SET state_code = ?, state_name = ?, setup_complete = ? WHERE id = ?',
        [businessBefore.state_code, businessBefore.state_name, businessBefore.setup_complete, businessBefore.id]);
    }
  } finally {
    await db.end();
  }
});
