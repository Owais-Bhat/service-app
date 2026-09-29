'use strict';

// Sales documents and the money against them.
//
// The rules this file exists to hold:
//   * A draft is editable and posts nothing. An issued document is a record —
//     it takes its number, snapshots the customer and the items, and posts to
//     the ledger in the same transaction.
//   * An issued document is never edited or deleted. It is cancelled, which
//     reverses its journal and says why.
//   * Payment status is derived from allocations, never set by hand.
//   * An estimate converts into an invoice once. A second attempt returns the
//     invoice that already exists rather than making another.

const { randomUUID } = require('crypto');
const money = require('../money.cjs');
const { computeDocument } = require('../tax-engine.cjs');
const posting = require('../ledger/posting.cjs');

class SalesError extends Error {
    constructor(message, code = 'sales_error', status = 422) {
        super(message);
        this.name = 'SalesError';
        this.code = code;
        this.status = status;
    }
}

// `rate: "2000"` means rupees; `rate_paise: 200000` means paise. Both spellings
// are accepted from the client, and exactly one conversion happens.
const paiseOf = (rupees, paise) => (
    paise === undefined || paise === null
        ? money.toPaise(rupees ?? 0)
        : money.assertPaise(Math.round(Number(paise)))
);

const ymd = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime())) throw new SalesError('Invalid date', 'bad_date', 400);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const DOC_TYPES = new Set(['estimate', 'proforma', 'invoice', 'credit_note']);
// Which documents are a financial event and which are a piece of paper. A
// quotation or a proforma must not touch the books simply because it was
// printed.
const POSTS_TO_LEDGER = new Set(['invoice', 'credit_note']);

const parseJson = (v) => {
    if (!v) return null;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { return null; }
};

// ── reading ─────────────────────────────────────────────────────────────
async function loadDocument(conn, id) {
    const [[doc]] = await conn.query(
        `SELECT d.*, p.display_name AS party_name, p.phone AS party_phone, p.gstin AS party_gstin
           FROM sales_documents d
           LEFT JOIN parties p ON p.id = d.party_id
          WHERE d.id = ? LIMIT 1`,
        [id]
    );
    if (!doc) return null;

    const [lines] = await conn.query(
        'SELECT * FROM sales_document_lines WHERE document_id = ? ORDER BY line_no', [id]
    );
    const [allocations] = await conn.query(
        `SELECT a.*, pay.payment_no, pay.payment_date, pay.method, pay.reference, pay.status
           FROM payment_allocations a
           JOIN payments pay ON pay.id = a.payment_id
          WHERE a.document_id = ? AND pay.status = 'posted'
          ORDER BY pay.payment_date`,
        [id]
    );

    const paid = allocations.reduce((sum, a) => sum + Number(a.amount_paise), 0);
    return {
        document: { ...doc, party_snapshot: parseJson(doc.party_snapshot) },
        lines: lines.map((l) => ({ ...l, item_snapshot: parseJson(l.item_snapshot) })),
        allocations,
        paid_paise: paid,
        balance_paise: Number(doc.total_paise) - paid,
        payment_status: paymentStatusOf(doc, paid),
    };
}

// Derived, never stored: a document is paid because payments add up to it, not
// because somebody ticked a box.
function paymentStatusOf(doc, paidPaise) {
    if (doc.status === 'cancelled') return 'cancelled';
    if (doc.status === 'draft') return 'draft';
    if (!POSTS_TO_LEDGER.has(doc.doc_type)) return 'n/a';
    const total = Number(doc.total_paise);
    if (total === 0) return 'paid';
    if (paidPaise <= 0) {
        const overdue = doc.due_date && ymd(doc.due_date) < ymd(new Date());
        return overdue ? 'overdue' : 'unpaid';
    }
    if (paidPaise >= total) return 'paid';
    return 'part_paid';
}

