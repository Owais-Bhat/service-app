// GSTIN → the portal's details. The lookup service is configured, so these tests run against canned answers shaped
// like what such services return (GSTN's own field names), with no network and no database.
//
//   node --test tests/gst-lookup.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const svc = require('../server/modules/gst-lookup/service.cjs');
const { GSTIN_OK } = await import('./helpers/vyapar-fixture.mjs');

const gstnShape = {
  flag: true,
  data: {
    gstin: GSTIN_OK,
    lgnm: 'NETWORKING EXPERTS PRIVATE LIMITED',
    tradeNam: 'NETWORKING EXPERTS',
    sts: 'Active',
    dty: 'Regular',
    ctb: 'Private Limited Company',
    rgdt: '01/07/2017',
    pradr: {
      adr: 'Shop No 4, Residency Road, Lal Chowk, Srinagar, Srinagar, Jammu and Kashmir, 190001',
      addr: { bno: '4', bnm: 'Lal Chowk Plaza', flno: 'Shop', st: 'Residency Road', loc: 'Lal Chowk', dst: 'Srinagar', stcd: 'Jammu and Kashmir', pncd: '190001' },
    },
  },
};

const withEnv = async (env, fn) => {
  const keep = {};
  for (const k of Object.keys(env)) { keep[k] = process.env[k]; process.env[k] = env[k]; }
  try { return await fn(); } finally {
    for (const k of Object.keys(env)) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; }
  }
};

test('the portal answer becomes names, status and the full address', () => {
  const d = svc.normalize(gstnShape, GSTIN_OK);
  assert.equal(d.legal_name, 'NETWORKING EXPERTS PRIVATE LIMITED');
  assert.equal(d.trade_name, 'NETWORKING EXPERTS');
  assert.equal(d.status, 'Active');
  assert.equal(d.address.full, 'Shop No 4, Residency Road, Lal Chowk, Srinagar, Srinagar, Jammu and Kashmir, 190001');
  assert.equal(d.address.pincode, '190001');
  assert.equal(d.address.city, 'Lal Chowk');
  assert.equal(d.address.district, 'Srinagar');
  assert.equal(d.address.state_code, GSTIN_OK.slice(0, 2));
});

test('without the one-line address it is built from the parts', () => {
  const noAdr = JSON.parse(JSON.stringify(gstnShape));
  delete noAdr.data.pradr.adr;
  const d = svc.normalize(noAdr, GSTIN_OK);
  assert.match(d.address.full, /Residency Road/);
  assert.match(d.address.full, /190001/);
  assert.match(d.address.full, /Jammu and Kashmir/);
});

test('a flatter answer from another service is read too', () => {
  const d = svc.normalize({ result: { legal_name: 'ABC TRADERS', trade_name: 'ABC', address: '12 Main Rd, Jammu, 180001', pincode: '180001', status: 'Cancelled' } }, GSTIN_OK);
  assert.equal(d.legal_name, 'ABC TRADERS');
  assert.equal(d.status, 'Cancelled');
  assert.equal(d.address.full, '12 Main Rd, Jammu, 180001');
  assert.equal(d.address.pincode, '180001');
});

test('an answer with no business in it is "not found", not a crash', () => {
  assert.equal(svc.normalize({ flag: false, message: 'GSTIN not found' }, GSTIN_OK), null);
});

test('lookup: not configured says so; a bad number is refused before any call', async () => {
  await withEnv({ GST_LOOKUP_URL: '' }, async () => {
    const out = await svc.lookup(GSTIN_OK);
    assert.equal(out.configured, false);
    assert.equal(out.found, false);
  });
  await withEnv({ GST_LOOKUP_URL: 'https://x.test/{gstin}' }, async () => {
    let called = false;
    const out = await svc.lookup('27ABCDE1234F1Z9', { fetchImpl: async () => { called = true; return {}; } });
    assert.equal(out.found, false);
    assert.match(out.error, /GSTIN/);
    assert.equal(called, false);
  });
});

test('lookup: number and key go where the configuration says, and the answer is cached', async () => {
  await withEnv({ GST_LOOKUP_URL: 'https://svc.test/gst/{gstin}?k={key}', GST_LOOKUP_KEY: 'sekret', GST_LOOKUP_KEY_HEADER: 'X-API-Key' }, async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, headers: init.headers });
      return { ok: true, status: 200, text: async () => JSON.stringify(gstnShape) };
    };
    const first = await svc.lookup(GSTIN_OK.toLowerCase(), { fetchImpl });
    assert.equal(first.found, true);
    assert.equal(first.details.legal_name, 'NETWORKING EXPERTS PRIVATE LIMITED');
    assert.equal(calls[0].url, `https://svc.test/gst/${GSTIN_OK}?k=sekret`);
    assert.equal(calls[0].headers['X-API-Key'], 'sekret');

    const second = await svc.lookup(GSTIN_OK, { fetchImpl });
    assert.equal(second.found, true);
    assert.equal(calls.length, 1, 'the second look is served from memory');
  });
});

test('lookup: the service refusing is reported, not thrown', async () => {
  const gst = require('../server/modules/gst.cjs');
  const first14 = '29AAACN1234F1Z'; // another state, so it is not in the cache from above
  const other = first14 + gst.gstinCheckDigit(first14);
  await withEnv({ GST_LOOKUP_URL: 'https://svc.test/{gstin}' }, async () => {
    const denied = await svc.lookup(other, { fetchImpl: async () => ({ ok: false, status: 401, text: async () => '{"message":"Invalid key"}' }) });
    assert.equal(denied.found, false);
    assert.equal(denied.configured, true);
    assert.equal(denied.error, 'Invalid key');

    const slow = await svc.lookup(other, { fetchImpl: async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; } });
    assert.equal(slow.found, false);
    assert.match(slow.error, /too slow/);
  });
});
