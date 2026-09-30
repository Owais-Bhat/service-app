'use strict';

// WhatsApp announcements to many customers — a broadcast, not a group.
//
// WhatsApp Business has no "group you post into". A campaign sends the same
// approved *marketing template* to each person on its own, so nobody sees who
// else received it. What this module adds on top of a plain send is what makes
// sending to many people safe to leave running:
//
//   * the list is frozen when the campaign is scheduled, so the count the owner
//     approved is the count that goes out;
//   * people on the do-not-message list are never included, and are checked again
//     at the moment of sending, in case they were added since;
//   * it sends slowly (a few a minute), only in daytime hours, and never more than
//     a daily cap — WhatsApp restricts numbers that blast, and each message is billed;
//   * a run of failures (a template not approved, an empty wallet) pauses the
//     campaign instead of burning through the list;
//   * every recipient's outcome is kept, and a failure is never reported as sent.

const { randomUUID } = require('crypto');
const wa = require('../whatsapp/service.cjs');
const amc = require('../amc/service.cjs');
const devices = require('../devices/service.cjs');
const { normalizeIndianMobile } = require('../../fast2sms.cjs');

class CampaignError extends Error {
    constructor(message, code = 'campaign_error', status = 422) {
        super(message);
        this.name = 'CampaignError';
        this.code = code;
        this.status = status;
    }
}

const TABLES = [
    `CREATE TABLE IF NOT EXISTS wa_campaigns (
        id VARCHAR(36) PRIMARY KEY,
        business_id VARCHAR(36) NOT NULL,
        name VARCHAR(160) NOT NULL,
        message_id VARCHAR(40) NOT NULL COMMENT 'the approved MARKETING template, from the Fast2SMS dashboard',
        variables JSON COMMENT 'what fills {{1}}, {{2}}… : name | business | text',
        media_path VARCHAR(300) COMMENT 'an uploaded image or PDF the template shows as its header',
        base_url VARCHAR(200) COMMENT 'the public address media is fetched from',
        audience JSON COMMENT 'which lists, and which segment',
        status VARCHAR(12) NOT NULL DEFAULT 'draft' COMMENT 'draft | scheduled | sending | paused | done | cancelled',
        scheduled_at DATETIME NULL,
        started_at DATETIME NULL,
        finished_at DATETIME NULL,
        pause_reason VARCHAR(300),
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_camp_status (business_id, status, scheduled_at)
    )`,
    `CREATE TABLE IF NOT EXISTS wa_campaign_recipients (
        id VARCHAR(36) PRIMARY KEY,
        campaign_id VARCHAR(36) NOT NULL,
        phone VARCHAR(10) NOT NULL,
        name VARCHAR(160),
        party_id VARCHAR(36) NULL,
        status VARCHAR(10) NOT NULL DEFAULT 'queued' COMMENT 'queued | sent | failed | skipped',
        error VARCHAR(400),
        request_id VARCHAR(80),
        sent_at DATETIME NULL,
        UNIQUE KEY uniq_camp_phone (campaign_id, phone),
        INDEX idx_camp_queue (campaign_id, status),
        FOREIGN KEY (campaign_id) REFERENCES wa_campaigns(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS marketing_optouts (
        business_id VARCHAR(36) NOT NULL,
        phone VARCHAR(10) NOT NULL,
        reason VARCHAR(200),
        created_by VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (business_id, phone)
    )`,
];

async function ensureCampaignSchema(conn) {
    for (const ddl of TABLES) await conn.query(ddl);
}

// ── limits ──────────────────────────────────────────────────────────────
const RATE_PER_MINUTE = Number(process.env.CAMPAIGN_RATE_PER_MINUTE) || 20;
const DAILY_CAP = Number(process.env.CAMPAIGN_DAILY_CAP) || 1000;
const SEND_FROM_HOUR = 9;   // India time — nobody wants a promotion at midnight
const SEND_UNTIL_HOUR = 21;
const FAILURES_BEFORE_PAUSE = 5;
const MAX_VARIABLES = 5;

/** The hour of the day in India, whatever timezone the server thinks it is in. */
function indiaHour(date = new Date()) {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(date)) % 24;
}
const inSendingHours = (date = new Date()) => {
    const h = indiaHour(date);
    return h >= SEND_FROM_HOUR && h < SEND_UNTIL_HOUR;
};

const clean = (v, max = 255) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
const last10 = (raw) => normalizeIndianMobile(raw);