// ── writing a draft ─────────────────────────────────────────────────────
// Everything a document says about money is recomputed here from its lines.
// Nothing the client sends as a total is trusted.
async function priceDocument(conn, businessId, payload) {
    const [[biz]] = await conn.query('SELECT state_code, setup_complete FROM businesses WHERE id = ? LIMIT 1', [businessId]);
    if (!biz?.state_code) {
        throw new SalesError('Set the business state in Business & Tax Setup first — it decides CGST/SGST versus IGST', 'no_state', 400);
    }

    let placeOfSupply = payload.place_of_supply_state_code || null;
    if (!placeOfSupply && payload.party_id) {
        const [[party]] = await conn.query(
            'SELECT place_of_supply_state_code FROM parties WHERE id = ? LIMIT 1', [payload.party_id]
        );
        placeOfSupply = party?.place_of_supply_state_code || null;
    }

    const lines = (payload.lines || [])
        .filter((l) => String(l.description || '').trim() || l.item_id)
        .map((l) => ({
            item_id: l.item_id || null,
            description: String(l.description || '').trim().slice(0, 500),
            hsn_sac: l.hsn_sac || null,
            unit: l.unit || null,
            quantity: Number(l.quantity) || 0,
            rate_paise: paiseOf(l.rate, l.rate_paise),
            cost_rate_paise: l.cost_rate === undefined && l.cost_rate_paise === undefined
                ? null : paiseOf(l.cost_rate, l.cost_rate_paise),
            discount_bps: Number(l.discount_bps) || 0,
            tax_rate_bps: Number(l.tax_rate_bps) || 0,
            tax_treatment: l.tax_treatment || 'gst',
        }));

    if (!lines.length) throw new SalesError('A document needs at least one line', 'no_lines', 400);

    const charges = (payload.charges || [])
        .filter((c) => Number(c.amount ?? c.amount_paise))
        .map((c) => ({
            label: String(c.label || 'Charge').slice(0, 120),
            amount_paise: paiseOf(c.amount, c.amount_paise),
            tax_rate_bps: Number(c.tax_rate_bps) || 0,
            tax_treatment: c.tax_treatment || 'gst',
        }));

    const priced = computeDocument({
        lines,
        charges,
        prices_include_tax: !!payload.prices_include_tax,
        doc_discount_paise: paiseOf(payload.doc_discount, payload.doc_discount_paise),
        doc_discount_bps: Number(payload.doc_discount_bps) || 0,
        supplier_state_code: biz.state_code,
        place_of_supply_state_code: placeOfSupply || biz.state_code,
        round_to_rupee: payload.round_to_rupee !== false,
    });

    return { priced, placeOfSupply: placeOfSupply || biz.state_code };
}

