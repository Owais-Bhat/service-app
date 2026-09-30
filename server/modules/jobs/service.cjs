'use strict';

// What a job cost, and what it earned.
//
// The flow this file holds:
//
//   technician submits what he fitted
//        ↓  (approval, if the business asks for one)
//   stock leaves the van, cost of goods sold is posted
//        ↓
//   labour, travel and subcontractor costs are added
//        ↓
//   an invoice draft is prepared from the approved work — once
//        ↓
//   the job can be compared: estimated against actual, revenue against cost
//
// Two things it refuses to do: move stock for work nobody approved, and
// prepare a second invoice for a job that already has one.

const { randomUUID } = require('crypto');
const money = require('../money.cjs');
const posting = require('../ledger/posting.cjs');
const stock = require('../stock/engine.cjs');
const sales = require('../sales/service.cjs');

class JobError extends Error {
    constructor(message, code = 'job_error', status = 422) {
        super(message);
        this.name = 'JobError';
        this.code = code;
        this.status = status;
    }
}

const JOB_TYPES = new Set(['inquiry', 'installation']);
const JOB_TABLE = { inquiry: 'inquiries', installation: 'installations' };

const parseJson = (v) => {
    if (!v) return null;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { return null; }
};

async function loadJob(conn, jobType, jobId) {
    if (!JOB_TYPES.has(jobType)) throw new JobError('Unknown kind of job', 'bad_job_type', 400);
    const [[row]] = await conn.query(`SELECT * FROM ${JOB_TABLE[jobType]} WHERE id = ? LIMIT 1`, [jobId]);
    if (!row) throw new JobError('No such job', 'not_found', 404);
    return row;
}

// A job belongs to a customer. Older jobs carry only a name and a phone, so the
// party is found by phone where it can be, and left unset where it cannot —
// linking them properly is a reviewed migration, not a guess made here.
async function partyForJob(conn, businessId, job) {
    if (job.party_id) {
        const [[party]] = await conn.query('SELECT * FROM parties WHERE id = ? LIMIT 1', [job.party_id]);
        if (party) return party;
    }
    const digits = String(job.phone || '').replace(/\D/g, '').slice(-10);
    if (digits.length === 10) {
        const [[match]] = await conn.query(
            `SELECT * FROM parties WHERE business_id = ? AND merged_into_id IS NULL
               AND RIGHT(REPLACE(REPLACE(phone, ' ', ''), '-', ''), 10) = ? LIMIT 1`,
            [businessId, digits]
        );
        if (match) return match;
    }
    return null;
}

// ── materials ───────────────────────────────────────────────────────────
/**
 * A technician's account of what he fitted. Nothing moves yet unless the
 * business has said approval is not required — in which case this approves it
 * in the same breath, which is how the app behaved before approvals existed.
 */
async function submitMaterials(conn, { businessId, user, payload }) {
    const { job_type: jobType, job_id: jobId } = payload;
    const job = await loadJob(conn, jobType, jobId);

    const [[biz]] = await conn.query('SELECT require_material_approval FROM businesses WHERE id = ? LIMIT 1', [businessId]);
    const kind = payload.kind === 'returned' ? 'returned' : 'used';

    const lines = [];
    for (const raw of (payload.lines || [])) {
        const description = String(raw.description || '').trim();
        const quantity = Number(raw.quantity) || 0;
        if (!description || !(quantity > 0)) continue;

        let baseQuantity = quantity;
        if (raw.item_id) {
            const item = await stock.loadItem(conn, raw.item_id);
            baseQuantity = stock.toBaseQuantity(item, quantity, raw.unit);
        }
        lines.push({
            item_id: raw.item_id || null,
            description: description.slice(0, 300),
            quantity,
            unit: raw.unit || null,
            base_quantity: baseQuantity,
            sell_rate_paise: raw.sell_rate === undefined && raw.sell_rate_paise === undefined
                ? 0
                : (raw.sell_rate_paise !== undefined ? Math.round(Number(raw.sell_rate_paise)) : money.toPaise(raw.sell_rate)),
            serial_ids: Array.isArray(raw.serial_ids) ? raw.serial_ids : null,
        });
    }
    if (!lines.length) throw new JobError('Nothing to submit', 'no_lines', 400);

    const id = randomUUID();
    const issueNo = await posting.allocateNumber(conn, businessId, 'material_issue', new Date());

    await conn.query('INSERT INTO job_material_issues SET ?', [{
        id, business_id: businessId, issue_no: issueNo,
        job_type: jobType, job_id: jobId,
        location_id: payload.location_id || null,
        employee_id: payload.employee_id || user?.id || null,
        status: 'submitted', kind,
        customer_approved: payload.customer_approved ? 1 : 0,
        customer_approval_note: payload.customer_approval_note || null,
        note: payload.note || null,
        created_by: user?.id || null,
    }]);

    for (const line of lines) {
        await conn.query('INSERT INTO job_material_lines SET ?', [{
            id: randomUUID(), issue_id: id,
            item_id: line.item_id, description: line.description,
            quantity: line.quantity, unit: line.unit, base_quantity: line.base_quantity,
            sell_rate_paise: line.sell_rate_paise,
            serial_ids: line.serial_ids ? JSON.stringify(line.serial_ids) : null,
        }]);
    }

    void job;
    if (!biz?.require_material_approval) {
        return approveMaterials(conn, { businessId, user, id, auto: true });
    }
    return loadIssue(conn, id);
}

