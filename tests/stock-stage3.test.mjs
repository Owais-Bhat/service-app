// Stage 3 acceptance tests: purchases, stock, serial numbers and the
// technician's van — against the local API and test database.
//
//   node --test tests/stock-stage3.test.mjs
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
const made = { docs: [], items: [], parties: [], locations: [], payments: [], counts: [], serials: [] };

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
    tokens = { admin: sign(admin.id, 'admin'), employee: sign(emp.id, 'employee'), employeeId: emp.id };
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

const rupees = (paise) => (Number(paise) / 100).toFixed(2);
const stockOf = async (id) => {
  const [[row]] = await db.query('SELECT quantity, avg_cost_paise, stock_value_paise FROM inventory_items WHERE id = ?', [id]);
  return { qty: Number(row.quantity), avg: Number(row.avg_cost_paise), value: Number(row.stock_value_paise) };
};

let supplier; let camera; let cable; let store; let van;

test('set up: a confirmed business, a supplier, two items and a van', { skip }, async () => {
  const [[biz]] = await db.query('SELECT * FROM businesses WHERE is_default = 1 LIMIT 1');
  businessBefore = biz;
  await db.query(
    `UPDATE businesses SET state_code = '01', state_name = 'Jammu and Kashmir', setup_complete = 1 WHERE id = ?`,
    [biz.id]
  );

  const party = await call('POST', '/parties', {
    display_name: 'ZZ Stage3 Supplier', kind: 'supplier', phone: '9000000301', place_of_supply_state_code: '01',
  });
  assert.equal(party.status, 201);
  supplier = party.body;
  made.parties.push(supplier.id);

  // A serialised device, and cable bought by the roll but used by the metre.
  camera = { id: randomUUID() };
  await db.query('INSERT INTO inventory_items SET ?', [{
    id: camera.id, name: 'ZZ Bullet Camera', unit: 'pcs', base_unit: 'pcs',
    purchase_rate: 0, selling_rate: 3000, quantity: 0, track_serial: 1, warranty_months: 24,
    business_id: biz.id, hsn_sac: '85258900',
  }]);
  cable = { id: randomUUID() };
  await db.query('INSERT INTO inventory_items SET ?', [{
    id: cable.id, name: 'ZZ CAT6 Cable', unit: 'm', base_unit: 'm',
    secondary_unit: 'roll', conversion_factor: 90,
    purchase_rate: 0, selling_rate: 30, quantity: 0, business_id: biz.id,
  }]);
  made.items.push(camera.id, cable.id);

  const locations = (await call('GET', '/stock/locations')).body;
  store = locations.find((l) => l.is_default);
  assert.ok(store, 'the main store should have been seeded');
  assert.ok(locations.some((l) => l.kind === 'customer' && !l.owned), 'a not-ours location for customer devices');

  const vanRes = await call('POST', '/stock/locations', {
    name: 'ZZ Test Van', kind: 'van', employee_id: tokens.employeeId,
  });
  assert.equal(vanRes.status, 201);
  van = vanRes.body;
  made.locations.push(van.id);
});

let poId;

test('an order moves nothing and owes nothing', { skip }, async () => {
  const draft = await call('POST', '/purchases/documents', {
    doc_type: 'purchase_order',
    party_id: supplier.id,
    doc_date: '2026-10-01',
    lines: [
      { item_id: camera.id, description: 'ZZ Bullet Camera', quantity: 10, rate: '1500', tax_rate_bps: 1800 },
      { item_id: cable.id, description: 'ZZ CAT6 Cable', quantity: 2, unit: 'roll', rate: '1800', tax_rate_bps: 1800 },
    ],
  });
  assert.equal(draft.status, 201, JSON.stringify(draft.body));
  poId = draft.body.document.id;
  made.docs.push(poId);

  // A roll is 90 metres — the order already knows what it means on the shelf.
  const cableLine = draft.body.lines.find((l) => l.item_id === cable.id);
  assert.equal(Number(cableLine.base_quantity), 180, '2 rolls is 180 metres of stock');
  assert.equal(Number(cableLine.quantity), 2, 'while the order still reads 2 rolls');

  const issued = await call('POST', `/purchases/documents/${poId}/issue`);
  assert.equal(issued.status, 200);
  assert.match(issued.body.document.doc_no, /^PUR-|^PO-/);
  assert.equal(issued.body.document.journal_id, null, 'an order posts nothing');

  const camStock = await stockOf(camera.id);
  assert.equal(camStock.qty, 0, 'ordering does not put anything on the shelf');
});

