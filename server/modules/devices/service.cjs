'use strict';

// The site and device register.
//
// What is installed, where, when, and until when it is under warranty — per
// customer. The point is the technician who knows, before he leaves the shop,
// that the DVR at this site is a Hikvision 8-channel with a 1 TB disk and a
// fault last March, and so carries the right part on the first visit.
//
// A device is never deleted: one that has been swapped is marked *replaced* and
// points at what replaced it, and one taken away is marked *removed*. The
// history of a site is the reason the register exists.

const { randomUUID } = require('crypto');
const amc = require('../amc/service.cjs');

class DeviceError extends Error {
    constructor(message, code, status = 422) {
        super(message);
        this.name = 'DeviceError';
        this.code = code;
        this.status = status;
    }
}

const DEVICE_TABLES = [
    `CREATE TABLE IF NOT EXISTS customer_sites (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        party_id VARCHAR(36) NOT NULL,
        name VARCHAR(160) NOT NULL COMMENT '"Main shop", "Godown", "Home"',
        address VARCHAR(400),
        notes VARCHAR(500),
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_site_party (business_id, party_id)
    )`,

    `CREATE TABLE IF NOT EXISTS customer_devices (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        party_id VARCHAR(36) NOT NULL,
        site_id VARCHAR(36) NULL,
        category VARCHAR(30) NOT NULL DEFAULT 'other' COMMENT 'dvr | nvr | camera | switch | router | hdd | ups | smps | access | intercom | other',
        brand VARCHAR(80),
        model VARCHAR(120),
        serial_no VARCHAR(80),
        item_id VARCHAR(36) NULL COMMENT 'the catalogue item it was sold as, when known',
        quantity INT NOT NULL DEFAULT 1 COMMENT 'identical units fitted together — 8 cameras of one model',
        location_note VARCHAR(200) COMMENT 'front gate, reception, rack in the store room',
        installed_on DATE NULL,
        warranty_until DATE NULL,
        warranty_note VARCHAR(200),
        status VARCHAR(12) NOT NULL DEFAULT 'working' COMMENT 'working | faulty | replaced | removed',
        amc_contract_id VARCHAR(36) NULL,
        replaced_by_id VARCHAR(36) NULL,
        install_ref VARCHAR(60) COMMENT 'the ticket or invoice it was fitted under',
        notes VARCHAR(1000),
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_dev_party (business_id, party_id, status),
        INDEX idx_dev_warranty (business_id, warranty_until),
        INDEX idx_dev_serial (business_id, serial_no),
        INDEX idx_dev_contract (amc_contract_id)
    )`,

    `CREATE TABLE IF NOT EXISTS customer_device_events (
        id VARCHAR(36) PRIMARY KEY,
        device_id VARCHAR(36) NOT NULL,
        event_date DATE NOT NULL,
        kind VARCHAR(12) NOT NULL DEFAULT 'note' COMMENT 'installed | service | repair | replaced | note',
        ticket_ref VARCHAR(60),
        note VARCHAR(500),
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_devev_device (device_id, event_date),
        FOREIGN KEY (device_id) REFERENCES customer_devices(id) ON DELETE CASCADE
    )`,
];

async function ensureDeviceSchema(conn) {
    for (const ddl of DEVICE_TABLES) await conn.query(ddl);
}

const CATEGORIES = {
    dvr: 'DVR', nvr: 'NVR', camera: 'Camera', switch: 'Switch', router: 'Router', hdd: 'Hard disk',
    ups: 'UPS', smps: 'Power supply', access: 'Access control', intercom: 'Intercom', other: 'Other',
};
const STATUSES = ['working', 'faulty', 'replaced', 'removed'];
const EVENT_KINDS = ['installed', 'service', 'repair', 'replaced', 'note'];

// ── helpers ─────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => {
    if (!d) return null;
    const date = d instanceof Date ? d : new Date(d);
    return Number.isNaN(date.getTime()) ? null : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const dayOf = (v) => {
    if (!v) return null;
    if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    const [y, m, d] = String(v).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
};
const clean = (v, max = 255) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
const ENDING_SOON_DAYS = 60;

/** Where a device's warranty stands today. Worked out, never stored. */
function warrantyOf(until, today = new Date()) {
    if (!until) return { state: 'none', days: null };
    const days = Math.round((dayOf(until) - dayOf(today)) / 86400000);
    if (days < 0) return { state: 'expired', days };
    return { state: days <= ENDING_SOON_DAYS ? 'ending' : 'in_warranty', days };
}

