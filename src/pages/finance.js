// Finance Report — professional, chart-driven business dashboard with growth
// insights. Numbers come from /api/finance/summary; AI narration from /api/ai/finance.
import { toast, showLoader } from '../utils.js';
import { ICONS } from '../icons.js';

const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const inrShort = (n) => {
  n = Number(n) || 0;
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(n % 1e7 ? 1 : 0) + 'Cr';
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(n % 1e5 ? 1 : 0) + 'L';
  if (n >= 1e3) return '₹' + (n / 1e3).toFixed(n % 1e3 ? 1 : 0) + 'k';
  return '₹' + Math.round(n);
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthShort = (ym) => { const [y, m] = String(ym).split('-').map(Number); return MONTHS[m - 1] + (m === 1 ? ` '${String(y).slice(2)}` : ''); };
const CAT_COLORS = ['#10B981', '#38BDF8', '#A78BFA', '#FBBF24', '#F472B6', '#34D399', '#FB923C', '#60A5FA', '#94A3B8'];

function presetRange(preset) {
  const now = new Date();
  const ymd = (d) => d.toLocaleDateString('en-CA');
  if (preset === 'this-month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
  if (preset === 'last-month') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: ymd(first), to: ymd(last) };
  }
  if (preset === 'this-year') return { from: ymd(new Date(now.getFullYear(), 0, 1)), to: ymd(now) };
  return {};
}

async function fetchSummary(range) {
  const qs = new URLSearchParams();
  if (range.from) qs.set('from', range.from);
  if (range.to) qs.set('to', range.to);
  const res = await fetch(`${API}/finance/summary?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not load finance summary');
  return data;
}

async function askAI(range, question) {
  const res = await fetch(`${API}/ai/finance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` },
    body: JSON.stringify({ from: range.from || null, to: range.to || null, question: question || null }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'AI request failed');
  return data.answer || '';
}

function mdLite(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul style="margin:6px 0 6px 18px;">$1</ul>')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

/* ─────────────────────────── chart helpers ─────────────────────────── */

function trendChart(rows) {
  if (!rows.length) return '<div class="fin-empty">No revenue history yet.</div>';
  const w = 680, h = 250, padL = 46, padR = 16, padT = 16, padB = 30;
  const innerW = w - padL - padR, innerH = h - padT - padB, n = rows.length;
  const maxV = Math.max(1, ...rows.map(r => Math.max(r.billed, r.received)));
  const X = i => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const Y = v => padT + innerH - (v / maxV) * innerH;
  const line = key => rows.map((r, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(r[key]).toFixed(1)}`).join(' ');
  const area = `M${X(0).toFixed(1)} ${(padT + innerH).toFixed(1)} ` +
    rows.map((r, i) => `L${X(i).toFixed(1)} ${Y(r.billed).toFixed(1)}`).join(' ') +
    ` L${X(n - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const yy = padT + innerH - f * innerH;
    return `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${w - padR}" y2="${yy.toFixed(1)}" class="fin-grid"/>
      <text x="${padL - 8}" y="${(yy + 3).toFixed(1)}" class="fin-axis" text-anchor="end">${inrShort(maxV * f)}</text>`;
  }).join('');
  const xlabels = rows.map((r, i) => (n > 8 && i % 2) ? '' : `<text x="${X(i).toFixed(1)}" y="${h - 8}" class="fin-axis" text-anchor="middle">${monthShort(r.month)}</text>`).join('');
  const dots = rows.map((r, i) => `
    <circle cx="${X(i).toFixed(1)}" cy="${Y(r.billed).toFixed(1)}" r="3.4" class="fin-dot" style="--c:var(--primary)"><title>${monthShort(r.month)} · Billed ${inr(r.billed)}</title></circle>
    <circle cx="${X(i).toFixed(1)}" cy="${Y(r.received).toFixed(1)}" r="3.4" class="fin-dot" style="--c:var(--success)"><title>${monthShort(r.month)} · Received ${inr(r.received)}</title></circle>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" class="fin-svg">
    <defs><linearGradient id="finArea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--primary)" stop-opacity=".26"/><stop offset="1" stop-color="var(--primary)" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}
    <path d="${area}" fill="url(#finArea)" class="fin-area"/>
    <path d="${line('billed')}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linejoin="round" class="fin-line"/>
    <path d="${line('received')}" fill="none" stroke="var(--success)" stroke-width="2.5" stroke-linejoin="round" class="fin-line"/>
    ${dots}${xlabels}
  </svg>`;
}

function donut(segments, centerTop, centerSub, size = 168, thickness = 26) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2, c = size / 2, circ = 2 * Math.PI * r;
  let acc = 0;
  const arcs = total > 0 ? segments.filter(s => s.value > 0).map(s => {
    const frac = s.value / total, dash = frac * circ, off = -acc * circ; acc += frac;
    return `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${thickness}"
      stroke-dasharray="${dash.toFixed(2)} ${(circ - dash).toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"
      transform="rotate(-90 ${c} ${c})" class="fin-arc"/>`;
  }).join('') : `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${thickness}"/>`;
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="fin-donut">
    ${arcs}
    <text x="50%" y="47%" text-anchor="middle" class="fin-donut-top">${centerTop || ''}</text>
    <text x="50%" y="61%" text-anchor="middle" class="fin-donut-sub">${centerSub || ''}</text>
  </svg>`;
}

function legend(segments) {
  return `<div class="fin-legend">${segments.filter(s => s.value > 0).map(s =>
    `<span class="fin-leg"><i style="background:${s.color}"></i>${esc(s.label)} <b>${inr(s.value)}</b></span>`).join('') || '<span class="fin-leg" style="color:var(--text-dim)">No data</span>'}</div>`;
}

function gauge(pct, label, color) {
  const size = 150, stroke = 13, r = (size - stroke) / 2, c = size / 2, circ = 2 * Math.PI * r;
  const off = circ * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="fin-gauge">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${stroke}"/>
    <circle class="fin-ring-fg" cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${circ.toFixed(1)}" data-target="${off.toFixed(1)}" transform="rotate(-90 ${c} ${c})"/>
    <text x="50%" y="46%" text-anchor="middle" class="fin-gauge-num">${Math.round(pct)}%</text>
    <text x="50%" y="62%" text-anchor="middle" class="fin-gauge-lbl">${esc(label)}</text>
  </svg>`;
}