// ── who it goes to ──────────────────────────────────────────────────────
const SEGMENTS = {
    all: 'Everyone on the chosen lists',
    amc_running: 'Customers with an AMC running',
    amc_lapsed: 'AMC lapsed — win them back',
    no_amc: 'Customers who never had an AMC',
    warranty_ending: 'Equipment warranty ending in 60 days',
};

/**
 * The people a campaign would reach right now, with what was left out and why.
 * `sources.customers` is the customer list; `sources.contacts` is everyone who
 * ever raised a service request, whether or not they were made a customer.
 */
async function buildAudience(conn, businessId, audience = {}) {
    const sources = { customers: audience.customers !== false, contacts: !!audience.contacts };
    const segment = SEGMENTS[audience.segment] ? audience.segment : 'all';
    if (!sources.customers && !sources.contacts) throw new CampaignError('Choose who it goes to', 'no_audience', 400);

    const people = []; // { phone, name, party_id }
    const stats = { considered: 0, invalid: 0, duplicates: 0, opted_out: 0 };

    if (segment !== 'all' && !sources.customers) throw new CampaignError('A segment picks from the customer list — tick Customers', 'bad_segment', 400);

    if (sources.customers) {
        const [parties] = await conn.query(
            `SELECT id, display_name, phone FROM parties WHERE business_id = ? AND active = 1 AND kind IN ('customer', 'both')
               AND phone IS NOT NULL AND phone <> ''`, [businessId]
        );

        let allowed = null; // a Set of party ids when a segment narrows the list
        if (segment !== 'all') {
            const contracts = await amc.listContracts(conn, businessId);
            const byParty = new Map();
            contracts.forEach((c) => { if (!byParty.has(c.party_id)) byParty.set(c.party_id, []); byParty.get(c.party_id).push(c); });
            if (segment === 'amc_running') {
                allowed = new Set([...byParty].filter(([, list]) => list.some((c) => c.state === 'active')).map(([id]) => id));
            } else if (segment === 'amc_lapsed') {
                allowed = new Set([...byParty].filter(([, list]) => !list.some((c) => ['active', 'upcoming'].includes(c.state))
                    && list.some((c) => c.state === 'expired' && !c.renewed_to_id)).map(([id]) => id));
            } else if (segment === 'no_amc') {
                allowed = new Set(parties.filter((p) => !byParty.has(p.id)).map((p) => p.id));
            } else if (segment === 'warranty_ending') {
                const list = await devices.listDevices(conn, businessId, { warranty: 'ending' });
                allowed = new Set(list.map((d) => d.party_id));
            }
        }
        for (const p of parties) {
            if (allowed && !allowed.has(p.id)) continue;
            people.push({ phone: p.phone, name: p.display_name, party_id: p.id });
        }
    }

    // Contacts carry no contract or warranty, so a segment leaves them out.
    if (sources.contacts && segment === 'all') {
        const [rows] = await conn.query(
            `SELECT phone, MAX(full_name) AS name FROM inquiries WHERE phone IS NOT NULL AND phone <> '' GROUP BY phone`
        );
        rows.forEach((r) => people.push({ phone: r.phone, name: r.name, party_id: null }));
    }

    const [optouts] = await conn.query('SELECT phone FROM marketing_optouts WHERE business_id = ?', [businessId]);
    const blocked = new Set(optouts.map((o) => o.phone));
    const seen = new Set();
    const final = [];
    for (const p of people) {
        stats.considered += 1;
        const phone = last10(p.phone);
        if (!phone) { stats.invalid += 1; continue; }
        if (seen.has(phone)) { stats.duplicates += 1; continue; }
        seen.add(phone);
        if (blocked.has(phone)) { stats.opted_out += 1; continue; }
        final.push({ phone, name: clean(p.name, 160), party_id: p.party_id });
    }
    return { recipients: final, stats: { ...stats, will_send: final.length }, segment, sources };
}

// ── a campaign's own settings ───────────────────────────────────────────
function normaliseVariables(list) {
    if (list === undefined || list === null) return [];
    if (!Array.isArray(list) || list.length > MAX_VARIABLES) throw new CampaignError(`A template can have at most ${MAX_VARIABLES} variables`, 'bad_variables', 400);
    return list.map((v) => {
        const type = ['name', 'business', 'text'].includes(v?.type) ? v.type : null;
        if (!type) throw new CampaignError('Each variable is the customer name, the business name, or fixed text', 'bad_variables', 400);
        if (type === 'text' && !clean(v.value, 200)) throw new CampaignError('A fixed-text variable needs its text', 'bad_variables', 400);
        return { type, value: type === 'text' ? clean(v.value, 200) : null };
    });
}

