// The 3-day verification call. A call that did not reach a result — the customer did not pick
// up, or asked to be called later — must keep the job in "Awaiting Verification", booked for a new
// time, instead of making it disappear.
//
//   node --test tests/verification-call.test.mjs
//
// Needs the local API on port 5000 and the test database; skips without them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const API = 'http://127.0.0.1:5000/api';

let mysql; let jwt; let db; let tokens; let reachable = false;
const made = { inquiries: [] };

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/job-cards?status=awaiting-verification`).catch(() => null);
  reachable = !!probe && probe.status === 401;
  if (reachable) {
    db = await mysql.createConnection({
      host: process.env.DB_HOST, user: process.env.DB_USER,
      password: process.env.DB_PASS, database: process.env.DB_NAME,
    });
    const [[admin]] = await db.query("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1");
    const sign = (id, role) => jwt.sign({ id, email: `${role}@test.local`, role, worker_type: 'fixed' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    tokens = { admin: sign(admin.id, 'admin'), employee: sign(randomUUID(), 'employee') };
  }
} catch { reachable = false; }

const skip = reachable ? false : 'needs the local API on port 5000 and the test database';
const call = async (method, path, body, who = 'admin') => {
  const res = await fetch(API + path, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const queue = async () => (await call('GET', '/job-cards?status=awaiting-verification')).body;
const row = async (id) => (await db.query('SELECT * FROM inquiries WHERE id = ?', [id]))[0][0];

let id;
test('set up: a job whose job card was filled and whose call is due', { skip }, async () => {
  id = randomUUID();
  await db.query('INSERT INTO inquiries SET ?', [{
    id, full_name: 'ZZ Verify Customer', phone: '9000000990', ticket_no: `ZZVC-${Date.now() % 100000}`, status: 'resolved', feedback_rating: 4,
  }]);
  await db.query("UPDATE inquiries SET job_card_filled_at = NOW(), verification_due_at = NOW() - INTERVAL 1 HOUR, verification_reminder_sent = 1 WHERE id = ?", [id]);
  made.inquiries.push(id);
  const mine = (await queue()).find((r) => r.id === id);
  assert.ok(mine, 'it is waiting for its call');
  assert.equal(mine.verification_call_status, null);
});

test('"asked to call later" keeps the job in the list, booked for the time given', { skip }, async () => {
  const saved = await call('POST', `/inquiries/${id}/verification-call`, { status: 'call_later', note: 'Said he is busy, call after 5', call_again_at: '2026-12-05 17:00' });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));

  const mine = (await queue()).find((r) => r.id === id);
  assert.ok(mine, 'the job did not disappear');
  assert.equal(mine.verification_call_status, 'call_later');
  assert.equal(mine.verification_call_note, 'Said he is busy, call after 5');
  assert.equal(Number(mine.verification_attempts), 1);

  const r = await row(id);
  assert.match(new Date(r.verification_due_at).toLocaleString('en-CA', { hour12: false }), /2026-12-05,? 17:00/, 'due again at the time asked');
  assert.equal(Number(r.verification_reminder_sent), 0, 'so the reminder can fire again then');
  assert.equal(Number(r.feedback_rating), 4, 'a call that reached nobody does not change the rating');
});

test('"did not pick up" also keeps it, defaulting to tomorrow, and counts the tries', { skip }, async () => {
  const before = Date.now();
  const saved = await call('POST', `/inquiries/${id}/verification-call`, { status: 'unreachable' });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const mine = (await queue()).find((r) => r.id === id);
  assert.ok(mine);
  assert.equal(mine.verification_call_status, 'unreachable');
  assert.equal(Number(mine.verification_attempts), 2);
  const due = new Date((await row(id)).verification_due_at).getTime();
  assert.ok(Math.abs(due - (before + 86400000)) < 5 * 60 * 1000, 'about a day from now');
});

test('a time that is not a time is refused, and nothing changes', { skip }, async () => {
  const bad = await call('POST', `/inquiries/${id}/verification-call`, { status: 'call_later', call_again_at: 'next week' });
  assert.equal(bad.status, 400);
  assert.equal(Number((await row(id)).verification_attempts), 2);
  assert.equal((await call('POST', `/inquiries/${id}/verification-call`, { status: 'nonsense' })).status, 400);
});

test('only a real outcome — OK or an issue, with a rating — takes the job out of the list', { skip }, async () => {
  const noRating = await call('POST', `/inquiries/${id}/verification-call`, { status: 'confirmed_ok' });
  assert.equal(noRating.status, 400, 'a final outcome needs its rating');
  assert.ok((await queue()).some((r) => r.id === id), 'still waiting');

  const done = await call('POST', `/inquiries/${id}/verification-call`, { status: 'confirmed_ok', rating: 5, note: 'Happy' });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal((await queue()).some((r) => r.id === id), false, 'now it leaves');
  const r = await row(id);
  assert.equal(Number(r.feedback_rating), 5);
  assert.equal(Number(r.verification_attempts), 3);
});

test('a job that was already put away as "unreachable" comes back', { skip }, async () => {
  // How these were stored before: the status set, and nothing that kept them in the list.
  const old = randomUUID();
  await db.query('INSERT INTO inquiries SET ?', [{ id: old, full_name: 'ZZ Lost Job', phone: '9000000991', ticket_no: `ZZVL-${Date.now() % 100000}`, status: 'resolved' }]);
  await db.query("UPDATE inquiries SET job_card_filled_at = NOW(), verification_due_at = NOW() - INTERVAL 2 DAY, verification_call_status = 'unreachable' WHERE id = ?", [old]);
  made.inquiries.push(old);
  const back = (await queue()).find((r) => r.id === old);
  assert.ok(back, 'the job that went missing is in the list again');
});

test('only an admin can log or read the calls', { skip }, async () => {
  assert.equal((await call('POST', `/inquiries/${id}/verification-call`, { status: 'unreachable' }, 'employee')).status, 403);
  assert.equal((await call('GET', '/job-cards?status=awaiting-verification', null, 'employee')).status, 403);
});

test.after(async () => {
  if (!db) return;
  try {
    if (made.inquiries.length) await db.query('DELETE FROM inquiries WHERE id IN (?)', [made.inquiries]);
  } finally {
    await db.end();
  }
});
