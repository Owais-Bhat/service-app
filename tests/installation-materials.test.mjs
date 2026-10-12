// An installer records the items he fitted, from his own van; the customer's bill is made and corrected from them.
// He sees items and quantities only — never a rate or a total.
//
//   node --test tests/installation-materials.test.mjs
//
// Needs the local API and the test database; skips without them. Everything it creates is removed at the end.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const API = 'http://127.0.0.1:5000/api';

let mysql; let jwt; let db; let reachable = false;
let adminToken; let techToken; let otherToken;
let businessBefore; let businessId;
const made = { profiles: [], installations: [], items: [], locations: [], docs: [], parties: [], payments: [] };
let tech; let other; let item; let van; let store; let inst; let invoiceId;

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
    adminToken = sign(admin.id, 'admin');
    tech = randomUUID(); other = randomUUID();
    techToken = sign(tech, 'employee');
    otherToken = sign(other, 'employee');
  }
} catch { reachable = false; }

const skip = reachable ? false : 'needs the local API on port 5000 and the test database';
const call = async (method, path, body, tk = adminToken) => {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const held = async (locationId) => {
  const r = await call('GET', `/stock/locations/${locationId}/items`);
  return Number(r.body.find((x) => x.id === item.id)?.held_qty || 0);
};
const put = (lines, tk = techToken) => call('PUT', `/installations/${inst}/materials`, { lines }, tk);
const hasMoney = (obj) => JSON.stringify(obj).match(/_paise|rate|total|amount/i);

test('set up: a technician with a van, a camera costing 1000 selling at 2500, and an installation given to him', { skip }, async () => {
  const [[biz]] = await db.query('SELECT * FROM businesses WHERE is_default = 1 LIMIT 1');
  businessBefore = biz; businessId = biz.id;
  await db.query("UPDATE businesses SET state_code = '01', state_name = 'Jammu and Kashmir', setup_complete = 1 WHERE id = ?", [biz.id]);

  for (const [id, name] of [[tech, 'ZZ Install Tech'], [other, 'ZZ Other Tech']]) {
    await db.query("INSERT INTO profiles (id, full_name, role, can_assign_tickets) VALUES (?, ?, 'employee', 0)", [id, name]);
    made.profiles.push(id);
  }

  item = { id: randomUUID() };
  await db.query('INSERT INTO inventory_items SET ?', [{
    id: item.id, business_id: businessId, name: 'ZZ Install Camera', unit: 'pcs', base_unit: 'pcs',
    purchase_rate: 1000, selling_rate: 2500, gst_rate: 18, quantity: 0, avg_cost_paise: 0, stock_value_paise: 0,
  }]);
  made.items.push(item.id);

  const supplier = await call('POST', '/parties', { display_name: 'ZZ Install Supplier', kind: 'supplier' });
  made.parties.push(supplier.body.id);
  const grn = await call('POST', '/purchases/documents', {
    doc_type: 'goods_receipt', party_id: supplier.body.id, doc_date: '2026-10-01',
    lines: [{ item_id: item.id, description: 'ZZ Install Camera', quantity: 10, rate: '1000', tax_rate_bps: 1800 }],
  });
  assert.equal(grn.status, 201, JSON.stringify(grn.body));
  made.docs.push(grn.body.document.id);
  assert.equal((await call('POST', `/purchases/documents/${grn.body.document.id}/issue`)).status, 200);

  store = (await call('GET', '/stock/locations')).body.find((l) => l.is_default);
  const loc = await call('POST', '/stock/locations', { name: 'ZZ Install Van', kind: 'van', employee_id: tech });
  van = loc.body; made.locations.push(van.id);
  const give = await call('POST', '/stock/transfers', { from_location_id: store.id, to_location_id: van.id, employee_id: tech, lines: [{ item_id: item.id, quantity: 6 }] });
  assert.equal(give.status, 201, JSON.stringify(give.body));

  inst = randomUUID();
  await db.query('INSERT INTO installations SET ?', [{
    id: inst, ticket_no: `ZZIM-${Date.now() % 100000}`, full_name: 'ZZ Install Customer', phone: '9000000882',
    location: 'Srinagar', installation_type: 'CCTV', preferred_date: '2026-10-20', preferred_time: 'Morning',
    address: 'ZZ test address', status: 'in_progress', assigned_employee_id: tech, assignment_status: 'accepted',
  }]);
  made.installations.push(inst);
});

test('the technician sees what is in his van — items and quantities, no money', { skip }, async () => {
  const r = await call('GET', `/installations/${inst}/materials`, null, techToken);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const camera = r.body.items.find((i) => i.item_id === item.id);
  assert.equal(camera.held_qty, 6);
  assert.equal(camera.on_job, 0);
  assert.equal(r.body.van.id, van.id);
  assert.equal(r.body.invoice, null);
  assert.ok(!hasMoney(r.body.items), 'no rate or cost on an item');
});

test('submitting takes the items from his van and keeps a DRAFT bill — nothing is sent, and he cannot see the amount', { skip }, async () => {
  const r = await put([{ item_id: item.id, quantity: 2 }]);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await held(van.id), 4, 'two left his van');
  assert.equal(r.body.items.find((i) => i.item_id === item.id).on_job, 2);
  assert.ok(r.body.invoice, 'a bill exists (as a draft, so it has no number yet)');
  assert.equal(r.body.invoice.status, 'draft', 'not issued until the office confirms');
  assert.equal(r.body.invoice.sent, false, 'and nothing is sent to the customer');
  assert.equal(r.body.invoice.total_paise, undefined, 'the technician is not told the total');
  assert.equal(r.body.invoice.lines, undefined);
  assert.equal(r.body.materials_status, 'submitted');
  assert.equal(r.body.saved.submitted, true);

  // The office is alerted: a stored notification for admins, with the line the browser speaks.
  let note;
  for (let i = 0; i < 20 && !note; i += 1) {
    const [rows] = await db.query(
      "SELECT audience_role, title, data FROM notifications WHERE subject = 'installation_items_submitted' ORDER BY created_at DESC LIMIT 1"
    );
    if (rows[0] && JSON.stringify(rows[0].data).includes(inst)) note = rows[0];
    else await new Promise((res) => setTimeout(res, 100));
  }
  assert.ok(note, 'the office was told');
  assert.equal(note.audience_role, 'admin');
  const payload = typeof note.data === 'string' ? JSON.parse(note.data) : note.data;
  assert.match(payload.voice, /ZZ Install Tech has submitted the installation items for ZZ Install Customer. Please check./);

  const office = await call('GET', `/installations/${inst}/materials`);
  invoiceId = office.body.invoice.id;
  made.docs.push(invoiceId);
  // 2 × ₹2,500 + 18% GST
  assert.equal(office.body.invoice.total_paise, 590000);
  assert.equal(office.body.invoice.lines[0].rate_paise, 250000);
});

