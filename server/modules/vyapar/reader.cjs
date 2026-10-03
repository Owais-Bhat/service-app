'use strict';

// Reads a Vyapar backup (.vyb) into plain objects. It only reads: nothing here touches the
// portal's database, so the same reading serves the preview and the real import.
//
// A .vyb is a ZIP holding one SQLite database (.vyp). Reading it needs no native module — sql.js is
// SQLite compiled to WebAssembly, which runs the same on the host as on a laptop.
//
// What Vyapar means by its numbers, as found in a real backup (and why the reader is careful):
//   * A party's balance (kb_names.amount) is the truth about who owes whom: positive = they owe us,
//     negative = we owe them. Per-invoice balances are NOT reliable — payments were often recorded
//     against the party, not against invoices — so invoices keep what Vyapar says but the party
//     balance is what the books start from.
//   * Stock quantities go negative when purchases were not entered. Only positive stock is trusted.
//   * Line totals include tax; the price per unit is before tax.

const { unzipSync } = require('fflate');
const initSqlJs = require('sql.js');
const gst = require('../gst.cjs');

class VyaparError extends Error {
    constructor(message, code = 'vyapar_error', status = 400) {
        super(message);
        this.name = 'VyaparError';
        this.code = code;
        this.status = status;
    }
}

// What each Vyapar transaction type is. Anything not listed is kept, labelled by its number.
const DOC_TYPES = {
    1: 'sale', 2: 'purchase', 3: 'payment_in', 4: 'payment_out', 7: 'expense',
    21: 'sale_return', 23: 'purchase_return', 27: 'estimate', 30: 'delivery_challan',
};
const SALES_SIDE = new Set([1, 3, 21, 27, 30]);
const PURCHASE_SIDE = new Set([2, 4, 23]);

const paise = (rupees) => Math.round((Number(rupees) || 0) * 100);
const text = (v, max = 255) => String(v ?? '').trim().slice(0, max);
const day = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : null);

/** "+91 98765 43210", "09876543210", "9876543210" → "9876543210"; anything else is kept as typed. */
function cleanPhone(raw) {
    const typed = text(raw, 20);
    const digits = typed.replace(/\D/g, '');
    let n = digits;
    if (n.length === 12 && n.startsWith('91')) n = n.slice(2);
    else if (n.length === 11 && n.startsWith('0')) n = n.slice(1);
    return /^[6-9]\d{9}$/.test(n) ? n : typed;
}

const normaliseState = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const STATE_BY_NAME = new Map(Object.entries(gst.STATE_CODES).map(([code, name]) => [normaliseState(name), String(code).padStart(2, '0')]));
STATE_BY_NAME.set('jammu and kashmir', '01');
STATE_BY_NAME.set('orissa', '21');
STATE_BY_NAME.set('pondicherry', '34');
const stateCode = (name) => STATE_BY_NAME.get(normaliseState(name)) || null;

let sqlLibrary = null;
const sqlJs = () => (sqlLibrary ||= initSqlJs());

function rowsOf(db, query, params = []) {
    const statement = db.prepare(query);
    try {
        statement.bind(params);
        const out = [];
        while (statement.step()) out.push(statement.getAsObject());
        return out;
    } finally {
        statement.free();
    }
}

