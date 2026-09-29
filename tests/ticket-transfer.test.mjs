// Moving a service request to another technician after the first has accepted
// it — or never answered.
//
//   node --test tests/ticket-transfer.test.mjs
//
// Needs the local API and test database; skips without them. Everything it
// creates is removed at the end.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const API = 'http://127.0.0.1:5000/api';

let mysql; let jwt; let db; let tokens; let reachable = false;
let techA; let techB;
const made = { inquiries: [], profiles: [] };
const startedAt = new Date();

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/admin/inquiries/x/transfer`, { method: 'POST' }).catch(() => null);
  reachable = !!probe && probe.status === 401;
  if (reachable) {
    db = await mysql.createConnection({
      host: process.env.DB_HOST, user: process.env.DB_USER,
      password: process.env.DB_PASS, database: process.env.DB_NAME,
    });
    const [[admin]] = await db.query("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1");
    // Two technicians of our own, neither allowed to assign tickets, so the test
    // does not depend on who happens to be in the database.
    techA = randomUUID();
    techB = randomUUID();
    for (const [id, name] of [[techA, 'ZZ Transfer Tech A'], [techB, 'ZZ Transfer Tech']]) {
      await db.query("INSERT INTO profiles (id, full_name, role, can_assign_tickets) VALUES (?, ?, 'employee', 0)", [id, name]);
      made.profiles.push(id);
    }
    const sign = (id, role) => jwt.sign({ id, email: `${role}@test.local`, role, worker_type: 'fixed' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    tokens = { admin: sign(admin.id, 'admin'), employee: sign(techA, 'employee') };
  }
} catch { reachable = false; }

const skip = reachable ? false : 'needs the local API on port 5000 and the test database';

const call = async (path, body, who = 'admin') => {
  const res = await fetch(API + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` }, body: JSON.stringify(body || {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const request = async (over = {}) => {
  const id = randomUUID();
  await db.query('INSERT INTO inquiries SET ?', [{
    id, full_name: 'ZZ Transfer Customer', phone: '9000000801', ticket_no: `ZZT-${id.slice(0, 6)}`, service_item: 'CCTV repair',
    location: 'Srinagar', status: 'assigned', assigned_employee_id: techA, assignment_status: 'accepted',
    assigned_at: new Date(Date.now() - 3600000), ...over,
  }]);
  made.inquiries.push(id);
  return id;
};
const rowOf = async (id) => (await db.query('SELECT * FROM inquiries WHERE id = ?', [id]))[0][0];
const eventually = async (fn, ms = 3000) => {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, 150));
  }
};

test('a request the first technician has accepted can be moved to another', { skip }, async () => {
  const id = await request();
  const before = await rowOf(id);
  const r = await call(`/admin/inquiries/${id}/transfer`, { employee_id: techB, reason: 'ZZ first technician is on leave' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.to, 'ZZ Transfer Tech');

  const after = await rowOf(id);
  assert.equal(after.assigned_employee_id, techB);
  assert.equal(after.assignment_status, 'pending', 'the new technician has to accept it');
  assert.equal(after.decline_reason, null);
  assert.equal(after.status, 'assigned');
  assert.ok(new Date(after.assigned_at) > new Date(before.assigned_at), 'the clock starts again with the new technician');

  const old = await eventually(async () => (await db.query(
    "SELECT * FROM notifications WHERE subject = 'assignment_transferred' AND audience_user = ? AND data LIKE ?", [techA, `%${id}%`]))[0][0]);
  assert.ok(old, 'the first technician is told it has moved');
  assert.match(old.body, /ZZ Transfer Tech/);
  assert.match(old.body, /on leave/, 'with the reason');
  const fresh = await eventually(async () => (await db.query(
    "SELECT * FROM notifications WHERE subject = 'new_assignment' AND audience_user = ? AND data LIKE ?", [techB, `%${id}%`]))[0][0]);
  assert.ok(fresh, 'the new technician gets it as a new assignment');

  const trail = await eventually(async () => (await db.query(
    "SELECT * FROM audit_log WHERE action = 'ticket.transfer' AND entity_id = ?", [id]))[0][0]);
  assert.ok(trail, 'who moved it is on record');
  assert.match(String(trail.reason), /on leave/);
});

test('a request nobody has answered can be moved too, and back again', { skip }, async () => {
  const id = await request({ assignment_status: 'pending' });
  assert.equal((await call(`/admin/inquiries/${id}/transfer`, { employee_id: techB })).status, 200);
  assert.equal((await call(`/admin/inquiries/${id}/transfer`, { employee_id: techA })).status, 200, 'and it can go back');
  assert.equal((await rowOf(id)).assigned_employee_id, techA);
});

test('what cannot be transferred is refused, with the reason, and left as it was', { skip }, async () => {
  const id = await request();
  assert.equal((await call(`/admin/inquiries/${id}/transfer`, {})).status, 400, 'no technician chosen');
  assert.equal((await call(`/admin/inquiries/${id}/transfer`, { employee_id: techA })).status, 400, 'already with them');
  assert.equal((await call(`/admin/inquiries/${id}/transfer`, { employee_id: randomUUID() })).status, 400, 'no such technician');
  assert.equal((await call(`/admin/inquiries/${randomUUID()}/transfer`, { employee_id: techB })).status, 404);

  const unassigned = await request({ assigned_employee_id: null, assignment_status: null, status: 'pending' });
  const u = await call(`/admin/inquiries/${unassigned}/transfer`, { employee_id: techB });
  assert.equal(u.status, 409);
  assert.match(u.body.error, /not assigned yet/);

  const done = await request({ status: 'resolved' });
  assert.equal((await call(`/admin/inquiries/${done}/transfer`, { employee_id: techB })).status, 409, 'a finished request stays with whoever finished it');
  const paid = await request({ payment_status: 'paid' });
  assert.equal((await call(`/admin/inquiries/${paid}/transfer`, { employee_id: techB })).status, 409);
  const claimed = await request({ pool_status: 'claimed' });
  assert.equal((await call(`/admin/inquiries/${claimed}/transfer`, { employee_id: techB })).status, 409, 'a gig worker\'s claimed job');

  for (const untouched of [id, done, paid, claimed]) assert.equal((await rowOf(untouched)).assigned_employee_id, techA);
});

test('only someone who may assign tickets can transfer one', { skip }, async () => {
  const id = await request();
  assert.equal((await call(`/admin/inquiries/${id}/transfer`, { employee_id: techB }, 'employee')).status, 403);
  assert.equal((await rowOf(id)).assigned_employee_id, techA);
});

test.after(async () => {
  if (!db) return;
  try {
    for (const id of made.inquiries) {
      await db.query('DELETE FROM notifications WHERE data LIKE ?', [`%${id}%`]);
      await db.query("DELETE FROM audit_log WHERE action = 'ticket.transfer' AND entity_id = ?", [id]);
    }
    if (made.inquiries.length) await db.query('DELETE FROM inquiries WHERE id IN (?)', [made.inquiries]);
    for (const id of made.profiles) await db.query('DELETE FROM profiles WHERE id = ?', [id]);
    void startedAt;
  } finally {
    await db.end();
  }
});