let firstGrnId;

test('a partial delivery receives only what arrived', { skip }, async () => {
  const order = (await call('GET', `/purchases/documents/${poId}`)).body;
  const cameraLine = order.lines.find((l) => l.item_id === camera.id);

  const receipt = await call('POST', `/purchases/orders/${poId}/receive`, {
    doc_date: '2026-10-03',
    location_id: store.id,
    lines: [{
      po_line_id: cameraLine.id,
      quantity: 4,
      serial_numbers: ['ZZ-SN-001', 'ZZ-SN-002', 'ZZ-SN-003', 'ZZ-SN-004'],
    }],
  });
  assert.equal(receipt.status, 201, JSON.stringify(receipt.body));
  firstGrnId = receipt.body.document.id;
  made.docs.push(firstGrnId);

  const camStock = await stockOf(camera.id);
  assert.equal(camStock.qty, 4, 'only what turned up is on the shelf');
  assert.equal(camStock.avg, 150000, 'at ₹1,500 each');
  assert.equal(camStock.value, 600000);

  // The order knows it is still waiting for the rest.
  const after = (await call('GET', `/purchases/documents/${poId}`)).body;
  assert.equal(after.document.status, 'partially_received');
  assert.equal(Number(after.lines.find((l) => l.item_id === camera.id).received_qty), 4);

  // Receiving more than is outstanding is refused.
  const tooMany = await call('POST', `/purchases/orders/${poId}/receive`, {
    lines: [{ po_line_id: cameraLine.id, quantity: 20 }],
  });
  assert.equal(tooMany.status, 422);
  assert.equal(tooMany.body.code, 'over_receipt');
});

test('the receipt parks the value in Goods Received Not Billed', { skip }, async () => {
  const grn = (await call('GET', `/purchases/documents/${firstGrnId}`)).body;
  assert.ok(grn.document.journal_id);

  const [lines] = await db.query(
    `SELECT a.code, l.debit_paise, l.credit_paise FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id WHERE l.journal_id = ?`,
    [grn.document.journal_id]
  );
  assert.equal(Number(lines.find((l) => l.code === '1200').debit_paise), 600000, 'stock is an asset now');
  assert.equal(Number(lines.find((l) => l.code === '2300').credit_paise), 600000, 'and we owe for it, unbilled');
  assert.ok(!lines.some((l) => l.code === '2000'), 'no payable until the invoice arrives');
});

let billId;

test('the supplier bill does not receive the goods a second time', { skip }, async () => {
  const before = await stockOf(camera.id);

  const draft = await call('POST', '/purchases/documents', {
    doc_type: 'supplier_bill',
    party_id: supplier.id,
    doc_date: '2026-10-05',
    grn_id: firstGrnId,
    supplier_ref: 'ZZ-SUP-INV-77',
    lines: [{ item_id: camera.id, description: 'ZZ Bullet Camera', quantity: 4, rate: '1500', tax_rate_bps: 1800 }],
  });
  assert.equal(draft.status, 201);
  billId = draft.body.document.id;
  made.docs.push(billId);

  const issued = await call('POST', `/purchases/documents/${billId}/issue`);
  assert.equal(issued.status, 200);

  const after = await stockOf(camera.id);
  assert.equal(after.qty, before.qty, 'the bill must not add the same delivery again');
  assert.equal(after.value, before.value);

  // It clears what the receipt parked and creates the payable.
  const [lines] = await db.query(
    `SELECT a.code, l.debit_paise, l.credit_paise FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id WHERE l.journal_id = ?`,
    [issued.body.document.journal_id]
  );
  assert.equal(Number(lines.find((l) => l.code === '2300').debit_paise), 600000, 'GRNI cleared');
  assert.equal(Number(lines.find((l) => l.code === '2000').credit_paise), 708000, 'payable is the bill total with tax');
  assert.equal(Number(lines.find((l) => l.code === '1300').debit_paise), 54000, 'input CGST claimed');
  assert.equal(Number(lines.find((l) => l.code === '1310').debit_paise), 54000, 'input SGST claimed');
  assert.ok(!lines.some((l) => l.code === '1200'), 'inventory is untouched by the bill');
});

