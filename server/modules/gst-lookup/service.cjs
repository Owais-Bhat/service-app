'use strict';

// GSTIN → the details the GST portal shows for it: legal and trade name, status and the full principal address.
// The portal itself has no open API (it wants a captcha), so this talks to whichever GST lookup service the owner
// has an account with. Which one is configuration, not code:
//
//   GST_LOOKUP_URL         address with {gstin} where the number goes, and {key} if the key is part of the address
//   GST_LOOKUP_KEY         the account's key
//   GST_LOOKUP_KEY_HEADER  set this when the key goes in a header (e.g. X-API-Key) instead of the address
//
// Services differ in how they wrap the answer, but they all pass on GSTN's own field names (lgnm, tradeNam, pradr…),
// so the reader below looks for those wherever they sit.

const gst = require('../gst.cjs');

const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map();

const settings = () => ({
  url: process.env.GST_LOOKUP_URL || '',
  key: process.env.GST_LOOKUP_KEY || '',
  keyHeader: process.env.GST_LOOKUP_KEY_HEADER || '',
});
const isConfigured = () => !!settings().url;

// Depth-first: the first object (or value) found under any of these names.
function find(node, names, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return undefined;
  for (const n of names) if (node[n] !== undefined && node[n] !== null && node[n] !== '') return node[n];
  for (const v of Object.values(node)) {
    const hit = find(v, names, depth + 1);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const squash = (parts) => parts.map(str).filter(Boolean).join(', ');

function normalize(json, gstin) {
  const legal = str(find(json, ['lgnm', 'legal_name', 'legalName', 'legal_name_of_business']));
  if (!legal) return null;
  const trade = str(find(json, ['tradeNam', 'trade_name', 'tradeName', 'trade_name_of_business']));

  // GSTN's principal place of business: addr holds the parts, adr the same thing as one line.
  const pradr = find(json, ['pradr']) || {};
  const addr = (pradr && typeof pradr === 'object' && (pradr.addr || pradr)) || {};
  const flat = find(json, ['address', 'principal_address', 'adr']);

  const street = squash([addr.flno, addr.bno, addr.bnm, addr.st, addr.loc || addr.locality, addr.landMark]);
  const city = str(addr.city || addr.loc || addr.locality || addr.dst);
  const district = str(addr.dst);
  const pincode = str(addr.pncd || addr.pincode || find(json, ['pncd', 'pincode']));
  const stateName = str(addr.stcd || find(json, ['stcd', 'state', 'state_name']));
  const full = str(pradr.adr || (typeof flat === 'string' ? flat : '')) || squash([street, district, stateName, pincode]);

  const check = gst.validateGstin(gstin);
  return {
    gstin: check.gstin || gstin,
    legal_name: legal,
    trade_name: trade,
    status: str(find(json, ['sts', 'status', 'gstin_status'])),
    taxpayer_type: str(find(json, ['dty', 'taxpayer_type', 'taxpayerType'])),
    constitution: str(find(json, ['ctb', 'constitution', 'constitution_of_business'])),
    registered_on: str(find(json, ['rgdt', 'registration_date'])),
    address: {
      full,
      line1: street || full,
      city: city || district,
      district,
      state: stateName,
      state_code: check.state_code || String(gstin).slice(0, 2),
      pincode,
    },
  };
}

// → { configured, found, details?, error? }. Never throws.
async function lookup(gstinInput, { fetchImpl = fetch } = {}) {
  const check = gst.validateGstin(gstinInput);
  if (!check.valid) return { configured: isConfigured(), found: false, error: `GSTIN: ${check.reason}` };
  if (!isConfigured()) return { configured: false, found: false };

  const hit = cache.get(check.gstin);
  if (hit && hit.at > Date.now() - TTL_MS) return { configured: true, found: true, details: hit.details, cached: true };

  const s = settings();
  const url = s.url.replace('{gstin}', encodeURIComponent(check.gstin)).replace('{key}', encodeURIComponent(s.key));
  const headers = { Accept: 'application/json' };
  if (s.keyHeader && s.key) headers[s.keyHeader] = s.key;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetchImpl(url, { headers, signal: ctrl.signal });
    clearTimeout(timer);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    if (!res.ok) {
      const why = str(find(json, ['message', 'error', 'msg'])) || `the lookup service answered ${res.status}`;
      return { configured: true, found: false, error: why };
    }
    const details = json && normalize(json, check.gstin);
    if (!details) {
      const why = str(find(json, ['message', 'error', 'msg']));
      return { configured: true, found: false, error: why || 'No details came back for this GSTIN' };
    }
    cache.set(check.gstin, { at: Date.now(), details });
    return { configured: true, found: true, details };
  } catch (err) {
    return { configured: true, found: false, error: err.name === 'AbortError' ? 'The lookup service was too slow' : err.message };
  }
}

module.exports = { lookup, normalize, isConfigured };
