'use strict';

// Who may book a new service: nobody with an unpaid bill, and nobody outside the area the business serves.
// Both rules are the admin's to switch on or off; this file only decides.

const { haversineDistanceMeters } = require('../../geo-distance.cjs');

// Where "around Srinagar" is measured from when the office location has not been set.
const SRINAGAR = { lat: 34.0837, lng: 74.7973 };

// Phone numbers arrive as +91 98xxx, 098xxx, 98xxx-xxx… the last ten digits are the same person.
const last10 = (phone) => String(phone || '').replace(/\D/g, '').slice(-10);
const SQL_DIGITS = (col) => `RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${col}, '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 10)`;

const inr = (paise) => `₹${(Math.round(paise) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

async function ensureBookingRulesSchema(conn) {
  const [cols] = await conn.query("SHOW COLUMNS FROM parties LIKE 'booking_exempt'");
  if (!cols.length) {
    await conn.query("ALTER TABLE parties ADD COLUMN booking_exempt TINYINT(1) NOT NULL DEFAULT 0");
  }
}

// What this phone number still owes: unpaid service and installation bills, and any receivable balance in the
// ledger (invoices, and what Vyapar brought in). The same debt can sit in both, so the total is the larger of the two.
async function findDues(conn, phone) {
  const key = last10(phone);
  const none = { exempt: false, items: [], total_paise: 0 };
  if (key.length < 10) return none;

  const [exempt] = await conn.query(
    `SELECT 1 FROM parties WHERE booking_exempt = 1 AND merged_into_id IS NULL AND ${SQL_DIGITS('phone')} = ? LIMIT 1`, [key]
  );
  if (exempt.length) return { ...none, exempt: true };

  const items = [];
  let ticketPaise = 0;
  const [tickets] = await conn.query(
    `SELECT ticket_no, service_item, COALESCE(NULLIF(bill_total, 0), bill_amount, 0) AS amount
       FROM inquiries
      WHERE ${SQL_DIGITS('phone')} = ?
        AND COALESCE(NULLIF(bill_total, 0), bill_amount, 0) > 0
        AND COALESCE(payment_status, 'unpaid') NOT IN ('paid', 'foc')
        AND COALESCE(status, '') <> 'foc'`, [key]
  );
  for (const t of tickets) {
    const paise = Math.round(Number(t.amount) * 100);
    ticketPaise += paise;
    items.push({ kind: 'service', ref: t.ticket_no, what: t.service_item || 'Service', amount_paise: paise });
  }
  const [installs] = await conn.query(
    `SELECT ticket_no, installation_type, bill_total AS amount
       FROM installations
      WHERE ${SQL_DIGITS('phone')} = ?
        AND COALESCE(bill_total, 0) > 0
        AND COALESCE(payment_status, 'unpaid') NOT IN ('paid', 'foc')
        AND COALESCE(status, '') NOT IN ('cancelled', 'rejected')`, [key]
  );
  for (const t of installs) {
    const paise = Math.round(Number(t.amount) * 100);
    ticketPaise += paise;
    items.push({ kind: 'installation', ref: t.ticket_no, what: t.installation_type || 'Installation', amount_paise: paise });
  }

  const [ledger] = await conn.query(
    `SELECT p.display_name, COALESCE(SUM(l.debit_paise), 0) - COALESCE(SUM(l.credit_paise), 0) AS balance
       FROM parties p
       JOIN journal_lines l ON l.party_id = p.id
       JOIN accounts a ON a.id = l.account_id AND a.subtype = 'receivable'
      WHERE p.merged_into_id IS NULL AND ${SQL_DIGITS('p.phone')} = ?
      GROUP BY p.id
     HAVING balance > 0`, [key]
  );
  let ledgerPaise = 0;
  for (const r of ledger) {
    ledgerPaise += Number(r.balance);
    items.push({ kind: 'account', ref: null, what: 'Account balance', amount_paise: Number(r.balance) });
  }

  return { exempt: false, items, total_paise: Math.max(ticketPaise, ledgerPaise) };
}

// "GPS: 34.08, 74.79" (what the form writes when it has no street name) → coordinates.
function coordsFromText(text) {
  const m = String(text || '').match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = Number(m[1]); const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

const geocodeCache = new Map();
// A typed address has no coordinates; ask OpenStreetMap where it is. Failing is fine — the caller lets the booking
// through rather than turn a customer away because a lookup service was slow.
async function geocode(text) {
  const q = String(text || '').trim().slice(0, 240);
  if (q.length < 4) return null;
  if (geocodeCache.has(q)) return geocodeCache.get(q);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': 'NEST-Portal/1.0 (services.networkingexperts.in)' }, signal: ctrl.signal }
    );
    clearTimeout(timer);
    const rows = res.ok ? await res.json() : [];
    const hit = rows[0] ? { lat: Number(rows[0].lat), lng: Number(rows[0].lon) } : null;
    if (geocodeCache.size > 500) geocodeCache.clear();
    geocodeCache.set(q, hit);
    return hit;
  } catch {
    return null;
  }
}

function distanceKm(from, to) {
  return haversineDistanceMeters(from.lat, from.lng, to.lat, to.lng) / 1000;
}

// settings: { blockOnDues, minDuesPaise, radiusKm, centre: {lat,lng} }
// input:    { phone, lat, lng, location }
// → { ok: true, distance_km? } or { ok: false, code, message, ... }
async function evaluate(conn, settings, input, { geocoder = geocode } = {}) {
  const out = { ok: true };

  if (settings.blockOnDues) {
    const dues = await findDues(conn, input.phone);
    if (!dues.exempt && dues.items.length && dues.total_paise > (settings.minDuesPaise || 0)) {
      return {
        ok: false,
        code: 'PENDING_PAYMENT',
        message: `Please repay your previous payment first. ${inr(dues.total_paise)} is still pending from an earlier service. `
          + 'Once it is settled you can book a new service.',
        pending_paise: dues.total_paise,
        // The ticket numbers are the customer's own; amounts only, no names.
        pending: dues.items.map((i) => ({ what: i.what, ref: i.ref, amount_paise: i.amount_paise })),
      };
    }
  }

  if (settings.radiusKm > 0) {
    let where = null;
    const lat = Number(input.lat); const lng = Number(input.lng);
    if (input.lat != null && input.lng != null && Number.isFinite(lat) && Number.isFinite(lng)) where = { lat, lng };
    if (!where) where = coordsFromText(input.location);
    if (!where) where = await geocoder(input.location);
    if (where) {
      const km = distanceKm(settings.centre, where);
      out.distance_km = Math.round(km * 10) / 10;
      if (km > settings.radiusKm) {
        return {
          ok: false,
          code: 'OUT_OF_AREA',
          message: `Sorry, we serve only within ${settings.radiusKm} km of Srinagar, and this location is about `
            + `${Math.round(km)} km away.`,
          distance_km: out.distance_km,
          radius_km: settings.radiusKm,
        };
      }
    }
  }
  return out;
}

module.exports = {
  SRINAGAR, last10, ensureBookingRulesSchema, findDues, coordsFromText, geocode, distanceKm, evaluate,
};
