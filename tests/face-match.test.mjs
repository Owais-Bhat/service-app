import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { FACE_DESCRIPTOR_LENGTH, FACE_MATCH_THRESHOLD, isValidFaceDescriptor, euclideanDistance } = require('../server/face-match.cjs');

test('distance between identical descriptors is zero', () => {
  const a = Array(FACE_DESCRIPTOR_LENGTH).fill(0.1);
  assert.equal(euclideanDistance(a, a), 0);
});

test('distance is symmetric regardless of argument order', () => {
  const a = Array(FACE_DESCRIPTOR_LENGTH).fill(0).map((_, i) => i * 0.01);
  const b = Array(FACE_DESCRIPTOR_LENGTH).fill(0).map((_, i) => (i * 0.01) + 0.02);
  assert.equal(euclideanDistance(a, b), euclideanDistance(b, a));
});

test('a small per-dimension offset stays under the match threshold', () => {
  const a = Array(FACE_DESCRIPTOR_LENGTH).fill(0.1);
  const b = a.map((n) => n + 0.001);
  assert.ok(euclideanDistance(a, b) < FACE_MATCH_THRESHOLD);
});

test('a large per-dimension offset exceeds the match threshold', () => {
  const a = Array(FACE_DESCRIPTOR_LENGTH).fill(0.1);
  const b = a.map((n) => n + 0.5);
  assert.ok(euclideanDistance(a, b) > FACE_MATCH_THRESHOLD);
});

test('isValidFaceDescriptor accepts a well-formed 128-length numeric array', () => {
  assert.equal(isValidFaceDescriptor(Array(FACE_DESCRIPTOR_LENGTH).fill(0.5)), true);
});

test('isValidFaceDescriptor rejects wrong length', () => {
  assert.equal(isValidFaceDescriptor(Array(64).fill(0.5)), false);
});

test('isValidFaceDescriptor rejects non-array input', () => {
  assert.equal(isValidFaceDescriptor('not an array'), false);
  assert.equal(isValidFaceDescriptor(null), false);
  assert.equal(isValidFaceDescriptor(undefined), false);
});

test('isValidFaceDescriptor rejects arrays containing non-finite values', () => {
  const bad = Array(FACE_DESCRIPTOR_LENGTH).fill(0.5);
  bad[10] = NaN;
  assert.equal(isValidFaceDescriptor(bad), false);
  const bad2 = Array(FACE_DESCRIPTOR_LENGTH).fill(0.5);
  bad2[10] = Infinity;
  assert.equal(isValidFaceDescriptor(bad2), false);
  const bad3 = Array(FACE_DESCRIPTOR_LENGTH).fill(0.5);
  bad3[10] = 'oops';
  assert.equal(isValidFaceDescriptor(bad3), false);
});
