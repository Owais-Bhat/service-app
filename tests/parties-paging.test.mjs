// A business with a thousand customers (a Vyapar import) must see all of them: the list pages, the totals cover
// everybody, and a picker can ask for the lot.
//
//   node --test tests/parties-paging.test.mjs
//
// Skips when the API or the database is absent. The ZZ parties it makes are removed at the end.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const API = 'http://127.0.0.1:5000/api';

let mysql; let jwt; let db; let tokens; let reachable = false;
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
    tokens = {
      admin: jwt.sign({ id: admin.id, email: 'admin@test.local', role: 'admin', worker_type: 'fixed' }, process.env.JWT_SECRET, { expiresIn: '1h' }),
    };
    const [before] = await db.query('SELECT id FROM parties');
    partiesBefore = new Set(before.map((p) => p.id));
  }
} catch { reachable = false; }

const skip = reachable ? false : 'needs the local API on port 5000 and the test database';

const call = async (method, path, body) => {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.admin}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

test('250 customers: pages walk through all of them with no repeats, and the summary counts all', { skip }, async () => {
  const MADE = 250;
  for (let i = 0; i < MADE; i += 1) {
    const r = await call('POST', '/parties', { display_name: `ZZ Paging ${String(i).padStart(3, '0')}`, kind: 'customer' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }

  const q = 'kind=customer&active=1&q=ZZ%20Paging';
  const summary = await call('GET', `/parties/summary?${q}`);
  assert.equal(summary.status, 200);
  assert.equal(summary.body.count, MADE);

  const seen = [];
  for (let offset = 0; ; offset += 100) {
    const page = await call('GET', `/parties?${q}&limit=100&offset=${offset}`);
    assert.equal(page.status, 200);
    seen.push(...page.body);
    if (page.body.length < 100) break;
  }
  assert.equal(seen.length, MADE);
  assert.equal(new Set(seen.map((p) => p.id)).size, MADE, 'no party appears on two pages');
  const names = seen.map((p) => p.display_name);
  assert.deepEqual(names, [...names].sort(), 'name order holds across pages');

  // The totals on top equal what the rows add up to.
  const net = seen.reduce((n, p) => n + Number(p.balance_paise), 0);
  assert.equal(summary.body.net_paise, net);
  assert.equal(summary.body.owing_count, seen.filter((p) => Number(p.balance_paise) > 0).length);
  assert.equal(summary.body.credit_count, seen.filter((p) => Number(p.balance_paise) < 0).length);

  // A picker can still ask for everyone in one go.
  const everyone = await call('GET', `/parties?${q}&limit=5000`);
  assert.equal(everyone.body.length, MADE);
});

test('the whole-business summary agrees with the whole list', { skip }, async () => {
  const q = 'kind=all&active=all';
  const summary = await call('GET', `/parties/summary?${q}`);
  const all = await call('GET', `/parties?${q}&limit=5000`);
  assert.equal(summary.body.count, all.body.length);
  assert.equal(summary.body.net_paise, all.body.reduce((n, p) => n + Number(p.balance_paise), 0));
});

test.after(async () => {
  if (!db) return;
  const [now] = await db.query('SELECT id FROM parties');
  const ids = now.map((p) => p.id).filter((id) => !partiesBefore.has(id));
  if (ids.length) {
    await db.query('DELETE FROM party_addresses WHERE party_id IN (?)', [ids]);
    await db.query('DELETE FROM parties WHERE id IN (?)', [ids]);
  }
  await db.end();
});