async function saveDraft(conn, { businessId, user, payload, existingId = null, revising = false }) {
    const docType = payload.doc_type || 'invoice';
    if (!DOC_TYPES.has(docType)) throw new SalesError('Unknown document type', 'bad_type', 400);

    let existing = null;
    if (existingId) {
        [[existing]] = await conn.query('SELECT status, doc_type, source_type, source_id FROM sales_documents WHERE id = ? LIMIT 1', [existingId]);
        if (!existing) throw new SalesError('No such document', 'not_found', 404);
        // A quotation moves no money, so an issued one may be revised; anything
        // that posted to the books may not.
        const revisable = revising && existing.doc_type === 'estimate' && REVISABLE.has(existing.status);
        if (existing.status !== 'draft' && !revisable) {
            throw new SalesError('An issued document cannot be edited — cancel it and raise a new one', 'not_draft');
        }
    }

    const { priced, placeOfSupply } = await priceDocument(conn, businessId, payload);
    const t = priced.totals;
    const id = existingId || randomUUID();

    const row = {
        business_id: businessId,
        doc_type: docType,
        doc_date: ymd(payload.doc_date || new Date()),
        due_date: payload.due_date ? ymd(payload.due_date) : null,
        valid_until: payload.valid_until ? ymd(payload.valid_until) : null,
        party_id: payload.party_id || null,
        place_of_supply_state_code: placeOfSupply,
        supply_type: priced.supply_type,
        prices_include_tax: payload.prices_include_tax ? 1 : 0,
        // A document keeps the job it came from unless the caller says otherwise.
        source_type: payload.source_type || existing?.source_type || null,
        source_id: payload.source_id || existing?.source_id || null,
        gross_paise: t.gross_paise,
        line_discount_paise: t.line_discount_paise,
        doc_discount_paise: t.doc_discount_paise,
        charges_paise: t.charges_paise,
        taxable_paise: t.taxable_paise,
        cgst_paise: t.cgst_paise,
        sgst_paise: t.sgst_paise,
        utgst_paise: t.utgst_paise,
        igst_paise: t.igst_paise,
        round_off_paise: t.round_off_paise,
        total_paise: t.total_paise,
        cost_paise: priced.lines.reduce((sum, l) => sum + Math.round((Number(l.cost_rate_paise) || 0) * (l.quantity || 0)), 0),
        notes: payload.notes || null,
        terms: payload.terms || null,
        reference: payload.reference || null,
    };

    if (existingId) {
        await conn.query('UPDATE sales_documents SET ? WHERE id = ?', [row, id]);
        await conn.query('DELETE FROM sales_document_lines WHERE document_id = ?', [id]);
    } else {
        await conn.query('INSERT INTO sales_documents SET ?', [{
            id, ...row, status: 'draft', created_by: user?.id || null,
            idempotency_key: payload.idempotency_key || null,
        }]);
    }

    let lineNo = 0;
    for (const l of priced.lines) {
        lineNo += 1;
        await conn.query('INSERT INTO sales_document_lines SET ?', [{
            id: randomUUID(), document_id: id, line_no: lineNo, kind: 'item',
            item_id: l.item_id || null, description: l.description, hsn_sac: l.hsn_sac || null,
            quantity: l.quantity, unit: l.unit || null, rate_paise: l.rate_paise,
            cost_rate_paise: l.cost_rate_paise, discount_bps: l.discount_bps || 0,
            line_discount_paise: l.line_discount_paise, doc_discount_share_paise: l.doc_discount_share_paise,
            tax_treatment: l.tax_treatment, tax_rate_bps: l.tax_rate_bps,
            taxable_paise: l.taxable_paise, cgst_paise: l.cgst_paise, sgst_paise: l.sgst_paise,
            utgst_paise: l.utgst_paise, igst_paise: l.igst_paise, amount_paise: l.amount_paise,
        }]);
    }
    for (const c of priced.charges) {
        lineNo += 1;
        await conn.query('INSERT INTO sales_document_lines SET ?', [{
            id: randomUUID(), document_id: id, line_no: lineNo, kind: 'charge',
            description: c.label, quantity: 1, rate_paise: c.taxable_paise,
            tax_treatment: c.tax_treatment, tax_rate_bps: c.tax_rate_bps,
            taxable_paise: c.taxable_paise, cgst_paise: c.cgst_paise, sgst_paise: c.sgst_paise,
            utgst_paise: c.utgst_paise, igst_paise: c.igst_paise, amount_paise: c.amount_paise,
        }]);
    }

    return id;
}

