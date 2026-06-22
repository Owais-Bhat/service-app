var e=e=>String(e??``).replace(/[&<>"]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`})[e]);function t(e){return Math.max(0,Math.min(100,Number(e)||0))}function n(e,n,r=92,i=9,a=`%`){let o=t(e),s=(r-i)/2,c=r/2,l=e=>{let t=(e-90)*Math.PI/180;return[c+s*Math.cos(t),c+s*Math.sin(t)]},u=(e,t)=>{let[n,r]=l(e),[i,a]=l(t),o=+(t-e>180);return`M ${n.toFixed(2)} ${r.toFixed(2)} A ${s} ${s} 0 ${o} 1 ${i.toFixed(2)} ${a.toFixed(2)}`},d=135+Math.max(o/100*270,.6);return`<svg width="${r}" height="${r}" viewBox="0 0 ${r} ${r}" class="kpi-gauge-svg" role="img" aria-label="${Math.round(o)} percent">
    <path d="${u(135,405)}" fill="none" stroke="var(--panel-3, var(--border))" stroke-width="${i}" stroke-linecap="round"/>
    ${o>0?`<path d="${u(135,d)}" fill="none" stroke="${n}" stroke-width="${i}" stroke-linecap="round" class="kpi-gauge-arc"/>`:``}
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" class="kpi-gauge-txt">${Math.round(o)}<tspan class="kpi-gauge-suffix">${a}</tspan></text>
  </svg>`}function r(e,r,i,a,o){let s=o??`${Math.round(t(e))}<small>%</small>`;return`<div class="card kpi kpi-card">
    ${n(e,a)}
    <div class="kpi-info">
      <div class="kpi-label">${r}</div>
      <div class="kpi-value">${s}</div>
      <div class="kpi-sub">${i}</div>
    </div>
  </div>`}function i(t,n,r=`var(--primary)`){let i=t.length;if(i<2)return a(t,n,r);let o={l:8,r:8,t:14,b:30},s=540-o.l-o.r,c=148-o.t-o.b,l=Math.max(1,...t),u=t.map((e,t)=>[o.l+t/(i-1)*s,o.t+c-e/l*c]),d=`M ${u[0][0].toFixed(1)},${u[0][1].toFixed(1)}`;for(let e=1;e<u.length;e++){let[t,n]=u[e-1],[r,i]=u[e],a=((t+r)/2).toFixed(1);d+=` C ${a},${n.toFixed(1)} ${a},${i.toFixed(1)} ${r.toFixed(1)},${i.toFixed(1)}`}let f=(o.t+c).toFixed(1),p=`${d} L ${u[u.length-1][0].toFixed(1)},${f} L ${u[0][0].toFixed(1)},${f} Z`,m=`acg`+Math.abs(r.charCodeAt(0)||0),h=u.map(([e,t])=>`<circle cx="${e.toFixed(1)}" cy="${t.toFixed(1)}" r="3.5" fill="${r}" stroke="#fff" stroke-width="2"/>`).join(``),g=u.map(([t],r)=>`<text x="${t.toFixed(1)}" y="142" text-anchor="middle" class="ac-lbl">${e(n[r]||``)}</text>`).join(``);return`<svg viewBox="0 0 540 148" style="width:100%;height:148px;overflow:visible">
    <defs><linearGradient id="${m}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${r}" stop-opacity="0.20"/>
      <stop offset="90%" stop-color="${r}" stop-opacity="0.02"/>
    </linearGradient></defs>
    <path d="${p}" fill="url(#${m})"/>
    <path d="${d}" fill="none" stroke="${r}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    ${h}${g}
  </svg>`}function a(t,n,r){let i=Array.isArray(n)?t.map((e,t)=>({label:n[t],value:e,color:r})):t,a=Math.max(1,...i.map(e=>e.value));return`<div class="bc">${i.map(t=>`<div class="bc-col">
      <div class="bc-bar" style="height:${Math.round(t.value/a*100)}%;background:${t.color}"><span>${t.value}</span></div>
      <div class="bc-lbl">${e(t.label)}</div>
    </div>`).join(``)}</div>`}function o(t){let n=Math.max(1,...t.map(e=>e[1].total));return`<div class="hb">${t.map(([t,r])=>{let i=Math.round(r.resolved/n*100),a=Math.round(r.active/n*100);return`<div class="hb-row">
      <div class="hb-name" title="${e(t)}">${e(t)}</div>
      <div class="hb-track">
        <div class="hb-seg" style="width:${i}%;background:var(--success)" title="Resolved: ${r.resolved}"></div>
        <div class="hb-seg" style="width:${a}%;background:var(--warning)" title="Active: ${r.active}"></div>
      </div>
      <div class="hb-val">${r.total}</div>
    </div>`}).join(``)}</div>`}function s(t,n=168,r=26){let i=t.reduce((e,t)=>e+t.value,0)||0,a=(n-r)/2,o=2*Math.PI*a,s=n/2,c=0;return`<div class="dn-wrap">
    <div class="dn-fig">
      <svg width="${n}" height="${n}" viewBox="0 0 ${n} ${n}" class="dn-svg">${i===0?`<circle cx="${s}" cy="${s}" r="${a}" fill="none" stroke="var(--panel-3, var(--border))" stroke-width="${r}"/>`:`<circle cx="${s}" cy="${s}" r="${a}" fill="none" stroke="var(--panel-3, var(--border))" stroke-width="${r}"/>`+t.filter(e=>e.value>0).map(e=>{let t=e.value/i,n=o*t,l=-o*c;return c+=t,`<circle cx="${s}" cy="${s}" r="${a}" fill="none" stroke="${e.color}" stroke-width="${r}"
          stroke-dasharray="${n.toFixed(1)} ${(o-n).toFixed(1)}" stroke-dashoffset="${l.toFixed(1)}" transform="rotate(-90 ${s} ${s})"/>`}).join(``)}</svg>
      <div class="dn-center"><b>${i}</b><span>total</span></div>
    </div>
    <div class="dn-legend">${t.map(t=>`<span class="dn-li"><i style="background:${t.color}"></i>${e(t.label)} · <b>${t.value}</b></span>`).join(``)}</div>
  </div>`}function c(e,t,n=``){return`<div class="card kpi-chart-card">
    <div class="card-header"><span class="card-title">${e}</span>${n}</div>
    <div class="card-body">${t}</div>
  </div>`}function l(t){if(!t||!t.length)return``;let n=Math.max(1,...t.map(e=>e.jobs)),r=t.map((t,r)=>`<div class="lrow" style="gap:10px;align-items:center">
    <div class="lrow-ico" style="background:${r===0?`rgba(21,160,90,0.15)`:`var(--row-hover)`};color:${r===0?`var(--primary)`:`var(--text-dim)`};font-family:\'Space Grotesk\',sans-serif;font-weight:700;font-size:0.8rem;width:32px;height:32px;flex-shrink:0">#${r+1}</div>
    <div class="lrow-main" style="min-width:0">
      <b style="font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block">${e(t.name)}</b>
      <div style="margin-top:6px;height:4px;border-radius:3px;background:var(--border);overflow:hidden">
        <div style="height:100%;width:${Math.round(t.jobs/n*100)}%;background:var(--primary);border-radius:3px;transition:width 0.6s ease"></div>
      </div>
    </div>
    <span style="font-size:0.8rem;font-weight:700;color:var(--primary);white-space:nowrap;min-width:46px;text-align:right;flex-shrink:0">${t.jobs} jobs</span>
  </div>`).join(``);return`<div class="card kpi-chart-card">
    <div class="card-header"><span class="card-title">Top Technicians</span><span class="chip">${t.length}</span></div>
    <div class="card-body"><div class="list" style="gap:6px">${r}</div></div>
  </div>`}function u(e){let t=e.topTechs&&e.topTechs.length>0;return`
    <div class="dash-kpis">
      ${r(e.resolutionRate,`Resolution Rate`,`of ${e.totalReq} total requests`,`var(--success)`,`${e.resolved}<small> resolved</small>`)}
      ${r(e.assignmentRate,`Assignment Rate`,`of ${e.totalReq} total requests`,`var(--info)`,`${e.assigned}<small> assigned</small>`)}
      ${r(e.collectionRate,`Collection Rate`,`of ${e.billed} bills raised`,`var(--primary)`,`${e.paid}<small> paid</small>`)}
      ${r(e.attendanceRate,`Attendance`,`of ${e.empTotal} employees`,`var(--warning)`,`${e.inCount}<small> in</small>`)}
    </div>
    <div class="dash-charts">
      ${c(`Service Requests Trend`,i(e.trendValues,e.trendLabels,`var(--primary)`))}
      ${c(`By Category`,s(e.categorySegs&&e.categorySegs.length?e.categorySegs:e.statusSegs))}
    </div>
    <div class="dash-charts">
      ${c(`Today's Pipeline`,a(e.pipeline))}
      ${c(`Alerts &amp; Health`,a(e.alerts))}
    </div>
    ${e.companies.length||t?`<div class="dash-charts">
      ${e.companies.length?c(`Services by Company`,o(e.companies),`<span class="hb-legend"><span class="dn-li"><i style="background:var(--success)"></i>Resolved</span><span class="dn-li"><i style="background:var(--warning)"></i>Active</span></span>`):``}
      ${t?l(e.topTechs):``}
    </div>`:``}`}export{u as n,r as t};