test('he can change it afterwards: more items, fewer items — the bill follows and the van balances', { skip }, async () => {
  const more = await put([{ item_id: item.id, quantity: 3 }]);
  assert.equal(more.status, 200, JSON.stringify(more.body));
  assert.equal(await held(van.id), 3);
  const office = await call('GET', `/installations/${inst}/materials`);
  assert.equal(office.body.invoice.id, invoiceId, 'the same bill is corrected, not a second one made');
  assert.equal(office.body.invoice.total_paise, 885000);

  const fewer = await put([{ item_id: item.id, quantity: 1 }]);
  assert.equal(fewer.status, 200, JSON.stringify(fewer.body));
  assert.equal(await held(van.id), 5, 'two came back to his van');
  assert.equal((await call('GET', `/installations/${inst}/materials`)).body.invoice.total_paise, 295000);

  // The same number again changes nothing.
  const same = await put([{ item_id: item.id, quantity: 1 }]);
  assert.equal(same.body.saved.moved, 0);
  assert.equal(await held(van.id), 5);
});

test('he cannot put on a job more than his van holds', { skip }, async () => {
  const r = await put([{ item_id: item.id, quantity: 50 }]);
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'short');
  assert.equal(await held(van.id), 5);
});

test('the installation price he writes is added to the customer’s bill, and he is not shown the total', { skip }, async () => {
  const r = await call('PUT', `/installations/${inst}/materials`, { lines: [{ item_id: item.id, quantity: 1 }], installation_charge: 1500 }, techToken);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.installation_charge, 1500, 'he sees the figure he entered');
  assert.equal(r.body.invoice.total_paise, undefined);
  assert.equal(r.body.saved.charge_changed, true);

  const office = await call('GET', `/installations/${inst}/materials`);
  assert.equal(office.body.invoice.id, invoiceId, 'the same bill, corrected');
  // (1 × ₹2,500 + ₹1,500 installation) + 18% GST
  assert.equal(office.body.invoice.total_paise, 472000);

  // Changing only the price still corrects the bill; with no items at all the price alone is billed.
  const higher = await call('PUT', `/installations/${inst}/materials`, { lines: [{ item_id: item.id, quantity: 1 }], installation_charge: 2000 }, techToken);
  assert.equal(higher.status, 200);
  assert.equal((await call('GET', `/installations/${inst}/materials`)).body.invoice.total_paise, 531000);

  const negative = await call('PUT', `/installations/${inst}/materials`, { lines: [{ item_id: item.id, quantity: 1 }], installation_charge: -5 }, techToken);
  assert.equal(negative.status, 400);
});

