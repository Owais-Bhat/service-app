// Bringing a Vyapar backup in: reading it, then the three steps (parties with opening balances, items with
// stock, past records to look at), and the promise that none of them is counted twice.
//
//   node --test tests/vyapar-import.test.mjs
//
// A small made-up Vyapar file is built in the test (no real data is ever used). The reading tests need only the
// code; the import tests need the local API and the test database and skip without them. Everything created is
// removed afterwards.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const initSqlJs = require('../node_modules/sql.js');
const { zipSync } = require('../node_modules/fflate');
const reader = require('../server/modules/vyapar/reader.cjs');
const API = 'http://127.0.0.1:5000/api';

import { makeVyb, GSTIN_OK } from './helpers/vyapar-fixture.mjs';

// ── reading (no database) ───────────────────────────────────────────────
test('a Vyapar backup is read into parties, items and documents', async () => {
  const data = await reader.readVyapar(await makeVyb());
  assert.equal(data.firm.name, 'ZZV Test Firm');

  assert.equal(data.parties.length, 6, 'the expense head "Petrol" is not a party');
  assert.deepEqual(data.expenseNames, ['Petrol']);
  const hotel = data.parties.find((p) => p.name === 'ZZV Hotel Heevan');
  assert.equal(hotel.phone, '9876543210', '+91 and spaces are removed');
  assert.equal(hotel.balance_paise, 1250050, 'a positive balance is what they owe us');
  assert.equal(hotel.state_code, '01', 'the state comes from the GSTIN');
  assert.equal(hotel.gstin, GSTIN_OK);
  assert.equal(hotel.kind, 'customer');
  const supplier = data.parties.find((p) => p.name === 'ZZV Cable Distributor');
  assert.equal(supplier.balance_paise, -400000, 'a negative balance is what we owe them');
  assert.equal(supplier.kind, 'supplier', 'bought from, never sold to');
  assert.equal(supplier.phone, '9123456780', 'a leading 0 is dropped');
  assert.equal(supplier.state_code, '07', 'Delhi');
  const wrong = data.parties.find((p) => p.name === 'ZZV Wrong Gstin Traders');
  assert.equal(wrong.gstin, null, 'a GSTIN that fails its own check digit is left out…');
  assert.ok(data.warnings.some((w) => /Wrong Gstin/.test(w)), '…and said so');
});

test('items: prices before tax, only real stock, the GST rate it was really sold at', async () => {
  const data = await reader.readVyapar(await makeVyb());
  const cam = data.items.find((i) => i.name === 'ZZV Dome Camera');
  assert.equal(cam.sale_price, 2000, '₹2,360 with 18% included is ₹2,000 before tax');
  assert.equal(cam.purchase_price, 1000);
  assert.equal(cam.gst_rate, 18);
  assert.equal(cam.category, 'CAMERA');
  assert.equal(cam.unit, 'Nos');
  assert.equal(cam.stock_qty, 5);
  const cable = data.items.find((i) => i.name === 'ZZV CAT6 Cable');
  assert.equal(cable.stock_qty, -40);
  assert.equal(cable.unit, 'Mtr');
  const unpriced = data.items.find((i) => i.name === 'ZZV Unpriced Item');
  assert.equal(unpriced.sale_price, 500, 'a price it never had is taken from the last time it was sold');
  assert.equal(unpriced.gst_rate_known, true);
  assert.equal(unpriced.gst_rate, 18, 'and so is the GST rate');
});