function shape(row, today = new Date()) {
    const w = warrantyOf(row.warranty_until, today);
    return {
        ...row,
        installed_on: ymd(row.installed_on),
        warranty_until: ymd(row.warranty_until),
        quantity: Number(row.quantity) || 1,
        category_label: CATEGORIES[row.category] || row.category,
        warranty_state: w.state,
        warranty_days: w.days,
    };
}

function normalise(payload, { partial = false } = {}) {
    const out = {};
    const has = (k) => payload[k] !== undefined;

    if (has('category')) {
        if (!CATEGORIES[payload.category]) throw new DeviceError('Unknown kind of device', 'bad_category', 400);
        out.category = payload.category;
    }
    for (const [key, max] of [['brand', 80], ['model', 120], ['serial_no', 80], ['location_note', 200], ['warranty_note', 200], ['install_ref', 60], ['notes', 1000]]) {
        if (has(key)) out[key] = clean(payload[key], max);
    }
    if (has('quantity')) {
        const q = Math.round(Number(payload.quantity));
        if (!(q >= 1 && q <= 500)) throw new DeviceError('Quantity must be between 1 and 500', 'bad_quantity', 400);
        out.quantity = q;
    }
    if (has('installed_on')) out.installed_on = payload.installed_on ? ymd(payload.installed_on) : null;
    if (has('warranty_until')) out.warranty_until = payload.warranty_until ? ymd(payload.warranty_until) : null;
    if (has('site_id')) out.site_id = payload.site_id || null;
    if (has('item_id')) out.item_id = payload.item_id || null;
    if (has('amc_contract_id')) out.amc_contract_id = payload.amc_contract_id || null;
    if (has('status')) {
        if (!STATUSES.includes(payload.status)) throw new DeviceError('Unknown status', 'bad_status', 400);
        out.status = payload.status;
    }
    if (!partial) {
        if (!payload.party_id) throw new DeviceError('Choose the customer', 'no_party', 400);
        out.party_id = payload.party_id;
        if (!out.brand && !out.model && !out.category) throw new DeviceError('Say what the device is', 'no_device', 400);
    }
    if (out.installed_on && out.warranty_until && out.warranty_until < out.installed_on) {
        throw new DeviceError('The warranty cannot end before the device was installed', 'bad_warranty', 400);
    }
    return out;
}

async function checkPlacement(conn, businessId, partyId, data) {
    const [[party]] = await conn.query('SELECT id FROM parties WHERE id = ? LIMIT 1', [partyId]);
    if (!party) throw new DeviceError('No such customer', 'no_party', 400);
    if (data.site_id) {
        const [[site]] = await conn.query('SELECT party_id FROM customer_sites WHERE id = ? AND business_id = ?', [data.site_id, businessId]);
        if (!site || site.party_id !== partyId) throw new DeviceError('That site belongs to a different customer', 'bad_site', 400);
    }
    if (data.amc_contract_id) {
        const [[c]] = await conn.query('SELECT party_id FROM amc_contracts WHERE id = ? AND business_id = ?', [data.amc_contract_id, businessId]);
        if (!c || c.party_id !== partyId) throw new DeviceError('That contract belongs to a different customer', 'bad_contract', 400);
    }
}

async function checkSerial(conn, businessId, serial, exceptId = null) {
    if (!serial) return;
    const [rows] = await conn.query(
        `SELECT d.id, d.status, p.display_name FROM customer_devices d LEFT JOIN parties p ON p.id = d.party_id
          WHERE d.business_id = ? AND d.serial_no = ? AND d.status IN ('working', 'faulty') ${exceptId ? 'AND d.id <> ?' : ''} LIMIT 1`,
        exceptId ? [businessId, serial, exceptId] : [businessId, serial]
    );
    if (rows.length) {
        throw new DeviceError(`Serial ${serial} is already registered to ${rows[0].display_name || 'another customer'}`, 'duplicate_serial', 409);
    }
}

// ── sites ───────────────────────────────────────────────────────────────
async function listSites(conn, businessId, partyId) {
    const [rows] = await conn.query(
        `SELECT s.*, (SELECT COUNT(*) FROM customer_devices d WHERE d.site_id = s.id AND d.status IN ('working', 'faulty')) AS device_count
           FROM customer_sites s WHERE s.business_id = ? AND s.party_id = ? AND s.active = 1 ORDER BY s.created_at`, [businessId, partyId]
    );
    return rows;
}