// ── issuing ─────────────────────────────────────────────────────────────
// The moment a document stops being editable: it takes its number, freezes what
// it says about the customer and the goods, and — if it is an invoice or a
// credit note — posts to the ledger in the same transaction.
async function issueDocument(conn, { businessId, user, id }) {
    const loaded = await loadDocument(conn, id);
    if (!loaded) throw new SalesError('No such document', 'not_found', 404);
    const doc = loaded.document;
    if (doc.status !== 'draft') throw new SalesError('This document has already been issued', 'already_issued');
    if (!doc.party_id) throw new SalesError('Choose the customer before issuing', 'no_party', 400);
    if (!loaded.lines.length) throw new SalesError('A document needs at least one line', 'no_lines', 400);

    const [[biz]] = await conn.query('SELECT * FROM businesses WHERE id = ? LIMIT 1', [businessId]);
    if (POSTS_TO_LEDGER.has(doc.doc_type)) {
        if (!biz.setup_complete) {
            throw new SalesError(
                'Confirm the business details in Business & Tax Setup before issuing a tax document',
                'business_not_confirmed', 400
            );
        }
        if (biz.registration_type === 'regular' && !biz.gstin) {
            throw new SalesError('A GST-registered business needs its GSTIN on file before issuing', 'no_gstin', 400);
        }
    }

    const { snapshot, party } = await freezeDocument(conn, loaded);

    const docNo = await posting.allocateNumber(conn, businessId, doc.doc_type, doc.doc_date);
    const dueDate = doc.due_date
        || (party.credit_days ? addDays(doc.doc_date, Number(party.credit_days)) : null);

    let journalId = null;
    if (POSTS_TO_LEDGER.has(doc.doc_type)) {
        const journal = await postDocumentJournal(conn, { businessId, user, doc, lines: loaded.lines, docNo });
        journalId = journal.id;
    }

    await conn.query(
        `UPDATE sales_documents
            SET doc_no = ?, status = 'issued', issued_at = NOW(), issued_by = ?, journal_id = ?,
                party_snapshot = ?, due_date = ?
          WHERE id = ?`,
        [docNo, user?.id || null, journalId, JSON.stringify(snapshot), dueDate, id]
    );

    return loadDocument(conn, id);
}

// What a document says about the customer and the goods, captured at the moment
// it leaves draft. Editing the customer or the item tomorrow changes nothing
// on a document that has already been issued — except a quotation the owner
// chooses to revise, which is frozen again.
async function freezeDocument(conn, loaded) {
    const doc = loaded.document;
    const [[party]] = await conn.query('SELECT * FROM parties WHERE id = ? LIMIT 1', [doc.party_id]);
    const [addresses] = await conn.query(
        'SELECT * FROM party_addresses WHERE party_id = ? ORDER BY is_default DESC', [doc.party_id]
    );
    const billing = addresses.find((a) => a.kind === 'billing') || addresses[0] || null;

    const snapshot = {
        display_name: party.display_name,
        legal_name: party.legal_name,
        phone: party.phone,
        email: party.email,
        gstin: party.gstin,
        gst_treatment: party.gst_treatment,
        place_of_supply_state_code: doc.place_of_supply_state_code,
        address: billing ? {
            line1: billing.line1, line2: billing.line2, city: billing.city,
            state_name: billing.state_name, pincode: billing.pincode,
        } : null,
        credit_days: party.credit_days,
    };

    for (const line of loaded.lines) {
        if (!line.item_id) continue;
        const [[item]] = await conn.query('SELECT * FROM inventory_items WHERE id = ? LIMIT 1', [line.item_id]);
        if (!item) continue;
        await conn.query('UPDATE sales_document_lines SET item_snapshot = ?, hsn_sac = COALESCE(hsn_sac, ?), unit = COALESCE(unit, ?) WHERE id = ?', [
            JSON.stringify({ name: item.name, sku: item.sku, hsn_sac: item.hsn_sac, unit: item.unit, brand: item.brand, model: item.model }),
            item.hsn_sac || null, item.unit || null, line.id,
        ]);
    }
    return { snapshot, party };
}

// ── revising a quotation ────────────────────────────────────────────────
// It keeps its number and says which revision it is. If the customer had
// accepted the old version, it goes back to "sent": they agreed to something
// that no longer exists.
const REVISABLE = new Set(['issued', 'accepted', 'rejected', 'expired']);