test('documents keep their numbers, lines, charges and the links between them', async () => {
  const data = await reader.readVyapar(await makeVyb());
  const sale = data.documents.find((d) => d.source_id === '10');
  assert.equal(sale.doc_type, 'sale');
  assert.equal(sale.doc_no, 'NE/2026/101');
  assert.equal(sale.date, '2026-09-20');
  assert.equal(sale.total_paise, 472000);
  assert.equal(sale.paid_paise, 0);
  assert.equal(sale.lines.length, 2);
  assert.equal(sale.lines[0].name, 'ZZV Dome Camera');
  assert.equal(sale.lines[0].rate_paise, 200000);
  assert.equal(sale.lines[0].tax_rate_bps, 1800);
  assert.equal(sale.lines[0].amount_paise, 472000, 'the line total includes tax');
  assert.equal(sale.lines[0].serial_no, 'SN-A1, SN-A2');
  assert.equal(sale.lines[0].unit, 'Nos');

  const payment = data.documents.find((d) => d.source_id === '11');
  assert.equal(payment.doc_type, 'payment_in');
  assert.equal(payment.total_paise, 200000);
  assert.equal(payment.payment_mode, 'Main account');
  assert.equal(payment.reference, 'UTR778');
  assert.deepEqual(sale.links.map((l) => [l.kind, l.with]).sort(), [['converted_from', '12'], ['payment', '11']]);
  assert.equal(sale.links.find((l) => l.kind === 'payment').amount_paise, 200000);

  assert.equal(data.documents.find((d) => d.source_id === '12').doc_type, 'estimate');
  assert.equal(data.documents.find((d) => d.source_id === '13').doc_type, 'purchase');
  assert.equal(data.documents.find((d) => d.source_id === '14').doc_type, 'expense');
});

test('the preview carries counts and totals, never the customers', async () => {
  const data = await reader.readVyapar(await makeVyb());
  const s = reader.summarise(data);
  assert.equal(s.parties.count, 6);
  assert.equal(s.parties.owe_us.count, 4);
  assert.equal(s.parties.owe_us.paise, 1250050 + 10000 + 10000 + 20000);
  assert.equal(s.parties.we_owe.paise, 400000);
  assert.equal(s.items.with_stock, 2, 'the camera, and the inactive item that still has 3');
  assert.equal(s.items.negative_stock, 1);
  assert.equal(s.documents.count, 5);
  assert.equal(s.documents.by_type.sale.count, 1);
  const text = JSON.stringify({ ...s, warnings: [] });   // warnings do name the party, so the owner can fix it
  for (const name of ['Hotel Heevan', 'Cable Distributor', 'Walk-in', '9876543210', 'heevan@example.com']) {
    assert.ok(!text.includes(name), `${name} must not be in the preview`);
  }
});

test('a file that is not a Vyapar backup is refused with a reason', async () => {
  await assert.rejects(() => reader.readVyapar(Buffer.from('this is not a database at all, just text')), (e) => e.code === 'not_vyapar');
  const zipOfText = Buffer.from(zipSync({ 'notes.txt': new TextEncoder().encode('hello') }));
  await assert.rejects(() => reader.readVyapar(zipOfText), (e) => e.code === 'not_vyapar');
  await assert.rejects(() => reader.readVyapar(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])), (e) => ['bad_zip', 'not_vyapar'].includes(e.code));
  const SQL = await initSqlJs();
  const empty = new SQL.Database();
  empty.run('CREATE TABLE other (x INTEGER)');
  await assert.rejects(() => reader.readVyapar(Buffer.from(empty.export())), (e) => e.code === 'not_vyapar');
});

// ── the import (database) ───────────────────────────────────────────────
let mysql; let jwt; let db; let tokens; let reachable = false; let businessId;
const made = { journals: [] };

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/vyapar/status`).catch(() => null);
  reachable = !!probe && probe.status === 401;
  if (reachable) {
    db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
    const [[admin]] = await db.query("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1");
    const sign = (id, role) => jwt.sign({ id, email: `${role}@test.local`, role, worker_type: 'fixed' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    tokens = { admin: sign(admin.id, 'admin'), employee: sign(randomUUID(), 'employee') };
    [[{ id: businessId }]] = [await db.query('SELECT id FROM businesses WHERE is_default = 1 LIMIT 1').then(([r]) => r)];
  }
} catch { reachable = false; }
const skip = reachable ? false : 'needs the local API on port 5000 and the test database';

const call = async (method, path, body, who = 'admin') => {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const upload = async (buffer, who = 'admin') => {
  const res = await fetch(`${API}/vyapar/upload`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[who]}`, 'Content-Type': 'application/octet-stream', 'X-File-Name': 'test.vyb' }, body: buffer });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const AS_ON = '2026-10-03';