/**
 * Accepting a technician's account. This is the moment stock leaves the books
 * and the cost reaches the accounts:
 *
 *   used:     Dr Cost of Goods Sold, Cr Inventory — the goods are gone
 *   returned: the reverse, at the same cost
 */
async function approveMaterials(conn, { businessId, user, id, auto = false }) {
    const loaded = await loadIssue(conn, id);
    if (!loaded) throw new JobError('No such submission', 'not_found', 404);
    const issue = loaded.issue;
    if (issue.status === 'approved') throw new JobError('That submission is already approved', 'already_approved');
    if (issue.status === 'rejected') throw new JobError('That submission was rejected', 'rejected');

    const job = await loadJob(conn, issue.job_type, issue.job_id);
    const used = issue.kind === 'used';
    let totalCost = 0;

    for (const line of loaded.lines) {
        if (!line.item_id) continue; // bought on the way, never in our stock
        const baseQty = stock.qty(line.base_quantity);
        if (!(baseQty > 0)) continue;

        const made = await stock.move(conn, {
            businessId,
            itemId: line.item_id,
            type: used ? 'consume' : 'return',
            quantity: baseQty,
            locationId: issue.location_id,
            sourceType: 'job',
            sourceId: issue.id,
            employeeId: issue.employee_id,
            note: `${used ? 'Used on' : 'Returned from'} ${issue.job_type} ${job.ticket_no || issue.job_id}`,
            createdBy: user?.id || null,
        });

        const cost = Math.abs(made.value_paise);
        totalCost += cost;
        await conn.query(
            'UPDATE job_material_lines SET unit_cost_paise = ?, cost_paise = ? WHERE id = ?',
            [made.unit_cost_paise, cost, line.id]
        );

        // A serialised device fitted at a customer stops being stock and starts
        // being something with an address and a warranty.
        for (const serialId of (line.serial_ids || [])) {
            await conn.query(
                `UPDATE item_serials
                    SET status = ?, job_type = ?, job_id = ?, installed_at = ?, location_id = NULL
                  WHERE id = ?`,
                [used ? 'installed' : 'in_stock', used ? issue.job_type : null, used ? issue.job_id : null,
                    used ? new Date() : null, serialId]
            );
        }
    }

    let journalId = null;
    if (totalCost > 0) {
        const cogs = await posting.accountByCode(conn, businessId, '5000');
        const inventory = await posting.accountByCode(conn, businessId, '1200');
        const journal = await posting.postJournal(conn, {
            businessId,
            date: new Date(),
            narration: `Materials ${used ? 'used on' : 'returned from'} ${job.ticket_no || issue.job_type}`,
            sourceType: 'stock',
            sourceId: issue.id,
            lines: used
                ? [
                    { account_id: cogs.id, debit_paise: totalCost, memo: 'Cost of goods sold' },
                    { account_id: inventory.id, credit_paise: totalCost, memo: 'Out of stock' },
                ]
                : [
                    { account_id: inventory.id, debit_paise: totalCost, memo: 'Back into stock' },
                    { account_id: cogs.id, credit_paise: totalCost, memo: 'Cost reversed' },
                ],
            idempotencyKey: `job-materials:${issue.id}`,
            postedBy: user?.id || null,
        });
        journalId = journal.id;
    }

    await conn.query(
        `UPDATE job_material_issues
            SET status = 'approved', approved_by = ?, approved_at = NOW(), cost_paise = ?, journal_id = ?
          WHERE id = ?`,
        [auto ? null : (user?.id || null), totalCost, journalId, issue.id]
    );

    return loadIssue(conn, issue.id);
}