function normalise(payload, { partial = false } = {}) {
    const out = {};
    const has = (k) => payload[k] !== undefined;
    if (!partial || has('name')) {
        out.name = clean(payload.name, 160);
        if (!out.name) throw new CampaignError('Give the campaign a name', 'no_name', 400);
    }
    if (!partial || has('message_id')) {
        out.message_id = clean(payload.message_id, 40);
        if (!out.message_id || !/^[\w-]{1,40}$/.test(out.message_id)) throw new CampaignError('Enter the template id from Fast2SMS', 'bad_message_id', 400);
    }
    if (has('variables')) out.variables = JSON.stringify(normaliseVariables(payload.variables));
    if (has('media_path')) {
        const m = clean(payload.media_path, 300);
        if (m && !/^\/uploads\/[\w.-]+$/.test(m)) throw new CampaignError('Upload the image or PDF here rather than pasting a link', 'bad_media', 400);
        out.media_path = m;
    }
    if (has('audience')) {
        const a = payload.audience || {};
        if (a.segment && !SEGMENTS[a.segment]) throw new CampaignError('Unknown segment', 'bad_segment', 400);
        out.audience = JSON.stringify({ customers: a.customers !== false, contacts: !!a.contacts, segment: a.segment || 'all' });
    }
    return out;
}

const parse = (v, fallback) => { try { return typeof v === 'string' ? JSON.parse(v) : (v ?? fallback); } catch { return fallback; } };

async function counts(conn, campaignId) {
    const [rows] = await conn.query('SELECT status, COUNT(*) AS n FROM wa_campaign_recipients WHERE campaign_id = ? GROUP BY status', [campaignId]);
    const c = { queued: 0, sent: 0, failed: 0, skipped: 0 };
    rows.forEach((r) => { c[r.status] = Number(r.n); });
    return { ...c, total: c.queued + c.sent + c.failed + c.skipped };
}

const shape = (row, progress) => ({
    ...row,
    variables: parse(row.variables, []),
    audience: parse(row.audience, { customers: true, contacts: false, segment: 'all' }),
    progress,
});

async function listCampaigns(conn, businessId) {
    const [rows] = await conn.query('SELECT * FROM wa_campaigns WHERE business_id = ? ORDER BY created_at DESC LIMIT 100', [businessId]);
    return Promise.all(rows.map(async (r) => shape(r, await counts(conn, r.id))));
}

async function loadCampaign(conn, businessId, id, { recipients = 0 } = {}) {
    const [[row]] = await conn.query('SELECT * FROM wa_campaigns WHERE id = ? AND business_id = ? LIMIT 1', [id, businessId]);
    if (!row) return null;
    const out = shape(row, await counts(conn, id));
    if (recipients) {
        const [rs] = await conn.query(
            `SELECT phone, name, status, error, sent_at FROM wa_campaign_recipients WHERE campaign_id = ?
              ORDER BY FIELD(status, 'failed', 'sent', 'queued', 'skipped'), name LIMIT ?`, [id, Math.min(500, recipients)]
        );
        out.recipients = rs;
    }
    return out;
}

async function createCampaign(conn, { businessId, user, baseUrl, payload }) {
    const data = normalise(payload);
    const id = randomUUID();
    await conn.query('INSERT INTO wa_campaigns SET ?', [{
        id, business_id: businessId, created_by: user?.id || null, base_url: clean(baseUrl, 200),
        variables: JSON.stringify([]), audience: JSON.stringify({ customers: true, contacts: false, segment: 'all' }), ...data,
    }]);
    return id;
}

async function updateCampaign(conn, { businessId, id, payload }) {
    const [[c]] = await conn.query('SELECT status FROM wa_campaigns WHERE id = ? AND business_id = ?', [id, businessId]);
    if (!c) throw new CampaignError('No such campaign', 'not_found', 404);
    if (c.status !== 'draft') throw new CampaignError('A campaign that has been scheduled cannot be edited — cancel it and make a new one', 'not_draft', 409);
    const data = normalise(payload, { partial: true });
    if (Object.keys(data).length) await conn.query('UPDATE wa_campaigns SET ? WHERE id = ?', [data, id]);
}

