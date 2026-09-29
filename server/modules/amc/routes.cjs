'use strict';

// API for annual maintenance contracts.

const posting = require('../ledger/posting.cjs');
const sales = require('../sales/service.cjs');
const amc = require('./service.cjs');
const { defaultBusinessId } = require('../ledger/schema.cjs');

const CHECK_MS = 6 * 60 * 60 * 1000;
// Days before the end at which the office is told, once each.
const NOTICE_DAYS = [1, 7, 15, 30];

function mountAmc({ app, getConn, authenticateToken, permissions, audit, recordNotification }) {
    const { requireCap } = permissions;

    const handle = (fn) => async (req, res) => {
        let connection;
        try {
            connection = await getConn();
            await fn(req, res, connection);
        } catch (err) {
            const known = err instanceof amc.AmcError || err instanceof sales.SalesError || err instanceof posting.PostingError;
            if (connection) await connection.rollback().catch(() => {});
            if (known) return res.status(err.status || 422).json({ error: err.message, code: err.code });
            console.error('[amc]', req.method, req.path, '—', err.message);
            if (!res.headersSent) res.status(500).json({ error: err.message });
        } finally {
            if (connection) connection.release();
        }
    };

    const business = async (conn) => {
        const id = await defaultBusinessId(conn);
        if (!id) throw new amc.AmcError('No business configured', 'no_business', 400);
        return id;
    };

    const view = requireCap('amc.view');
    const manage = requireCap('amc.manage');

    app.get('/api/amc/contracts', authenticateToken, view, handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const all = await amc.listContracts(conn, businessId, { q: req.query.q || null, partyId: req.query.party_id || null });
        res.json({
            contracts: req.query.state ? all.filter((c) => c.state === req.query.state) : all,
            summary: amc.summarise(all),
        });
    }));

    app.get('/api/amc/renewals', authenticateToken, view, handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const within = Math.min(365, Math.max(1, Number(req.query.days) || 45));
        res.json({ within_days: within, contracts: await amc.renewalsDue(conn, businessId, { withinDays: within }) });
    }));

    app.get('/api/amc/contracts/:id', authenticateToken, view, handle(async (req, res, conn) => {
        const out = await amc.loadContract(conn, req.params.id);
        if (!out) return res.status(404).json({ error: 'No such contract' });
        res.json(out);
    }));

    app.post('/api/amc/contracts', authenticateToken, manage, handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const id = await amc.createContract(conn, { businessId, user: req.user, payload: req.body || {} });
        const out = await amc.loadContract(conn, id);
        audit.record({
            actor: req.user, action: 'amc.create', entityType: 'amc_contract', entityId: id,
            after: { contract_no: out.contract.contract_no, party_id: out.contract.party_id, amount_paise: out.contract.amount_paise }, ip: req.ip,
        });
        res.status(201).json(out);
    }));

    app.patch('/api/amc/contracts/:id', authenticateToken, manage, handle(async (req, res, conn) => {
        await amc.updateContract(conn, { id: req.params.id, payload: req.body || {} });
        audit.record({ actor: req.user, action: 'amc.update', entityType: 'amc_contract', entityId: req.params.id, after: req.body, ip: req.ip });
        res.json(await amc.loadContract(conn, req.params.id));
    }));

    app.post('/api/amc/contracts/:id/cancel', authenticateToken, manage, handle(async (req, res, conn) => {
        await amc.cancelContract(conn, { id: req.params.id, reason: req.body?.reason });
        audit.record({ actor: req.user, action: 'amc.cancel', entityType: 'amc_contract', entityId: req.params.id, reason: req.body?.reason, ip: req.ip });
        res.json(await amc.loadContract(conn, req.params.id));
    }));

    // One click: the invoice for this term, issued, and on the customer's account.
    app.post('/api/amc/contracts/:id/invoice', authenticateToken, manage, requireCap('invoice.create'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const docId = await amc.invoiceContract(conn, {
            businessId, user: req.user, id: req.params.id, issue: req.body?.issue !== false,
        });
        const invoice = await sales.loadDocument(conn, docId);
        audit.record({
            actor: req.user, action: 'amc.invoice', entityType: 'amc_contract', entityId: req.params.id,
            after: { document_id: docId, doc_no: invoice.document.doc_no, total_paise: invoice.document.total_paise }, ip: req.ip,
        });
        res.status(201).json({ ...(await amc.loadContract(conn, req.params.id)), invoice: invoice.document });
    }));

    app.post('/api/amc/contracts/:id/renew', authenticateToken, manage, handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const newId = await amc.renewContract(conn, { businessId, user: req.user, id: req.params.id, payload: req.body || {} });
        audit.record({
            actor: req.user, action: 'amc.renew', entityType: 'amc_contract', entityId: req.params.id,
            after: { renewed_to_id: newId }, ip: req.ip,
        });
        res.status(201).json(await amc.loadContract(conn, newId));
    }));

    app.post('/api/amc/contracts/:id/visits', authenticateToken, manage, handle(async (req, res, conn) => {
        const out = await amc.addVisit(conn, { user: req.user, contractId: req.params.id, payload: req.body || {} });
        audit.record({ actor: req.user, action: 'amc.visit', entityType: 'amc_contract', entityId: req.params.id, after: { visit_id: out.id, chargeable: out.chargeable }, ip: req.ip });
        res.status(201).json({ ...out, ...(await amc.loadContract(conn, req.params.id)) });
    }));

    app.delete('/api/amc/visits/:id', authenticateToken, manage, handle(async (req, res, conn) => {
        const gone = await amc.removeVisit(conn, { id: req.params.id });
        audit.record({ actor: req.user, action: 'amc.visit_remove', entityType: 'amc_contract', entityId: gone.contract_id, ip: req.ip });
        res.json(await amc.loadContract(conn, gone.contract_id));
    }));

    // The office pressed the WhatsApp button; remember that it did.
    app.post('/api/amc/contracts/:id/reminded', authenticateToken, manage, handle(async (req, res, conn) => {
        await amc.markReminded(conn, { id: req.params.id });
        res.json(await amc.loadContract(conn, req.params.id));
    }));

    // ── the daily look at what is about to lapse ────────────────────────
    // Once per threshold per contract: the notice for "15 days left" is sent the
    // day it becomes true, not every day after. The threshold last announced is
    // held in memory and, across restarts, worked out again from the dates — a
    // restart at worst repeats one notice.
    const announced = new Map();

    async function sweep() {
        let conn;
        try {
            conn = await getConn();
            const businessId = await defaultBusinessId(conn);
            if (!businessId) return { sent: 0 };
            const due = await amc.renewalsDue(conn, businessId, { withinDays: Math.max(...NOTICE_DAYS) });
            let sent = 0;
            for (const c of due) {
                // The nearest threshold not yet passed: 20 days left is the "30 days" notice.
                const threshold = c.state === 'expired' ? 0 : NOTICE_DAYS.find((d) => c.days_left <= d);
                if (threshold === undefined) continue;
                const key = `${c.id}:${threshold}`;
                if (announced.has(key)) continue;
                announced.set(key, Date.now());
                sent += 1;
                await recordNotification({
                    audience: { role: 'admin' }, subject: 'amc_renewal',
                    title: c.state === 'expired' ? `AMC expired — ${c.party_name}` : `AMC ending in ${c.days_left} days — ${c.party_name}`,
                    body: `${c.contract_no} · ${c.title}. Renew it before the customer's cameras go out of cover.`,
                    data: { contract_id: c.id, type: 'amc_renewal' },
                });
            }
            return { sent };
        } finally {
            if (conn) conn.release();
        }
    }

    function startRenewalJob() {
        console.log('[amc] renewal notice job active (checks every 6 hours)');
        const tick = () => sweep().catch((err) => console.error('[amc] renewal check failed —', err.message));
        setTimeout(tick, 30 * 1000).unref?.();
        setInterval(tick, CHECK_MS).unref?.();
    }

    console.log('[amc] routes mounted (contracts, visits, renewals)');
    return { startRenewalJob, sweep };
}

module.exports = { mountAmc };