function deltaBadge(cur, prev, goodUp = true) {
  if (prev == null) return '';
  if (prev === 0) return cur > 0 ? `<span class="fin-delta good">▲ new</span>` : '';
  const pc = ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pc) < 0.5) return `<span class="fin-delta flat">▬ 0%</span>`;
  const up = pc > 0, good = up === goodUp;
  return `<span class="fin-delta ${good ? 'good' : 'bad'}">${up ? '▲' : '▼'} ${Math.abs(pc).toFixed(0)}%</span>`;
}

function kpi(label, value, color, delta, hint) {
  return `<div class="fin-kpi fin-in">
    <div class="fin-kpi-top"><span class="fin-kpi-label">${label}</span>${delta || ''}</div>
    <div class="fin-kpi-value" style="color:${color}">${value}</div>
    ${hint ? `<div class="fin-kpi-hint">${hint}</div>` : ''}
  </div>`;
}

function animateBars(scope) {
  scope.querySelectorAll('.fin-bar-fill').forEach(el => { const w = el.dataset.w; el.style.width = '0%'; requestAnimationFrame(() => { el.style.width = w + '%'; }); });
}
function animateRings(scope) {
  scope.querySelectorAll('.fin-ring-fg').forEach(el => requestAnimationFrame(() => { el.style.strokeDashoffset = el.dataset.target; }));
}
function animateLines(scope) {
  scope.querySelectorAll('.fin-line').forEach(p => {
    try {
      const len = p.getTotalLength();
      p.style.transition = 'none'; p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
      requestAnimationFrame(() => { p.style.transition = 'stroke-dashoffset 1.2s ease'; p.style.strokeDashoffset = '0'; });
    } catch { /* getTotalLength unsupported */ }
  });
}

