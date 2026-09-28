'use strict';

// Who changed what, when, and why.
//
// Written for the changes that money depends on: a price, a tax rate, a
// cancelled invoice, a stock adjustment, a merged customer, a closed period.
// The record keeps the before and after so a dispute can be settled from the
// data rather than from memory.
//
// Auditing never blocks the work it describes: if the log write fails, the
// failure is reported to the console and the caller carries on.

const { randomUUID } = require('crypto');

function createAudit({ getConn }) {
    async function record({ actor, action, entityType, entityId, before = null, after = null, reason = null, ip = null }) {
        let connection;
        try {
            connection = await getConn();
            await connection.query('INSERT INTO audit_log SET ?', [{
                id: randomUUID(),
                actor_id: actor?.id || null,
                actor_role: actor?.role || null,
                action,
                entity_type: entityType,
                entity_id: entityId ? String(entityId) : null,
                reason,
                before_json: before ? JSON.stringify(before) : null,
                after_json: after ? JSON.stringify(after) : null,
                ip,
            }]);
        } catch (err) {
            console.error('[audit] could not record', action, entityType, entityId, '—', err.message);
        } finally {
            if (connection) connection.release();
        }
    }

    // Only the fields that actually moved, so a diff reads at a glance instead
    // of dumping the whole row.
    function diff(before, after) {
        const changed = {};
        const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
        for (const key of keys) {
            const a = before?.[key];
            const b = after?.[key];
            if (String(a ?? '') !== String(b ?? '')) changed[key] = { from: a ?? null, to: b ?? null };
        }
        return changed;
    }

    async function list(conn, { entityType = null, entityId = null, actorId = null, limit = 100 } = {}) {
        const where = [];
        const params = [];
        if (entityType) { where.push('entity_type = ?'); params.push(entityType); }
        if (entityId) { where.push('entity_id = ?'); params.push(String(entityId)); }
        if (actorId) { where.push('actor_id = ?'); params.push(actorId); }
        const [rows] = await conn.query(
            `SELECT a.*, p.full_name AS actor_name
               FROM audit_log a
               LEFT JOIN profiles p ON p.id = a.actor_id
              ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
              ORDER BY a.created_at DESC
              LIMIT ?`,
            [...params, Number(limit) || 100]
        );
        return rows;
    }

    return { record, diff, list };
}

module.exports = { createAudit };
