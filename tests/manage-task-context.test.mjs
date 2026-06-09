import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const adminSource = readFileSync(new URL('../src/pages/admin.js', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../server/index.cjs', import.meta.url), 'utf8');

test('admin Manage request opens with one context API call', () => {
  const start = adminSource.indexOf('async function openInquiryDetail(id, onDone) {');
  const end = adminSource.indexOf('const overlay = document.createElement("div");', start);
  assert.notEqual(start, -1, 'Manage Task modal function should exist');
  assert.notEqual(end, -1, 'Manage Task initial loading section should exist');
  const source = adminSource.slice(start, end);

  assert.match(source, /\/admin\/inquiries\/\$\{encodeURIComponent\(id\)\}\/manage-context/, 'modal should load one manage-context endpoint');
  assert.doesNotMatch(source, /from\("profiles"\)/, 'modal should not separately load employee profiles');
  assert.doesNotMatch(source, /from\("attendance"\)/, 'modal should not separately load attendance');
  assert.doesNotMatch(source, /from\("eod_reports"\)/, 'modal should not separately load EOD reports');
  assert.doesNotMatch(source, /from\("inquiries"\).*eq\("id", id\)/s, 'modal should not separately load the inquiry');
});

test('manage-context endpoint is admin-only and computes employee availability', () => {
  assert.match(serverSource, /app\.get\('\/api\/admin\/inquiries\/:id\/manage-context', authenticateToken/, 'endpoint should require authentication');
  assert.match(serverSource, /if \(req\.user\.role !== 'admin'\) return res\.sendStatus\(403\)/, 'endpoint should require admin role');
  assert.match(serverSource, /missed_eod_count/, 'endpoint should calculate EOD restrictions');
  assert.match(serverSource, /clockedIn: Boolean\(row\.clocked_in\)/, 'endpoint should return online state');
});