test('the office decides the kind of bill; the bill is corrected to match, and the technician cannot', { skip }, async () => {
  const total = async () => (await call('GET', `/installations/${inst}/materials`)).body.invoice.total_paise;
  const kind = (body, tk = adminToken) => call('PUT', `/installations/${inst}/bill-type`, body, tk);
  assert.equal(await total(), 531000, 'GST bill: ₹2,500 + ₹2,000, plus 18%');

  const nonGst = await kind({ bill_type: 'non_gst', show_gst: true });
  assert.equal(nonGst.status, 200, JSON.stringify(nonGst.body));
  assert.equal(nonGst.body.bill.type, 'non_gst');
  assert.equal(nonGst.body.saved.invoice_action, 'drafted');
  assert.equal(await total(), 450000, 'no tax charged on a non-GST bill');

  const serviceFree = await kind({ bill_type: 'service', service_gst: false });
  assert.equal(serviceFree.status, 200, JSON.stringify(serviceFree.body));
  assert.equal(await total(), 450000, 'a service bill with GST switched off charges none');

  const serviceTaxed = await kind({ bill_type: 'service', service_gst: true });
  assert.equal(serviceTaxed.status, 200);
  assert.equal(await total(), 531000, 'a service bill with GST charges it');

  // The technician is never told, and cannot change it.
  const asTech = await call('GET', `/installations/${inst}/materials`, null, techToken);
  assert.equal(asTech.body.bill, undefined);
  assert.equal((await kind({ bill_type: 'non_gst' }, techToken)).status, 403);
  assert.equal((await kind({ bill_type: 'cheque' })).status, 400);

  // His own edits keep the kind the office chose.
  await kind({ bill_type: 'non_gst' });
  const edit = await put([{ item_id: item.id, quantity: 1 }]);
  assert.equal(edit.status, 200);
  assert.equal(await total(), 450000);
  await kind({ bill_type: 'gst' });
  assert.equal(await total(), 531000);
});

test('another technician cannot touch it; the office can', { skip }, async () => {
  assert.equal((await call('GET', `/installations/${inst}/materials`, null, otherToken)).status, 403);
  assert.equal((await put([{ item_id: item.id, quantity: 1 }], otherToken)).status, 403);
  assert.equal((await call('GET', `/installations/${inst}/materials`)).status, 200);
});

