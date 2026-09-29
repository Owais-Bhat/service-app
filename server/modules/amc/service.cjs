'use strict';

// Annual Maintenance Contracts.
//
// A contract says: for this customer, between these dates, we look after their
// equipment for this much, and so many visits are free. It is the steadiest
// repeat income a CCTV business has, so the things worth getting right are the
// three moments money and time are lost: the invoice for the term is raised, the
// visits are counted, and the renewal is chased before the contract lapses.
//
// The invoice is an ordinary sales invoice (it posts to the ledger like any
// other); the contract only remembers which one it is. A renewal is a new
// contract that points back at the one it continues, so a customer's history
// reads as a chain rather than as one row being overwritten every year.

const { randomUUID } = require('crypto');
const posting = require('../ledger/posting.cjs');
const sales = require('../sales/service.cjs');

class AmcError extends Error {
    constructor(message, code, status = 422) {
        super(message);
        this.name = 'AmcError';
        this.code = code;
        this.status = status;
    }
}

const AMC_TABLES = [
    `CREATE TABLE IF NOT EXISTS amc_contracts (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        contract_no VARCHAR(40),
        party_id VARCHAR(36) NOT NULL,
        title VARCHAR(200) NOT NULL COMMENT 'what is covered, in a line: "CCTV — 8 cameras, 1 DVR"',
        site VARCHAR(300) COMMENT 'where the equipment is',
        equipment TEXT COMMENT 'the covered devices, free text until the device register exists',
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        amount_paise BIGINT NOT NULL DEFAULT 0 COMMENT 'the charge for this term, before tax',
        tax_rate_bps INT NOT NULL DEFAULT 0,
        tax_treatment VARCHAR(12) NOT NULL DEFAULT 'gst',
        hsn_sac VARCHAR(12) DEFAULT '9987' COMMENT 'maintenance and repair services',
        visits_included INT NULL COMMENT 'free visits in the term; NULL means unlimited',
        status VARCHAR(12) NOT NULL DEFAULT 'active' COMMENT 'active | cancelled — expiry is worked out from the dates',
        invoice_id VARCHAR(36) NULL COMMENT 'the sales invoice for this term',
        renewed_from_id VARCHAR(36) NULL,
        renewed_to_id VARCHAR(36) NULL,
        notes VARCHAR(1000),
        terms TEXT,
        last_reminded_at TIMESTAMP NULL,
        reminders_sent INT NOT NULL DEFAULT 0,
        cancelled_reason VARCHAR(300),
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_amc_party (business_id, party_id),
        INDEX idx_amc_end (business_id, status, end_date),
        UNIQUE KEY uniq_amc_no (business_id, contract_no)
    )`,

    `CREATE TABLE IF NOT EXISTS amc_visits (
        id VARCHAR(36) PRIMARY KEY,
        contract_id VARCHAR(36) NOT NULL,
        visit_date DATE NOT NULL,
        kind VARCHAR(12) NOT NULL DEFAULT 'scheduled' COMMENT 'scheduled | complaint',
        ticket_ref VARCHAR(60) COMMENT 'the service request this visit was, if there was one',
        chargeable TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'made after the free visits ran out',
        note VARCHAR(500),
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_amc_visit (contract_id, visit_date),
        FOREIGN KEY (contract_id) REFERENCES amc_contracts(id) ON DELETE CASCADE
    )`,
];

async function ensureAmcSchema(conn) {
    for (const ddl of AMC_TABLES) await conn.query(ddl);
}

// ── small helpers ───────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    return Number.isNaN(date.getTime()) ? null : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
/** A DATE column comes back as a local-midnight Date; a string is read as that same day. */
const dayOf = (v) => {
    if (!v) return null;
    if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    const [y, m, d] = String(v).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
};
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => {
    const x = new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
    // 31 Jan + 1 month is 28 Feb, not 3 Mar.
    if (x.getDate() !== d.getDate()) x.setDate(0);
    return x;
};
const daysBetween = (a, b) => Math.round((dayOf(b) - dayOf(a)) / 86400000);
const clean = (v, max = 255) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
const paiseOf = (rupees, paise) => {
    if (paise !== undefined && paise !== null && paise !== '') return Math.round(Number(paise));
    return Math.round(Number(rupees || 0) * 100);
};

