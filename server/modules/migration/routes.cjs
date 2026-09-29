'use strict';

// Stage 6 API: reviewed migration of what existed before the books, the
// evening summary, and the switch for it.

const service = require('./service.cjs');
const { defaultBusinessId } = require('../ledger/schema.cjs');

const DIGEST_CHECK_MS = 15 * 60 * 1000;

function mountMigration({ app, getConn, authenticateToken, permissions, audit, recordNotification }) {
    const { requireCap } = permissions;

    const handle = (fn) => async (req, res) => {
        let conn;
        try {
            conn = await getConn();
            const businessId = await defaultBusinessId(conn);
            if (!businessId) return res.status(400).json({ error: 'No business configured' });
            await fn(req, res, conn, businessId);
        } catch (err) {
            if (conn) await conn.rollback().catch(() => {});
            if (err instanceof service.MigrationError || (err && err.name === 'PostingError')) {
                return res.status(err.status || 422).json({ error: err.message, code: err.code });
            }
            console.error('[migration]', req.method, req.path, '—', err.message);
            if (!res.headersSent) res.status(500).json({ error: err.message });
        } finally {
            if (conn) conn.release();
        }
    };

    const view = requireCap('report.financial');
    const change = requireCap('ledger.post');

    // ── tickets billed before the ledger started ────────────────────────
    app.get('/api/migration/tickets/preview', authenticateToken, view, handle(async (req, res, conn, businessId) => {
        res.json(await service.ticketPreview(conn, businessId, { from: req.query.from }));
    }));

    app.post('/api/migration/tickets/apply', authenticateToken, change, handle(async (req, res, conn, businessId) => {
        const out = await service.ticketApply(getConn, conn, { businessId, from: req.body?.from, userId: req.user.id });
        audit.record({
            actor: req.user, action: 'migration.tickets', entityType: 'migration_run', entityId: out.run_id,
            after: { from: out.from, posted: out.posted, blocked: out.blocked }, ip: req.ip,
        });
        res.status(201).json(out);
    }));

    // ── stock already on the shelf ──────────────────────────────────────
    app.get('/api/migration/stock/preview', authenticateToken, view, handle(async (req, res, conn, businessId) => {
        res.json(await service.stockPreview(conn, businessId));
    }));

    app.post('/api/migration/stock/apply', authenticateToken, change, handle(async (req, res, conn, businessId) => {
        const out = await service.stockApply(conn, {
            businessId, date: req.body?.date, itemIds: Array.isArray(req.body?.item_ids) ? req.body.item_ids : null, userId: req.user.id,
        });
        audit.record({
            actor: req.user, action: 'migration.stock', entityType: 'migration_run', entityId: out.run_id,
            after: { items: out.items, value_paise: out.value_paise }, ip: req.ip,
        });
        res.status(201).json(out);
    }));

    // ── the hand-kept service register ──────────────────────────────────
    app.get('/api/migration/service-log/preview', authenticateToken, view, handle(async (req, res, conn, businessId) => {
        res.json(await service.serviceLogPreview(conn, businessId, { from: req.query.from, to: req.query.to }));
    }));

    app.post('/api/migration/service-log/apply', authenticateToken, change, handle(async (req, res, conn, businessId) => {
        const out = await service.serviceLogApply(conn, { businessId, ids: req.body?.ids, paidInto: req.body?.paid_into, userId: req.user.id });
        audit.record({
            actor: req.user, action: 'migration.service_log', entityType: 'migration_run', entityId: out.run_id,
            after: { posted: out.posted, failed: out.failed, billed_paise: out.billed_paise }, ip: req.ip,
        });
        res.status(201).json(out);
    }));

    app.get('/api/migration/runs', authenticateToken, view, handle(async (req, res, conn, businessId) => {
        res.json(await service.runs(conn, businessId));
    }));

    // ── the evening summary ─────────────────────────────────────────────
    app.get('/api/migration/automation', authenticateToken, view, handle(async (req, res, conn, businessId) => {
        const [[biz]] = await conn.query('SELECT owner_digest_on FROM businesses WHERE id = ? LIMIT 1', [businessId]);
        const [[last]] = await conn.query("SELECT setting_value FROM app_settings WHERE setting_key = 'last_owner_digest' LIMIT 1").catch(() => [[null]]);
        res.json({ owner_digest_on: !!biz.owner_digest_on, last_digest: last ? last.setting_value : null });
    }));

    app.put('/api/migration/automation', authenticateToken, change, handle(async (req, res, conn, businessId) => {
        const on = req.body?.owner_digest_on ? 1 : 0;
        await conn.query('UPDATE businesses SET owner_digest_on = ? WHERE id = ?', [on, businessId]);
        audit.record({ actor: req.user, action: 'automation.owner_digest', entityType: 'business', entityId: businessId, after: { on }, ip: req.ip });
        res.json({ owner_digest_on: !!on });
    }));

    // Sends the summary now, whatever the hour — to see what it says.
    app.post('/api/migration/automation/send-now', authenticateToken, change, handle(async (req, res) => {
        res.json(await service.sendDigest({ getConn, recordNotification, force: true }));
    }));

    function startDigestJob() {
        console.log('[migration] evening summary job active (after 8 pm server time)');
        const tick = () => service.sendDigest({ getConn, recordNotification }).catch((err) => console.error('[migration] summary failed —', err.message));
        setInterval(tick, DIGEST_CHECK_MS).unref?.();
    }

    console.log('[migration] Stage 6 routes mounted (migration, summary, reminders)');
    return { startDigestJob };
}

module.exports = { mountMigration };