async function reviseEstimate(conn, { businessId, user, id, payload }) {
    const [[cur]] = await conn.query('SELECT status, doc_type, converted_to_id FROM sales_documents WHERE id = ? LIMIT 1', [id]);
    if (!cur) throw new SalesError('No such document', 'not_found', 404);
    if (cur.doc_type !== 'estimate') {
        throw new SalesError('Only a quotation can be revised — an invoice is cancelled and raised again', 'not_estimate');
    }
    if (cur.converted_to_id || cur.status === 'converted') {
        throw new SalesError('This quotation has already become an invoice — change or cancel that instead', 'converted');
    }
    if (!REVISABLE.has(cur.status)) {
        throw new SalesError(cur.status === 'draft' ? 'A draft is edited, not revised' : 'This quotation cannot be revised', 'not_revisable');
    }

    const before = await loadDocument(conn, id);
    await saveDraft(conn, { businessId, user, payload: { ...payload, doc_type: 'estimate' }, existingId: id, revising: true });

    const loaded = await loadDocument(conn, id);
    if (!loaded.document.party_id) throw new SalesError('Choose the customer', 'no_party', 400);
    if (!loaded.lines.length) throw new SalesError('A quotation needs at least one line', 'no_lines', 400);

    const { snapshot } = await freezeDocument(conn, loaded);
    await conn.query(
        `UPDATE sales_documents
            SET revision_no = COALESCE(revision_no, 0) + 1, status = 'issued',
                accepted_at = NULL, acceptance_method = NULL, acceptance_note = NULL, party_snapshot = ?
          WHERE id = ?`,
        [JSON.stringify(snapshot), id]
    );
    return { before: before.document, after: (await loadDocument(conn, id)).document };
}

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return ymd(d);
}

// The accounting behind a sale. An invoice debits the customer and credits
// income and the tax the business now owes; a credit note does the same in
// reverse. Which income account depends on what was sold, so services and goods
// can be told apart in a P&L.
async function postDocumentJournal(conn, { businessId, user, doc, lines, docNo }) {
    const isCredit = doc.doc_type === 'credit_note';
    const sign = isCredit ? -1 : 1;

    const ar = await posting.accountByCode(conn, businessId, '1100');
    const roundOff = await posting.accountByCode(conn, businessId, '4910');
    const salesGoods = await posting.accountByCode(conn, businessId, '4000');
    const salesServices = await posting.accountByCode(conn, businessId, '4010');
    const salesLabour = await posting.accountByCode(conn, businessId, '4020');

    const taxAccounts = {
        cgst: await posting.accountByCode(conn, businessId, '2100'),
        sgst: await posting.accountByCode(conn, businessId, '2110'),
        utgst: await posting.accountByCode(conn, businessId, '2110'),
        igst: await posting.accountByCode(conn, businessId, '2120'),
    };

    // Income, grouped by where it came from.
    const income = new Map();
    for (const line of lines) {
        let account = salesGoods.id;
        if (line.kind === 'charge') account = salesLabour.id;
        else if (!line.item_id) account = salesServices.id;
        income.set(account, (income.get(account) || 0) + Number(line.taxable_paise));
    }

    const entries = [];
    const total = Number(doc.total_paise);
    const debit = (accountId, amount, extra = {}) => {
        if (!amount) return;
        entries.push(amount > 0
            ? { account_id: accountId, debit_paise: amount, ...extra }
            : { account_id: accountId, credit_paise: -amount, ...extra });
    };
    const credit = (accountId, amount, extra = {}) => debit(accountId, -amount, extra);

    debit(ar.id, sign * total, { party_id: doc.party_id, memo: `${doc.doc_type === 'credit_note' ? 'Credit note' : 'Invoice'} ${docNo}` });
    for (const [accountId, amount] of income) credit(accountId, sign * amount);
    for (const [component, account] of Object.entries(taxAccounts)) {
        const amount = Number(doc[`${component}_paise`] || 0);
        if (amount) credit(account.id, sign * amount, { memo: component.toUpperCase() });
    }
    const rounding = Number(doc.round_off_paise || 0);
    if (rounding) credit(roundOff.id, sign * rounding, { memo: 'Rounding' });

    return posting.postJournal(conn, {
        businessId,
        date: doc.doc_date,
        narration: `${isCredit ? 'Credit note' : 'Invoice'} ${docNo}`,
        sourceType: isCredit ? 'credit_note' : 'invoice',
        sourceId: doc.id,
        lines: entries,
        idempotencyKey: `${doc.doc_type}:${doc.id}`,
        postedBy: user?.id || null,
    });
}