async function createSite(conn, { businessId, user, payload }) {
    const name = clean(payload.name, 160);
    if (!name) throw new DeviceError('Give the site a name', 'no_name', 400);
    if (!payload.party_id) throw new DeviceError('Choose the customer', 'no_party', 400);
    const [[party]] = await conn.query('SELECT id FROM parties WHERE id = ? LIMIT 1', [payload.party_id]);
    if (!party) throw new DeviceError('No such customer', 'no_party', 400);
    const id = randomUUID();
    await conn.query('INSERT INTO customer_sites SET ?', [{
        id, business_id: businessId, party_id: payload.party_id, name, address: clean(payload.address, 400),
        notes: clean(payload.notes, 500), created_by: user?.id || null,
    }]);
    return id;
}

async function updateSite(conn, { businessId, id, payload }) {
    const [[s]] = await conn.query('SELECT * FROM customer_sites WHERE id = ? AND business_id = ?', [id, businessId]);
    if (!s) throw new DeviceError('No such site', 'not_found', 404);
    const data = {};
    if (payload.name !== undefined) { data.name = clean(payload.name, 160); if (!data.name) throw new DeviceError('Give the site a name', 'no_name', 400); }
    if (payload.address !== undefined) data.address = clean(payload.address, 400);
    if (payload.notes !== undefined) data.notes = clean(payload.notes, 500);
    if (payload.active !== undefined) {
        if (!payload.active) {
            const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM customer_devices WHERE site_id = ? AND status IN ('working', 'faulty')", [id]);
            if (Number(n)) throw new DeviceError('This site still has devices on it — move or remove them first', 'site_in_use', 409);
        }
        data.active = payload.active ? 1 : 0;
    }
    if (Object.keys(data).length) await conn.query('UPDATE customer_sites SET ? WHERE id = ?', [data, id]);
    return { ...s, ...data };
}

// ── devices ─────────────────────────────────────────────────────────────
const SELECT_DEVICE = `
    SELECT d.*, p.display_name AS party_name, p.phone AS party_phone, s.name AS site_name,
           c.contract_no AS amc_contract_no, c.end_date AS amc_end_date, c.status AS amc_status
      FROM customer_devices d
      LEFT JOIN parties p ON p.id = d.party_id
      LEFT JOIN customer_sites s ON s.id = d.site_id
      LEFT JOIN amc_contracts c ON c.id = d.amc_contract_id`;

async function listDevices(conn, businessId, { partyId = null, siteId = null, q = null, status = null, warranty = null, includeGone = false, today = new Date() } = {}) {
    const where = ['d.business_id = ?'];
    const params = [businessId];
    if (partyId) { where.push('d.party_id = ?'); params.push(partyId); }
    if (siteId) { where.push('d.site_id = ?'); params.push(siteId); }
    if (status) { where.push('d.status = ?'); params.push(status); }
    else if (!includeGone) where.push("d.status IN ('working', 'faulty')");
    if (q) {
        where.push('(d.brand LIKE ? OR d.model LIKE ? OR d.serial_no LIKE ? OR d.location_note LIKE ? OR p.display_name LIKE ? OR p.phone LIKE ?)');
        const like = `%${q}%`;
        params.push(like, like, like, like, like, like);
    }
    const [rows] = await conn.query(`${SELECT_DEVICE} WHERE ${where.join(' AND ')} ORDER BY p.display_name, s.name, d.category, d.created_at`, params);
    const shaped = rows.map((r) => ({ ...shape(r, today), amc_end_date: ymd(r.amc_end_date) }));
    return warranty ? shaped.filter((d) => d.warranty_state === warranty) : shaped;
}

function summarise(devices) {
    const units = (list) => list.reduce((n, d) => n + d.quantity, 0);
    const live = devices.filter((d) => ['working', 'faulty'].includes(d.status));
    return {
        devices: live.length,
        units: units(live),
        customers: new Set(live.map((d) => d.party_id)).size,
        faulty: live.filter((d) => d.status === 'faulty').length,
        in_warranty: live.filter((d) => ['in_warranty', 'ending'].includes(d.warranty_state)).length,
        warranty_ending: live.filter((d) => d.warranty_state === 'ending').length,
        under_amc: live.filter((d) => d.amc_contract_id && d.amc_status === 'active').length,
    };
}

