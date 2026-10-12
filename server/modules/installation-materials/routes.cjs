'use strict';

// An installer's items on an installation job, from his own van, and the customer's bill that follows them.

const svc = require('./service.cjs');
const jobs = require('../jobs/service.cjs');
const stock = require('../stock/engine.cjs');
const sales = require('../sales/service.cjs');
const posting = require('../ledger/posting.cjs');
const { defaultBusinessId } = require('../ledger/schema.cjs');

function mountInstallationMaterials({ app, getConn, authenticateToken, permissions, audit, recordNotification }) {
  const { can } = permissions;

  // The installation price column; handlers wait for it so the first request after a deploy never trips on it.
  const ready = (async () => {
    const conn = await getConn();
    try { await svc.ensureSchema(conn); } finally { conn.release(); }
  })().catch((err) => console.error('[installation-materials] schema —', err.message));

  const baseUrl = (req) => {
    if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
    return `${proto}://${req.get('host')}`;
  };

  const handle = (fn) => async (req, res) => {
    let conn;
    try {
      conn = await getConn();
      await fn(req, res, conn);
    } catch (err) {
      const known = err instanceof svc.MaterialsError || err instanceof jobs.JobError || err instanceof stock.StockError
        || err instanceof sales.SalesError || err instanceof posting.PostingError;
      if (known) return res.status(err.status || 422).json({ error: err.message, code: err.code });
      console.error('[installation-materials]', req.method, req.path, '—', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Something went wrong' });
    } finally {
      if (conn) { try { conn.release(); } catch { /* already released */ } }
    }
  };

  // The installation, and whether this person may work on it: the technician it was given to, or the office.
  async function authorise(req, conn) {
    const job = await jobs.loadJob(conn, 'installation', req.params.id);
    const [[withName]] = await conn.query('SELECT full_name FROM profiles WHERE id = ? LIMIT 1', [job.assigned_employee_id || '']);
    job.employee_name = withName?.full_name || null;
    const manager = req.user.role === 'admin' || (await can(req.user, 'invoice.create'));
    const owner = String(job.assigned_employee_id || '') === String(req.user.id);
    if (!manager && !owner) throw new svc.MaterialsError('This installation is not assigned to you', 'forbidden', 403);
    return { job, manager };
  }

  const moneyVisible = async (req) => req.user.role === 'admin' || (await can(req.user, 'invoice.view'));

  app.get('/api/installations/:id/materials', authenticateToken, handle(async (req, res, conn) => {
    await ready;
    const businessId = await defaultBusinessId(conn);
    const { job } = await authorise(req, conn);
    res.json(await svc.state(conn, { businessId, job, moneyVisible: await moneyVisible(req) }));
  }));

  app.put('/api/installations/:id/materials', authenticateToken, handle(async (req, res, conn) => {
    await ready;
    const businessId = await defaultBusinessId(conn);
    const { job, manager } = await authorise(req, conn);
    if (!Array.isArray(req.body?.lines)) return res.status(400).json({ error: 'lines must be a list' });

    const out = await svc.setMaterials(conn, {
      businessId, user: req.user, job, lines: req.body.lines, installationCharge: req.body.installation_charge,
      isManager: manager, baseUrl: baseUrl(req),
    });

    if (out.moved || out.charge_changed) {
      audit.record({
        actor: req.user, action: 'installation.materials_set', entityType: 'installation', entityId: job.id,
        after: { lines: req.body.lines.length, invoice: out.invoice_action }, ip: req.ip,
      });
      // The office should know what went on the job, whoever recorded it.
      if (recordNotification) {
        recordNotification({
          subject: 'installation_materials',
          title: '🧰 Items used on an installation',
          body: `${job.employee_name || 'Technician'} — ${job.full_name || 'Customer'} (${job.ticket_no || ''}): ${out.moved} item${out.moved === 1 ? '' : 's'} ${out.invoice_action === 'revised' ? 'changed' : 'recorded'}`,
          audience: { role: 'admin' },
          data: { installation_id: job.id },
        });
      }
    }

    // The same answer as a GET, so the screen redraws from one place — and no money for those who may not see it.
    const fresh = await svc.state(conn, { businessId, job, moneyVisible: await moneyVisible(req) });
    res.json({
      ...fresh,
      saved: { moved: out.moved, charge_changed: out.charge_changed, bill_sent: !!out.delivery?.sent },
      // The office needs the reason; the technician needs to know only that the office must look.
      problem: out.invoice_error ? (await moneyVisible(req) ? out.invoice_error : 'The bill could not be made — the office has been told') : null,
      bill_error: out.delivery && !out.delivery.sent && (await moneyVisible(req)) ? out.delivery.error : null,
    });
  }));

  // The office: make the bill if it does not exist yet, and send it (again) to the customer.
  app.post('/api/installations/:id/send-invoice', authenticateToken, handle(async (req, res, conn) => {
    await ready;
    const businessId = await defaultBusinessId(conn);
    const { job, manager } = await authorise(req, conn);
    if (!manager) return res.status(403).json({ error: 'Only the office can send the bill' });

    let invoice = await svc.findInvoice(conn, job.id);
    if (!invoice) {
      await conn.beginTransaction();
      try {
        await svc.syncInvoice(conn, { businessId, user: req.user, job });
        await conn.commit();
      } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
      }
      invoice = await svc.findInvoice(conn, job.id);
    }
    if (!invoice) return res.status(409).json({ error: 'There are no items on this installation to bill yet' });

    const delivery = await svc.sendInvoice(conn, { businessId, user: req.user, documentId: invoice.id, baseUrl: baseUrl(req), force: true });
    audit.record({
      actor: req.user, action: 'installation.invoice_send', entityType: 'sales_document', entityId: invoice.id,
      after: { sent: delivery.sent }, ip: req.ip,
    });
    res.json({ invoice_id: invoice.id, doc_no: invoice.doc_no, ...delivery });
  }));

  console.log('[installation-materials] routes mounted');
}

module.exports = { mountInstallationMaterials };
