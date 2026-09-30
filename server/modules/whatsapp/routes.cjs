'use strict';

// API for sending WhatsApp messages and the settings that make it possible.

const posting = require('../ledger/posting.cjs');
const sales = require('../sales/service.cjs');
const amc = require('../amc/service.cjs');
const wa = require('./service.cjs');
const { defaultBusinessId } = require('../ledger/schema.cjs');

function mountWhatsapp({ app, getConn, authenticateToken, permissions, audit }) {
    const { requireCap, can } = permissions;

    const handle = (fn) => async (req, res) => {
        let connection;
        try {
            connection = await getConn();
            await fn(req, res, connection);
        } catch (err) {
            const known = err instanceof wa.WhatsappError || err instanceof sales.SalesError || err instanceof amc.AmcError || err instanceof posting.PostingError;
            if (connection) await connection.rollback().catch(() => {});
            if (known) return res.status(err.status || 422).json({ error: err.message, code: err.code });
            console.error('[whatsapp]', req.method, req.path, '—', err.message);
            if (!res.headersSent) res.status(500).json({ error: err.message });
        } finally {
            if (connection) connection.release();
        }
    };

    const business = async (conn) => {
        const id = await defaultBusinessId(conn);
        if (!id) throw new wa.WhatsappError('No business configured', 'no_business', 400);
        return id;
    };

    // The address a customer's phone can reach us at. WhatsApp fetches the PDF
    // from it, so it has to be the public https address, not localhost.
    const baseUrl = (req) => {
        if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
        const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
        return `${proto}://${req.get('host')}`;
    };

    const guard = (purpose) => async (req, res, next) => {
        if (!(await can(req.user, wa.PURPOSES[purpose].cap))) return res.status(403).json({ error: 'You do not have permission for this' });
        next();
    };

    const respond = (res, out) => {
        if (!out.ok) return res.status(502).json({ error: `WhatsApp did not accept it: ${out.error}`, code: 'provider_failed', message: out });
        res.json(out);
    };

    // ── settings ────────────────────────────────────────────────────────
    app.get('/api/whatsapp/settings', authenticateToken, requireCap('business.manage'), handle(async (req, res, conn) => {
        res.json({ ...(await wa.getSettings(conn, await business(conn))), public_base: baseUrl(req) });
    }));

    app.put('/api/whatsapp/settings', authenticateToken, requireCap('business.manage'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const saved = await wa.saveSettings(conn, { businessId, user: req.user, payload: req.body || {} });
        audit.record({
            actor: req.user, action: 'whatsapp.settings', entityType: 'whatsapp_settings', entityId: businessId,
            after: { enabled: saved.enabled, phone_number_id: saved.phone_number_id, templates: saved.templates.map((t) => `${t.purpose}=${t.message_id || '-'}`) }, ip: req.ip,
        });
        res.json(saved);
    }));

    // Sends a template with made-up details to a number of the owner's choosing,
    // to prove the id and the wording work before a customer sees anything.
    app.post('/api/whatsapp/test', authenticateToken, requireCap('business.manage'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const purpose = req.body?.purpose;
        const def = wa.PURPOSES[purpose];
        if (!def) return res.status(400).json({ error: 'Choose which message to test' });
        await wa.assertReady(conn, businessId, purpose);

        let mediaUrl = null;
        let filename = null;
        if (def.media) {
            const [[doc]] = await conn.query(
                "SELECT id, doc_no FROM sales_documents WHERE status IN ('issued', 'accepted') ORDER BY created_at DESC LIMIT 1");
            if (!doc) return res.status(409).json({ error: 'Issue an invoice first — the test sends a real PDF' });
            const { token } = await sales.createShareLink(conn, { documentId: doc.id, user: req.user, days: 1 });
            mediaUrl = `${baseUrl(req)}/api/public/documents/${token}/pdf`;
            filename = `${doc.doc_no || 'sample'}.pdf`;
        }
        const out = await wa.sendTemplate(conn, {
            businessId, user: req.user, purpose, refType: 'test', phone: req.body?.phone, variables: def.sample, mediaUrl, filename, force: true,
        });
        respond(res, out);
    }));

    // ── sending ─────────────────────────────────────────────────────────
    app.post('/api/whatsapp/send/document', authenticateToken, guard('document'), handle(async (req, res, conn) => {
        const out = await wa.sendDocument(conn, {
            businessId: await business(conn), user: req.user, documentId: req.body?.document_id,
            baseUrl: baseUrl(req), phone: req.body?.phone || null, force: !!req.body?.force,
        });
        audit.record({ actor: req.user, action: 'whatsapp.send_document', entityType: 'sales_document', entityId: req.body?.document_id, after: { ok: out.ok, phone: out.phone }, ip: req.ip });
        respond(res, out);
    }));

    app.post('/api/whatsapp/send/payment-reminder', authenticateToken, guard('payment_reminder'), handle(async (req, res, conn) => {
        if (!req.body?.party_id) return res.status(400).json({ error: 'Choose the customer' });
        const out = await wa.sendPaymentReminder(conn, { businessId: await business(conn), user: req.user, partyId: req.body.party_id, force: !!req.body.force });
        respond(res, out);
    }));

    app.post('/api/whatsapp/send/amc-renewal', authenticateToken, guard('amc_renewal'), handle(async (req, res, conn) => {
        if (!req.body?.contract_id) return res.status(400).json({ error: 'Choose the contract' });
        const out = await wa.sendAmcRenewal(conn, { businessId: await business(conn), user: req.user, contractId: req.body.contract_id, force: !!req.body.force });
        respond(res, out);
    }));

    // ── the log ─────────────────────────────────────────────────────────
    app.get('/api/whatsapp/log', authenticateToken, requireCap('business.manage'), handle(async (req, res, conn) => {
        res.json(await wa.recentMessages(conn, await business(conn), { limit: Number(req.query.limit) || 30, refId: req.query.ref_id || null }));
    }));

    console.log('[whatsapp] routes mounted (settings, send document / payment reminder / AMC renewal, log)');
}

module.exports = { mountWhatsapp };