/** Where a contract stands today. Worked out, never stored, so it cannot go stale. */
function stateOf(c, today = new Date()) {
    if (c.status === 'cancelled') return 'cancelled';
    const t = dayOf(today);
    if (dayOf(c.start_date) > t) return 'upcoming';
    if (dayOf(c.end_date) < t) return c.renewed_to_id ? 'renewed' : 'expired';
    return c.renewed_to_id ? 'renewed' : 'active';
}

/** A contract is "current" while it is running and has not been renewed onward. */
const NEEDS_CHASING = new Set(['active', 'expired']);

async function nextContractNo(conn, businessId, date) {
    return posting.allocateNumber(conn, businessId, 'amc_contract', date);
}

function normalise(payload, { partial = false } = {}) {
    const out = {};
    const has = (k) => payload[k] !== undefined;

    if (!partial || has('title')) {
        out.title = clean(payload.title, 200);
        if (!out.title) throw new AmcError('Say what the contract covers', 'no_title', 400);
    }
    if (!partial || has('party_id')) {
        out.party_id = payload.party_id || null;
        if (!out.party_id) throw new AmcError('Choose the customer', 'no_party', 400);
    }
    if (!partial || has('start_date')) {
        out.start_date = ymd(payload.start_date);
        if (!out.start_date) throw new AmcError('The contract needs a start date', 'no_start', 400);
    }
    if (!partial || has('end_date')) {
        out.end_date = ymd(payload.end_date);
        if (!out.end_date) throw new AmcError('The contract needs an end date', 'no_end', 400);
    }
    if (has('site')) out.site = clean(payload.site, 300);
    if (has('equipment')) out.equipment = clean(payload.equipment, 4000);
    if (has('notes')) out.notes = clean(payload.notes, 1000);
    if (has('terms')) out.terms = clean(payload.terms, 4000);
    if (has('hsn_sac')) out.hsn_sac = clean(payload.hsn_sac, 12);

    if (has('amount') || has('amount_paise')) {
        out.amount_paise = paiseOf(payload.amount, payload.amount_paise);
        if (!(out.amount_paise >= 0)) throw new AmcError('The amount cannot be negative', 'bad_amount', 400);
    }
    if (has('tax_rate_bps') || has('tax_treatment')) {
        const treatment = payload.tax_treatment || 'gst';
        if (!['gst', 'exempt', 'nil_rated', 'non_gst'].includes(treatment)) throw new AmcError('Unknown tax treatment', 'bad_tax', 400);
        out.tax_treatment = treatment;
        out.tax_rate_bps = treatment === 'gst' ? Math.max(0, Math.round(Number(payload.tax_rate_bps) || 0)) : 0;
    }
    if (has('visits_included')) {
        const v = payload.visits_included;
        out.visits_included = v === null || v === '' ? null : Math.max(0, Math.round(Number(v)));
        if (out.visits_included !== null && Number.isNaN(out.visits_included)) throw new AmcError('Free visits must be a number', 'bad_visits', 400);
    }

    if (out.start_date && out.end_date && out.end_date < out.start_date) {
        throw new AmcError('The contract cannot end before it starts', 'bad_dates', 400);
    }
    return out;
}

// ── reading ─────────────────────────────────────────────────────────────
const SELECT_CONTRACT = `
    SELECT c.*, p.display_name AS party_name, p.phone AS party_phone,
           (SELECT COUNT(*) FROM amc_visits v WHERE v.contract_id = c.id) AS visits_used,
           (SELECT COUNT(*) FROM amc_visits v WHERE v.contract_id = c.id AND v.chargeable = 1) AS visits_chargeable,
           d.doc_no AS invoice_no, d.status AS invoice_status, d.total_paise AS invoice_total_paise,
           COALESCE((SELECT SUM(a.amount_paise) FROM payment_allocations a
                       JOIN payments pay ON pay.id = a.payment_id AND pay.status = 'posted'
                      WHERE a.document_id = c.invoice_id), 0) AS invoice_paid_paise
      FROM amc_contracts c
      LEFT JOIN parties p ON p.id = c.party_id
      LEFT JOIN sales_documents d ON d.id = c.invoice_id`;

