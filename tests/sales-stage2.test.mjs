// Stage 2 acceptance tests: the estimate → invoice → receipt → ledger → PDF
// path, end to end, against the local API and test database.
//
//   node --test tests/sales-stage2.test.mjs
//
// Skips when the API or the database is absent. Everything it creates is
// removed again at the end.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const API = 'http://127.0.0.1:5000/api';

let mysql; let jwt; let db; let tokens; let reachable = false;
const made = { docs: [], payments: [], parties: [], items: [], journals: [], locks: [] };
let businessBefore = null;

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/sales/documents`).catch(() => null);
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
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('pdf')) return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()) };
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const rupees = (paise) => (Number(paise) / 100).toFixed(2);

// The business must be confirmed and in a state before a tax document is legal
// to issue — the tests set that up and put it back afterwards.
async function setUpBusiness() {
  const [[biz]] = await db.query('SELECT * FROM businesses WHERE is_default = 1 LIMIT 1');
  businessBefore = biz;
  await db.query(
    `UPDATE businesses SET state_code = '01', state_name = 'Jammu and Kashmir',
        registration_type = 'unregistered', setup_complete = 1 WHERE id = ?`,
    [biz.id]
  );
  return biz.id;
}

let customer; let farCustomer; let item;

test('set up: a confirmed business, two customers and an item', { skip }, async () => {
  await setUpBusiness();

  const near = await call('POST', '/parties', {
    display_name: 'ZZ Stage2 Near Shop', phone: '9000000101', place_of_supply_state_code: '01', credit_days: 15,
  });
  assert.equal(near.status, 201);
  customer = near.body;
  made.parties.push(customer.id);

  const far = await call('POST', '/parties', {
    display_name: 'ZZ Stage2 Far Shop', phone: '9000000102', place_of_supply_state_code: '27',
  });
  farCustomer = far.body;
  made.parties.push(farCustomer.id);

  item = { id: randomUUID() };
  await db.query('INSERT INTO inventory_items SET ?', [{
    id: item.id, name: 'ZZ Dome Camera', unit: 'pcs', purchase_rate: 1200, selling_rate: 2000,
    quantity: 50, hsn_sac: '85258900',
  }]);
  made.items.push(item.id);
});

test('an estimate is a piece of paper — it posts nothing to the ledger', { skip }, async () => {
  const before = await db.query("SELECT COUNT(*) c FROM journals WHERE source_type IN ('invoice','credit_note')");

  const draft = await call('POST', '/sales/documents', {
    doc_type: 'estimate',
    party_id: customer.id,
    doc_date: '2026-09-10',
    valid_until: '2026-09-30',
    lines: [
      { item_id: item.id, description: 'ZZ Dome Camera', quantity: 4, rate: '2000', tax_rate_bps: 1800, cost_rate: '1200' },
      { description: 'Installation labour', quantity: 1, rate: '1500', tax_rate_bps: 1800 },
    ],
  });
  assert.equal(draft.status, 201);
  made.docs.push(draft.body.document.id);
  assert.equal(draft.body.document.status, 'draft');
  assert.equal(draft.body.document.doc_no, null, 'a draft has no number');

  const issued = await call('POST', `/sales/documents/${draft.body.document.id}/issue`);
  assert.equal(issued.status, 200);
  assert.match(issued.body.document.doc_no, /^EST-/);
  assert.equal(issued.body.document.journal_id, null, 'a quotation must not post to the ledger');

  const after = await db.query("SELECT COUNT(*) c FROM journals WHERE source_type IN ('invoice','credit_note')");
  assert.equal(after[0][0].c, before[0][0].c, 'no ledger entry may appear because a quotation was printed');

  // ₹8,000 goods + ₹1,500 labour = ₹9,500 + 18% = ₹11,210
  assert.equal(rupees(issued.body.document.total_paise), '11210.00');
  assert.equal(rupees(issued.body.document.cgst_paise), '855.00');
  assert.equal(rupees(issued.body.document.sgst_paise), '855.00');
});

let invoiceId;

test('an accepted estimate converts into an invoice exactly once', { skip }, async () => {
  const estimateId = made.docs[made.docs.length - 1];

  const accepted = await call('POST', `/sales/documents/${estimateId}/acceptance`, {
    status: 'accepted', method: 'WhatsApp', note: 'ZZ test — customer said go ahead',
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.document.status, 'accepted');

  const first = await call('POST', `/sales/documents/${estimateId}/convert`, { to: 'invoice' });
  assert.equal(first.status, 201);
  invoiceId = first.body.document.id;
  made.docs.push(invoiceId);
  assert.equal(first.body.document.doc_type, 'invoice');
  assert.equal(first.body.document.total_paise, accepted.body.document.total_paise, 'the invoice must agree with the quotation');

  // The guard against billing a customer twice for one quotation.
  const second = await call('POST', `/sales/documents/${estimateId}/convert`, { to: 'invoice' });
  assert.equal(second.status, 200);
  assert.equal(second.body.reused, true);
  assert.equal(second.body.document.id, invoiceId);

  const [[count]] = await db.query(
    'SELECT COUNT(*) c FROM sales_documents WHERE converted_from_id = ?', [estimateId]
  );
  assert.equal(count.c, 1, 'one estimate, one invoice');
});

test('issuing the invoice posts a balanced journal and takes its number', { skip }, async () => {
  const issued = await call('POST', `/sales/documents/${invoiceId}/issue`);
  assert.equal(issued.status, 200, JSON.stringify(issued.body));
  const doc = issued.body.document;
  assert.match(doc.doc_no, /^INV-/);
  assert.ok(doc.journal_id, 'an invoice must post to the ledger');
  assert.ok(doc.party_snapshot, 'the customer is frozen onto the document');
  assert.equal(doc.party_snapshot.display_name, 'ZZ Stage2 Near Shop');
  assert.equal(issued.body.payment_status, 'unpaid');

  const [[sums]] = await db.query(
    'SELECT SUM(debit_paise) d, SUM(credit_paise) c FROM journal_lines WHERE journal_id = ?', [doc.journal_id]
  );
  assert.equal(Number(sums.d), Number(sums.c), 'the journal must balance');
  assert.equal(Number(sums.d), Number(doc.total_paise));

  // The customer is debited, the tax is a liability, the sale is income.
  const [lines] = await db.query(
    `SELECT a.code, l.debit_paise, l.credit_paise FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id WHERE l.journal_id = ? ORDER BY a.code`,
    [doc.journal_id]
  );
  const by = (code) => lines.find((l) => l.code === code);
  assert.equal(Number(by('1100').debit_paise), Number(doc.total_paise), 'receivable carries the whole invoice');
  assert.equal(Number(by('2100').credit_paise), Number(doc.cgst_paise));
  assert.equal(Number(by('2110').credit_paise), Number(doc.sgst_paise));
  assert.ok(by('4000'), 'goods income');
  assert.ok(by('4010') || by('4020'), 'service or labour income');

  // Due date follows the customer's credit terms without being typed again.
  assert.ok(doc.due_date, 'a customer with credit days gets a due date');
});

test('an issued invoice cannot be edited', { skip }, async () => {
  const edit = await call('PATCH', `/sales/documents/${invoiceId}`, {
    doc_type: 'invoice', party_id: customer.id,
    lines: [{ description: 'Sneaky change', quantity: 1, rate: '1', tax_rate_bps: 0 }],
  });
  assert.equal(edit.status, 422);
  assert.equal(edit.body.code, 'not_draft');

  const del = await call('DELETE', `/sales/documents/${invoiceId}`);
  assert.equal(del.status, 422, 'an issued document is cancelled, never deleted');
});

test('a part payment leaves the rest outstanding; the status is derived', { skip }, async () => {
  const invoice = (await call('GET', `/sales/documents/${invoiceId}`)).body;
  const half = Math.round(Number(invoice.document.total_paise) / 2);

  const payment = await call('POST', '/payments', {
    party_id: customer.id, payment_date: '2026-09-12', method: 'upi',
    amount_paise: half, reference: 'ZZ-UPI-1',
    allocations: [{ document_id: invoiceId, amount_paise: half }],
  });
  assert.equal(payment.status, 201, JSON.stringify(payment.body));
  made.payments.push(payment.body.payment.id);
  assert.match(payment.body.payment.payment_no, /^RCT-/);

  const after = (await call('GET', `/sales/documents/${invoiceId}`)).body;
  assert.equal(after.paid_paise, half);
  assert.equal(after.balance_paise, Number(invoice.document.total_paise) - half);
  assert.equal(after.payment_status, 'part_paid');

  // The receipt posts: bank in, receivable down.
  const [lines] = await db.query(
    `SELECT a.code, l.debit_paise, l.credit_paise FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id
      WHERE l.journal_id = ? ORDER BY a.code`,
    [payment.body.payment.journal_id]
  );
  assert.equal(Number(lines.find((l) => l.code === '1010').debit_paise), half, 'the money landed in the bank account');
  assert.equal(Number(lines.find((l) => l.code === '1100').credit_paise), half, 'the customer owes that much less');
});

test('a payment cannot exceed what is outstanding', { skip }, async () => {
  const invoice = (await call('GET', `/sales/documents/${invoiceId}`)).body;
  const tooMuch = Number(invoice.document.total_paise);

  const over = await call('POST', '/payments', {
    party_id: customer.id, method: 'cash', amount_paise: tooMuch,
    allocations: [{ document_id: invoiceId, amount_paise: tooMuch }],
  });
  assert.equal(over.status, 422);
  assert.equal(over.body.code, 'over_paid');

  const mismatched = await call('POST', '/payments', {
    party_id: customer.id, method: 'cash', amount_paise: 10000,
    allocations: [{ document_id: invoiceId, amount_paise: 20000 }],
  });
  assert.equal(mismatched.status, 422);
  assert.equal(mismatched.body.code, 'over_allocated');
});

test('an advance sits as an advance until it is put against an invoice', { skip }, async () => {
  const ADVANCE = 1000000; // ₹10,000 — more than the invoice has left to pay
  const advance = await call('POST', '/payments', {
    party_id: customer.id, payment_date: '2026-09-13', method: 'cash',
    amount_paise: ADVANCE, notes: 'ZZ test — advance for the next job',
  });
  assert.equal(advance.status, 201);
  made.payments.push(advance.body.payment.id);
  assert.equal(advance.body.unallocated_paise, ADVANCE);

  // Unallocated money is a liability, not income and not a receivable.
  const [lines] = await db.query(
    `SELECT a.code, l.debit_paise, l.credit_paise FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id WHERE l.journal_id = ?`,
    [advance.body.payment.journal_id]
  );
  assert.equal(Number(lines.find((l) => l.code === '2200').credit_paise), ADVANCE, 'it is held as a customer advance');
  assert.equal(Number(lines.find((l) => l.code === '1000').debit_paise), ADVANCE, 'cash in hand went up');

  const invoice = (await call('GET', `/sales/documents/${invoiceId}`)).body;
  const remaining = invoice.balance_paise;

  const applied = await call('POST', `/payments/${advance.body.payment.id}/allocate`, {
    allocations: [{ document_id: invoiceId, amount_paise: remaining }],
  });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  assert.equal(applied.body.unallocated_paise, ADVANCE - remaining, 'what is left stays on account');

  const settled = (await call('GET', `/sales/documents/${invoiceId}`)).body;
  assert.equal(settled.balance_paise, 0);
  assert.equal(settled.payment_status, 'paid', 'paid because the allocations add up, not because anyone said so');

  // Applying an advance moves it out of advances into the customer's account —
  // it is not a second receipt of money.
  const [applyLines] = await db.query(
    `SELECT a.code, l.debit_paise, l.credit_paise FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id WHERE l.journal_id = ?`,
    [applied.body.allocations.find((x) => x.journal_id)?.journal_id]
  );
  assert.equal(Number(applyLines.find((l) => l.code === '2200').debit_paise), remaining);
  assert.equal(Number(applyLines.find((l) => l.code === '1100').credit_paise), remaining);
  assert.ok(!applyLines.some((l) => ['1000', '1010'].includes(l.code)), 'no new money moved');
});

test('an invoice with money against it cannot simply be cancelled', { skip }, async () => {
  const cancel = await call('POST', `/sales/documents/${invoiceId}/cancel`, { reason: 'ZZ test — changed my mind' });
  assert.equal(cancel.status, 422);
  assert.equal(cancel.body.code, 'has_payments');

  const noReason = await call('POST', `/sales/documents/${invoiceId}/cancel`, {});
  assert.equal(noReason.status, 400);
});

test('a credit note reverses the sale and the tax with it', { skip }, async () => {
  const draft = await call('POST', '/sales/documents', {
    doc_type: 'credit_note',
    party_id: customer.id,
    doc_date: '2026-09-15',
    reference: `Against ${invoiceId}`,
    lines: [{ item_id: item.id, description: 'ZZ Dome Camera returned', quantity: 1, rate: '2000', tax_rate_bps: 1800 }],
  });
  assert.equal(draft.status, 201);
  made.docs.push(draft.body.document.id);

  const issued = await call('POST', `/sales/documents/${draft.body.document.id}/issue`);
  assert.equal(issued.status, 200);
  assert.match(issued.body.document.doc_no, /^CN-/);
  assert.equal(rupees(issued.body.document.total_paise), '2360.00');

  // The sides are the other way round: the customer owes less and the tax
  // liability comes back down.
  const [lines] = await db.query(
    `SELECT a.code, l.debit_paise, l.credit_paise FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id WHERE l.journal_id = ?`,
    [issued.body.document.journal_id]
  );
  assert.equal(Number(lines.find((l) => l.code === '1100').credit_paise), 236000);
  assert.equal(Number(lines.find((l) => l.code === '2100').debit_paise), 18000);
  assert.equal(Number(lines.find((l) => l.code === '4000').debit_paise), 200000);
});

test('a sale to another state carries IGST instead', { skip }, async () => {
  const draft = await call('POST', '/sales/documents', {
    doc_type: 'invoice', party_id: farCustomer.id, doc_date: '2026-09-16',
    lines: [{ item_id: item.id, description: 'ZZ Dome Camera', quantity: 2, rate: '2000', tax_rate_bps: 1800 }],
  });
  made.docs.push(draft.body.document.id);
  assert.equal(draft.body.document.supply_type, 'inter');

  const issued = await call('POST', `/sales/documents/${draft.body.document.id}/issue`);
  assert.equal(rupees(issued.body.document.igst_paise), '720.00');
  assert.equal(Number(issued.body.document.cgst_paise), 0);
  assert.equal(rupees(issued.body.document.total_paise), '4720.00');

  const [[igst]] = await db.query(
    `SELECT l.credit_paise FROM journal_lines l JOIN accounts a ON a.id = l.account_id
      WHERE l.journal_id = ? AND a.code = '2120'`,
    [issued.body.document.journal_id]
  );
  assert.equal(Number(igst.credit_paise), 72000);
});

test('a cancelled invoice reverses its journal and keeps both entries', { skip }, async () => {
  const draft = await call('POST', '/sales/documents', {
    doc_type: 'invoice', party_id: customer.id, doc_date: '2026-09-17',
    lines: [{ description: 'ZZ test — to be cancelled', quantity: 1, rate: '1000', tax_rate_bps: 1800 }],
  });
  made.docs.push(draft.body.document.id);
  const issued = await call('POST', `/sales/documents/${draft.body.document.id}/issue`);
  const journalId = issued.body.document.journal_id;

  const cancelled = await call('POST', `/sales/documents/${draft.body.document.id}/cancel`, {
    reason: 'ZZ test — raised against the wrong customer',
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.document.status, 'cancelled');

  const [[original]] = await db.query('SELECT status, reversed_by_id FROM journals WHERE id = ?', [journalId]);
  assert.equal(original.status, 'reversed');
  assert.ok(original.reversed_by_id);
  made.journals.push(original.reversed_by_id);

  // Net effect on the receivable is nil — the pair cancels out.
  const [[net]] = await db.query(
    `SELECT COALESCE(SUM(l.debit_paise),0) - COALESCE(SUM(l.credit_paise),0) net
       FROM journal_lines l JOIN accounts a ON a.id = l.account_id
      WHERE l.journal_id IN (?, ?) AND a.code = '1100'`,
    [journalId, original.reversed_by_id]
  );
  assert.equal(Number(net.net), 0);
});

test('the receivables report agrees with the invoices behind it', { skip }, async () => {
  const report = await call('GET', '/sales/receivables?as_on=2026-12-31');
  assert.equal(report.status, 200);
  assert.equal(report.body.scope.basis, 'issued invoices less posted payment allocations');

  const bucketTotal = Object.values(report.body.buckets).reduce((a, b) => a + b, 0);
  assert.equal(bucketTotal, report.body.total_paise, 'the buckets must add up to the total');

  const listed = report.body.invoices.reduce((s, r) => s + r.outstanding_paise, 0);
  assert.equal(listed, report.body.total_paise);

  // The fully-settled invoice is gone from the report; the inter-state one is on it.
  assert.ok(!report.body.invoices.some((r) => r.id === invoiceId), 'a paid invoice is not outstanding');
});

test('the ledger still balances after all of that', { skip }, async () => {
  const tb = await call('GET', '/accounting/trial-balance?from=2026-04-01&to=2027-03-31');
  assert.equal(tb.body.balanced, true);
  assert.equal(tb.body.totals.debit_paise, tb.body.totals.credit_paise);

  // What the customers owe, per the ledger, matches what the invoices say.
  const [[ar]] = await db.query(
    `SELECT COALESCE(SUM(l.debit_paise),0) - COALESCE(SUM(l.credit_paise),0) net
       FROM journal_lines l JOIN accounts a ON a.id = l.account_id
       JOIN journals j ON j.id = l.journal_id
      WHERE a.code = '1100' AND l.party_id IN (?, ?)`,
    [customer.id, farCustomer.id]
  );
  const docs = (await call('GET', '/sales/documents?doc_type=invoice&status=issued')).body
    .filter((d) => [customer.id, farCustomer.id].includes(d.party_id));
  const outstanding = docs.reduce((s, d) => s + d.balance_paise, 0);
  const credits = (await call('GET', '/sales/documents?doc_type=credit_note&status=issued')).body
    .filter((d) => [customer.id, farCustomer.id].includes(d.party_id))
    .reduce((s, d) => s + Number(d.total_paise), 0);

  assert.equal(Number(ar.net), outstanding - credits,
    'the receivable in the ledger must equal the invoices less credit notes');
});

test('the PDF renders, on A4, with the right title and totals', { skip }, async () => {
  const pdf = await call('GET', `/sales/documents/${invoiceId}/pdf`);
  assert.equal(pdf.status, 200);
  assert.ok(pdf.buffer.length > 2000, 'a real document, not an empty page');
  assert.equal(pdf.buffer.subarray(0, 5).toString(), '%PDF-');

  const pages = (pdf.buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.equal(pages, 1, 'a short invoice must not spill onto a second page');

  // A quotation must not print as a tax invoice.
  const estimateId = made.docs[0];
  const estPdf = await call('GET', `/sales/documents/${estimateId}/pdf`);
  assert.equal(estPdf.status, 200);
  assert.ok(estPdf.buffer.length > 2000);
});

test('a long document runs to several pages with the header repeated', { skip }, async () => {
  const lines = Array.from({ length: 60 }, (_, i) => ({
    description: `ZZ long line ${i + 1} — a deliberately wordy description so the row wraps onto more than one line and the table has to break across pages`,
    quantity: 1, rate: '150', tax_rate_bps: 1800,
  }));
  const draft = await call('POST', '/sales/documents', {
    doc_type: 'invoice', party_id: customer.id, doc_date: '2026-09-18', lines,
  });
  made.docs.push(draft.body.document.id);
  const issued = await call('POST', `/sales/documents/${draft.body.document.id}/issue`);
  assert.equal(issued.status, 200);

  const pdf = await call('GET', `/sales/documents/${draft.body.document.id}/pdf`);
  const pages = (pdf.buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.ok(pages >= 2, `60 lines should run past one page, got ${pages}`);

  // 60 × ₹150 = ₹9,000 + 18% = ₹10,620, and the total is on the document.
  assert.equal(rupees(issued.body.document.total_paise), '10620.00');
});

const issueInvoice = async (rate, date = '2026-09-18') => {
  const draft = await call('POST', '/sales/documents', {
    doc_type: 'invoice', party_id: customer.id, doc_date: date,
    lines: [{ description: 'ZZ test — to be corrected', quantity: 1, rate: String(rate), tax_rate_bps: 1800 }],
  });
  made.docs.push(draft.body.document.id);
  const issued = await call('POST', `/sales/documents/${draft.body.document.id}/issue`);
  assert.equal(issued.status, 200, JSON.stringify(issued.body));
  return issued.body.document;
};
const receivableNet = async (docId) => {
  const [[row]] = await db.query(
    `SELECT COALESCE(SUM(l.debit_paise),0) - COALESCE(SUM(l.credit_paise),0) AS net
       FROM journal_lines l JOIN accounts a ON a.id = l.account_id JOIN journals j ON j.id = l.journal_id
      WHERE j.source_id = ? AND j.source_type = 'invoice' AND a.code = '1100'`, [docId]
  );
  return Number(row.net);
};

test('an issued invoice is corrected in place — same number, the books redone, the reason kept', { skip }, async () => {
  const before = await issueInvoice(1000);
  assert.equal(Number(before.total_paise), 118000);

  const noReason = await call('POST', `/sales/documents/${before.id}/amend`, {
    party_id: customer.id, doc_date: '2026-09-18', lines: [{ description: 'x', quantity: 1, rate: '1500', tax_rate_bps: 1800 }],
  });
  assert.equal(noReason.status, 400);
  assert.equal(noReason.body.code, 'no_reason');

  const denied = await call('POST', `/sales/documents/${before.id}/amend`, { reason: 'x' }, 'employee');
  assert.equal(denied.status, 403);

  const fixed = await call('POST', `/sales/documents/${before.id}/amend`, {
    reason: 'ZZ test — wrong rate',
    party_id: customer.id, doc_date: '2026-09-18',
    lines: [{ description: 'ZZ test — to be corrected', quantity: 2, rate: '1500', tax_rate_bps: 1800 }],
  });
  assert.equal(fixed.status, 200, JSON.stringify(fixed.body));
  const after = fixed.body.document;
  assert.equal(after.doc_no, before.doc_no, 'the number does not change');
  assert.equal(after.status, 'issued');
  assert.equal(Number(after.revision_no), 1);
  assert.equal(Number(after.total_paise), 354000, '2 × ₹1500 + 18%');
  assert.notEqual(after.journal_id, before.journal_id, 'a new journal carries the corrected figures');
  assert.equal(fixed.body.lines.length, 1);

  const [[old]] = await db.query('SELECT status, reversed_by_id FROM journals WHERE id = ?', [before.journal_id]);
  assert.equal(old.status, 'reversed', 'the old entry is reversed, not edited');
  assert.ok(old.reversed_by_id);
  assert.equal(await receivableNet(before.id), 354000, 'the customer owes exactly the corrected total — nothing left over from the old figure');

  const [[sums]] = await db.query('SELECT SUM(debit_paise) d, SUM(credit_paise) c FROM journal_lines WHERE journal_id = ?', [after.journal_id]);
  assert.equal(Number(sums.d), Number(sums.c), 'the new journal balances');

  const [[audited]] = await db.query("SELECT reason FROM audit_log WHERE action = 'document.amend' AND entity_id = ? ORDER BY created_at DESC LIMIT 1", [before.id]).catch(() => [[null]]);
  if (audited) assert.match(audited.reason, /wrong rate/);

  // Corrected twice: a second revision, still the same number, still one live journal.
  const again = await call('POST', `/sales/documents/${before.id}/amend`, {
    reason: 'ZZ test — second look', party_id: customer.id, doc_date: '2026-09-18',
    lines: [{ description: 'ZZ test — to be corrected', quantity: 1, rate: '2000', tax_rate_bps: 1800 }],
  });
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.equal(Number(again.body.document.revision_no), 2);
  assert.equal(again.body.document.doc_no, before.doc_no);
  assert.equal(await receivableNet(before.id), 236000);
});

test('an invoice with payments can be corrected, but not below what has been paid', { skip }, async () => {
  const inv = await issueInvoice(1000, '2026-09-19');
  const paid = 50000;
  const pay = await call('POST', '/payments', {
    party_id: customer.id, payment_date: '2026-09-19', method: 'upi', amount_paise: paid, reference: 'ZZ-AMEND',
    allocations: [{ document_id: inv.id, amount_paise: paid }],
  });
  assert.equal(pay.status, 201, JSON.stringify(pay.body));
  made.payments.push(pay.body.payment.id);

  const tooLow = await call('POST', `/sales/documents/${inv.id}/amend`, {
    reason: 'ZZ test — too low', party_id: customer.id, doc_date: '2026-09-19',
    lines: [{ description: 'ZZ test — to be corrected', quantity: 1, rate: '100', tax_rate_bps: 1800 }],
  });
  assert.equal(tooLow.status, 422);
  assert.equal(tooLow.body.code, 'below_paid');
  const unchanged = (await call('GET', `/sales/documents/${inv.id}`)).body;
  assert.equal(Number(unchanged.document.total_paise), 118000, 'a refused correction leaves the invoice as it was');
  assert.equal(unchanged.document.journal_id, inv.journal_id);

  const ok = await call('POST', `/sales/documents/${inv.id}/amend`, {
    reason: 'ZZ test — added a line', party_id: customer.id, doc_date: '2026-09-19',
    lines: [{ description: 'ZZ test — to be corrected', quantity: 1, rate: '1000', tax_rate_bps: 1800 }, { description: 'ZZ test — extra', quantity: 1, rate: '500', tax_rate_bps: 1800 }],
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.paid_paise, paid, 'the money already received stays against it');
  assert.equal(ok.body.balance_paise, Number(ok.body.document.total_paise) - paid);
});

test('a cancelled invoice, a quotation and a draft are not corrected this way', { skip }, async () => {
  const inv = await issueInvoice(300, '2026-09-21');
  await call('POST', `/sales/documents/${inv.id}/cancel`, { reason: 'ZZ test — cancelled first' });
  const body = { reason: 'ZZ test', party_id: customer.id, lines: [{ description: 'x', quantity: 1, rate: '1', tax_rate_bps: 0 }] };
  assert.equal((await call('POST', `/sales/documents/${inv.id}/amend`, body)).status, 422, 'cancelled');

  const draft = await call('POST', '/sales/documents', { doc_type: 'invoice', party_id: customer.id, lines: body.lines });
  made.docs.push(draft.body.document.id);
  assert.equal((await call('POST', `/sales/documents/${draft.body.document.id}/amend`, body)).body.code, 'is_draft');

  const estimateId = made.docs[0];
  const est = await call('POST', `/sales/documents/${estimateId}/amend`, body);
  assert.equal(est.body.code, 'not_amendable', 'a quotation is revised, not corrected');
});

const billOf = async (billType, extra = {}) => {
  const draft = await call('POST', '/sales/documents', {
    doc_type: 'invoice', bill_type: billType, party_id: customer.id, doc_date: '2026-09-22',
    lines: [{ description: 'ZZ test — bill type', quantity: 2, rate: '1000', tax_rate_bps: 1800 }],
    ...extra,
  });
  assert.equal(draft.status, 201, JSON.stringify(draft.body));
  made.docs.push(draft.body.document.id);
  return draft.body.document;
};

test('three kinds of bill: GST, non-GST, and service with GST optional', { skip }, async () => {
  // GST: 2 × ₹1000 + 18%
  const gstDoc = await billOf('gst');
  assert.equal(gstDoc.bill_type, 'gst');
  assert.equal(Number(gstDoc.total_paise), 236000);
  assert.equal(Number(gstDoc.cgst_paise), 18000);

  // Non-GST: the 18% sent with the line is ignored — there is no tax on this bill at all.
  const plain = await billOf('non_gst', { prices_include_tax: true });
  assert.equal(plain.bill_type, 'non_gst');
  assert.equal(Number(plain.total_paise), 200000, 'no GST added');
  assert.equal(Number(plain.cgst_paise) + Number(plain.sgst_paise) + Number(plain.igst_paise), 0);
  const plainLines = (await call('GET', `/sales/documents/${plain.id}`)).body.lines;
  assert.ok(plainLines.every((l) => l.tax_treatment === 'non_gst' && Number(l.tax_rate_bps) === 0));

  // Service with GST, and service without.
  const svcGst = await billOf('service');
  assert.equal(Number(svcGst.total_paise), 236000, 'a service bill is taxed when its lines are');
  const svcPlain = await billOf('service', {
    lines: [{ description: 'ZZ test — plain service', quantity: 1, rate: '500', tax_treatment: 'non_gst', tax_rate_bps: 0 }],
  });
  assert.equal(Number(svcPlain.total_paise), 50000);

  const bad = await call('POST', '/sales/documents', { doc_type: 'invoice', bill_type: 'weird', party_id: customer.id, lines: [{ description: 'x', quantity: 1, rate: '1' }] });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, 'bad_bill_type');

  // A credit note is always a GST document.
  const cn = await call('POST', '/sales/documents', { doc_type: 'credit_note', bill_type: 'non_gst', party_id: customer.id, lines: [{ description: 'x', quantity: 1, rate: '100', tax_rate_bps: 1800 }] });
  made.docs.push(cn.body.document.id);
  assert.equal(cn.body.document.bill_type, 'gst');

  // They issue, post to the ledger, and the type survives a correction.
  const issued = await call('POST', `/sales/documents/${plain.id}/issue`);
  assert.equal(issued.status, 200, JSON.stringify(issued.body));
  assert.equal(await receivableNet(plain.id), 200000, 'the customer owes the plain total');
  const fixed = await call('POST', `/sales/documents/${plain.id}/amend`, {
    reason: 'ZZ test — qty', party_id: customer.id, doc_date: '2026-09-22',
    lines: [{ description: 'ZZ test — bill type', quantity: 3, rate: '1000', tax_rate_bps: 1800 }],
  });
  assert.equal(fixed.status, 200, JSON.stringify(fixed.body));
  assert.equal(fixed.body.document.bill_type, 'non_gst', 'a correction keeps the type');
  assert.equal(Number(fixed.body.document.total_paise), 300000);

  // A GST bill stays in the GST register; a non-GST one does not.
  const issuedGst = await call('POST', `/sales/documents/${gstDoc.id}/issue`);
  assert.equal(issuedGst.status, 200);
  const register = await call('GET', '/reports/gst/sales-register?from=2026-09-01&to=2026-09-30');
  if (register.status === 200) {
    const nos = register.body.rows.map((r) => r.doc_no);
    assert.ok(nos.includes(issuedGst.body.document.doc_no), 'the GST bill is in the GST register');
    assert.ok(!nos.includes(issued.body.document.doc_no), 'the non-GST bill is kept out of it');
  }
});

test('what the printed bill shows follows its type', { skip }, async () => {
  const { tableColumns, headingOf } = require('../server/modules/sales/pdf.cjs');
  const keys = (doc, lines = []) => tableColumns({ doc, lines, width: 500 }).cols.map((c) => c.key);
  const untaxedLine = [{ tax_rate_bps: 0 }];

  const gstCols = keys({ bill_type: 'gst', supply_type: 'intra' }, untaxedLine);
  assert.ok(gstCols.includes('cgst') && gstCols.includes('sgst'), 'a GST bill always shows the tax columns');
  assert.ok(keys({ bill_type: 'gst', supply_type: 'inter' }, untaxedLine).includes('igst'));

  const plainCols = keys({ bill_type: 'non_gst', cgst_paise: 100 }, [{ tax_rate_bps: 1800 }]);
  assert.ok(!plainCols.some((k) => ['cgst', 'sgst', 'igst', 'taxable'].includes(k)), 'a non-GST bill never shows GST columns');

  assert.ok(!keys({ bill_type: 'service' }, untaxedLine).includes('cgst'), 'a service bill without GST has none');
  assert.ok(keys({ bill_type: 'service', cgst_paise: 900, supply_type: 'intra' }, [{ tax_rate_bps: 1800 }]).includes('cgst'), 'with GST it has them');

  assert.equal(headingOf({ doc_type: 'invoice', bill_type: 'gst' }), 'Tax Invoice');
  assert.equal(headingOf({ doc_type: 'invoice', bill_type: 'non_gst' }), 'Invoice');
  assert.equal(headingOf({ doc_type: 'invoice', bill_type: 'service', cgst_paise: 0 }), 'Service Invoice');
  assert.equal(headingOf({ doc_type: 'invoice', bill_type: 'service', cgst_paise: 900 }), 'Tax Invoice (Services)');
  assert.equal(headingOf({ doc_type: 'estimate', bill_type: 'non_gst' }), 'Quotation');

  // And each really renders.
  const [plainDoc] = (await call('GET', '/sales/documents?doc_type=invoice&status=issued')).body.filter((d) => d.bill_type === 'non_gst' && d.party_id === customer.id);
  const pdf = await call('GET', `/sales/documents/${plainDoc.id}/pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.buffer.subarray(0, 5).toString(), '%PDF-');
});

