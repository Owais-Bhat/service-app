// Stage 4 acceptance tests: a job's materials, its costs, its invoice and its
// margin — against the local API and test database.
//
//   node --test tests/jobs-stage4.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const API = 'http://127.0.0.1:5000/api';

let mysql; let jwt; let db; let tokens; let reachable = false;
let businessBefore = null;
const made = {
  jobs: [], items: [], parties: [], locations: [], issues: [], costs: [], docs: [], journals: [],
};

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/jobs/profitability`).catch(() => null);
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
    tokens = { admin: sign(admin.id, 'admin'), employee: sign(emp.id, 'employee'), employeeId: emp.id, adminId: admin.id };
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

const stockOf = async (id) => {
  const [[row]] = await db.query('SELECT quantity, avg_cost_paise FROM inventory_items WHERE id = ?', [id]);
  return { qty: Number(row.quantity), avg: Number(row.avg_cost_paise) };
};

let customer; let camera; let store; let van; let jobId; let businessId;

test('set up: a customer, a stocked item, a van and a service job', { skip }, async () => {
  const [[biz]] = await db.query('SELECT * FROM businesses WHERE is_default = 1 LIMIT 1');
  businessBefore = biz;
  businessId = biz.id;
  await db.query(
    `UPDATE businesses SET state_code = '01', state_name = 'Jammu and Kashmir',
        setup_complete = 1, require_material_approval = 1 WHERE id = ?`,
    [biz.id]
  );

  const party = await call('POST', '/parties', {
    display_name: 'ZZ Stage4 Customer', phone: '9000000501', place_of_supply_state_code: '01',
  });
  customer = party.body;
  made.parties.push(customer.id);

  camera = { id: randomUUID() };
  await db.query('INSERT INTO inventory_items SET ?', [{
    id: camera.id, business_id: biz.id, name: 'ZZ Job Camera', unit: 'pcs', base_unit: 'pcs',
    purchase_rate: 1000, selling_rate: 2500, gst_rate: 18, quantity: 0,
    avg_cost_paise: 0, stock_value_paise: 0,
  }]);
  made.items.push(camera.id);

  // Buy ten at ₹1,000 so there is real stock with a real cost behind it.
  const grn = await call('POST', '/purchases/documents', {
    doc_type: 'goods_receipt', party_id: customer.id, doc_date: '2026-10-01',
    lines: [{ item_id: camera.id, description: 'ZZ Job Camera', quantity: 10, rate: '1000', tax_rate_bps: 1800 }],
  });
  made.docs.push(grn.body.document.id);
  await call('POST', `/purchases/documents/${grn.body.document.id}/issue`);
  assert.equal((await stockOf(camera.id)).qty, 10);

  const locations = (await call('GET', '/stock/locations')).body;
  store = locations.find((l) => l.is_default);
  const vanRes = await call('POST', '/stock/locations', {
    name: 'ZZ Stage4 Van', kind: 'van', employee_id: tokens.employeeId,
  });
  van = vanRes.body;
  made.locations.push(van.id);

  await call('POST', '/stock/transfers', {
    from_location_id: store.id, to_location_id: van.id, employee_id: tokens.employeeId,
    lines: [{ item_id: camera.id, quantity: 5 }],
  });

  // The job itself: an ordinary service request, the kind the app already has.
  jobId = randomUUID();
  await db.query('INSERT INTO inquiries SET ?', [{
    id: jobId, ticket_no: 'ZZ-JOB-1', full_name: 'ZZ Stage4 Customer', phone: '9000000501',
    location: 'Srinagar', service_item: 'CCTV install', status: 'in_progress',
    assigned_employee_id: tokens.employeeId, party_id: customer.id,
  }]);
  made.jobs.push(jobId);
});

let issueId;

test("a technician's materials wait for approval before anything moves", { skip }, async () => {
  const before = await stockOf(camera.id);

  const submitted = await call('POST', '/jobs/materials', {
    job_type: 'inquiry', job_id: jobId, location_id: van.id, employee_id: tokens.employeeId,
    note: 'ZZ test — fitted two cameras', customer_approved: true,
    customer_approval_note: 'Customer agreed on site',
    lines: [{ item_id: camera.id, description: 'ZZ Job Camera', quantity: 2, sell_rate: '2500' }],
  }, 'employee');
  assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
  issueId = submitted.body.issue.id;
  made.issues.push(issueId);

  assert.equal(submitted.body.issue.status, 'submitted');
  assert.match(submitted.body.issue.issue_no, /^MI-/);
  assert.equal((await stockOf(camera.id)).qty, before.qty, 'nothing leaves stock on a submission');

  // No cost has reached the accounts either.
  const [[cogs]] = await db.query(
    `SELECT COALESCE(SUM(l.debit_paise), 0) net FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id WHERE a.code = '5000'`
  );
  assert.equal(Number(cogs.net), 0);

  const pending = (await call('GET', '/jobs/materials/pending')).body;
  const mine = pending.find((p) => p.id === issueId);
  assert.ok(mine, 'it is waiting in the approval list');
  assert.equal(mine.job.ticket_no, 'ZZ-JOB-1', 'with the job it belongs to');
});

test('approval is what moves the stock and posts the cost', { skip }, async () => {
  const before = await stockOf(camera.id);

  const approved = await call('POST', `/jobs/materials/${issueId}/approve`);
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.issue.status, 'approved');
  assert.equal(Number(approved.body.issue.cost_paise), 200000, 'two cameras at ₹1,000 cost us ₹2,000');

  const after = await stockOf(camera.id);
  assert.equal(after.qty, before.qty - 2, 'now the stock is gone');

  // …and it left the van, not the store.
  const vanStock = (await call('GET', `/stock/locations/${van.id}/items`)).body;
  assert.equal(vanStock.find((i) => i.id === camera.id).held_qty, 3);

  const [lines] = await db.query(
    `SELECT a.code, l.debit_paise, l.credit_paise FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id WHERE l.journal_id = ?`,
    [approved.body.issue.journal_id]
  );
  assert.equal(Number(lines.find((l) => l.code === '5000').debit_paise), 200000, 'cost of goods sold');
  assert.equal(Number(lines.find((l) => l.code === '1200').credit_paise), 200000, 'out of inventory');

  const again = await call('POST', `/jobs/materials/${issueId}/approve`);
  assert.equal(again.status, 422, 'approving twice would consume the stock twice');
});

test('unused material goes back, and the cost comes back with it', { skip }, async () => {
  const before = await stockOf(camera.id);

  const returned = await call('POST', '/jobs/materials', {
    job_type: 'inquiry', job_id: jobId, location_id: van.id, kind: 'returned',
    note: 'ZZ test — one camera not needed',
    lines: [{ item_id: camera.id, description: 'ZZ Job Camera', quantity: 1 }],
  });
  made.issues.push(returned.body.issue.id);
  const approved = await call('POST', `/jobs/materials/${returned.body.issue.id}/approve`);
  assert.equal(approved.status, 200);

  assert.equal((await stockOf(camera.id)).qty, before.qty + 1, 'back on the shelf');

  const [lines] = await db.query(
    `SELECT a.code, l.debit_paise, l.credit_paise FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id WHERE l.journal_id = ?`,
    [approved.body.issue.journal_id]
  );
  assert.equal(Number(lines.find((l) => l.code === '1200').debit_paise), 100000, 'inventory back up');
  assert.equal(Number(lines.find((l) => l.code === '5000').credit_paise), 100000, 'cost back down');
});

test('a rejected submission moves nothing', { skip }, async () => {
  const before = await stockOf(camera.id);

  const submitted = await call('POST', '/jobs/materials', {
    job_type: 'inquiry', job_id: jobId, location_id: van.id,
    lines: [{ item_id: camera.id, description: 'ZZ Job Camera', quantity: 1 }],
  });
  made.issues.push(submitted.body.issue.id);

  const noReason = await call('POST', `/jobs/materials/${submitted.body.issue.id}/reject`, {});
  assert.equal(noReason.status, 400, 'a rejection needs a reason');

  const rejected = await call('POST', `/jobs/materials/${submitted.body.issue.id}/reject`, {
    reason: 'ZZ test — that camera went to another job',
  });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.issue.status, 'rejected');
  assert.equal((await stockOf(camera.id)).qty, before.qty, 'stock untouched');

  const approveAnyway = await call('POST', `/jobs/materials/${submitted.body.issue.id}/approve`);
  assert.equal(approveAnyway.status, 422);
});

test('labour and travel are costs too, and they reach the accounts', { skip }, async () => {
  const labour = await call('POST', '/jobs/costs', {
    job_type: 'inquiry', job_id: jobId, kind: 'labour', description: 'ZZ test — 3 hours on site',
    quantity: 3, rate: '400',
  });
  assert.equal(labour.status, 201, JSON.stringify(labour.body));
  assert.equal(Number(labour.body.amount_paise), 120000);
  made.costs.push(labour.body.id);

  const travel = await call('POST', '/jobs/costs', {
    job_type: 'inquiry', job_id: jobId, kind: 'travel', description: 'ZZ test — 20 km',
    quantity: 20, rate: '15', billable: false,
  });
  made.costs.push(travel.body.id);
  assert.equal(Number(travel.body.amount_paise), 30000);

  const [lines] = await db.query(
    `SELECT a.code, l.debit_paise FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id WHERE l.journal_id IN (?, ?)`,
    [labour.body.journal_id, travel.body.journal_id]
  );
  assert.equal(Number(lines.find((l) => l.code === '5300').debit_paise), 120000, 'wages');
  assert.equal(Number(lines.find((l) => l.code === '5200').debit_paise), 30000, 'travel');

  // An estimate is a plan and must not touch the books.
  const [[before]] = await db.query('SELECT COUNT(*) c FROM journals');
  const planned = await call('POST', '/jobs/costs', {
    job_type: 'inquiry', job_id: jobId, kind: 'labour', basis: 'estimate',
    description: 'ZZ test — planned', quantity: 2, rate: '400',
  });
  made.costs.push(planned.body.id);
  const [[after]] = await db.query('SELECT COUNT(*) c FROM journals');
  assert.equal(after.c, before.c, 'an estimated cost posts nothing');
});

let invoiceId;

test('the invoice is built from what was approved, once', { skip }, async () => {
  // Anything still waiting for approval blocks it — a half-approved job would
  // bill the customer for work nobody agreed.
  const pendingSubmission = await call('POST', '/jobs/materials', {
    job_type: 'inquiry', job_id: jobId, location_id: van.id,
    lines: [{ item_id: camera.id, description: 'ZZ Job Camera', quantity: 1 }],
  });
  made.issues.push(pendingSubmission.body.issue.id);

  const blocked = await call('POST', `/jobs/inquiry/${jobId}/invoice`, {});
  assert.equal(blocked.status, 422);
  assert.equal(blocked.body.code, 'pending_materials');

  await call('POST', `/jobs/materials/${pendingSubmission.body.issue.id}/reject`, { reason: 'ZZ test — not used' });

  const first = await call('POST', `/jobs/inquiry/${jobId}/invoice`, {});
  assert.equal(first.status, 201, JSON.stringify(first.body));
  invoiceId = first.body.document.id;
  made.docs.push(invoiceId);

  // 2 used − 1 returned = 1 camera at ₹2,500, plus the billable labour ₹1,200.
  // Travel was marked not billable, so it stays a cost and not a charge.
  const lines = first.body.lines;
  const cameraLine = lines.find((l) => l.description.includes('Camera'));
  assert.equal(Number(cameraLine.quantity), 1, 'the customer is charged for what stayed');
  assert.equal(Number(cameraLine.rate_paise), 250000);

  const labourCharge = lines.find((l) => l.kind === 'charge' && l.description.includes('3 hours'));
  assert.ok(labourCharge, 'billable labour arrives as a charge');
  assert.ok(!lines.some((l) => l.description.includes('20 km')), 'a non-billable cost is not charged to the customer');

  assert.equal(first.body.document.source_type, 'inquiry');
  assert.equal(first.body.document.source_id, jobId);

  // Asking twice hands back the same draft rather than billing the job again.
  const second = await call('POST', `/jobs/inquiry/${jobId}/invoice`, {});
  assert.equal(second.status, 200);
  assert.equal(second.body.reused, true);
  assert.equal(second.body.document.id, invoiceId);

  const [[count]] = await db.query(
    `SELECT COUNT(*) c FROM sales_documents WHERE source_type = 'inquiry' AND source_id = ?`, [jobId]
  );
  assert.equal(count.c, 1, 'one job, one invoice');
});

test('the job knows what it cost, what it earned and what it kept', { skip }, async () => {
  await call('POST', `/sales/documents/${invoiceId}/issue`);

  const summary = (await call('GET', `/jobs/inquiry/${jobId}/summary`)).body;
  assert.equal(summary.job.ticket_no, 'ZZ-JOB-1');

  const t = summary.totals;
  // Materials: ₹2,000 used less ₹1,000 returned = ₹1,000.
  assert.equal(t.material_cost_paise, 100000);
  // Labour ₹1,200 + travel ₹300 = ₹1,500.
  assert.equal(t.other_cost_paise, 150000);
  assert.equal(t.total_cost_paise, 250000);
  // Revenue is the invoice before tax: ₹2,500 + ₹1,200 = ₹3,700.
  assert.equal(t.revenue_paise, 370000);
  assert.equal(t.margin_paise, 120000);
  assert.equal(t.margin_pct, 32.4);
  assert.equal(t.pending_approvals, 0);
  assert.match(summary.basis, /before tax/);
});

test('a technician sees the job but not what it cost or earned', { skip }, async () => {
  const summary = (await call('GET', `/jobs/inquiry/${jobId}/summary`, null, 'employee')).body;
  assert.equal(summary.job.ticket_no, 'ZZ-JOB-1', 'he can see the job he was sent to');
  assert.equal(summary.totals.margin_paise, undefined);
  assert.equal(summary.totals.material_cost_paise, undefined);
  assert.deepEqual(summary.costs, []);
  assert.ok(summary.material_lines.every((l) => l.cost_paise === undefined));

  assert.equal((await call('GET', '/jobs/profitability', null, 'employee')).status, 403);
  assert.equal((await call('POST', `/jobs/materials/${issueId}/approve`, null, 'employee')).status, 403,
    'and he cannot approve his own materials');
});

test('the profitability report finds the job and the money', { skip }, async () => {
  const report = (await call('GET', '/jobs/profitability?from=2026-01-01&to=2027-03-31')).body;
  const row = report.jobs.find((j) => j.job_id === jobId);
  assert.ok(row, 'the job is on the report');
  assert.equal(row.ticket_no, 'ZZ-JOB-1');
  assert.equal(row.total_cost_paise, 250000);
  assert.equal(row.revenue_paise, 370000);
  assert.equal(row.margin_paise, 120000);
  assert.equal(row.unbilled, false);
  assert.match(report.scope.basis, /moving average/);

  // The totals are the sum of the rows, not a separate calculation.
  assert.equal(
    report.totals.margin_paise,
    report.jobs.reduce((s, j) => s + j.margin_paise, 0)
  );
});

test('work done but never billed is visible as exactly that', { skip }, async () => {
  const otherJob = randomUUID();
  await db.query('INSERT INTO inquiries SET ?', [{
    id: otherJob, ticket_no: 'ZZ-JOB-2', full_name: 'ZZ Stage4 Customer', phone: '9000000501',
    location: 'Srinagar', service_item: 'Repair', status: 'resolved', party_id: customer.id,
  }]);
  made.jobs.push(otherJob);

  const submitted = await call('POST', '/jobs/materials', {
    job_type: 'inquiry', job_id: otherJob, location_id: van.id,
    lines: [{ item_id: camera.id, description: 'ZZ Job Camera', quantity: 1, sell_rate: '2500' }],
  });
  made.issues.push(submitted.body.issue.id);
  await call('POST', `/jobs/materials/${submitted.body.issue.id}/approve`);

  const report = (await call('GET', '/jobs/profitability?from=2026-01-01&to=2027-03-31')).body;
  const row = report.jobs.find((j) => j.job_id === otherJob);
  assert.equal(row.unbilled, true, 'materials went out, nothing was invoiced');
  assert.equal(row.revenue_paise, 0);
  assert.ok(report.totals.unbilled_jobs >= 1);
  assert.ok(report.totals.unbilled_cost_paise >= row.total_cost_paise);
});

test('what the technicians are still holding is a number the office can see', { skip }, async () => {
  const held = (await call('GET', '/jobs/technician-stock')).body;
  const mine = held.vans.find((v) => v.location_id === van.id);
  assert.ok(mine);
  assert.equal(mine.employee_name !== undefined, true);
  const camera_ = mine.items.find((i) => i.id === camera.id);
  assert.equal(camera_.held_qty, 3, 'five went out, two used, one came back, one used on the second job');
  assert.equal(held.total_value_paise >= mine.value_paise, true);
});

test('a job with no customer record cannot be invoiced by guesswork', { skip }, async () => {
  const orphan = randomUUID();
  await db.query('INSERT INTO inquiries SET ?', [{
    id: orphan, ticket_no: 'ZZ-JOB-3', full_name: 'ZZ Unknown Walk-in', phone: '9111111111',
    location: 'Srinagar', service_item: 'Repair', status: 'resolved',
  }]);
  made.jobs.push(orphan);

  const submitted = await call('POST', '/jobs/materials', {
    job_type: 'inquiry', job_id: orphan, location_id: van.id,
    lines: [{ item_id: camera.id, description: 'ZZ Job Camera', quantity: 1, sell_rate: '2500' }],
  });
  made.issues.push(submitted.body.issue.id);
  await call('POST', `/jobs/materials/${submitted.body.issue.id}/approve`);

  const out = await call('POST', `/jobs/inquiry/${orphan}/invoice`, {});
  assert.equal(out.status, 400);
  assert.equal(out.body.code, 'no_party');
  assert.match(out.body.error, /customer/i);
});

test('the books still balance after all of it', { skip }, async () => {
  const tb = (await call('GET', '/accounting/trial-balance?from=2026-04-01&to=2027-03-31')).body;
  assert.equal(tb.balanced, true);

  const valuation = (await call('GET', '/stock/valuation')).body;
  assert.deepEqual(valuation.discrepancies, []);
});

test.after(async () => {
  if (!db) return;
  const journalIds = new Set(made.journals.filter(Boolean));

  for (const id of made.issues.filter(Boolean)) {
    const [[issue]] = await db.query('SELECT journal_id FROM job_material_issues WHERE id = ?', [id]);
    if (issue?.journal_id) journalIds.add(issue.journal_id);
    await db.query('DELETE FROM job_material_lines WHERE issue_id = ?', [id]);
    await db.query('DELETE FROM job_material_issues WHERE id = ?', [id]);
  }
  for (const id of made.costs.filter(Boolean)) {
    const [[cost]] = await db.query('SELECT journal_id FROM job_costs WHERE id = ?', [id]);
    if (cost?.journal_id) journalIds.add(cost.journal_id);
    await db.query('DELETE FROM job_costs WHERE id = ?', [id]);
  }
  for (const id of made.docs.filter(Boolean)) {
    for (const table of ['sales_documents', 'purchase_documents']) {
      const [[doc]] = await db.query(`SELECT journal_id FROM ${table} WHERE id = ?`, [id]);
      if (doc?.journal_id) journalIds.add(doc.journal_id);
    }
    await db.query('DELETE FROM payment_allocations WHERE document_id = ?', [id]);
    await db.query('DELETE FROM purchase_allocations WHERE document_id = ?', [id]);
    await db.query('DELETE FROM sales_document_lines WHERE document_id = ?', [id]);
    await db.query('DELETE FROM sales_documents WHERE id = ?', [id]);
    await db.query('DELETE FROM purchase_document_lines WHERE document_id = ?', [id]);
    await db.query('DELETE FROM purchase_documents WHERE id = ?', [id]);
  }
  for (const id of made.jobs.filter(Boolean)) {
    await db.query('DELETE FROM job_estimates WHERE job_id = ?', [id]);
    await db.query('DELETE FROM inquiries WHERE id = ?', [id]);
  }
  for (const id of journalIds) {
    await db.query('DELETE FROM journal_lines WHERE journal_id = ?', [id]);
    await db.query('UPDATE journals SET reversed_by_id = NULL, reversal_of_id = NULL WHERE id = ?', [id]);
    await db.query('DELETE FROM journals WHERE id = ?', [id]);
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
  await db.query("DELETE jl FROM journal_lines jl JOIN journals j ON j.id = jl.journal_id WHERE j.narration LIKE '%ZZ %'");
  await db.query("DELETE FROM journals WHERE narration LIKE '%ZZ %'");
  await db.query("DELETE FROM audit_log WHERE reason LIKE 'ZZ test%'");

  if (businessBefore) {
    await db.query(
      `UPDATE businesses SET state_code = ?, state_name = ?, setup_complete = ?, require_material_approval = 0 WHERE id = ?`,
      [businessBefore.state_code, businessBefore.state_name, businessBefore.setup_complete, businessBefore.id]
    );
  }
  await db.end();
});