test('freight lands in the cost of the goods, not in a separate expense', { skip }, async () => {
  const draft = await call('POST', '/purchases/documents', {
    doc_type: 'goods_receipt',
    party_id: supplier.id,
    doc_date: '2026-10-06',
    location_id: store.id,
    lines: [{ item_id: cable.id, description: 'ZZ CAT6 Cable', quantity: 1, unit: 'roll', rate: '1800', tax_rate_bps: 1800 }],
    charges: [{ label: 'Freight', amount: '180', tax_rate_bps: 0, tax_treatment: 'exempt' }],
  });
  assert.equal(draft.status, 201, JSON.stringify(draft.body));
  made.docs.push(draft.body.document.id);

  const cableLine = draft.body.lines.find((l) => l.item_id === cable.id);
  assert.equal(Number(cableLine.landed_cost_paise), 18000, 'the whole freight belongs to the only line');

  const issued = await call('POST', `/purchases/documents/${draft.body.document.id}/issue`);
  assert.equal(issued.status, 200);

  const cableStock = await stockOf(cable.id);
  assert.equal(cableStock.qty, 90, 'one roll is 90 metres');
  // (₹1,800 + ₹180) ÷ 90 m = ₹22 a metre
  assert.equal(cableStock.avg, 2200, 'freight is part of what a metre cost');
  assert.equal(cableStock.value, 198000);
});

test('the moving average moves when the price does', { skip }, async () => {
  const before = await stockOf(camera.id); // 4 @ ₹1,500

  const draft = await call('POST', '/purchases/documents', {
    doc_type: 'goods_receipt', party_id: supplier.id, doc_date: '2026-10-08', location_id: store.id,
    lines: [{ item_id: camera.id, description: 'ZZ Bullet Camera', quantity: 4, rate: '1700', tax_rate_bps: 1800,
      serial_numbers: ['ZZ-SN-005', 'ZZ-SN-006', 'ZZ-SN-007', 'ZZ-SN-008'] }],
  });
  made.docs.push(draft.body.document.id);
  await call('POST', `/purchases/documents/${draft.body.document.id}/issue`);

  const after = await stockOf(camera.id);
  assert.equal(after.qty, 8);
  // (4 × 1500 + 4 × 1700) ÷ 8 = ₹1,600
  assert.equal(after.avg, 160000, 'the average is the average, not the latest price');
  assert.equal(after.value, 1280000);
  assert.ok(after.avg > before.avg);
});

test('a serial number cannot arrive twice', { skip }, async () => {
  const draft = await call('POST', '/purchases/documents', {
    doc_type: 'goods_receipt', party_id: supplier.id, doc_date: '2026-10-09', location_id: store.id,
    lines: [{ item_id: camera.id, description: 'ZZ Bullet Camera', quantity: 1, rate: '1600', tax_rate_bps: 1800,
      serial_numbers: ['ZZ-SN-001'] }],
  });
  made.docs.push(draft.body.document.id);
  const issued = await call('POST', `/purchases/documents/${draft.body.document.id}/issue`);
  assert.equal(issued.status, 409);
  assert.equal(issued.body.code, 'duplicate_serial');

  // The count of serials has to match what was received.
  const mismatch = await call('POST', '/purchases/documents', {
    doc_type: 'goods_receipt', party_id: supplier.id, doc_date: '2026-10-09', location_id: store.id,
    lines: [{ item_id: camera.id, description: 'ZZ Bullet Camera', quantity: 3, rate: '1600', tax_rate_bps: 1800,
      serial_numbers: ['ZZ-SN-010'] }],
  });
  made.docs.push(mismatch.body.document.id);
  const bad = await call('POST', `/purchases/documents/${mismatch.body.document.id}/issue`);
  assert.equal(bad.status, 422);
  assert.equal(bad.body.code, 'serial_count_mismatch');
});

test('a serial carries its warranty and where it came from', { skip }, async () => {
  const serials = (await call('GET', `/stock/serials?item_id=${camera.id}&q=ZZ-SN-001`)).body;
  const one = serials.find((s) => s.serial_no === 'ZZ-SN-001');
  assert.ok(one);
  made.serials.push(one.id);
  assert.equal(one.status, 'in_stock');
  assert.equal(one.supplier_name, 'ZZ Stage3 Supplier');
  assert.equal(Number(one.cost_paise), 150000);
  assert.equal(one.warranty_months, 24, 'the item says two years, so the device does');
  assert.ok(one.warranty_until, 'and it knows the date it runs out');
});