async function rejectMaterials(conn, { user, id, reason }) {
    if (!reason) throw new JobError('A rejection needs a reason', 'no_reason', 400);
    const loaded = await loadIssue(conn, id);
    if (!loaded) throw new JobError('No such submission', 'not_found', 404);
    if (loaded.issue.status !== 'submitted') throw new JobError('Only a submission waiting for approval can be rejected', 'not_pending');

    await conn.query(
        `UPDATE job_material_issues SET status = 'rejected', rejected_reason = ?, approved_by = ?, approved_at = NOW() WHERE id = ?`,
        [String(reason).slice(0, 500), user?.id || null, id]
    );
    return loadIssue(conn, id);
}

async function loadIssue(conn, id) {
    const [[issue]] = await conn.query(
        `SELECT i.*, p.full_name AS employee_name, l.name AS location_name, a.full_name AS approved_by_name
           FROM job_material_issues i
           LEFT JOIN profiles p ON p.id = i.employee_id
           LEFT JOIN profiles a ON a.id = i.approved_by
           LEFT JOIN stock_locations l ON l.id = i.location_id
          WHERE i.id = ? LIMIT 1`, [id]
    );
    if (!issue) return null;
    const [lines] = await conn.query(
        `SELECT ml.*, it.name AS item_name, it.base_unit
           FROM job_material_lines ml
           LEFT JOIN inventory_items it ON it.id = ml.item_id
          WHERE ml.issue_id = ?`, [id]
    );
    return { issue, lines: lines.map((l) => ({ ...l, serial_ids: parseJson(l.serial_ids) })) };
}

// ── other costs ─────────────────────────────────────────────────────────
// Labour, travel and subcontractors. An actual cost that is not goods still has
// to reach the accounts, or a job looks more profitable than it was.
async function addJobCost(conn, { businessId, user, payload }) {
    const jobType = payload.job_type;
    const jobId = payload.job_id;
    await loadJob(conn, jobType, jobId);

    const kind = ['labour', 'travel', 'subcontract', 'other'].includes(payload.kind) ? payload.kind : 'other';
    const basis = payload.basis === 'estimate' ? 'estimate' : 'actual';
    const quantity = Number(payload.quantity) || 1;
    const rate = payload.rate_paise !== undefined ? Math.round(Number(payload.rate_paise)) : money.toPaise(payload.rate ?? 0);
    const amount = payload.amount === undefined && payload.amount_paise === undefined
        ? Math.round(rate * quantity)
        : (payload.amount_paise !== undefined ? Math.round(Number(payload.amount_paise)) : money.toPaise(payload.amount));

    if (!(amount > 0)) throw new JobError('A cost needs an amount', 'no_amount', 400);

    const id = randomUUID();
    let journalId = null;

    // An estimate is a plan; it must not touch the accounts.
    if (basis === 'actual') {
        const account = await posting.accountByCode(conn, businessId, {
            labour: '5300', travel: '5200', subcontract: '5400', other: '5900',
        }[kind]);
        // The money has not left the business yet — a wage or a subcontractor's
        // bill is owed until it is paid, so it lands in payables.
        const payable = await posting.accountByCode(conn, businessId, '2000');
        const journal = await posting.postJournal(conn, {
            businessId,
            date: payload.date || new Date(),
            narration: `${kind} on ${jobType} ${jobId.slice(0, 8)}`,
            sourceType: 'manual',
            sourceId: id,
            lines: [
                { account_id: account.id, debit_paise: amount, memo: payload.description || kind },
                { account_id: payable.id, credit_paise: amount, party_id: payload.party_id || null, memo: 'Owed' },
            ],
            idempotencyKey: `job-cost:${id}`,
            postedBy: user?.id || null,
        });
        journalId = journal.id;
    }

    await conn.query('INSERT INTO job_costs SET ?', [{
        id, business_id: businessId, job_type: jobType, job_id: jobId,
        kind, basis, description: payload.description || null,
        quantity, rate_paise: rate, amount_paise: amount,
        employee_id: payload.employee_id || null, party_id: payload.party_id || null,
        billable: payload.billable === false ? 0 : 1,
        status: 'approved', journal_id: journalId,
        created_by: user?.id || null, approved_by: user?.id || null,
    }]);

    const [[saved]] = await conn.query('SELECT * FROM job_costs WHERE id = ?', [id]);
    return saved;
}