function shape(row, today = new Date()) {
    const state = stateOf(row, today);
    const included = row.visits_included === null ? null : Number(row.visits_included);
    const used = Number(row.visits_used || 0);
    const days = daysBetween(today, row.end_date);
    const invoiceLive = row.invoice_id && row.invoice_status && row.invoice_status !== 'cancelled';
    return {
        ...row,
        // Plain dates, not Date objects: a Date at local midnight serialises to the
        // evening before in UTC, and the screen would show the wrong day.
        start_date: ymd(row.start_date),
        end_date: ymd(row.end_date),
        amount_paise: Number(row.amount_paise),
        invoice_total_paise: invoiceLive ? Number(row.invoice_total_paise) : null,
        invoice_paid_paise: invoiceLive ? Number(row.invoice_paid_paise) : null,
        invoice_due_paise: invoiceLive ? Math.max(0, Number(row.invoice_total_paise) - Number(row.invoice_paid_paise)) : null,
        has_invoice: !!invoiceLive,
        state,
        days_left: state === 'active' || state === 'renewed' || state === 'upcoming' ? days : null,
        days_overdue: state === 'expired' ? -days : null,
        visits_used: used,
        visits_left: included === null ? null : Math.max(0, included - used),
        visits_over: included === null ? 0 : Math.max(0, used - included),
    };
}

async function listContracts(conn, businessId, { status = null, q = null, partyId = null, today = new Date() } = {}) {
    const where = ['c.business_id = ?'];
    const params = [businessId];
    if (partyId) { where.push('c.party_id = ?'); params.push(partyId); }
    if (q) {
        where.push('(c.title LIKE ? OR c.contract_no LIKE ? OR p.display_name LIKE ? OR p.phone LIKE ?)');
        const like = `%${q}%`;
        params.push(like, like, like, like);
    }
    const [rows] = await conn.query(`${SELECT_CONTRACT} WHERE ${where.join(' AND ')} ORDER BY c.end_date ASC, c.created_at DESC`, params);
    const shaped = rows.map((r) => shape(r, today));
    return status ? shaped.filter((c) => c.state === status) : shaped;
}

async function loadContract(conn, id, today = new Date()) {
    const [[row]] = await conn.query(`${SELECT_CONTRACT} WHERE c.id = ? LIMIT 1`, [id]);
    if (!row) return null;
    const [visitRows] = await conn.query('SELECT * FROM amc_visits WHERE contract_id = ? ORDER BY visit_date DESC, created_at DESC', [id]);
    const visits = visitRows.map((v) => ({ ...v, visit_date: ymd(v.visit_date) }));
    const chain = [];
    // The terms before this one and after it, so the history reads as a chain.
    let back = row.renewed_from_id;
    while (back && chain.length < 12) {
        const [[prev]] = await conn.query('SELECT id, contract_no, start_date, end_date, amount_paise, renewed_from_id FROM amc_contracts WHERE id = ?', [back]);
        if (!prev) break;
        chain.unshift({ ...prev, start_date: ymd(prev.start_date), end_date: ymd(prev.end_date) });
        back = prev.renewed_from_id;
    }
    return { contract: shape(row, today), visits, earlier_terms: chain };
}

// ── writing ─────────────────────────────────────────────────────────────
async function createContract(conn, { businessId, user, payload }) {
    const data = normalise(payload);
    const [[party]] = await conn.query('SELECT id FROM parties WHERE id = ? LIMIT 1', [data.party_id]);
    if (!party) throw new AmcError('No such customer', 'no_party', 400);

    const id = randomUUID();
    const contractNo = await nextContractNo(conn, businessId, data.start_date);
    await conn.query('INSERT INTO amc_contracts SET ?', [{
        id, business_id: businessId, contract_no: contractNo, created_by: user?.id || null,
        amount_paise: 0, tax_rate_bps: 0, tax_treatment: 'gst', visits_included: null, hsn_sac: '9987',
        ...data,
    }]);
    return id;
}

