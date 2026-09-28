'use strict';

// Buying: order, receive, be billed, send back.
//
// The four documents are deliberately separate events, because they happen at
// different times and mean different things:
//
//   purchase order   — we have asked for goods. Nothing has moved, nothing is
//                      owed, nothing posts.
//   goods receipt    — the goods are on the shelf. Stock goes up and the value
//                      sits in Goods Received Not Billed, because we owe for
//                      them but have no invoice yet.
//   supplier bill    — the invoice arrived. It clears Goods Received Not Billed
//                      and creates the payable, with input tax claimed
//                      separately. **It does not touch stock** — the goods were
//                      already received. This is what stops one delivery being
//                      counted twice.
//   purchase return  — goods go back. Stock down, payable down.
//
// A bill entered without a receipt (a direct purchase, or a service) posts
// straight to inventory or expense instead, and says so.

const { randomUUID } = require('crypto');
const money = require('../money.cjs');
const { computeDocument } = require('../tax-engine.cjs');
const posting = require('../ledger/posting.cjs');
const stock = require('./engine.cjs');

class PurchaseError extends Error {
    constructor(message, code = 'purchase_error', status = 422) {
        super(message);
        this.name = 'PurchaseError';
        this.code = code;
        this.status = status;
    }
}

const DOC_TYPES = new Set(['purchase_order', 'goods_receipt', 'supplier_bill', 'purchase_return']);
const MOVES_STOCK = new Set(['goods_receipt', 'purchase_return']);
const POSTS_TO_LEDGER = new Set(['goods_receipt', 'supplier_bill', 'purchase_return']);

const ymd = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime())) throw new PurchaseError('Invalid date', 'bad_date', 400);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const paiseOf = (rupees, paise) => (
    paise === undefined || paise === null ? money.toPaise(rupees ?? 0) : money.assertPaise(Math.round(Number(paise)))
);

const parseJson = (v) => {
    if (!v) return null;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { return null; }
};

// ── reading ─────────────────────────────────────────────────────────────
async function loadPurchase(conn, id) {
    const [[doc]] = await conn.query(
        `SELECT d.*, p.display_name AS party_name, p.phone AS party_phone, p.gstin AS party_gstin,
                l.name AS location_name
           FROM purchase_documents d
           LEFT JOIN parties p ON p.id = d.party_id
           LEFT JOIN stock_locations l ON l.id = d.location_id
          WHERE d.id = ? LIMIT 1`, [id]
    );
    if (!doc) return null;

    const [lines] = await conn.query(
        'SELECT * FROM purchase_document_lines WHERE document_id = ? ORDER BY line_no', [id]
    );
    const [allocations] = await conn.query(
        `SELECT a.*, pay.payment_no, pay.payment_date, pay.method, pay.reference
           FROM purchase_allocations a
           JOIN payments pay ON pay.id = a.payment_id AND pay.status = 'posted'
          WHERE a.document_id = ?`, [id]
    );
    const paid = allocations.reduce((sum, a) => sum + Number(a.amount_paise), 0);

    return {
        document: { ...doc, party_snapshot: parseJson(doc.party_snapshot) },
        lines: lines.map((l) => ({ ...l, item_snapshot: parseJson(l.item_snapshot), serial_numbers: parseJson(l.serial_numbers) })),
        allocations,
        paid_paise: paid,
        balance_paise: Number(doc.total_paise) - paid,
        payment_status: doc.status === 'cancelled' ? 'cancelled'
            : doc.doc_type !== 'supplier_bill' ? 'n/a'
                : paid <= 0 ? 'unpaid' : paid >= Number(doc.total_paise) ? 'paid' : 'part_paid',
    };
}

