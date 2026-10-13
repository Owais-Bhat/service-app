'use strict';

// One customer's (or supplier's) whole record on paper: who they are, what they bought and when, what they paid,
// the jobs done for them, and the statement of account — everything in one PDF for a chosen period.

const fs = require('fs');
const path = require('path');
const { formatINR } = require('../money.cjs');
const service = require('./service.cjs');

let PDFDocument = null;
try { PDFDocument = require('pdfkit'); } catch { console.warn('[reports/party-record] pdfkit not installed — PDFs disabled'); }

const FONT_REG = path.join(__dirname, '..', '..', 'fonts', 'NotoSans-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '..', '..', 'fonts', 'NotoSans-Bold.ttf');
const HAS_UNICODE = fs.existsSync(FONT_REG) && fs.existsSync(FONT_BOLD);

const INK = '#111827';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';
const BRAND = '#15a05a';
const SOFT = '#f3f4f6';

const rupees = (paise) => formatINR(Number(paise) || 0, { symbol: HAS_UNICODE }).replace('₹', HAS_UNICODE ? '₹' : 'Rs. ');
const num = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const ymd = (v) => service.ymd(v);
// "from the beginning" is asked for as 2000-01-01; it is printed as what it means.
const isBeginning = (d) => d === '2000-01-01';
const periodText = (p) => `${isBeginning(p.from) ? 'From the beginning' : dayLabel(p.from)} to ${dayLabel(p.to)}`;
const dayLabel = (v) => {
  const d = ymd(v);
  if (!d) return '—';
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const SQL_DIGITS = (col) => `RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${col}, '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), 10)`;
const DOC_LABEL = { invoice: 'Invoice', credit_note: 'Credit note', supplier_bill: 'Supplier bill', purchase_return: 'Purchase return', goods_receipt: 'Goods receipt' };
const LEGACY_LABEL = {
  sale: 'Sale', estimate: 'Estimate', purchase: 'Purchase', payment_in: 'Payment in', payment_out: 'Payment out',
  sale_return: 'Sale return', purchase_return: 'Purchase return', expense: 'Expense', delivery_challan: 'Challan', other: 'Other',
};

// ── what to print ───────────────────────────────────────────────────────
async function collect(conn, businessId, partyId, { from, to }) {
  const [[party]] = await conn.query('SELECT * FROM parties WHERE id = ? AND business_id = ? LIMIT 1', [partyId, businessId]);
  if (!party) return null;
  const [addresses] = await conn.query('SELECT * FROM party_addresses WHERE party_id = ? ORDER BY is_default DESC, kind', [partyId]);

  // Sales documents and what was on them.
  const [sales] = await conn.query(
    `SELECT id, doc_type, doc_no, doc_date, status, bill_type, total_paise, reference
       FROM sales_documents
      WHERE business_id = ? AND party_id = ? AND status = 'issued' AND doc_type IN ('invoice', 'credit_note')
        AND doc_date BETWEEN ? AND ? ORDER BY doc_date, doc_no`,
    [businessId, partyId, from, to]
  );
  const saleIds = sales.map((d) => d.id);
  const saleLines = saleIds.length ? (await conn.query(
    `SELECT document_id, description, quantity, unit, rate_paise, amount_paise
       FROM sales_document_lines WHERE document_id IN (?) AND kind = 'item' ORDER BY document_id, line_no`, [saleIds]
  ))[0] : [];
  const paidBy = new Map();
  if (saleIds.length) {
    const [alloc] = await conn.query(
      `SELECT pa.document_id, SUM(pa.amount_paise) AS paid
         FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id AND p.status = 'posted'
        WHERE pa.document_id IN (?) GROUP BY pa.document_id`, [saleIds]
    );
    alloc.forEach((a) => paidBy.set(a.document_id, Number(a.paid)));
  }

  // Purchases from this party (when it is a supplier).
  const [purchases] = await conn.query(
    `SELECT id, doc_type, doc_no, doc_date, status, total_paise, supplier_ref
       FROM purchase_documents
      WHERE business_id = ? AND party_id = ? AND doc_type IN ('supplier_bill', 'purchase_return')
        AND status NOT IN ('draft', 'cancelled') AND doc_date BETWEEN ? AND ? ORDER BY doc_date, doc_no`,
    [businessId, partyId, from, to]
  );
  const purchaseIds = purchases.map((d) => d.id);
  const purchaseLines = purchaseIds.length ? (await conn.query(
    `SELECT document_id, description, quantity, unit, rate_paise, amount_paise
       FROM purchase_document_lines WHERE document_id IN (?) AND kind = 'item' ORDER BY document_id, line_no`, [purchaseIds]
  ))[0] : [];

  const [payments] = await conn.query(
    `SELECT payment_no, payment_date, direction, method, amount_paise, reference
       FROM payments WHERE business_id = ? AND party_id = ? AND status = 'posted' AND payment_date BETWEEN ? AND ?
      ORDER BY payment_date, payment_no`,
    [businessId, partyId, from, to]
  );

  // Service and installation jobs: matched on the phone number, as tickets carry no party.
  const keys = [...new Set([last10(party.phone), last10(party.alt_phone)].filter((k) => k.length === 10))];
  const nextDay = (() => { const [y, m, d] = to.split('-').map(Number); const dt = new Date(y, m - 1, d + 1); return ymd(dt); })();
  let services = [];
  let installs = [];
  if (keys.length) {
    [services] = await conn.query(
      `SELECT ticket_no, created_at, service_item, status, COALESCE(NULLIF(bill_total, 0), bill_amount, 0) AS amount, payment_status
         FROM inquiries WHERE ${SQL_DIGITS('phone')} IN (?) AND created_at >= ? AND created_at < ? ORDER BY created_at`,
      [keys, from, nextDay]
    );
  }
  [installs] = await conn.query(
    `SELECT ticket_no, created_at, installation_type, status, bill_total AS amount, payment_status
       FROM installations
      WHERE (party_id = ?${keys.length ? ` OR ${SQL_DIGITS('phone')} IN (?)` : ''}) AND created_at >= ? AND created_at < ? ORDER BY created_at`,
    keys.length ? [partyId, keys, from, nextDay] : [partyId, from, nextDay]
  );

  // Records brought in from the old program.
  const [legacy] = await conn.query(
    `SELECT doc_date, doc_type, doc_no, total_paise, paid_paise FROM legacy_documents
      WHERE business_id = ? AND party_id = ? AND doc_date BETWEEN ? AND ? ORDER BY doc_date LIMIT 3000`,
    [businessId, partyId, from, to]
  ).catch(() => [[]]);

  const statement = await service.partyStatement(conn, businessId, { partyId, from, to });

  // ── numbers ──
  const linesOf = (lines, id) => lines.filter((l) => l.document_id === id);
  const invoices = sales.filter((d) => d.doc_type === 'invoice');
  const credits = sales.filter((d) => d.doc_type === 'credit_note');
  const soldTotal = invoices.reduce((s, d) => s + Number(d.total_paise), 0) - credits.reduce((s, d) => s + Number(d.total_paise), 0);
  const received = payments.filter((p) => p.direction === 'in').reduce((s, p) => s + Number(p.amount_paise), 0);
  const paidOut = payments.filter((p) => p.direction === 'out').reduce((s, p) => s + Number(p.amount_paise), 0);
  const boughtTotal = purchases.filter((d) => d.doc_type === 'supplier_bill').reduce((s, d) => s + Number(d.total_paise), 0)
    - purchases.filter((d) => d.doc_type === 'purchase_return').reduce((s, d) => s + Number(d.total_paise), 0);

  const tally = (docs, lines) => {
    const map = new Map();
    docs.forEach((d) => {
      const sign = d.doc_type === 'credit_note' || d.doc_type === 'purchase_return' ? -1 : 1;
      linesOf(lines, d.id).forEach((l) => {
        const k = String(l.description).trim();
        const cur = map.get(k) || { description: k, unit: l.unit, quantity: 0, amount_paise: 0, times: 0 };
        cur.quantity += sign * Number(l.quantity);
        cur.amount_paise += sign * Number(l.amount_paise);
        cur.times += 1;
        map.set(k, cur);
      });
    });
    return [...map.values()].sort((a, b) => b.amount_paise - a.amount_paise);
  };

  const dates = [
    ...sales.map((d) => ymd(d.doc_date)), ...purchases.map((d) => ymd(d.doc_date)), ...payments.map((p) => ymd(p.payment_date)),
    ...services.map((s) => ymd(s.created_at)), ...installs.map((s) => ymd(s.created_at)),
  ].filter(Boolean).sort();

  return {
    party, addresses, period: { from, to },
    summary: {
      invoices: invoices.length, sold_paise: soldTotal, received_paise: received,
      purchases: purchases.length, bought_paise: boughtTotal, paid_out_paise: paidOut,
      services: services.length, installations: installs.length,
      outstanding_paise: statement ? statement.closing_paise : 0,
      first: dates[0] || null, last: dates[dates.length - 1] || null,
    },
    sales: sales.map((d) => ({ ...d, paid_paise: paidBy.get(d.id) || 0, lines: linesOf(saleLines, d.id) })),
    purchases: purchases.map((d) => ({ ...d, lines: linesOf(purchaseLines, d.id) })),
    sold_items: tally(sales, saleLines),
    bought_items: tally(purchases, purchaseLines),
    payments, services, installations: installs, legacy, statement,
  };
}

// ── drawing it ──────────────────────────────────────────────────────────
function renderPdf(record, business) {
  if (!PDFDocument) throw new Error('PDF generation is not available on this server');

  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true });
    const chunks = [];
    pdf.on('data', (c) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    const reg = HAS_UNICODE ? FONT_REG : 'Helvetica';
    const bold = HAS_UNICODE ? FONT_BOLD : 'Helvetica-Bold';
    const M = 36;
    const W = pdf.page.width - M * 2;
    const BOTTOM = pdf.page.height - 48;
    const p = record.party;
    const S = record.summary;

    const ensure = (h) => { if (pdf.y + h > BOTTOM) pdf.addPage(); };

    // letterhead
    pdf.font(bold).fontSize(15).fillColor(INK).text(business.legal_name || 'Networking Experts', M, M, { width: W });
    const head = [
      [business.address_line1, business.address_line2].filter(Boolean).join(', '),
      [business.city, business.pincode].filter(Boolean).join(' ') + (business.state_name ? `, ${business.state_name}` : ''),
      [business.phone && `Phone: ${business.phone}`, business.gstin && `GSTIN: ${business.gstin}`].filter(Boolean).join('   '),
    ].filter((l) => l && l.replace(/[,\s]/g, ''));
    pdf.font(reg).fontSize(8.5).fillColor(MUTED).text(head.join('\n'), M, pdf.y + 2, { width: W });
    pdf.moveTo(M, pdf.y + 6).lineTo(M + W, pdf.y + 6).strokeColor(INK).lineWidth(0.8).stroke();
    pdf.y += 14;

    const kindWord = p.kind === 'supplier' ? 'Supplier' : p.kind === 'both' ? 'Customer & Supplier' : 'Customer';
    pdf.font(bold).fontSize(14).fillColor(BRAND).text(`${kindWord} record`, M, pdf.y, { width: W, align: 'center' });
    pdf.font(reg).fontSize(9).fillColor(MUTED)
      .text(`${periodText(record.period)}   ·   printed ${dayLabel(new Date())}`, M, pdf.y + 2, { width: W, align: 'center' });
    pdf.y += 10;

    // who they are
    const addr = record.addresses.find((a) => a.is_default) || record.addresses[0];
    pdf.font(bold).fontSize(12).fillColor(INK).text(p.legal_name || p.display_name, M, pdf.y, { width: W });
    const who = [
      p.legal_name && p.legal_name !== p.display_name ? `Known as: ${p.display_name}` : null,
      [p.phone, p.alt_phone].filter(Boolean).join(' / ') && `Phone: ${[p.phone, p.alt_phone].filter(Boolean).join(' / ')}`,
      p.email && `Email: ${p.email}`,
      p.gstin && `GSTIN: ${p.gstin}`,
      addr && [addr.line1, addr.line2, addr.city, addr.state_name, addr.pincode].filter(Boolean).join(', '),
      Number(p.credit_days) ? `Credit terms: ${p.credit_days} days` : null,
    ].filter(Boolean);
    pdf.font(reg).fontSize(9).fillColor(INK).text(who.join('\n'), M, pdf.y + 2, { width: W, lineGap: 1.5 });
    pdf.y += 8;

    // the summary, in boxes
    const tiles = [];
    if (S.invoices || S.sold_paise) tiles.push([`Sales (${S.invoices} invoice${S.invoices === 1 ? '' : 's'})`, rupees(S.sold_paise)]);
    if (S.received_paise) tiles.push(['Received', rupees(S.received_paise)]);
    if (S.purchases) tiles.push([`Purchases (${S.purchases})`, rupees(S.bought_paise)]);
    if (S.paid_out_paise) tiles.push(['Paid to them', rupees(S.paid_out_paise)]);
    if (S.services || S.installations) tiles.push(['Service / installation jobs', String(S.services + S.installations)]);
    tiles.push([S.outstanding_paise >= 0 ? 'They owe us' : 'We owe them', rupees(Math.abs(S.outstanding_paise))]);
    const tw = Math.floor((W - (tiles.length - 1) * 6) / tiles.length);
    const ty = pdf.y;
    tiles.forEach(([label, value], i) => {
      const x = M + i * (tw + 6);
      pdf.roundedRect(x, ty, tw, 40, 4).fillColor(SOFT).fill();
      pdf.font(reg).fontSize(7.5).fillColor(MUTED).text(label, x + 6, ty + 6, { width: tw - 12 });
      pdf.font(bold).fontSize(10.5).fillColor(INK).text(value, x + 6, ty + 21, { width: tw - 12 });
    });
    pdf.y = ty + 50;
    if (S.first) {
      pdf.font(reg).fontSize(8.5).fillColor(MUTED).text(`First activity ${dayLabel(S.first)} · latest ${dayLabel(S.last)}`, M, pdf.y, { width: W });
      pdf.y += 6;
    }

    // a titled table; widths are shares of the page that add up to 100
    const section = (title, cols, rows, { total = null } = {}) => {
      ensure(60);
      pdf.font(bold).fontSize(10.5).fillColor(BRAND).text(title, M, pdf.y + 8, { width: W });
      pdf.y += 4;
      let used = 0;
      const cs = cols.map((c, i) => {
        const w = i === cols.length - 1 ? W - used : Math.floor((W * c.pct) / 100);
        const x = M + used;
        used += w;
        return { ...c, w, x };
      });
      const header = () => {
        const y = pdf.y;
        pdf.rect(M, y, W, 15).fillColor(SOFT).fill();
        cs.forEach((c) => pdf.font(bold).fontSize(7.5).fillColor(INK).text(c.label, c.x + 3, y + 4, { width: c.w - 6, align: c.align || 'left' }));
        pdf.y = y + 17;
      };
      header();
      if (!rows.length) {
        pdf.font(reg).fontSize(8.5).fillColor(MUTED).text('Nothing in this period.', M + 3, pdf.y + 2);
        pdf.y += 16;
        return;
      }
      rows.forEach((r) => {
        const cells = cs.map((c) => String(r[c.key] ?? ''));
        pdf.font(reg).fontSize(8);
        const h = Math.max(...cells.map((t, i) => pdf.heightOfString(t, { width: cs[i].w - 6 }))) + 6;
        if (pdf.y + h > BOTTOM) { pdf.addPage(); header(); }
        const y = pdf.y;
        cells.forEach((t, i) => pdf.font(r._bold ? bold : reg).fontSize(8).fillColor(INK).text(t, cs[i].x + 3, y + 3, { width: cs[i].w - 6, align: cs[i].align || 'left' }));
        pdf.moveTo(M, y + h).lineTo(M + W, y + h).strokeColor(LINE).lineWidth(0.5).stroke();
        pdf.y = y + h;
      });
      if (total) {
        ensure(18);
        pdf.font(bold).fontSize(8.5).fillColor(INK).text(total, M, pdf.y + 4, { width: W, align: 'right' });
        pdf.y += 18;
      }
    };

    const R = 'right';

    // what they bought, bill by bill
    const soldRows = [];
    record.sales.forEach((d) => {
      const sign = d.doc_type === 'credit_note' ? -1 : 1;
      soldRows.push({
        date: dayLabel(d.doc_date), doc: `${DOC_LABEL[d.doc_type] || d.doc_type} ${d.doc_no || ''}`.trim(),
        item: d.lines.length ? '' : (d.reference || ''), qty: '', rate: '', amount: rupees(sign * Number(d.total_paise)), _bold: true,
      });
      d.lines.forEach((l) => soldRows.push({
        date: '', doc: '', item: l.description, qty: `${num(l.quantity)} ${l.unit || ''}`.trim(),
        rate: rupees(l.rate_paise), amount: rupees(sign * Number(l.amount_paise)),
      }));
    });
    if (record.sales.length || p.kind !== 'supplier') {
      section('What was sold to them — bill by bill', [
        { key: 'date', label: 'Date', pct: 12 }, { key: 'doc', label: 'Document', pct: 23 }, { key: 'item', label: 'Item', pct: 27 },
        { key: 'qty', label: 'Qty', pct: 11, align: R }, { key: 'rate', label: 'Rate', pct: 12, align: R }, { key: 'amount', label: 'Amount', pct: 15, align: R },
      ], soldRows, { total: record.sales.length ? `Sales total ${rupees(S.sold_paise)}` : null });
    }

    if (record.sold_items.length) {
      section('Items sold — totals', [
        { key: 'description', label: 'Item', pct: 50 }, { key: 'times', label: 'Times', pct: 10, align: R },
        { key: 'qty', label: 'Quantity', pct: 18, align: R }, { key: 'amount', label: 'Amount', pct: 22, align: R },
      ], record.sold_items.map((i) => ({
        description: i.description, times: i.times, qty: `${num(i.quantity)} ${i.unit || ''}`.trim(), amount: rupees(i.amount_paise),
      })));
    }

    // supplier side
    if (record.purchases.length) {
      const rows = [];
      record.purchases.forEach((d) => {
        const sign = d.doc_type === 'purchase_return' ? -1 : 1;
        rows.push({ date: dayLabel(d.doc_date), doc: `${DOC_LABEL[d.doc_type] || d.doc_type} ${d.doc_no || ''}`.trim(), item: d.supplier_ref ? `Their ref ${d.supplier_ref}` : '', qty: '', rate: '', amount: rupees(sign * Number(d.total_paise)), _bold: true });
        d.lines.forEach((l) => rows.push({ date: '', doc: '', item: l.description, qty: `${num(l.quantity)} ${l.unit || ''}`.trim(), rate: rupees(l.rate_paise), amount: rupees(sign * Number(l.amount_paise)) }));
      });
      section('What was bought from them — bill by bill', [
        { key: 'date', label: 'Date', pct: 12 }, { key: 'doc', label: 'Document', pct: 23 }, { key: 'item', label: 'Item', pct: 27 },
        { key: 'qty', label: 'Qty', pct: 11, align: R }, { key: 'rate', label: 'Rate', pct: 12, align: R }, { key: 'amount', label: 'Amount', pct: 15, align: R },
      ], rows, { total: `Purchases total ${rupees(S.bought_paise)}` });
    }

    // money
    section('Payments', [
      { key: 'date', label: 'Date', pct: 14 }, { key: 'no', label: 'Receipt / voucher', pct: 22 }, { key: 'dir', label: 'Type', pct: 14 },
      { key: 'method', label: 'Method', pct: 14 }, { key: 'ref', label: 'Reference', pct: 20 }, { key: 'amount', label: 'Amount', pct: 16, align: R },
    ], record.payments.map((x) => ({
      date: dayLabel(x.payment_date), no: x.payment_no || '', dir: x.direction === 'in' ? 'Received' : 'Paid out',
      method: x.method, ref: x.reference || '', amount: rupees(x.amount_paise),
    })), { total: `Received ${rupees(S.received_paise)}${S.paid_out_paise ? `   ·   Paid out ${rupees(S.paid_out_paise)}` : ''}` });

    // work done
    const jobs = [
      ...record.services.map((s) => ({ at: s.created_at, kind: 'Service', ticket: s.ticket_no, what: s.service_item, status: s.status, amount: s.amount, paid: s.payment_status })),
      ...record.installations.map((s) => ({ at: s.created_at, kind: 'Installation', ticket: s.ticket_no, what: s.installation_type, status: s.status, amount: s.amount, paid: s.payment_status })),
    ].sort((a, b) => new Date(a.at) - new Date(b.at));
    if (jobs.length) {
      section('Service and installation jobs', [
        { key: 'date', label: 'Date', pct: 12 }, { key: 'kind', label: 'Kind', pct: 13 }, { key: 'ticket', label: 'Ticket', pct: 16 },
        { key: 'what', label: 'What', pct: 27 }, { key: 'status', label: 'Status', pct: 12 }, { key: 'paid', label: 'Payment', pct: 10 },
        { key: 'amount', label: 'Bill', pct: 10, align: R },
      ], jobs.map((j) => ({
        date: dayLabel(j.at), kind: j.kind, ticket: j.ticket || '', what: j.what || '', status: String(j.status || '').replace(/_/g, ' '),
        paid: j.paid || '', amount: Number(j.amount) ? `₹${Number(j.amount).toLocaleString('en-IN')}`.replace('₹', HAS_UNICODE ? '₹' : 'Rs. ') : '',
      })));
    }

    // the account
    if (record.statement) {
      const st = record.statement;
      const rows = [{ date: isBeginning(record.period.from) ? '' : dayLabel(record.period.from), ref: '', narr: 'Opening balance', debit: '', credit: '', bal: rupees(st.opening_paise), _bold: true }];
      st.rows.forEach((r) => rows.push({
        date: dayLabel(r.date), ref: r.journal_no || '', narr: r.memo || r.narration || '',
        debit: r.debit_paise ? rupees(r.debit_paise) : '', credit: r.credit_paise ? rupees(r.credit_paise) : '', bal: rupees(r.balance_paise),
      }));
      section('Statement of account', [
        { key: 'date', label: 'Date', pct: 12 }, { key: 'ref', label: 'Entry', pct: 14 }, { key: 'narr', label: 'Details', pct: 30 },
        { key: 'debit', label: 'Debit', pct: 14, align: R }, { key: 'credit', label: 'Credit', pct: 14, align: R }, { key: 'bal', label: 'Balance', pct: 16, align: R },
      ], rows, { total: `Closing balance ${rupees(Math.abs(st.closing_paise))} ${st.closing_paise >= 0 ? '(they owe us)' : '(we owe them)'}` });
    }

    if (record.legacy.length) {
      section('Earlier records (from the old program)', [
        { key: 'date', label: 'Date', pct: 14 }, { key: 'type', label: 'Kind', pct: 22 }, { key: 'no', label: 'Number', pct: 24 },
        { key: 'total', label: 'Total', pct: 20, align: R }, { key: 'paid', label: 'Paid then', pct: 20, align: R },
      ], record.legacy.map((l) => ({
        date: dayLabel(l.doc_date), type: LEGACY_LABEL[l.doc_type] || l.doc_type, no: l.doc_no || '',
        total: rupees(l.total_paise), paid: rupees(l.paid_paise),
      })));
    }

    // page numbers
    const range = pdf.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      pdf.switchToPage(range.start + i);
      pdf.page.margins.bottom = 0; // the footer sits inside the bottom margin; without this drawing it adds a page
      pdf.font(reg).fontSize(7.5).fillColor(MUTED)
        .text(`${p.display_name} · record · ${periodText(record.period)} · page ${i + 1} of ${range.count}`,
          M, pdf.page.height - 30, { width: W, align: 'center', lineBreak: false });
    }
    pdf.end();
  });
}

module.exports = { collect, renderPdf };
