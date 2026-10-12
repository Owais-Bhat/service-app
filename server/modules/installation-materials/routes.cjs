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
    }
    // The technician's record is what the office has to check: a pop-up and a spoken alert, until it is confirmed.
    if (out.submitted && recordNotification) {
      const who = job.employee_name || 'The technician';
      const customer = job.full_name || 'the customer';
      recordNotification({
        subject: 'installation_items_submitted',
        title: '🧰 Installation items submitted — please check',
        body: `${who} recorded the items for ${customer} (${job.ticket_no || ''}). Check it, then confirm to send the bill.`,
        audience: { role: 'admin' },
        data: {
          installation_id: job.id, ticket_no: job.ticket_no,
          voice: `${who} has submitted the installation items for ${customer}. Please check.`,
        },
      });
    }

    // The same answer as a GET, so the screen redraws from one place — and no money for those who may not see it.
    const fresh = await svc.state(conn, { businessId, job, moneyVisible: await moneyVisible(req) });
    res.json({
      ...fresh,
      saved: { moved: out.moved, charge_changed: out.charge_changed, submitted: out.submitted },
      // The office needs the reason; the technician needs to know only that the office must look.
      problem: out.invoice_error ? (await moneyVisible(req) ? out.invoice_error : 'The bill could not be made — the office has been told') : null,
    });
  }));

  // The office decides which kind of bill: GST, non-GST, or service (GST optional).
  app.put('/api/installations/:id/bill-type', authenticateToken, handle(async (req, res, conn) => {
    await ready;
    const businessId = await defaultBusinessId(conn);
    const { job, manager } = await authorise(req, conn);
    if (!manager) return res.status(403).json({ error: 'Only the office decides the kind of bill' });

    const out = await svc.setBillType(conn, {
      businessId, user: req.user, job, billType: req.body?.bill_type,
      showGst: !!req.body?.show_gst, serviceGst: req.body?.service_gst === undefined ? true : !!req.body.service_gst,
    });
    audit.record({
      actor: req.user, action: 'installation.bill_type', entityType: 'installation', entityId: job.id,
      after: { bill_type: job.bill_type, show_gst: job.show_gst, service_gst: job.service_gst, invoice: out.invoice_action }, ip: req.ip,
    });

    // The corrected bill is not sent from here; the office sends it when it is ready.
    const fresh = await svc.state(conn, { businessId, job, moneyVisible: true });
    res.json({ ...fresh, saved: { invoice_action: out.invoice_action } });
  }));

  // The office has checked the record: issue the bill and send it to the customer. Asked again for a bill already
  // issued, it sends it once more. (send-invoice is the same thing under its older name.)
  const confirm = handle(async (req, res, conn) => {
    await ready;
    const businessId = await defaultBusinessId(conn);
    const { job, manager } = await authorise(req, conn);
    if (!manager) return res.status(403).json({ error: 'Only the office can confirm and send the bill' });

    const out = await svc.confirmAndSend(conn, { businessId, user: req.user, job, baseUrl: baseUrl(req) });
    audit.record({
      actor: req.user, action: 'installation.invoice_send', entityType: 'sales_document', entityId: out.invoice_id,
      after: { sent: out.sent }, ip: req.ip,
    });
    const fresh = await svc.state(conn, { businessId, job, moneyVisible: true });
    res.json({ ...out, state: fresh });
  });
  app.post('/api/installations/:id/confirm', authenticateToken, confirm);
  app.post('/api/installations/:id/send-invoice', authenticateToken, confirm);

  console.log('[installation-materials] routes mounted');
}

module.exports = { mountInstallationMaterials };
