'use strict';

// Stage 5 API. Every route is read-only and gated on `report.financial`.

const service = require('./service.cjs');
const { defaultBusinessId } = require('../ledger/schema.cjs');

function mountReports({ app, getConn, authenticateToken, permissions }) {
    const { requireCap } = permissions;

    const handle = (fn) => async (req, res) => {
        let conn;
        try {
            conn = await getConn();
            const businessId = await defaultBusinessId(conn);
            if (!businessId) return res.status(400).json({ error: 'No business configured' });
            await fn(req, res, conn, businessId);
        } catch (err) {
            if (err && err.status) return res.status(err.status).json({ error: err.message });
            console.error('[reports]', req.method, req.path, '—', err.message);
            if (!res.headersSent) res.status(500).json({ error: err.message });
        } finally {
            if (conn) conn.release();
        }
    };

    const bad = (message) => Object.assign(new Error(message), { status: 400 });
    const date = (value, fallback, label) => {
        if (value === undefined || value === null || value === '') return fallback;
        const d = service.ymd(value);
        if (!d) throw bad(`${label} is not a valid date`);
        return d;
    };

    // The period every report defaults to: this financial year, to today.
    const period = async (req, conn, businessId) => {
        const [[biz]] = await conn.query('SELECT fy_start_month FROM businesses WHERE id = ? LIMIT 1', [businessId]);
        const from = date(req.query.from, service.startOfFinancialYear(biz?.fy_start_month), 'From');
        const to = date(req.query.to, service.today(), 'To');
        if (from > to) throw bad('The start date is after the end date');
        return { from, to };
    };
    const cap = requireCap('report.financial');
    const get = (path, fn) => app.get(`/api/reports/${path}`, authenticateToken, cap, handle(fn));

    get('profit-loss', async (req, res, conn, businessId) => {
        res.json(await service.profitLoss(conn, businessId, await period(req, conn, businessId)));
    });

    get('balance-sheet', async (req, res, conn, businessId) => {
        res.json(await service.balanceSheet(conn, businessId, { asOn: date(req.query.as_on, service.today(), 'As on') }));
    });

    get('account-ledger', async (req, res, conn, businessId) => {
        if (!req.query.account) throw bad('Choose an account');
        const account = await service.resolveAccount(conn, businessId, String(req.query.account));
        if (!account) throw Object.assign(new Error('No such account'), { status: 404 });
        res.json(await service.accountLedger(conn, businessId, { account, ...(await period(req, conn, businessId)) }));
    });

    get('ageing', async (req, res, conn, businessId) => {
        const kind = req.query.kind === 'payable' ? 'payable' : 'receivable';
        res.json(await service.ageing(conn, businessId, { kind, asOn: date(req.query.as_on, service.today(), 'As on') }));
    });

    get('party-statement', async (req, res, conn, businessId) => {
        if (!req.query.party_id) throw bad('Choose a customer or supplier');
        const out = await service.partyStatement(conn, businessId, { partyId: String(req.query.party_id), ...(await period(req, conn, businessId)) });
        if (!out) throw Object.assign(new Error('No such party'), { status: 404 });
        res.json(out);
    });

    get('gst/summary', async (req, res, conn, businessId) => {
        res.json(await service.gstSummary(conn, businessId, await period(req, conn, businessId)));
    });
    get('gst/sales-register', async (req, res, conn, businessId) => {
        res.json({ rows: await service.salesRegister(conn, businessId, await period(req, conn, businessId)) });
    });
    get('gst/purchase-register', async (req, res, conn, businessId) => {
        res.json({ rows: await service.purchaseRegister(conn, businessId, await period(req, conn, businessId)) });
    });
    get('gst/hsn-summary', async (req, res, conn, businessId) => {
        res.json({
            rows: await service.hsnSummary(conn, businessId, await period(req, conn, businessId)),
            note: 'From invoice lines. Service and installation tickets carry no HSN/SAC, so they are not in this table.',
        });
    });

    get('stock-valuation', async (req, res, conn, businessId) => {
        res.json(await service.stockValuation(conn, businessId));
    });

    get('reconciliation', async (req, res, conn, businessId) => {
        res.json(await service.reconciliation(conn, businessId, { asOn: date(req.query.as_on, service.today(), 'As on') }));
    });

    console.log('[reports] Stage 5 routes mounted (P&L, balance sheet, ledgers, ageing, GST, reconciliation)');
}

module.exports = { mountReports };