// ── cancelling ──────────────────────────────────────────────────────────
// A posted document is not deleted. Cancelling reverses its journal, keeps both
// entries visible and records who did it and why.
async function cancelDocument(conn, { user, id, reason }) {
    if (!reason) throw new SalesError('A cancellation needs a reason', 'no_reason', 400);
    const loaded = await loadDocument(conn, id);
    if (!loaded) throw new SalesError('No such document', 'not_found', 404);
    const doc = loaded.document;
    if (doc.status === 'cancelled') throw new SalesError('Already cancelled', 'already_cancelled');
    if (doc.status === 'draft') throw new SalesError('A draft is deleted, not cancelled', 'is_draft', 400);
    if (loaded.paid_paise > 0) {
        throw new SalesError(
            'Money has been received against this document. Remove the payment allocation first, or raise a credit note instead.',
            'has_payments'
        );
    }

    if (doc.journal_id) {
        await posting.reverseJournal(conn, {
            journalId: doc.journal_id, date: new Date(), reason, postedBy: user?.id || null,
        });
    }
    await conn.query(
        `UPDATE sales_documents SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = ?, cancel_reason = ? WHERE id = ?`,
        [user?.id || null, String(reason).slice(0, 500), id]
    );
    return loadDocument(conn, id);
}

// ── converting ──────────────────────────────────────────────────────────
// An accepted estimate becomes an invoice once. Asking twice hands back the
// invoice that already exists — the guard against a customer being billed
// twice for the same quotation.
async function convertDocument(conn, { businessId, user, id, toType = 'invoice' }) {
    const loaded = await loadDocument(conn, id);
    if (!loaded) throw new SalesError('No such document', 'not_found', 404);
    const source = loaded.document;

    if (source.converted_to_id) {
        const existing = await loadDocument(conn, source.converted_to_id);
        if (existing) return { ...existing, reused: true };
    }
    if (source.doc_type === toType) throw new SalesError('That is already the same kind of document', 'same_type', 400);
    if (source.status === 'cancelled') throw new SalesError('A cancelled document cannot be converted', 'cancelled', 400);

    const payload = {
        doc_type: toType,
        doc_date: new Date(),
        party_id: source.party_id,
        place_of_supply_state_code: source.place_of_supply_state_code,
        prices_include_tax: !!source.prices_include_tax,
        source_type: source.source_type,
        source_id: source.source_id,
        notes: source.notes,
        terms: source.terms,
        reference: source.reference,
        doc_discount: Number(source.doc_discount_paise) / 100,
        lines: loaded.lines.filter((l) => l.kind === 'item').map((l) => ({
            item_id: l.item_id,
            description: l.description,
            hsn_sac: l.hsn_sac,
            unit: l.unit,
            quantity: Number(l.quantity),
            rate_paise: Number(l.rate_paise),
            cost_rate_paise: l.cost_rate_paise === null ? undefined : Number(l.cost_rate_paise),
            discount_bps: Number(l.discount_bps),
            tax_rate_bps: Number(l.tax_rate_bps),
            tax_treatment: l.tax_treatment,
        })),
        charges: loaded.lines.filter((l) => l.kind === 'charge').map((l) => ({
            label: l.description,
            amount_paise: Number(l.taxable_paise),
            tax_rate_bps: Number(l.tax_rate_bps),
            tax_treatment: l.tax_treatment,
        })),
    };

    const newId = await saveDraft(conn, { businessId, user, payload });
    await conn.query('UPDATE sales_documents SET converted_from_id = ? WHERE id = ?', [source.id, newId]);
    await conn.query(
        `UPDATE sales_documents SET converted_to_id = ?, converted_at = NOW(),
            status = CASE WHEN status = 'issued' THEN 'converted' ELSE status END
          WHERE id = ?`,
        [newId, source.id]
    );

    return { ...(await loadDocument(conn, newId)), reused: false };
}

