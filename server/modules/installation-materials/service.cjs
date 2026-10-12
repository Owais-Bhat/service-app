'use strict';

// What an installer fitted, taken from his own van, and the bill the customer gets for it.
//
//   the installer says how many of each item are on the job
//        ↓  only the difference from what was already recorded is moved
//   stock leaves (or comes back to) HIS van — no approval step, it is his own stock
//        ↓
//   a DRAFT invoice is kept from it, at the selling rate — nothing is sent, nothing is posted yet
//        ↓
//   the office is alerted; it checks (calls the technician if it wants), then confirms
//        ↓
//   confirming issues the invoice and sends it to the customer; the technician can change things
//   until then, and not after
//
// The installer only ever sees items and quantities. Rates, costs and the bill's total are for people who may
// see money (see `moneyVisible`).

const stock = require('../stock/engine.cjs');
const jobs = require('../jobs/service.cjs');
const sales = require('../sales/service.cjs');
const wa = require('../whatsapp/service.cjs');
const serviceLedger = require('../service-ledger/service.cjs');

class MaterialsError extends Error {
  constructor(message, code = 'materials_error', status = 409) {
    super(message);
    this.name = 'MaterialsError';
    this.code = code;
    this.status = status;
  }
}

const q3 = (n) => Math.round(Number(n) * 1000) / 1000;