async function updateContract(conn, { id, payload }) {
    const [[existing]] = await conn.query('SELECT * FROM amc_contracts WHERE id = ? LIMIT 1', [id]);
    if (!existing) throw new AmcError('No such contract', 'not_found', 404);
    if (existing.status === 'cancelled') throw new AmcError('A cancelled contract cannot be edited', 'cancelled', 409);

    const data = normalise(payload, { partial: true });
    const start = data.start_date || ymd(existing.start_date);
    const end = data.end_date || ymd(existing.end_date);
    if (end < start) throw new AmcError('The contract cannot end before it starts', 'bad_dates', 400);

    // Once the term has been invoiced, the amount on the contract stops being the
    // amount that was billed. Changing it would leave the two disagreeing.
    if (existing.invoice_id && (data.amount_paise !== undefined && data.amount_paise !== Number(existing.amount_paise)
        || data.tax_rate_bps !== undefined && data.tax_rate_bps !== Number(existing.tax_rate_bps))) {
        const [[doc]] = await conn.query('SELECT status FROM sales_documents WHERE id = ?', [existing.invoice_id]);
        if (doc && doc.status !== 'cancelled') {
            throw new AmcError('This term has already been invoiced — cancel that invoice first if the amount was wrong', 'invoiced', 409);
        }
    }
    if (!Object.keys(data).length) return existing;
    await conn.query('UPDATE amc_contracts SET ? WHERE id = ?', [data, id]);
    return { ...existing, ...data };
}

async function cancelContract(conn, { id, reason }) {
    const [[existing]] = await conn.query('SELECT * FROM amc_contracts WHERE id = ? LIMIT 1', [id]);
    if (!existing) throw new AmcError('No such contract', 'not_found', 404);
    if (existing.status === 'cancelled') return existing;
    await conn.query('UPDATE amc_contracts SET status = ?, cancelled_reason = ? WHERE id = ?', ['cancelled', clean(reason, 300), id]);
    // A renewal that was built on this one loses its predecessor's link, so the
    // customer is chased again rather than being told the contract carried on.
    await conn.query('UPDATE amc_contracts SET renewed_to_id = NULL WHERE renewed_to_id = ?', [id]);
    return { ...existing, status: 'cancelled' };
}

/**
 * The invoice for one term. It is an ordinary sales invoice — one line, at the
 * contract's rate — so it ages, is chased and is paid like any other. Asking
 * twice returns the one already raised rather than billing the customer twice.
 */
async function invoiceContract(conn, { businessId, user, id, issue = true }) {
    const [[c]] = await conn.query('SELECT * FROM amc_contracts WHERE id = ? LIMIT 1', [id]);
    if (!c) throw new AmcError('No such contract', 'not_found', 404);
    if (c.status === 'cancelled') throw new AmcError('This contract is cancelled', 'cancelled', 409);
    if (!(Number(c.amount_paise) > 0)) throw new AmcError('Set the contract amount before invoicing it', 'no_amount', 400);

    if (c.invoice_id) {
        const [[doc]] = await conn.query('SELECT id, status, doc_no FROM sales_documents WHERE id = ?', [c.invoice_id]);
        if (doc && doc.status !== 'cancelled') {
            throw new AmcError(`This term is already invoiced (${doc.doc_no || 'draft'})`, 'already_invoiced', 409);
        }
    }

    const label = (d) => dayOf(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const description = `AMC — ${c.title} (${label(c.start_date)} to ${label(c.end_date)})`;

    await conn.beginTransaction();
    try {
        const docId = await sales.saveDraft(conn, {
            businessId, user,
            payload: {
                doc_type: 'invoice', party_id: c.party_id, doc_date: ymd(new Date()),
                reference: c.contract_no,
                notes: `Annual maintenance contract ${c.contract_no}${c.visits_included !== null ? ` — ${c.visits_included} free visits included` : ''}.`,
                terms: c.terms || undefined,
                lines: [{
                    description, hsn_sac: c.hsn_sac || '9987', unit: 'Job', quantity: 1,
                    rate_paise: Number(c.amount_paise), tax_rate_bps: Number(c.tax_rate_bps), tax_treatment: c.tax_treatment,
                }],
            },
        });
        if (issue) await sales.issueDocument(conn, { businessId, user, id: docId });
        await conn.query('UPDATE amc_contracts SET invoice_id = ? WHERE id = ?', [docId, id]);
        await conn.commit();
        return docId;
    } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
    }
}

/**
 * The next term. It starts the day after this one ends (or on the date given)
 * and runs the same length, at the same rate unless told otherwise, and the old
 * contract remembers it was renewed so it stops appearing in the chase list.
 */