/* ───────────────────────── growth insights (local) ───────────────────────── */

function buildInsights(d) {
  const t = d.totals, out = [];
  const collRate = t.billed > 0 ? (t.received / t.billed) * 100 : 0;
  out.push({
    tone: collRate >= 80 ? 'good' : collRate >= 60 ? 'warn' : 'bad', icon: ICONS.rupee,
    title: `Collection rate ${collRate.toFixed(0)}%`,
    text: collRate >= 80 ? 'Healthy — most billed work is getting paid on time.'
      : `${inr(t.pending)} billed is still uncollected. Prioritise chasing the oldest invoices.`,
  });
  if (d.aging['31+'] > 0) out.push({
    tone: 'bad', icon: ICONS.alert, title: `${inr(d.aging['31+'])} overdue 31+ days`,
    text: 'This is your highest-risk money. Call or message these customers this week before it ages further.',
  });
  if (d.trend && d.trend.length >= 2) {
    const a = d.trend[d.trend.length - 2].billed, b = d.trend[d.trend.length - 1].billed;
    if (a > 0) { const g = ((b - a) / a) * 100; out.push({
      tone: g >= 0 ? 'good' : 'warn', icon: ICONS.dashboard,
      title: `Revenue ${g >= 0 ? 'up' : 'down'} ${Math.abs(g).toFixed(0)}% vs last month`,
      text: g >= 0 ? 'Momentum is positive — keep lead flow and follow-ups consistent to compound it.'
        : 'Revenue dipped month-on-month. Review where leads dropped and re-engage past customers.',
    }); }
  }
  if (d.byCategory.length) {
    const totalCat = d.byCategory.reduce((s, x) => s + x.revenue, 0) || 1;
    const c = d.byCategory[0]; const share = (c.revenue / totalCat) * 100;
    out.push({ tone: 'good', icon: ICONS.box, title: `${esc(c.category)} is your top earner`,
      text: `${inr(c.revenue)} (${share.toFixed(0)}% of service revenue). Build packages/upsells around it to grow margin.` });
  }
  const techs = d.byTechnician.filter(x => x.name !== 'Unassigned');
  if (techs.length) { const top = [...techs].sort((a, b) => b.received - a.received)[0];
    out.push({ tone: 'good', icon: ICONS.user, title: `${esc(top.name)} collected the most`,
      text: `${inr(top.received)} across ${top.jobs} jobs. Recognise top performers and share their approach with the team.` }); }
  if (t.cashInHand > 0) out.push({ tone: 'warn', icon: ICONS.card, title: `${inr(t.cashInHand)} cash not deposited`,
    text: 'Staff are still holding collected cash. Ask them to submit it to cut leakage and reconcile faster.' });
  out.push({ tone: 'good', icon: ICONS.receipt, title: `Average ticket ${inr(t.avgTicket)}`,
    text: 'Lift this with service bundles, annual maintenance contracts (AMC), and premium installs.' });
  return out;
}

function techBars(rows) {
  if (!rows.length) return '<div class="fin-empty">No technician data in this period.</div>';
  const max = Math.max(1, ...rows.map(r => r.billed));
  return rows.slice(0, 8).map((r, i) => {
    const bw = Math.max(2, (r.billed / max) * 100);
    const rw = r.billed > 0 ? (r.received / r.billed) * 100 : 0;
    return `<div class="fin-tech fin-in" style="--d:${(i * 0.05).toFixed(2)}s">
      <div class="fin-tech-top">
        <span class="fin-ava">${initials(r.name)}</span>
        <b class="fin-tech-name">${esc(r.name)}</b>
        <span class="fin-tech-jobs">${r.jobs} job${r.jobs === 1 ? '' : 's'}</span>
        <span class="fin-tech-amt"><b>${inr(r.received)}</b><small>of ${inr(r.billed)}</small></span>
      </div>
      <div class="fin-tech-bar"><div class="fin-bar-fill fin-tech-bill" data-w="${bw.toFixed(1)}"><div class="fin-tech-rec" style="width:${rw.toFixed(1)}%"></div></div></div>
    </div>`;
  }).join('');
}