async function deleteCampaign(conn, { businessId, id }) {
    const [[c]] = await conn.query('SELECT status FROM wa_campaigns WHERE id = ? AND business_id = ?', [id, businessId]);
    if (!c) throw new CampaignError('No such campaign', 'not_found', 404);
    if (['scheduled', 'sending', 'paused'].includes(c.status)) throw new CampaignError('Cancel it before deleting', 'in_progress', 409);
    await conn.query('DELETE FROM wa_campaigns WHERE id = ?', [id]);
}

// ── scheduling ──────────────────────────────────────────────────────────
/**
 * Freezes the list and puts the campaign in the queue. `at` is when it may start
 * (null = as soon as sending hours allow). The people are written down now, so the
 * number the owner confirms is the number that goes out.
 */
async function schedule(conn, { businessId, id, at = null, now = new Date() }) {
    const [[c]] = await conn.query('SELECT * FROM wa_campaigns WHERE id = ? AND business_id = ? LIMIT 1', [id, businessId]);
    if (!c) throw new CampaignError('No such campaign', 'not_found', 404);
    if (c.status !== 'draft') throw new CampaignError('This campaign has already been scheduled', 'not_draft', 409);

    const settings = await wa.getSettings(conn, businessId);
    if (!settings.enabled || !settings.phone_number_id) {
        throw new CampaignError('Switch WhatsApp on and set the phone number id in Business Settings → WhatsApp first', 'not_ready', 409);
    }
    const when = at ? new Date(at) : now;
    if (Number.isNaN(when.getTime())) throw new CampaignError('That date and time is not valid', 'bad_time', 400);
    if (at && when.getTime() < now.getTime() - 5 * 60 * 1000) throw new CampaignError('That time has already passed', 'past', 400);

    const { recipients, stats } = await buildAudience(conn, businessId, parse(c.audience, {}));
    if (!recipients.length) throw new CampaignError('Nobody would receive this — check the audience', 'nobody', 409);

    await conn.beginTransaction();
    try {
        await conn.query('DELETE FROM wa_campaign_recipients WHERE campaign_id = ?', [id]);
        for (let i = 0; i < recipients.length; i += 500) {
            const chunk = recipients.slice(i, i + 500);
            await conn.query('INSERT INTO wa_campaign_recipients (id, campaign_id, phone, name, party_id) VALUES ?',
                [chunk.map((r) => [randomUUID(), id, r.phone, r.name, r.party_id])]);
        }
        await conn.query("UPDATE wa_campaigns SET status = 'scheduled', scheduled_at = ?, pause_reason = NULL WHERE id = ?", [when, id]);
        await conn.commit();
    } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
    }
    return { recipients: recipients.length, stats, scheduled_at: when };
}

async function setStatus(conn, { businessId, id, action }) {
    const [[c]] = await conn.query('SELECT status FROM wa_campaigns WHERE id = ? AND business_id = ?', [id, businessId]);
    if (!c) throw new CampaignError('No such campaign', 'not_found', 404);
    if (action === 'pause') {
        if (!['scheduled', 'sending'].includes(c.status)) throw new CampaignError('Only a campaign that is waiting or sending can be paused', 'bad_state', 409);
        await conn.query("UPDATE wa_campaigns SET status = 'paused', pause_reason = 'Paused by you' WHERE id = ?", [id]);
    } else if (action === 'resume') {
        if (c.status !== 'paused') throw new CampaignError('Only a paused campaign can be resumed', 'bad_state', 409);
        await conn.query("UPDATE wa_campaigns SET status = 'sending', pause_reason = NULL WHERE id = ?", [id]);
    } else if (action === 'cancel') {
        if (!['draft', 'scheduled', 'sending', 'paused'].includes(c.status)) throw new CampaignError('This campaign is already finished', 'bad_state', 409);
        await conn.query("UPDATE wa_campaigns SET status = 'cancelled', finished_at = NOW() WHERE id = ?", [id]);
        await conn.query("UPDATE wa_campaign_recipients SET status = 'skipped', error = 'Campaign cancelled' WHERE campaign_id = ? AND status = 'queued'", [id]);
    } else {
        throw new CampaignError('Unknown action', 'bad_action', 400);
    }
}

// ── sending ─────────────────────────────────────────────────────────────
function resolveVariables(spec, { name, business }) {
    return spec.map((v) => (v.type === 'name' ? (name || 'Customer') : v.type === 'business' ? business : v.value));
}

const mediaFor = (c) => (c.media_path && c.base_url ? { mediaUrl: `${c.base_url.replace(/\/$/, '')}${c.media_path}`, filename: /\.pdf$/i.test(c.media_path) ? 'announcement.pdf' : null } : {});