async function renewContract(conn, { businessId, user, id, payload = {} }) {
    const [[c]] = await conn.query('SELECT * FROM amc_contracts WHERE id = ? LIMIT 1', [id]);
    if (!c) throw new AmcError('No such contract', 'not_found', 404);
    if (c.status === 'cancelled') throw new AmcError('A cancelled contract cannot be renewed', 'cancelled', 409);
    if (c.renewed_to_id) throw new AmcError('This contract has already been renewed', 'already_renewed', 409);

    const oldStart = dayOf(c.start_date);
    const oldEnd = dayOf(c.end_date);
    const start = payload.start_date ? dayOf(payload.start_date) : addDays(oldEnd, 1);
    // The same number of whole months again — a year stays a year.
    const months = Math.max(1, Math.round(daysBetween(oldStart, addDays(oldEnd, 1)) / 30.4375));
    const end = payload.end_date ? dayOf(payload.end_date) : addDays(addMonths(start, months), -1);
    if (end < start) throw new AmcError('The renewal cannot end before it starts', 'bad_dates', 400);

    const amount = payload.amount !== undefined || payload.amount_paise !== undefined
        ? paiseOf(payload.amount, payload.amount_paise) : Number(c.amount_paise);

    await conn.beginTransaction();
    try {
        const newId = randomUUID();
        const contractNo = await nextContractNo(conn, businessId, start);
        await conn.query('INSERT INTO amc_contracts SET ?', [{
            id: newId, business_id: businessId, contract_no: contractNo, party_id: c.party_id, title: c.title, site: c.site,
            equipment: c.equipment, start_date: ymd(start), end_date: ymd(end), amount_paise: amount,
            tax_rate_bps: c.tax_rate_bps, tax_treatment: c.tax_treatment, hsn_sac: c.hsn_sac,
            visits_included: payload.visits_included !== undefined
                ? (payload.visits_included === null || payload.visits_included === '' ? null : Number(payload.visits_included))
                : c.visits_included,
            notes: c.notes, terms: c.terms, renewed_from_id: c.id, created_by: user?.id || null,
        }]);
        await conn.query('UPDATE amc_contracts SET renewed_to_id = ? WHERE id = ?', [newId, id]);
        // The equipment covered by the old term is covered by the new one.
        await conn.query('UPDATE customer_devices SET amc_contract_id = ? WHERE amc_contract_id = ?', [newId, id]).catch(() => {});
        await conn.commit();
        return newId;
    } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
    }
}

// ── visits ──────────────────────────────────────────────────────────────
async function addVisit(conn, { user, contractId, payload }) {
    const [[c]] = await conn.query('SELECT * FROM amc_contracts WHERE id = ? LIMIT 1', [contractId]);
    if (!c) throw new AmcError('No such contract', 'not_found', 404);
    if (c.status === 'cancelled') throw new AmcError('This contract is cancelled', 'cancelled', 409);

    const date = ymd(payload.visit_date || new Date());
    if (!date) throw new AmcError('Give the date of the visit', 'no_date', 400);
    const kind = ['scheduled', 'complaint'].includes(payload.kind) ? payload.kind : 'scheduled';
    const ticket = clean(payload.ticket_ref, 60);

    if (ticket) {
        const [[dup]] = await conn.query('SELECT id FROM amc_visits WHERE contract_id = ? AND ticket_ref = ? LIMIT 1', [contractId, ticket]);
        if (dup) throw new AmcError(`Ticket ${ticket} is already counted as a visit on this contract`, 'duplicate_visit', 409);
    }

    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM amc_visits WHERE contract_id = ?', [contractId]);
    const chargeable = c.visits_included !== null && Number(n) >= Number(c.visits_included) ? 1 : 0;
    const id = randomUUID();
    await conn.query('INSERT INTO amc_visits SET ?', [{
        id, contract_id: contractId, visit_date: date, kind, ticket_ref: ticket, chargeable,
        note: clean(payload.note, 500), created_by: user?.id || null,
    }]);
    return { id, chargeable: !!chargeable };
}