async function loadDevice(conn, businessId, id, today = new Date()) {
    const [[row]] = await conn.query(`${SELECT_DEVICE} WHERE d.id = ? AND d.business_id = ? LIMIT 1`, [id, businessId]);
    if (!row) return null;
    const [events] = await conn.query('SELECT * FROM customer_device_events WHERE device_id = ? ORDER BY event_date DESC, created_at DESC', [id]);
    let replacedBy = null;
    let replaces = null;
    if (row.replaced_by_id) {
        [[replacedBy]] = await conn.query('SELECT id, brand, model, serial_no, installed_on FROM customer_devices WHERE id = ?', [row.replaced_by_id]);
    }
    [[replaces]] = await conn.query('SELECT id, brand, model, serial_no FROM customer_devices WHERE replaced_by_id = ? LIMIT 1', [id]);
    return {
        device: { ...shape(row, today), amc_end_date: ymd(row.amc_end_date) },
        events: events.map((e) => ({ ...e, event_date: ymd(e.event_date) })),
        replaced_by: replacedBy || null,
        replaces: replaces || null,
    };
}

async function addEventRow(conn, { deviceId, user, date, kind, ticket, note }) {
    const id = randomUUID();
    await conn.query('INSERT INTO customer_device_events SET ?', [{
        id, device_id: deviceId, event_date: ymd(date || new Date()), kind: EVENT_KINDS.includes(kind) ? kind : 'note',
        ticket_ref: clean(ticket, 60), note: clean(note, 500), created_by: user?.id || null,
    }]);
    return id;
}

async function createDevice(conn, { businessId, user, payload }) {
    const data = normalise(payload);
    await checkPlacement(conn, businessId, data.party_id, data);
    await checkSerial(conn, businessId, data.serial_no);
    const id = randomUUID();
    await conn.query('INSERT INTO customer_devices SET ?', [{
        id, business_id: businessId, category: 'other', quantity: 1, status: 'working', created_by: user?.id || null, ...data,
    }]);
    await addEventRow(conn, { deviceId: id, user, date: data.installed_on || new Date(), kind: 'installed', ticket: data.install_ref, note: 'Added to the register' });
    return id;
}

async function updateDevice(conn, { businessId, user, id, payload }) {
    const [[d]] = await conn.query('SELECT * FROM customer_devices WHERE id = ? AND business_id = ?', [id, businessId]);
    if (!d) throw new DeviceError('No such device', 'not_found', 404);
    // A swapped device keeps its record as it was. One that was taken away can only be put back.
    const putBack = d.status === 'removed' && payload.status === 'working' && Object.keys(payload).length === 1;
    if (['replaced', 'removed'].includes(d.status) && !putBack) {
        throw new DeviceError(`This device was ${d.status} — its record is kept as it was`, 'closed', 409);
    }
    const data = normalise(payload, { partial: true });
    if (data.site_id !== undefined || data.amc_contract_id !== undefined) await checkPlacement(conn, businessId, d.party_id, data);
    if (data.serial_no) await checkSerial(conn, businessId, data.serial_no, id);
    if (!Object.keys(data).length) return d;
    await conn.query('UPDATE customer_devices SET ? WHERE id = ?', [data, id]);
    if (data.status && data.status !== d.status) {
        const said = { faulty: 'Marked faulty', working: 'Back in working order', removed: 'Taken away' }[data.status];
        if (said) await addEventRow(conn, { deviceId: id, user, kind: 'note', note: said });
    }
    return { ...d, ...data };
}

async function addEvent(conn, { businessId, user, id, payload }) {
    const [[d]] = await conn.query('SELECT id FROM customer_devices WHERE id = ? AND business_id = ?', [id, businessId]);
    if (!d) throw new DeviceError('No such device', 'not_found', 404);
    if (!EVENT_KINDS.includes(payload.kind)) throw new DeviceError('Choose what happened', 'bad_kind', 400);
    if (!clean(payload.note, 500) && !clean(payload.ticket_ref, 60)) throw new DeviceError('Write a line about it', 'no_note', 400);
    return addEventRow(conn, { deviceId: id, user, date: payload.event_date, kind: payload.kind, ticket: payload.ticket_ref, note: payload.note });
}

/**
 * A swap. The new device takes the old one's place — same customer, site, spot
 * and contract — and the old one is closed as *replaced* and points at it.
 */
