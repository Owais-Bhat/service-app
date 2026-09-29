'use strict';

// Settings and status for service income in the books, and the two ways
// tickets reach them: a quick sync right after a ticket is saved, and a sweep
// every few minutes that catches whatever changed by any other route.

const service = require('./service.cjs');
const { defaultBusinessId } = require('../ledger/schema.cjs');

const SWEEP_EVERY_MS = 5 * 60 * 1000;

function mountServiceLedger({ app, getConn, authenticateToken, permissions, audit }) {
    const { requireCap } = permissions;
    let lastSweep = null;
    let running = null;

    // One sweep at a time. A caller that arrives while one is running waits for
    // it and then runs its own, so "sync now" always reflects the ticket as it
    // is now rather than as it was when the earlier sweep looked.
    const runSweep = async (userId = null) => {
        while (running) await running.catch(() => {});
        running = service.sweep(getConn, { userId })
            .then((out) => { lastSweep = { at: new Date().toISOString(), ...out }; return out; })
            .finally(() => { running = null; });
        return running;
    };

    // Fire and forget: the ticket's own request must never wait on, or fail
    // because of, the books. If this misses, the sweep will not.
    function syncSoon(kind, id) {
        if (!service.KINDS[kind] || !id) return;
        setImmediate(async () => {
            let conn;
            try {
                conn = await getConn();
                await service.syncTicket(conn, kind, id);
            } catch (err) {
                console.error('[service-ledger] sync failed for', kind, id, '—', err.message);
            } finally {
                if (conn) conn.release();
            }
        });
    }

    function startSweeper() {
        const tick = () => runSweep().catch((err) => console.error('[service-ledger] sweep failed —', err.message));
        setTimeout(tick, 30 * 1000).unref?.();
        setInterval(tick, SWEEP_EVERY_MS).unref?.();
    }

    const handle = (fn) => async (req, res) => {
        let conn;
        try {
            conn = await getConn();
            await fn(req, res, conn);
        } catch (err) {
            console.error('[service-ledger]', req.method, req.path, '—', err.message);
            if (!res.headersSent) res.status(500).json({ error: err.message });
        } finally {
            if (conn) conn.release();
        }
    };

    app.get('/api/service-ledger/status', authenticateToken, requireCap('report.financial'), handle(async (req, res, conn) => {
        const businessId = await defaultBusinessId(conn);
        const [[biz]] = await conn.query('SELECT service_ledger_from, state_code FROM businesses WHERE id = ? LIMIT 1', [businessId]);
        const [counts] = await conn.query(
            'SELECT status, COUNT(*) AS n FROM service_ledger_links WHERE business_id = ? GROUP BY status', [businessId]
        );
        const [attention] = await conn.query(
            `SELECT source_type, source_id, ticket_ref, note, synced_at FROM service_ledger_links
              WHERE business_id = ? AND status = 'blocked' ORDER BY synced_at DESC LIMIT 20`, [businessId]
        );
        const [[posted]] = await conn.query(
            `SELECT COUNT(*) AS tickets,
                    SUM(income_journal_id IS NOT NULL) AS billed,
                    SUM(collect_journal_id IS NOT NULL) AS collected
               FROM service_ledger_links WHERE business_id = ?`, [businessId]
        );
        res.json({
            from: service.ymd(biz?.service_ledger_from),
            enabled: !!biz?.service_ledger_from,
            counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])),
            billed: Number(posted.billed || 0),
            collected: Number(posted.collected || 0),
            attention,
            last_sweep: lastSweep,
        });
    }));

    // `from: null` switches it off; a date switches it on from that day.
    app.put('/api/service-ledger/settings', authenticateToken, requireCap('ledger.post'), handle(async (req, res, conn) => {
        const businessId = await defaultBusinessId(conn);
        const raw = req.body?.from;
        const from = raw === null || raw === '' ? null : service.ymd(raw);
        if (raw !== null && raw !== '' && !from) return res.status(400).json({ error: 'That is not a valid date' });

        const [[before]] = await conn.query('SELECT service_ledger_from FROM businesses WHERE id = ?', [businessId]);
        await conn.query('UPDATE businesses SET service_ledger_from = ? WHERE id = ?', [from, businessId]);
        audit.record({
            actor: req.user, action: 'service_ledger.settings', entityType: 'business', entityId: businessId,
            before: { from: service.ymd(before?.service_ledger_from) }, after: { from }, ip: req.ip,
        });
        if (from) runSweep(req.user.id).catch(() => {});
        res.json({ from, enabled: !!from });
    }));

    app.post('/api/service-ledger/sync', authenticateToken, requireCap('ledger.post'), handle(async (req, res) => {
        res.json(await runSweep(req.user.id));
    }));

    console.log('[service-ledger] routes mounted');
    return { syncSoon, startSweeper, runSweep };
}

module.exports = { mountServiceLedger };
