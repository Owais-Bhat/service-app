'use strict';

// Money, exactly.
//
// Every amount in the accounting modules is an integer number of paise. No
// financial value is ever held in a JavaScript float: 0.1 + 0.2 is not 0.3,
// and a bill that is one paisa out is a bill the customer will argue about.
//
// MySQL DECIMAL columns are exact, and mysql2 hands them back as strings, so
// the boundary rule is simple:
//   reading  → toPaise(row.amount)   (string/number/decimal → integer paise)
//   writing  → toDecimalString(p)    (integer paise → "1234.56" for DECIMAL)
//             or the integer itself  (for the new *_paise BIGINT columns)
// Arithmetic in between is plain integer arithmetic.

const MAX_SAFE_PAISE = Number.MAX_SAFE_INTEGER; // ≈ ₹90,07,19,92,54,740 — far beyond any invoice

function fail(value, why) {
    throw new TypeError(`Not a valid money value (${why}): ${JSON.stringify(value)}`);
}

// Accepts what the database, an API body or a form field realistically hands
// us: "1234.56", "₹1,234.56", 1234.56, 1234, null. Rejects anything else
// rather than silently reading it as zero.
function toPaise(value) {
    if (value === null || value === undefined || value === '') return 0;

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) fail(value, 'not finite');
        // A float reaching us is already suspect, but a rupee figure typed by
        // a human is fine — round at the paisa and move on.
        return Math.round(value * 100);
    }

    if (typeof value !== 'string') fail(value, 'unsupported type');

    const cleaned = value.replace(/[₹,\s]/g, '');
    if (!/^-?\d*(\.\d*)?$/.test(cleaned) || cleaned === '' || cleaned === '-') fail(value, 'unparseable');

    const negative = cleaned.startsWith('-');
    const [rupees, fraction = ''] = cleaned.replace('-', '').split('.');
    // More than two decimals is a rounding decision, not a parse error:
    // round half-up at the paisa, the way a printed bill does.
    const paiseDigits = (fraction + '00').slice(0, 2);
    const rest = fraction.slice(2);
    let paise = Number(rupees || '0') * 100 + Number(paiseDigits);
    if (rest && Number(rest[0]) >= 5) paise += 1;
    if (!Number.isSafeInteger(paise)) fail(value, 'out of range');
    return negative ? -paise : paise;
}

// For DECIMAL(x,2) columns and anything that must read back as a plain number.
function toDecimalString(paise) {
    assertPaise(paise);
    const sign = paise < 0 ? '-' : '';
    const abs = Math.abs(paise);
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// ₹1,23,456.78 — Indian grouping, for PDFs and screens.
function formatINR(paise, { symbol = true } = {}) {
    assertPaise(paise);
    const sign = paise < 0 ? '-' : '';
    const abs = Math.abs(paise);
    const rupees = String(Math.floor(abs / 100));
    const last3 = rupees.slice(-3);
    const rest = rupees.slice(0, -3);
    const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
    return `${sign}${symbol ? '₹' : ''}${grouped}.${String(abs % 100).padStart(2, '0')}`;
}

function assertPaise(value) {
    if (!Number.isSafeInteger(value)) fail(value, 'expected integer paise');
    if (Math.abs(value) > MAX_SAFE_PAISE) fail(value, 'out of range');
    return value;
}

const sum = (list) => list.reduce((total, p) => total + assertPaise(p), 0);

// Rates are held in basis points — 18% is 1800, 2.5% is 250 — so a tax rate is
// an integer too and never drifts.
const percentToBps = (percent) => {
    const n = Number(percent);
    if (!Number.isFinite(n)) fail(percent, 'not a percentage');
    return Math.round(n * 100);
};
const bpsToPercent = (bps) => bps / 100;

// Tax, discount and share calculations all round the same way: half-up at the
// paisa, which is what a printed bill shows and what the customer adds up.
function applyBps(paise, bps) {
    assertPaise(paise);
    if (!Number.isInteger(bps)) fail(bps, 'expected integer basis points');
    const product = paise * bps;
    const rounded = Math.sign(product) * Math.round(Math.abs(product) / 10000);
    return rounded;
}

// A tax-inclusive price, split back out: ₹118 at 18% is ₹100 + ₹18, and the
// two always add back to exactly what the customer was quoted.
function extractInclusive(grossPaise, bps) {
    assertPaise(grossPaise);
    const net = Math.sign(grossPaise) * Math.round(Math.abs(grossPaise) * 10000 / (10000 + bps));
    return { net, tax: grossPaise - net };
}

// Spread an amount across weights so the parts add back to the whole exactly —
// used for document-level discounts, freight and landed cost. The remainder
// after integer division goes to the largest weights first (largest-remainder),
// so no line silently absorbs everyone else's paise.
function allocate(totalPaise, weights) {
    assertPaise(totalPaise);
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) {
        // Nothing to weigh by — split as evenly as the paise allow.
        const each = Math.trunc(totalPaise / (weights.length || 1));
        const out = weights.map(() => each);
        let left = totalPaise - each * weights.length;
        for (let i = 0; left !== 0 && i < out.length; i += 1) {
            const step = left > 0 ? 1 : -1;
            out[i] += step;
            left -= step;
        }
        return out;
    }

    const exact = weights.map((w) => (totalPaise * w) / total);
    const floors = exact.map((v) => Math.floor(v));
    let left = totalPaise - floors.reduce((a, b) => a + b, 0);
    const order = exact
        .map((v, i) => ({ i, rem: v - Math.floor(v) }))
        .sort((a, b) => b.rem - a.rem || a.i - b.i);
    for (let k = 0; left > 0; k += 1, left -= 1) floors[order[k % order.length].i] += 1;
    while (left < 0) { floors[order[order.length - 1 + left].i] -= 1; left += 1; }
    return floors;
}

// Invoice rounding: the difference between the computed total and the rounded
// one is a real posting (Round Off account), never a silent adjustment.
function roundToRupee(paise) {
    assertPaise(paise);
    const rounded = Math.sign(paise) * Math.round(Math.abs(paise) / 100) * 100;
    return { rounded, adjustment: rounded - paise };
}

module.exports = {
    toPaise,
    toDecimalString,
    formatINR,
    assertPaise,
    sum,
    percentToBps,
    bpsToPercent,
    applyBps,
    extractInclusive,
    allocate,
    roundToRupee,
};
