import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { computeDocument } = require('../server/modules/tax-engine.cjs');
const { toPaise } = require('../server/modules/money.cjs');

const HOME = '01'; // Jammu & Kashmir — where the business is
const line = (over = {}) => ({ description: 'Item', quantity: 1, rate_paise: toPaise('1000'), tax_rate_bps: 1800, ...over });

test('a plain intra-state sale splits into CGST and SGST', () => {
  const out = computeDocument({
    lines: [line({ quantity: 2, rate_paise: toPaise('1500') })],
    supplier_state_code: HOME,
    place_of_supply_state_code: HOME,
  });

  assert.equal(out.supply_type, 'intra');
  assert.equal(out.totals.taxable_paise, toPaise('3000'));
  assert.equal(out.totals.cgst_paise, toPaise('270'));
  assert.equal(out.totals.sgst_paise, toPaise('270'));
  assert.equal(out.totals.igst_paise, 0);
  assert.equal(out.totals.total_paise, toPaise('3540'));
});

test('a sale to another state is one IGST at the full rate', () => {
  const out = computeDocument({
    lines: [line({ quantity: 2, rate_paise: toPaise('1500') })],
    supplier_state_code: HOME,
    place_of_supply_state_code: '27',
  });

  assert.equal(out.supply_type, 'inter');
  assert.equal(out.totals.igst_paise, toPaise('540'));
  assert.equal(out.totals.cgst_paise, 0);
  assert.equal(out.totals.total_paise, toPaise('3540'));
});

test('a tax-inclusive price adds up to exactly what was quoted', () => {
  const out = computeDocument({
    lines: [line({ rate_paise: toPaise('1180') })],
    prices_include_tax: true,
    supplier_state_code: HOME,
    place_of_supply_state_code: HOME,
  });

  assert.equal(out.totals.taxable_paise, toPaise('1000'));
  assert.equal(out.totals.tax_paise, toPaise('180'));
  assert.equal(out.totals.total_paise, toPaise('1180'));
  assert.equal(out.totals.round_off_paise, 0);
});

test('an awkward inclusive price still reconciles to the paisa', () => {
  const quoted = toPaise('999.99');
  const out = computeDocument({
    lines: [line({ rate_paise: quoted })],
    prices_include_tax: true,
    round_to_rupee: false,
    supplier_state_code: HOME,
    place_of_supply_state_code: HOME,
  });

  assert.equal(out.totals.taxable_paise + out.totals.tax_paise, quoted);
  assert.equal(out.totals.cgst_paise + out.totals.sgst_paise, out.totals.tax_paise);
});

test('the halves of an intra-state tax never lose the odd paisa', () => {
  const out = computeDocument({
    lines: [line({ rate_paise: toPaise('100.05') })],
    round_to_rupee: false,
    supplier_state_code: HOME,
    place_of_supply_state_code: HOME,
  });
  assert.equal(out.totals.cgst_paise + out.totals.sgst_paise, out.totals.tax_paise);
  assert.equal(out.totals.taxable_paise + out.totals.tax_paise, out.totals.total_paise);
});

test('fractional quantities — 2.5 metres of cable — are exact', () => {
  const out = computeDocument({
    lines: [line({ description: 'CAT6 cable', quantity: 2.5, rate_paise: toPaise('33.33'), tax_rate_bps: 1800 })],
    round_to_rupee: false,
    supplier_state_code: HOME,
    place_of_supply_state_code: HOME,
  });
  // 2.5 × ₹33.33 = ₹83.325 → ₹83.33 at the paisa
  assert.equal(out.lines[0].gross_paise, 8333);
  assert.equal(out.totals.taxable_paise, 8333);
});

test('a line discount comes off before tax', () => {
  const out = computeDocument({
    lines: [line({ rate_paise: toPaise('1000'), discount_bps: 1000 })], // 10%
    supplier_state_code: HOME,
    place_of_supply_state_code: HOME,
  });
  assert.equal(out.lines[0].line_discount_paise, toPaise('100'));
  assert.equal(out.totals.taxable_paise, toPaise('900'));
  assert.equal(out.totals.tax_paise, toPaise('162'));
});

test('a document discount spreads across lines and adds back exactly', () => {
  const out = computeDocument({
    lines: [
      line({ rate_paise: toPaise('100') }),
      line({ rate_paise: toPaise('200') }),
      line({ rate_paise: toPaise('300') }),
    ],
    doc_discount_paise: toPaise('100'),
    round_to_rupee: false,
    supplier_state_code: HOME,
    place_of_supply_state_code: HOME,
  });

  const spread = out.lines.reduce((s, l) => s + l.doc_discount_share_paise, 0);
  assert.equal(spread, toPaise('100'), 'the spread parts must add back to the discount');
  assert.equal(out.totals.taxable_paise, toPaise('500'));
  assert.equal(out.totals.tax_paise, toPaise('90'));
});