// ── drafting ────────────────────────────────────────────────────────────
async function priceePurchase(conn, businessId, payload) {
    const [[biz]] = await conn.query('SELECT state_code FROM businesses WHERE id = ? LIMIT 1', [businessId]);
    if (!biz?.state_code) {
        throw new PurchaseError('Set the business state in Business & Tax Setup first', 'no_state', 400);
    }

    // On a purchase the place of supply is where we are; the supplier's state
    // decides whether their tax reaches us as IGST or as CGST + SGST.
    let supplierState = payload.supplier_state_code || null;
    if (!supplierState && payload.party_id) {
        const [[party]] = await conn.query(
            'SELECT place_of_supply_state_code FROM parties WHERE id = ? LIMIT 1', [payload.party_id]
        );
        supplierState = party?.place_of_supply_state_code || null;
    }

    const items = [];
    for (const l of (payload.lines || [])) {
        if (!String(l.description || '').trim() && !l.item_id) continue;
        const line = {
            item_id: l.item_id || null,
            description: String(l.description || '').trim().slice(0, 500),
            hsn_sac: l.hsn_sac || null,
            unit: l.unit || null,
            quantity: Number(l.quantity) || 0,
            rate_paise: paiseOf(l.rate, l.rate_paise),
            discount_bps: Number(l.discount_bps) || 0,
            tax_rate_bps: Number(l.tax_rate_bps) || 0,
            tax_treatment: l.tax_treatment || 'gst',
            po_line_id: l.po_line_id || null,
            serial_numbers: Array.isArray(l.serial_numbers) ? l.serial_numbers.filter(Boolean) : null,
        };
        // A roll bought, metres held.
        if (line.item_id) {
            const item = await stock.loadItem(conn, line.item_id);
            line.base_quantity = stock.toBaseQuantity(item, line.quantity, line.unit);
        } else {
            line.base_quantity = line.quantity;
        }
        items.push(line);
    }
    if (!items.length) throw new PurchaseError('A document needs at least one line', 'no_lines', 400);

    const charges = (payload.charges || [])
        .filter((c) => Number(c.amount ?? c.amount_paise))
        .map((c) => ({
            label: String(c.label || 'Freight').slice(0, 120),
            amount_paise: paiseOf(c.amount, c.amount_paise),
            tax_rate_bps: Number(c.tax_rate_bps) || 0,
            tax_treatment: c.tax_treatment || 'gst',
        }));

    const priced = computeDocument({
        lines: items,
        charges,
        prices_include_tax: !!payload.prices_include_tax,
        doc_discount_paise: paiseOf(payload.doc_discount, payload.doc_discount_paise),
        supplier_state_code: supplierState || biz.state_code,
        place_of_supply_state_code: biz.state_code,
        round_to_rupee: payload.round_to_rupee !== false,
    });

    // Freight and other charges belong in the cost of the goods, not in a
    // separate expense, so they are spread across the lines by value.
    const chargeTotal = priced.charges.reduce((sum, c) => sum + c.taxable_paise, 0);
    if (chargeTotal) {
        const weights = priced.lines.map((l) => l.taxable_paise);
        const shares = money.allocate(chargeTotal, weights);
        priced.lines.forEach((l, i) => { l.landed_cost_paise = shares[i]; });
    } else {
        priced.lines.forEach((l) => { l.landed_cost_paise = 0; });
    }

    return { priced, supplierState: supplierState || biz.state_code };
}

