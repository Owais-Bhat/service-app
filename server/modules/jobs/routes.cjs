'use strict';

// Stage 4 API: the cost side of a job, and the invoice that comes out of it.

const posting = require('../ledger/posting.cjs');
const stock = require('../stock/engine.cjs');
const sales = require('../sales/service.cjs');
const jobs = require('./service.cjs');
const { defaultBusinessId } = require('../ledger/schema.cjs');

const clean = (v, max = 255) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
const ymd = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    return Number.isNaN(date.getTime()) ? null
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

function mountJobs({ app, getConn, authenticateToken, permissions, audit }) {
    const { requireCap, can } = permissions;

    const handle = (fn) => async (req, res) => {
        let connection;
        try {
            connection = await getConn();
            await fn(req, res, connection);
        } catch (err) {
            const known = err instanceof jobs.JobError
                || err instanceof stock.StockError
                || err instanceof sales.SalesError
                || err instanceof posting.PostingError;
            if (connection) await connection.rollback().catch(() => {});
            if (known) return res.status(err.status || 422).json({ error: err.message, code: err.code });
            console.error('[jobs]', req.method, req.path, '—', err.message);
            if (!res.headersSent) res.status(500).json({ error: err.message });
        } finally {
            if (connection) connection.release();
        }
    };

    const business = async (conn) => {
        const id = await defaultBusinessId(conn);
        if (!id) throw new jobs.JobError('No business configured', 'no_business', 400);
        return id;
    };

    // ── what a job cost ─────────────────────────────────────────────────
    app.get('/api/jobs/:jobType/:jobId/summary', authenticateToken, requireCap('stock.view'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const job = await jobs.loadJob(conn, req.params.jobType, req.params.jobId);

        // Anyone who reports on operations can look at any job; everybody else
        // can look at the one they were sent to.
        if (!(await can(req.user, 'report.operations'))
            && String(job.assigned_employee_id || '') !== String(req.user.id)) {
            return res.status(403).json({ error: 'That job is not assigned to you' });
        }

        const summary = await jobs.jobSummary(conn, {
            businessId, jobType: req.params.jobType, jobId: req.params.jobId,
        });
        // Cost and margin are not a technician's business; the same endpoint
        // serves both, with the money taken out for those who may not see it.
        if (!(await can(req.user, 'item.cost.view'))) {
            delete summary.totals.material_cost_paise;
            delete summary.totals.other_cost_paise;
            delete summary.totals.total_cost_paise;
            delete summary.totals.margin_paise;
            delete summary.totals.margin_pct;
            delete summary.totals.estimated_cost_paise;
            summary.material_lines = summary.material_lines.map(({ cost_paise: _c, unit_cost_paise: _u, ...rest }) => rest);
            summary.costs = [];
        }
        res.json(summary);
    }));

    // ── materials ───────────────────────────────────────────────────────
    // A technician submits what he fitted. Whether that waits for approval is
    // the business's decision, not this route's.
    app.post('/api/jobs/materials', authenticateToken, requireCap('stock.move'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        await conn.beginTransaction();
        const out = await jobs.submitMaterials(conn, { businessId, user: req.user, payload: req.body || {} });
        await conn.commit();

        audit.record({
            actor: req.user, action: 'job.materials_submit', entityType: 'job_material_issue',
            entityId: out.issue.id, after: { status: out.issue.status, job: req.body?.job_id }, ip: req.ip,
        });
        res.status(201).json(out);
    }));

    app.get('/api/jobs/materials/pending', authenticateToken, requireCap('stock.adjust'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const [rows] = await conn.query(
            `SELECT i.*, p.full_name AS employee_name, l.name AS location_name,
                    (SELECT COUNT(*) FROM job_material_lines ml WHERE ml.issue_id = i.id) AS line_count
               FROM job_material_issues i
               LEFT JOIN profiles p ON p.id = i.employee_id
               LEFT JOIN stock_locations l ON l.id = i.location_id
              WHERE i.business_id = ? AND i.status = 'submitted'
              ORDER BY i.submitted_at`,
            [businessId]
        );

        // The job each submission belongs to, so an approver can see what they
        // are approving without opening five screens.
        for (const row of rows) {
            const table = row.job_type === 'installation' ? 'installations' : 'inquiries';
            const [[job]] = await conn.query(
                `SELECT ticket_no, full_name, phone FROM ${table} WHERE id = ? LIMIT 1`, [row.job_id]
            );
            row.job = job || null;
        }
        res.json(rows);
    }));

    app.get('/api/jobs/materials/:id', authenticateToken, requireCap('stock.view'), handle(async (req, res, conn) => {
        const loaded = await jobs.loadIssue(conn, req.params.id);
        if (!loaded) return res.status(404).json({ error: 'No such submission' });
        res.json(loaded);
    }));

    app.post('/api/jobs/materials/:id/approve', authenticateToken, requireCap('stock.adjust'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        await conn.beginTransaction();
        const out = await jobs.approveMaterials(conn, { businessId, user: req.user, id: req.params.id });
        await conn.commit();

        audit.record({
            actor: req.user, action: 'job.materials_approve', entityType: 'job_material_issue',
            entityId: req.params.id, after: { cost_paise: out.issue.cost_paise, journal_id: out.issue.journal_id }, ip: req.ip,
        });
        res.json(out);
    }));

    app.post('/api/jobs/materials/:id/reject', authenticateToken, requireCap('stock.adjust'), handle(async (req, res, conn) => {
        const reason = clean(req.body?.reason, 500);
        const out = await jobs.rejectMaterials(conn, { user: req.user, id: req.params.id, reason });
        audit.record({
            actor: req.user, action: 'job.materials_reject', entityType: 'job_material_issue',
            entityId: req.params.id, reason, ip: req.ip,
        });
        res.json(out);
    }));

    // ── other costs ─────────────────────────────────────────────────────
    app.post('/api/jobs/costs', authenticateToken, requireCap('invoice.create'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        await conn.beginTransaction();
        const saved = await jobs.addJobCost(conn, { businessId, user: req.user, payload: req.body || {} });
        await conn.commit();
        res.status(201).json(saved);
    }));

    app.delete('/api/jobs/costs/:id', authenticateToken, requireCap('ledger.reverse'), handle(async (req, res, conn) => {
        const reason = clean(req.body?.reason, 300);
        if (!reason) return res.status(400).json({ error: 'Removing a posted cost needs a reason' });
        const [[cost]] = await conn.query('SELECT * FROM job_costs WHERE id = ? LIMIT 1', [req.params.id]);
        if (!cost) return res.status(404).json({ error: 'No such cost' });

        await conn.beginTransaction();
        // A posted cost is reversed, not deleted — the same rule as everywhere else.
        if (cost.journal_id) {
            await posting.reverseJournal(conn, {
                journalId: cost.journal_id, date: new Date(), reason, postedBy: req.user.id,
            });
        }
        await conn.query('DELETE FROM job_costs WHERE id = ?', [req.params.id]);
        await conn.commit();

        audit.record({
            actor: req.user, action: 'job.cost_remove', entityType: 'job_cost', entityId: req.params.id,
            before: cost, reason, ip: req.ip,
        });
        res.json({ success: true });
    }));

    // ── the invoice ─────────────────────────────────────────────────────
    app.post('/api/jobs/:jobType/:jobId/invoice', authenticateToken, requireCap('invoice.create'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        await conn.beginTransaction();
        const out = await jobs.invoiceFromJob(conn, {
            businessId, user: req.user, jobType: req.params.jobType, jobId: req.params.jobId,
            payload: req.body || {},
        });
        await conn.commit();

        if (!out.reused) {
            audit.record({
                actor: req.user, action: 'job.invoice_draft', entityType: 'sales_document',
                entityId: out.document.id, after: { job: req.params.jobId, total_paise: out.document.total_paise }, ip: req.ip,
            });
        }
        res.status(out.reused ? 200 : 201).json(out);
    }));

    app.post('/api/jobs/:jobType/:jobId/estimate-from-quotation', authenticateToken, requireCap('invoice.create'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        await conn.beginTransaction();
        const out = await jobs.estimateFromQuotation(conn, {
            businessId, user: req.user, documentId: req.body?.document_id,
            jobType: req.params.jobType, jobId: req.params.jobId,
        });
        await conn.commit();
        res.status(201).json(out);
    }));

    // ── profitability across jobs ───────────────────────────────────────
    // The report the owner actually wants: which work made money, which did
    // not, and what has been done but never billed.
    app.get('/api/jobs/profitability', authenticateToken, requireCap('report.financial'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const from = ymd(req.query.from || new Date(Date.now() - 90 * 86400000));
        const to = ymd(req.query.to || new Date());

        const [rows] = await conn.query(
            `SELECT j.job_type, j.job_id,
                    COALESCE(inq.ticket_no, ins.ticket_no) AS ticket_no,
                    COALESCE(inq.full_name, ins.full_name) AS customer,
                    COALESCE(inq.status, ins.status) AS job_status,
                    COALESCE(inq.created_at, ins.created_at) AS job_date,
                    j.material_cost_paise, j.other_cost_paise,
                    COALESCE(rev.revenue_paise, 0) AS revenue_paise,
                    rev.doc_no, rev.invoice_status
               FROM (
                    SELECT job_type, job_id,
                           SUM(material_cost) AS material_cost_paise,
                           SUM(other_cost) AS other_cost_paise
                      FROM (
                           SELECT i.job_type, i.job_id,
                                  SUM(CASE WHEN i.kind = 'returned' THEN -ml.cost_paise ELSE ml.cost_paise END) AS material_cost,
                                  0 AS other_cost
                             FROM job_material_issues i
                             JOIN job_material_lines ml ON ml.issue_id = i.id
                            WHERE i.business_id = ? AND i.status = 'approved'
                            GROUP BY i.job_type, i.job_id
                           UNION ALL
                           SELECT c.job_type, c.job_id, 0, SUM(c.amount_paise)
                             FROM job_costs c
                            WHERE c.business_id = ? AND c.basis = 'actual'
                            GROUP BY c.job_type, c.job_id
                      ) parts
                     GROUP BY job_type, job_id
               ) j
               LEFT JOIN inquiries inq ON inq.id = j.job_id AND j.job_type = 'inquiry'
               LEFT JOIN installations ins ON ins.id = j.job_id AND j.job_type = 'installation'
               LEFT JOIN (
                    SELECT source_type, source_id, SUM(revenue_paise) AS revenue_paise,
                           MAX(doc_no) AS doc_no, MAX(invoice_status) AS invoice_status
                      FROM (
                           SELECT source_type, source_id,
                                  SUM(CASE WHEN doc_type = 'credit_note' THEN -taxable_paise ELSE taxable_paise END) AS revenue_paise,
                                  MAX(doc_no) AS doc_no, MAX(status) AS invoice_status
                             FROM sales_documents
                            WHERE business_id = ? AND status = 'issued' AND source_type IS NOT NULL
                            GROUP BY source_type, source_id
                           UNION ALL
                           -- billed on the ticket itself: its sales, less any discount, from the ledger
                           SELECT lk.source_type, lk.source_id, SUM(jl.credit_paise - jl.debit_paise), NULL, 'ticket'
                             FROM service_ledger_links lk
                             JOIN journals jr ON jr.source_id = lk.source_id AND jr.source_type = 'service'
                             JOIN journal_lines jl ON jl.journal_id = jr.id
                             JOIN accounts ac ON ac.id = jl.account_id AND ac.code IN ('4000', '4010', '4020', '4900')
                            WHERE lk.business_id = ?
                            GROUP BY lk.source_type, lk.source_id
                      ) revenue_sources
                     GROUP BY source_type, source_id
               ) rev ON rev.source_type = j.job_type AND rev.source_id = j.job_id
              HAVING job_date IS NULL OR (DATE(job_date) BETWEEN ? AND ?)
              ORDER BY job_date DESC`,
            [businessId, businessId, businessId, businessId, from, to]
        );

        const jobsOut = rows.map((r) => {
            const cost = Number(r.material_cost_paise || 0) + Number(r.other_cost_paise || 0);
            const revenue = Number(r.revenue_paise || 0);
            return {
                job_type: r.job_type, job_id: r.job_id, ticket_no: r.ticket_no, customer: r.customer,
                job_status: r.job_status, job_date: r.job_date, invoice_no: r.doc_no,
                material_cost_paise: Number(r.material_cost_paise || 0),
                other_cost_paise: Number(r.other_cost_paise || 0),
                total_cost_paise: cost,
                revenue_paise: revenue,
                margin_paise: revenue - cost,
                margin_pct: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : null,
                unbilled: revenue === 0,
            };
        });

        res.json({
            scope: {
                from, to,
                basis: 'Revenue is invoiced value before tax, less credit notes. Cost is approved materials at moving average plus actual labour, travel and subcontractor costs.',
            },
            jobs: jobsOut,
            totals: {
                revenue_paise: jobsOut.reduce((s, j) => s + j.revenue_paise, 0),
                cost_paise: jobsOut.reduce((s, j) => s + j.total_cost_paise, 0),
                margin_paise: jobsOut.reduce((s, j) => s + j.margin_paise, 0),
                unbilled_jobs: jobsOut.filter((j) => j.unbilled).length,
                unbilled_cost_paise: jobsOut.filter((j) => j.unbilled).reduce((s, j) => s + j.total_cost_paise, 0),
            },
        });
    }));

    // What technicians are still holding — the stock that has left the store but
    // not yet reached a job or come back.
    app.get('/api/jobs/technician-stock', authenticateToken, requireCap('stock.view'), handle(async (req, res, conn) => {
        const businessId = await business(conn);
        const [vans] = await conn.query(
            `SELECT l.*, p.full_name AS employee_name
               FROM stock_locations l LEFT JOIN profiles p ON p.id = l.employee_id
              WHERE l.business_id = ? AND l.kind = 'van' AND l.active = 1`,
            [businessId]
        );

        const out = [];
        for (const van of vans) {
            const items = await stock.locationStock(conn, van.id);
            out.push({
                location_id: van.id,
                location_name: van.name,
                employee_name: van.employee_name,
                items,
                value_paise: items.reduce((sum, i) => sum + Number(i.value_paise), 0),
            });
        }
        res.json({
            vans: out,
            total_value_paise: out.reduce((sum, v) => sum + v.value_paise, 0),
            scope: { basis: 'stock transferred to a van and not yet used on a job or returned' },
        });
    }));

    console.log('[jobs] Stage 4 routes mounted (materials, costs, job invoices, profitability)');
}

module.exports = { mountJobs };