let session; let existingParty;

test('set up: a customer already in the portal under the same phone', { skip }, async () => {
  existingParty = randomUUID();
  await db.query('INSERT INTO parties SET ?', [{ id: existingParty, business_id: businessId, kind: 'customer', display_name: 'ZZV Heevan (typed here)', phone: '9876543210' }]);
});

test('only an admin can upload, and only a real backup is accepted', { skip }, async () => {
  assert.equal((await upload(await makeVyb(), 'employee')).status, 403);
  const junk = await upload(Buffer.from('not a backup'));
  assert.equal(junk.status, 400);
  assert.equal(junk.body.code, 'not_vyapar');
  const ok = await upload(await makeVyb());
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.summary.parties.count, 6);
  assert.ok(!JSON.stringify(ok.body).includes('Cable Distributor'));
  session = ok.body.session;
  assert.equal((await call('POST', `/vyapar/${'0'.repeat(32)}/parties`, { as_on: AS_ON })).status, 410, 'an unknown or expired upload');
});

test('parties: created with their balances, an existing one matched by phone, nothing duplicated', { skip }, async () => {
  const noDate = await call('POST', `/vyapar/${session}/parties`, {});
  assert.equal(noDate.status, 400);

  const first = await call('POST', `/vyapar/${session}/parties`, { as_on: AS_ON });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.created, 5);
  assert.equal(first.body.matched_existing, 1, 'the customer already here was recognised by phone');
  assert.equal(first.body.we_owe_paise, 400000);

  const [[dist]] = await db.query("SELECT * FROM parties WHERE display_name = 'ZZV Cable Distributor'");
  assert.equal(dist.kind, 'supplier');
  assert.equal(Number(dist.opening_balance_paise), 400000);
  assert.equal(dist.opening_balance_type, 'payable');
  assert.equal(String(dist.opening_balance_on).slice(0, 10) || new Date(dist.opening_balance_on).toLocaleDateString('en-CA'), String(dist.opening_balance_on).slice(0, 10));
  assert.equal(dist.place_of_supply_state_code, '07');
  assert.equal(dist.notes, 'Imported from Vyapar');

  const [[mine]] = await db.query('SELECT * FROM parties WHERE id = ?', [existingParty]);
  assert.equal(mine.display_name, 'ZZV Heevan (typed here)', 'what was typed here is never overwritten');
  assert.equal(Number(mine.opening_balance_paise), 1250050, 'but its opening balance was filled in');
  assert.equal(mine.gstin, GSTIN_OK, 'and the GSTIN it lacked');
  const [dupes] = await db.query("SELECT id FROM parties WHERE phone = '9876543210' AND merged_into_id IS NULL");
  assert.equal(dupes.length, 1, 'no second record for the same phone');
  const [addr] = await db.query('SELECT line1, pincode FROM party_addresses WHERE party_id = (SELECT id FROM parties WHERE display_name = ?)', ['ZZV Walk-in Shop']);
  assert.equal(addr.length, 0, 'no address, no address row');

  // Two shops with one phone number stay two accounts, each with its own balance — merging them would merge the money.
  const [twins] = await db.query("SELECT display_name, opening_balance_paise FROM parties WHERE display_name LIKE 'ZZV Twin Shop %' ORDER BY display_name");
  assert.deepEqual(twins.map((t) => [t.display_name, Number(t.opening_balance_paise)]), [['ZZV Twin Shop A', 10000], ['ZZV Twin Shop B', 20000]]);

  // The second time: still the same people, and no balance moved.
  const again = await call('POST', `/vyapar/${session}/parties`, { as_on: AS_ON });
  assert.equal(again.body.created, 0);
  assert.equal(again.body.with_opening_balance, 0, 'a balance is set once');
  const [[after]] = await db.query("SELECT COUNT(*) AS n FROM parties WHERE display_name LIKE 'ZZV %'");
  assert.equal(Number(after.n), 6, 'five created + the one that was already here');
});

