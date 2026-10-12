'use strict';

// What an installer fitted, taken from his own van, and the bill the customer gets for it.
//
//   the installer says how many of each item are on the job
//        ↓  only the difference from what was already recorded is moved
//   stock leaves (or comes back to) HIS van — no approval step, it is his own stock
//        ↓
//   the customer's invoice is made from it, at the selling rate, and sent
//        ↓
//   he can change it again; the invoice is corrected and the customer gets the new one
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
    locked,
    locked_reason: lockedReason,
    // The screen shows rates and totals only to people who may see them.
    money_visible: !!moneyVisible,
  };
}

// Keep the customer's invoice in step with the items: make it, correct it, or take it back.
async function syncInvoice(conn, { businessId, user, job }) {
  const { invoiceLines, charges } = await jobs.invoiceLinesFor(conn, 'installation', job.id);
  const empty = !invoiceLines.length && !charges.length;
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
        lines: invoiceLines, charges,
      },
    });
    await sales.issueDocument(conn, { businessId, user, id });
    return { action: 'created', id };
  }

  const loaded = await sales.loadDocument(conn, existing.id);
  const d = loaded.document;
  const payload = {
    doc_date: d.doc_date, party_id: d.party_id, notes: d.notes, terms: d.terms, reference: d.reference,
    prices_include_tax: !!d.prices_include_tax, lines: invoiceLines, charges,
  };

  if (existing.status === 'draft') {
    if (empty) return { action: 'none', id: existing.id };
    await sales.saveDraft(conn, { businessId, user, existingId: existing.id, payload: { ...payload, doc_type: 'invoice' } });
    await sales.issueDocument(conn, { businessId, user, id: existing.id });
    return { action: 'created', id: existing.id };
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
async function setMaterials(conn, { businessId, user, job, lines, isManager, baseUrl }) {
  if (job.status === 'cancelled') throw new MaterialsError('This installation was cancelled', 'cancelled');
  const employeeId = job.assigned_employee_id;
  if (!employeeId) throw new MaterialsError('Assign this installation to a technician first', 'no_technician');

  const van = await vanFor(conn, businessId, employeeId);
  if (!van) {
    throw new MaterialsError(
      `No stock has been issued to ${job.employee_name || 'this technician'} yet — give them stock from Stock → Transfers first`,
      'no_van'
    );
  }

  const before = await findInvoice(conn, job.id);
  if (before && !isManager) {
    const loaded = await sales.loadDocument(conn, before.id);
    if (Number(loaded.paid_paise || 0) > 0) {
      throw new MaterialsError('The customer has already paid this bill. Ask the office to change it.', 'paid');
    }
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
  if (moved || !before) {
    try {
      await conn.beginTransaction();
      invoice = await syncInvoice(conn, { businessId, user, job });
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      invoiceError = err.message;
    }
  }

  let delivery = null;
  if (invoice.id && ['created', 'revised'].includes(invoice.action)) {
    delivery = await sendInvoice(conn, { businessId, user, documentId: invoice.id, baseUrl, force: true });
  }
  return { moved, invoice_action: invoice.action, invoice_id: invoice.id || null, invoice_error: invoiceError, delivery };
}

module.exports = { MaterialsError, vanFor, netUsed, findInvoice, state, syncInvoice, sendInvoice, setMaterials };