function agingBlock(d) {
  const buckets = [['0–7 days', d.aging['0-7'], 'var(--success)'], ['8–30 days', d.aging['8-30'], 'var(--warning)'], ['31+ days', d.aging['31+'], 'var(--danger)']];
  const total = buckets.reduce((s, b) => s + b[1], 0) || 1;
  const segs = buckets.map(([, v, c]) => v > 0 ? `<div class="fin-stack-seg" style="width:${(v / total * 100).toFixed(1)}%;background:${c}">${v / total > 0.1 ? inrShort(v) : ''}</div>` : '').join('');
  const leg = buckets.map(([l, v, c]) => `<span class="fin-leg"><i style="background:${c}"></i>${l} <b>${inr(v)}</b></span>`).join('');
  return `<div class="fin-stack">${segs || '<div class="fin-stack-seg" style="width:100%;background:var(--bg-soft);color:var(--text-dim)">Nothing pending 🎉</div>'}</div><div class="fin-legend">${leg}</div>`;
}

function tableCard(title, headers, rows) {
  return `
    <div class="card fin-in" style="margin-bottom:20px;">
      <div class="card-header"><span class="card-title">${title}</span></div>
      <div class="table-wrap"><table>
        <thead><tr>${headers.map(h => `<th${h.right ? ' style="text-align:right"' : ''}>${h.label}</th>`).join('')}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${headers.length}" style="text-align:center;padding:24px;color:var(--text-dim)">No data</td></tr>`}</tbody>
      </table></div>
    </div>`;
}

/* ─────────────────────────── export helpers ─────────────────────────── */

function buildCsv(d) {
  const lines = ['Finance Report', `Range,${d.range.from || 'All time'},${d.range.to || ''}`, '', 'Metric,Value'];
  const t = d.totals;
  [['Total Billed', t.billed], ['Total Received', t.received], ['Pending', t.pending],
   ['Collection Rate %', t.billed ? Math.round(t.received / t.billed * 100) : 0],
   ['Bills', t.billsCount], ['Paid Bills', t.paidCount], ['Avg Ticket', Math.round(t.avgTicket)],
   ['GST Collected', t.gst], ['Discounts Given', t.discounts], ['Cash In Hand (unsubmitted)', t.cashInHand],
  ].forEach(([k, v]) => lines.push(`${k},${v}`));
  lines.push('', 'Technician,Billed,Received,Jobs');
  d.byTechnician.forEach(r => lines.push(`"${r.name}",${Math.round(r.billed)},${Math.round(r.received)},${r.jobs}`));
  lines.push('', 'Month,Billed,Received');
  d.byMonth.forEach(r => lines.push(`${r.month},${Math.round(r.billed)},${Math.round(r.received)}`));
  lines.push('', 'Category,Revenue,Items');
  d.byCategory.forEach(r => lines.push(`"${r.category}",${Math.round(r.revenue)},${r.items}`));
  return lines.join('\n');
}

function printReport(d) {
  const t = d.totals;
  const collRate = t.billed ? Math.round(t.received / t.billed * 100) : 0;
  const row = (k, v) => `<tr><td>${esc(k)}</td><td style="text-align:right">${esc(v)}</td></tr>`;
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to export PDF', 'info'); return; }
  w.document.write(`<!doctype html><html><head><title>Finance Report</title><meta charset="utf-8">
    <style>
      body{font-family:Arial,sans-serif;color:#0f172a;padding:32px;max-width:820px;margin:auto;}
      h1{color:#064e3b;margin:0 0 4px;} .sub{color:#64748b;font-size:13px;margin-bottom:20px;}
      h2{font-size:15px;border-bottom:2px solid #10b981;padding-bottom:4px;margin:22px 0 8px;}
      table{width:100%;border-collapse:collapse;font-size:13px;} td,th{padding:6px 8px;border-bottom:1px solid #eee;text-align:left;}
      th{color:#064e3b;text-transform:uppercase;font-size:11px;} .tot{font-weight:800;color:#10b981;}
    </style></head><body>
    <h1>Networking Experts — Finance Report</h1>
    <div class="sub">Period: ${esc(d.range.from || 'All time')} ${d.range.to ? '→ ' + esc(d.range.to) : ''} &nbsp;·&nbsp; Generated ${new Date().toLocaleString('en-IN')}</div>
    <h2>Summary</h2>
    <table>
      ${row('Total Billed', inr(t.billed))}${row('Received', inr(t.received))}${row('Collection Rate', collRate + '%')}${row('Pending', inr(t.pending))}
      ${row('Bills (paid/total)', `${t.paidCount} / ${t.billsCount}`)}${row('Average Ticket', inr(t.avgTicket))}
      ${row('GST Collected', inr(t.gst))}${row('Discounts Given', inr(t.discounts))}${row('Cash In Hand', inr(t.cashInHand))}
      <tr class="tot"><td>Net Received</td><td style="text-align:right">${esc(inr(t.received))}</td></tr>
    </table>
    <h2>By Technician</h2>
    <table><thead><tr><th>Technician</th><th>Jobs</th><th>Billed</th><th>Received</th></tr></thead><tbody>
      ${d.byTechnician.map(r => `<tr><td>${esc(r.name)}</td><td>${r.jobs}</td><td>${esc(inr(r.billed))}</td><td>${esc(inr(r.received))}</td></tr>`).join('') || '<tr><td colspan="4">No data</td></tr>'}
    </tbody></table>
    <h2>By Service Category</h2>
    <table><thead><tr><th>Category</th><th>Items</th><th>Revenue</th></tr></thead><tbody>
      ${d.byCategory.map(r => `<tr><td>${esc(r.category)}</td><td>${r.items}</td><td>${esc(inr(r.revenue))}</td></tr>`).join('') || '<tr><td colspan="3">No data</td></tr>'}
    </tbody></table>
    <h2>Revenue by Month</h2>
    <table><thead><tr><th>Month</th><th>Billed</th><th>Received</th></tr></thead><tbody>
      ${d.byMonth.map(r => `<tr><td>${r.month}</td><td>${esc(inr(r.billed))}</td><td>${esc(inr(r.received))}</td></tr>`).join('') || '<tr><td colspan="3">No data</td></tr>'}
    </tbody></table>
    <script>window.onload=()=>window.print();<\/script></body></html>`);
  w.document.close();
}

/* ───────────────────────────── main render ───────────────────────────── */

export async function renderFinanceReportTab(container) {
  showLoader(container);
  let preset = 'this-month';
  let latest = null;

  const load = async () => {
    showLoader(container);
    let d;
    try { d = await fetchSummary(presetRange(preset)); }
    catch (err) { container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--danger)">${esc(err.message)}</div></div>`; return; }
    latest = d;
    const t = d.totals, pv = d.previous;
    const collRate = t.billed > 0 ? (t.received / t.billed) * 100 : 0;
    const prevColl = pv && pv.billed > 0 ? (pv.received / pv.billed) * 100 : null;

    // category donut (top 8 + Other)
    const catSorted = [...d.byCategory].sort((a, b) => b.revenue - a.revenue);
    const catTop = catSorted.slice(0, 8).map((c, i) => ({ label: c.category, value: c.revenue, color: CAT_COLORS[i % CAT_COLORS.length] }));
    const catRest = catSorted.slice(8).reduce((s, c) => s + c.revenue, 0);
    if (catRest > 0) catTop.push({ label: 'Other', value: catRest, color: 'var(--text-dim)' });
    const catTotal = catTop.reduce((s, c) => s + c.value, 0);

    const methodSegs = [
      { label: 'Online', value: d.byMethod.online, color: 'var(--primary)' },
      { label: 'Cash', value: d.byMethod.cash, color: 'var(--success)' },
      { label: 'Unspecified', value: d.byMethod.unknown, color: 'var(--text-dim)' },
    ];

    const insights = buildInsights(d);

    container.innerHTML = `
      <div class="page-header fin-in" style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div><h1 class="fin-h1">${ICONS.rupee}<span>Finance &amp; Growth</span></h1><p style="color:var(--text-soft);margin:4px 0 0;">Track revenue, collections and what to do next to grow the business.</p></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <select id="fin-range" class="fin-select">
            <option value="this-month" ${preset === 'this-month' ? 'selected' : ''}>This Month</option>
            <option value="last-month" ${preset === 'last-month' ? 'selected' : ''}>Last Month</option>
            <option value="this-year" ${preset === 'this-year' ? 'selected' : ''}>This Year</option>
            <option value="all" ${preset === 'all' ? 'selected' : ''}>All Time</option>
          </select>
          <button class="btn btn-secondary" id="fin-pdf">${ICONS.receipt || ''}<span>PDF</span></button>
          <button class="btn btn-secondary" id="fin-csv">${ICONS.download || ''}<span>CSV</span></button>
          <button class="btn btn-secondary" id="fin-refresh">${ICONS.refresh}<span>Refresh</span></button>
        </div>
      </div>

      <div class="fin-kpis">
        ${kpi('Total Billed', inr(t.billed), 'var(--primary)', deltaBadge(t.billed, pv?.billed, true), pv ? `vs ${inrShort(pv.billed)} prev` : `${t.billsCount} bills`)}
        ${kpi('Received', inr(t.received), 'var(--success)', deltaBadge(t.received, pv?.received, true), pv ? `vs ${inrShort(pv.received)} prev` : 'collected')}
        ${kpi('Collection Rate', `${collRate.toFixed(0)}%`, collRate >= 80 ? 'var(--success)' : collRate >= 60 ? 'var(--warning)' : 'var(--danger)', deltaBadge(collRate, prevColl, true), 'billed → paid')}
        ${kpi('Pending', inr(t.pending), 'var(--warning)', deltaBadge(t.pending, pv ? pv.billed - pv.received : null, false), 'to collect')}
        ${kpi('Avg Ticket', inr(t.avgTicket), 'var(--text)', null, `${t.paidCount}/${t.billsCount} paid`)}
      </div>

      <div class="card fin-in" style="margin-bottom:20px;">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
          <span class="card-title">Revenue Trend — last 12 months</span>
          <span class="fin-chart-legend"><span><i style="background:var(--primary)"></i>Billed</span><span><i style="background:var(--success)"></i>Received</span></span>
        </div>
        <div class="card-body">${trendChart(d.trend || [])}</div>
      </div>

      <div class="fin-grid-3">
        <div class="card fin-in"><div class="card-header"><span class="card-title">Revenue by Category</span></div>
          <div class="card-body fin-donut-wrap">${donut(catTop, inrShort(catTotal), 'services')}${legend(catTop)}</div></div>
        <div class="card fin-in"><div class="card-header"><span class="card-title">Payment Method</span></div>
          <div class="card-body fin-donut-wrap">${donut(methodSegs, inrShort(d.byMethod.online + d.byMethod.cash + d.byMethod.unknown), 'received')}${legend(methodSegs)}</div></div>
        <div class="card fin-in"><div class="card-header"><span class="card-title">Business Health</span></div>
          <div class="card-body" style="text-align:center;">
            ${gauge(collRate, 'Collected', collRate >= 80 ? 'var(--success)' : collRate >= 60 ? 'var(--warning)' : 'var(--danger)')}
            <div class="fin-health-row"><span>Received</span><b style="color:var(--success)">${inr(t.received)}</b></div>
            <div class="fin-health-row"><span>Still pending</span><b style="color:var(--warning)">${inr(t.pending)}</b></div>
            <div class="fin-health-row"><span>GST collected</span><b>${inr(t.gst)}</b></div>
          </div></div>
      </div>

      <div class="card fin-in" style="margin-bottom:20px;"><div class="card-header"><span class="card-title">Receivables Aging — how old is the pending money</span></div>
        <div class="card-body">${agingBlock(d)}</div></div>

      <div class="fin-grid-2">
        <div class="card fin-in fin-advisor"><div class="card-header"><span class="card-title">📈 Growth Advisor — what to do next</span></div>
          <div class="card-body">${insights.map(x => `
            <div class="fin-insight ${x.tone}">
              <span class="fin-insight-ico">${x.icon || ICONS.dashboard}</span>
              <div><b>${x.title}</b><p>${x.text}</p></div>
            </div>`).join('')}</div></div>

        <div class="card fin-in" style="border:1px solid color-mix(in srgb, var(--primary) 50%, var(--border));">
          <div class="card-header"><span class="card-title">🤖 AI Business Report</span></div>
          <div class="card-body">
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
              <input id="fin-ai-q" placeholder="Ask anything (e.g. how can I increase collections?)" class="fin-select" style="flex:1;min-width:200px;">
              <button class="btn btn-secondary" id="fin-ai-ask">Ask</button>
              <button class="btn btn-primary" id="fin-ai-summary">Generate Report</button>
            </div>
            <div id="fin-ai-out" class="fin-ai-out"><span style="color:var(--text-dim);">Click <b>Generate Report</b> for an AI growth analysis of this period, or ask a specific question.</span></div>
          </div>
        </div>
      </div>

      <div class="card fin-in" style="margin-bottom:20px;"><div class="card-header"><span class="card-title">Technician Performance — collected vs billed</span></div>
        <div class="card-body">${techBars(d.byTechnician)}</div></div>

      ${tableCard('By Service Category', [{ label: 'Category' }, { label: 'Items', right: true }, { label: 'Revenue', right: true }],
        d.byCategory.map(r => `<tr><td>${esc(r.category)}</td><td style="text-align:right">${r.items}</td><td style="text-align:right">${inr(r.revenue)}</td></tr>`).join(''))}

      ${tableCard('By Company', [{ label: 'Company' }, { label: 'Billed', right: true }, { label: 'Received', right: true }],
        d.byCompany.map(r => `<tr><td>${esc(r.company)}</td><td style="text-align:right">${inr(r.billed)}</td><td style="text-align:right;color:var(--success)">${inr(r.received)}</td></tr>`).join(''))}
    `;

    animateBars(container); animateRings(container); animateLines(container);

    container.querySelector('#fin-range').onchange = (e) => { preset = e.target.value; load(); };
    container.querySelector('#fin-refresh').onclick = () => load();

    const aiOut = container.querySelector('#fin-ai-out');
    const runAI = async (btn, question) => {
      const orig = btn.textContent;
      btn.disabled = true; btn.textContent = 'Thinking…';
      aiOut.innerHTML = '<span class="fin-ai-loading">Analysing your numbers…</span>';
      try { aiOut.innerHTML = mdLite(await askAI(presetRange(preset), question)); }
      catch (err) { aiOut.innerHTML = `<span style="color:var(--danger);">${esc(err.message)}</span>`; }
      finally { btn.disabled = false; btn.textContent = orig; }
    };
    container.querySelector('#fin-ai-summary').onclick = (e) => runAI(e.currentTarget, null);
    container.querySelector('#fin-ai-ask').onclick = (e) => {
      const q = container.querySelector('#fin-ai-q').value.trim();
      if (!q) return toast('Type a question first', 'info');
      runAI(e.currentTarget, q);
    };
    container.querySelector('#fin-ai-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') container.querySelector('#fin-ai-ask').click(); });
    container.querySelector('#fin-pdf').onclick = () => { if (latest) printReport(latest); };
    container.querySelector('#fin-csv').onclick = () => {
      if (!latest) return;
      const blob = new Blob([buildCsv(latest)], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `finance-report-${preset}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast('CSV exported', 'success');
    };
  };

  await load();
}
