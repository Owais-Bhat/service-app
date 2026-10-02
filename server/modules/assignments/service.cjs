'use strict';

// Did the technician see the job? — the assignment tracker.
//
// When a service request or an installation is given to someone, they are told
// by SMS (as before) and now also by a WhatsApp template message. This module
// records what happens next, so the owner can see — in one list — who has not yet
// noticed a job:
//
//   * the WhatsApp message: sent → delivered → read (from Fast2SMS's webhook;
//     "read" only appears if the person has read receipts switched on),
//   * the job opened in the portal or the app (our own record, no receipts needed),
//   * the job accepted.
//
// A job counts as *seen* the moment any of the three has happened.

const wa = require('../whatsapp/service.cjs');
const campaigns = require('../campaigns/service.cjs');
const { defaultBusinessId } = require('../ledger/schema.cjs');

const KINDS = {
    inquiry: { table: 'inquiries', serviceCol: 'service_item', placeCol: 'location', label: 'Service request' },
    installation: { table: 'installations', serviceCol: 'installation_type', placeCol: 'address', label: 'Installation' },
};

// A job that is finished stops being chased.
const DONE = ['resolved', 'closed', 'case_closed', 'cancelled', 'completed', 'rejected'];

const last10 = (v) => String(v || '').replace(/\D/g, '').slice(-10);
const rank = { sent: 1, delivered: 2, read: 3 };

async function ensureAssignmentSchema(conn) {
    for (const { table } of Object.values(KINDS)) {
        const [have] = await conn.query(`SHOW COLUMNS FROM ${table} LIKE 'assignment_seen_at'`);
        if (!have.length) {
            await conn.query(`ALTER TABLE ${table} ADD COLUMN assignment_seen_at TIMESTAMP NULL COMMENT 'when the assigned person first opened the job; cleared on every new assignment'`);
        }
    }
}

async function loadJob(conn, kind, id) {
    const k = KINDS[kind];
    if (!k) return null;
    const [[row]] = await conn.query(`SELECT * FROM ${k.table} WHERE id = ? LIMIT 1`, [id]);
    if (!row) return null;
    return {
        kind, id: row.id, ticket_no: row.ticket_no || null,
        customer_name: row.full_name || 'Customer', customer_phone: row.phone || '',
        service: row[k.serviceCol] || (kind === 'installation' ? 'Installation' : 'General service'),
        place: row[k.placeCol] || row.location || row.address || '',
        status: row.status, assignment_status: row.assignment_status || null,
        assigned_employee_id: row.assigned_employee_id || null,
        assigned_at: row.assigned_at || null, accepted_at: row.accepted_at || null,
        seen_at: row.assignment_seen_at || null, created_at: row.created_at,
    };
}

/**
 * A job has just been given to someone: forget that it was ever seen, and send
 * the WhatsApp message. Never throws — if WhatsApp is not set up yet the job is
 * still assigned and the SMS still goes; the tracker just shows "not sent".
 */
async function announce(getConn, { kind, id, employeeId, force = false, fetchImpl, apiKey }) {
    let conn;
    try {
        conn = await getConn();
        const k = KINDS[kind];
        if (!k || !id || !employeeId) return { ok: false, skipped: 'nothing to announce' };
        await conn.query(`UPDATE ${k.table} SET assignment_seen_at = NULL WHERE id = ?`, [id]);

        const job = await loadJob(conn, kind, id);
        const [[emp]] = await conn.query('SELECT full_name, phone FROM profiles WHERE id = ? LIMIT 1', [employeeId]);
        if (!job || !emp?.phone) return { ok: false, skipped: 'no job or no phone for the technician' };

        const businessId = await defaultBusinessId(conn);
        const out = await wa.sendTemplate(conn, {
            businessId, user: null, purpose: 'job_assignment', refType: kind, refId: id, phone: emp.phone, force,
            variables: [emp.full_name || 'there', job.ticket_no || 'New job', job.customer_name, job.customer_phone || '-', job.place || 'See the portal'],
            fetchImpl, apiKey,
        });
        return out;
    } catch (err) {
        // "not set up", "switched off", "no template yet", "sent a moment ago" are all expected.
        if (!(err instanceof wa.WhatsappError)) console.error('[assignments] announce failed —', err.message);
        return { ok: false, skipped: err.message };
    } finally {
        if (conn) conn.release();
    }
}

