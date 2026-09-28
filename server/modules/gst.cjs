'use strict';

// GST mechanics — the parts that are arithmetic, not policy.
//
// Scope note, deliberately narrow: this file validates a GSTIN's structure and
// decides intra- vs inter-state treatment from two state codes. It does NOT
// decide which rate a product attracts, whether a supply is exempt, or what a
// return must contain. Those are statutory questions; they belong in the
// configured tax rates and in a checklist item that says an accountant signed
// them off against current CBIC guidance. Nothing here should be read as tax
// advice given by the software.

// 15 characters: 2 state code, 10 PAN, 1 entity number, 1 'Z' by convention,
// 1 check digit.
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// The published check-digit scheme: weight each of the first 14 characters
// alternately by 1 and 2 over a base-36 alphabet, sum the quotients and
// remainders, and the check character is what takes that sum to a multiple
// of 36.
function gstinCheckDigit(first14) {
    let sum = 0;
    for (let i = 0; i < 14; i += 1) {
        const value = ALPHABET.indexOf(first14[i]);
        if (value < 0) return null;
        const product = value * (i % 2 === 0 ? 1 : 2);
        sum += Math.floor(product / 36) + (product % 36);
    }
    return ALPHABET[(36 - (sum % 36)) % 36];
}

function validateGstin(gstin) {
    const value = String(gstin || '').trim().toUpperCase();
    if (!value) return { valid: false, reason: 'empty' };
    if (value.length !== 15) return { valid: false, reason: 'A GSTIN is 15 characters' };
    if (!GSTIN_RE.test(value)) return { valid: false, reason: 'That is not the shape of a GSTIN' };

    const expected = gstinCheckDigit(value.slice(0, 14));
    if (expected && expected !== value[14]) {
        return { valid: false, reason: 'The check digit does not match — look for a typo' };
    }

    return {
        valid: true,
        gstin: value,
        state_code: value.slice(0, 2),
        pan: value.slice(2, 12),
    };
}

// State and union-territory codes as they appear in the first two digits of a
// GSTIN. Used for place of supply and for the intra/inter-state decision.
const STATE_CODES = {
    '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
    '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
    10: 'Bihar', 11: 'Sikkim', 12: 'Arunachal Pradesh', 13: 'Nagaland', 14: 'Manipur',
    15: 'Mizoram', 16: 'Tripura', 17: 'Meghalaya', 18: 'Assam', 19: 'West Bengal',
    20: 'Jharkhand', 21: 'Odisha', 22: 'Chhattisgarh', 23: 'Madhya Pradesh', 24: 'Gujarat',
    26: 'Dadra and Nagar Haveli and Daman and Diu', 27: 'Maharashtra', 29: 'Karnataka',
    30: 'Goa', 31: 'Lakshadweep', 32: 'Kerala', 33: 'Tamil Nadu', 34: 'Puducherry',
    35: 'Andaman and Nicobar Islands', 36: 'Telangana', 37: 'Andhra Pradesh',
    38: 'Ladakh', 97: 'Other Territory',
};

// Union territories without their own legislature charge UTGST in place of
// SGST. The split is the same; the account it lands in is not.
const UNION_TERRITORIES = new Set(['04', '26', '31', '35', '38', '97']);

const stateName = (code) => STATE_CODES[String(code).padStart(2, '0')] || null;

/**
 * Intra-state or inter-state, and therefore which taxes apply.
 * Two equal state codes split the rate into CGST + SGST (or UTGST);
 * anything else is a single IGST at the full rate.
 */
function supplyType({ supplierStateCode, placeOfSupplyStateCode }) {
    const from = String(supplierStateCode || '').padStart(2, '0');
    const to = String(placeOfSupplyStateCode || from).padStart(2, '0');
    if (!stateName(from)) return { error: 'The business has no state set' };
    if (!stateName(to)) return { error: 'The place of supply has no valid state' };

    const intra = from === to;
    return {
        intra,
        components: intra ? (UNION_TERRITORIES.has(to) ? ['cgst', 'utgst'] : ['cgst', 'sgst']) : ['igst'],
        from,
        to,
    };
}

/**
 * Split a computed tax amount across its components. The halves of an
 * intra-state tax must add back to the whole exactly, so the odd paisa goes to
 * CGST rather than disappearing.
 */
function splitTax(taxPaise, components) {
    if (components.length === 1) return { [components[0]]: taxPaise };
    const half = Math.trunc(Math.abs(taxPaise) / 2);
    const sign = Math.sign(taxPaise);
    const first = sign * (Math.abs(taxPaise) - half);
    const second = sign * half;
    return { [components[0]]: first, [components[1]]: second };
}

module.exports = {
    validateGstin,
    gstinCheckDigit,
    supplyType,
    splitTax,
    stateName,
    STATE_CODES,
    UNION_TERRITORIES,
};