async function savePurchaseDraft(conn, { businessId, user, payload, existingId = null }) {
    const docType = payload.doc_type || 'purchase_order';
    if (!DOC_TYPES.has(docType)) throw new PurchaseError('Unknown document type', 'bad_type', 400);

    if (existingId) {
        const [[current]] = await conn.query('SELECT status FROM purchase_documents WHERE id = ? LIMIT 1', [existingId]);
        if (!current) throw new PurchaseError('No such document', 'not_found', 404);
        if (current.status !== 'draft') throw new PurchaseError('An issued document cannot be edited', 'not_draft');
    }

    const { priced } = await priceePurchase(conn, businessId, payload);
    const t = priced.totals;
    const id = existingId || randomUUID();

    const row = {
        business_id: businessId,
        doc_type: docType,
        doc_date: ymd(payload.doc_date || new Date()),
        due_date: payload.due_date ? ymd(payload.due_date) : null,
        party_id: payload.party_id || null,
        place_of_supply_state_code: payload.supplier_state_code || null,
        supply_type: priced.supply_type,
        prices_include_tax: payload.prices_include_tax ? 1 : 0,
        location_id: payload.location_id || null,
        po_id: payload.po_id || null,
        grn_id: payload.grn_id || null,
        supplier_ref: payload.supplier_ref || null,
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
        input_credit_eligible: payload.input_credit_eligible === false ? 0 : 1,
        notes: payload.notes || null,
        terms: payload.terms || null,
        attachment_url: payload.attachment_url || null,
    };

    if (existingId) {
        await conn.query('UPDATE purchase_documents SET ? WHERE id = ?', [row, id]);
        await conn.query('DELETE FROM purchase_document_lines WHERE document_id = ?', [id]);
    } else {
        await conn.query('INSERT INTO purchase_documents SET ?', [{
            id, ...row, status: 'draft', created_by: user?.id || null,
            idempotency_key: payload.idempotency_key || null,
        }]);
    }

    let lineNo = 0;
    for (const l of priced.lines) {
        lineNo += 1;
        await conn.query('INSERT INTO purchase_document_lines SET ?', [{
            id: randomUUID(), document_id: id, line_no: lineNo, kind: 'item',
            item_id: l.item_id || null, description: l.description, hsn_sac: l.hsn_sac || null,
            quantity: l.quantity, unit: l.unit || null, base_quantity: l.base_quantity,
            rate_paise: l.rate_paise, discount_bps: l.discount_bps || 0,
            line_discount_paise: l.line_discount_paise, doc_discount_share_paise: l.doc_discount_share_paise,
            landed_cost_paise: l.landed_cost_paise || 0,
            tax_treatment: l.tax_treatment, tax_rate_bps: l.tax_rate_bps,
            taxable_paise: l.taxable_paise, cgst_paise: l.cgst_paise, sgst_paise: l.sgst_paise,
            utgst_paise: l.utgst_paise, igst_paise: l.igst_paise, amount_paise: l.amount_paise,
            po_line_id: l.po_line_id || null,
            serial_numbers: l.serial_numbers ? JSON.stringify(l.serial_numbers) : null,
        }]);
    }
    for (const c of priced.charges) {
        lineNo += 1;
        await conn.query('INSERT INTO purchase_document_lines SET ?', [{
            id: randomUUID(), document_id: id, line_no: lineNo, kind: 'charge',
            description: c.label, quantity: 1, base_quantity: 1, rate_paise: c.taxable_paise,
            tax_treatment: c.tax_treatment, tax_rate_bps: c.tax_rate_bps,
            taxable_paise: c.taxable_paise, cgst_paise: c.cgst_paise, sgst_paise: c.sgst_paise,
            utgst_paise: c.utgst_paise, igst_paise: c.igst_paise, amount_paise: c.amount_paise,
        }]);
    }

    return id;
}