test("a customer's own device is tracked but never counted as ours", { skip }, async () => {
  const customer = await call('POST', '/parties', { display_name: 'ZZ Repair Customer', phone: '9000000302' });
  made.parties.push(customer.body.id);

  const valueBefore = (await call('GET', '/stock/valuation')).body.total_value_paise;
  const qtyBefore = (await stockOf(camera.id)).qty;

  const device = await call('POST', '/stock/serials/customer-device', {
    item_id: camera.id, serial_no: 'ZZ-CUSTOMER-DEVICE-1', customer_party_id: customer.body.id,
    notes: 'ZZ test — in for repair, power issue',
  });
  assert.equal(device.status, 201);
  made.serials.push(device.body.id);

  assert.equal((await stockOf(camera.id)).qty, qtyBefore, 'their device is not our stock');
  assert.equal((await call('GET', '/stock/valuation')).body.total_value_paise, valueBefore, 'and it is worth nothing to us');

  const listed = (await call('GET', '/stock/serials?status=customer_owned')).body;
  const found = listed.find((s) => s.serial_no === 'ZZ-CUSTOMER-DEVICE-1');
  assert.ok(found, 'but we can still say exactly where it is');
  assert.equal(Number(found.owned), 0);
  assert.equal(found.customer_name, 'ZZ Repair Customer');
});

test('store to van and back is neither a sale nor an expense', { skip }, async () => {
  const before = await stockOf(camera.id);
  const valueBefore = (await call('GET', '/stock/valuation')).body.total_value_paise;

  const out = await call('POST', '/stock/transfers', {
    from_location_id: store.id, to_location_id: van.id, employee_id: tokens.employeeId,
    note: 'ZZ test — loading the van',
    lines: [{ item_id: camera.id, quantity: 3 }],
  });
  assert.equal(out.status, 201, JSON.stringify(out.body));

  const after = await stockOf(camera.id);
  assert.equal(after.qty, before.qty, 'the business owns exactly as much as before');
  assert.equal((await call('GET', '/stock/valuation')).body.total_value_paise, valueBefore);

  // …but the van is now holding three of them.
  const vanStock = (await call('GET', `/stock/locations/${van.id}/items`)).body;
  const held = vanStock.find((r) => r.id === camera.id);
  assert.equal(held.held_qty, 3);
  assert.equal(held.value_paise, 480000, 'valued at the average, ₹1,600 each');

  // And no income or expense account was touched by any of it.
  const [rows] = await db.query(
    `SELECT COUNT(*) c FROM journal_lines l
       JOIN journals j ON j.id = l.journal_id
       JOIN accounts a ON a.id = l.account_id
      WHERE j.source_type = 'transfer' AND a.type IN ('income', 'expense')`
  );
  assert.equal(Number(rows[0].c), 0);

  // Sending back more than the van holds is refused.
  const tooMuch = await call('POST', '/stock/transfers', {
    from_location_id: van.id, to_location_id: store.id,
    lines: [{ item_id: camera.id, quantity: 9 }],
  });
  assert.equal(tooMuch.status, 422);
  assert.equal(tooMuch.body.code, 'insufficient_stock');

  const back = await call('POST', '/stock/transfers', {
    from_location_id: van.id, to_location_id: store.id,
    lines: [{ item_id: camera.id, quantity: 1 }],
  });
  assert.equal(back.status, 201);
  const vanAfter = (await call('GET', `/stock/locations/${van.id}/items`)).body.find((r) => r.id === camera.id);
  assert.equal(vanAfter.held_qty, 2);
});

test('a reservation holds stock without consuming it', { skip }, async () => {
  const before = await stockOf(cable.id);

  const held = await call('POST', '/stock/reservations', {
    item_id: cable.id, quantity: 30, ref_type: 'estimate', ref_id: randomUUID(), note: 'ZZ test — quoted job',
  });
  assert.equal(held.status, 201);

  const availability = (await call('GET', `/stock/availability/${cable.id}`)).body;
  assert.equal(availability.on_hand, before.qty, 'the shelf still has it');
  assert.equal(availability.reserved, 30);
  assert.equal(availability.available, before.qty - 30, 'but 30 metres are spoken for');
  assert.equal((await stockOf(cable.id)).qty, before.qty, 'a quotation does not reduce stock');

  const tooMuch = await call('POST', '/stock/reservations', {
    item_id: cable.id, quantity: before.qty, ref_type: 'estimate', ref_id: randomUUID(),
  });
  assert.equal(tooMuch.status, 422);
  assert.equal(tooMuch.body.code, 'insufficient_available');
});

