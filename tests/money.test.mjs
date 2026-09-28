import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const money = require('../server/modules/money.cjs');

const {
  toPaise, toDecimalString, formatINR, sum, applyBps,
  extractInclusive, allocate, roundToRupee, percentToBps,
} = money;

test('reads what the database and a human actually give us', () => {
  assert.equal(toPaise('1234.56'), 123456);   // mysql2 hands DECIMAL back as a string
  assert.equal(toPaise('90.00'), 9000);
  assert.equal(toPaise(1234.56), 123456);
  assert.equal(toPaise(1234), 123400);
  assert.equal(toPaise('₹1,234.56'), 123456);
  assert.equal(toPaise('-45.5'), -4550);
  assert.equal(toPaise(null), 0);
  assert.equal(toPaise(''), 0);
  // a third decimal is a rounding decision, not a parse error
  assert.equal(toPaise('10.005'), 1001);
  assert.equal(toPaise('10.004'), 1000);
});

test('refuses rubbish instead of reading it as zero', () => {
  for (const bad of ['abc', '12.3.4', {}, [], NaN, Infinity, '--5']) {
    assert.throws(() => toPaise(bad), TypeError, `should have rejected ${JSON.stringify(bad)}`);
  }
});

test('the float trap the whole module exists for', () => {
  // 0.1 + 0.2 === 0.30000000000000004 in floats; in paise it is just 30.
  assert.equal(sum([toPaise('0.10'), toPaise('0.20')]), 30);
  // ₹1,656.35 split off a bill, a hundred times over, must not drift a paisa
  const hundred = Array.from({ length: 100 }, () => toPaise('1656.35'));
  assert.equal(sum(hundred), 16563500);
  assert.equal(toDecimalString(sum(hundred)), '165635.00');
});

test('writes back in the shape the columns expect', () => {
  assert.equal(toDecimalString(123456), '1234.56');
  assert.equal(toDecimalString(5), '0.05');
  assert.equal(toDecimalString(-4550), '-45.50');
  assert.equal(toDecimalString(0), '0.00');
});

test('prints rupees the way an Indian bill prints them', () => {
  assert.equal(formatINR(12345678), '₹1,23,456.78');
  assert.equal(formatINR(100000), '₹1,000.00');
  assert.equal(formatINR(5), '₹0.05');
  assert.equal(formatINR(-123456), '-₹1,234.56');
  assert.equal(formatINR(123456, { symbol: false }), '1,234.56');
});

test('tax in basis points, rounded like the printed bill', () => {
  assert.equal(percentToBps(18), 1800);
  assert.equal(percentToBps('2.5'), 250);
  assert.equal(applyBps(toPaise('100'), 1800), 1800);          // ₹100 @ 18% = ₹18
  assert.equal(applyBps(toPaise('1656.35'), 1800), 29814);     // ₹298.14
  assert.equal(applyBps(toPaise('0.01'), 1800), 0);            // rounds down, not to a fraction
  assert.equal(applyBps(toPaise('-100'), 1800), -1800);        // credit notes carry tax back
});

test('a tax-inclusive price splits back exactly', () => {
  const { net, tax } = extractInclusive(toPaise('118'), 1800);
  assert.equal(net, 10000);
  assert.equal(tax, 1800);
  assert.equal(net + tax, toPaise('118'));

  // the awkward one: the split never adds up to more or less than quoted
  const odd = extractInclusive(toPaise('999.99'), 1800);
  assert.equal(odd.net + odd.tax, toPaise('999.99'));
});

test('a document discount spreads across lines without losing a paisa', () => {
  const lines = [toPaise('100'), toPaise('200'), toPaise('300')];
  const parts = allocate(toPaise('100'), lines);
  assert.equal(sum(parts), toPaise('100'));
  assert.deepEqual(parts, [1667, 3333, 5000]);

  // the classic ₹10 across three equal lines — 3.34 + 3.33 + 3.33
  const thirds = allocate(1000, [1, 1, 1]);
  assert.equal(sum(thirds), 1000);
  assert.deepEqual(thirds, [334, 333, 333]);

  // a credit note allocating a negative amount must still add back exactly
  const credit = allocate(-1000, [1, 1, 1]);
  assert.equal(sum(credit), -1000);

  // nothing to weigh by
  assert.equal(sum(allocate(1000, [0, 0, 0])), 1000);
});

test('rounding to the rupee is a posting, not a silent fudge', () => {
  assert.deepEqual(roundToRupee(123456), { rounded: 123500, adjustment: 44 });
  assert.deepEqual(roundToRupee(123412), { rounded: 123400, adjustment: -12 });
  assert.deepEqual(roundToRupee(123400), { rounded: 123400, adjustment: 0 });
  assert.deepEqual(roundToRupee(-123456), { rounded: -123500, adjustment: -44 });
});