// ── issuing ─────────────────────────────────────────────────────────────
async function issuePurchase(conn, { businessId, user, id }) {
    const loaded = await loadPurchase(conn, id);
    if (!loaded) throw new PurchaseError('No such document', 'not_found', 404);
    const doc = loaded.document;
    if (doc.status !== 'draft') throw new PurchaseError('This document has already been issued', 'already_issued');
    if (!doc.party_id) throw new PurchaseError('Choose the supplier before issuing', 'no_party', 400);

    const [[party]] = await conn.query('SELECT * FROM parties WHERE id = ? LIMIT 1', [doc.party_id]);
    const snapshot = {
        display_name: party.display_name, legal_name: party.legal_name, phone: party.phone,
        gstin: party.gstin, gst_treatment: party.gst_treatment,
        state_code: party.place_of_supply_state_code,
    };

    const docNo = await posting.allocateNumber(conn, businessId, doc.doc_type, doc.doc_date);

    let locationId = doc.location_id;
    if (MOVES_STOCK.has(doc.doc_type) && !locationId) {
        locationId = (await stock.defaultLocation(conn, businessId)).id;
    }

    let journalId = null;
    const movements = [];

    if (doc.doc_type === 'goods_receipt') {
        // The goods are here. Stock up at what they cost — rate plus this
        // line's share of the freight — and the value waits in Goods Received
        // Not Billed until the supplier's invoice arrives.
        for (const line of loaded.lines) {
            if (line.kind !== 'item' || !line.item_id) continue;
            const baseQty = stock.qty(line.base_quantity);
            if (!(baseQty > 0)) continue;

            const lineCost = Number(line.taxable_paise) + Number(line.landed_cost_paise || 0);
            const unitCost = Math.round(lineCost / baseQty);

            const item = await stock.loadItem(conn, line.item_id);
            const serials = line.serial_numbers || [];
            if (item.track_serial && serials.length && serials.length !== baseQty) {
                throw new PurchaseError(
                    `${item.name}: ${baseQty} received but ${serials.length} serial numbers given`,
                    'serial_count_mismatch'
                );
            }

            const made = await stock.move(conn, {
                businessId, itemId: line.item_id, type: 'purchase', quantity: baseQty,
                unitCostPaise: unitCost, locationId,
                sourceType: 'goods_receipt', sourceId: doc.id,
                note: `Received from ${party.display_name}`, createdBy: user?.id || null,
            });
            movements.push(made);

            if (serials.length) {
                await stock.receiveSerials(conn, {
                    businessId, itemId: line.item_id, serials, locationId,
                    costPaise: unitCost, supplierPartyId: doc.party_id, purchaseDocId: doc.id,
                    warrantyMonths: item.warranty_months || null, createdBy: user?.id || null,
                });
            }

            // An order knows how much of it has arrived.
            if (line.po_line_id) {
                await conn.query(
                    'UPDATE purchase_document_lines SET received_qty = received_qty + ? WHERE id = ?',
                    [baseQty, line.po_line_id]
                );
            }
        }
        journalId = (await postReceiptJournal(conn, { businessId, user, doc, movements, docNo })).id;
        if (doc.po_id) await refreshOrderStatus(conn, doc.po_id);
    }

    if (doc.doc_type === 'supplier_bill') {
        journalId = (await postBillJournal(conn, { businessId, user, doc, lines: loaded.lines, docNo })).id;
        if (doc.po_id) await refreshOrderStatus(conn, doc.po_id);
    }

    if (doc.doc_type === 'purchase_return') {
        for (const line of loaded.lines) {
            if (line.kind !== 'item' || !line.item_id) continue;
            const baseQty = stock.qty(line.base_quantity);
            if (!(baseQty > 0)) continue;
            const made = await stock.move(conn, {
                businessId, itemId: line.item_id, type: 'purchase_return', quantity: baseQty,
                locationId, sourceType: 'purchase_return', sourceId: doc.id,
                note: `Returned to ${party.display_name}`, createdBy: user?.id || null,
            });
            movements.push(made);
        }
        journalId = (await postReturnJournal(conn, { businessId, user, doc, movements, docNo })).id;
    }

    await conn.query(
        `UPDATE purchase_documents
            SET doc_no = ?, status = ?, issued_at = NOW(), issued_by = ?, journal_id = ?,
                party_snapshot = ?, location_id = ?
          WHERE id = ?`,
        [docNo, doc.doc_type === 'purchase_order' ? 'issued' : 'issued', user?.id || null, journalId,
            JSON.stringify(snapshot), locationId, id]
    );

    return loadPurchase(conn, id);
}

// Goods in, nothing owed on paper yet.
async function postReceiptJournal(conn, { businessId, user, doc, movements, docNo }) {
    const inventory = await posting.accountByCode(conn, businessId, '1200');
    const grni = await posting.accountByCode(conn, businessId, '2300');
    const value = movements.reduce((sum, m) => sum + Math.abs(m.value_paise), 0);

    if (!value) {
        throw new PurchaseError('A goods receipt needs at least one stocked line', 'nothing_received');
    }

    return posting.postJournal(conn, {
        businessId,
        date: doc.doc_date,
        narration: `Goods received ${docNo}`,
        sourceType: 'stock',
        sourceId: doc.id,
        lines: [
            { account_id: inventory.id, debit_paise: value, memo: 'Stock received' },
            { account_id: grni.id, credit_paise: value, party_id: doc.party_id, memo: 'Awaiting the supplier bill' },
        ],
        idempotencyKey: `grn:${doc.id}`,
        postedBy: user?.id || null,
    });
}