/** The assigned person opened the job. Only the assignee's own opening counts. */
async function markSeen(conn, { kind, id, userId }) {
    const k = KINDS[kind];
    if (!k) return { ok: false };
    const [res] = await conn.query(
        `UPDATE ${k.table} SET assignment_seen_at = COALESCE(assignment_seen_at, NOW()) WHERE id = ? AND assigned_employee_id = ?`,
        [id, userId]
    );
    return { ok: res.affectedRows > 0 };
}

/** What the owner sees: every open assigned job, and whether anyone has noticed it. */
async function tracker(conn, { filter = 'not_seen', days = 14 } = {}) {
    const jobs = [];
    for (const [kind, k] of Object.entries(KINDS)) {
        const [rows] = await conn.query(
            `SELECT j.id, j.ticket_no, j.full_name, j.phone, j.${k.serviceCol} AS service, j.${k.placeCol} AS place,
                    j.status, j.assignment_status, j.assigned_employee_id, j.assigned_at, j.assignment_seen_at,
                    ${kind === 'installation' ? 'j.accepted_at' : 'NULL'} AS accepted_at,
                    p.full_name AS employee_name, p.phone AS employee_phone
               FROM ${k.table} j JOIN profiles p ON p.id = j.assigned_employee_id
              WHERE j.assigned_employee_id IS NOT NULL
                AND COALESCE(j.assigned_at, j.created_at) >= (NOW() - INTERVAL ? DAY)
                AND COALESCE(j.status, '') NOT IN (?)
              ORDER BY COALESCE(j.assigned_at, j.created_at) DESC LIMIT 300`,
            [Math.min(Math.max(Number(days) || 14, 1), 90), DONE]
        );
        rows.forEach((r) => jobs.push({ kind, ...r }));
    }
    if (!jobs.length) return { rows: [], counts: { all: 0, not_seen: 0, not_accepted: 0 } };

    // The latest assignment message to each job's current technician.
    const [messages] = await conn.query(
        `SELECT ref_id, phone, status, delivery, delivered_at, read_at, error, delivery_error, created_at
           FROM whatsapp_messages WHERE purpose = 'job_assignment' AND ref_id IN (?) ORDER BY created_at DESC`,
        [jobs.map((j) => j.id)]
    );
    const byJob = new Map();
    for (const m of messages) {
        const key = `${m.ref_id}:${last10(m.phone)}`;
        if (!byJob.has(key)) byJob.set(key, m);
    }

    const now = Date.now();
    const rows = jobs.map((j) => {
        const m = byJob.get(`${j.id}:${last10(j.employee_phone)}`) || null;
        let whatsapp = { state: 'not_sent', at: null, error: null };
        if (m) {
            if (m.status === 'failed' || m.delivery === 'failed') whatsapp = { state: 'failed', at: m.created_at, error: m.delivery_error || m.error || null };
            else if (m.delivery === 'read' || m.read_at) whatsapp = { state: 'read', at: m.read_at || m.created_at, error: null };
            else if (m.delivery === 'delivered' || m.delivered_at) whatsapp = { state: 'delivered', at: m.delivered_at || m.created_at, error: null };
            else whatsapp = { state: 'sent', at: m.created_at, error: null };
        }
        const accepted = j.assignment_status === 'accepted' || !!j.accepted_at;
        const appOpened = !!j.assignment_seen_at;
        const seen = appOpened || accepted || whatsapp.state === 'read';
        const since = j.assigned_at ? new Date(j.assigned_at).getTime() : null;
        return {
            kind: j.kind, id: j.id, ticket_no: j.ticket_no, service: j.service, place: j.place,
            customer_name: j.full_name, customer_phone: j.phone,
            employee_id: j.assigned_employee_id, employee_name: j.employee_name, employee_phone: j.employee_phone,
            status: j.status, assigned_at: j.assigned_at,
            minutes_waiting: since ? Math.max(0, Math.round((now - since) / 60000)) : null,
            whatsapp, app_opened_at: j.assignment_seen_at || null, accepted, seen,
            seen_via: appOpened ? 'app' : accepted ? 'accepted' : whatsapp.state === 'read' ? 'whatsapp' : null,
        };
    });

    const counts = {
        all: rows.length,
        not_seen: rows.filter((r) => !r.seen).length,
        not_accepted: rows.filter((r) => !r.accepted).length,
    };
    const shown = filter === 'all' ? rows
        : filter === 'not_accepted' ? rows.filter((r) => !r.accepted)
            : rows.filter((r) => !r.seen);
    // The longest-waiting first, so the ones that need a nudge are at the top.
    shown.sort((a, b) => (b.minutes_waiting ?? 0) - (a.minutes_waiting ?? 0));
    return { rows: shown, counts };
}

