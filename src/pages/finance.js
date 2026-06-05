// Finance Report — comprehensive business finance dashboard (numbers only; AI
// narration can be layered on later via a separate /api/ai/finance endpoint).
import { toast, showLoader } from '../utils.js';
import { ICONS } from '../icons.js';

const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Returns { from, to } as YYYY-MM-DD for a named preset, or {} for all-time.
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
  return {}; // all-time
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
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
    },
    body: JSON.stringify({ from: range.from || null, to: range.to || null, question: question || null }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'AI request failed');
  return data.answer || '';
}

// Minimal markdown → HTML for the AI answer (bold, bullets, line breaks).
function mdLite(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul style="margin:6px 0 6px 18px;">$1</ul>')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

const statCard = (label, value, color) =>
  `<div class="stat-card"><div class="stat-value" style="color:${color || 'var(--text)'}">${value}</div><div class="stat-label">${label}</div></div>`;

function barRow(label, value, max, color) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return `
    <div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:4px;">
        <span style="color:var(--text-soft);">${esc(label)}</span><b>${inr(value)}</b>
      </div>
      <div style="height:8px;background:var(--bg-soft);border-radius:6px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${color || 'var(--primary)'};border-radius:6px;"></div>
      </div>
    </div>`;
}

function tableCard(title, headers, rows) {
  return `
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header"><span class="card-title">${title}</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr>${headers.map(h => `<th${h.right ? ' style="text-align:right"' : ''}>${h.label}</th>`).join('')}</tr></thead>
          <tbody>${rows || `<tr><td colspan="${headers.length}" style="text-align:center;padding:24px;color:var(--text-dim)">No data</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
}

function buildCsv(d) {
  const lines = [];
  lines.push('Finance Report');
  lines.push(`Range,${d.range.from || 'All time'},${d.range.to || ''}`);
  lines.push('');
  lines.push('Metric,Value');
  const t = d.totals;
  [['Total Billed', t.billed], ['Total Received', t.received], ['Pending', t.pending],
   ['Bills', t.billsCount], ['Paid Bills', t.paidCount], ['Avg Ticket', Math.round(t.avgTicket)],
   ['GST Collected', t.gst], ['Discounts Given', t.discounts], ['Cash In Hand (unsubmitted)', t.cashInHand],
  ].forEach(([k, v]) => lines.push(`${k},${v}`));
  lines.push('');
  lines.push('Technician,Billed,Received,Jobs');
  d.byTechnician.forEach(r => lines.push(`"${r.name}",${Math.round(r.billed)},${Math.round(r.received)},${r.jobs}`));
  lines.push('');
  lines.push('Month,Billed,Received');
  d.byMonth.forEach(r => lines.push(`${r.month},${Math.round(r.billed)},${Math.round(r.received)}`));
  lines.push('');
  lines.push('Category,Revenue,Items');
  d.byCategory.forEach(r => lines.push(`"${r.category}",${Math.round(r.revenue)},${r.items}`));
  return lines.join('\n');
}