test('items: the catalogue comes with real stock only, in one balanced opening-stock journal', { skip }, async () => {
  const res = await call('POST', `/vyapar/${session}/items`, { as_on: AS_ON });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  made.journals.push(...res.body.stock_journals);
  assert.equal(res.body.created, 3, 'the inactive item is left out');
  assert.equal(res.body.with_stock, 1, 'only the camera has stock');
  assert.equal(res.body.negative_stock, 1);
  assert.equal(res.body.stock_value_paise, 5 * 100000);

  const [[cam]] = await db.query("SELECT * FROM inventory_items WHERE name = 'ZZV Dome Camera'");
  assert.equal(Number(cam.quantity), 5);
  assert.equal(Number(cam.selling_rate), 2000);
  assert.equal(Number(cam.gst_rate), 18);
  assert.equal(cam.hsn_sac, '85258900');
  assert.equal(cam.sku, 'ZZV-CAM');
  const [[cable]] = await db.query("SELECT * FROM inventory_items WHERE name = 'ZZV CAT6 Cable'");
  assert.equal(Number(cable.quantity), 0, 'negative stock is not imported');
  const [[old]] = await db.query("SELECT COUNT(*) AS n FROM inventory_items WHERE name = 'ZZV Old Item'");
  assert.equal(Number(old.n), 0);

  const [lines] = await db.query('SELECT a.code, l.debit_paise, l.credit_paise FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.journal_id = ?', [res.body.stock_journals[0]]);
  assert.equal(Number(lines.find((l) => l.code === '1200').debit_paise), 500000, 'Dr Inventory');
  assert.equal(Number(lines.find((l) => l.code === '3100').credit_paise), 500000, 'Cr Opening Balance Equity');

  const again = await call('POST', `/vyapar/${session}/items`, { as_on: AS_ON });
  assert.equal(again.body.created, 0);
  assert.equal(again.body.with_stock, 0, 'the same items again add no stock');
  assert.equal(Number((await db.query("SELECT quantity FROM inventory_items WHERE name = 'ZZV Dome Camera'"))[0][0].quantity), 5);
});

test('history: past records are kept to look at, tied to their party and items, and replaced — not doubled — on a second run', { skip }, async () => {
  const res = await call('POST', `/vyapar/${session}/history`, {});
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.documents, 5);
  assert.equal(res.body.lines, 4);
  assert.equal(res.body.by_type.sale, 1);

  const list = await call('GET', '/vyapar/history?type=sale');
  assert.equal(list.status, 200);
  assert.equal(list.body.rows.length, 1);
  const sale = list.body.rows[0];
  assert.equal(sale.doc_no, 'NE/2026/101');
  assert.equal(sale.doc_date, '2026-09-20', 'the day it was made, not the evening before');
  assert.equal(sale.party_id, existingParty, 'tied to the party that was matched, not a new one');
  assert.equal(Number(sale.total_paise), 472000);

  const detail = await call('GET', `/vyapar/history/${sale.id}`);
  assert.equal(detail.body.document.doc_date, '2026-09-20');
  assert.equal(detail.body.document.due_date, '2026-10-05');
  assert.equal(detail.body.related.find((r) => r.kind === 'payment').record.doc_date, '2026-09-25');
  assert.equal(detail.body.lines.length, 2);
  assert.equal(detail.body.lines[0].item_name, 'ZZV Dome Camera');
  assert.ok(detail.body.lines[0].item_id, 'the line points at the portal item');
  assert.equal(detail.body.lines[0].serial_no, 'SN-A1, SN-A2');
  assert.deepEqual(detail.body.related.map((r) => r.kind).sort(), ['converted_from', 'payment']);
  assert.equal(detail.body.related.find((r) => r.kind === 'payment').record.doc_type, 'payment_in');

  const byParty = await call('GET', `/vyapar/history?party_id=${existingParty}`);
  assert.equal(byParty.body.total, 3, 'its sale, its payment and its quotation');
  const search = await call('GET', '/vyapar/history?q=101');
  assert.equal(search.body.rows.length, 1);
  const dated = await call('GET', '/vyapar/history?from=2026-09-15&to=2026-09-30');
  assert.deepEqual(dated.body.rows.map((r) => r.doc_type).sort(), ['payment_in', 'sale']);

  await call('POST', `/vyapar/${session}/history`, {});
  const [[n]] = await db.query("SELECT COUNT(*) AS n FROM legacy_documents WHERE business_id = ? AND source = 'vyapar'", [businessId]);
  assert.equal(Number(n.n), 5, 'a second run replaces the first');
  assert.equal((await call('GET', '/vyapar/history', null, 'employee')).status, 403, 'a technician cannot read the business history');
});