// ── what the job looks like ─────────────────────────────────────────────
// Estimated against actual, revenue against cost — all of it read from the
// records rather than from anything anyone typed into a summary field.
async function jobSummary(conn, { businessId, jobType, jobId }) {
    const job = await loadJob(conn, jobType, jobId);

    const [estimates] = await conn.query(
        'SELECT * FROM job_estimates WHERE job_type = ? AND job_id = ?', [jobType, jobId]
    );
    const [issues] = await conn.query(
        `SELECT i.*, p.full_name AS employee_name
           FROM job_material_issues i LEFT JOIN profiles p ON p.id = i.employee_id
          WHERE i.job_type = ? AND i.job_id = ? ORDER BY i.submitted_at`,
        [jobType, jobId]
    );
    const issueIds = issues.map((i) => i.id);
    const [materialLines] = issueIds.length
        ? await conn.query(
            `SELECT ml.*, i.status, i.kind, i.issue_no, it.name AS item_name
               FROM job_material_lines ml
               JOIN job_material_issues i ON i.id = ml.issue_id
               LEFT JOIN inventory_items it ON it.id = ml.item_id
              WHERE ml.issue_id IN (?)`, [issueIds])
        : [[]];
    const [costs] = await conn.query(
        'SELECT * FROM job_costs WHERE job_type = ? AND job_id = ?', [jobType, jobId]
    );
    const [documents] = await conn.query(
        `SELECT id, doc_no, doc_type, status, total_paise, taxable_paise, doc_date
           FROM sales_documents WHERE source_type = ? AND source_id = ? AND status <> 'cancelled'`,
        [jobType, jobId]
    );

    const approved = materialLines.filter((l) => l.status === 'approved');
    const materialCost = approved.reduce((sum, l) => sum + (l.kind === 'returned' ? -1 : 1) * Number(l.cost_paise || 0), 0);
    const pendingCost = materialLines.filter((l) => l.status === 'submitted').length;

    const actualCosts = costs.filter((c) => c.basis === 'actual');
    const otherCost = actualCosts.reduce((sum, c) => sum + Number(c.amount_paise), 0);
    const estimatedCost = estimates.reduce((sum, e) => sum + Number(e.cost_paise), 0)
        + costs.filter((c) => c.basis === 'estimate').reduce((sum, c) => sum + Number(c.amount_paise), 0);
    const estimatedSell = estimates.reduce((sum, e) => sum + Number(e.sell_paise), 0);

    const invoices = documents.filter((d) => d.doc_type === 'invoice' && d.status === 'issued');
    const creditNotes = documents.filter((d) => d.doc_type === 'credit_note' && d.status === 'issued');
    // Revenue is what was invoiced before tax — tax is the government's, not the
    // job's.
    const revenue = invoices.reduce((sum, d) => sum + Number(d.taxable_paise), 0)
        - creditNotes.reduce((sum, d) => sum + Number(d.taxable_paise), 0);

    const totalCost = materialCost + otherCost;

    return {
        job: {
            id: job.id, type: jobType, ticket_no: job.ticket_no, customer: job.full_name,
            phone: job.phone, status: job.status, assigned_employee_id: job.assigned_employee_id || null,
        },
        estimates,
        issues,
        material_lines: materialLines,
        costs,
        documents,
        totals: {
            estimated_cost_paise: estimatedCost,
            estimated_sell_paise: estimatedSell,
            material_cost_paise: materialCost,
            other_cost_paise: otherCost,
            total_cost_paise: totalCost,
            revenue_paise: revenue,
            margin_paise: revenue - totalCost,
            margin_pct: revenue > 0 ? Math.round(((revenue - totalCost) / revenue) * 1000) / 10 : null,
            pending_approvals: pendingCost,
        },
        // Said out loud, because a margin without its basis invites an argument.
        basis: 'Revenue is invoiced value before tax. Cost is approved materials at moving average, plus actual labour, travel and subcontractor costs. Submissions still awaiting approval are excluded.',
    };
}