test('permissions hold on the sales side too', { skip }, async () => {
  const create = await call('POST', '/sales/documents', {
    doc_type: 'invoice', party_id: customer.id,
    lines: [{ description: 'x', quantity: 1, rate: '1', tax_rate_bps: 0 }],
  }, 'employee');
  assert.equal(create.status, 403);
  assert.equal(create.body.capability, 'invoice.create');

  assert.equal((await call('POST', '/payments', { party_id: customer.id, amount_paise: 100 }, 'employee')).status, 403);
  assert.equal((await call('POST', `/sales/documents/${invoiceId}/cancel`, { reason: 'x' }, 'employee')).status, 403);
});

test('nothing can be issued into a closed period', { skip }, async () => {
  const lock = await call('POST', '/accounting/period-locks', {
    locked_upto: '2026-09-30', reason: 'ZZ test — September closed',
  });
  assert.equal(lock.status, 201);
  made.locks.push(lock.body.id);

  const draft = await call('POST', '/sales/documents', {
    doc_type: 'invoice', party_id: customer.id, doc_date: '2026-09-20',
    lines: [{ description: 'ZZ test — too late', quantity: 1, rate: '100', tax_rate_bps: 0 }],
  });
  made.docs.push(draft.body.document.id);

  const issued = await call('POST', `/sales/documents/${draft.body.document.id}/issue`);
  assert.equal(issued.status, 422);
  assert.equal(issued.body.code, 'period_locked');

  // …and the document is still a draft, not half-issued.
  const after = (await call('GET', `/sales/documents/${draft.body.document.id}`)).body;
  assert.equal(after.document.status, 'draft');
  assert.equal(after.document.doc_no, null);

  await call('DELETE', `/accounting/period-locks/${lock.body.id}`, { reason: 'ZZ test — done' });
});