// The invoice. It clears what the receipt parked, claims the input tax and
// creates the payable — and touches no stock, because the goods already came in
// on the receipt.
async function postBillJournal(conn, { businessId, user, doc, lines, docNo }) {
    const payable = await posting.accountByCode(conn, businessId, '2000');
    const grni = await posting.accountByCode(conn, businessId, '2300');
    const inventory = await posting.accountByCode(conn, businessId, '1200');
    const purchases = await posting.accountByCode(conn, businessId, '5100');
    const roundOff = await posting.accountByCode(conn, businessId, '4910');
    const inputAccounts = {
        cgst: await posting.accountByCode(conn, businessId, '1300'),
        sgst: await posting.accountByCode(conn, businessId, '1310'),
        utgst: await posting.accountByCode(conn, businessId, '1310'),
        igst: await posting.accountByCode(conn, businessId, '1320'),
    };

    const entries = [];
    const taxable = Number(doc.taxable_paise);
    const total = Number(doc.total_paise);

    if (doc.grn_id) {
        // Against a receipt: the goods' value is already in inventory, parked
        // in Goods Received Not Billed. Clear it.
        entries.push({ account_id: grni.id, debit_paise: taxable, party_id: doc.party_id, memo: `Cleared by ${docNo}` });
    } else {
        // A direct purchase with no receipt: stocked lines go to inventory,
        // anything else is an expense.
        const stocked = lines.filter((l) => l.kind === 'item' && l.item_id)
            .reduce((sum, l) => sum + Number(l.taxable_paise), 0);
        const rest = taxable - stocked;
        if (stocked) entries.push({ account_id: inventory.id, debit_paise: stocked, memo: 'Stock purchased' });
        if (rest) entries.push({ account_id: purchases.id, debit_paise: rest, memo: 'Purchases and charges' });
    }

    // Input tax is only an asset if it can actually be claimed. Where it
    // cannot, it stays in the cost of what was bought.
    const taxTotal = ['cgst', 'sgst', 'utgst', 'igst']
        .reduce((sum, k) => sum + Number(doc[`${k}_paise`] || 0), 0);

    if (doc.input_credit_eligible && taxTotal) {
        for (const [component, account] of Object.entries(inputAccounts)) {
            const amount = Number(doc[`${component}_paise`] || 0);
            if (amount) entries.push({ account_id: account.id, debit_paise: amount, memo: `Input ${component.toUpperCase()}` });
        }
    } else if (taxTotal) {
        entries.push({ account_id: purchases.id, debit_paise: taxTotal, memo: 'Tax not eligible for input credit' });
    }

    const rounding = Number(doc.round_off_paise || 0);
    if (rounding) {
        entries.push(rounding > 0
            ? { account_id: roundOff.id, credit_paise: rounding, memo: 'Rounding' }
            : { account_id: roundOff.id, debit_paise: -rounding, memo: 'Rounding' });
    }

    entries.push({ account_id: payable.id, credit_paise: total, party_id: doc.party_id, memo: `Supplier bill ${docNo}` });

    return posting.postJournal(conn, {
        businessId,
        date: doc.doc_date,
        narration: `Supplier bill ${docNo}${doc.supplier_ref ? ` (${doc.supplier_ref})` : ''}`,
        sourceType: 'purchase',
        sourceId: doc.id,
        lines: entries,
        idempotencyKey: `bill:${doc.id}`,
        postedBy: user?.id || null,
    });
}

async function postReturnJournal(conn, { businessId, user, doc, movements, docNo }) {
    const inventory = await posting.accountByCode(conn, businessId, '1200');
    const payable = await posting.accountByCode(conn, businessId, '2000');
    const value = movements.reduce((sum, m) => sum + Math.abs(m.value_paise), 0);

    return posting.postJournal(conn, {
        businessId,
        date: doc.doc_date,
        narration: `Purchase return ${docNo}`,
        sourceType: 'stock',
        sourceId: doc.id,
        lines: [
            { account_id: payable.id, debit_paise: value, party_id: doc.party_id, memo: 'Returned to supplier' },
            { account_id: inventory.id, credit_paise: value, memo: 'Stock returned' },
        ],
        idempotencyKey: `preturn:${doc.id}`,
        postedBy: user?.id || null,
    });
}

// An order is open until everything on it has arrived. Partial deliveries are
// the normal case, not an exception.
async function refreshOrderStatus(conn, poId) {
    const [lines] = await conn.query(
        'SELECT base_quantity, received_qty FROM purchase_document_lines WHERE document_id = ? AND kind = ?',
        [poId, 'item']
    );
    if (!lines.length) return;

    const ordered = lines.reduce((sum, l) => sum + Number(l.base_quantity), 0);
    const received = lines.reduce((sum, l) => sum + Number(l.received_qty), 0);
    const status = received <= 0 ? 'issued' : received >= ordered ? 'received' : 'partially_received';
    await conn.query('UPDATE purchase_documents SET status = ? WHERE id = ? AND status <> ?', [status, poId, 'cancelled']);
}