const STOP_WORDS = /^\s*(stop|unsubscribe|unsub|cancel|band|band karo)\s*[.!]*\s*$/i;

/**
 * One event from Fast2SMS's WhatsApp webhook.
 *   status_update    — sent / delivered / read / failed for a message we sent
 *   incoming_message — somebody wrote to our number; "STOP" opts them out of offers
 *
 * `trusted` is true only when the request carried the right secret. Status updates
 * only change what a screen shows, so they are taken either way; a STOP changes who
 * is sent offers, so it is taken only from a trusted request.
 */
async function handleWebhook(conn, event, { trusted = false } = {}) {
    const e = event?.data && typeof event.data === 'object' ? { ...event, ...event.data } : (event || {});
    const type = e.webhook_type || (e.body !== undefined ? 'incoming_message' : 'status_update');

    if (type === 'incoming_message') {
        const from = last10(e.from);
        if (!trusted || !from || !STOP_WORDS.test(String(e.body || ''))) return { handled: false, type };
        const businessId = await defaultBusinessId(conn);
        await campaigns.addOptouts(conn, { businessId, user: null, numbers: [from], reason: 'Replied STOP on WhatsApp' });
        return { handled: true, type, opted_out: from };
    }

    const status = String(e.status || '').toLowerCase();
    if (!rank[status] && status !== 'failed') return { handled: false, type, reason: 'unknown status' };

    const phone = last10(e.recipient_id || e.recipient || e.to);
    const wamid = e.message_id ? String(e.message_id).slice(0, 120) : null;
    let row = null;
    if (wamid) [[row]] = await conn.query('SELECT * FROM whatsapp_messages WHERE provider_message_id = ? LIMIT 1', [wamid]);
    if (!row && phone) {
        // The first update for a message tells us its provider id; until then the
        // newest message to that number that has none yet is the one it means.
        [[row]] = await conn.query(
            `SELECT * FROM whatsapp_messages WHERE phone = ? AND provider_message_id IS NULL AND status = 'sent'
                AND created_at > (NOW() - INTERVAL 3 DAY) ORDER BY created_at DESC LIMIT 1`, [phone]
        );
    }
    if (!row) return { handled: false, type, reason: 'no matching message' };

    const when = Number(e.timestamp) > 1e9 ? new Date(Number(e.timestamp) * 1000) : new Date();
    const updates = {};
    if (!row.provider_message_id && wamid) updates.provider_message_id = wamid;
    const current = row.delivery;

    if (status === 'failed') {
        updates.delivery = 'failed';
        updates.delivery_error = String(e.error_message || e.status_description || 'The phone could not be reached').slice(0, 300);
    } else if (!current || current === 'failed' || rank[status] > (rank[current] || 0)) {
        updates.delivery = status;
        if (status === 'delivered' && !row.delivered_at) updates.delivered_at = when;
        if (status === 'read') {
            if (!row.read_at) updates.read_at = when;
            if (!row.delivered_at) updates.delivered_at = when;
        }
    }
    if (Object.keys(updates).length) await conn.query('UPDATE whatsapp_messages SET ? WHERE id = ?', [updates, row.id]);
    return { handled: true, type, message_id: row.id, delivery: updates.delivery || current };
}

/** The text a person pastes into the team's WhatsApp group (the screen opens WhatsApp with it). */
function groupText(r) {
    return [
        `🔔 New ${r.kind === 'installation' ? 'installation' : 'service'} assigned`,
        r.ticket_no ? `Ticket: ${r.ticket_no}` : null,
        r.service ? `Work: ${r.service}` : null,
        `Customer: ${r.customer_name}${r.customer_phone ? ` (${r.customer_phone})` : ''}`,
        r.place ? `Place: ${r.place}` : null,
        `Assigned to: ${r.employee_name || '—'}`,
        '',
        `${r.employee_name || 'Technician'}, please reply "seen" once you have read this.`,
    ].filter((l) => l !== null).join('\n');
}

module.exports = { KINDS, ensureAssignmentSchema, loadJob, announce, markSeen, tracker, handleWebhook, groupText, last10 };
