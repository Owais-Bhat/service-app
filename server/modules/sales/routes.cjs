'use strict';

// Stage 2 API: estimates, invoices, credit notes, receipts and their PDFs.
//
// Every route that changes money runs inside a transaction and is guarded by a
// capability. Totals are always recomputed on the server from the lines — what
// a client sends as a total is ignored.

const money = require('../money.cjs');
const sales = require('./service.cjs');
const { defaultBusinessId } = require('../ledger/schema.cjs');
const posting = require('../ledger/posting.cjs');
const { renderDocumentPdf } = require('./pdf.cjs');

const clean = (v, max = 255) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
const ymd = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    return Number.isNaN(date.getTime()) ? null
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// The logo and signature the owner uploaded live in `uploaded_files`, and a
// document printed on the server needs their bytes. An empty field, or an
// image in a format a PDF cannot hold, prints without them and says so in the
// log rather than holding up the bill.
async function loadUploadedImage(conn, url) {
    const id = String(url || '').match(/^\/uploads\/([\w.-]+)$/)?.[1];
    if (!id) return null;
    try {
        const [[row]] = await conn.query('SELECT mime, data FROM uploaded_files WHERE id = ? LIMIT 1', [id]);
        if (!row?.data) return null;
        if (row.mime && !/^image\/(png|jpe?g)$/i.test(row.mime)) {
            console.warn(`[sales/pdf] ${row.mime} cannot be drawn into a PDF \u2014 upload a PNG or JPEG`);
            return null;
        }
        return row.data;
    } catch (err) {
        console.warn('[sales/pdf] could not read the uploaded image:', err.message);
        return null;
    }
}