/** One message, to one number, for this campaign. Never throws. */
async function sendOne({ campaign, settings, business, phone, name, apiKey, fetchImpl }) {
    return wa.callFast2Sms({
        apiKey, fetchImpl, phoneNumberId: settings.phone_number_id, messageId: campaign.message_id, number: phone,
        variables: resolveVariables(parse(campaign.variables, []), { name, business }), ...mediaFor(campaign),
        udf1: `c${campaign.id.slice(0, 8)}`,
    });
}

/** A single test message to the owner's own number, before anything is scheduled. */
async function testSend(conn, { businessId, id, phone, apiKey = process.env.WHATSAPP_API_KEY || process.env.SMS_API, fetchImpl }) {
    const [[c]] = await conn.query('SELECT * FROM wa_campaigns WHERE id = ? AND business_id = ? LIMIT 1', [id, businessId]);
    if (!c) throw new CampaignError('No such campaign', 'not_found', 404);
    const number = last10(phone);
    if (!number) throw new CampaignError('Enter your own 10-digit mobile number', 'bad_phone', 400);
    const settings = await wa.getSettings(conn, businessId);
    if (!settings.enabled || !settings.phone_number_id) throw new CampaignError('Switch WhatsApp on and set the phone number id in Business Settings → WhatsApp first', 'not_ready', 409);
    const [[b]] = await conn.query('SELECT legal_name, trade_name FROM businesses WHERE id = ? LIMIT 1', [businessId]);
    const out = await sendOne({ campaign: c, settings, business: b?.trade_name || b?.legal_name || 'Networking Experts', phone: number, name: 'Test', apiKey, fetchImpl });
    return { ok: out.ok, error: out.error || null, phone: number };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sentToday(conn, businessId, now) {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const [[{ n }]] = await conn.query(
        `SELECT COUNT(*) AS n FROM wa_campaign_recipients r JOIN wa_campaigns c ON c.id = r.campaign_id
          WHERE c.business_id = ? AND r.status = 'sent' AND r.sent_at >= ?`, [businessId, start]
    );
    return Number(n);
}

let ticking = false;

/**
 * One pass of the sender. Starts campaigns whose time has come, then sends the
 * next few messages of each one that is running — only in sending hours, and
 * only up to today's cap.
 */
async function tick({ getConn, recordNotification = null, now = new Date(), apiKey = process.env.WHATSAPP_API_KEY || process.env.SMS_API, fetchImpl, pauseMs = 300, ignoreHours = false } = {}) {
    if (ticking) return { skipped: 'already running' };
    ticking = true;
    let conn;
    const summary = { started: 0, sent: 0, failed: 0, paused: 0, finished: 0, waiting: null };
    try {
        conn = await getConn();
        await conn.query("UPDATE wa_campaigns SET status = 'sending', started_at = COALESCE(started_at, ?) WHERE status = 'scheduled' AND scheduled_at <= ?", [now, now]);

        if (!ignoreHours && !inSendingHours(now)) { summary.waiting = 'outside sending hours'; return summary; }

        const [running] = await conn.query("SELECT * FROM wa_campaigns WHERE status = 'sending' ORDER BY scheduled_at");
        for (const c of running) {
            const settings = await wa.getSettings(conn, c.business_id);
            if (!settings.enabled || !settings.phone_number_id) {
                await conn.query("UPDATE wa_campaigns SET status = 'paused', pause_reason = ? WHERE id = ?", ['WhatsApp sending was switched off', c.id]);
                summary.paused += 1;
                continue;
            }
            const [[b]] = await conn.query('SELECT legal_name, trade_name FROM businesses WHERE id = ? LIMIT 1', [c.business_id]);
            const businessName = b?.trade_name || b?.legal_name || 'Networking Experts';

            const room = DAILY_CAP - await sentToday(conn, c.business_id, now);
            if (room <= 0) { summary.waiting = 'daily cap reached'; continue; }

            const [batch] = await conn.query(
                "SELECT * FROM wa_campaign_recipients WHERE campaign_id = ? AND status = 'queued' ORDER BY name, phone LIMIT ?",
                [c.id, Math.min(RATE_PER_MINUTE, room)]
            );
            const [optouts] = await conn.query('SELECT phone FROM marketing_optouts WHERE business_id = ?', [c.business_id]);
            const blocked = new Set(optouts.map((o) => o.phone));

            let failuresInARow = 0;
            for (const r of batch) {
                if (blocked.has(r.phone)) {
                    await conn.query("UPDATE wa_campaign_recipients SET status = 'skipped', error = 'On the do-not-message list' WHERE id = ?", [r.id]);
                    continue;
                }
                const out = await sendOne({ campaign: c, settings, business: businessName, phone: r.phone, name: r.name, apiKey, fetchImpl });
                await conn.query('UPDATE wa_campaign_recipients SET status = ?, error = ?, request_id = ?, sent_at = ? WHERE id = ?',
                    [out.ok ? 'sent' : 'failed', out.ok ? null : String(out.error).slice(0, 400), out.request_id || null, out.ok ? new Date() : null, r.id]);
                if (out.ok) { summary.sent += 1; failuresInARow = 0; } else { summary.failed += 1; failuresInARow += 1; }

                if (failuresInARow >= FAILURES_BEFORE_PAUSE) {
                    await conn.query("UPDATE wa_campaigns SET status = 'paused', pause_reason = ? WHERE id = ?",
                        [`Paused after ${FAILURES_BEFORE_PAUSE} failures in a row: ${String(out.error).slice(0, 200)}`, c.id]);
                    summary.paused += 1;
                    if (recordNotification) {
                        recordNotification({ audience: { role: 'admin' }, subject: 'campaign_paused', title: `Campaign paused — ${c.name}`, body: `It stopped after ${FAILURES_BEFORE_PAUSE} failures in a row: ${out.error}`, data: { campaign_id: c.id } }).catch(() => {});
                    }
                    break;
                }
                if (pauseMs) await sleep(pauseMs);
            }

            const p = await counts(conn, c.id);
            const [[stillRunning]] = await conn.query("SELECT status FROM wa_campaigns WHERE id = ?", [c.id]);
            if (stillRunning.status === 'sending' && p.queued === 0) {
                await conn.query("UPDATE wa_campaigns SET status = 'done', finished_at = ? WHERE id = ?", [now, c.id]);
                summary.finished += 1;
                if (recordNotification) {
                    recordNotification({ audience: { role: 'admin' }, subject: 'campaign_done', title: `Campaign finished — ${c.name}`, body: `${p.sent} sent, ${p.failed} failed, ${p.skipped} skipped.`, data: { campaign_id: c.id } }).catch(() => {});
                }
            }
        }
        return summary;
    } finally {
        ticking = false;
        if (conn) conn.release();
    }
}

// ── the do-not-message list ─────────────────────────────────────────────
async function listOptouts(conn, businessId) {
    const [rows] = await conn.query('SELECT phone, reason, created_at FROM marketing_optouts WHERE business_id = ? ORDER BY created_at DESC LIMIT 1000', [businessId]);
    return rows;
}

/** Accepts one number or a pasted list; returns how many were added and how many could not be read. */
async function addOptouts(conn, { businessId, user, numbers, reason }) {
    const list = (Array.isArray(numbers) ? numbers : String(numbers || '').split(/[\s,;]+/)).filter(Boolean);
    let added = 0; let unreadable = 0;
    for (const raw of list) {
        const phone = last10(raw);
        if (!phone) { unreadable += 1; continue; }
        const [res] = await conn.query('INSERT IGNORE INTO marketing_optouts (business_id, phone, reason, created_by) VALUES (?, ?, ?, ?)',
            [businessId, phone, clean(reason, 200), user?.id || null]);
        added += res.affectedRows;
    }
    // Anyone already waiting in a campaign is taken out of it.
    if (added) {
        await conn.query(
            `UPDATE wa_campaign_recipients r JOIN wa_campaigns c ON c.id = r.campaign_id
                SET r.status = 'skipped', r.error = 'On the do-not-message list'
              WHERE c.business_id = ? AND r.status = 'queued' AND r.phone IN (SELECT phone FROM marketing_optouts WHERE business_id = ?)`,
            [businessId, businessId]
        );
    }
    return { added, unreadable };
}

async function removeOptout(conn, { businessId, phone }) {
    await conn.query('DELETE FROM marketing_optouts WHERE business_id = ? AND phone = ?', [businessId, last10(phone) || phone]);
}

module.exports = {
    CampaignError, ensureCampaignSchema, SEGMENTS, RATE_PER_MINUTE, DAILY_CAP, SEND_FROM_HOUR, SEND_UNTIL_HOUR, FAILURES_BEFORE_PAUSE,
    indiaHour, inSendingHours, buildAudience, listCampaigns, loadCampaign, createCampaign, updateCampaign, deleteCampaign,
    schedule, setStatus, testSend, tick, listOptouts, addOptouts, removeOptout, resolveVariables,
};