// ── turning the work into an invoice ────────────────────────────────────
// Built from what was approved, priced at the selling rate, and prepared once.
// A second attempt hands back the draft that already exists.
async function invoiceFromJob(conn, { businessId, user, jobType, jobId, payload = {} }) {
    const job = await loadJob(conn, jobType, jobId);

    const [[existing]] = await conn.query(
        `SELECT id FROM sales_documents
          WHERE source_type = ? AND source_id = ? AND doc_type = 'invoice' AND status <> 'cancelled'
          LIMIT 1`,
        [jobType, jobId]
    );
    if (existing) {
        return { ...(await sales.loadDocument(conn, existing.id)), reused: true };
    }

    const party = await partyForJob(conn, businessId, job);
    if (!party) {
        throw new JobError(
            `${job.full_name || 'This job'} is not linked to a customer record — create or link the customer first`,
            'no_party', 400
        );
    }

    const [pending] = await conn.query(
        `SELECT COUNT(*) AS c FROM job_material_issues
          WHERE job_type = ? AND job_id = ? AND status = 'submitted'`,
        [jobType, jobId]
    );
    if (Number(pending[0].c) > 0 && !payload.ignore_pending) {
        throw new JobError(
            'Some materials are still waiting for approval — approve or reject them before invoicing',
            'pending_materials'
        );
    }

    const [lines] = await conn.query(
        `SELECT ml.*, i.kind, it.name AS item_name, it.hsn_sac, it.gst_rate, it.selling_rate
           FROM job_material_lines ml
           JOIN job_material_issues i ON i.id = ml.issue_id
           LEFT JOIN inventory_items it ON it.id = ml.item_id
          WHERE i.job_type = ? AND i.job_id = ? AND i.status = 'approved'`,
        [jobType, jobId]
    );

    // Materials used, less anything sent back, so a customer is charged for what
    // stayed on their wall.
    const net = new Map();
    for (const line of lines) {
        const key = line.item_id || line.description;
        const sign = line.kind === 'returned' ? -1 : 1;
        const current = net.get(key) || {
            item_id: line.item_id,
            description: line.item_name || line.description,
            hsn_sac: line.hsn_sac || null,
            unit: line.unit || null,
            quantity: 0,
            rate_paise: Number(line.sell_rate_paise) || money.toPaise(line.selling_rate ?? 0),
            tax_rate_bps: Math.round(Number(line.gst_rate ?? 18) * 100),
            cost_rate_paise: Number(line.unit_cost_paise) || 0,
        };
        current.quantity += sign * Number(line.base_quantity);
        net.set(key, current);
    }

    const invoiceLines = [...net.values()].filter((l) => l.quantity > 0);

    const [costs] = await conn.query(
        `SELECT * FROM job_costs WHERE job_type = ? AND job_id = ? AND basis = 'actual' AND billable = 1`,
        [jobType, jobId]
    );
    const charges = costs.map((c) => ({
        label: c.description || ({ labour: 'Labour', travel: 'Travel', subcontract: 'Subcontract' }[c.kind] || 'Charges'),
        amount_paise: Number(c.amount_paise),
        tax_rate_bps: payload.charge_tax_rate_bps === undefined ? 1800 : Number(payload.charge_tax_rate_bps),
    }));

    if (!invoiceLines.length && !charges.length) {
        throw new JobError('There is nothing approved on this job to invoice yet', 'nothing_to_invoice');
    }

    const id = await sales.saveDraft(conn, {
        businessId,
        user,
        payload: {
            doc_type: 'invoice',
            doc_date: payload.doc_date || new Date(),
            party_id: party.id,
            source_type: jobType,
            source_id: jobId,
            reference: job.ticket_no || null,
            notes: payload.notes || null,
            lines: invoiceLines,
            charges,
        },
    });

    return { ...(await sales.loadDocument(conn, id)), reused: false };
}

// An accepted quotation is the plan for the job: its lines become the estimate
// the actual work will be measured against.
async function estimateFromQuotation(conn, { businessId, user, documentId, jobType, jobId }) {
    const quotation = await sales.loadDocument(conn, documentId);
    if (!quotation) throw new JobError('No such quotation', 'not_found', 404);
    if (quotation.document.doc_type !== 'estimate') throw new JobError('That is not a quotation', 'not_estimate', 400);

    await loadJob(conn, jobType, jobId);
    await conn.query(
        'DELETE FROM job_estimates WHERE job_type = ? AND job_id = ? AND source_document_id = ?',
        [jobType, jobId, documentId]
    );

    let count = 0;
    for (const line of quotation.lines) {
        if (line.kind !== 'item') continue;
        let cost = Number(line.cost_rate_paise) || 0;
        if (!cost && line.item_id) {
            const item = await stock.loadItem(conn, line.item_id);
            cost = Number(item.avg_cost_paise) || money.toPaise(item.purchase_rate ?? 0);
        }
        await conn.query('INSERT INTO job_estimates SET ?', [{
            id: randomUUID(), business_id: businessId, job_type: jobType, job_id: jobId,
            source_document_id: documentId, item_id: line.item_id,
            description: line.description, quantity: Number(line.quantity), unit: line.unit,
            cost_paise: Math.round(cost * Number(line.quantity)),
            sell_paise: Number(line.taxable_paise),
            created_by: user?.id || null,
        }]);
        count += 1;
    }
    return { estimates: count };
}

module.exports = {
    JobError,
    submitMaterials,
    approveMaterials,
    rejectMaterials,
    addJobCost,
    jobSummary,
    invoiceFromJob,
    estimateFromQuotation,
    loadIssue,
    loadJob,
    partyForJob,
};
