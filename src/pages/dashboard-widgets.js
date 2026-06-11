// Admin-dashboard data-viz widgets: SVG gauge rings, vertical/horizontal bar
// charts, a status donut, and a monthly trend — all driven by real values from
// renderAdminDashboard. Pure string builders (no DOM, no deps).

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function clampPct(v) { return Math.max(0, Math.min(100, Number(v) || 0)); }

// DESIGN GaugeRing: 270° open arc (needle-free fill) with centered value.
export function gauge(pct, color, size = 92, stroke = 9, suffix = '%') {
  const p = clampPct(pct);
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const polar = (ang) => {
    const a = (ang - 90) * Math.PI / 180;
    return [cx + r * Math.cos(a), cx + r * Math.sin(a)];
  };
  const arc = (from, to) => {
    const [x1, y1] = polar(from), [x2, y2] = polar(to);
    const large = to - from > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  const start = 135, sweep = 270;
  const fillEnd = start + Math.max(sweep * (p / 100), 0.6);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="kpi-gauge-svg" role="img" aria-label="${Math.round(p)} percent">
    <path d="${arc(start, start + sweep)}" fill="none" stroke="var(--panel-3, var(--border))" stroke-width="${stroke}" stroke-linecap="round"/>
    ${p > 0 ? `<path d="${arc(start, fillEnd)}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" class="kpi-gauge-arc"/>` : ''}
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" class="kpi-gauge-txt">${Math.round(p)}<tspan class="kpi-gauge-suffix">${suffix}</tspan></text>
  </svg>`;
}

// DESIGN KpiCard: gauge ring left · label / big value / context line right.
export function kpiCard(pct, label, sub, color, value) {
  const big = value != null ? value : `${Math.round(clampPct(pct))}<small>%</small>`;
  return `<div class="card kpi kpi-card">
    ${gauge(pct, color)}
    <div class="kpi-info">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${big}</div>
      <div class="kpi-sub">${sub}</div>
    </div>
  </div>`;
}

// Smooth SVG area/line chart. values[] + labels[] arrays.
function areaChart(values, labels, color = 'var(--primary)') {
  const n = values.length;
  if (n < 2) return vbars(values, labels, color);
  const W = 540, H = 148;
  const pad = { l: 8, r: 8, t: 14, b: 30 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [
    pad.l + (i / (n - 1)) * pw,
    pad.t + ph - (v / max) * ph,
  ]);
  let linePath = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i];
    const mx = ((px + cx) / 2).toFixed(1);
    linePath += ` C ${mx},${py.toFixed(1)} ${mx},${cy.toFixed(1)} ${cx.toFixed(1)},${cy.toFixed(1)}`;
  }
  const base = (pad.t + ph).toFixed(1);
  const areaPath = `${linePath} L ${pts[pts.length-1][0].toFixed(1)},${base} L ${pts[0][0].toFixed(1)},${base} Z`;
  const gid = 'acg' + Math.abs(color.charCodeAt(0) || 0);
  const dots = pts.map(([x, y]) =>
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${color}" stroke="#fff" stroke-width="2"/>`
  ).join('');
  const xlbls = pts.map(([x], i) =>
    `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle" class="ac-lbl">${esc(labels[i] || '')}</text>`
  ).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;overflow:visible">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.20"/>
      <stop offset="90%" stop-color="${color}" stop-opacity="0.02"/>
    </linearGradient></defs>
    <path d="${areaPath}" fill="url(#${gid})"/>
    <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}${xlbls}
  </svg>`;
}

// Vertical bar chart. items: [{label, value, color}] (per-bar colour), OR pass
// (values, labels, color) for a single-colour series.
function vbars(items, labels, color) {
  const data = Array.isArray(labels)
    ? items.map((v, i) => ({ label: labels[i], value: v, color }))
    : items;
  const max = Math.max(1, ...data.map(d => d.value));
  const cols = data.map(d => {
    const h = Math.round((d.value / max) * 100);
    return `<div class="bc-col">
      <div class="bc-bar" style="height:${h}%;background:${d.color}"><span>${d.value}</span></div>
      <div class="bc-lbl">${esc(d.label)}</div>
    </div>`;
  }).join('');
  return `<div class="bc">${cols}</div>`;
}

// Horizontal stacked bars for "Services by Company" (resolved + active).
function companyBars(rows) {
  const max = Math.max(1, ...rows.map(r => r[1].total));
  return `<div class="hb">${rows.map(([name, c]) => {
    const resW = Math.round((c.resolved / max) * 100);
    const actW = Math.round((c.active / max) * 100);
    return `<div class="hb-row">
      <div class="hb-name" title="${esc(name)}">${esc(name)}</div>
      <div class="hb-track">
        <div class="hb-seg" style="width:${resW}%;background:var(--success)" title="Resolved: ${c.resolved}"></div>
        <div class="hb-seg" style="width:${actW}%;background:var(--warning)" title="Active: ${c.active}"></div>
      </div>
      <div class="hb-val">${c.total}</div>
    </div>`;
  }).join('')}</div>`;
}

// DESIGN Donut: 168px ring (stroke 26), center total + "total", legend below.
export function donut(segs, size = 168, sw = 26) {
  const total = segs.reduce((s, x) => s + x.value, 0) || 0;
  const r = (size - sw) / 2, c = 2 * Math.PI * r, cx = size / 2;
  let acc = 0;
  const arcs = total === 0
    ? `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="var(--panel-3, var(--border))" stroke-width="${sw}"/>`
    : `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="var(--panel-3, var(--border))" stroke-width="${sw}"/>` +
      segs.filter(s => s.value > 0).map(s => {
        const frac = s.value / total;
        const len = c * frac;
        const off = -c * acc;
        acc += frac;
        return `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${sw}"
          stroke-dasharray="${len.toFixed(1)} ${(c - len).toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 ${cx} ${cx})"/>`;
      }).join('');
  const legend = segs.map(s => `<span class="dn-li"><i style="background:${s.color}"></i>${esc(s.label)} · <b>${s.value}</b></span>`).join('');
  return `<div class="dn-wrap">
    <div class="dn-fig">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="dn-svg">${arcs}</svg>
      <div class="dn-center"><b>${total}</b><span>total</span></div>
    </div>
    <div class="dn-legend">${legend}</div>
  </div>`;
}

function chartCard(title, body, extraHead = '') {
  return `<div class="card kpi-chart-card">
    <div class="card-header"><span class="card-title">${title}</span>${extraHead}</div>
    <div class="card-body">${body}</div>
  </div>`;
}

// Top Technicians leaderboard card — ranked by resolved job count with inline bar.
function techLeaderboard(techs) {
  if (!techs || !techs.length) return '';
  const max = Math.max(1, ...techs.map(t => t.jobs));
  const rows = techs.map((t, i) => `<div class="lrow" style="gap:10px;align-items:center">
    <div class="lrow-ico" style="background:${i === 0 ? 'rgba(21,160,90,0.15)' : 'var(--row-hover)'};color:${i === 0 ? 'var(--primary)' : 'var(--text-dim)'};font-family:\'Space Grotesk\',sans-serif;font-weight:700;font-size:0.8rem;width:32px;height:32px;flex-shrink:0">#${i + 1}</div>
    <div class="lrow-main" style="min-width:0">
      <b style="font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block">${esc(t.name)}</b>
      <div style="margin-top:6px;height:4px;border-radius:3px;background:var(--border);overflow:hidden">
        <div style="height:100%;width:${Math.round(t.jobs / max * 100)}%;background:var(--primary);border-radius:3px;transition:width 0.6s ease"></div>
      </div>
    </div>
    <span style="font-size:0.8rem;font-weight:700;color:var(--primary);white-space:nowrap;min-width:46px;text-align:right;flex-shrink:0">${t.jobs} jobs</span>
  </div>`).join('');
  return `<div class="card kpi-chart-card">
    <div class="card-header"><span class="card-title">Top Technicians</span><span class="chip">${techs.length}</span></div>
    <div class="card-body"><div class="list" style="gap:6px">${rows}</div></div>
  </div>`;
}

// Full analytics hero: gauges + every summarisable metric as a chart.
export function renderDashboardHero(p) {
  const legend = `<span class="hb-legend"><span class="dn-li"><i style="background:var(--success)"></i>Resolved</span><span class="dn-li"><i style="background:var(--warning)"></i>Active</span></span>`;
  const hasTechs = p.topTechs && p.topTechs.length > 0;
  return `
    <div class="dash-kpis">
      ${kpiCard(p.resolutionRate, 'Resolution Rate', `of ${p.totalReq} total requests`, 'var(--success)', `${p.resolved}<small> resolved</small>`)}
      ${kpiCard(p.assignmentRate, 'Assignment Rate', `of ${p.totalReq} total requests`, 'var(--info)', `${p.assigned}<small> assigned</small>`)}
      ${kpiCard(p.collectionRate, 'Collection Rate', `of ${p.billed} bills raised`, 'var(--primary)', `${p.paid}<small> paid</small>`)}
      ${kpiCard(p.attendanceRate, 'Attendance', `of ${p.empTotal} employees`, 'var(--warning)', `${p.inCount}<small> in</small>`)}
    </div>
    <div class="dash-charts">
      ${chartCard('Service Requests Trend', areaChart(p.trendValues, p.trendLabels, 'var(--primary)'))}
      ${chartCard('By Category', donut(p.categorySegs && p.categorySegs.length ? p.categorySegs : p.statusSegs))}
    </div>
    <div class="dash-charts">
      ${chartCard("Today's Pipeline", vbars(p.pipeline))}
      ${chartCard('Alerts &amp; Health', vbars(p.alerts))}
    </div>
    ${(p.companies.length || hasTechs) ? `<div class="dash-charts">
      ${p.companies.length ? chartCard('Services by Company', companyBars(p.companies), legend) : ''}
      ${hasTechs ? techLeaderboard(p.topTechs) : ''}
    </div>` : ''}`;}