test('lines at different rates are summarised rate-wise for the return', () => {
  const out = computeDocument({
    lines: [
      line({ description: 'Camera', rate_paise: toPaise('2000'), tax_rate_bps: 1800 }),
      line({ description: 'Cable', rate_paise: toPaise('1000'), tax_rate_bps: 1200 }),
      line({ description: 'Book', rate_paise: toPaise('500'), tax_rate_bps: 0, tax_treatment: 'exempt' }),
    ],
    supplier_state_code: HOME,
    place_of_supply_state_code: HOME,
  });

  const rates = out.tax_summary.map(r => `${r.treatment}:${r.rate_bps}`);
  assert.deepEqual(rates, ['exempt:0', 'gst:1200', 'gst:1800']);

  const exempt = out.tax_summary.find(r => r.treatment === 'exempt');
  assert.equal(exempt.taxable_paise, toPaise('500'));
  assert.equal(exempt.cgst_paise, 0);

  assert.equal(out.totals.tax_paise, toPaise('360') + toPaise('120'));
});

test('a non-GST treatment carries no tax even if a rate is passed with it', () => {
  // Guards the thing this must never become: an unrestricted switch that takes
  // the tax off an otherwise taxable supply.
  const out = computeDocument({
    lines: [line({ rate_paise: toPaise('1000'), tax_rate_bps: 1800, tax_treatment: 'non_gst' })],
    supplier_state_code: HOME,
    place_of_supply_state_code: HOME,
  });
  assert.equal(out.totals.tax_paise, 0);
  assert.equal(out.totals.total_paise, toPaise('1000'));
  assert.equal(out.tax_summary[0].treatment, 'non_gst');
});

test('charges are taxed in their own right, not folded into a line', () => {
  const out = computeDocument({
    lines: [line({ rate_paise: toPaise('1000') })],
    charges: [{ label: 'Installation visit', amount_paise: toPaise('500'), tax_rate_bps: 1800 }],
    supplier_state_code: HOME,
    place_of_supply_state_code: HOME,
  });
  assert.equal(out.totals.charges_paise, toPaise('500'));
  assert.equal(out.totals.taxable_paise, toPaise('1500'));
  assert.equal(out.totals.total_paise, toPaise('1770'));
});

test('rounding to the rupee is reported so it can be posted', () => {
  const out = computeDocument({
    lines: [line({ rate_paise: toPaise('1656.35') })],
    supplier_state_code: HOME,
    place_of_supply_state_code: HOME,
  });
  const beforeRounding = out.totals.taxable_paise + out.totals.tax_paise;
  assert.equal(out.totals.total_paise, beforeRounding + out.totals.round_off_paise);
  assert.equal(out.totals.total_paise % 100, 0, 'the printed total is a whole rupee');
});

test('a credit note is the same arithmetic with the quantities back', () => {
  const invoice = computeDocument({
    lines: [line({ quantity: 3, rate_paise: toPaise('1500') })],
    supplier_state_code: HOME,
    place_of_supply_state_code: HOME,
  });
  const credit = computeDocument({
    lines: [line({ quantity: 1, rate_paise: toPaise('1500') })],
    supplier_state_code: HOME,
    place_of_supply_state_code: HOME,
  });
  assert.equal(credit.totals.total_paise * 3, invoice.totals.total_paise);
  assert.equal(credit.totals.cgst_paise, toPaise('135'));
});

test('impossible documents are refused, not quietly fixed', () => {
  assert.throws(() => computeDocument({
    lines: [line({ discount_paise: toPaise('2000') })],
    supplier_state_code: HOME, place_of_supply_state_code: HOME,
  }), /discount is more than the line/);

  assert.throws(() => computeDocument({
    lines: [line()], doc_discount_paise: toPaise('5000'),
    supplier_state_code: HOME, place_of_supply_state_code: HOME,
  }), /discount is more than the document/);

  assert.throws(() => computeDocument({
    lines: [line({ quantity: -1 })],
    supplier_state_code: HOME, place_of_supply_state_code: HOME,
  }), /negative quantity/);

  assert.throws(() => computeDocument({
    lines: [line()], supplier_state_code: '', place_of_supply_state_code: HOME,
  }), /no state/);
});

test('a union territory charges UTGST, and it still adds up', () => {
  const out = computeDocument({
    lines: [line({ rate_paise: toPaise('1000') })],
    supplier_state_code: '04',
    place_of_supply_state_code: '04',
  });
  assert.equal(out.totals.utgst_paise, toPaise('90'));
  assert.equal(out.totals.sgst_paise, 0);
  assert.equal(out.totals.cgst_paise + out.totals.utgst_paise, out.totals.tax_paise);
});
