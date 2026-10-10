// Who may book a service: not with a payment pending, not from outside the area.
//
//   node --test tests/booking-rules.test.mjs
//
// Skips when the API or the database is absent. It switches the rules on for the test and puts the settings back.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const API = 'http://127.0.0.1:5000/api';

let mysql; let jwt; let db; let adminToken; let reachable = false;
const made = { inquiries: [], parties: [] };
let originalRules = null;

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/parties`).catch(() => null);
  reachable = !!probe && probe.status === 401;
  if (reachable) {
    db = await mysql.createConnection({
      host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME,
    });
    const [[admin]] = await db.query("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1");
    adminToken = jwt.sign({ id: admin.id, email: 'admin@test.local', role: 'admin', worker_type: 'fixed' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  }
} catch { reachable = false; }

const skip = reachable ? false : 'needs the local API on port 5000 and the test database';

const admin = async (method, path, body) => {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const open = async (method, path, body) => {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const PHONE = '9000000771';
const addTicket = async (patch = {}) => {
  const id = randomUUID();
  await db.query('INSERT INTO inquiries SET ?', [{
    id, full_name: 'ZZ Booking Rules', phone: `+91${PHONE}`, ticket_no: `ZZBR-${id.slice(0, 6)}`, status: 'resolved',
    bill_total: 1500, payment_status: 'unpaid', ...patch,
  }]);
  made.inquiries.push(id);
  return id;
};

test('set up: switch the rules on, with a 60 km circle', { skip }, async () => {
  const before = await admin('GET', '/settings/booking-rules');
  assert.equal(before.status, 200);
  originalRules = before.body;
  const saved = await admin('PUT', '/settings/booking-rules', { blockOnDues: true, minDuesRupees: 0, radiusKm: 60 });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.radiusKm, 60);
});

test('an unpaid bill on this number blocks a new booking, and a paid one does not', { skip }, async () => {
  const id = await addTicket();
  const blocked = await open('POST', '/booking/precheck', { phone: `+91${PHONE}` });
  assert.equal(blocked.body.ok, false);
  assert.equal(blocked.body.code, 'PENDING_PAYMENT');
  assert.equal(blocked.body.pending_paise, 150000);
  assert.match(blocked.body.message, /repay your previous payment first/i);

  // Typed another way, it is still the same person.
  const same = await open('POST', '/booking/precheck', { phone: `0${PHONE}` });
  assert.equal(same.body.code, 'PENDING_PAYMENT');

  await db.query("UPDATE inquiries SET payment_status = 'paid' WHERE id = ?", [id]);
  const free = await open('POST', '/booking/precheck', { phone: `+91${PHONE}` });
  assert.equal(free.body.ok, true);
});

test('the booking itself is refused with the same answer, so the form is not the only lock', { skip }, async () => {
  await addTicket();
  const res = await open('POST', '/data/inquiries', {
    full_name: 'ZZ Booking Rules', phone: `+91${PHONE}`, location: 'GPS: 34.0900, 74.8000', service_item: 'CCTV',
    ticket_no: `ZZBR-NEW-${Date.now() % 100000}`, preferred_time: 'Morning',
  });
  assert.equal(res.status, 422);
  assert.equal(res.body.code, 'PENDING_PAYMENT');
});

test('a customer the owner has cleared can book with a payment pending', { skip }, async () => {
  const party = await admin('POST', '/parties', { display_name: 'ZZ Cleared Customer', phone: PHONE, kind: 'customer', booking_exempt: true });
  assert.equal(party.status, 201, JSON.stringify(party.body));
  made.parties.push(party.body.id);
  const res = await open('POST', '/booking/precheck', { phone: `+91${PHONE}` });
  assert.equal(res.body.ok, true);
  await db.query('UPDATE parties SET booking_exempt = 0 WHERE id = ?', [party.body.id]);
  assert.equal((await open('POST', '/booking/precheck', { phone: `+91${PHONE}` })).body.code, 'PENDING_PAYMENT');
});

test('ignoring small amounts lets a tiny balance through', { skip }, async () => {
  await admin('PUT', '/settings/booking-rules', { blockOnDues: true, minDuesRupees: 2000, radiusKm: 60 });
  assert.equal((await open('POST', '/booking/precheck', { phone: `+91${PHONE}` })).body.ok, true);
  await admin('PUT', '/settings/booking-rules', { blockOnDues: true, minDuesRupees: 0, radiusKm: 60 });
});

test('distance: near Srinagar is fine, Delhi is not', { skip }, async () => {
  const CLEAN = '9000000772'; // no bills
  const near = await open('POST', '/booking/precheck', { phone: `+91${CLEAN}`, lat: 34.0900, lng: 74.8100 });
  assert.equal(near.body.ok, true);

  const far = await open('POST', '/booking/precheck', { phone: `+91${CLEAN}`, lat: 28.6139, lng: 77.2090 });
  assert.equal(far.body.ok, false);
  assert.equal(far.body.code, 'OUT_OF_AREA');
  assert.ok(far.body.distance_km > 500);
  assert.equal(far.body.radius_km, 60);

  // The form writes "GPS: lat, lng" when it has no street name; that counts too.
  const text = await open('POST', '/booking/precheck', { phone: `+91${CLEAN}`, location: 'GPS: 28.61390, 77.20900' });
  assert.equal(text.body.code, 'OUT_OF_AREA');

  const refused = await open('POST', '/data/inquiries', {
    full_name: 'ZZ Far Away', phone: `+91${CLEAN}`, location: 'Delhi', customer_lat: 28.6139, customer_lng: 77.2090,
    service_item: 'CCTV', ticket_no: `ZZBR-FAR-${Date.now() % 100000}`, preferred_time: 'Morning',
  });
  assert.equal(refused.status, 422);
  assert.equal(refused.body.code, 'OUT_OF_AREA');
});

test('radius 0 means no limit', { skip }, async () => {
  await admin('PUT', '/settings/booking-rules', { blockOnDues: false, minDuesRupees: 0, radiusKm: 0 });
  const res = await open('POST', '/booking/precheck', { phone: `+91${PHONE}`, lat: 28.6139, lng: 77.2090 });
  assert.equal(res.body.ok, true);
});

test('only an admin can read or change the rules', { skip }, async () => {
  assert.equal((await open('POST', '/booking/precheck', {})).status, 200); // public, and harmless with no phone
  const anon = await fetch(`${API}/settings/booking-rules`);
  assert.equal(anon.status, 401);
  const bad = await admin('PUT', '/settings/booking-rules', { radiusKm: -5 });
  assert.equal(bad.status, 400);
});

test.after(async () => {
  if (!db) return;
  if (originalRules) {
    await admin('PUT', '/settings/booking-rules', {
      blockOnDues: originalRules.blockOnDues, minDuesRupees: originalRules.minDuesRupees, radiusKm: originalRules.radiusKm,
    }).catch(() => {});
  }
  if (made.inquiries.length) await db.query('DELETE FROM inquiries WHERE id IN (?)', [made.inquiries]);
  await db.query("DELETE FROM inquiries WHERE ticket_no LIKE 'ZZBR-%'");
  if (made.parties.length) await db.query('DELETE FROM parties WHERE id IN (?)', [made.parties]);
  await db.end();
});