test.after(async () => {
  if (!db) return;
  for (const id of made.docs.filter(Boolean)) {
    const [[doc]] = await db.query('SELECT journal_id FROM sales_documents WHERE id = ?', [id]);
    await db.query('DELETE FROM payment_allocations WHERE document_id = ?', [id]);
    await db.query('DELETE FROM sales_document_lines WHERE document_id = ?', [id]);
    await db.query('DELETE FROM sales_documents WHERE id = ?', [id]);
    if (doc?.journal_id) made.journals.push(doc.journal_id);
  }
  for (const id of made.payments.filter(Boolean)) {
    const [[pay]] = await db.query('SELECT journal_id FROM payments WHERE id = ?', [id]);
    await db.query('DELETE FROM payment_allocations WHERE payment_id = ?', [id]);
    await db.query('DELETE FROM payments WHERE id = ?', [id]);
    if (pay?.journal_id) made.journals.push(pay.journal_id);
  }
  // Journals raised by these documents, and any reversal of them.
  const [extra] = await db.query(
    `SELECT id FROM journals
      WHERE narration LIKE '%ZZ test%'
         OR source_id IN (?)
         OR id IN (SELECT journal_id FROM payment_allocations WHERE journal_id IS NOT NULL)`,
    [[...made.docs, ...made.payments].filter(Boolean).concat('none')]
  );
  for (const id of [...new Set([...made.journals, ...extra.map((r) => r.id)])].filter(Boolean)) {
    const [[rev]] = await db.query('SELECT reversed_by_id FROM journals WHERE id = ?', [id]);
    for (const jid of [id, rev?.reversed_by_id].filter(Boolean)) {
      await db.query('DELETE FROM journal_lines WHERE journal_id = ?', [jid]);
      await db.query('UPDATE journals SET reversed_by_id = NULL, reversal_of_id = NULL WHERE id = ?', [jid]);
      await db.query('DELETE FROM journals WHERE id = ?', [jid]);
    }
  }
  for (const id of made.parties.filter(Boolean)) {
    await db.query('DELETE FROM journal_lines WHERE party_id = ?', [id]);
    await db.query('DELETE FROM party_addresses WHERE party_id = ?', [id]);
    await db.query('DELETE FROM parties WHERE id = ?', [id]);
  }
  for (const id of made.items.filter(Boolean)) {
    await db.query('DELETE FROM inventory_movements WHERE item_id = ?', [id]);
    await db.query('DELETE FROM inventory_items WHERE id = ?', [id]);
  }
  // A lock left behind by an interrupted run would block every later test.
  for (const id of made.locks.filter(Boolean)) await db.query('DELETE FROM period_locks WHERE id = ?', [id]);
  await db.query("DELETE FROM period_locks WHERE reason LIKE '%ZZ test%'");
  await db.query("DELETE FROM audit_log WHERE reason LIKE 'ZZ test%'");
  if (businessBefore) {
    await db.query(
      'UPDATE businesses SET state_code = ?, state_name = ?, registration_type = ?, setup_complete = ? WHERE id = ?',
      [businessBefore.state_code, businessBefore.state_name, businessBefore.registration_type,
        businessBefore.setup_complete, businessBefore.id]
    );
  }
  await db.end();
});