// ── receiving against an order ──────────────────────────────────────────
// Builds a receipt from what is still outstanding on the order, so a partial
// delivery needs no retyping and cannot over-receive.
async function receiveAgainstOrder(conn, { businessId, user, poId, payload = {} }) {
    const order = await loadPurchase(conn, poId);
    if (!order) throw new PurchaseError('No such order', 'not_found', 404);
    if (order.document.doc_type !== 'purchase_order') throw new PurchaseError('That is not a purchase order', 'not_po', 400);
    if (order.document.status === 'cancelled') throw new PurchaseError('That order was cancelled', 'cancelled');

    const wanted = new Map(
        (payload.lines || []).map((l) => [l.po_line_id, Number(l.quantity)])
    );

    const lines = [];
    for (const line of order.lines) {
        if (line.kind !== 'item') continue;
        const outstanding = stock.qty(Number(line.base_quantity) - Number(line.received_qty));
        if (outstanding <= 0) continue;

        const asked = wanted.size ? stock.qty(wanted.get(line.id) ?? 0) : outstanding;
        if (asked <= 0) continue;
        if (asked > outstanding) {
            throw new PurchaseError(
                `${line.description}: only ${outstanding} still to come on this order`,
                'over_receipt'
            );
        }

        lines.push({
            item_id: line.item_id,
            description: line.description,
            hsn_sac: line.hsn_sac,
            unit: null, // the order already converted to base units
            quantity: asked,
            rate_paise: Number(line.rate_paise),
            tax_rate_bps: Number(line.tax_rate_bps),
            tax_treatment: line.tax_treatment,
            po_line_id: line.id,
            serial_numbers: (payload.lines || []).find((l) => l.po_line_id === line.id)?.serial_numbers || null,
        });
    }

    if (!lines.length) throw new PurchaseError('Everything on this order has already been received', 'nothing_outstanding');

    const id = await savePurchaseDraft(conn, {
        businessId, user,
        payload: {
            doc_type: 'goods_receipt',
            doc_date: payload.doc_date || new Date(),
            party_id: order.document.party_id,
            supplier_state_code: order.document.place_of_supply_state_code,
            location_id: payload.location_id || order.document.location_id,
            po_id: order.document.id,
            supplier_ref: payload.supplier_ref || null,
            notes: payload.notes || null,
            lines,
        },
    });

    return issuePurchase(conn, { businessId, user, id });
}

// ── cancelling ──────────────────────────────────────────────────────────
async function cancelPurchase(conn, { businessId, user, id, reason }) {
    if (!reason) throw new PurchaseError('A cancellation needs a reason', 'no_reason', 400);
    const loaded = await loadPurchase(conn, id);
    if (!loaded) throw new PurchaseError('No such document', 'not_found', 404);
    const doc = loaded.document;
    if (doc.status === 'cancelled') throw new PurchaseError('Already cancelled', 'already_cancelled');
    if (doc.status === 'draft') throw new PurchaseError('A draft is deleted, not cancelled', 'is_draft', 400);
    if (loaded.paid_paise > 0) throw new PurchaseError('This bill has been paid — reverse the payment first', 'has_payments');

    // Goods that came in on a receipt have to go back out before the receipt
    // can be undone, or the shelf and the books disagree.
    if (doc.doc_type === 'goods_receipt') {
        const [bills] = await conn.query(
            `SELECT id, doc_no FROM purchase_documents WHERE grn_id = ? AND status <> 'cancelled'`, [id]
        );
        if (bills.length) {
            throw new PurchaseError(
                `${bills[0].doc_no} was billed against this receipt — cancel the bill first`,
                'has_bill'
            );
        }
        for (const line of loaded.lines) {
            if (line.kind !== 'item' || !line.item_id) continue;
            const baseQty = stock.qty(line.base_quantity);
            if (!(baseQty > 0)) continue;
            await stock.move(conn, {
                businessId, itemId: line.item_id, type: 'adjust_out', quantity: baseQty,
                locationId: doc.location_id, sourceType: 'goods_receipt', sourceId: doc.id,
                note: `Receipt cancelled — ${reason}`, createdBy: user?.id || null,
            });
        }
        await conn.query(
            `UPDATE purchase_document_lines pl
               JOIN purchase_document_lines rl ON rl.po_line_id = pl.id
                SET pl.received_qty = GREATEST(pl.received_qty - rl.base_quantity, 0)
              WHERE rl.document_id = ?`,
            [id]
        );
        if (doc.po_id) await refreshOrderStatus(conn, doc.po_id);
    }

    if (doc.journal_id) {
        await posting.reverseJournal(conn, {
            journalId: doc.journal_id, date: new Date(), reason, postedBy: user?.id || null,
        });
    }

    await conn.query(
        `UPDATE purchase_documents SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = ?, cancel_reason = ? WHERE id = ?`,
        [user?.id || null, String(reason).slice(0, 500), id]
    );
    return loadPurchase(conn, id);
}

