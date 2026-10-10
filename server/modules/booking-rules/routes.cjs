'use strict';

// The two rules that decide who may book: pending payment, and distance from Srinagar. The booking forms ask
// /api/booking/precheck early (so the customer is told before filling a long form); the data route asks the same
// question again when the booking is saved, because the form is not a lock.

const svc = require('./service.cjs');

const KEYS = {
  blockOnDues: 'booking_block_on_dues',
  minDuesRupees: 'booking_dues_ignore_below',
  radiusKm: 'service_radius_km',
  centreLat: 'service_centre_lat',
  centreLng: 'service_centre_lng',
};

function mountBookingRules({ app, getConn, authenticateToken, appSettings, saveAppSetting, rateLimit }) {
  const settings = { blockOnDues: true, minDuesPaise: 0, radiusKm: 0, centreLat: null, centreLng: null };

  // The circle is drawn around the service centre if one was set, else the office location, else Srinagar.
  const centre = () => {
    if (Number.isFinite(settings.centreLat) && Number.isFinite(settings.centreLng)) return { lat: settings.centreLat, lng: settings.centreLng };
    if (appSettings.attendanceGeofenceLat != null && appSettings.attendanceGeofenceLng != null) {
      return { lat: appSettings.attendanceGeofenceLat, lng: appSettings.attendanceGeofenceLng };
    }
    return svc.SRINAGAR;
  };
  const effective = () => ({ ...settings, centre: centre() });

  async function load() {
    const conn = await getConn();
    try {
      await svc.ensureBookingRulesSchema(conn);
      const [rows] = await conn.query('SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (?)', [Object.values(KEYS)]);
      const v = (k) => rows.find((r) => r.setting_key === k)?.setting_value;
      if (v(KEYS.blockOnDues) !== undefined) settings.blockOnDues = v(KEYS.blockOnDues) === '1';
      if (v(KEYS.minDuesRupees) !== undefined) settings.minDuesPaise = Math.max(0, Math.round(Number(v(KEYS.minDuesRupees)) * 100)) || 0;
      if (v(KEYS.radiusKm) !== undefined) settings.radiusKm = Math.max(0, Number(v(KEYS.radiusKm))) || 0;
      if (v(KEYS.centreLat) !== undefined && v(KEYS.centreLat) !== '') settings.centreLat = Number(v(KEYS.centreLat));
      if (v(KEYS.centreLng) !== undefined && v(KEYS.centreLng) !== '') settings.centreLng = Number(v(KEYS.centreLng));
    } finally {
      conn.release();
    }
  }
  const ready = load().catch((err) => console.error('[booking-rules] could not load settings —', err.message));

  // Used by the data route when a public booking is saved. Never throws: a broken check must not stop bookings.
  async function check(input) {
    await ready;
    let conn;
    try {
      conn = await getConn();
      return await svc.evaluate(conn, effective(), input);
    } catch (err) {
      console.error('[booking-rules] check failed, letting the booking through —', err.message);
      return { ok: true };
    } finally {
      if (conn) { try { conn.release(); } catch { /* already released */ } }
    }
  }

  // The form asks before the customer types out the whole request.
  app.post('/api/booking/precheck', rateLimit({ windowMs: 60_000, max: 20, key: 'booking-precheck' }), async (req, res) => {
    const { phone, lat, lng, location } = req.body || {};
    res.json(await check({ phone, lat, lng, location }));
  });

  const view = () => ({
    blockOnDues: settings.blockOnDues,
    minDuesRupees: settings.minDuesPaise / 100,
    radiusKm: settings.radiusKm,
    centre: centre(),
    centreIsDefault: !(Number.isFinite(settings.centreLat) && Number.isFinite(settings.centreLng)),
  });

  app.get('/api/settings/booking-rules', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    res.json(view());
  });

  app.put('/api/settings/booking-rules', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const b = req.body || {};
    const radiusKm = Number(b.radiusKm ?? 0);
    const minRupees = Number(b.minDuesRupees ?? 0);
    if (!Number.isFinite(radiusKm) || radiusKm < 0 || radiusKm > 2000) return res.status(400).json({ error: 'Distance must be between 0 and 2000 km (0 = no limit)' });
    if (!Number.isFinite(minRupees) || minRupees < 0) return res.status(400).json({ error: 'The amount to ignore must be 0 or more' });
    try {
      await saveAppSetting(KEYS.blockOnDues, b.blockOnDues ? '1' : '0');
      await saveAppSetting(KEYS.minDuesRupees, String(minRupees));
      await saveAppSetting(KEYS.radiusKm, String(radiusKm));
      settings.blockOnDues = !!b.blockOnDues;
      settings.minDuesPaise = Math.round(minRupees * 100);
      settings.radiusKm = radiusKm;
      if (b.centre === null) {
        // Back to the office location / Srinagar.
        await saveAppSetting(KEYS.centreLat, '');
        await saveAppSetting(KEYS.centreLng, '');
        settings.centreLat = null; settings.centreLng = null;
      } else if (b.centre && Number.isFinite(Number(b.centre.lat)) && Number.isFinite(Number(b.centre.lng))) {
        settings.centreLat = Number(b.centre.lat); settings.centreLng = Number(b.centre.lng);
        await saveAppSetting(KEYS.centreLat, String(settings.centreLat));
        await saveAppSetting(KEYS.centreLng, String(settings.centreLng));
      }
      res.json(view());
    } catch (err) {
      console.error('[booking-rules] save failed —', err.message);
      res.status(500).json({ error: 'Could not save' });
    }
  });

  return { check, settings, effective };
}

module.exports = { mountBookingRules };