async function ensureSchema(conn) {
  const wanted = [
    ['installation_charge_paise', 'BIGINT NOT NULL DEFAULT 0'],
    // Which kind of bill the customer gets, decided by the office: gst | non_gst | service (NULL = gst).
    ['bill_type', 'VARCHAR(12) NULL'],
    ['show_gst', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['service_gst', 'TINYINT(1) NOT NULL DEFAULT 1'],
    // Where the technician's record stands: NULL (not submitted) | submitted (waiting for the office) | confirmed.
    ['materials_status', 'VARCHAR(12) NULL'],
    ['materials_submitted_at', 'TIMESTAMP NULL'],
    ['materials_confirmed_at', 'TIMESTAMP NULL'],
    ['materials_confirmed_by', 'VARCHAR(36) NULL'],
  ];
  for (const [name, definition] of wanted) {
    const [cols] = await conn.query('SHOW COLUMNS FROM installations LIKE ?', [name]);
    if (!cols.length) await conn.query(`ALTER TABLE installations ADD COLUMN ${name} ${definition}`);
  }
}

const BILL_TYPES = new Set(['gst', 'non_gst', 'service']);

// What the office chose for this job, as the invoice needs it.
function billChoice(job) {
  const type = BILL_TYPES.has(job.bill_type) ? job.bill_type : 'gst';
  return { type, show_gst: type === 'non_gst' && !!Number(job.show_gst), service_gst: type !== 'service' || !!Number(job.service_gst) };
}

// A service bill without GST has its lines and charges sent as non-GST, which is how the sales screen does it.
function shapeForBill(job, { invoiceLines, charges }) {
  const choice = billChoice(job);
  const strip = choice.type === 'service' && !choice.service_gst;
  const plain = (x) => (strip ? { ...x, tax_rate_bps: 0, tax_treatment: 'non_gst' } : x);
  return {
    bill_type: choice.type,
    show_gst: choice.show_gst,
    lines: invoiceLines.map(plain),
    charges: charges.map(plain),
  };
}

async function vanFor(conn, businessId, employeeId) {
  const [[van]] = await conn.query(
    "SELECT id, name FROM stock_locations WHERE business_id = ? AND kind = 'van' AND employee_id = ? AND active = 1 LIMIT 1",
    [businessId, employeeId]
  );
  return van || null;
}

// What is on the job now: used less returned, from approved submissions.
async function netUsed(conn, jobId) {
  const [rows] = await conn.query(
    `SELECT ml.item_id, it.name, COALESCE(it.base_unit, it.unit) AS unit,
            SUM(CASE WHEN i.kind = 'returned' THEN -ml.base_quantity ELSE ml.base_quantity END) AS net
       FROM job_material_lines ml
       JOIN job_material_issues i ON i.id = ml.issue_id
       JOIN inventory_items it ON it.id = ml.item_id
      WHERE i.job_type = 'installation' AND i.job_id = ? AND i.status = 'approved' AND ml.item_id IS NOT NULL
      GROUP BY ml.item_id, it.name, it.base_unit, it.unit
     HAVING net <> 0`,
    [jobId]
  );
  return rows.map((r) => ({ item_id: r.item_id, name: r.name, unit: r.unit, quantity: q3(r.net) })).filter((r) => r.quantity > 0);
}

async function findInvoice(conn, jobId) {
  const [[doc]] = await conn.query(
    `SELECT id, doc_no, status FROM sales_documents
      WHERE source_type = 'installation' AND source_id = ? AND doc_type = 'invoice' AND status <> 'cancelled' LIMIT 1`,
    [jobId]
  );
  return doc || null;
}

// The picture the installer's screen (and the office's) is drawn from.
async function state(conn, { businessId, job, moneyVisible }) {
  const van = job.assigned_employee_id ? await vanFor(conn, businessId, job.assigned_employee_id) : null;
  const used = await netUsed(conn, job.id);
  const usedBy = new Map(used.map((u) => [u.item_id, u.quantity]));

  const holding = van ? await stock.locationStock(conn, van.id) : [];
  // Everything he could put on the job: what he holds, plus what is already on it (which left his van).
  const items = new Map();
  for (const h of holding) {
    items.set(h.id, { item_id: h.id, name: h.name, unit: h.base_unit || h.unit, held_qty: q3(h.held_qty), on_job: usedBy.get(h.id) || 0 });
  }
  for (const u of used) {
    if (!items.has(u.item_id)) items.set(u.item_id, { item_id: u.item_id, name: u.name, unit: u.unit, held_qty: 0, on_job: u.quantity });
  }

  const existing = await findInvoice(conn, job.id);
  let invoice = null;
  let locked = false;
  let lockedReason = null;
  if (existing) {
    const loaded = await sales.loadDocument(conn, existing.id);
    const paid = Number(loaded.paid_paise || 0);
    invoice = { id: existing.id, doc_no: existing.doc_no, status: existing.status, paid: paid > 0 };
    if (paid > 0) { locked = true; lockedReason = 'The customer has already paid this bill. Ask the office to change it.'; }
    if (!locked && job.materials_status === 'confirmed' && !moneyVisible) {
      locked = true; lockedReason = 'The office has checked and sent this bill. Ask the office if something has to change.';
    }
    const [[sentRow]] = await conn.query(
      `SELECT status, created_at FROM whatsapp_messages
        WHERE ref_type = 'sales_document' AND ref_id = ? AND purpose = 'document' ORDER BY created_at DESC LIMIT 1`,
      [existing.id]
    );
    invoice.sent = !!sentRow && sentRow.status === 'sent';
    invoice.sent_at = sentRow?.created_at || null;
    if (moneyVisible) {
      invoice.total_paise = Number(loaded.document.total_paise);
      invoice.paid_paise = paid;
      invoice.lines = loaded.lines.filter((l) => l.kind === 'item').map((l) => ({
        description: l.description, quantity: Number(l.quantity), unit: l.unit,
        rate_paise: Number(l.rate_paise), amount_paise: Number(l.amount_paise),
      }));
    }
  }

  return {
    job: { id: job.id, ticket_no: job.ticket_no, full_name: job.full_name, status: job.status, installation_type: job.installation_type },
    technician: job.assigned_employee_id ? { id: job.assigned_employee_id, name: job.employee_name || null } : null,
    van,
    items: [...items.values()].sort((a, b) => a.name.localeCompare(b.name)),
    used,
    invoice,
    // What the installer wrote as the installation price (the customer's bill carries it as a charge).
    installation_charge: Number(job.installation_charge_paise || 0) / 100,
    materials_status: job.materials_status || null,
    submitted_at: job.materials_submitted_at || null,
    confirmed_at: job.materials_confirmed_at || null,
    // Decided by the office. The technician is not told, so it is only sent to those who may see money.
    bill: moneyVisible ? billChoice(job) : undefined,
    locked,
    locked_reason: lockedReason,
    // The screen shows rates and totals only to people who may see them.
    money_visible: !!moneyVisible,
  };
}

// Keep the customer's invoice in step with the items: make it, correct it, or take it back. A new invoice stays a
// draft (nothing posted, nothing sent) until `issue` is set, which only the office's confirmation does.
async function syncInvoice(conn, { businessId, user, job, issue = false }) {
  const raw = await jobs.invoiceLinesFor(conn, 'installation', job.id);
  const empty = !raw.invoiceLines.length && !raw.charges.length;
  const shaped = shapeForBill(job, raw);
  const existing = await findInvoice(conn, job.id);

  if (!existing) {
    if (empty) return { action: 'none' };
    let partyId = job.party_id || null;
    if (!partyId) {
      const [[biz]] = await conn.query('SELECT state_code FROM businesses WHERE id = ? LIMIT 1', [businessId]);
      partyId = await serviceLedger.resolveParty(conn, businessId, job, biz?.state_code);
      await conn.query('UPDATE installations SET party_id = ? WHERE id = ?', [partyId, job.id]);
    }
    const id = await sales.saveDraft(conn, {
      businessId, user,
      payload: {
        doc_type: 'invoice', doc_date: new Date(), party_id: partyId,
        source_type: 'installation', source_id: job.id, reference: job.ticket_no || null,
        bill_type: shaped.bill_type, show_gst: shaped.show_gst,
        lines: shaped.lines, charges: shaped.charges,
      },
    });
    if (issue) await sales.issueDocument(conn, { businessId, user, id });
    return { action: issue ? 'created' : 'drafted', id };
  }

  const loaded = await sales.loadDocument(conn, existing.id);
  const d = loaded.document;
  const payload = {
    doc_date: d.doc_date, party_id: d.party_id, notes: d.notes, terms: d.terms, reference: d.reference,
    prices_include_tax: !!d.prices_include_tax, bill_type: shaped.bill_type, show_gst: shaped.show_gst,
    lines: shaped.lines, charges: shaped.charges,
  };

  if (existing.status === 'draft') {
    if (empty) {
      // Everything was taken off: a draft with nothing in it is simply dropped.
      await conn.query('DELETE FROM sales_document_lines WHERE document_id = ?', [existing.id]);
      await conn.query("DELETE FROM sales_documents WHERE id = ? AND status = 'draft'", [existing.id]);
      return { action: 'none' };
    }
    await sales.saveDraft(conn, { businessId, user, existingId: existing.id, payload: { ...payload, doc_type: 'invoice' } });
    if (issue) await sales.issueDocument(conn, { businessId, user, id: existing.id });
    return { action: issue ? 'created' : 'drafted', id: existing.id };
  }

  if (empty) {
    await sales.cancelDocument(conn, { user, id: existing.id, reason: 'All the items were taken off this installation' });
    return { action: 'cancelled', id: existing.id };
  }
  await sales.reviseIssued(conn, {
    businessId, user, id: existing.id, payload, reason: 'Items on the installation were changed',
  });
  return { action: 'revised', id: existing.id };
}

async function sendInvoice(conn, { businessId, user, documentId, baseUrl, force }) {
  try {
    const out = await wa.sendDocument(conn, { businessId, user, documentId, baseUrl, force });
    return { sent: !!out.ok, error: out.ok ? null : out.error };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

/**
 * Set the items on an installation. `lines` is what is on the job now — [{ item_id, quantity }] — and anything
 * not listed is taken to be zero. Only the difference from what was recorded moves stock.
 */
async function setMaterials(conn, { businessId, user, job, lines, installationCharge, isManager, baseUrl }) {
  if (job.status === 'cancelled') throw new MaterialsError('This installation was cancelled', 'cancelled');
  const employeeId = job.assigned_employee_id;
  if (!employeeId) throw new MaterialsError('Assign this installation to a technician first', 'no_technician');

  const van = await vanFor(conn, businessId, employeeId);

  const before = await findInvoice(conn, job.id);
  if (before && !isManager) {
    const loaded = await sales.loadDocument(conn, before.id);
    if (Number(loaded.paid_paise || 0) > 0) {
      throw new MaterialsError('The customer has already paid this bill. Ask the office to change it.', 'paid');
    }
  }
  if (!isManager && job.materials_status === 'confirmed') {
    throw new MaterialsError('The office has checked and sent this bill. Ask the office if something has to change.', 'confirmed');
  }

  const [[pending]] = await conn.query(
    "SELECT COUNT(*) AS c FROM job_material_issues WHERE job_type = 'installation' AND job_id = ? AND status = 'submitted'", [job.id]
  );
  if (Number(pending.c) > 0) {
    throw new MaterialsError('Earlier items on this job are still waiting for approval — the office needs to approve them first', 'pending');
  }

  // What he now says is on the job.
  const wanted = new Map();
  for (const raw of (lines || [])) {
    const quantity = q3(raw.quantity);
    if (!raw.item_id || !(quantity >= 0)) continue;
    wanted.set(raw.item_id, q3((wanted.get(raw.item_id) || 0) + quantity));
  }

  const current = new Map((await netUsed(conn, job.id)).map((u) => [u.item_id, u.quantity]));
  const ids = new Set([...wanted.keys(), ...current.keys()]);

  const used = []; const returned = [];
  for (const itemId of ids) {
    const delta = q3((wanted.get(itemId) || 0) - (current.get(itemId) || 0));
    if (delta === 0) continue;
    const item = await stock.loadItem(conn, itemId);
    const line = { item_id: itemId, description: item.name, quantity: Math.abs(delta), unit: item.base_unit || item.unit || null };
    if (!van) {
      throw new MaterialsError(
        `No stock has been issued to ${job.employee_name || 'this technician'} yet — give them stock from Stock → Transfers first`,
        'no_van'
      );
    }
    if (delta > 0) {
      const held = await stock.locationQuantity(conn, itemId, van.id);
      if (delta > held) {
        throw new MaterialsError(`${item.name}: you hold only ${held} — ask the office for more stock`, 'short', 409);
      }
      used.push(line);
    } else {
      returned.push(line);
    }
  }

  // The installation price: part of the bill, so a change in it is a change to the bill.
  let chargeChanged = false;
  if (installationCharge !== undefined && installationCharge !== null && installationCharge !== '') {
    const rupees = Number(installationCharge);
    if (!(rupees >= 0) || rupees > 10000000) throw new MaterialsError('The installation price must be 0 or more', 'bad_charge', 400);
    const paise = Math.round(rupees * 100);
    if (paise !== Number(job.installation_charge_paise || 0)) {
      await conn.query('UPDATE installations SET installation_charge_paise = ? WHERE id = ?', [paise, job.id]);
      job.installation_charge_paise = paise;
      chargeChanged = true;
    }
  }

  let moved = 0;
  if (used.length || returned.length) {
    await conn.beginTransaction();
    try {
      for (const [kind, group] of [['used', used], ['returned', returned]]) {
        if (!group.length) continue;
        await jobs.submitMaterials(conn, {
          businessId, user, autoApprove: true,
          payload: {
            job_type: 'installation', job_id: job.id, location_id: van.id, employee_id: employeeId, kind,
            lines: group, note: kind === 'used' ? 'Items fitted on the job' : 'Items taken off the job',
          },
        });
        moved += group.length;
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    }
  }

  // The bill follows the items. A problem here must not undo the stock that did move.
  let invoice = { action: 'none' };
  let invoiceError = null;
  if (moved || chargeChanged || !before) {
    try {
      await conn.beginTransaction();
      invoice = await syncInvoice(conn, { businessId, user, job });
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      invoiceError = err.message;
    }
  }

  // The technician's submission is what the office is waiting for; the office's own edits change nothing about that.
  let submitted = false;
  if (!isManager && (moved || chargeChanged)) {
    await conn.query(
      "UPDATE installations SET materials_status = 'submitted', materials_submitted_at = NOW() WHERE id = ?", [job.id]
    );
    job.materials_status = 'submitted';
    submitted = true;
  }

  // Nothing goes to the customer from here: the office confirms first (see confirmAndSend).
  return {
    moved, charge_changed: chargeChanged, submitted,
    invoice_action: invoice.action, invoice_id: invoice.id || null, invoice_error: invoiceError,
  };
}

/**
 * The office has checked the record (and called the technician, if it wanted to): issue the bill and send it.
 * Asking again for a bill already issued just sends it once more.
 */
async function confirmAndSend(conn, { businessId, user, job, baseUrl }) {
  let existing = await findInvoice(conn, job.id);
  if (!existing || existing.status === 'draft') {
    await conn.beginTransaction();
    try {
      await syncInvoice(conn, { businessId, user, job, issue: true });
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    }
    existing = await findInvoice(conn, job.id);
  }
  if (!existing || existing.status === 'draft') {
    throw new MaterialsError('There are no items on this installation to bill yet', 'nothing_to_bill');
  }

  await conn.query(
    "UPDATE installations SET materials_status = 'confirmed', materials_confirmed_at = NOW(), materials_confirmed_by = ? WHERE id = ?",
    [user?.id || null, job.id]
  );
  job.materials_status = 'confirmed';

  const delivery = await sendInvoice(conn, { businessId, user, documentId: existing.id, baseUrl, force: true });
  return { invoice_id: existing.id, doc_no: existing.doc_no, ...delivery };
}

/**
 * The office decides which kind of bill this customer gets. If a bill exists and is not paid it is corrected to the new
 * kind (and the caller sends it again); if there is none yet, the choice is kept for when it is made.
 */
async function setBillType(conn, { businessId, user, job, billType, showGst, serviceGst }) {
  if (!BILL_TYPES.has(billType)) throw new MaterialsError('Bill type must be gst, non_gst or service', 'bad_bill_type', 400);
  const existing = await findInvoice(conn, job.id);
  if (existing) {
    const loaded = await sales.loadDocument(conn, existing.id);
    if (Number(loaded.paid_paise || 0) > 0) {
      throw new MaterialsError('The customer has already paid this bill, so its kind cannot be changed', 'paid');
    }
  }
  const row = {
    bill_type: billType,
    show_gst: billType === 'non_gst' && showGst ? 1 : 0,
    service_gst: billType === 'service' ? (serviceGst === false ? 0 : 1) : 1,
  };
  await conn.query('UPDATE installations SET ? WHERE id = ?', [row, job.id]);
  Object.assign(job, row);

  let invoice = { action: 'none' };
  if (existing) {
    await conn.beginTransaction();
    try {
      invoice = await syncInvoice(conn, { businessId, user, job });
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    }
  }
  return { invoice_action: invoice.action, invoice_id: invoice.id || existing?.id || null };
}

module.exports = { MaterialsError, confirmAndSend, setBillType, ensureSchema, vanFor, netUsed, findInvoice, state, syncInvoice, sendInvoice, setMaterials };