/** Open the backup: unzip if needed, check it really is a SQLite database. */
async function openBackup(buffer) {
    let bytes = new Uint8Array(buffer);
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
        let files;
        try { files = unzipSync(bytes); } catch { throw new VyaparError('This file looks like a ZIP but cannot be opened. Take a fresh backup from Vyapar and try again.', 'bad_zip'); }
        const entry = Object.keys(files).find((n) => /\.(vyp|db|sqlite)$/i.test(n)) || Object.keys(files)[0];
        if (!entry) throw new VyaparError('The backup is empty.', 'empty_backup');
        bytes = files[entry];
    }
    const header = Buffer.from(bytes.slice(0, 15)).toString('latin1');
    if (header !== 'SQLite format 3') {
        throw new VyaparError('This is not a Vyapar backup. In Vyapar choose Backup → Backup to device, and upload that .vyb file.', 'not_vyapar');
    }
    const SQL = await sqlJs();
    const db = new SQL.Database(bytes);
    const tables = new Set(rowsOf(db, "SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name));
    for (const needed of ['kb_names', 'kb_items', 'kb_transactions', 'kb_lineitems']) {
        if (!tables.has(needed)) {
            db.close();
            throw new VyaparError(`This does not look like a Vyapar backup (it has no ${needed}).`, 'not_vyapar');
        }
    }
    return db;
}

/**
 * Read everything the import needs.
 * @param {Buffer|Uint8Array} buffer  the .vyb file
 */
async function readVyapar(buffer) {
    const db = await openBackup(buffer);
    const warnings = [];
    try {
        const [firmRow] = rowsOf(db, 'SELECT firm_name, firm_gstin_number, firm_state FROM kb_firms LIMIT 1');
        const firm = { name: text(firmRow?.firm_name), gstin: text(firmRow?.firm_gstin_number, 15), state: text(firmRow?.firm_state) };

        // ── lookup tables ───────────────────────────────────────────────
        const units = new Map(rowsOf(db, 'SELECT unit_id, unit_short_name, unit_name FROM kb_item_units').map((u) => [u.unit_id, text(u.unit_short_name || u.unit_name, 20)]));
        const taxRate = new Map(rowsOf(db, 'SELECT tax_code_id, tax_rate FROM kb_tax_code').map((t) => [t.tax_code_id, Number(t.tax_rate) || 0]));
        const categories = new Map(rowsOf(db, 'SELECT item_category_id, item_category_name FROM kb_item_categories').map((c) => [c.item_category_id, text(c.item_category_name, 120)]));
        const categoryOf = new Map(rowsOf(db, 'SELECT item_id, category_id FROM kb_item_categories_mapping').map((m) => [m.item_id, m.category_id]));
        const paymentTypes = new Map(rowsOf(db, 'SELECT paymentType_id, paymentType_type, paymentType_name FROM kb_paymentTypes').map((p) => [p.paymentType_id, text(p.paymentType_name || p.paymentType_type, 80)]));

        // ── transactions and their lines ────────────────────────────────
        const lineRows = rowsOf(db, `SELECT lineitem_txn_id AS txn, item_id, quantity, priceperunit, total_amount, lineitem_tax_amount AS tax,
                lineitem_discount_amount AS discount, lineitem_unit_id AS unit, lineitem_tax_id AS tax_id, lineitem_serial_number AS serial,
                lineitem_description AS description, lineitem_free_quantity AS free_qty FROM kb_lineitems ORDER BY lineitem_id`);
        const itemNames = new Map(rowsOf(db, 'SELECT item_id, item_name, item_hsn_sac_code FROM kb_items').map((i) => [i.item_id, i]));
        const linesByTxn = new Map();
        const taxSeen = new Map();       // item id → { rate → count } over its sale lines
        const lastRate = new Map();      // item id → { sale, purchase } latest price per unit
        for (const l of lineRows) {
            const item = itemNames.get(l.item_id);
            const rate = taxRate.get(l.tax_id) ?? 0;
            const amount = Number(l.total_amount) || 0;
            const qty = Number(l.quantity) || 0;
            const entry = {
                item_source_id: l.item_id, name: text(item?.item_name, 500) || text(l.description, 500) || 'Item',
                hsn_sac: text(item?.item_hsn_sac_code, 10) || null, quantity: qty,
                unit: units.get(l.unit) || null, rate_paise: paise(l.priceperunit),
                discount_paise: paise(l.discount), tax_rate_bps: Math.round(rate * 100), tax_paise: paise(l.tax),
                amount_paise: paise(amount), serial_no: text(l.serial, 200) || null,
            };
            if (!linesByTxn.has(l.txn)) linesByTxn.set(l.txn, []);
            linesByTxn.get(l.txn).push(entry);
            if (rate > 0) {
                const m = taxSeen.get(l.item_id) || new Map();
                m.set(rate, (m.get(rate) || 0) + 1);
                taxSeen.set(l.item_id, m);
            }
        }

        // Which payments were put against which invoices, and which quotations became which invoices.
        const links = new Map();
        const addLink = (from, to, kind, amount) => {
            if (!links.has(from)) links.set(from, []);
            links.get(from).push({ with: String(to), kind, amount_paise: amount === null ? null : paise(amount) });
        };
        for (const l of rowsOf(db, 'SELECT txn_links_txn_1_id AS a, txn_links_txn_2_id AS b, txn_links_amount AS amount FROM kb_txn_links')) {
            addLink(l.a, l.b, 'payment', l.amount);
            addLink(l.b, l.a, 'payment', l.amount);
        }
        for (const l of rowsOf(db, 'SELECT txn_source_id AS a, txn_destination_id AS b FROM kb_linked_transactions')) {
            addLink(l.a, l.b, 'converted_to', null);
            addLink(l.b, l.a, 'converted_from', null);
        }

        const txnRows = rowsOf(db, `SELECT txn_id, txn_type, txn_date, txn_due_date, txn_name_id, txn_cash_amount, txn_balance_amount,
                txn_discount_amount, txn_tax_amount, txn_round_off_amount, txn_tax_inclusive, txn_invoice_prefix, txn_ref_number_char, txn_description,
                txn_payment_type_id, txn_payment_reference, txn_payment_status, txn_status, txn_place_of_supply, txn_ac1_amount, txn_ac2_amount, txn_ac3_amount,
                ac1_name, ac2_name, ac3_name FROM kb_transactions ORDER BY txn_date, txn_id`);
        const documents = [];
        const kindOf = new Map();       // party id → { sales, purchases }
        for (const t of txnRows) {
            const lines = linesByTxn.get(t.txn_id) || [];
            const total = paise((Number(t.txn_cash_amount) || 0) + (Number(t.txn_balance_amount) || 0));
            const doc = {
                source_id: String(t.txn_id), vyapar_type: t.txn_type, doc_type: DOC_TYPES[t.txn_type] || 'other',
                doc_no: `${text(t.txn_invoice_prefix, 40)}${text(t.txn_ref_number_char, 40)}` || null,
                date: day(t.txn_date), due_date: day(t.txn_due_date),
                party_source_id: t.txn_name_id || null,
                total_paise: total, paid_paise: paise(t.txn_cash_amount), balance_paise: paise(t.txn_balance_amount),
                discount_paise: paise(t.txn_discount_amount), tax_paise: lines.reduce((s, l) => s + l.tax_paise, 0),
                round_off_paise: paise(t.txn_round_off_amount), tax_inclusive: Number(t.txn_tax_inclusive) === 1,
                place_of_supply: text(t.txn_place_of_supply, 60) || null,
                payment_status: t.txn_payment_status, status: t.txn_status, payment_mode: paymentTypes.get(t.txn_payment_type_id) || null,
                reference: text(t.txn_payment_reference, 120) || null, notes: text(t.txn_description, 2000) || null,
                // Extra charges (freight and the like) are kept by name, so the lines add up to the total.
                charges: [[t.ac1_name, t.txn_ac1_amount], [t.ac2_name, t.txn_ac2_amount], [t.ac3_name, t.txn_ac3_amount]]
                    .filter(([, a]) => Number(a)).map(([n, a]) => ({ name: text(n, 80) || 'Charge', amount_paise: paise(a) })),
                links: links.get(t.txn_id) || [],
                lines,
            };
            documents.push(doc);

            if (t.txn_name_id) {
                const k = kindOf.get(t.txn_name_id) || { sales: 0, purchases: 0 };
                if (SALES_SIDE.has(t.txn_type)) k.sales += 1;
                if (PURCHASE_SIDE.has(t.txn_type)) k.purchases += 1;
                kindOf.set(t.txn_name_id, k);
            }
            // The latest price paid and charged for each item, for items that never had one set.
            for (const l of lines) {
                if (!l.rate_paise || !l.item_source_id) continue;
                const p = lastRate.get(l.item_source_id) || {};
                if (t.txn_type === 1) p.sale = l.rate_paise;
                if (t.txn_type === 2) p.purchase = l.rate_paise;
                lastRate.set(l.item_source_id, p);
            }
        }

        // ── parties ─────────────────────────────────────────────────────
        const nameRows = rowsOf(db, `SELECT name_id, full_name, phone_number, email, amount, address, name_gstin_number, name_state, pincode,
                credit_limit, name_is_active, name_type, name_shipping_address FROM kb_names`);
        const parties = [];
        const expenseNames = [];
        for (const n of nameRows) {
            const name = text(n.full_name, 200);
            if (!name) continue;
            if (n.name_type === 2) { expenseNames.push(name); continue; }   // Petrol, Rent, Salary… are expense heads, not people
            const k = kindOf.get(n.name_id) || { sales: 0, purchases: 0 };
            const balance = paise(n.amount);
            let gstin = text(n.name_gstin_number, 15).toUpperCase();
            if (gstin) {
                const check = gst.validateGstin(gstin);
                if (!check.valid) { warnings.push(`${name}: GSTIN "${gstin}" is not valid and was left out`); gstin = ''; } else gstin = check.gstin;
            }
            parties.push({
                source_id: n.name_id, name, phone: cleanPhone(n.phone_number) || null, email: text(n.email, 160) || null,
                address: text(n.address, 255) || null, pincode: text(n.pincode, 10) || null,
                gstin: gstin || null, state_name: text(n.name_state, 60) || null,
                state_code: (gstin ? gstin.slice(0, 2) : null) || stateCode(n.name_state),
                balance_paise: balance, credit_limit_paise: paise(n.credit_limit), active: Number(n.name_is_active) !== 0,
                kind: k.purchases && k.sales ? 'both' : k.purchases ? 'supplier' : (balance < 0 && !k.sales ? 'supplier' : 'customer'),
                transactions: k.sales + k.purchases,
            });
        }

        // ── items ───────────────────────────────────────────────────────
        const items = [];
        for (const i of rowsOf(db, `SELECT item_id, item_name, item_code, item_sale_unit_price, item_purchase_unit_price, item_stock_quantity,
                item_min_stock_quantity, item_hsn_sac_code, item_tax_id, item_tax_type, base_unit_id, item_is_active, item_type, item_description FROM kb_items`)) {
            const name = text(i.item_name, 255);
            if (!name) continue;
            // GST: the rate on the item itself, else the one it was most often sold at, else none known.
            let rate = taxRate.get(i.item_tax_id) || 0;
            let rateKnown = i.item_tax_id !== null && i.item_tax_id !== undefined && taxRate.has(i.item_tax_id);
            if (!rate) {
                const seen = taxSeen.get(i.item_id);
                if (seen) { rate = [...seen.entries()].sort((a, b) => b[1] - a[1])[0][0]; rateKnown = true; }
            }
            const last = lastRate.get(i.item_id) || {};
            // Vyapar's prices may include tax (item_tax_type 1); the portal wants them before tax.
            const beforeTax = (price) => {
                const v = Number(price) || 0;
                return Number(i.item_tax_type) === 1 && rate ? Math.round((v / (1 + rate / 100)) * 100) / 100 : v;
            };
            const sale = Number(i.item_sale_unit_price) || (last.sale ? last.sale / 100 : 0);
            const purchase = Number(i.item_purchase_unit_price) || (last.purchase ? last.purchase / 100 : 0);
            const stock = Number(i.item_stock_quantity) || 0;
            items.push({
                source_id: i.item_id, name, code: text(i.item_code, 60) || null,
                category: categories.get(categoryOf.get(i.item_id)) || null,
                unit: units.get(i.base_unit_id) || null, hsn_sac: text(i.item_hsn_sac_code, 10) || null,
                gst_rate: rate, gst_rate_known: rateKnown,
                sale_price: beforeTax(sale), purchase_price: beforeTax(purchase), stock_qty: stock, min_stock: Number(i.item_min_stock_quantity) || 0,
                active: Number(i.item_is_active) !== 0, notes: text(i.item_description, 500) || null,
            });
        }

        // ── the bank and cash accounts Vyapar kept (not imported: they are the owner's to enter) ──
        const paymentAccounts = rowsOf(db, 'SELECT paymentType_type AS kind, paymentType_name AS name, paymentType_bankName AS bank, paymentType_accountNumber AS number FROM kb_paymentTypes')
            .map((a) => ({ kind: text(a.kind, 20), name: text(a.name, 80), bank: text(a.bank, 80) || null, number: a.number ? `…${String(a.number).slice(-4)}` : null }));

        return { firm, parties, expenseNames, items, documents, paymentAccounts, warnings };
    } finally {
        db.close();
    }
}

/** What the preview shows: counts and totals, never the customers themselves. */
function summarise(data) {
    const money = (list, pick) => list.reduce((s, x) => s + pick(x), 0);
    const byType = {};
    for (const d of data.documents) {
        const t = (byType[d.doc_type] ||= { count: 0, total_paise: 0, from: d.date, to: d.date });
        t.count += 1;
        t.total_paise += d.total_paise;
        if (d.date && (!t.from || d.date < t.from)) t.from = d.date;
        if (d.date && (!t.to || d.date > t.to)) t.to = d.date;
    }
    const receivable = data.parties.filter((p) => p.balance_paise > 0);
    const payable = data.parties.filter((p) => p.balance_paise < 0);
    const stocked = data.items.filter((i) => i.stock_qty > 0);
    const negative = data.items.filter((i) => i.stock_qty < 0);
    const names = new Map();
    for (const i of data.items) names.set(i.name.toLowerCase(), (names.get(i.name.toLowerCase()) || 0) + 1);
    return {
        firm: data.firm,
        parties: {
            count: data.parties.length, customers: data.parties.filter((p) => p.kind === 'customer').length,
            suppliers: data.parties.filter((p) => p.kind === 'supplier').length, both: data.parties.filter((p) => p.kind === 'both').length,
            with_phone: data.parties.filter((p) => p.phone).length, with_gstin: data.parties.filter((p) => p.gstin).length,
            owe_us: { count: receivable.length, paise: money(receivable, (p) => p.balance_paise) },
            we_owe: { count: payable.length, paise: -money(payable, (p) => p.balance_paise) },
            expense_heads_skipped: data.expenseNames.length,
        },
        items: {
            count: data.items.length, with_stock: stocked.length,
            stock_value_paise: Math.round(money(stocked, (i) => i.stock_qty * i.purchase_price * 100)),
            negative_stock: negative.length, negative_units: Math.round(money(negative, (i) => i.stock_qty)),
            with_hsn: data.items.filter((i) => i.hsn_sac).length, without_price: data.items.filter((i) => !i.sale_price).length,
            duplicate_names: [...names.values()].filter((n) => n > 1).length,
        },
        documents: { count: data.documents.length, lines: money(data.documents, (d) => d.lines.length), by_type: byType },
        payment_accounts: data.paymentAccounts,
        warnings: data.warnings.slice(0, 50),
        warnings_total: data.warnings.length,
    };
}

module.exports = { readVyapar, summarise, openBackup, cleanPhone, stateCode, DOC_TYPES, VyaparError };
