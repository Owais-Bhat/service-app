'use strict';

// What a document adds up to.
//
// One pure function computes every sales document in the system — estimate,
// proforma, invoice, credit note — so a quotation and the invoice it becomes
// can never disagree about the arithmetic. It takes lines and settings, and
// returns lines, totals and a rate-wise tax summary. It reads nothing, writes
// nothing and decides no policy: which rate a product attracts, and whether a
// supply is exempt, comes in as configured input.
//
// Rules it enforces, because getting them wrong is how bills end up a rupee out:
//   * every amount is integer paise, every rate integer basis points
//   * a tax-inclusive price splits back to exactly what the customer was quoted
//   * a document-level discount allocates across lines and adds back exactly
//   * intra-state tax halves add back to the whole; the odd paisa goes to CGST
//   * rounding to the rupee is reported as its own figure, to be posted

const { assertPaise, applyBps, extractInclusive, allocate, roundToRupee } = require('./money.cjs');
const { supplyType, splitTax } = require('./gst.cjs');

// Quantities are held in thousandths so 2.5 metres of cable, or a third of a
// roll, is exact rather than a float.
const MILLI = 1000;
const toMilli = (qty) => {
    const n = Number(qty);
    if (!Number.isFinite(n)) throw new TypeError(`Not a valid quantity: ${JSON.stringify(qty)}`);
    return Math.round(n * MILLI);
};

// A treatment that is not 'gst' carries no rate, whatever rate was passed in:
// exempt, nil-rated, zero-rated and non-GST are different reasons for no tax,
// and none of them is "18% switched off".
const effectiveRate = (line) => (line.tax_treatment && line.tax_treatment !== 'gst' ? 0 : (Number(line.tax_rate_bps) || 0));

/**
 * @param {object} input
 * @param {Array}  input.lines            [{ description, quantity, rate_paise, discount_bps?, discount_paise?, tax_rate_bps, tax_treatment?, item_id?, cost_rate_paise? }]
 * @param {boolean} [input.prices_include_tax]  the rates quoted already contain the tax
 * @param {number} [input.doc_discount_paise]   a discount on the whole document
 * @param {number} [input.doc_discount_bps]     …or a percentage of it
 * @param {Array}  [input.charges]         [{ label, amount_paise, tax_rate_bps?, tax_treatment? }] freight and the like
 * @param {string} input.supplier_state_code
 * @param {string} [input.place_of_supply_state_code]
 * @param {boolean} [input.round_to_rupee]
 */