async function removeVisit(conn, { id }) {
    const [[v]] = await conn.query('SELECT * FROM amc_visits WHERE id = ? LIMIT 1', [id]);
    if (!v) throw new AmcError('No such visit', 'not_found', 404);
    await conn.query('DELETE FROM amc_visits WHERE id = ?', [id]);
    // What was chargeable is worked out again in date order, so removing an early
    // visit gives the free one back to the later visit that was charged for it.
    const [[c]] = await conn.query('SELECT visits_included FROM amc_contracts WHERE id = ?', [v.contract_id]);
    const [rest] = await conn.query('SELECT id FROM amc_visits WHERE contract_id = ? ORDER BY visit_date, created_at', [v.contract_id]);
    for (let i = 0; i < rest.length; i += 1) {
        const charge = c.visits_included !== null && i >= Number(c.visits_included) ? 1 : 0;
        await conn.query('UPDATE amc_visits SET chargeable = ? WHERE id = ?', [charge, rest[i].id]);
    }
    return v;
}

// ── renewals ────────────────────────────────────────────────────────────
const phoneFor = (raw) => {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length === 10) return digits;
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
    return null;
};

function reminderMessage({ business, contract }) {
    const shop = business?.trade_name || business?.legal_name || 'Networking Experts';
    const end = dayOf(contract.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const money = `₹${(Number(contract.amount_paise) / 100).toLocaleString('en-IN')}`;
    const when = contract.state === 'expired'
        ? `expired on ${end}`
        : contract.days_left === 0 ? `ends today (${end})` : `ends on ${end} (${contract.days_left} days from now)`;
    return `Hello ${contract.party_name || ''}, your annual maintenance contract ${contract.contract_no} with ${shop} for "${contract.title}" ${when}. `
        + `To keep your cameras covered, renew it for ${money}${Number(contract.tax_rate_bps) ? ' + GST' : ''}. Reply here or call us and we will take care of it. Thank you.`;
}

/** Contracts that need a call: running out soon, or already out and not renewed. */
async function renewalsDue(conn, businessId, { withinDays = 45, today = new Date() } = {}) {
    const [[business]] = await conn.query('SELECT legal_name, trade_name FROM businesses WHERE id = ? LIMIT 1', [businessId]);
    const all = await listContracts(conn, businessId, { today });
    return all
        .filter((c) => NEEDS_CHASING.has(c.state) && !c.renewed_to_id
            && (c.state === 'expired' ? c.days_overdue <= 180 : c.days_left <= withinDays))
        .map((c) => {
            const phone = phoneFor(c.party_phone);
            const message = reminderMessage({ business, contract: c });
            return {
                ...c, message,
                whatsapp_url: phone ? `https://wa.me/91${phone}?text=${encodeURIComponent(message)}` : null,
                urgency: c.state === 'expired' ? 'expired' : c.days_left <= 7 ? 'week' : c.days_left <= 15 ? 'fortnight' : 'month',
            };
        })
        .sort((a, b) => (a.state === 'expired' ? -a.days_overdue : a.days_left) - (b.state === 'expired' ? -b.days_overdue : b.days_left));
}

async function markReminded(conn, { id }) {
    await conn.query('UPDATE amc_contracts SET last_reminded_at = NOW(), reminders_sent = reminders_sent + 1 WHERE id = ?', [id]);
}

/**
 * The steadiest number in the business: what running contracts bring in a year,
 * what is about to lapse, and what has lapsed without being renewed.
 */
function summarise(contracts) {
    const running = contracts.filter((c) => c.state === 'active');
    const lapsing = running.filter((c) => c.days_left <= 30);
    const lapsed = contracts.filter((c) => c.state === 'expired' && c.days_overdue <= 180);
    return {
        running: running.length,
        running_value_paise: running.reduce((n, c) => n + c.amount_paise, 0),
        lapsing_30: lapsing.length,
        lapsing_30_value_paise: lapsing.reduce((n, c) => n + c.amount_paise, 0),
        lapsed: lapsed.length,
        lapsed_value_paise: lapsed.reduce((n, c) => n + c.amount_paise, 0),
        not_invoiced: running.filter((c) => !c.has_invoice).length,
        unpaid_paise: running.reduce((n, c) => n + (c.invoice_due_paise || 0), 0),
    };
}

module.exports = {
    AmcError, ensureAmcSchema, stateOf, shape, summarise,
    listContracts, loadContract, createContract, updateContract, cancelContract,
    invoiceContract, renewContract, addVisit, removeVisit, renewalsDue, markReminded, reminderMessage, phoneFor,
};