test('importing the history does not touch the books', { skip }, async () => {
  const [[docs]] = await db.query("SELECT COUNT(*) AS n FROM sales_documents WHERE party_id = ?", [existingParty]);
  assert.equal(Number(docs.n), 0, 'no sales document was created');
  const [[journals]] = await db.query("SELECT COUNT(*) AS n FROM journals j JOIN journal_lines l ON l.journal_id = j.id WHERE l.party_id = ?", [existingParty]);
  assert.equal(Number(journals.n), 0, 'and nothing was posted against the party');
});

test('the status shows what has been brought', { skip }, async () => {
  const s = await call('GET', '/vyapar/status');
  assert.equal(s.status, 200);
  assert.equal(s.body.history_documents, 5);
  assert.ok(s.body.parties_brought >= 6 && s.body.items_brought >= 3);
  assert.ok(s.body.last.parties && s.body.last.items && s.body.last.history);
  assert.equal((await call('GET', '/vyapar/status', null, 'employee')).status, 403);
});

test.after(async () => {
  if (!db) return;
  try {
    const [parties] = await db.query("SELECT id FROM parties WHERE display_name LIKE 'ZZV %'");
    const ids = parties.map((p) => p.id);
    if (ids.length) {
      await db.query('DELETE FROM party_addresses WHERE party_id IN (?)', [ids]);
      await db.query('DELETE FROM parties WHERE id IN (?)', [ids]);
    }
    await db.query("DELETE l FROM legacy_document_lines l JOIN legacy_documents d ON d.id = l.document_id WHERE d.business_id = ? AND d.source = 'vyapar'", [businessId]);
    await db.query("DELETE FROM legacy_documents WHERE business_id = ? AND source = 'vyapar'", [businessId]);
    await db.query('DELETE FROM vyapar_map WHERE business_id = ?', [businessId]);
    await db.query('DELETE FROM vyapar_imports WHERE business_id = ?', [businessId]);
    const [items] = await db.query("SELECT id FROM inventory_items WHERE name LIKE 'ZZV %'");
    for (const { id } of items) {
      await db.query('DELETE FROM inventory_movements WHERE item_id = ?', [id]);
      await db.query('DELETE FROM inventory_items WHERE id = ?', [id]);
    }
    for (const id of made.journals.filter(Boolean)) {
      await db.query('DELETE FROM journal_lines WHERE journal_id = ?', [id]);
      await db.query('DELETE FROM journals WHERE id = ?', [id]);
    }
    await db.query("DELETE FROM audit_log WHERE action LIKE 'vyapar.%' OR action = 'stock.import'").catch(() => {});
  } finally {
    await db.end();
  }
});