test('stock cannot go negative without a deliberate exception', { skip }, async () => {
  const over = await call('POST', '/stock/adjustments', {
    item_id: camera.id, type: 'adjust_out', quantity: 999, reason: 'ZZ test — impossible',
  });
  assert.equal(over.status, 422);
  assert.equal(over.body.code, 'insufficient_stock');

  const noReason = await call('POST', '/stock/adjustments', {
    item_id: camera.id, type: 'adjust_out', quantity: 1,
  });
  assert.equal(noReason.status, 400, 'an adjustment without a reason is refused');
});

test('a stock count posts its difference to the accounts', { skip }, async () => {
  const before = await stockOf(camera.id);

  const count = await call('POST', '/stock/counts', {
    count_date: '2026-10-15', location_id: store.id, note: 'ZZ test — monthly count',
    lines: [{ item_id: camera.id, counted_qty: before.qty - 1, note: 'one missing' }],
  });
  assert.equal(count.status, 201);
  made.counts.push(count.body.count.id);
  assert.equal(Number(count.body.lines[0].difference_qty), -1);

  // Counting alone changes nothing — approval does.
  assert.equal((await stockOf(camera.id)).qty, before.qty);

  const approved = await call('POST', `/stock/counts/${count.body.count.id}/approve`);
  assert.equal(approved.status, 200);
  assert.equal((await stockOf(camera.id)).qty, before.qty - 1);

  const [lines] = await db.query(
    `SELECT a.code, l.debit_paise, l.credit_paise FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id WHERE l.journal_id = ?`,
    [approved.body.journal_id]
  );
  assert.equal(Number(lines.find((l) => l.code === '5010').debit_paise), 160000, 'the loss is an expense, not a silent edit');
  assert.equal(Number(lines.find((l) => l.code === '1200').credit_paise), 160000);

  const again = await call('POST', `/stock/counts/${count.body.count.id}/approve`);
  assert.equal(again.status, 422, 'a count settles once');
});

test('paying the supplier clears the payable', { skip }, async () => {
  const payables = (await call('GET', '/purchases/payables?as_on=2026-12-31')).body;
  const bill = payables.bills.find((b) => b.id === billId);
  assert.ok(bill, 'the bill is outstanding until it is paid');
  assert.equal(bill.outstanding_paise, 708000);

  const half = 354000;
  const payment = await call('POST', '/purchases/payments', {
    party_id: supplier.id, payment_date: '2026-10-20', method: 'bank',
    amount_paise: half, reference: 'ZZ-NEFT-1',
    allocations: [{ document_id: billId, amount_paise: half }],
  });
  assert.equal(payment.status, 201, JSON.stringify(payment.body));
  made.payments.push(payment.body.payment.id);

  const after = (await call('GET', `/purchases/documents/${billId}`)).body;
  assert.equal(after.paid_paise, half);
  assert.equal(after.payment_status, 'part_paid');

  const over = await call('POST', '/purchases/payments', {
    party_id: supplier.id, method: 'bank', amount_paise: 999999,
    allocations: [{ document_id: billId, amount_paise: 999999 }],
  });
  assert.equal(over.status, 422);
  assert.equal(over.body.code, 'over_paid');
});

test('the stock ledger and the valuation agree', { skip }, async () => {
  const valuation = (await call('GET', '/stock/valuation')).body;
  assert.equal(valuation.method, 'moving average cost');
  assert.deepEqual(valuation.discrepancies, [], 'the running count must match the ledger for every item');

  const sum = valuation.items.reduce((s, i) => s + i.value_paise, 0);
  assert.equal(sum, valuation.total_value_paise);

  // And the ledger's inventory account agrees with the goods on the shelf.
  const [[account]] = await db.query(
    `SELECT COALESCE(SUM(l.debit_paise), 0) - COALESCE(SUM(l.credit_paise), 0) net
       FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE a.code = '1200'`
  );
  const ours = valuation.items
    .filter((i) => made.items.includes(i.id))
    .reduce((s, i) => s + i.value_paise, 0);
  assert.equal(Number(account.net), ours,
    `inventory in the ledger (${rupees(account.net)}) must equal the stock it represents (${rupees(ours)})`);
});

test('a receipt cannot be unwound once it has been billed', { skip }, async () => {
  const blocked = await call('POST', `/purchases/documents/${firstGrnId}/cancel`, {
    reason: 'ZZ test — sent back',
  });
  assert.equal(blocked.status, 422);
  assert.equal(blocked.body.code, 'has_bill');
});

