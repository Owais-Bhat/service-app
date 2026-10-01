// Excel stock import: the template, the checks, and the promise that opening
// stock reaches the shelf and the ledger together or not at all.
//
//   node --test tests/stock-import.test.mjs
//
// Skips when the API or the database is absent. Everything it creates is
// removed at the end.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const API = 'http://127.0.0.1:5000/api';

let mysql; let jwt; let db; let tokens; let reachable = false;
let businessBefore = null;
const made = { journals: [], locks: [], locations: [] };
const PREFIX = 'ZZI-';

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/stock/locations`).catch(() => null);
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

const HEADER = ['Item Name', 'SKU', 'Category', 'HSN/SAC', 'Unit', 'Purchase Rate', 'Selling Rate', 'GST %',
  'Opening Qty', 'Opening Rate', 'Min Stock', 'Location', 'Brand', 'Model', 'Warranty (months)', 'Track Serial', 'Serial Numbers'];
// name, sku, category, hsn, unit, purchase, selling, gst, qty, openRate, min, location, brand, model, warranty, trackSerial, serials
const row = (o = {}) => {
  const base = ['ZZ Import Camera', `${PREFIX}CAM`, 'Cameras', '85258900', 'pcs', 1500, 2500, 18, 3, 1450, 2, '', 'Hikvision', 'DS-2CE', 24, 'Y', 'ZZSN-1, ZZSN-2, ZZSN-3'];
  Object.entries(o).forEach(([i, v]) => { base[Number(i)] = v; });
  return base;
};
const cableRow = (o = {}) => {
  const base = ['ZZ Import Cable', `${PREFIX}CBL`, 'Cables', '85444999', 'm', 22, 30, 18, 90.5, '', 100, '', 'D-Link', '', '', 'N', ''];
  Object.entries(o).forEach(([i, v]) => { base[Number(i)] = v; });
  return base;
};

const ledgerInventory = async () => {
  const [[r]] = await db.query(
    `SELECT COALESCE(SUM(jl.debit_paise - jl.credit_paise), 0) AS bal
       FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id WHERE a.code = '1200'`
  );
  return Number(r.bal);
};
const itemBySku = async (sku) => (await db.query('SELECT * FROM inventory_items WHERE sku = ?', [sku]))[0][0];
const countZZ = async () => (await db.query('SELECT COUNT(*) AS n FROM inventory_items WHERE sku LIKE ?', [`${PREFIX}%`]))[0][0].n;

test('set up: a confirmed business', { skip }, async () => {
  const [[biz]] = await db.query('SELECT * FROM businesses WHERE is_default = 1 LIMIT 1');
  businessBefore = biz;
  await db.query(`UPDATE businesses SET state_code = '01', state_name = 'Jammu and Kashmir', setup_complete = 1 WHERE id = ?`, [biz.id]);
});

test('the template lists the columns the checker reads', { skip }, async () => {
  const t = await call('GET', '/stock/import/template');
  assert.equal(t.status, 200);
  assert.deepEqual(t.body.columns, HEADER, 'the template headings are the contract with the owner');
  for (const sample of t.body.sample_rows) {
    assert.equal(sample.length, HEADER.length, 'every sample row fills every column');
  }
  // A sample row a customer is told to delete must itself be a valid row.
  const check = await call('POST', '/stock/import', { rows: [t.body.columns, ...t.body.sample_rows], dry_run: true });
  const sampleProblems = check.body.errors.filter((e) => !/already|exists|Location/.test(e));
  assert.deepEqual(sampleProblems, [], 'the sample rows should be importable as they stand');
});

test('a person without item and stock rights cannot import', { skip }, async () => {
  const denied = await call('POST', '/stock/import', { rows: [HEADER, row()], dry_run: true }, 'employee');
  assert.equal(denied.status, 403);
});

test('a checking run reports the file and writes nothing', { skip }, async () => {
  const before = await countZZ();
  const ledger = await ledgerInventory();
  const r = await call('POST', '/stock/import', { rows: [HEADER, row(), cableRow()], dry_run: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true, JSON.stringify(r.body.errors));
  assert.equal(r.body.dry_run, true);
  assert.equal(r.body.summary.create, 2);
  assert.equal(r.body.summary.with_stock, 2);
  // 3 × ₹1450 + 90.5 × ₹22
  assert.equal(r.body.summary.total_value_paise, 3 * 145000 + Math.round(90.5 * 2200));
  assert.equal(await countZZ(), before, 'a dry run must create nothing');
  assert.equal(await ledgerInventory(), ledger, 'a dry run must post nothing');
});

test('every kind of mistake is named by its row', { skip }, async () => {
  const cases = [
    [row({ 0: '' }), /Row 2: Item Name is empty/],
    [row({ 5: 'abc' }), /Row 2: Purchase Rate "abc" is not a number/],
    [row({ 6: '' }), /Row 2: Selling Rate is empty/],
    [row({ 8: -4 }), /Row 2: Opening Qty cannot be less than 0/],
    [row({ 8: 1.2345 }), /at most 3 decimal places/],
    [row({ 15: 'maybe' }), /Track Serial "maybe" should be Y or N/],
    [row({ 16: 'ZZSN-1, ZZSN-2' }), /Opening Qty is 3 but 2 serial numbers are listed/],
    [row({ 16: 'ZZSN-1, ZZSN-1, ZZSN-2' }), /Serial ZZSN-1 is repeated/],
    [row({ 11: 'No Such Shed' }), /Location "No Such Shed" does not exist/],
    [row({ 7: 250 }), /GST % cannot be more than 100/],
  ];
  for (const [bad, pattern] of cases) {
    const r = await call('POST', '/stock/import', { rows: [HEADER, bad], dry_run: true });
    assert.equal(r.body.ok, false, `should refuse: ${pattern}`);
    assert.ok(r.body.errors.some((e) => pattern.test(e)), `expected ${pattern}, got ${JSON.stringify(r.body.errors)}`);
  }

  const twins = await call('POST', '/stock/import', { rows: [HEADER, row(), row({ 0: 'Another name' })], dry_run: true });
  assert.ok(twins.body.errors.some((e) => /Row 3: Repeats row 2/.test(e)), 'the same SKU twice in one file');

  const noSell = await call('POST', '/stock/import', { rows: [['Item Name', 'Purchase Rate'], ['x', 1]], dry_run: true });
  assert.match(noSell.body.errors[0], /no "Selling Rate" column/);

  assert.equal((await call('POST', '/stock/import', { rows: [HEADER], dry_run: true })).body.ok, false, 'headings alone are not a file');
});

test('headings written another way are still understood', { skip }, async () => {
  const r = await call('POST', '/stock/import', {
    rows: [['Product', 'Code', 'Cost Price', 'Selling Price (₹)', 'Qty'], ['ZZ Alias Item', `${PREFIX}ALIAS`, '1,200', '₹ 2,000', 4]],
    dry_run: true,
  });
  assert.equal(r.body.ok, true, JSON.stringify(r.body.errors));
  assert.equal(r.body.rows[0].purchase_rate, 1200, 'commas are read as thousands');
  assert.equal(r.body.rows[0].selling_rate, 2000, 'a ₹ sign is ignored');
  assert.equal(r.body.rows[0].opening_qty, 4);
});

test('one bad row stops the whole import', { skip }, async () => {
  const before = await countZZ();
  const r = await call('POST', '/stock/import', {
    rows: [HEADER, row(), cableRow({ 5: 'oops' })], dry_run: false, opening_date: '2026-04-01',
  });
  assert.equal(r.status, 422);
  assert.equal(await countZZ(), before, 'the good row must not have been saved either');
});

let camera; let cable; let inventoryBefore;

test('opening stock reaches the shelf, the serials and the ledger together', { skip }, async () => {
  inventoryBefore = await ledgerInventory();
  const r = await call('POST', '/stock/import', {
    rows: [HEADER, row(), cableRow()], dry_run: false, opening_date: '2026-04-01', file_name: 'zz.xlsx',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const done = r.body.done;
  assert.equal(done.created, 2);
  assert.equal(done.stocked, 2);
  assert.equal(done.serials, 3);
  made.journals.push(done.journal_id);

  camera = await itemBySku(`${PREFIX}CAM`);
  cable = await itemBySku(`${PREFIX}CBL`);
  assert.equal(Number(camera.quantity), 3);
  assert.equal(Number(camera.avg_cost_paise), 145000, 'valued at the Opening Rate, not the Purchase Rate');
  assert.equal(Number(camera.stock_value_paise), 435000);
  assert.equal(Number(camera.track_serial), 1);
  assert.equal(camera.hsn_sac, '85258900');
  assert.equal(camera.brand, 'Hikvision');
  assert.equal(Number(camera.warranty_months), 24);
  assert.equal(Number(cable.quantity), 90.5, 'metres keep their decimals');
  assert.equal(Number(cable.avg_cost_paise), 2200, 'no Opening Rate → the Purchase Rate');

  const [serials] = await db.query('SELECT serial_no, status, location_id FROM item_serials WHERE item_id = ?', [camera.id]);
  assert.equal(serials.length, 3);
  assert.ok(serials.every((s) => s.status === 'in_stock' && s.location_id), 'each serial is in stock, at a location');

  // One journal, balanced, and the books moved by exactly the stock's value.
  const total = 435000 + Math.round(90.5 * 2200);
  assert.equal(done.total_value_paise, total);
  const [lines] = await db.query(
    `SELECT a.code, jl.debit_paise, jl.credit_paise FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id WHERE jl.journal_id = ?`,
    [done.journal_id]
  );
  const dr = lines.find((l) => l.code === '1200');
  const cr = lines.find((l) => l.code === '3100');
  assert.equal(Number(dr.debit_paise), total, 'Dr Inventory');
  assert.equal(Number(cr.credit_paise), total, 'Cr Opening Balance Equity');
  assert.equal(await ledgerInventory() - inventoryBefore, total, 'the ledger grew by exactly the stock value');

  // The movement ledger agrees with the item.
  const [[mv]] = await db.query(
    `SELECT SUM(quantity) AS q, SUM(value_paise) AS v FROM inventory_movements WHERE item_id = ?`, [camera.id]
  );
  assert.equal(Number(mv.q), 3);
  assert.equal(Number(mv.v), 435000);
});

test('uploading the same file again changes nothing — items are found, not duplicated', { skip }, async () => {
  const before = await ledgerInventory();
  const count = await countZZ();
  const r = await call('POST', '/stock/import', {
    rows: [HEADER, row(), cableRow()], dry_run: false, opening_date: '2026-04-01',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.done.created, 0);
  assert.equal(r.body.done.updated, 2);
  assert.equal(r.body.done.restocked, 0, 'the numbers already match');
  assert.equal(r.body.done.journal_id, null);
  assert.equal(Number((await itemBySku(`${PREFIX}CAM`)).quantity), 3);
  assert.equal(await countZZ(), count);
  assert.equal(await ledgerInventory(), before);
});

test('a changed quantity in the file updates stock already held, and the books follow', { skip }, async () => {
  const start = await ledgerInventory();
  const dry = await call('POST', '/stock/import', { rows: [HEADER, cableRow({ 8: 100 })], dry_run: true });
  assert.equal(dry.body.ok, true, JSON.stringify(dry.body.errors));
  assert.equal(dry.body.rows[0].stock_mode, 'set');
  assert.equal(dry.body.rows[0].stock_before, 90.5);
  assert.equal(dry.body.rows[0].stock_delta, 9.5);
  assert.equal(dry.body.summary.restock_up, 1);
  assert.equal(Number((await itemBySku(`${PREFIX}CBL`)).quantity), 90.5, 'a checking run changes nothing');

  const up = await call('POST', '/stock/import', { rows: [HEADER, cableRow({ 8: 100 })], dry_run: false, opening_date: '2026-04-02' });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  made.journals.push(up.body.done.restock_journal_id);
  assert.equal(up.body.done.restocked, 1);
  assert.equal(Number((await itemBySku(`${PREFIX}CBL`)).quantity), 100);
  assert.equal(await ledgerInventory() - start, Math.round(9.5 * 2200), 'the ledger grew by the value of what was found');

  const down = await call('POST', '/stock/import', { rows: [HEADER, cableRow({ 8: 40 })], dry_run: false, opening_date: '2026-04-02' });
  assert.equal(down.status, 201, JSON.stringify(down.body));
  made.journals.push(down.body.done.restock_journal_id);
  assert.equal(Number((await itemBySku(`${PREFIX}CBL`)).quantity), 40);
  assert.equal(await ledgerInventory() - start, Math.round(9.5 * 2200) - 60 * 2200, 'and shrank by what went missing');
  const [[mv]] = await db.query('SELECT SUM(quantity) AS q FROM inventory_movements WHERE item_id = ?', [(await itemBySku(`${PREFIX}CBL`)).id]);
  assert.equal(Number(mv.q), 40, 'the movement ledger agrees with the item');

  const off = await call('POST', '/stock/import', { rows: [HEADER, cableRow({ 8: 5 })], dry_run: false, opening_date: '2026-04-02', update_stock: false });
  assert.equal(off.status, 201, JSON.stringify(off.body));
  assert.equal(off.body.done.restocked, 0);
  assert.equal(Number((await itemBySku(`${PREFIX}CBL`)).quantity), 40, 'with the option off, stock is left alone');

  const blank = await call('POST', '/stock/import', { rows: [HEADER, cableRow({ 8: '' })], dry_run: false, opening_date: '2026-04-02' });
  assert.equal(blank.status, 201, JSON.stringify(blank.body));
  assert.equal(Number((await itemBySku(`${PREFIX}CBL`)).quantity), 40, 'a blank quantity keeps the stock');
});

test('an item is found by its name when the sheet has no SKU, and blank cells change nothing', { skip }, async () => {
  const r = await call('POST', '/stock/import', {
    rows: [HEADER, cableRow({ 1: '', 2: '', 3: '', 6: 33, 8: '', 12: '' })], dry_run: false, opening_date: '2026-04-02',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.done.created, 0, 'matched by name, not duplicated');
  const item = await itemBySku(`${PREFIX}CBL`);
  assert.equal(Number(item.selling_rate), 33, 'the price was updated');
  assert.equal(item.sku, `${PREFIX}CBL`, 'a blank SKU does not wipe the saved one');
  assert.equal(item.category, 'Cables', 'a blank category does not wipe the saved one');
  assert.equal(item.brand, 'D-Link', 'a blank brand does not wipe the saved one');

  const clash = await call('POST', '/stock/import', { rows: [HEADER, cableRow({ 1: `${PREFIX}OTHER` })], dry_run: true });
  assert.ok(clash.body.errors.some((e) => /already exists under a different SKU/.test(e)), JSON.stringify(clash.body.errors));
});

test('serial numbers already on the item are not an error on a second upload; new ones are added', { skip }, async () => {
  const again = await call('POST', '/stock/import', { rows: [HEADER, row()], dry_run: true });
  assert.equal(again.body.ok, true, JSON.stringify(again.body.errors));
  assert.equal(again.body.rows[0].stock_mode, 'none');

  const more = await call('POST', '/stock/import', {
    rows: [HEADER, row({ 8: 4, 16: 'ZZSN-1, ZZSN-2, ZZSN-3, ZZSN-4' })], dry_run: false, opening_date: '2026-04-02',
  });
  assert.equal(more.status, 201, JSON.stringify(more.body));
  made.journals.push(more.body.done.restock_journal_id);
  assert.equal(more.body.done.serials, 1, 'only the new serial was received');
  assert.equal(Number((await itemBySku(`${PREFIX}CAM`)).quantity), 4);
  const [serials] = await db.query('SELECT serial_no FROM item_serials WHERE item_id = ?', [(await itemBySku(`${PREFIX}CAM`)).id]);
  assert.equal(serials.length, 4);
});

test('the same file with the stock columns cleared updates details only', { skip }, async () => {
  const r = await call('POST', '/stock/import', {
    rows: [HEADER, row({ 6: 2750, 8: '', 9: '', 15: 'Y', 16: '' })], dry_run: false, opening_date: '2026-04-01',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.done.updated, 1);
  assert.equal(r.body.done.created, 0);
  assert.equal(r.body.done.journal_id, null, 'no stock came in, so nothing is posted');
  const camera2 = await itemBySku(`${PREFIX}CAM`);
  assert.equal(Number(camera2.selling_rate), 2750, 'the price was updated');
  assert.equal(Number(camera2.quantity), 4, 'the stock was not touched (4 after the extra serial added above)');
});

test('a serial already on record is refused', { skip }, async () => {
  const r = await call('POST', '/stock/import', {
    rows: [HEADER, row({ 0: 'ZZ Other Camera', 1: `${PREFIX}CAM2`, 8: 1, 16: 'ZZSN-2' })], dry_run: true,
  });
  assert.equal(r.body.ok, false);
  assert.ok(r.body.errors.some((e) => /Serial ZZSN-2 is already on record/.test(e)));
});

test('a closed period refuses the import and leaves nothing behind', { skip }, async () => {
  const [[biz]] = await db.query('SELECT id FROM businesses WHERE is_default = 1 LIMIT 1');
  const lockId = randomUUID();
  await db.query(`INSERT INTO period_locks SET ?`, [{ id: lockId, business_id: biz.id, locked_upto: '2026-03-31', reason: 'ZZ import test' }]);
  made.locks.push(lockId);

  const before = await countZZ();
  const items = await db.query('SELECT COUNT(*) AS n FROM inventory_movements');
  const r = await call('POST', '/stock/import', {
    rows: [HEADER, row({ 0: 'ZZ Late Camera', 1: `${PREFIX}LATE`, 16: 'ZZSN-L1, ZZSN-L2, ZZSN-L3' })],
    dry_run: false, opening_date: '2026-03-15',
  });
  assert.equal(r.status, 422, JSON.stringify(r.body));
  assert.match(r.body.error, /closed up to/);
  assert.equal(await countZZ(), before, 'the item must not exist — the item, movement and serials rolled back with the journal');
  const after = await db.query('SELECT COUNT(*) AS n FROM inventory_movements');
  assert.equal(after[0][0].n, items[0][0].n, 'no movement was left behind');
  const [orphans] = await db.query("SELECT id FROM item_serials WHERE serial_no LIKE 'ZZSN-L%'");
  assert.equal(orphans.length, 0, 'no serial was left behind');
});

test('a location that exists is honoured', { skip }, async () => {
  const shed = await call('POST', '/stock/locations', { name: 'ZZ Import Shed', kind: 'store' });
  assert.equal(shed.status, 201);
  made.locations.push(shed.body.id);
  const r = await call('POST', '/stock/import', {
    rows: [HEADER, cableRow({ 0: 'ZZ Shed Cable', 1: `${PREFIX}SHED`, 8: 10, 11: 'zz import shed' })],
    dry_run: false, opening_date: '2026-04-01',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  made.journals.push(r.body.done.journal_id);
  const item = await itemBySku(`${PREFIX}SHED`);
  const [[mv]] = await db.query('SELECT location_id FROM inventory_movements WHERE item_id = ?', [item.id]);
  assert.equal(mv.location_id, shed.body.id, 'the stock went to the named location (matched without regard to case)');
});

test('a sheet cannot take more off a location than it holds', { skip }, async () => {
  // The shed item holds 10 at "ZZ Import Shed"; a sheet with no Location points at the default store, which holds none of it.
  const r = await call('POST', '/stock/import', {
    rows: [HEADER, cableRow({ 0: 'ZZ Shed Cable', 1: `${PREFIX}SHED`, 8: 0 })], dry_run: true,
  });
  assert.equal(r.body.ok, false);
  assert.ok(r.body.errors.some((e) => /only 0 is held at/.test(e)), JSON.stringify(r.body.errors));
});

test.after(async () => {
  if (!db) return;
  const [items] = await db.query('SELECT id FROM inventory_items WHERE sku LIKE ?', [`${PREFIX}%`]);
  for (const { id } of items) {
    await db.query('DELETE FROM item_serials WHERE item_id = ?', [id]);
    await db.query('DELETE FROM inventory_movements WHERE item_id = ?', [id]);
    await db.query('DELETE FROM inventory_items WHERE id = ?', [id]);
  }
  await db.query("DELETE FROM item_serials WHERE serial_no LIKE 'ZZSN-%'");
  for (const id of made.journals.filter(Boolean)) {
    await db.query('DELETE FROM journal_lines WHERE journal_id = ?', [id]);
    await db.query('DELETE FROM journals WHERE id = ?', [id]);
  }
  for (const id of made.locations.filter(Boolean)) await db.query('DELETE FROM stock_locations WHERE id = ?', [id]);
  for (const id of made.locks.filter(Boolean)) await db.query('DELETE FROM period_locks WHERE id = ?', [id]);
  if (businessBefore) {
    await db.query(
      'UPDATE businesses SET state_code = ?, state_name = ?, setup_complete = ? WHERE id = ?',
      [businessBefore.state_code, businessBefore.state_name, businessBefore.setup_complete, businessBefore.id]
    );
  }
  await db.end();
});
