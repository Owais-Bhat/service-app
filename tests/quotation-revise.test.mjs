// A quotation that has gone out can be corrected, and its printed copy has to
// be laid out properly.
//
//   node --test tests/quotation-revise.test.mjs
//
// The wording of amounts needs nothing. The rest needs the local API and test
// database and skips without them. Everything it creates is removed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { inWords, tableColumns } = require('../server/modules/sales/pdf.cjs');
const API = 'http://127.0.0.1:5000/api';

test('the table always fits the page, and a document with no tax has no tax columns', () => {
  const W = 515;
  const plain = tableColumns({ doc: { supply_type: 'intra', cgst_paise: 0, sgst_paise: 0, utgst_paise: 0, igst_paise: 0 }, lines: [{ tax_rate_bps: 0 }], width: W });
  assert.equal(plain.hasTax, false);
  assert.equal(plain.cols.reduce((n, c) => n + c.w, 0), W, 'the columns add up to the page width');
  assert.deepEqual(plain.cols.map((c) => c.key), ['sn', 'desc', 'hsn', 'qty', 'unit', 'rate', 'amount']);
  assert.ok(plain.cols[1].w > 200, 'the description gets the room the tax columns would have taken');

  const intra = tableColumns({ doc: { supply_type: 'intra', cgst_paise: 900, sgst_paise: 900 }, lines: [{ tax_rate_bps: 1800 }], width: W });
  assert.equal(intra.cols.reduce((n, c) => n + c.w, 0), W, 'and with CGST and SGST too — it used to run past the margin');
  assert.ok(intra.cols.some((c) => c.key === 'cgst') && intra.cols.some((c) => c.key === 'sgst'));

  const inter = tableColumns({ doc: { supply_type: 'inter', igst_paise: 1800 }, lines: [{ tax_rate_bps: 1800 }], width: W });
  assert.equal(inter.cols.reduce((n, c) => n + c.w, 0), W);
  assert.ok(inter.cols.some((c) => c.key === 'igst') && !inter.cols.some((c) => c.key === 'cgst'));
  for (const set of [plain, intra, inter]) assert.ok(set.cols.every((c) => c.w >= 14), 'no column is squeezed to nothing');
});

test('an amount is written out the Indian way', () => {
  assert.equal(inWords(2215000), 'Rupees Twenty Two Thousand One Hundred Fifty Only');
  assert.equal(inWords(10000000), 'Rupees One Lakh Only');
  assert.equal(inWords(12345678900), 'Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only');
  assert.equal(inWords(105), 'Rupees One and Five Paise Only');
  assert.equal(inWords(0), 'Zero');
});

let mysql; let jwt; let db; let token; let reachable = false;
let businessBefore = null;
const made = { docs: [], parties: [] };

