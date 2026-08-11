import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { haversineDistanceMeters } = require('../server/geo-distance.cjs');

test('distance between identical points is zero', () => {
  assert.equal(haversineDistanceMeters(19.076, 72.8777, 19.076, 72.8777), 0);
});

test('one degree of latitude is approximately 111.19km', () => {
  const d = haversineDistanceMeters(0, 0, 1, 0);
  assert.ok(d > 111000 && d < 111400, `expected ~111195m, got ${d}`);
});

test('a small nearby offset is a small distance', () => {
  // ~0.001 degree latitude offset near Mumbai — should be roughly 100-130m.
  const d = haversineDistanceMeters(19.0760, 72.8777, 19.0770, 72.8777);
  assert.ok(d > 90 && d < 140, `expected ~111m, got ${d}`);
});

test('a quarter of the globe is approximately 10,000km', () => {
  const d = haversineDistanceMeters(0, 0, 0, 90);
  assert.ok(d > 9900000 && d < 10100000, `expected ~10007km, got ${d}`);
});

test('distance is symmetric regardless of point order', () => {
  const a = haversineDistanceMeters(19.076, 72.8777, 28.6139, 77.2090);
  const b = haversineDistanceMeters(28.6139, 77.2090, 19.076, 72.8777);
  assert.equal(a, b);
});

test('accounts for latitude when scaling longitude distance', () => {
  // At 60°N, 10° of longitude is much shorter than at the equator — this
  // catches an implementation that forgets the cos(lat) scaling factor
  // (which would compute ~1112km here instead of the correct ~556km).
  const d = haversineDistanceMeters(60, 0, 60, 10);
  assert.ok(d > 500000 && d < 620000, `expected ~556km, got ${d}`);
});