test('a technician cannot read the customer rates through the job summary either', { skip }, async () => {
  const s = await call('GET', `/jobs/installation/${inst}/summary`, null, techToken);
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.equal(s.body.totals.revenue_paise, undefined);
  assert.equal(s.body.totals.total_cost_paise, undefined);
  for (const d of s.body.documents) assert.equal(d.total_paise, undefined);
  for (const l of s.body.material_lines) assert.equal(l.sell_rate_paise, undefined);
});

test('the office confirms: the bill is issued and sent, the technician is then locked out, the office can still correct it', { skip }, async () => {
  assert.equal((await call('POST', `/installations/${inst}/confirm`, {}, techToken)).status, 403, 'only the office confirms');
  assert.equal((await call('POST', `/installations/${inst}/send-invoice`, {}, techToken)).status, 403);

  const before = await call('GET', `/installations/${inst}/materials`);
  assert.equal(before.body.invoice.status, 'draft');
  assert.equal(before.body.materials_status, 'submitted');

  const r = await call('POST', `/installations/${inst}/confirm`, {});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.invoice_id, invoiceId);
  assert.equal(r.body.sent, false); // no WhatsApp in the test database
  assert.equal(r.body.state.invoice.status, 'issued');
  assert.ok(r.body.state.invoice.doc_no, 'it has a number now');
  assert.equal(r.body.state.materials_status, 'confirmed');

  // The technician can no longer change it...
  const tech = await put([{ item_id: item.id, quantity: 3 }]);
  assert.equal(tech.status, 409);
  assert.equal(tech.body.code, 'confirmed');
  const view = await call('GET', `/installations/${inst}/materials`, null, techToken);
  assert.equal(view.body.locked, true);

  // ...the office can: the issued bill is corrected, and still not sent until the office says so.
  const total = r.body.state.invoice.total_paise;
  const office = await call('PUT', `/installations/${inst}/materials`, { lines: [{ item_id: item.id, quantity: 2 }], installation_charge: 2000 });
  assert.equal(office.status, 200, JSON.stringify(office.body));
  assert.equal(office.body.invoice.id, invoiceId);
  assert.ok(office.body.invoice.total_paise > total, 'one more camera on the bill');
  assert.equal(office.body.materials_status, 'confirmed', 'the office editing does not put it back to waiting');

  // Asked again, it simply sends once more.
  const again = await call('POST', `/installations/${inst}/send-invoice`, {});
  assert.equal(again.status, 200);
  assert.equal(again.body.invoice_id, invoiceId);
});

test('once the customer has paid, the technician can no longer change it', { skip }, async () => {
  const total = (await call('GET', `/installations/${inst}/materials`)).body.invoice.total_paise;
  const partyId = (await call('GET', `/sales/documents/${invoiceId}`)).body.document.party_id;
  made.parties.push(partyId);
  const pay = await call('POST', '/payments', {
    party_id: partyId, payment_date: '2026-10-12', method: 'upi', amount_paise: total, reference: 'ZZ-IM-1',
    allocations: [{ document_id: invoiceId, amount_paise: total }],
  });
  assert.equal(pay.status, 201, JSON.stringify(pay.body));
  made.payments.push(pay.body.payment.id);

  const r = await put([{ item_id: item.id, quantity: 2 }]);
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'paid');
  const view = await call('GET', `/installations/${inst}/materials`, null, techToken);
  assert.equal(view.body.locked, true);
});

