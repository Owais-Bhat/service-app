'use strict';

// API for the site and device register.

const devices = require('./service.cjs');
const { defaultBusinessId } = require('../ledger/schema.cjs');

function mountDevices({ app, getConn, authenticateToken, permissions, audit }) {
    const { requireCap } = permissions;

    const handle = (fn) => async (req, res) => {
        let connection;
        try {
            connection = await getConn();
            await fn(req, res, connection);
        } catch (err) {
            if (connection) await connection.rollback().catch(() => {});
            if (err instanceof devices.DeviceError) return res.status(err.status || 422).json({ error: err.message, code: err.code });
            console.error('[devices]', req.method, req.path, '—', err.message);
            if (!res.headersSent) res.status(500).json({ error: err.message });
        } finally {
            if (connection) connection.release();
        }
    };

    const business = async (conn) => {
        const id = await defaultBusinessId(conn);
        if (!id) throw new devices.DeviceError('No business configured', 'no_business', 400);
        return id;
    };

    const view = requireCap('device.view');
    const manage = requireCap('device.manage');

    // ── sites ───────────────────────────────────────────────────────────
    app.get('/api/device-sites', authenticateToken, view, handle(async (req, res, conn) => {
        if (!req.query.party_id) return res.status(400).json({ error: 'Choose the customer' });
        res.json(await devices.listSites(conn, await business(conn), req.query.party_id));
    }));

    app.post('/api/device-sites', authenticateToken, manage, handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const id = await devices.createSite(conn, { businessId, user: req.user, payload: req.body || {} });
        audit.record({ actor: req.user, action: 'site.create', entityType: 'customer_site', entityId: id, after: req.body, ip: req.ip });
        const sites = await devices.listSites(conn, businessId, req.body.party_id);
        res.status(201).json({ id, site: sites.find((s) => s.id === id) });
    }));

    app.patch('/api/device-sites/:id', authenticateToken, manage, handle(async (req, res, conn) => {
        const site = await devices.updateSite(conn, { businessId: await business(conn), id: req.params.id, payload: req.body || {} });
        audit.record({ actor: req.user, action: 'site.update', entityType: 'customer_site', entityId: req.params.id, after: req.body, ip: req.ip });
        res.json(site);
    }));

    // ── what is known about a caller, by phone ──────────────────────────
    app.get('/api/devices/lookup', authenticateToken, view, handle(async (req, res, conn) => {
        res.json(await devices.lookupByPhone(conn, await business(conn), req.query.phone));
    }));

    // ── devices ─────────────────────────────────────────────────────────
    app.get('/api/devices', authenticateToken, view, handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const all = await devices.listDevices(conn, businessId, {
            partyId: req.query.party_id || null, siteId: req.query.site_id || null, q: req.query.q || null,
            status: req.query.status || null, includeGone: req.query.include_gone === '1',
        });
        res.json({
            devices: req.query.warranty ? all.filter((d) => d.warranty_state === req.query.warranty) : all,
            summary: devices.summarise(all),
        });
    }));

    app.get('/api/devices/:id', authenticateToken, view, handle(async (req, res, conn) => {
        const out = await devices.loadDevice(conn, await business(conn), req.params.id);
        if (!out) return res.status(404).json({ error: 'No such device' });
        res.json(out);
    }));

    app.post('/api/devices', authenticateToken, manage, handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const id = await devices.createDevice(conn, { businessId, user: req.user, payload: req.body || {} });
        audit.record({ actor: req.user, action: 'device.create', entityType: 'customer_device', entityId: id, after: { party_id: req.body.party_id, model: req.body.model, serial_no: req.body.serial_no }, ip: req.ip });
        res.status(201).json(await devices.loadDevice(conn, businessId, id));
    }));

    app.patch('/api/devices/:id', authenticateToken, manage, handle(async (req, res, conn) => {
        const businessId = await business(conn);
        await devices.updateDevice(conn, { businessId, user: req.user, id: req.params.id, payload: req.body || {} });
        audit.record({ actor: req.user, action: 'device.update', entityType: 'customer_device', entityId: req.params.id, after: req.body, ip: req.ip });
        res.json(await devices.loadDevice(conn, businessId, req.params.id));
    }));

    app.post('/api/devices/:id/events', authenticateToken, manage, handle(async (req, res, conn) => {
        const businessId = await business(conn);
        await devices.addEvent(conn, { businessId, user: req.user, id: req.params.id, payload: req.body || {} });
        res.status(201).json(await devices.loadDevice(conn, businessId, req.params.id));
    }));

    app.post('/api/devices/:id/replace', authenticateToken, manage, handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const newId = await devices.replaceDevice(conn, { businessId, user: req.user, id: req.params.id, payload: req.body || {} });
        audit.record({ actor: req.user, action: 'device.replace', entityType: 'customer_device', entityId: req.params.id, after: { replaced_by_id: newId }, reason: req.body?.reason, ip: req.ip });
        res.status(201).json(await devices.loadDevice(conn, businessId, newId));
    }));

    // Put a customer's equipment under one contract.
    app.post('/api/amc/contracts/:id/cover-devices', authenticateToken, manage, handle(async (req, res, conn) => {
        const covered = await devices.coverDevices(conn, { businessId: await business(conn), contractId: req.params.id, deviceIds: req.body?.device_ids });
        audit.record({ actor: req.user, action: 'amc.cover_devices', entityType: 'amc_contract', entityId: req.params.id, after: { covered }, ip: req.ip });
        res.json({ covered });
    }));

    console.log('[devices] routes mounted (sites, devices, phone lookup)');
}

module.exports = { mountDevices };
