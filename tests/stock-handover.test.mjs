// Giving stock to a technician, recording what he used on a job, and taking back
// what he did not use — the sequence the Stock screen now walks a person through,
// checked end to end against the stock ledger. Also the job search that finds the
// ticket to record it against.
//
//   node --test tests/stock-handover.test.mjs
//
// Needs the local API and the test database; skips without them. Everything it
// creates is removed at the end.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const API = 'http://127.0.0.1:5000/api';

let mysql; let jwt; let db; let token; let empToken; let reachable = false;
let businessId; let bizBefore;
const made = { profiles: [], inquiries: [], items: [], locations: [], issues: [] };
let store; let van; let item; let tech; let ticket;

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/jobs/search`).catch(() => null);
  reachable = !!probe && probe.status === 401;
  if (reachable) {
    db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
    const [[admin]] = await db.query("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1");
    const sign = (id, role) => jwt.sign({ id, email: `${role}@test.local`, role, worker_type: 'fixed' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    token = sign(admin.id, 'admin');
    const [[biz]] = await db.query('SELECT * FROM businesses WHERE is_default = 1 LIMIT 1');
    businessId = biz.id; bizBefore = biz;
    empToken = sign(randomUUID(), 'employee');
  }
} catch { reachable = false; }

const skip = reachable ? false : 'needs the local API on port 5000 and the test database';
const call = async (method, path, body, tk = token) => {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const held = async (locationId) => {
  const r = await call('GET', `/stock/locations/${locationId}/items`);
  return Number(r.body.find((x) => x.id === item.id)?.held_qty || 0);
};

test('set up: a store, a technician with a job, and an item on the shelf', { skip }, async () => {
  await db.query('UPDATE businesses SET require_material_approval = 1 WHERE id = ?', [businessId]);
  [[store]] = await db.query('SELECT * FROM stock_locations WHERE business_id = ? AND is_default = 1 LIMIT 1', [businessId]);
  assert.ok(store, 'a main store exists');

  tech = randomUUID();
  await db.query("INSERT INTO profiles (id, full_name, role, can_assign_tickets) VALUES (?, 'ZZ Handover Tech', 'employee', 0)", [tech]);
  made.profiles.push(tech);

  const id = randomUUID();
  await db.query('INSERT INTO inquiries SET ?', [{ id, full_name: 'ZZ Handover Customer', phone: '9000000971', ticket_no: 'ZZH-1001', service_item: 'CCTV repair', location: 'Srinagar', status: 'assigned', assigned_employee_id: tech, assignment_status: 'accepted' }]);
  made.inquiries.push(id);
  ticket = id;

  const created = await call('POST', '/inventory/items', { name: 'ZZ Handover Camera', unit: 'pcs', purchase_rate: 500, selling_rate: 900, opening_stock: 10 });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  item = created.body;
  made.items.push(item.id);
  // The cost the stock engine values it at — what the stock-on-the-shelf migration or a purchase sets.
  await db.query('UPDATE inventory_items SET avg_cost_paise = 50000 WHERE id = ?', [item.id]);
  assert.equal(await held(store.id), 10);
});

test('the job search finds a ticket by number, name or phone, and lists open jobs when nothing is typed', { skip }, async () => {
  for (const q of ['ZZH-1001', 'ZZ Handover', '9000000971']) {
    const r = await call('GET', `/jobs/search?q=${encodeURIComponent(q)}`);
    assert.equal(r.status, 200);
    const hit = r.body.find((j) => j.job_id === ticket);
    assert.ok(hit, `found by ${q}`);
    assert.equal(hit.job_type, 'inquiry');
    assert.equal(hit.assigned_employee_id, tech);
    assert.equal(hit.employee_name, 'ZZ Handover Tech');
  }
  const open = await call('GET', '/jobs/search');
  assert.ok(open.body.some((j) => j.job_id === ticket), 'an assigned, unresolved job is in the default list');
  assert.equal((await call('GET', '/jobs/search?q=NO-SUCH-TICKET-ZZ')).body.length, 0);
  assert.equal((await call('GET', '/jobs/search', null, empToken)).status, 200, 'a technician can look a job up too');
});

test('give -> used -> take back: the van holds what it was given, less what was fitted, less what came back', { skip }, async () => {
  const loc = await call('POST', '/stock/locations', { name: 'ZZ Handover van', kind: 'van', employee_id: tech });
  assert.equal(loc.status, 201, JSON.stringify(loc.body));
  van = loc.body;
  made.locations.push(van.id);

  // 1. He is given 6.
  const give = await call('POST', '/stock/transfers', { from_location_id: store.id, to_location_id: van.id, employee_id: tech, note: 'ZZ give', lines: [{ item_id: item.id, quantity: 6 }] });
  assert.equal(give.status, 201, JSON.stringify(give.body));
  assert.equal(await held(van.id), 6);
  assert.equal(await held(store.id), 4);

  // 2. He fits 2 on the job. Nothing moves until it is approved.
  const used = await call('POST', '/jobs/materials', {
    job_type: 'inquiry', job_id: ticket, location_id: van.id, employee_id: tech, kind: 'used',
    lines: [{ item_id: item.id, description: 'ZZ Handover Camera', quantity: 2, unit: 'pcs', sell_rate: 900 }],
  });
  assert.equal(used.status, 201, JSON.stringify(used.body));
  made.issues.push(used.body.issue.id);
  assert.equal(used.body.issue.status, 'submitted');
  assert.equal(await held(van.id), 6, 'waiting for approval, so the van still shows 6');

  const approved = await call('POST', `/jobs/materials/${used.body.issue.id}/approve`);
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(await held(van.id), 4, 'approved: 2 left the van');
  assert.equal(Number(approved.body.issue.cost_paise), 100000, '2 × ₹500 cost reached the accounts');
  assert.ok(approved.body.issue.journal_id);

  // 3. He brings the unused 4 back to the shop.
  const back = await call('POST', '/stock/transfers', { from_location_id: van.id, to_location_id: store.id, employee_id: tech, note: 'ZZ back', lines: [{ item_id: item.id, quantity: 4 }] });
  assert.equal(back.status, 201, JSON.stringify(back.body));
  assert.equal(await held(van.id), 0);
  assert.equal(await held(store.id), 8, '10 bought, 2 fitted on the job, the rest back on the shelf');

  // 4. A removed device that comes back from the job goes into the location named.
  const returned = await call('POST', '/jobs/materials', {
    job_type: 'inquiry', job_id: ticket, location_id: store.id, employee_id: tech, kind: 'returned',
    lines: [{ item_id: item.id, description: 'ZZ Handover Camera', quantity: 1, unit: 'pcs' }],
  });
  assert.equal(returned.status, 201, JSON.stringify(returned.body));
  made.issues.push(returned.body.issue.id);
  assert.equal((await call('POST', `/jobs/materials/${returned.body.issue.id}/approve`)).status, 200);
  assert.equal(await held(store.id), 9);

  const summary = await call('GET', `/jobs/inquiry/${ticket}/summary`);
  assert.equal(summary.body.job.assigned_employee_id, tech, 'the job summary says who the technician is');
});

test('a technician cannot approve his own materials', { skip }, async () => {
  const sub = await call('POST', '/jobs/materials', {
    job_type: 'inquiry', job_id: ticket, location_id: store.id, kind: 'used',
    lines: [{ item_id: item.id, description: 'ZZ Handover Camera', quantity: 1, unit: 'pcs' }],
  });
  made.issues.push(sub.body.issue.id);
  assert.equal((await call('POST', `/jobs/materials/${sub.body.issue.id}/approve`, null, empToken)).status, 403);
  assert.equal((await call('POST', `/jobs/materials/${sub.body.issue.id}/reject`, { reason: 'ZZ not needed' })).status, 200);
});

test.after(async () => {
  if (!db) return;
  try {
    const I = made.issues.length ? made.issues : ['none'];
    const [jrows] = await db.query('SELECT journal_id FROM job_material_issues WHERE id IN (?)', [I]);
    await db.query('DELETE FROM job_material_lines WHERE issue_id IN (?)', [I]);
    await db.query('DELETE FROM job_material_issues WHERE id IN (?)', [I]);
    for (const { journal_id: jid } of jrows.filter((r) => r.journal_id)) {
      await db.query('UPDATE journals SET reversed_by_id = NULL, reversal_of_id = NULL WHERE id = ?', [jid]);
      await db.query('DELETE FROM journal_lines WHERE journal_id = ?', [jid]);
      await db.query('DELETE FROM journals WHERE id = ?', [jid]);
    }
    const It = made.items.length ? made.items : ['none'];
    await db.query('DELETE FROM inventory_movements WHERE item_id IN (?)', [It]);
    await db.query('DELETE FROM inventory_items WHERE id IN (?)', [It]);
    if (made.locations.length) await db.query('DELETE FROM stock_locations WHERE id IN (?)', [made.locations]);
    if (made.inquiries.length) await db.query('DELETE FROM inquiries WHERE id IN (?)', [made.inquiries]);
    for (const id of made.profiles) await db.query('DELETE FROM profiles WHERE id = ?', [id]);
    await db.query("DELETE FROM audit_log WHERE action LIKE 'job.materials%' OR action LIKE 'location.%' OR action LIKE 'item.%'").catch(() => {});
    await db.query('UPDATE businesses SET require_material_approval = ? WHERE id = ?', [bizBefore.require_material_approval, businessId]);
  } finally {
    await db.end();
  }
});
