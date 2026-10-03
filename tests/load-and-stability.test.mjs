// Why the portal got slow and started dropping connections, and the fixes:
//   * the job card could not be saved at all (a column it writes did not exist),
//   * a failed list request kept its database connection for ever, so a few dozen errors
//     used up the whole pool and every other request stalled,
//   * the admin dashboard downloaded every row of four tables, over and over,
//   * lists were sent uncompressed.
//
//   node --test tests/load-and-stability.test.mjs
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
  const probe = await fetch(`${API}/dashboard/admin-data`).catch(() => null);
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
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body: json, headers: res.headers, bytes: text.length };
};
const addInquiry = async (status, extra = {}) => {
  const id = randomUUID();
  await db.query('INSERT INTO inquiries SET ?', [{ id, full_name: 'ZZ Load Test', phone: '9000000980', ticket_no: `ZZLD-${id.slice(0, 8)}`, status, ...extra }]);
  made.inquiries.push(id);
  return id;
};

test('a job card can be saved, with its category and items', { skip }, async () => {
  const id = await addInquiry('assigned');
  const saved = await call('POST', `/inquiries/${id}/job-card`, {
    job_card_type: 'service', category: 'CCTV', job_start_time: '2026-10-02 10:30:00', job_end_time: '2026-10-02 11:45:00',
    expected_time_minutes: 60, work_done_note: 'Replaced the DVR power supply', rework_required: false,
    items: [{ item_name: 'ZZ SMPS 12V', quantity: '1' }],
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.inquiry.category, 'CCTV');
  assert.equal(saved.body.inquiry.job_card_type, 'service');
  assert.ok(saved.body.inquiry.job_card_filled_at);
  const [items] = await db.query('SELECT item_name FROM job_card_items WHERE inquiry_id = ?', [id]);
  assert.deepEqual(items.map((i) => i.item_name), ['ZZ SMPS 12V']);

  // Saving again without a category keeps the one it had.
  const again = await call('POST', `/inquiries/${id}/job-card`, { job_card_type: 'service', work_done_note: 'second look', items: [] });
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.equal(again.body.inquiry.category, 'CCTV');

  assert.equal((await call('POST', `/inquiries/${id}/job-card`, { job_card_type: 'nonsense' })).status, 400);
  assert.equal((await call('POST', `/inquiries/${randomUUID()}/job-card`, { job_card_type: 'service' })).status, 404);
  assert.equal((await call('POST', `/inquiries/${id}/job-card`, { job_card_type: 'service' }, 'employee')).status, 403);
});

test('failing list requests give their database connection back — the pool does not run dry', { skip }, async () => {
  // Each of these fails inside the handler (a column that does not exist). Before the fix every one kept its
  // connection; with a pool of a few dozen, a few dozen such errors froze the whole site.
  const failures = await Promise.all(Array.from({ length: 60 }, () => call('GET', '/data/inquiries?select=no_such_column_zz')));
  assert.ok(failures.every((f) => f.status === 500), 'they fail, as they should');
  // Early returns (a bad filter, a bad order) used to leak too.
  await Promise.all(Array.from({ length: 40 }, () => call('GET', '/data/inquiries?select=id&order=bad%20col:desc')));

  const started = Date.now();
  const ok = await call('GET', '/data/inquiries?select=id&order=created_at:desc&limit=1');
  assert.equal(ok.status, 200, 'the site still answers after 100 failed requests');
  assert.ok(Date.now() - started < 5000, 'and answers quickly, not after waiting for a free connection');
});

test('the dashboard asks for what it shows: open jobs, the latest finished, a total, today, open complaints', { skip }, async () => {
  const open = await addInquiry('assigned');
  const done = await addInquiry('resolved');
  const cancelled = await addInquiry('cancelled');
  const today = new Date().toLocaleDateString('en-CA');

  const d = await call('GET', `/dashboard/admin-data?today=${today}`);
  assert.equal(d.status, 200, JSON.stringify(d.body).slice(0, 300));
  for (const key of ['inquiries', 'installations', 'complaints', 'attendance', 'profiles']) assert.ok(Array.isArray(d.body[key]), `${key} is a list`);
  const ids = d.body.inquiries.map((r) => r.id);
  assert.ok(ids.includes(open), 'an open job is there');
  assert.ok(ids.includes(done), 'a recently finished job is there');
  assert.ok(!ids.includes(cancelled), 'a cancelled job is not something the dashboard shows');
  assert.ok(d.body.completed_total >= 1, 'it says how many finished jobs there are in all');
  assert.ok(d.body.complaints.every((c) => String(c.status || 'open').toLowerCase() === 'open'), 'only open complaints');
  assert.ok(d.body.attendance.every((a) => String(a.date).slice(0, 10) === today || new Date(a.clock_in).toLocaleDateString('en-CA') === today), 'only today\'s attendance');
  assert.ok(d.body.profiles.every((p) => !('password_hash' in p) && !('salary' in p)), 'and no private columns');

  assert.equal((await call('GET', '/dashboard/admin-data', null, 'employee')).status, 403, 'admins only');
});

test('a newest-first list is capped, says so, and can be asked for fewer', { skip }, async () => {
  await addInquiry('pending'); await addInquiry('pending'); await addInquiry('pending');
  const some = await call('GET', '/data/inquiries?select=id&order=created_at:desc&limit=2');
  assert.equal(some.status, 200);
  assert.equal(some.body.length, 2);
  assert.equal(some.headers.get('x-truncated'), '2', 'the response says it was cut');

  const all = await call('GET', '/data/inquiries?select=id&order=created_at:desc');
  assert.equal(all.status, 200);
  assert.ok(all.body.length >= 3);
  assert.equal(all.headers.get('x-truncated'), null, 'under the cap nothing is cut');

  // A list sorted oldest-first is not cut: dropping the newest rows would be the wrong ones to lose.
  const oldest = await call('GET', '/data/inquiries?select=id&order=created_at:asc');
  assert.equal(oldest.headers.get('x-truncated'), null);
  // An unsorted request is a lookup, not a list.
  assert.equal((await call('GET', '/data/inquiries?select=id&limit=1')).body.length, 1);
});

test('related rows are attached to the right parent', { skip }, async () => {
  // attendance with the employee's name — the join the dashboard and the attendance page both use.
  const [[emp]] = await db.query("SELECT id, full_name FROM profiles WHERE role = 'employee' LIMIT 1");
  if (!emp) return;
  const att = randomUUID();
  await db.query('INSERT INTO attendance SET ?', [{ id: att, user_id: emp.id, date: '2026-10-02', clock_in: '2026-10-02 09:00:00' }]);
  try {
    const r = await call('GET', '/data/attendance?select=*,profiles(full_name)&order=clock_in:desc&limit=500');
    assert.equal(r.status, 200);
    const row = r.body.find((x) => x.id === att);
    assert.ok(row, 'the row is in the list');
    assert.equal(row.profiles.full_name, emp.full_name);
  } finally {
    await db.query('DELETE FROM attendance WHERE id = ?', [att]);
  }
});

test('big responses are sent compressed', { skip }, async () => {
  const res = await fetch(`${API}/dashboard/admin-data?today=2026-10-02`, { headers: { Authorization: `Bearer ${tokens.admin}`, 'Accept-Encoding': 'gzip' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-encoding'), 'gzip');
});

test.after(async () => {
  if (!db) return;
  try {
    if (made.inquiries.length) {
      await db.query('DELETE FROM job_card_items WHERE inquiry_id IN (?)', [made.inquiries]);
      await db.query('DELETE FROM inquiries WHERE id IN (?)', [made.inquiries]);
    }
  } finally {
    await db.end();
  }
});