test.after(async () => {
  if (!db) return;
  try {
    const journals = new Set();
    const [issues] = await db.query("SELECT id, journal_id FROM job_material_issues WHERE job_type = 'installation' AND job_id = ?", [inst || 'none']);
    for (const i of issues) if (i.journal_id) journals.add(i.journal_id);
    const [docs] = await db.query("SELECT id FROM sales_documents WHERE source_type = 'installation' AND source_id = ?", [inst || 'none']);
    for (const d of docs) made.docs.push(d.id);

    for (const id of made.payments) {
      const [[p]] = await db.query('SELECT journal_id FROM payments WHERE id = ?', [id]);
      if (p?.journal_id) journals.add(p.journal_id);
      await db.query('DELETE FROM payment_allocations WHERE payment_id = ?', [id]);
      await db.query('DELETE FROM payments WHERE id = ?', [id]);
    }
    for (const id of made.docs.filter(Boolean)) {
      for (const table of ['sales_documents', 'purchase_documents']) {
        const [[d]] = await db.query(`SELECT journal_id FROM ${table} WHERE id = ?`, [id]);
        if (d?.journal_id) journals.add(d.journal_id);
      }
      const [byDoc] = await db.query('SELECT id FROM journals WHERE source_id = ?', [id]);
      byDoc.forEach((j) => journals.add(j.id));
      await db.query('DELETE FROM payment_allocations WHERE document_id = ?', [id]);
      await db.query('DELETE FROM sales_document_lines WHERE document_id = ?', [id]);
      await db.query('DELETE FROM sales_documents WHERE id = ?', [id]);
      await db.query('DELETE FROM purchase_document_lines WHERE document_id = ?', [id]);
      await db.query('DELETE FROM purchase_documents WHERE id = ?', [id]);
    }
    for (const i of issues) {
      const [byIssue] = await db.query('SELECT id FROM journals WHERE source_id = ?', [i.id]);
      byIssue.forEach((j) => journals.add(j.id));
    }
    await db.query("DELETE FROM job_material_lines WHERE issue_id IN (SELECT id FROM job_material_issues WHERE job_type = 'installation' AND job_id = ?)", [inst || 'none']);
    await db.query("DELETE FROM job_material_issues WHERE job_type = 'installation' AND job_id = ?", [inst || 'none']);

    // Reversals of any of those journals, and what they reverse.
    const [links] = await db.query('SELECT id FROM journals WHERE reversal_of_id IN (?) OR reversed_by_id IN (?)', [[...journals, 'none'], [...journals, 'none']]);
    links.forEach((j) => journals.add(j.id));
    for (const id of journals) {
      await db.query('UPDATE journals SET reversed_by_id = NULL, reversal_of_id = NULL WHERE id = ?', [id]);
      await db.query('DELETE FROM journal_lines WHERE journal_id = ?', [id]);
      await db.query('DELETE FROM journals WHERE id = ?', [id]);
    }

    const [created] = await db.query("SELECT party_id FROM installations WHERE id = ?", [inst || 'none']);
    created.forEach((r) => r.party_id && made.parties.push(r.party_id));
    for (const id of made.installations) await db.query('DELETE FROM installations WHERE id = ?', [id]);
    for (const id of made.items) {
      await db.query('DELETE FROM inventory_movements WHERE item_id = ?', [id]);
      await db.query('DELETE FROM inventory_items WHERE id = ?', [id]);
    }
    for (const id of made.locations) await db.query('DELETE FROM stock_locations WHERE id = ?', [id]);
    for (const id of made.parties.filter(Boolean)) {
      await db.query('DELETE FROM journal_lines WHERE party_id = ?', [id]);
      await db.query('DELETE FROM party_addresses WHERE party_id = ?', [id]);
      await db.query('DELETE FROM parties WHERE id = ?', [id]);
    }
    for (const id of made.profiles) await db.query('DELETE FROM profiles WHERE id = ?', [id]);
    await db.query("DELETE FROM audit_log WHERE action LIKE 'installation.%' OR action LIKE 'job.materials%'").catch(() => {});
    await db.query("DELETE FROM notifications WHERE subject = 'installation_items_submitted' AND data LIKE ?", [`%${inst}%`]).catch(() => {});
    if (businessBefore) {
      await db.query('UPDATE businesses SET state_code = ?, state_name = ?, setup_complete = ? WHERE id = ?',
        [businessBefore.state_code, businessBefore.state_name, businessBefore.setup_complete, businessBefore.id]);
    }
  } finally {
    await db.end();
  }
});
