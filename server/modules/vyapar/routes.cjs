'use strict';

// API for bringing a Vyapar backup in and for reading the history it brought.
//
// The file is uploaded once; what was read from it is kept in memory for an hour under a session id, so the
// three import steps (and the preview) do not each need the file again. Nothing is written to disk.

const crypto = require('crypto');
const express = require('express');
const reader = require('./reader.cjs');
const svc = require('./service.cjs');
const { defaultBusinessId } = require('../ledger/schema.cjs');

const SESSION_MS = 60 * 60 * 1000;
const MAX_SESSIONS = 3;

function mountVyapar({ app, getConn, authenticateToken, permissions, audit }) {
    const { requireCap } = permissions;
    const sessions = new Map();

    const sweep = () => {
        const now = Date.now();
        for (const [id, s] of sessions) if (now - s.at > SESSION_MS) sessions.delete(id);
    };

    const adminOnly = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only' }));

    const handle = (fn) => async (req, res) => {
        let conn;
        try {
            conn = await getConn();
            await fn(req, res, conn);
        } catch (err) {
            if (conn) await conn.rollback().catch(() => {});
            if (err instanceof reader.VyaparError || err.status) return res.status(err.status || 400).json({ error: err.message, code: err.code });
            console.error('[vyapar]', req.method, req.path, '—', err.message);
            if (!res.headersSent) res.status(500).json({ error: err.message });
        } finally {
            if (conn) conn.release();
        }
    };

    const session = (req, res) => {
        sweep();
        const s = sessions.get(req.params.session);
        if (!s || s.userId !== req.user.id) { res.status(410).json({ error: 'That upload has expired — choose the backup file again', code: 'expired' }); return null; }
        s.at = Date.now();
        return s;
    };

    // ── the upload: read it and say what is in it ───────────────────────
    app.post('/api/vyapar/upload', authenticateToken, adminOnly, express.raw({ type: () => true, limit: '60mb' }), handle(async (req, res) => {
        if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'No file was received' });
        const data = await reader.readVyapar(req.body);
        sweep();
        while (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
        const id = crypto.randomBytes(16).toString('hex');
        const fileName = String(req.headers['x-file-name'] || 'vyapar-backup').slice(0, 150);
        sessions.set(id, { at: Date.now(), userId: req.user.id, data, fileName });
        audit.record({ actor: req.user, action: 'vyapar.upload', entityType: 'vyapar', entityId: null, after: { file: fileName, bytes: req.body.length }, ip: req.ip });
        res.json({ session: id, file_name: fileName, summary: reader.summarise(data) });
    }));

    const step = (name, run) => app.post(`/api/vyapar/:session/${name}`, authenticateToken, adminOnly, handle(async (req, res, conn) => {
        const s = session(req, res);
        if (!s) return;
        const businessId = await defaultBusinessId(conn);
        const out = await run(conn, { businessId, userId: req.user.id, data: s.data, fileName: s.fileName, asOn: String(req.body?.as_on || '').slice(0, 10) });
        audit.record({ actor: req.user, action: `vyapar.${name}`, entityType: 'vyapar', entityId: null, after: { file: s.fileName, ...out, skipped: undefined, stock_journals: undefined }, ip: req.ip });
        res.json(out);
    }));
    step('parties', svc.importParties);
    step('items', svc.importItems);
    step('history', svc.importHistory);

    // ── what has been done so far ───────────────────────────────────────
    app.get('/api/vyapar/status', authenticateToken, adminOnly, handle(async (req, res, conn) => {
        res.json(await svc.status(conn, await defaultBusinessId(conn)));
    }));

    // ── reading the history ─────────────────────────────────────────────
    app.get('/api/vyapar/history', authenticateToken, requireCap('invoice.view'), handle(async (req, res, conn) => {
        const q = req.query;
        res.json(await svc.listHistory(conn, {
            businessId: await defaultBusinessId(conn), type: q.type, q: q.q ? String(q.q).slice(0, 80) : '', partyId: q.party_id || null,
            from: /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : null, to: /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : null,
            limit: q.limit, offset: q.offset,
        }));
    }));

    app.get('/api/vyapar/history/:id', authenticateToken, requireCap('invoice.view'), handle(async (req, res, conn) => {
        const out = await svc.getHistory(conn, await defaultBusinessId(conn), req.params.id);
        if (!out) return res.status(404).json({ error: 'No such record' });
        res.json(out);
    }));

    console.log('[vyapar] routes mounted');
}

module.exports = { mountVyapar };