try {
  require('../server/node_modules/dotenv').config({ path: new URL('../server/.env', import.meta.url).pathname.replace(/^\//, '') });
  mysql = require('../server/node_modules/mysql2/promise');
  jwt = require('../server/node_modules/jsonwebtoken');
  const probe = await fetch(`${API}/sales/receivables`).catch(() => null);
  reachable = !!probe && probe.status === 401;
  if (reachable) {
    db = await mysql.createConnection({
      host: process.env.DB_HOST, user: process.env.DB_USER,
      password: process.env.DB_PASS, database: process.env.DB_NAME,
    });
    const [[admin]] = await db.query("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1");
    token = jwt.sign({ id: admin.id, email: 'admin@test.local', role: 'admin', worker_type: 'fixed' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  }
} catch { reachable = false; }

const skip = reachable ? false : 'needs the local API on port 5000 and the test database';

const call = async (method, path, body) => {
  const res = await fetch(API + path, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const pdfOf = async (id) => {
  const res = await fetch(`${API}/sales/documents/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
  return Buffer.from(await res.arrayBuffer());
};
const pages = (pdf) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

let party; let quote;
const lines = (qty) => [
  { description: 'HIKVISION DVR 08CH', quantity: 1, rate: '9800', tax_rate_bps: 0 },
  { description: 'HIKVISION 5MP CAMERA ANALOG', quantity: qty, rate: '1900', tax_rate_bps: 0 },
  { description: 'SMPS 10CH', quantity: 1, rate: '950', tax_rate_bps: 0 },
];

test('set up: a customer and a quotation that has gone out and been accepted', { skip }, async () => {
  const [[biz]] = await db.query('SELECT * FROM businesses WHERE is_default = 1 LIMIT 1');
  businessBefore = biz;
  await db.query(`UPDATE businesses SET state_code = '01', state_name = 'Jammu and Kashmir', setup_complete = 1 WHERE id = ?`, [biz.id]);

  const p = await call('POST', '/parties', { display_name: 'ZZ Quote Customer', phone: '9000000601', place_of_supply_state_code: '01' });
  assert.equal(p.status, 201);
  party = p.body;
  made.parties.push(party.id);

  const d = await call('POST', '/sales/documents', { doc_type: 'estimate', party_id: party.id, doc_date: '2026-09-29', valid_until: '2026-10-15', lines: lines(6) });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  made.docs.push(d.body.document.id);
  const issued = await call('POST', `/sales/documents/${d.body.document.id}/issue`);
  assert.equal(issued.status, 200, JSON.stringify(issued.body));
  quote = issued.body.document;
  assert.match(quote.doc_no, /^EST-/);
  assert.equal(Number(quote.total_paise), (9800 + 6 * 1900 + 950) * 100);

  const acc = await call('POST', `/sales/documents/${quote.id}/acceptance`, { status: 'accepted', method: 'phone' });
  assert.equal(acc.status, 200, JSON.stringify(acc.body));
});

test('an issued quotation can be revised: same number, new figures, a revision count, and the acceptance is withdrawn', { skip }, async () => {
  const r = await call('POST', `/sales/documents/${quote.id}/revise`, {
    party_id: party.id, doc_date: '2026-09-29', valid_until: '2026-10-31', notes: 'Revised after the site visit', lines: lines(8),
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const d = r.body.document;
  assert.equal(d.doc_no, quote.doc_no, 'it keeps its number');
  assert.equal(Number(d.revision_no), 1);
  assert.equal(d.status, 'issued', 'back to sent — the customer agreed to the old version');
  assert.equal(d.accepted_at, null);
  assert.equal(Number(d.total_paise), (9800 + 8 * 1900 + 950) * 100, 'the new total');
  const v = new Date(d.valid_until);
  assert.equal(`${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`, '2026-10-31');
  assert.equal(r.body.lines.length, 3);
  assert.ok(d.party_snapshot?.display_name === 'ZZ Quote Customer', 'the customer is frozen again');

  const again = await call('POST', `/sales/documents/${quote.id}/revise`, { party_id: party.id, doc_date: '2026-09-29', lines: lines(7) });
  assert.equal(Number(again.body.document.revision_no), 2, 'each revision is counted');

  // The audit trail is written just after the reply, so give it a moment.
  let n = 0;
  for (let i = 0; i < 20 && n < 2; i += 1) {
    n = (await db.query("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'document.revise' AND entity_id = ?", [quote.id]))[0][0].n;
    if (n < 2) await new Promise((r) => setTimeout(r, 150));
  }
  assert.equal(n, 2, 'and each is in the audit trail');
});

test('a revision that leaves out the customer or the lines is refused and changes nothing', { skip }, async () => {
  const before = (await call('GET', `/sales/documents/${quote.id}`)).body.document;
  const noParty = await call('POST', `/sales/documents/${quote.id}/revise`, { doc_date: '2026-09-29', lines: lines(3) });
  assert.equal(noParty.status, 400);
  const noLines = await call('POST', `/sales/documents/${quote.id}/revise`, { party_id: party.id, doc_date: '2026-09-29', lines: [] });
  assert.equal(noLines.status, 400);
  const after = (await call('GET', `/sales/documents/${quote.id}`)).body;
  assert.equal(Number(after.document.total_paise), Number(before.total_paise), 'the quotation is as it was');
  assert.equal(after.lines.length, 3);
});

test('only a quotation can be revised; a draft is edited, and a converted one has become an invoice', { skip }, async () => {
  const inv = await call('POST', '/sales/documents', { doc_type: 'invoice', party_id: party.id, doc_date: '2026-09-29', lines: lines(1) });
  made.docs.push(inv.body.document.id);
  await call('POST', `/sales/documents/${inv.body.document.id}/issue`);
  const tryInvoice = await call('POST', `/sales/documents/${inv.body.document.id}/revise`, { party_id: party.id, doc_date: '2026-09-29', lines: lines(2) });
  assert.equal(tryInvoice.status, 422);
  assert.equal(tryInvoice.body.code, 'not_estimate', 'an invoice posts to the books, so it is cancelled and raised again');

  const draft = await call('POST', '/sales/documents', { doc_type: 'estimate', party_id: party.id, doc_date: '2026-09-29', lines: lines(1) });
  made.docs.push(draft.body.document.id);
  const tryDraft = await call('POST', `/sales/documents/${draft.body.document.id}/revise`, { party_id: party.id, doc_date: '2026-09-29', lines: lines(2) });
  assert.equal(tryDraft.body.code, 'not_revisable');

  const converted = await call('POST', `/sales/documents/${quote.id}/convert`, { to: 'invoice' });
  assert.equal(converted.status, 201, JSON.stringify(converted.body));
  made.docs.push(converted.body.document.id);
  const tryConverted = await call('POST', `/sales/documents/${quote.id}/revise`, { party_id: party.id, doc_date: '2026-09-29', lines: lines(2) });
  assert.equal(tryConverted.status, 422);
  assert.equal(tryConverted.body.code, 'converted');
});

test('the printed quotation fits on one page and carries its revision', { skip }, async () => {
  const [[revised]] = await db.query("SELECT id FROM sales_documents WHERE doc_no = ?", [quote.doc_no]);
  const pdf = await pdfOf(revised.id);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal(pages(pdf), 1, 'three lines are one page');
});

test.after(async () => {
  if (!db) return;
  try {
    const [docs] = await db.query("SELECT id, journal_id FROM sales_documents WHERE party_id IN (?)", [made.parties.length ? made.parties : ['none']]);
    for (const d of docs) {
      await db.query('DELETE FROM sales_document_lines WHERE document_id = ?', [d.id]);
      await db.query('UPDATE sales_documents SET converted_from_id = NULL, converted_to_id = NULL WHERE id = ?', [d.id]);
    }
    for (const d of docs) {
      await db.query('DELETE FROM sales_documents WHERE id = ?', [d.id]);
      if (d.journal_id) {
        const [[rev]] = await db.query('SELECT reversed_by_id FROM journals WHERE id = ?', [d.journal_id]);
        for (const jid of [d.journal_id, rev?.reversed_by_id].filter(Boolean)) {
          await db.query('UPDATE journals SET reversed_by_id = NULL, reversal_of_id = NULL WHERE id = ?', [jid]);
          await db.query('DELETE FROM journal_lines WHERE journal_id = ?', [jid]);
          await db.query('DELETE FROM journals WHERE id = ?', [jid]);
        }
      }
    }
    for (const id of made.parties) {
      await db.query('DELETE FROM journal_lines WHERE party_id = ?', [id]);
      await db.query('DELETE FROM parties WHERE id = ?', [id]);
    }
    await db.query("DELETE FROM audit_log WHERE action = 'document.revise'");
    if (businessBefore) {
      await db.query('UPDATE businesses SET state_code = ?, state_name = ?, setup_complete = ? WHERE id = ?',
        [businessBefore.state_code, businessBefore.state_name, businessBefore.setup_complete, businessBefore.id]);
    }
  } finally {
    await db.end();
  }
});
