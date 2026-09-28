import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateGstin, gstinCheckDigit, supplyType, splitTax, stateName } = require('../server/modules/gst.cjs');

// Built from the published check-digit scheme rather than copied from a real
// registration, so no live GSTIN appears in the test suite.
const withCheckDigit = (first14) => first14 + gstinCheckDigit(first14);
const JK = withCheckDigit('01ABCDE1234F1Z');   // Jammu & Kashmir — the home state
const MH = withCheckDigit('27ABCDE1234F1Z');   // Maharashtra
const CH = withCheckDigit('04ABCDE1234F1Z');   // Chandigarh, a union territory

test('accepts a well-formed GSTIN and reads it', () => {
  const out = validateGstin(JK);
  assert.equal(out.valid, true);
  assert.equal(out.state_code, '01');
  assert.equal(out.pan, 'ABCDE1234F');
  assert.equal(stateName('01'), 'Jammu and Kashmir');
});

test('catches the typo a human actually makes', () => {
  assert.equal(validateGstin('').valid, false);
  assert.equal(validateGstin('27ABCDE1234F1Z').valid, false);            // 14 characters
  assert.equal(validateGstin('27ABCDE1234F1Z5X').valid, false);          // 16
  assert.equal(validateGstin('AB27CDE1234F1Z5').valid, false);           // letters where digits go
  // right shape, wrong check digit
  const wrong = JK.slice(0, 14) + (JK[14] === 'A' ? 'B' : 'A');
  const out = validateGstin(wrong);
  assert.equal(out.valid, false);
  assert.match(out.reason, /check digit/i);
});

test('same state splits into CGST and SGST, another state is IGST', () => {
  const intra = supplyType({ supplierStateCode: '01', placeOfSupplyStateCode: '01' });
  assert.equal(intra.intra, true);
  assert.deepEqual(intra.components, ['cgst', 'sgst']);

  const inter = supplyType({ supplierStateCode: '01', placeOfSupplyStateCode: '27' });
  assert.equal(inter.intra, false);
  assert.deepEqual(inter.components, ['igst']);
});

test('a union territory charges UTGST in place of SGST', () => {
  const ut = supplyType({ supplierStateCode: '04', placeOfSupplyStateCode: '04' });
  assert.deepEqual(ut.components, ['cgst', 'utgst']);
  assert.equal(validateGstin(CH).state_code, '04');
  assert.equal(validateGstin(MH).state_code, '27');
});

test('no place of supply means the supply stays at home', () => {
  const out = supplyType({ supplierStateCode: '01', placeOfSupplyStateCode: null });
  assert.equal(out.intra, true);
});

test('an unset business state is an error, not a guess', () => {
  assert.ok(supplyType({ supplierStateCode: '', placeOfSupplyStateCode: '01' }).error);
  assert.ok(supplyType({ supplierStateCode: '01', placeOfSupplyStateCode: '99' }).error);
});

test('the halves of an intra-state tax add back to the whole', () => {
  const odd = splitTax(1801, ['cgst', 'sgst']);          // ₹18.01 does not halve evenly
  assert.equal(odd.cgst + odd.sgst, 1801);
  assert.equal(odd.cgst, 901);
  assert.equal(odd.sgst, 900);

  assert.deepEqual(splitTax(1800, ['cgst', 'sgst']), { cgst: 900, sgst: 900 });
  assert.deepEqual(splitTax(1800, ['igst']), { igst: 1800 });

  // a credit note carries the tax back the same way
  const back = splitTax(-1801, ['cgst', 'sgst']);
  assert.equal(back.cgst + back.sgst, -1801);
});
