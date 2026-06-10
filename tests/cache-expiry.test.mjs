import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const {
  cacheTtlUntilMidnight,
  secondsUntilNextMidnight,
} = require('../server/cache-expiry.cjs');

const IST_OFFSET_MINUTES = 330;

test('calculates expiry at the next midnight in India', () => {
  const elevenFiftyNinePmIst = Date.parse('2026-06-10T18:29:00.000Z');
  assert.equal(
    secondsUntilNextMidnight(elevenFiftyNinePmIst, IST_OFFSET_MINUTES),
    60,
  );
});

test('keeps a shorter cache TTL during the day', () => {
  const noonIst = Date.parse('2026-06-10T06:30:00.000Z');
  assert.equal(cacheTtlUntilMidnight(300, noonIst, IST_OFFSET_MINUTES), 300);
});

test('caps a cache TTL so it cannot cross midnight', () => {
  const elevenFiftyNinePmIst = Date.parse('2026-06-10T18:29:00.000Z');
  assert.equal(
    cacheTtlUntilMidnight(300, elevenFiftyNinePmIst, IST_OFFSET_MINUTES),
    60,
  );
});