async function replaceDevice(conn, { businessId, user, id, payload }) {
    const [[old]] = await conn.query('SELECT * FROM customer_devices WHERE id = ? AND business_id = ?', [id, businessId]);
    if (!old) throw new DeviceError('No such device', 'not_found', 404);
    if (['replaced', 'removed'].includes(old.status)) throw new DeviceError(`This device is already ${old.status}`, 'closed', 409);

    const data = normalise({
        party_id: old.party_id, site_id: old.site_id, category: old.category, location_note: old.location_note,
        amc_contract_id: old.amc_contract_id, quantity: old.quantity, ...payload, status: undefined,
    });
    await checkPlacement(conn, businessId, old.party_id, data);
    await checkSerial(conn, businessId, data.serial_no);
    if (!data.installed_on) data.installed_on = ymd(new Date());

    await conn.beginTransaction();
    try {
        const newId = randomUUID();
        await conn.query('INSERT INTO customer_devices SET ?', [{
            id: newId, business_id: businessId, status: 'working', created_by: user?.id || null, ...data,
        }]);
        await conn.query('UPDATE customer_devices SET status = ?, replaced_by_id = ? WHERE id = ?', ['replaced', newId, id]);
        const label = [data.brand, data.model].filter(Boolean).join(' ') || 'a new device';
        await addEventRow(conn, { deviceId: id, user, date: data.installed_on, kind: 'replaced', ticket: payload.ticket_ref, note: `Replaced by ${label}${payload.reason ? ` — ${payload.reason}` : ''}` });
        await addEventRow(conn, { deviceId: newId, user, date: data.installed_on, kind: 'installed', ticket: payload.ticket_ref, note: `Fitted in place of ${[old.brand, old.model].filter(Boolean).join(' ') || 'the earlier device'}` });
        await conn.commit();
        return newId;
    } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
    }
}

/**
 * Bring a customer's equipment under one contract. With no list, it takes every
 * working device of that customer not already covered by a contract.
 */
async function coverDevices(conn, { businessId, contractId, deviceIds = null }) {
    const [[c]] = await conn.query('SELECT id, party_id, status FROM amc_contracts WHERE id = ? AND business_id = ?', [contractId, businessId]);
    if (!c) throw new DeviceError('No such contract', 'not_found', 404);
    if (c.status === 'cancelled') throw new DeviceError('This contract is cancelled', 'cancelled', 409);
    const ids = Array.isArray(deviceIds) && deviceIds.length ? deviceIds : null;
    const [res] = await conn.query(
        `UPDATE customer_devices SET amc_contract_id = ?
          WHERE business_id = ? AND party_id = ? AND status IN ('working', 'faulty')
            AND ${ids ? 'id IN (?)' : 'amc_contract_id IS NULL'}`,
        ids ? [contractId, businessId, c.party_id, ids] : [contractId, businessId, c.party_id]
    );
    return res.affectedRows;
}

// ── what the office and the technician see about a caller ───────────────
const last10 = (raw) => {
    const digits = String(raw || '').replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : null;
};

/**
 * Everything known about whoever this phone number belongs to: their sites,
 * their equipment, and any contract that is running. A service request carries
 * only a name and a phone, so the phone is the bridge to the customer record.
 */
async function lookupByPhone(conn, businessId, phone, today = new Date()) {
    const key = last10(phone);
    if (!key) return { parties: [] };
    const [candidates] = await conn.query("SELECT id, display_name, phone FROM parties WHERE phone IS NOT NULL AND phone <> ''");
    const matched = candidates.filter((p) => last10(p.phone) === key);

    const out = [];
    for (const p of matched.slice(0, 3)) {
        const [devices, sites, contracts] = await Promise.all([
            listDevices(conn, businessId, { partyId: p.id, today }),
            listSites(conn, businessId, p.id),
            amc.listContracts(conn, businessId, { partyId: p.id, today }),
        ]);
        out.push({
            party_id: p.id, party: p.display_name, phone: p.phone,
            sites, devices,
            contracts: contracts.filter((c) => ['active', 'expired'].includes(c.state) && !c.renewed_to_id),
        });
    }
    return { parties: out };
}

module.exports = {
    DeviceError, ensureDeviceSchema, CATEGORIES, warrantyOf, shape, summarise, ENDING_SOON_DAYS,
    listSites, createSite, updateSite, listDevices, loadDevice, createDevice, updateDevice, addEvent, replaceDevice, coverDevices, lookupByPhone, last10,
};