// ── money ───────────────────────────────────────────────────────────────
// A receipt is its own record. What it is put against is a separate decision,
// and whatever is left over stays visible as an advance instead of being lost
// inside a customer's total.
async function recordPayment(conn, { businessId, user, payload }) {
    const amount = paiseOf(payload.amount, payload.amount_paise);
    if (amount <= 0) throw new SalesError('A payment needs an amount', 'no_amount', 400);
    if (!payload.party_id) throw new SalesError('Which customer paid?', 'no_party', 400);

    const direction = payload.direction === 'out' ? 'out' : 'in';
    const method = payload.method || 'cash';
    const date = ymd(payload.payment_date || new Date());

    // Where the money landed. Cash and bank are different accounts and the
    // difference matters at the end of the day.
    const accountCode = payload.account_code || (method === 'cash' ? '1000' : '1010');
    const account = payload.account_id
        ? (await conn.query('SELECT * FROM accounts WHERE id = ? LIMIT 1', [payload.account_id]))[0][0]
        : await posting.accountByCode(conn, businessId, accountCode);
    if (!account) throw new SalesError('No account to receive this payment', 'no_account', 400);

    const requested = (payload.allocations || [])
        .map((a) => ({ document_id: a.document_id, amount_paise: paiseOf(a.amount, a.amount_paise) }))
        .filter((a) => a.document_id && a.amount_paise > 0);

    const allocatedTotal = requested.reduce((sum, a) => sum + a.amount_paise, 0);
    if (allocatedTotal > amount) throw new SalesError('The allocations come to more than the payment', 'over_allocated');

    for (const alloc of requested) {
        const target = await loadDocument(conn, alloc.document_id);
        if (!target) throw new SalesError('One of the documents does not exist', 'not_found', 404);
        if (target.document.status !== 'issued') throw new SalesError('Only an issued document can take a payment', 'not_issued');
        if (alloc.amount_paise > target.balance_paise) {
            throw new SalesError(
                `${target.document.doc_no} only has ${money.formatINR(target.balance_paise)} outstanding`,
                'over_paid'
            );
        }
    }

    const paymentNo = await posting.allocateNumber(conn, businessId, direction === 'in' ? 'receipt' : 'payment', date);
    const paymentId = randomUUID();

    const ar = await posting.accountByCode(conn, businessId, '1100');
    const advances = await posting.accountByCode(conn, businessId, '2200');
    const unallocated = amount - allocatedTotal;

    const lines = [];
    if (direction === 'in') {
        lines.push({ account_id: account.id, debit_paise: amount, memo: `${method} — ${paymentNo}` });
        if (allocatedTotal) lines.push({ account_id: ar.id, credit_paise: allocatedTotal, party_id: payload.party_id, memo: 'Against invoices' });
        if (unallocated) lines.push({ account_id: advances.id, credit_paise: unallocated, party_id: payload.party_id, memo: 'Advance — not yet allocated' });
    } else {
        const payable = await posting.accountByCode(conn, businessId, '2000');
        lines.push({ account_id: payable.id, debit_paise: amount, party_id: payload.party_id, memo: `${method} — ${paymentNo}` });
        lines.push({ account_id: account.id, credit_paise: amount, memo: 'Paid out' });
    }

    const journal = await posting.postJournal(conn, {
        businessId,
        date,
        narration: `${direction === 'in' ? 'Receipt' : 'Payment'} ${paymentNo}`,
        sourceType: 'payment',
        sourceId: paymentId,
        lines,
        idempotencyKey: payload.idempotency_key ? `payment:${payload.idempotency_key}` : null,
        postedBy: user?.id || null,
    });

    await conn.query('INSERT INTO payments SET ?', [{
        id: paymentId, business_id: businessId, payment_no: paymentNo, payment_date: date,
        direction, party_id: payload.party_id, method, account_id: account.id,
        amount_paise: amount, reference: payload.reference || null, notes: payload.notes || null,
        attachment_url: payload.attachment_url || null, status: 'posted', journal_id: journal.id,
        idempotency_key: payload.idempotency_key || null, created_by: user?.id || null,
    }]);

    for (const alloc of requested) {
        await conn.query('INSERT INTO payment_allocations SET ?', [{
            id: randomUUID(), payment_id: paymentId, document_id: alloc.document_id,
            amount_paise: alloc.amount_paise, created_by: user?.id || null,
        }]);
    }

    return loadPayment(conn, paymentId);
}