function mountSales({ app, getConn, authenticateToken, permissions, audit }) {
    const { requireCap } = permissions;

    const handle = (fn) => async (req, res) => {
        let connection;
        try {
            connection = await getConn();
            await fn(req, res, connection);
        } catch (err) {
            if (err instanceof sales.SalesError || err instanceof posting.PostingError) {
                if (connection) await connection.rollback().catch(() => {});
                return res.status(err.status || 422).json({ error: err.message, code: err.code });
            }
            console.error('[sales]', req.method, req.path, '—', err.message);
            if (connection) await connection.rollback().catch(() => {});
            if (!res.headersSent) res.status(500).json({ error: err.message });
        } finally {
            if (connection) connection.release();
        }
    };

    const business = async (conn) => {
        const id = await defaultBusinessId(conn);
        if (!id) throw new sales.SalesError('No business configured', 'no_business', 400);
        return id;
    };

    // ── documents ───────────────────────────────────────────────────────
    app.get('/api/sales/documents', authenticateToken, requireCap('invoice.view'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const { doc_type: docType, status, party_id: partyId, from, to, q, limit = '200' } = req.query;

        const where = ['d.business_id = ?'];
        const params = [businessId];
        if (docType && docType !== 'all') { where.push('d.doc_type = ?'); params.push(docType); }
        if (status && status !== 'all') { where.push('d.status = ?'); params.push(status); }
        if (partyId) { where.push('d.party_id = ?'); params.push(partyId); }
        if (from) { where.push('d.doc_date >= ?'); params.push(ymd(from)); }
        if (to) { where.push('d.doc_date <= ?'); params.push(ymd(to)); }
        if (q) {
            where.push('(d.doc_no LIKE ? OR p.display_name LIKE ? OR p.phone LIKE ? OR d.reference LIKE ?)');
            const like = `%${q}%`;
            params.push(like, like, like, like);
        }

        // Paid comes from the allocations, so a list can never show a status the
        // ledger disagrees with.
        const [rows] = await conn.query(
            `SELECT d.*, p.display_name AS party_name, p.phone AS party_phone,
                    COALESCE(alloc.paid_paise, 0) AS paid_paise
               FROM sales_documents d
               LEFT JOIN parties p ON p.id = d.party_id
               LEFT JOIN (
                    SELECT a.document_id, SUM(a.amount_paise) AS paid_paise
                      FROM payment_allocations a
                      JOIN payments pay ON pay.id = a.payment_id AND pay.status = 'posted'
                     GROUP BY a.document_id
               ) alloc ON alloc.document_id = d.id
              WHERE ${where.join(' AND ')}
              ORDER BY d.doc_date DESC, d.created_at DESC
              LIMIT ?`,
            [...params, Math.min(Number(limit) || 200, 1000)]
        );

        res.json(rows.map((r) => ({
            ...r,
            balance_paise: Number(r.total_paise) - Number(r.paid_paise),
            payment_status: sales.paymentStatusOf(r, Number(r.paid_paise)),
        })));
    }));

    app.get('/api/sales/documents/:id', authenticateToken, requireCap('invoice.view'), handle(async (req, res, conn) => {
        const loaded = await sales.loadDocument(conn, req.params.id);
        if (!loaded) return res.status(404).json({ error: 'No such document' });
        res.json(loaded);
    }));

    // A draft can be priced without being saved — what the editor shows as it
    // is typed is the same arithmetic the invoice will carry.
    app.post('/api/sales/preview', authenticateToken, requireCap('invoice.view'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const { priced } = await sales.priceDocument(conn, businessId, req.body || {});
        res.json(priced);
    }));

    app.post('/api/sales/documents', authenticateToken, requireCap('invoice.create'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        await conn.beginTransaction();
        const id = await sales.saveDraft(conn, { businessId, user: req.user, payload: req.body || {} });
        await conn.commit();

        const loaded = await sales.loadDocument(conn, id);
        audit.record({
            actor: req.user, action: 'document.draft', entityType: 'sales_document', entityId: id,
            after: { doc_type: loaded.document.doc_type, total_paise: loaded.document.total_paise }, ip: req.ip,
        });
        res.status(201).json(loaded);
    }));

    app.patch('/api/sales/documents/:id', authenticateToken, requireCap('invoice.create'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        await conn.beginTransaction();
        await sales.saveDraft(conn, { businessId, user: req.user, payload: req.body || {}, existingId: req.params.id });
        await conn.commit();
        res.json(await sales.loadDocument(conn, req.params.id));
    }));

    // Only a draft can be deleted, and only because it never existed as far as
    // the books are concerned.
    app.delete('/api/sales/documents/:id', authenticateToken, requireCap('invoice.create'), handle(async (req, res, conn) => {
        const loaded = await sales.loadDocument(conn, req.params.id);
        if (!loaded) return res.status(404).json({ error: 'No such document' });
        if (loaded.document.status !== 'draft') {
            return res.status(422).json({ error: 'An issued document is cancelled, not deleted', code: 'not_draft' });
        }
        await conn.query('DELETE FROM sales_documents WHERE id = ?', [req.params.id]);
        audit.record({
            actor: req.user, action: 'document.delete_draft', entityType: 'sales_document',
            entityId: req.params.id, before: loaded.document, ip: req.ip,
        });
        res.json({ success: true });
    }));

    app.post('/api/sales/documents/:id/issue', authenticateToken, requireCap('invoice.create'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        await conn.beginTransaction();
        const issued = await sales.issueDocument(conn, { businessId, user: req.user, id: req.params.id });
        await conn.commit();

        audit.record({
            actor: req.user, action: 'document.issue', entityType: 'sales_document', entityId: req.params.id,
            after: { doc_no: issued.document.doc_no, total_paise: issued.document.total_paise, journal_id: issued.document.journal_id },
            ip: req.ip,
        });
        res.json(issued);
    }));

    // A quotation can be corrected after it has gone out; nothing else that has
    // been issued can.
    app.post('/api/sales/documents/:id/revise', authenticateToken, requireCap('invoice.create'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        await conn.beginTransaction();
        const out = await sales.reviseEstimate(conn, { businessId, user: req.user, id: req.params.id, payload: req.body || {} });
        await conn.commit();

        audit.record({
            actor: req.user, action: 'document.revise', entityType: 'sales_document', entityId: req.params.id,
            before: { revision_no: out.before.revision_no, status: out.before.status, total_paise: out.before.total_paise },
            after: { revision_no: out.after.revision_no, status: out.after.status, total_paise: out.after.total_paise },
            ip: req.ip,
        });
        res.json(await sales.loadDocument(conn, req.params.id));
    }));

    app.post('/api/sales/documents/:id/cancel', authenticateToken, requireCap('invoice.cancel'), handle(async (req, res, conn) => {
        const reason = clean(req.body?.reason, 500);
        await conn.beginTransaction();
        const cancelled = await sales.cancelDocument(conn, { user: req.user, id: req.params.id, reason });
        await conn.commit();

        audit.record({
            actor: req.user, action: 'document.cancel', entityType: 'sales_document', entityId: req.params.id,
            reason, after: { status: 'cancelled' }, ip: req.ip,
        });
        res.json(cancelled);
    }));

    app.post('/api/sales/documents/:id/convert', authenticateToken, requireCap('invoice.create'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        await conn.beginTransaction();
        const out = await sales.convertDocument(conn, {
            businessId, user: req.user, id: req.params.id, toType: req.body?.to || 'invoice',
        });
        await conn.commit();

        if (!out.reused) {
            audit.record({
                actor: req.user, action: 'document.convert', entityType: 'sales_document', entityId: req.params.id,
                after: { to: out.document.id, doc_type: out.document.doc_type }, ip: req.ip,
            });
        }
        res.status(out.reused ? 200 : 201).json(out);
    }));

    // How the customer agreed — recorded, because "they said yes on the phone"
    // stops being evidence the moment there is a dispute.
    app.post('/api/sales/documents/:id/acceptance', authenticateToken, requireCap('invoice.create'), handle(async (req, res, conn) => {
        const { status = 'accepted', method, note } = req.body || {};
        if (!['accepted', 'rejected', 'expired'].includes(status)) {
            return res.status(400).json({ error: 'Unknown acceptance status' });
        }
        const loaded = await sales.loadDocument(conn, req.params.id);
        if (!loaded) return res.status(404).json({ error: 'No such document' });
        if (loaded.document.doc_type !== 'estimate') {
            return res.status(422).json({ error: 'Only an estimate is accepted or rejected' });
        }

        await conn.query(
            `UPDATE sales_documents SET status = ?, accepted_at = ?, acceptance_method = ?, acceptance_note = ? WHERE id = ?`,
            [status, status === 'accepted' ? new Date() : null, clean(method, 40), clean(note, 500), req.params.id]
        );
        audit.record({
            actor: req.user, action: `estimate.${status}`, entityType: 'sales_document', entityId: req.params.id,
            after: { method, note }, ip: req.ip,
        });
        res.json(await sales.loadDocument(conn, req.params.id));
    }));

    // The printed document, by whichever door it is asked for.
    const sendPdf = async (res, conn, id) => {
        const businessId = await business(conn);
        const loaded = await sales.loadDocument(conn, id);
        if (!loaded) return res.status(404).json({ error: 'No such document' });
        const [[biz]] = await conn.query('SELECT * FROM businesses WHERE id = ? LIMIT 1', [businessId]);

        // Uploaded images are stored in the database, so the renderer is
        // handed the bytes rather than a path it could not open.
        const [logo, signature] = await Promise.all([
            loadUploadedImage(conn, biz.logo_url),
            loadUploadedImage(conn, biz.signature_url),
        ]);

        const pdf = await renderDocumentPdf({ business: biz, ...loaded, logo, signature });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `inline; filename="${(loaded.document.doc_no || loaded.document.doc_type).replace(/[^\w.-]/g, '_')}.pdf"`
        );
        res.send(pdf);
    };

    app.get('/api/sales/documents/:id/pdf', authenticateToken, requireCap('invoice.view'), handle(async (req, res, conn) => {
        await sendPdf(res, conn, req.params.id);
    }));

    // The same PDF for someone with a link and no login — a customer opening
    // what was sent to their WhatsApp. The token is the only key; it expires,
    // and a cancelled document stops opening.
    app.get('/api/public/documents/:token/pdf', handle(async (req, res, conn) => {
        const documentId = await sales.resolveShareLink(conn, req.params.token);
        if (!documentId) return res.status(404).type('text/plain').send('This link has expired or is not valid.');
        await sendPdf(res, conn, documentId);
    }));

    // ── payments ────────────────────────────────────────────────────────
    app.get('/api/payments', authenticateToken, requireCap('payment.view'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const { party_id: partyId, from, to, direction, limit = '200' } = req.query;
        const where = ['p.business_id = ?'];
        const params = [businessId];
        if (partyId) { where.push('p.party_id = ?'); params.push(partyId); }
        if (direction) { where.push('p.direction = ?'); params.push(direction); }
        if (from) { where.push('p.payment_date >= ?'); params.push(ymd(from)); }
        if (to) { where.push('p.payment_date <= ?'); params.push(ymd(to)); }

        const [rows] = await conn.query(
            `SELECT p.*, pt.display_name AS party_name, a.name AS account_name,
                    COALESCE(al.allocated_paise, 0) AS allocated_paise
               FROM payments p
               LEFT JOIN parties pt ON pt.id = p.party_id
               LEFT JOIN accounts a ON a.id = p.account_id
               LEFT JOIN (SELECT payment_id, SUM(amount_paise) allocated_paise FROM payment_allocations GROUP BY payment_id) al
                      ON al.payment_id = p.id
              WHERE ${where.join(' AND ')}
              ORDER BY p.payment_date DESC, p.created_at DESC
              LIMIT ?`,
            [...params, Math.min(Number(limit) || 200, 1000)]
        );
        res.json(rows.map((r) => ({ ...r, unallocated_paise: Number(r.amount_paise) - Number(r.allocated_paise) })));
    }));

    app.get('/api/payments/:id', authenticateToken, requireCap('payment.view'), handle(async (req, res, conn) => {
        const loaded = await sales.loadPayment(conn, req.params.id);
        if (!loaded) return res.status(404).json({ error: 'No such payment' });
        res.json(loaded);
    }));

    app.post('/api/payments', authenticateToken, requireCap('payment.record'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        await conn.beginTransaction();
        const payment = await sales.recordPayment(conn, { businessId, user: req.user, payload: req.body || {} });
        await conn.commit();

        audit.record({
            actor: req.user, action: 'payment.record', entityType: 'payment', entityId: payment.payment.id,
            after: { amount_paise: payment.payment.amount_paise, method: payment.payment.method }, ip: req.ip,
        });
        res.status(201).json(payment);
    }));

    app.post('/api/payments/:id/allocate', authenticateToken, requireCap('payment.record'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        await conn.beginTransaction();
        const payment = await sales.allocatePayment(conn, {
            businessId, user: req.user, paymentId: req.params.id, allocations: req.body?.allocations || [],
        });
        await conn.commit();
        res.json(payment);
    }));

    // ── what is owed ────────────────────────────────────────────────────
    // Ageing straight from issued documents and their allocations, with the
    // buckets every collections conversation actually uses.
    app.get('/api/sales/receivables', authenticateToken, requireCap('payment.view'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const asOn = ymd(req.query.as_on || new Date());

        const [rows] = await conn.query(
            `SELECT * FROM (
                SELECT d.id, d.doc_no, d.doc_date, d.due_date, d.total_paise, d.party_id,
                       p.display_name AS party_name, p.phone AS party_phone,
                       COALESCE(alloc.paid_paise, 0) AS paid_paise,
                       d.total_paise - COALESCE(alloc.paid_paise, 0) AS outstanding_paise,
                       DATEDIFF(?, COALESCE(d.due_date, d.doc_date)) AS days_overdue
                  FROM sales_documents d
                  LEFT JOIN parties p ON p.id = d.party_id
                  LEFT JOIN (
                       SELECT a.document_id, SUM(a.amount_paise) paid_paise
                         FROM payment_allocations a
                         JOIN payments pay ON pay.id = a.payment_id AND pay.status = 'posted'
                        GROUP BY a.document_id
                  ) alloc ON alloc.document_id = d.id
                 WHERE d.business_id = ? AND d.doc_type = 'invoice' AND d.status = 'issued'
                   AND d.doc_date <= ?
            ) open_invoices
             WHERE outstanding_paise > 0
             ORDER BY days_overdue DESC`,
            [asOn, businessId, asOn]
        );

        const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
        const open = rows.map((r) => {
            const outstanding = Number(r.outstanding_paise);
            const days = Number(r.days_overdue) || 0;
            const bucket = days <= 0 ? 'current' : days <= 30 ? 'd1_30' : days <= 60 ? 'd31_60' : days <= 90 ? 'd61_90' : 'd90_plus';
            buckets[bucket] += outstanding;
            return { ...r, outstanding_paise: outstanding, days_overdue: days, bucket };
        });

        res.json({
            as_on: asOn,
            scope: { basis: 'issued invoices less posted payment allocations', as_on: asOn },
            total_paise: open.reduce((s, r) => s + r.outstanding_paise, 0),
            buckets,
            invoices: open,
        });
    }));

    console.log('[sales] Stage 2 routes mounted (documents, payments, receivables, PDF)');
    void money;
}

module.exports = { mountSales };
