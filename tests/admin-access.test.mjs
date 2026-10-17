// Which parts of the admin portal a limited admin may use. Pure rules, no server or database needed.
//
//   node --test tests/admin-access.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const access = require('../server/modules/admin-access.cjs');

const allowed = (modules, method, path) => access.verdict(modules, method, path).allowed;

test('a full admin (no limit) can call everything', () => {
  assert.equal(allowed(null, 'GET', '/api/sales/documents'), true);
  assert.equal(allowed(null, 'POST', '/api/admin/users'), true);
  assert.equal(allowed(undefined, 'PUT', '/api/accounting/business'), true);
});

test('a limited admin is held to the modules they were given', () => {
  const mods = ['inquiries', 'attendance'];
  assert.equal(allowed(mods, 'GET', '/api/sales/documents?doc_type=invoice'), false);
  assert.equal(allowed(mods, 'POST', '/api/purchases/documents'), false);
  assert.equal(allowed(mods, 'GET', '/api/campaigns'), false);
  assert.equal(allowed(mods, 'GET', '/api/admin/users'), false);
  assert.equal(allowed(mods, 'GET', '/api/data/eod_reports'), true); // attendance may read EOD
  assert.equal(allowed(mods, 'GET', '/api/live-location'), true); // attendance may see the map
});

test('having the module opens its calls', () => {
  assert.equal(allowed(['sales'], 'GET', '/api/sales/documents'), true);
  assert.equal(allowed(['sales'], 'POST', '/api/sales/documents/1/issue'), true);
  assert.equal(allowed(['purchases'], 'GET', '/api/purchases/payables'), true);
  assert.equal(allowed(['users'], 'PATCH', '/api/admin/users/abc'), true);
});

test('calls that belong to no module are open to every admin', () => {
  for (const path of ['/api/auth/me', '/api/notifications', '/api/dashboard/admin-data', '/api/admin/modules', '/api/accounting/capabilities']) {
    assert.equal(access.requiredModules('GET', path), null, path);
    assert.equal(allowed([], 'GET', path), true, path);
  }
});

test('an empty list means dashboard-only, not full access', () => {
  assert.equal(allowed([], 'GET', '/api/sales/documents'), false);
  assert.equal(allowed([], 'GET', '/api/data/notices'), false);
});

test('shared lookups accept any of the modules that use them', () => {
  assert.equal(allowed(['sales'], 'GET', '/api/parties?kind=customer'), true);
  assert.equal(allowed(['purchases'], 'GET', '/api/parties?kind=supplier'), true);
  assert.equal(allowed(['stock'], 'GET', '/api/parties'), false);
  assert.equal(allowed(['purchases'], 'GET', '/api/inventory/items'), true);
});

test('the accounting set-up is readable by the pages that need it, writable only from Business & Tax Setup', () => {
  assert.equal(allowed(['sales'], 'GET', '/api/accounting/tax-rates'), true);
  assert.equal(allowed(['sales'], 'POST', '/api/accounting/tax-rates'), false);
  assert.equal(allowed(['sales'], 'PUT', '/api/accounting/business'), false);
  assert.equal(allowed(['business-settings'], 'PUT', '/api/accounting/business'), true);
});

test('settings can be read by anyone but changed only with the Settings module', () => {
  assert.equal(allowed(['inquiries'], 'GET', '/api/settings/clockin-requirements'), true);
  assert.equal(allowed(['inquiries'], 'PUT', '/api/settings/attendance'), false);
  assert.equal(allowed(['settings'], 'PUT', '/api/settings/attendance'), true);
});

test('only the Auto Assignment module can switch auto-assignment', () => {
  assert.equal(allowed(['inquiries'], 'GET', '/api/auto-assignment/status'), true);
  assert.equal(allowed(['inquiries'], 'PUT', '/api/auto-assignment/status'), false);
  assert.equal(allowed(['auto-assignment'], 'PUT', '/api/auto-assignment/status'), true);
});

test('profile rows can be written only by the people-management modules', () => {
  assert.equal(allowed(['inquiries'], 'GET', '/api/data/profiles'), true);
  assert.equal(allowed(['inquiries'], 'PATCH', '/api/data/profiles?eq=id:1'), false);
  assert.equal(allowed(['employee-panel'], 'PATCH', '/api/data/profiles?eq=id:1'), true);
});

test('paths are matched without the query string, the /api prefix or a trailing slash', () => {
  assert.equal(access.normalizePath('/api/sales/documents/?a=1'), '/sales/documents');
  assert.equal(access.normalizePath('/sales'), '/sales');
  assert.equal(access.requiredModules('get', '/api/sales/'), access.requiredModules('GET', '/sales'));
  // a prefix that merely starts the same must not match
  assert.equal(access.requiredModules('GET', '/api/salesman'), null);
});

test('stored values and posted lists are cleaned', () => {
  assert.equal(access.parseStored(null), null);
  assert.equal(access.parseStored(''), null);
  assert.deepEqual(access.parseStored('["sales","stock"]'), ['sales', 'stock']);
  assert.deepEqual(access.parseStored('[]'), []);
  // a damaged value must lock down, never open up
  assert.deepEqual(access.parseStored('{not json'), []);

  assert.equal(access.normalizeModules(null), null);
  assert.deepEqual(access.normalizeModules(['sales', 'sales', 'nonsense', 'stock']), ['sales', 'stock']);
  assert.deepEqual(access.normalizeModules([]), []);
  assert.throws(() => access.normalizeModules('sales'));
});

test('every module in a rule exists, and every sidebar module has a label and group', () => {
  for (const [, modules] of access.RULES) {
    for (const id of modules) assert.ok(access.MODULE_IDS.has(id), `unknown module in a rule: ${id}`);
  }
  for (const m of access.MODULES) assert.ok(m.label && m.group, m.id);
  assert.equal(new Set(access.MODULES.map((m) => m.id)).size, access.MODULES.length, 'duplicate module id');
  for (const id of access.ALWAYS_ON) assert.ok(!access.MODULE_IDS.has(id), `${id} is always on, so it is not a choosable module`);
});

test('the refusal names what was missing', () => {
  const text = access.message(['sales', 'fin-reports']);
  assert.match(text, /Invoices & Quotations/);
});
