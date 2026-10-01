// Installation contacts become customers, so an invoice can be raised to them.
//
//   node --test tests/installation-contacts.test.mjs
//
// Skips when the API or the database is absent. Everything it creates — and any
// customer the sync makes from other installations already in the test
// database — is removed at the end.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const API = 'http://127.0.0.1:5000/api';

let mysql; let jwt; let db; let tokens; let reachable = false;
const made = { installations: [], parties: [] };
let partiesBefore = new Set();

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/parties`).catch(() => null);
  reachable = !!probe && probe.status === 401;
  if (reachable) {
    db = await mysql.createConnection({
      host: process.env.DB_HOST, user: process.env.DB_USER,
      password: process.env.DB_PASS, database: process.env.DB_NAME,
    });
    const [[admin]] = await db.query("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1");
    const [[emp]] = await db.query("SELECT id FROM profiles WHERE role = 'employee' LIMIT 1");
    const sign = (id, role) => jwt.sign(
      { id, email: `${role}@test.local`, role, worker_type: 'fixed' }, process.env.JWT_SECRET, { expiresIn: '1h' }
    );
    tokens = { admin: sign(admin.id, 'admin'), employee: sign(emp.id, 'employee') };
    const [before] = await db.query('SELECT id FROM parties');
    partiesBefore = new Set(before.map((p) => p.id));
  }
} catch { reachable = false; }

const skip = reachable ? false : 'needs the local API on port 5000 and the test database';

const call = async (method, path, body, who = 'admin') => {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const addInstallation = async (name, phone) => {
  const id = randomUUID();
  await db.query('INSERT INTO installations SET ?', [{
    id, ticket_no: `ZZIC-${id.slice(0, 8)}`, full_name: name, phone, location: 'Srinagar',
    installation_type: 'CCTV', preferred_date: '2026-10-05', preferred_time: 'Morning', address: 'ZZ test address',
  }]);
  made.installations.push(id);
  return id;
};

// A phone is stored as typed ("+91 90000 00781"), so compare on its digits.
const partyByPhone = async (last10) => (
  await db.query("SELECT * FROM parties WHERE phone IS NOT NULL AND merged_into_id IS NULL")
)[0].filter((p) => String(p.phone).replace(/\D/g, '').slice(-10) === last10);

test('set up: a business, a customer already on the list, and three installation contacts', { skip }, async () => {
  const [[biz]] = await db.query('SELECT id, state_code FROM businesses WHERE is_default = 1 LIMIT 1');
  assert.ok(biz, 'a default business exists');

  const known = await call('POST', '/parties', { display_name: 'ZZ Contact Already A Customer', phone: '9000000782' });
  assert.equal(known.status, 201);
  made.parties.push(known.body.id);

  await addInstallation('ZZ Contact New', '+91 90000 00781');
  await addInstallation('ZZ Contact New Again', '9000000781');           // same person, typed another way
  await addInstallation('ZZ Contact Existing', '9000000782');             // already a customer
  await addInstallation('ZZ Contact No Phone', '12');                     // too short to identify anyone
});

test('installation contacts are brought in as customers, once each', { skip }, async () => {
  const first = await call('POST', '/parties/sync-installation-contacts');
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.ok(first.body.created >= 1);

  const fresh = await partyByPhone('9000000781');
  assert.equal(fresh.length, 1, 'two tickets from the same number make one customer');
  assert.equal(fresh[0].kind, 'customer');
  assert.match(fresh[0].display_name, /^ZZ Contact New/);
  assert.match(fresh[0].notes, /installation contact/);

  assert.equal((await partyByPhone('9000000782')).length, 1, 'a customer already on the list is not duplicated');
  assert.equal((await partyByPhone('12')).length, 0, 'a number too short to identify anyone is not made into a customer');

  const listed = await call('GET', '/parties?kind=all&limit=1000');
  assert.ok(listed.body.some((p) => p.id === fresh[0].id), 'the invoice customer list now shows them');

  const second = await call('POST', '/parties/sync-installation-contacts');
  assert.equal(second.body.created, 0, 'running it again changes nothing');
});

test('only someone who can raise an invoice may run it', { skip }, async () => {
  assert.equal((await call('POST', '/parties/sync-installation-contacts', null, 'employee')).status, 403);
});

test.after(async () => {
  if (!db) return;
  const [now] = await db.query('SELECT id FROM parties');
  const mine = now.map((p) => p.id).filter((id) => !partiesBefore.has(id));
  const ids = [...new Set([...mine, ...made.parties])];
  if (ids.length) {
    await db.query('DELETE FROM party_addresses WHERE party_id IN (?)', [ids]);
    await db.query('DELETE FROM parties WHERE id IN (?)', [ids]);
  }
  if (made.installations.length) await db.query('DELETE FROM installations WHERE id IN (?)', [made.installations]);
  await db.end();
});