function computeDocument(input) {
    const {
        lines = [],
        charges = [],
        prices_include_tax: inclusive = false,
        doc_discount_paise: docDiscountFlat = 0,
        doc_discount_bps: docDiscountBps = 0,
        supplier_state_code: supplierStateCode,
        place_of_supply_state_code: placeOfSupply,
        round_to_rupee: roundToRupeeFlag = true,
    } = input;

    const supply = supplyType({ supplierStateCode, placeOfSupplyStateCode: placeOfSupply });
    if (supply.error) throw new Error(supply.error);

    // ── 1. each line on its own ─────────────────────────────────────────
    const computed = lines.map((line, i) => {
        const qtyMilli = toMilli(line.quantity ?? 1);
        const rate = assertPaise(Number(line.rate_paise) || 0);
        if (qtyMilli < 0) throw new Error(`Line ${i + 1} has a negative quantity`);

        const gross = Math.round((qtyMilli * rate) / MILLI);
        const lineDiscount = line.discount_paise !== undefined
            ? assertPaise(Number(line.discount_paise) || 0)
            : applyBps(gross, Number(line.discount_bps) || 0);
        if (lineDiscount > gross) throw new Error(`Line ${i + 1}'s discount is more than the line itself`);

        return {
            ...line,
            quantity: qtyMilli / MILLI,
            rate_paise: rate,
            gross_paise: gross,
            line_discount_paise: lineDiscount,
            // after the line's own discount, before the document's
            net_of_line_discount: gross - lineDiscount,
            tax_rate_bps: effectiveRate(line),
            tax_treatment: line.tax_treatment || 'gst',
        };
    });

    // ── 2. the document-level discount, spread across the lines ─────────
    // Spread so the parts add back to the whole exactly; a discount that
    // belonged to no line would leave the tax wrong on every line.
    const lineBase = computed.reduce((sum, l) => sum + l.net_of_line_discount, 0);
    const docDiscount = docDiscountFlat
        ? assertPaise(docDiscountFlat)
        : applyBps(lineBase, docDiscountBps);
    if (docDiscount > lineBase) throw new Error('The document discount is more than the document');

    const shares = docDiscount
        ? allocate(docDiscount, computed.map((l) => l.net_of_line_discount))
        : computed.map(() => 0);

    // ── 3. tax, line by line ────────────────────────────────────────────
    const priced = computed.map((line, i) => {
        const afterDoc = line.net_of_line_discount - shares[i];
        const bps = line.tax_rate_bps;

        // A tax-inclusive rate has the tax inside it; taking it back out is the
        // only way the printed total matches what was quoted.
        const { net, tax } = inclusive && bps
            ? extractInclusive(afterDoc, bps)
            : { net: afterDoc, tax: applyBps(afterDoc, bps) };

        const split = splitTax(tax, supply.components);
        return {
            ...line,
            doc_discount_share_paise: shares[i],
            taxable_paise: net,
            tax_paise: tax,
            cgst_paise: split.cgst || 0,
            sgst_paise: split.sgst || 0,
            utgst_paise: split.utgst || 0,
            igst_paise: split.igst || 0,
            amount_paise: net + tax,
        };
    });

    // ── 4. charges (freight, visit, installation) ───────────────────────
    const pricedCharges = charges.map((charge) => {
        const amount = assertPaise(Number(charge.amount_paise) || 0);
        const bps = charge.tax_treatment && charge.tax_treatment !== 'gst' ? 0 : (Number(charge.tax_rate_bps) || 0);
        const { net, tax } = inclusive && bps
            ? extractInclusive(amount, bps)
            : { net: amount, tax: applyBps(amount, bps) };
        const split = splitTax(tax, supply.components);
        return {
            ...charge,
            taxable_paise: net,
            tax_rate_bps: bps,
            tax_paise: tax,
            cgst_paise: split.cgst || 0,
            sgst_paise: split.sgst || 0,
            utgst_paise: split.utgst || 0,
            igst_paise: split.igst || 0,
            amount_paise: net + tax,
        };
    });

    const all = [...priced, ...pricedCharges];
    const add = (key) => all.reduce((sum, l) => sum + (l[key] || 0), 0);

    const taxable = add('taxable_paise');
    const cgst = add('cgst_paise');
    const sgst = add('sgst_paise');
    const utgst = add('utgst_paise');
    const igst = add('igst_paise');
    const taxTotal = cgst + sgst + utgst + igst;
    const beforeRounding = taxable + taxTotal;
    const { rounded, adjustment } = roundToRupeeFlag ? roundToRupee(beforeRounding) : { rounded: beforeRounding, adjustment: 0 };

    // ── 5. the rate-wise summary a tax return asks for ──────────────────
    const summary = new Map();
    all.forEach((l) => {
        const key = `${l.tax_treatment || 'gst'}:${l.tax_rate_bps}`;
        const row = summary.get(key) || {
            treatment: l.tax_treatment || 'gst', rate_bps: l.tax_rate_bps,
            taxable_paise: 0, cgst_paise: 0, sgst_paise: 0, utgst_paise: 0, igst_paise: 0,
        };
        row.taxable_paise += l.taxable_paise;
        row.cgst_paise += l.cgst_paise || 0;
        row.sgst_paise += l.sgst_paise || 0;
        row.utgst_paise += l.utgst_paise || 0;
        row.igst_paise += l.igst_paise || 0;
        summary.set(key, row);
    });

    return {
        supply_type: supply.intra ? 'intra' : 'inter',
        tax_components: supply.components,
        lines: priced,
        charges: pricedCharges,
        tax_summary: [...summary.values()].sort((a, b) => a.rate_bps - b.rate_bps),
        totals: {
            gross_paise: computed.reduce((s, l) => s + l.gross_paise, 0),
            line_discount_paise: computed.reduce((s, l) => s + l.line_discount_paise, 0),
            doc_discount_paise: docDiscount,
            charges_paise: pricedCharges.reduce((s, c) => s + c.taxable_paise, 0),
            taxable_paise: taxable,
            cgst_paise: cgst,
            sgst_paise: sgst,
            utgst_paise: utgst,
            igst_paise: igst,
            tax_paise: taxTotal,
            round_off_paise: adjustment,
            total_paise: rounded,
        },
    };
}

/**
 * The GST contained in the prices of a non-GST bill that is asked to show it:
 * each line's amount is read as tax-inclusive at its `info_tax_bps` and the tax
 * is taken back out, so net + tax is exactly the amount the customer pays.
 *
 * This is for printing only. Nothing here is charged, posted to the ledger or
 * reported — the document's own tax columns stay zero.
 */
function informationalGst({ lines = [], supplier_state_code: supplierStateCode, place_of_supply_state_code: placeOfSupply }) {
    const supply = supplyType({ supplierStateCode, placeOfSupplyStateCode: placeOfSupply });
    if (supply.error) return null;

    const out = { taxable_paise: 0, cgst_paise: 0, sgst_paise: 0, igst_paise: 0, tax_paise: 0, lines: [], intra: supply.intra };
    for (const l of lines) {
        const amount = Number(l.amount_paise) || 0;
        const bps = Number(l.info_tax_bps) || 0;
        const { net, tax } = bps ? extractInclusive(amount, bps) : { net: amount, tax: 0 };
        const split = splitTax(tax, supply.components);
        const cgst = split.cgst || 0;
        const sgst = (split.sgst || 0) + (split.utgst || 0);
        const igst = split.igst || 0;
        out.lines.push({ bps, net_paise: net, tax_paise: tax, cgst_paise: cgst, sgst_paise: sgst, igst_paise: igst });
        out.taxable_paise += net;
        out.cgst_paise += cgst;
        out.sgst_paise += sgst;
        out.igst_paise += igst;
        out.tax_paise += tax;
    }
    return out;
}

module.exports = { computeDocument, toMilli, informationalGst };
