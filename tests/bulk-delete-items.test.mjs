// Deleting many items at once: what has no history is deleted (and its opening stock taken back out of the books),
// what bills still refer to is only hidden, and nothing happens without the word DELETE.
//
//   node --test tests/bulk-delete-items.test.mjs
//
// Needs the local API and the test database; skips without them. Everything it creates is removed at the end.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const API = 'http://127.0.0.1:5000/api';

let mysql; let jwt; let db; let adminToken; let employeeToken; let reachable = false;
let businessId;
const made = { items: [], bills: [] };
let plain; let opening; let used;
const OPENING_VALUE = 50000; // ₹500.00 in paise

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/inventory/items`).catch(() => null);
  reachable = !!probe && probe.status === 401;
  if (reachable) {
    db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
    const [[admin]] = await db.query("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1");
    const sign = (id, role) => jwt.sign({ id, email: `${role}@test.local`, role, worker_type: 'fixed' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    adminToken = sign(admin.id, 'admin');
    employeeToken = sign(randomUUID(), 'employee');
    const [[biz]] = await db.query('SELECT id FROM businesses WHERE is_default = 1 LIMIT 1');
    businessId = biz.id;
  }
} catch { reachable = false; }

const skip = reachable ? false : 'needs the local API on port 5000 and the test database';
const call = async (method, path, body, tk = adminToken) => {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const exists = async (id) => (await db.query('SELECT id, active FROM inventory_items WHERE id = ?', [id]))[0][0] || null;

test('set up: a plain item, an item with imported opening stock, and an item a bill refers to', { skip }, async () => {
  const mk = async (name) => {
    const r = await call('POST', '/inventory/items', { name, unit: 'pcs', purchase_rate: 100, selling_rate: 150 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    made.items.push(r.body.id);
    return r.body;
  };
  plain = await mk('ZZ Bulk Plain');
  opening = await mk('ZZ Bulk Opening');
  used = await mk('ZZ Bulk Used');

  // Opening stock the way the import writes it: a movement with source "opening" and a value.
  await db.query(
    "UPDATE inventory_items SET quantity = 5, avg_cost_paise = 10000, stock_value_paise = ? WHERE id = ?", [OPENING_VALUE, opening.id]
  );
  await db.query('INSERT INTO inventory_movements SET ?', [{
    id: randomUUID(), business_id: businessId, item_id: opening.id, type: 'opening', quantity: 5,
    unit_cost_paise: 10000, value_paise: OPENING_VALUE, balance_qty: 5, source_type: 'opening', note: 'ZZ bulk opening',
  }]);

  // A bill line that points at the third one.
  const billId = randomUUID();
  await db.query('INSERT INTO bill_items SET ?', [{
    id: billId, ref_type: 'inquiry', ref_id: randomUUID(), item_id: used.id, name: 'ZZ Bulk Used', kind: 'item',
    quantity: 1, rate: 150, amount: 150,
  }]);
  made.bills.push(billId);
});

test('the preview says what would happen and changes nothing', { skip }, async () => {
  const r = await call('POST', '/inventory/items/bulk-delete', { ids: [plain.id, opening.id, used.id] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.dry_run, true);
  assert.equal(r.body.will_delete, 2);
  assert.equal(r.body.will_keep, 1);
  assert.equal(r.body.reverse_value_paise, OPENING_VALUE);
  assert.equal(r.body.keep[0].name, 'ZZ Bulk Used');
  assert.match(r.body.keep[0].reason, /bill_items/);
  for (const id of [plain.id, opening.id, used.id]) assert.ok(await exists(id), 'still there');
});

test('without the word DELETE, nothing is deleted; and only the office may', { skip }, async () => {
  const noWord = await call('POST', '/inventory/items/bulk-delete', { ids: [plain.id], dry_run: false });
  assert.equal(noWord.status, 400);
  const wrong = await call('POST', '/inventory/items/bulk-delete', { ids: [plain.id], dry_run: false, confirm: 'yes' });
  assert.equal(wrong.status, 400);
  assert.ok(await exists(plain.id));

  const tech = await call('POST', '/inventory/items/bulk-delete', { ids: [plain.id], dry_run: false, confirm: 'DELETE' }, employeeToken);
  assert.equal(tech.status, 403);
  assert.ok(await exists(plain.id));
});

test('confirmed: the clean items go, the used one is hidden, and the opening stock is taken out of the books', { skip }, async () => {
  const [[before]] = await db.query(
    `SELECT COALESCE(SUM(l.debit_paise - l.credit_paise), 0) AS bal FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id WHERE a.code = '1200'`
  );

  const r = await call('POST', '/inventory/items/bulk-delete', { ids: [plain.id, opening.id, used.id], dry_run: false, confirm: 'DELETE' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.deleted, 2);
  assert.equal(r.body.hidden, 1);
  assert.equal(r.body.reversed_value_paise, OPENING_VALUE);
  assert.ok(r.body.journal_id);

  assert.equal(await exists(plain.id), null);
  assert.equal(await exists(opening.id), null);
  const kept = await exists(used.id);
  assert.ok(kept, 'the used item is still on record');
  assert.equal(Number(kept.active), 0, 'but hidden');
  const [moves] = await db.query('SELECT id FROM inventory_movements WHERE item_id = ?', [opening.id]);
  assert.equal(moves.length, 0);

  // Inventory in the books went down by exactly the opening stock removed.
  const [[after]] = await db.query(
    `SELECT COALESCE(SUM(l.debit_paise - l.credit_paise), 0) AS bal FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id WHERE a.code = '1200'`
  );
  assert.equal(Number(before.bal) - Number(after.bal), OPENING_VALUE);

  const [lines] = await db.query('SELECT a.code, l.debit_paise, l.credit_paise FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.journal_id = ?', [r.body.journal_id]);
  const eq = lines.find((l) => l.code === '3100');
  const inv = lines.find((l) => l.code === '1200');
  assert.equal(Number(eq.debit_paise), OPENING_VALUE);
  assert.equal(Number(inv.credit_paise), OPENING_VALUE);

  const tb = (await call('GET', '/accounting/trial-balance?from=2026-04-01&to=2027-03-31')).body;
  assert.equal(tb.balanced, true);

  // The Stock screen can tell a hidden item from a live one, and the deleted ones are not there at all.
  const valuation = (await call('GET', '/stock/valuation')).body;
  assert.equal(valuation.items.find((i) => i.id === used.id)?.active, false);
  assert.equal(valuation.items.find((i) => i.id === plain.id), undefined);
  assert.equal(valuation.items.find((i) => i.id === opening.id), undefined);
  assert.deepEqual(valuation.discrepancies, []);

  // Asked again, there is nothing left to delete.
  const again = await call('POST', '/inventory/items/bulk-delete', { ids: [plain.id, opening.id], dry_run: false, confirm: 'DELETE' });
  assert.equal(again.status, 200);
  assert.equal(again.body.deleted, 0);
});

test('many items can be hidden or made active again in one go', { skip }, async () => {
  const mk = async (name) => {
    const r = await call('POST', '/inventory/items', { name, unit: 'pcs', purchase_rate: 10, selling_rate: 15 });
    made.items.push(r.body.id);
    return r.body.id;
  };
  const a = await mk('ZZ Bulk Active A');
  const b = await mk('ZZ Bulk Active B');
  const activeOf = async (id) => Number((await exists(id)).active);

  const hide = await call('POST', '/inventory/items/bulk-active', { ids: [a, b], active: false });
  assert.equal(hide.status, 200, JSON.stringify(hide.body));
  assert.equal(hide.body.changed, 2);
  assert.equal(await activeOf(a), 0);
  assert.equal(await activeOf(b), 0);

  // Only those not already so are counted.
  const one = await call('POST', '/inventory/items/bulk-active', { ids: [a], active: true });
  assert.equal(one.body.changed, 1);
  const both = await call('POST', '/inventory/items/bulk-active', { ids: [a, b], active: true });
  assert.equal(both.body.changed, 1);
  assert.equal(await activeOf(a), 1);
  assert.equal(await activeOf(b), 1);

  assert.equal((await call('POST', '/inventory/items/bulk-active', { ids: [a], active: 'yes' })).status, 400);
  assert.equal((await call('POST', '/inventory/items/bulk-active', { ids: [], active: true })).status, 400);
  assert.equal((await call('POST', '/inventory/items/bulk-active', { ids: [a], active: false }, employeeToken)).status, 403);
});

test.after(async () => {
  if (!db) return;
  try {
    const [journals] = await db.query("SELECT id FROM journals WHERE narration LIKE 'Items deleted — opening stock taken back out%'");
    for (const { id } of journals) {
      await db.query('UPDATE journals SET reversed_by_id = NULL, reversal_of_id = NULL WHERE id = ?', [id]);
      await db.query('DELETE FROM journal_lines WHERE journal_id = ?', [id]);
      await db.query('DELETE FROM journals WHERE id = ?', [id]);
    }
    for (const id of made.bills) await db.query('DELETE FROM bill_items WHERE id = ?', [id]);
    for (const id of made.items) {
      await db.query('DELETE FROM inventory_movements WHERE item_id = ?', [id]);
      await db.query('DELETE FROM inventory_items WHERE id = ?', [id]);
    }
    await db.query("DELETE FROM audit_log WHERE action = 'item.bulk_delete'").catch(() => {});
  } finally {
    await db.end();
  }
});
