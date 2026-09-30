'use strict';

// API for WhatsApp announcements: campaigns, their audience, the schedule, and
// the do-not-message list. The sender itself runs on a timer, below.

const posting = require('../ledger/posting.cjs');
const camp = require('./service.cjs');
const wa = require('../whatsapp/service.cjs');
const { defaultBusinessId } = require('../ledger/schema.cjs');

const SENDER_INTERVAL_MS = 60 * 1000;

function mountCampaigns({ app, getConn, authenticateToken, permissions, audit, recordNotification }) {
    const { requireCap } = permissions;
    const guard = requireCap('marketing.manage');

    const handle = (fn) => async (req, res) => {
        let connection;
        try {
            connection = await getConn();
            await fn(req, res, connection);
        } catch (err) {
            const known = err instanceof camp.CampaignError || err instanceof wa.WhatsappError || err instanceof posting.PostingError;
            if (connection) await connection.rollback().catch(() => {});
            if (known) return res.status(err.status || 422).json({ error: err.message, code: err.code });
            console.error('[campaigns]', req.method, req.path, '—', err.message);
            if (!res.headersSent) res.status(500).json({ error: err.message });
        } finally {
            if (connection) connection.release();
        }
    };

    const business = async (conn) => {
        const id = await defaultBusinessId(conn);
        if (!id) throw new camp.CampaignError('No business configured', 'no_business', 400);
        return id;
    };

    // The public https address an uploaded image is fetched from by WhatsApp.
    const baseUrl = (req) => {
        if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
        const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
        return `${proto}://${req.get('host')}`;
    };

    app.get('/api/campaigns/meta', authenticateToken, guard, handle(async (req, res) => {
        res.json({
            segments: camp.SEGMENTS, rate_per_minute: camp.RATE_PER_MINUTE, daily_cap: camp.DAILY_CAP,
            hours: { from: camp.SEND_FROM_HOUR, until: camp.SEND_UNTIL_HOUR, zone: 'India time' },
            sending_now: camp.inSendingHours(),
        });
    }));

    // ── the do-not-message list ─────────────────────────────────────────
    app.get('/api/campaigns/optouts', authenticateToken, guard, handle(async (req, res, conn) => {
        res.json(await camp.listOptouts(conn, await business(conn)));
    }));

    app.post('/api/campaigns/optouts', authenticateToken, guard, handle(async (req, res, conn) => {
        const out = await camp.addOptouts(conn, { businessId: await business(conn), user: req.user, numbers: req.body?.numbers, reason: req.body?.reason });
        audit.record({ actor: req.user, action: 'marketing.optout_add', entityType: 'marketing_optout', after: out, ip: req.ip });
        res.status(201).json(out);
    }));

    app.delete('/api/campaigns/optouts/:phone', authenticateToken, guard, handle(async (req, res, conn) => {
        await camp.removeOptout(conn, { businessId: await business(conn), phone: req.params.phone });
        audit.record({ actor: req.user, action: 'marketing.optout_remove', entityType: 'marketing_optout', entityId: req.params.phone, ip: req.ip });
        res.json({ ok: true });
    }));

    // How many people an audience would reach, and who was left out and why.
    app.post('/api/campaigns/audience', authenticateToken, guard, handle(async (req, res, conn) => {
        const a = await camp.buildAudience(conn, await business(conn), req.body || {});
        res.json({ ...a.stats, sample: a.recipients.slice(0, 5).map((r) => ({ name: r.name, phone: `${r.phone.slice(0, 2)}••••••${r.phone.slice(-2)}` })) });
    }));

    // ── campaigns ───────────────────────────────────────────────────────
    app.get('/api/campaigns', authenticateToken, guard, handle(async (req, res, conn) => {
        res.json(await camp.listCampaigns(conn, await business(conn)));
    }));

    app.post('/api/campaigns', authenticateToken, guard, handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const id = await camp.createCampaign(conn, { businessId, user: req.user, baseUrl: baseUrl(req), payload: req.body || {} });
        audit.record({ actor: req.user, action: 'campaign.create', entityType: 'wa_campaign', entityId: id, after: { name: req.body.name }, ip: req.ip });
        res.status(201).json(await camp.loadCampaign(conn, businessId, id));
    }));

    app.get('/api/campaigns/:id', authenticateToken, guard, handle(async (req, res, conn) => {
        const c = await camp.loadCampaign(conn, await business(conn), req.params.id, { recipients: 300 });
        if (!c) return res.status(404).json({ error: 'No such campaign' });
        res.json(c);
    }));

    app.patch('/api/campaigns/:id', authenticateToken, guard, handle(async (req, res, conn) => {
        const businessId = await business(conn);
        await camp.updateCampaign(conn, { businessId, id: req.params.id, payload: req.body || {} });
        res.json(await camp.loadCampaign(conn, businessId, req.params.id));
    }));

    app.delete('/api/campaigns/:id', authenticateToken, guard, handle(async (req, res, conn) => {
        await camp.deleteCampaign(conn, { businessId: await business(conn), id: req.params.id });
        audit.record({ actor: req.user, action: 'campaign.delete', entityType: 'wa_campaign', entityId: req.params.id, ip: req.ip });
        res.json({ ok: true });
    }));

    app.post('/api/campaigns/:id/test', authenticateToken, guard, handle(async (req, res, conn) => {
        const out = await camp.testSend(conn, { businessId: await business(conn), id: req.params.id, phone: req.body?.phone });
        if (!out.ok) return res.status(502).json({ error: `WhatsApp did not accept it: ${out.error}`, code: 'provider_failed' });
        res.json(out);
    }));

    app.post('/api/campaigns/:id/schedule', authenticateToken, guard, handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const out = await camp.schedule(conn, { businessId, id: req.params.id, at: req.body?.scheduled_at || null });
        audit.record({
            actor: req.user, action: 'campaign.schedule', entityType: 'wa_campaign', entityId: req.params.id,
            after: { recipients: out.recipients, scheduled_at: out.scheduled_at, skipped: out.stats }, ip: req.ip,
        });
        res.json({ ...out, campaign: await camp.loadCampaign(conn, businessId, req.params.id) });
    }));

    // A monthly campaign: switch its automatic sending on or off, or publish it right now.
    app.post('/api/campaigns/:id/auto', authenticateToken, guard, handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const out = await camp.setAuto(conn, { businessId, id: req.params.id, enabled: !!req.body?.enabled });
        audit.record({ actor: req.user, action: req.body?.enabled ? 'campaign.auto_on' : 'campaign.auto_off', entityType: 'wa_campaign', entityId: req.params.id, after: out, ip: req.ip });
        res.json({ ...out, campaign: await camp.loadCampaign(conn, businessId, req.params.id) });
    }));

    app.post('/api/campaigns/:id/publish-now', authenticateToken, guard, handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const out = await camp.startRun(conn, { businessId, id: req.params.id });
        audit.record({ actor: req.user, action: 'campaign.publish_now', entityType: 'wa_campaign', entityId: req.params.id, after: { run_id: out.run_id, recipients: out.recipients }, ip: req.ip });
        res.status(201).json({ ...out, campaign: await camp.loadCampaign(conn, businessId, req.params.id) });
    }));

    for (const action of ['pause', 'resume', 'cancel']) {
        app.post(`/api/campaigns/:id/${action}`, authenticateToken, guard, handle(async (req, res, conn) => {
            const businessId = await business(conn);
            await camp.setStatus(conn, { businessId, id: req.params.id, action });
            audit.record({ actor: req.user, action: `campaign.${action}`, entityType: 'wa_campaign', entityId: req.params.id, ip: req.ip });
            res.json(await camp.loadCampaign(conn, businessId, req.params.id));
        }));
    }

    // ── the sender ──────────────────────────────────────────────────────
    function startSender() {
        console.log(`[campaigns] sender active (every minute; ${camp.RATE_PER_MINUTE}/min, ${camp.DAILY_CAP}/day, ${camp.SEND_FROM_HOUR}:00–${camp.SEND_UNTIL_HOUR}:00 India time)`);
        const run = () => camp.tick({ getConn, recordNotification }).catch((err) => console.error('[campaigns] sender pass failed —', err.message));
        setInterval(run, SENDER_INTERVAL_MS).unref?.();
    }

    console.log('[campaigns] routes mounted (campaigns, audience, schedule, do-not-message list)');
    return { startSender, SENDER_INTERVAL_MS };
}

module.exports = { mountCampaigns };
