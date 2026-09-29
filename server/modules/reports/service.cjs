'use strict';

// Stage 5 — reports.
//
// Every figure here is read from posted journals or from the documents that
// produced them; nothing is stored, so nothing can drift. A report says what
// basis it was drawn on, and where two sources ought to agree (the ledger and
// the documents, the ledger and the stock count) it shows both and the
// difference rather than choosing one.

const money = require('../money.cjs');
const stock = require('../stock/engine.cjs');

const pad = (n) => String(n).padStart(2, '0');
const ymd = (v) => {
    if (!v) return null;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const today = () => ymd(new Date());
const startOfFinancialYear = (fyStartMonth = 4, on = new Date()) => {
    const m = Number(fyStartMonth) || 4;
    const year = on.getMonth() + 1 >= m ? on.getFullYear() : on.getFullYear() - 1;
    return `${year}-${pad(m)}-01`;
};

// A debit-natured account (asset, expense) grows on the debit side, the rest on
// the credit side. `natural` turns a debit/credit pair into the figure a person
// expects to read for that account.
const debitNatured = (type) => type === 'asset' || type === 'expense';
const natural = (type, debit, credit) => (debitNatured(type) ? debit - credit : credit - debit);

const json = (v) => {
    if (!v) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { return {}; }
};

// ── profit and loss ─────────────────────────────────────────────────────

async function profitLoss(conn, businessId, { from, to }) {
    const [rows] = await conn.query(
        `SELECT a.code, a.name, a.type, a.subtype,
                SUM(l.debit_paise) AS d, SUM(l.credit_paise) AS c
           FROM journal_lines l
           JOIN journals j ON j.id = l.journal_id
           JOIN accounts a ON a.id = l.account_id
          WHERE j.business_id = ? AND a.type IN ('income', 'expense')
            AND j.journal_date BETWEEN ? AND ?
          GROUP BY a.id, a.code, a.name, a.type, a.subtype
          ORDER BY a.code`,
        [businessId, from, to]
    );

    const lines = rows
        .map((r) => ({
            code: r.code, name: r.name, type: r.type, subtype: r.subtype,
            amount_paise: natural(r.type, Number(r.d), Number(r.c)),
        }))
        .filter((r) => r.amount_paise !== 0);

    const income = lines.filter((r) => r.type === 'income');
    const cogs = lines.filter((r) => r.type === 'expense' && r.subtype === 'cogs');
    const expenses = lines.filter((r) => r.type === 'expense' && r.subtype !== 'cogs');
    const sum = (list) => list.reduce((s, r) => s + r.amount_paise, 0);

    const totals = {
        income_paise: sum(income),
        cogs_paise: sum(cogs),
        gross_profit_paise: sum(income) - sum(cogs),
        expenses_paise: sum(expenses),
        net_profit_paise: sum(income) - sum(cogs) - sum(expenses),
    };
    return {
        scope: { from, to, basis: 'Accrual — income when billed, cost when the goods leave stock or the expense is booked. Discounts allowed are shown against income.' },
        income, cogs, expenses, totals,
    };
}

// ── balance sheet ───────────────────────────────────────────────────────

async function balanceSheet(conn, businessId, { asOn }) {
    // The date condition sits in the CASE as well as the join: a line whose
    // journal is later than the date must contribute nothing, and a LEFT JOIN
    // alone would leave the line itself in the sum.
    const [rows] = await conn.query(
        `SELECT a.code, a.name, a.type, a.subtype,
                COALESCE(SUM(CASE WHEN j.id IS NOT NULL THEN l.debit_paise END), 0) AS d,
                COALESCE(SUM(CASE WHEN j.id IS NOT NULL THEN l.credit_paise END), 0) AS c
           FROM accounts a
           LEFT JOIN journal_lines l ON l.account_id = a.id
           LEFT JOIN journals j ON j.id = l.journal_id AND j.business_id = a.business_id AND j.journal_date <= ?
          WHERE a.business_id = ?
          GROUP BY a.id, a.code, a.name, a.type, a.subtype
          ORDER BY a.code`,
        [asOn, businessId]
    );

    const accounts = rows.map((r) => ({
        code: r.code, name: r.name, type: r.type, subtype: r.subtype,
        balance_paise: natural(r.type, Number(r.d), Number(r.c)),
    }));

    const of = (type) => accounts.filter((a) => a.type === type && a.balance_paise !== 0);
    const total = (list) => list.reduce((s, a) => s + a.balance_paise, 0);

    const assets = of('asset');
    const liabilities = of('liability');
    const equity = of('equity');
    const profit = total(accounts.filter((a) => a.type === 'income')) - total(accounts.filter((a) => a.type === 'expense'));

    const totals = {
        assets_paise: total(assets),
        liabilities_paise: total(liabilities),
        equity_paise: total(equity),
        profit_to_date_paise: profit,
    };
    totals.liabilities_and_equity_paise = totals.liabilities_paise + totals.equity_paise + totals.profit_to_date_paise;
    totals.difference_paise = totals.assets_paise - totals.liabilities_and_equity_paise;

    return {
        scope: { as_on: asOn, basis: 'Everything posted up to the date. Profit is shown cumulatively — the books are not yet closed year by year.' },
        assets, liabilities, equity, totals, balanced: totals.difference_paise === 0,
    };
}

// ── an account's ledger ─────────────────────────────────────────────────

async function resolveAccount(conn, businessId, key) {
    const [[byCode]] = await conn.query('SELECT * FROM accounts WHERE business_id = ? AND (code = ? OR id = ?) LIMIT 1', [businessId, key, key]);
    return byCode || null;
}

async function accountLedger(conn, businessId, { account, from, to }) {
    const [[opening]] = await conn.query(
        `SELECT COALESCE(SUM(l.debit_paise), 0) AS d, COALESCE(SUM(l.credit_paise), 0) AS c
           FROM journal_lines l JOIN journals j ON j.id = l.journal_id
          WHERE l.account_id = ? AND j.business_id = ? AND j.journal_date < ?`,
        [account.id, businessId, from]
    );
    const [lines] = await conn.query(
        `SELECT j.id AS journal_id, j.journal_no, j.journal_date, j.narration, j.source_type, j.source_id, j.status,
                l.debit_paise, l.credit_paise, l.memo, p.display_name AS party
           FROM journal_lines l
           JOIN journals j ON j.id = l.journal_id
           LEFT JOIN parties p ON p.id = l.party_id
          WHERE l.account_id = ? AND j.business_id = ? AND j.journal_date BETWEEN ? AND ?
          ORDER BY j.journal_date, j.journal_no, l.line_no
          LIMIT 5000`,
        [account.id, businessId, from, to]
    );

    let running = natural(account.type, Number(opening.d), Number(opening.c));
    const openingBalance = running;
    let debit = 0;
    let credit = 0;
    const rows = lines.map((l) => {
        const d = Number(l.debit_paise);
        const c = Number(l.credit_paise);
        debit += d; credit += c;
        running += natural(account.type, d, c);
        return {
            journal_id: l.journal_id, journal_no: l.journal_no, date: ymd(l.journal_date), narration: l.narration,
            party: l.party, memo: l.memo, source_type: l.source_type, source_id: l.source_id, status: l.status,
            debit_paise: d, credit_paise: c, balance_paise: running,
        };
    });

    return {
        account: { id: account.id, code: account.code, name: account.name, type: account.type },
        scope: { from, to },
        opening_paise: openingBalance,
        rows,
        totals: { debit_paise: debit, credit_paise: credit },
        closing_paise: running,
    };
}

// ── ageing ──────────────────────────────────────────────────────────────

const BUCKETS = [['d0_30', 0, 30], ['d31_60', 31, 60], ['d61_90', 61, 90], ['d90_plus', 91, Infinity]];
const bucketOf = (days) => (BUCKETS.find(([, lo, hi]) => days >= lo && days <= hi) || BUCKETS[0])[0];
const daysBetween = (a, b) => Math.round((new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / 86400000);

/**
 * Who owes what, and for how long — worked out from the ledger, so a service
 * ticket, an invoice and an opening balance are all in it.
 *
 * There is no due date on a journal line, so age is counted from the day the
 * amount was charged. Payments are set against the oldest charge first.
 */
async function ageing(conn, businessId, { kind, asOn }) {
    const receivable = kind !== 'payable';
    const [lines] = await conn.query(
        `SELECT l.party_id, j.journal_date, l.debit_paise, l.credit_paise, p.display_name, p.phone
           FROM journal_lines l
           JOIN journals j ON j.id = l.journal_id
           JOIN accounts a ON a.id = l.account_id
           LEFT JOIN parties p ON p.id = l.party_id
          WHERE j.business_id = ? AND a.subtype = ? AND j.journal_date <= ?
          ORDER BY j.journal_date, j.journal_no, l.line_no`,
        [businessId, receivable ? 'receivable' : 'payable', asOn]
    );

    const byParty = new Map();
    for (const l of lines) {
        const key = l.party_id || '_none';
        if (!byParty.has(key)) {
            byParty.set(key, { party_id: l.party_id, party: l.display_name || 'Not assigned to a party', phone: l.phone || null, charges: [], settled: 0 });
        }
        const entry = byParty.get(key);
        const charge = Number(receivable ? l.debit_paise : l.credit_paise);
        const settle = Number(receivable ? l.credit_paise : l.debit_paise);
        if (charge > 0) entry.charges.push({ date: ymd(l.journal_date), amount: charge });
        entry.settled += settle;
    }

    const parties = [];
    const totals = { d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, outstanding_paise: 0, advance_paise: 0 };

    for (const entry of byParty.values()) {
        let toApply = entry.settled;
        const row = { party_id: entry.party_id, party: entry.party, phone: entry.phone, d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, outstanding_paise: 0, advance_paise: 0, oldest_days: 0 };
        for (const charge of entry.charges) {
            const used = Math.min(toApply, charge.amount);
            toApply -= used;
            const left = charge.amount - used;
            if (left > 0) {
                const days = Math.max(0, daysBetween(asOn, charge.date));
                row[bucketOf(days)] += left;
                row.outstanding_paise += left;
                row.oldest_days = Math.max(row.oldest_days, days);
            }
        }
        row.advance_paise = toApply; // paid ahead of any charge
        if (row.outstanding_paise === 0 && row.advance_paise === 0) continue;
        parties.push(row);
        for (const k of ['d0_30', 'd31_60', 'd61_90', 'd90_plus', 'outstanding_paise', 'advance_paise']) totals[k] += row[k];
    }
    parties.sort((a, b) => b.outstanding_paise - a.outstanding_paise);

    return {
        kind: receivable ? 'receivable' : 'payable',
        scope: { as_on: asOn, basis: 'From the ledger. Age is counted from the day each amount was charged; payments are set against the oldest charge first.' },
        parties, totals,
        // What the ledger says the control account holds, for comparison.
        net_paise: totals.outstanding_paise - totals.advance_paise,
    };
}

// ── a party's statement ─────────────────────────────────────────────────

async function partyStatement(conn, businessId, { partyId, from, to }) {
    const [[party]] = await conn.query('SELECT id, display_name, kind, phone, gstin FROM parties WHERE id = ? LIMIT 1', [partyId]);
    if (!party) return null;

    const base = `FROM journal_lines l JOIN journals j ON j.id = l.journal_id JOIN accounts a ON a.id = l.account_id
                   WHERE l.party_id = ? AND j.business_id = ? AND a.subtype IN ('receivable', 'payable')`;
    const [[opening]] = await conn.query(
        `SELECT COALESCE(SUM(l.debit_paise), 0) AS d, COALESCE(SUM(l.credit_paise), 0) AS c ${base} AND j.journal_date < ?`,
        [partyId, businessId, from]
    );
    const [lines] = await conn.query(
        `SELECT j.journal_no, j.journal_date, j.narration, j.source_type, l.debit_paise, l.credit_paise, l.memo, a.subtype ${base}
            AND j.journal_date BETWEEN ? AND ? ORDER BY j.journal_date, j.journal_no, l.line_no LIMIT 5000`,
        [partyId, businessId, from, to]
    );

    // Positive = they owe us (debit); negative = we owe them.
    let running = Number(opening.d) - Number(opening.c);
    const openingBalance = running;
    let debit = 0;
    let credit = 0;
    const rows = lines.map((l) => {
        const d = Number(l.debit_paise);
        const c = Number(l.credit_paise);
        debit += d; credit += c; running += d - c;
        return { journal_no: l.journal_no, date: ymd(l.journal_date), narration: l.narration, memo: l.memo, source_type: l.source_type, debit_paise: d, credit_paise: c, balance_paise: running };
    });
    return { party, scope: { from, to }, opening_paise: openingBalance, rows, totals: { debit_paise: debit, credit_paise: credit }, closing_paise: running };
}

// ── GST working papers ──────────────────────────────────────────────────
//
// These are working papers for an accountant, drawn from the books. They are
// not a return and not the portal's upload format, and e-invoicing (IRN) is not
// part of them.

const B2CL_LIMIT_PAISE = 250000 * 100;

const SALES_SIGN = "CASE WHEN d.doc_type = 'credit_note' THEN -1 ELSE 1 END";

async function salesRegister(conn, businessId, { from, to }) {
    const [docs] = await conn.query(
        `SELECT d.id, d.doc_no, d.doc_type, d.doc_date, d.party_snapshot, d.place_of_supply_state_code, d.supply_type,
                ${SALES_SIGN} AS sign,
                d.taxable_paise, d.cgst_paise, d.sgst_paise, d.utgst_paise, d.igst_paise, d.total_paise,
                p.display_name AS party_name, p.gstin AS party_gstin
           FROM sales_documents d
           LEFT JOIN parties p ON p.id = d.party_id
          WHERE d.business_id = ? AND d.status = 'issued' AND d.doc_type IN ('invoice', 'credit_note', 'debit_note')
            AND d.doc_date BETWEEN ? AND ?
          ORDER BY d.doc_date, d.doc_no`,
        [businessId, from, to]
    );

    const rows = docs.map((d) => {
        const snap = json(d.party_snapshot);
        const gstin = snap.gstin || d.party_gstin || '';
        const s = Number(d.sign);
        const total = s * Number(d.total_paise);
        const inter = d.supply_type === 'inter';
        let category;
        if (d.doc_type === 'invoice' || d.doc_type === 'debit_note') {
            category = gstin ? 'B2B' : (inter && Number(d.total_paise) > B2CL_LIMIT_PAISE ? 'B2CL' : 'B2CS');
        } else {
            category = gstin ? 'CDNR' : 'CDNUR';
        }
        return {
            date: ymd(d.doc_date), doc_no: d.doc_no, doc_type: d.doc_type, source: 'invoice',
            party: snap.name || snap.display_name || d.party_name || 'Customer', gstin,
            place_of_supply: d.place_of_supply_state_code || '', supply_type: d.supply_type || '',
            category,
            taxable_paise: s * Number(d.taxable_paise),
            cgst_paise: s * Number(d.cgst_paise),
            sgst_paise: s * (Number(d.sgst_paise) + Number(d.utgst_paise)),
            igst_paise: s * Number(d.igst_paise),
            total_paise: total,
        };
    });

    // Service and installation tickets never had a sales document — their money
    // reaches the books through journals. Net over the period, so a corrected
    // bill shows as the difference rather than as two bills.
    const [tickets] = await conn.query(
        `SELECT j.source_id, lk.ticket_ref, lk.source_type AS kind, MAX(j.journal_date) AS last_date,
                p.display_name AS party_name, p.gstin AS party_gstin,
                SUM(CASE WHEN a.code IN ('4000', '4010', '4020') THEN l.credit_paise - l.debit_paise ELSE 0 END) AS taxable,
                SUM(CASE WHEN a.code = '2100' THEN l.credit_paise - l.debit_paise ELSE 0 END) AS cgst,
                SUM(CASE WHEN a.code = '2110' THEN l.credit_paise - l.debit_paise ELSE 0 END) AS sgst,
                SUM(CASE WHEN a.code = '2120' THEN l.credit_paise - l.debit_paise ELSE 0 END) AS igst,
                SUM(CASE WHEN a.subtype = 'receivable' THEN l.debit_paise - l.credit_paise ELSE 0 END) AS billed
           FROM journals j
           JOIN journal_lines l ON l.journal_id = j.id
           JOIN accounts a ON a.id = l.account_id
           LEFT JOIN service_ledger_links lk ON lk.source_id = j.source_id
           LEFT JOIN parties p ON p.id = lk.party_id
          WHERE j.business_id = ? AND j.source_type = 'service' AND j.journal_date BETWEEN ? AND ?
          GROUP BY j.source_id, lk.ticket_ref, lk.source_type, p.display_name, p.gstin
         HAVING taxable <> 0 OR cgst <> 0 OR sgst <> 0 OR igst <> 0`,
        [businessId, from, to]
    );
    for (const t of tickets) {
        const gstin = t.party_gstin || '';
        const taxable = Number(t.taxable);
        rows.push({
            date: ymd(t.last_date), doc_no: t.ticket_ref || String(t.source_id).slice(0, 8),
            doc_type: t.kind === 'installation' ? 'installation_bill' : 'service_bill', source: 'ticket',
            party: t.party_name || 'Customer', gstin,
            place_of_supply: '', supply_type: 'intra',
            category: taxable < 0 ? (gstin ? 'CDNR' : 'CDNUR') : (gstin ? 'B2B' : 'B2CS'),
            taxable_paise: taxable, cgst_paise: Number(t.cgst), sgst_paise: Number(t.sgst), igst_paise: Number(t.igst),
            total_paise: taxable + Number(t.cgst) + Number(t.sgst) + Number(t.igst),
        });
    }
    rows.sort((a, b) => (a.date || '').localeCompare(b.date || '') || String(a.doc_no).localeCompare(String(b.doc_no)));
    return rows;
}

const sumBy = (rows, key) => rows.reduce((s, r) => s + (r[key] || 0), 0);

async function purchaseRegister(conn, businessId, { from, to }) {
    const [docs] = await conn.query(
        `SELECT d.doc_no, d.doc_type, d.doc_date, d.supplier_ref, d.party_snapshot, d.input_credit_eligible,
                CASE WHEN d.doc_type = 'purchase_return' THEN -1 ELSE 1 END AS sign,
                d.taxable_paise, d.cgst_paise, d.sgst_paise, d.utgst_paise, d.igst_paise, d.total_paise,
                p.display_name AS party_name, p.gstin AS party_gstin
           FROM purchase_documents d
           LEFT JOIN parties p ON p.id = d.party_id
          WHERE d.business_id = ? AND d.doc_type IN ('supplier_bill', 'purchase_return')
            AND d.status NOT IN ('draft', 'cancelled') AND d.doc_date BETWEEN ? AND ?
          ORDER BY d.doc_date, d.doc_no`,
        [businessId, from, to]
    );
    return docs.map((d) => {
        const snap = json(d.party_snapshot);
        const s = Number(d.sign);
        return {
            date: ymd(d.doc_date), doc_no: d.doc_no, doc_type: d.doc_type, supplier_ref: d.supplier_ref || '',
            party: snap.name || snap.display_name || d.party_name || 'Supplier', gstin: snap.gstin || d.party_gstin || '',
            eligible: !!d.input_credit_eligible,
            taxable_paise: s * Number(d.taxable_paise),
            cgst_paise: s * Number(d.cgst_paise),
            sgst_paise: s * (Number(d.sgst_paise) + Number(d.utgst_paise)),
            igst_paise: s * Number(d.igst_paise),
            total_paise: s * Number(d.total_paise),
        };
    });
}

async function hsnSummary(conn, businessId, { from, to }) {
    const [rows] = await conn.query(
        `SELECT COALESCE(l.hsn_sac, '') AS hsn, COALESCE(l.unit, '') AS unit, l.tax_rate_bps,
                SUM(${SALES_SIGN} * l.quantity) AS quantity,
                SUM(${SALES_SIGN} * l.taxable_paise) AS taxable,
                SUM(${SALES_SIGN} * l.cgst_paise) AS cgst,
                SUM(${SALES_SIGN} * (l.sgst_paise + l.utgst_paise)) AS sgst,
                SUM(${SALES_SIGN} * l.igst_paise) AS igst
           FROM sales_document_lines l
           JOIN sales_documents d ON d.id = l.document_id
          WHERE d.business_id = ? AND d.status = 'issued' AND d.doc_type IN ('invoice', 'credit_note', 'debit_note')
            AND d.doc_date BETWEEN ? AND ?
          GROUP BY l.hsn_sac, l.unit, l.tax_rate_bps
          ORDER BY l.hsn_sac, l.tax_rate_bps`,
        [businessId, from, to]
    );
    return rows.map((r) => ({
        hsn_sac: r.hsn, unit: r.unit, rate_pct: Number(r.tax_rate_bps || 0) / 100,
        quantity: Number(r.quantity), taxable_paise: Number(r.taxable),
        cgst_paise: Number(r.cgst), sgst_paise: Number(r.sgst), igst_paise: Number(r.igst),
        tax_paise: Number(r.cgst) + Number(r.sgst) + Number(r.igst),
    }));
}

// What the tax accounts moved by in the period — the ledger's own answer, to
// set beside what the documents add up to.
async function taxAccountMovement(conn, businessId, { from, to }) {
    const [rows] = await conn.query(
        `SELECT a.code, SUM(l.debit_paise) AS d, SUM(l.credit_paise) AS c
           FROM journal_lines l JOIN journals j ON j.id = l.journal_id JOIN accounts a ON a.id = l.account_id
          WHERE j.business_id = ? AND a.code IN ('2100', '2110', '2120', '1300', '1310', '1320')
            AND j.journal_date BETWEEN ? AND ?
          GROUP BY a.code`,
        [businessId, from, to]
    );
    const m = Object.fromEntries(rows.map((r) => [r.code, { d: Number(r.d), c: Number(r.c) }]));
    const out = (code) => (m[code] ? m[code].c - m[code].d : 0);
    const inn = (code) => (m[code] ? m[code].d - m[code].c : 0);
    return {
        output: { cgst_paise: out('2100'), sgst_paise: out('2110'), igst_paise: out('2120') },
        input: { cgst_paise: inn('1300'), sgst_paise: inn('1310'), igst_paise: inn('1320') },
    };
}

async function gstSummary(conn, businessId, { from, to }) {
    const sales = await salesRegister(conn, businessId, { from, to });
    const purchases = await purchaseRegister(conn, businessId, { from, to });
    const ledger = await taxAccountMovement(conn, businessId, { from, to });

    const byCategory = {};
    for (const r of sales) {
        const c = (byCategory[r.category] ||= { category: r.category, documents: 0, taxable_paise: 0, cgst_paise: 0, sgst_paise: 0, igst_paise: 0, total_paise: 0 });
        c.documents += 1;
        for (const k of ['taxable_paise', 'cgst_paise', 'sgst_paise', 'igst_paise', 'total_paise']) c[k] += r[k];
    }

    const output = {
        taxable_paise: sumBy(sales, 'taxable_paise'),
        cgst_paise: sumBy(sales, 'cgst_paise'), sgst_paise: sumBy(sales, 'sgst_paise'), igst_paise: sumBy(sales, 'igst_paise'),
    };
    const eligible = purchases.filter((p) => p.eligible);
    const input = {
        taxable_paise: sumBy(eligible, 'taxable_paise'),
        cgst_paise: sumBy(eligible, 'cgst_paise'), sgst_paise: sumBy(eligible, 'sgst_paise'), igst_paise: sumBy(eligible, 'igst_paise'),
    };
    const ineligible = purchases.filter((p) => !p.eligible);

    const tax = (o) => o.cgst_paise + o.sgst_paise + o.igst_paise;
    const payable = {
        cgst_paise: output.cgst_paise - input.cgst_paise,
        sgst_paise: output.sgst_paise - input.sgst_paise,
        igst_paise: output.igst_paise - input.igst_paise,
    };

    const gap = (a, b) => ({ documents_paise: a, ledger_paise: b, difference_paise: a - b });
    return {
        scope: { from, to, basis: 'Working papers drawn from the books for your accountant — not a return, and not the portal upload format. E-invoicing is not covered.' },
        output: { ...output, tax_paise: tax(output), by_category: Object.values(byCategory) },
        input: { ...input, tax_paise: tax(input), ineligible_tax_paise: ineligible.reduce((s, p) => s + p.cgst_paise + p.sgst_paise + p.igst_paise, 0), documents: purchases.length },
        payable: { ...payable, total_paise: payable.cgst_paise + payable.sgst_paise + payable.igst_paise },
        // Where the documents and the tax accounts should agree. A difference
        // usually means a manual journal touched a tax account.
        against_ledger: {
            output_cgst: gap(output.cgst_paise, ledger.output.cgst_paise),
            output_sgst: gap(output.sgst_paise, ledger.output.sgst_paise),
            output_igst: gap(output.igst_paise, ledger.output.igst_paise),
            input_cgst: gap(input.cgst_paise, ledger.input.cgst_paise),
            input_sgst: gap(input.sgst_paise, ledger.input.sgst_paise),
            input_igst: gap(input.igst_paise, ledger.input.igst_paise),
        },
    };
}

// ── stock and jobs ──────────────────────────────────────────────────────

async function stockValuation(conn, businessId) {
    const v = await stock.valuation(conn, { businessId });
    const [[ledger]] = await conn.query(
        `SELECT COALESCE(SUM(l.debit_paise - l.credit_paise), 0) AS bal
           FROM journal_lines l JOIN journals j ON j.id = l.journal_id JOIN accounts a ON a.id = l.account_id
          WHERE j.business_id = ? AND a.code = '1200'`, [businessId]
    );
    return {
        ...v,
        scope: { basis: 'Moving average cost, from the stock ledger' },
        ledger_inventory_paise: Number(ledger.bal),
        difference_paise: v.total_value_paise - Number(ledger.bal),
    };
}

// ── do the books agree with themselves? ─────────────────────────────────

async function reconciliation(conn, businessId, { asOn }) {
    const checks = [];
    // What the named parties add up to — lines with nobody attached are left out,
    // so the check can tell "the parties are wrong" from "nobody was named".
    const assigned = (aged) => aged.parties.filter((p) => p.party_id).reduce((n, p) => n + p.outstanding_paise - p.advance_paise, 0);
    const add = (key, label, ok, a, b, note, extra = {}) => checks.push({
        key, label, ok, a_paise: a, b_paise: b, difference_paise: (a ?? 0) - (b ?? 0), note, ...extra,
    });

    // 1. debits = credits
    const [[tb]] = await conn.query(
        `SELECT COALESCE(SUM(l.debit_paise), 0) AS d, COALESCE(SUM(l.credit_paise), 0) AS c
           FROM journal_lines l JOIN journals j ON j.id = l.journal_id WHERE j.business_id = ? AND j.journal_date <= ?`,
        [businessId, asOn]
    );
    add('trial_balance', 'Debits equal credits', Number(tb.d) === Number(tb.c), Number(tb.d), Number(tb.c),
        'Every journal is refused unless it balances, so this should always agree.');

    // 2. the balance sheet holds
    const bs = await balanceSheet(conn, businessId, { asOn });
    add('balance_sheet', 'Assets equal liabilities + equity + profit', bs.balanced, bs.totals.assets_paise, bs.totals.liabilities_and_equity_paise,
        'The accounting equation.');

    // 3. receivables: the control account against the parties behind it
    const aged = await ageing(conn, businessId, { kind: 'receivable', asOn });
    const [[recv]] = await conn.query(
        `SELECT COALESCE(SUM(l.debit_paise - l.credit_paise), 0) AS bal
           FROM journal_lines l JOIN journals j ON j.id = l.journal_id JOIN accounts a ON a.id = l.account_id
          WHERE j.business_id = ? AND a.subtype = 'receivable' AND j.journal_date <= ?`, [businessId, asOn]
    );
    add('receivable', 'Receivables: control account vs customers', Number(recv.bal) === assigned(aged), Number(recv.bal), assigned(aged),
        'The receivable account against what each customer owes, added up. A difference is money posted to receivables with no customer attached — usually a manual journal.');

    const agedPay = await ageing(conn, businessId, { kind: 'payable', asOn });
    const [[pay]] = await conn.query(
        `SELECT COALESCE(SUM(l.credit_paise - l.debit_paise), 0) AS bal
           FROM journal_lines l JOIN journals j ON j.id = l.journal_id JOIN accounts a ON a.id = l.account_id
          WHERE j.business_id = ? AND a.subtype = 'payable' AND j.journal_date <= ?`, [businessId, asOn]
    );
    add('payable', 'Payables: control account vs suppliers', Number(pay.bal) === assigned(agedPay), Number(pay.bal), assigned(agedPay),
        'The payable account against what is owed to each supplier, added up. A difference is money posted to payables with no supplier attached.');

    // 4. stock on the shelf against inventory in the books
    const sv = await stockValuation(conn, businessId);
    add('inventory', 'Stock value vs Inventory account', sv.difference_paise === 0, sv.total_value_paise, sv.ledger_inventory_paise,
        sv.difference_paise === 0 ? 'The stock count and the ledger agree.'
            : 'Stock the system holds that the books do not. Stock that was already on the shelf before accounting started has no opening entry yet — import it with Stock → Import Excel, or post an opening balance.',
        { items_out_of_step: sv.discrepancies.length });

    // 5. cash technicians are carrying
    const [[biz]] = await conn.query('SELECT service_ledger_from FROM businesses WHERE id = ? LIMIT 1', [businessId]);
    const from = ymd(biz?.service_ledger_from);
    if (from) {
        const [[held]] = await conn.query(
            `SELECT COALESCE(SUM(bill_total), 0) AS total FROM inquiries
              WHERE payment_status = 'paid' AND payment_method LIKE '%cash%' AND cash_collected_at IS NOT NULL
                AND cash_submitted_at IS NULL AND COALESCE(bill_generated_at, payment_received_at, created_at) >= ?`, [from]
        );
        const [[tech]] = await conn.query(
            `SELECT COALESCE(SUM(l.debit_paise - l.credit_paise), 0) AS bal
               FROM journal_lines l JOIN journals j ON j.id = l.journal_id JOIN accounts a ON a.id = l.account_id
              WHERE j.business_id = ? AND a.code = '1020' AND j.journal_date <= ?`, [businessId, asOn]
        );
        add('technician_cash', 'Cash with technicians vs tickets', Number(tech.bal) === money.toPaise(held.total), Number(tech.bal), money.toPaise(held.total),
            'The account against paid-in-cash tickets whose cash has not been handed in.');

        const [[blocked]] = await conn.query("SELECT COUNT(*) AS n FROM service_ledger_links WHERE business_id = ? AND status = 'blocked'", [businessId]);
        add('service_blocked', 'Service tickets waiting to be posted', Number(blocked.n) === 0, Number(blocked.n), 0,
            Number(blocked.n) ? 'See Business & Tax Setup → Service Income for the reasons.' : 'Nothing is stuck.', { count: true });
    }

    return { as_on: asOn, ok: checks.every((c) => c.ok), checks };
}

module.exports = {
    ymd, today, startOfFinancialYear, natural, resolveAccount,
    profitLoss, balanceSheet, accountLedger, ageing, partyStatement,
    salesRegister, purchaseRegister, hsnSummary, gstSummary, stockValuation, reconciliation,
};