test('permissions hold on the stock side too', { skip }, async () => {
  assert.equal((await call('POST', '/purchases/documents', { doc_type: 'purchase_order' }, 'employee')).status, 403);
  assert.equal((await call('POST', '/stock/adjustments', { item_id: camera.id, type: 'adjust_in', quantity: 1, reason: 'x' }, 'employee')).status, 403);
  assert.equal((await call('GET', '/stock/valuation', null, 'employee')).status, 403, 'a technician does not see cost');

  // …but a technician may look at stock and move it between locations.
  assert.equal((await call('GET', '/stock/locations', null, 'employee')).status, 200);
  assert.equal((await call('GET', `/stock/availability/${camera.id}`, null, 'employee')).status, 200);
});

test.after(async () => {
  if (!db) return;
  const docIds = made.docs.filter(Boolean);
  for (const id of docIds) {
    const [[doc]] = await db.query('SELECT journal_id FROM purchase_documents WHERE id = ?', [id]);
    await db.query('DELETE FROM purchase_allocations WHERE document_id = ?', [id]);
    await db.query('DELETE FROM purchase_document_lines WHERE document_id = ?', [id]);
    await db.query('DELETE FROM purchase_documents WHERE id = ?', [id]);
    if (doc?.journal_id) {
      const [[rev]] = await db.query('SELECT reversed_by_id FROM journals WHERE id = ?', [doc.journal_id]);
      for (const jid of [doc.journal_id, rev?.reversed_by_id].filter(Boolean)) {
        await db.query('DELETE FROM journal_lines WHERE journal_id = ?', [jid]);
        await db.query('UPDATE journals SET reversed_by_id = NULL, reversal_of_id = NULL WHERE id = ?', [jid]);
        await db.query('DELETE FROM journals WHERE id = ?', [jid]);
      }
    }
  }
  for (const id of made.payments.filter(Boolean)) {
    const [[pay]] = await db.query('SELECT journal_id FROM payments WHERE id = ?', [id]);
    await db.query('DELETE FROM purchase_allocations WHERE payment_id = ?', [id]);
    await db.query('DELETE FROM payments WHERE id = ?', [id]);
    if (pay?.journal_id) {
      await db.query('DELETE FROM journal_lines WHERE journal_id = ?', [pay.journal_id]);
      await db.query('DELETE FROM journals WHERE id = ?', [pay.journal_id]);
    }
  }
  for (const id of made.counts.filter(Boolean)) {
    const [[count]] = await db.query('SELECT journal_id FROM stock_counts WHERE id = ?', [id]);
    await db.query('DELETE FROM stock_count_lines WHERE count_id = ?', [id]);
    await db.query('DELETE FROM stock_counts WHERE id = ?', [id]);
    if (count?.journal_id) {
      await db.query('DELETE FROM journal_lines WHERE journal_id = ?', [count.journal_id]);
      await db.query('DELETE FROM journals WHERE id = ?', [count.journal_id]);
    }
  }
  for (const id of made.items.filter(Boolean)) {
    await db.query('DELETE FROM item_serials WHERE item_id = ?', [id]);
    await db.query('DELETE FROM stock_reservations WHERE item_id = ?', [id]);
    await db.query('DELETE FROM inventory_movements WHERE item_id = ?', [id]);
    await db.query('DELETE FROM inventory_items WHERE id = ?', [id]);
  }
  for (const id of made.locations.filter(Boolean)) await db.query('DELETE FROM stock_locations WHERE id = ?', [id]);
  for (const id of made.parties.filter(Boolean)) {
    await db.query('DELETE FROM journal_lines WHERE party_id = ?', [id]);
    await db.query('DELETE FROM parties WHERE id = ?', [id]);
  }
  // Any stray journal these tests raised.
  await db.query("DELETE jl FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id WHERE j.narration LIKE '%ZZ %'");
  await db.query("DELETE FROM journals WHERE narration LIKE '%ZZ %'");
  await db.query("DELETE FROM audit_log WHERE reason LIKE 'ZZ test%'");

  if (businessBefore) {
    await db.query(
      'UPDATE businesses SET state_code = ?, state_name = ?, setup_complete = ? WHERE id = ?',
      [businessBefore.state_code, businessBefore.state_name, businessBefore.setup_complete, businessBefore.id]
    );
  }
  await db.end();
});