// ── paying a supplier ───────────────────────────────────────────────────
async function paySupplier(conn, { businessId, user, payload }) {
    const amount = paiseOf(payload.amount, payload.amount_paise);
    if (amount <= 0) throw new PurchaseError('A payment needs an amount', 'no_amount', 400);
    if (!payload.party_id) throw new PurchaseError('Which supplier is being paid?', 'no_party', 400);

    const method = payload.method || 'bank';
    const date = ymd(payload.payment_date || new Date());
    const accountCode = payload.account_code || (method === 'cash' ? '1000' : '1010');
    const account = await posting.accountByCode(conn, businessId, accountCode);

    const requested = (payload.allocations || [])
        .map((a) => ({ document_id: a.document_id, amount_paise: paiseOf(a.amount, a.amount_paise) }))
        .filter((a) => a.document_id && a.amount_paise > 0);
    const allocatedTotal = requested.reduce((sum, a) => sum + a.amount_paise, 0);
    if (allocatedTotal > amount) throw new PurchaseError('The allocations come to more than the payment', 'over_allocated');

    for (const alloc of requested) {
        const target = await loadPurchase(conn, alloc.document_id);
        if (!target) throw new PurchaseError('One of the bills does not exist', 'not_found', 404);
        if (target.document.doc_type !== 'supplier_bill') throw new PurchaseError('Only a supplier bill can be paid', 'not_bill');
        if (alloc.amount_paise > target.balance_paise) {
            throw new PurchaseError(
                `${target.document.doc_no} only has ${money.formatINR(target.balance_paise)} outstanding`,
                'over_paid'
            );
        }
    }

    const paymentNo = await posting.allocateNumber(conn, businessId, 'payment', date);
    const paymentId = randomUUID();
    const payable = await posting.accountByCode(conn, businessId, '2000');

    const journal = await posting.postJournal(conn, {
        businessId,
        date,
        narration: `Payment ${paymentNo}`,
        sourceType: 'payment',
        sourceId: paymentId,
        lines: [
            { account_id: payable.id, debit_paise: amount, party_id: payload.party_id, memo: `Paid by ${method}` },
            { account_id: account.id, credit_paise: amount, memo: paymentNo },
        ],
        idempotencyKey: payload.idempotency_key ? `payment:${payload.idempotency_key}` : null,
        postedBy: user?.id || null,
    });

    await conn.query('INSERT INTO payments SET ?', [{
        id: paymentId, business_id: businessId, payment_no: paymentNo, payment_date: date,
        direction: 'out', party_id: payload.party_id, method, account_id: account.id,
        amount_paise: amount, reference: payload.reference || null, notes: payload.notes || null,
        status: 'posted', journal_id: journal.id,
        idempotency_key: payload.idempotency_key || null, created_by: user?.id || null,
    }]);

    for (const alloc of requested) {
        await conn.query('INSERT INTO purchase_allocations SET ?', [{
            id: randomUUID(), payment_id: paymentId, document_id: alloc.document_id,
            amount_paise: alloc.amount_paise, created_by: user?.id || null,
        }]);
    }

    const [[payment]] = await conn.query('SELECT * FROM payments WHERE id = ?', [paymentId]);
    return { payment, allocated_paise: allocatedTotal, unallocated_paise: amount - allocatedTotal };
}

module.exports = {
    PurchaseError,
    loadPurchase,
    savePurchaseDraft,
    issuePurchase,
    cancelPurchase,
    receiveAgainstOrder,
    paySupplier,
    refreshOrderStatus,
    priceePurchase,
    DOC_TYPES,
};