export async function renderFinanceReportTab(container) {
  showLoader(container);
  let preset = 'this-month';
  let latest = null;

  const load = async () => {
    showLoader(container);
    let d;
    try {
      d = await fetchSummary(presetRange(preset));
    } catch (err) {
      container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--danger)">${esc(err.message)}</div></div>`;
      return;
    }
    latest = d;
    const t = d.totals;
    const maxMonth = Math.max(1, ...d.byMonth.map(m => m.billed));
    const methodTotal = d.byMethod.cash + d.byMethod.online + d.byMethod.unknown;

    container.innerHTML = `
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div><h1>Finance Report</h1><p>Revenue, payments, and collections across your business</p></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <select id="fin-range" style="padding:9px 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg);">
            <option value="this-month" ${preset === 'this-month' ? 'selected' : ''}>This Month</option>
            <option value="last-month" ${preset === 'last-month' ? 'selected' : ''}>Last Month</option>
            <option value="this-year" ${preset === 'this-year' ? 'selected' : ''}>This Year</option>
            <option value="all" ${preset === 'all' ? 'selected' : ''}>All Time</option>
          </select>
          <button class="btn btn-secondary" id="fin-csv">${ICONS.download || ''}<span>Export CSV</span></button>
          <button class="btn btn-secondary" id="fin-refresh">${ICONS.refresh}<span>Refresh</span></button>
        </div>
      </div>

      <div class="stats-grid" style="margin-bottom:20px;">
        ${statCard('Total Billed', inr(t.billed), 'var(--primary)')}
        ${statCard('Received', inr(t.received), 'var(--success)')}
        ${statCard('Pending', inr(t.pending), 'var(--warning)')}
        ${statCard('Avg Ticket', inr(t.avgTicket), 'var(--text)')}
      </div>
      <div class="stats-grid" style="margin-bottom:24px;">
        ${statCard('GST Collected', inr(t.gst), 'var(--text)')}
        ${statCard('Discounts Given', inr(t.discounts), 'var(--danger)')}
        ${statCard('Cash In Hand', inr(t.cashInHand), 'var(--warning)')}
        ${statCard('Paid / Bills', `${t.paidCount} / ${t.billsCount}`, 'var(--primary)')}
      </div>

      <div class="card" style="margin-bottom:20px;border:1px solid var(--primary);">
        <div class="card-header"><span class="card-title">🤖 AI Insights</span></div>
        <div class="card-body">
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
            <input id="fin-ai-q" placeholder="Ask about your finances (e.g. who has cash pending?)" style="flex:1;min-width:220px;padding:9px 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg);">
            <button class="btn btn-secondary" id="fin-ai-ask">Ask</button>
            <button class="btn btn-primary" id="fin-ai-summary">Generate Summary</button>
          </div>
          <div id="fin-ai-out" style="font-size:0.9rem;line-height:1.5;color:var(--text);min-height:20px;">
            <span style="color:var(--text-dim);">Click <b>Generate Summary</b> for an AI overview of this period, or ask a question.</span>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;margin-bottom:20px;">
        <div class="card"><div class="card-header"><span class="card-title">Payment Method</span></div><div class="card-body">
          ${barRow('Online', d.byMethod.online, methodTotal, 'var(--primary)')}
          ${barRow('Cash', d.byMethod.cash, methodTotal, 'var(--success)')}
          ${d.byMethod.unknown > 0 ? barRow('Unspecified', d.byMethod.unknown, methodTotal, 'var(--text-dim)') : ''}
        </div></div>
        <div class="card"><div class="card-header"><span class="card-title">Pending — Receivables Aging</span></div><div class="card-body">
          ${barRow('0–7 days', d.aging['0-7'], t.pending, 'var(--success)')}
          ${barRow('8–30 days', d.aging['8-30'], t.pending, 'var(--warning)')}
          ${barRow('31+ days', d.aging['31+'], t.pending, 'var(--danger)')}
        </div></div>
      </div>

      <div class="card" style="margin-bottom:20px;"><div class="card-header"><span class="card-title">Revenue by Month (billed)</span></div><div class="card-body">
        ${d.byMonth.length ? d.byMonth.map(m => barRow(m.month, m.billed, maxMonth, 'var(--primary)')).join('') : '<div style="text-align:center;color:var(--text-dim);padding:16px;">No data in range</div>'}
      </div></div>

      ${tableCard('By Technician', [{ label: 'Technician' }, { label: 'Jobs', right: true }, { label: 'Billed', right: true }, { label: 'Received', right: true }],
        d.byTechnician.map(r => `<tr><td>${esc(r.name)}</td><td style="text-align:right">${r.jobs}</td><td style="text-align:right">${inr(r.billed)}</td><td style="text-align:right;color:var(--success)">${inr(r.received)}</td></tr>`).join(''))}

      ${tableCard('By Service Category', [{ label: 'Category' }, { label: 'Items', right: true }, { label: 'Revenue', right: true }],
        d.byCategory.map(r => `<tr><td>${esc(r.category)}</td><td style="text-align:right">${r.items}</td><td style="text-align:right">${inr(r.revenue)}</td></tr>`).join(''))}

      ${tableCard('By Company', [{ label: 'Company' }, { label: 'Billed', right: true }, { label: 'Received', right: true }],
        d.byCompany.map(r => `<tr><td>${esc(r.company)}</td><td style="text-align:right">${inr(r.billed)}</td><td style="text-align:right;color:var(--success)">${inr(r.received)}</td></tr>`).join(''))}
    `;

    container.querySelector('#fin-range').onchange = (e) => { preset = e.target.value; load(); };
    container.querySelector('#fin-refresh').onclick = () => load();

    const aiOut = container.querySelector('#fin-ai-out');
    const runAI = async (btn, question) => {
      const orig = btn.textContent;
      btn.disabled = true; btn.textContent = 'Thinking…';
      aiOut.innerHTML = '<span style="color:var(--text-dim);">Analyzing your numbers…</span>';
      try {
        const answer = await askAI(presetRange(preset), question);
        aiOut.innerHTML = mdLite(answer);
      } catch (err) {
        aiOut.innerHTML = `<span style="color:var(--danger);">${esc(err.message)}</span>`;
      } finally {
        btn.disabled = false; btn.textContent = orig;
      }
    };
    container.querySelector('#fin-ai-summary').onclick = (e) => runAI(e.currentTarget, null);
    container.querySelector('#fin-ai-ask').onclick = (e) => {
      const q = container.querySelector('#fin-ai-q').value.trim();
      if (!q) return toast('Type a question first', 'info');
      runAI(e.currentTarget, q);
    };
    container.querySelector('#fin-ai-q').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') container.querySelector('#fin-ai-ask').click();
    });
    container.querySelector('#fin-csv').onclick = () => {
      if (!latest) return;
      const blob = new Blob([buildCsv(latest)], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finance-report-${preset}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast('CSV exported', 'success');
    };
  };

  await load();
}
