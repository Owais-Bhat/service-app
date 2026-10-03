'use strict';

// Backup of the business's data: download it, or have it emailed to the admin who asks.
// Admins only. One backup at a time, and not more than one a minute — reading every table is real work.

const backup = require('./service.cjs');
const mailer = require('../../mailer.cjs');

function mountBackup({ app, getConn, authenticateToken, audit, recordNotification }) {
    let running = false;
    let lastStart = 0;

    const guard = (req, res) => {
        if (req.user.role !== 'admin') { res.status(403).json({ error: 'Admins only' }); return false; }
        if (running) { res.status(409).json({ error: 'A backup is already being made — wait a minute and try again' }); return false; }
        if (Date.now() - lastStart < 60_000) { res.status(429).json({ error: 'A backup was just made — wait a minute before asking for another' }); return false; }
        return true;
    };

    app.get('/api/admin/backup/download', authenticateToken, async (req, res) => {
        if (!guard(req, res)) return;
        running = true; lastStart = Date.now();
        let conn;
        try {
            conn = await getConn();
            const built = await backup.buildBackup(conn);
            audit.record({ actor: req.user, action: 'backup.download', entityType: 'backup', entityId: null, after: { tables: built.tables.length, rows: built.total_rows, bytes: built.bytes }, ip: req.ip });
            res.set({
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${backup.fileName()}"`,
                'Content-Length': String(built.bytes),
                'Cache-Control': 'no-store',
            });
            res.end(built.buffer);
        } catch (err) {
            console.error('[backup] download failed —', err.message);
            if (!res.headersSent) res.status(500).json({ error: 'Could not make the backup' });
        } finally {
            if (conn) conn.release();
            running = false;
        }
    });

    // The mail goes only to the admin who asks (their own login address), never to an address supplied in the request.
    app.post('/api/admin/backup/email', authenticateToken, async (req, res) => {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
        if (!mailer.MAIL_ENABLED) return res.status(503).json({ error: 'Email is not set up on this server. Use Download instead.' });
        const to = String(req.user.email || '').includes('@') && !/@test\.local$/.test(req.user.email) ? req.user.email : mailer.NOTIFY_TO;
        if (!to) return res.status(400).json({ error: 'There is no email address on your account' });
        if (!guard(req, res)) return;

        running = true; lastStart = Date.now();
        res.status(202).json({ queued: true, to });

        // Done in the background: reading every table and sending the mail can take a minute.
        let conn;
        try {
            conn = await getConn();
            const out = await backup.emailBackup(conn, { to, send: mailer.sendMailTo });
            audit.record({ actor: req.user, action: 'backup.email', entityType: 'backup', entityId: null, after: { to, ...out }, ip: req.ip });
            recordNotification?.({
                subject: 'backup_emailed', title: '🗄️ Backup emailed',
                body: out.attached ? `The backup (${(out.bytes / 1048576).toFixed(1)} MB, ${out.tables} tables) was sent to ${to}.`
                    : `The backup was too large to email (${(out.bytes / 1048576).toFixed(1)} MB). Download it from Data Migration.`,
                audience: { userId: req.user.id }, data: {},
            })?.catch?.(() => {});
        } catch (err) {
            console.error('[backup] email failed —', err.message);
            recordNotification?.({
                subject: 'backup_failed', title: '⚠️ Backup could not be emailed', body: String(err.message).slice(0, 200),
                audience: { userId: req.user.id }, data: {},
            })?.catch?.(() => {});
        } finally {
            if (conn) conn.release();
            running = false;
        }
    });

    console.log('[backup] routes mounted');
}

module.exports = { mountBackup };