// Putting an advance against an invoice later moves it from advances to the
// customer's account — no new money, so no cash or bank line.
async function allocatePayment(conn, { businessId, user, paymentId, allocations = [] }) {
    const payment = await loadPayment(conn, paymentId);
    if (!payment) throw new SalesError('No such payment', 'not_found', 404);
    if (payment.payment.status !== 'posted') throw new SalesError('That payment was cancelled', 'cancelled');

    const requested = allocations
        .map((a) => ({ document_id: a.document_id, amount_paise: paiseOf(a.amount, a.amount_paise) }))
        .filter((a) => a.document_id && a.amount_paise > 0);
    const total = requested.reduce((sum, a) => sum + a.amount_paise, 0);
    if (!total) throw new SalesError('Nothing to allocate', 'no_allocation', 400);
    if (total > payment.unallocated_paise) {
        throw new SalesError(`Only ${money.formatINR(payment.unallocated_paise)} of this payment is unallocated`, 'over_allocated');
    }

    for (const alloc of requested) {
        const target = await loadDocument(conn, alloc.document_id);
        if (!target) throw new SalesError('One of the documents does not exist', 'not_found', 404);
        if (alloc.amount_paise > target.balance_paise) {
            throw new SalesError(`${target.document.doc_no} only has ${money.formatINR(target.balance_paise)} outstanding`, 'over_paid');
        }
    }

    const ar = await posting.accountByCode(conn, businessId, '1100');
    const advances = await posting.accountByCode(conn, businessId, '2200');

    const journal = await posting.postJournal(conn, {
        businessId,
        date: new Date(),
        narration: `Advance applied — ${payment.payment.payment_no}`,
        sourceType: 'payment',
        sourceId: payment.payment.id,
        lines: [
            { account_id: advances.id, debit_paise: total, party_id: payment.payment.party_id, memo: 'Advance applied' },
            { account_id: ar.id, credit_paise: total, party_id: payment.payment.party_id, memo: 'Against invoices' },
        ],
        postedBy: user?.id || null,
    });

    for (const alloc of requested) {
        await conn.query('INSERT INTO payment_allocations SET ?', [{
            id: randomUUID(), payment_id: payment.payment.id, document_id: alloc.document_id,
            amount_paise: alloc.amount_paise, journal_id: journal.id, created_by: user?.id || null,
        }]);
    }

    return loadPayment(conn, payment.payment.id);
}

async function loadPayment(conn, id) {
    const [[payment]] = await conn.query(
        `SELECT p.*, pt.display_name AS party_name, a.name AS account_name
           FROM payments p
           LEFT JOIN parties pt ON pt.id = p.party_id
           LEFT JOIN accounts a ON a.id = p.account_id
          WHERE p.id = ? LIMIT 1`, [id]
    );
    if (!payment) return null;
    const [allocations] = await conn.query(
        `SELECT al.*, d.doc_no, d.doc_type, d.doc_date, d.total_paise
           FROM payment_allocations al
           JOIN sales_documents d ON d.id = al.document_id
          WHERE al.payment_id = ?`, [id]
    );
    const allocated = allocations.reduce((sum, a) => sum + Number(a.amount_paise), 0);
    return {
        payment,
        allocations,
        allocated_paise: allocated,
        unallocated_paise: Number(payment.amount_paise) - allocated,
    };
}

module.exports = {
    SalesError,
    loadDocument,
    loadPayment,
    saveDraft,
    issueDocument,
    cancelDocument,
    convertDocument,
    recordPayment,
    allocatePayment,
    paymentStatusOf,
    priceDocument,
    POSTS_TO_LEDGER,
    reviseEstimate,
};
