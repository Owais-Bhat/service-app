'use strict';

// The assignment tracker's API, the "I have seen it" ping from the technician's
// screen, and the webhook Fast2SMS calls with WhatsApp delivery / read receipts.

const crypto = require('crypto');
const svc = require('./service.cjs');

function mountAssignments({ app, getConn, authenticateToken, permissions }) {
    const { requireCap } = permissions;

    const handle = (fn) => async (req, res) => {
        let conn;
        try {
            conn = await getConn();
            await fn(req, res, conn);
        } catch (err) {
            console.error('[assignments]', req.method, req.path, '—', err.message);
            if (!res.headersSent) res.status(500).json({ error: err.message });
        } finally {
            if (conn) conn.release();
        }
    };

    // Who has not noticed a job yet.
    app.get('/api/assignments/tracker', authenticateToken, requireCap('business.manage'), handle(async (req, res, conn) => {
        const filter = ['not_seen', 'not_accepted', 'all'].includes(req.query.filter) ? req.query.filter : 'not_seen';
        const out = await svc.tracker(conn, { filter, days: req.query.days });
        res.json({ ...out, filter, rows: out.rows.map((r) => ({ ...r, group_text: svc.groupText(r) })) });
    }));

    // The assigned technician opened the job (web or app). Anyone else's call is ignored.
    app.post('/api/assignments/:kind/:id/seen', authenticateToken, handle(async (req, res, conn) => {
        if (!svc.KINDS[req.params.kind]) return res.status(404).json({ error: 'Unknown kind of job' });
        res.json(await svc.markSeen(conn, { kind: req.params.kind, id: req.params.id, userId: req.user.id }));
    }));

    // Send the WhatsApp message again (the technician never got it, or the first one failed).
    app.post('/api/assignments/:kind/:id/resend', authenticateToken, requireCap('business.manage'), handle(async (req, res, conn) => {
        const job = await svc.loadJob(conn, req.params.kind, req.params.id);
        if (!job) return res.status(404).json({ error: 'No such job' });
        if (!job.assigned_employee_id) return res.status(409).json({ error: 'This job is not assigned to anyone' });
        const out = await svc.announce(getConn, { kind: req.params.kind, id: job.id, employeeId: job.assigned_employee_id, force: true });
        if (!out.ok) return res.status(502).json({ error: `WhatsApp did not go: ${out.error || out.skipped || 'unknown'}` });
        res.json(out);
    }));

    // Fast2SMS → us. Set the URL under Fast2SMS → Webhooks → WhatsApp. The secret (the same value as
    // FAST2SMS_WEBHOOK_SECRET) may come in the `webhook_secret_key` header (Fast2SMS's signing) or as
    // `?key=` on the URL — some web servers drop headers with underscores, the URL form always arrives.
    app.post('/api/webhook/fast2sms-whatsapp', async (req, res) => {
        const secret = process.env.FAST2SMS_WEBHOOK_SECRET || '';
        const sent = String(req.headers['webhook_secret_key'] || req.query.key || '');
        let trusted = false;
        if (secret) {
            const a = Buffer.from(sent); const b = Buffer.from(secret);
            trusted = a.length === b.length && crypto.timingSafeEqual(a, b);
            if (!trusted) return res.status(401).json({ error: 'Bad signature' });
        }
        let conn;
        try {
            conn = await getConn();
            const events = Array.isArray(req.body) ? req.body : [req.body];
            const results = [];
            for (const ev of events.slice(0, 50)) results.push(await svc.handleWebhook(conn, ev, { trusted }));
            res.json({ ok: true, handled: results.filter((r) => r.handled).length });
        } catch (err) {
            console.error('[assignments] webhook failed —', err.message);
            // 5xx makes Fast2SMS retry, which is what we want for a transient database error.
            res.status(500).json({ error: 'Could not record that' });
        } finally {
            if (conn) conn.release();
        }
    });

    console.log('[assignments] routes mounted');
}

module.exports = { mountAssignments };
