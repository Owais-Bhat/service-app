import{g as e,m as t,t as n}from"./icons-j8TZxXx3.js";var r=window.location.hostname!==`localhost`&&window.location.hostname!==`127.0.0.1`?`/api`:`http://localhost:5000/api`,i=e=>`₹${Math.round(Number(e)||0).toLocaleString(`en-IN`)}`,a=e=>(e=Number(e)||0,e>=1e7?`₹`+(e/1e7).toFixed(e%1e7?1:0)+`Cr`:e>=1e5?`₹`+(e/1e5).toFixed(e%1e5?1:0)+`L`:e>=1e3?`₹`+(e/1e3).toFixed(e%1e3?1:0)+`k`:`₹`+Math.round(e)),o=e=>String(e??``).replace(/[&<>"]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`})[e]),s=e=>String(e||`?`).trim().split(/\s+/).slice(0,2).map(e=>e[0]).join(``).toUpperCase()||`?`,c=[`Jan`,`Feb`,`Mar`,`Apr`,`May`,`Jun`,`Jul`,`Aug`,`Sep`,`Oct`,`Nov`,`Dec`],l=e=>{let[t,n]=String(e).split(`-`).map(Number);return c[n-1]+(n===1?` '${String(t).slice(2)}`:``)},u=[`#10B981`,`#38BDF8`,`#A78BFA`,`#FBBF24`,`#F472B6`,`#34D399`,`#FB923C`,`#60A5FA`,`#94A3B8`];function d(e){let t=new Date,n=e=>e.toLocaleDateString(`en-CA`);if(e===`this-month`)return{from:n(new Date(t.getFullYear(),t.getMonth(),1)),to:n(t)};if(e===`last-month`){let e=new Date(t.getFullYear(),t.getMonth()-1,1),r=new Date(t.getFullYear(),t.getMonth(),0);return{from:n(e),to:n(r)}}return e===`this-year`?{from:n(new Date(t.getFullYear(),0,1)),to:n(t)}:{}}async function f(e){let t=new URLSearchParams;e.from&&t.set(`from`,e.from),e.to&&t.set(`to`,e.to);let n=await fetch(`${r}/finance/summary?${t.toString()}`,{headers:{Authorization:`Bearer ${localStorage.getItem(`auth_token`)||``}`}}),i=await n.json();if(!n.ok)throw Error(i.error||`Could not load finance summary`);return i}async function p(e,t){let n=await fetch(`${r}/ai/finance`,{method:`POST`,headers:{"Content-Type":`application/json`,Authorization:`Bearer ${localStorage.getItem(`auth_token`)||``}`},body:JSON.stringify({from:e.from||null,to:e.to||null,question:t||null})}),i=await n.json();if(!n.ok)throw Error(i.error||`AI request failed`);return i.answer||``}function m(e){return o(e).replace(/\*\*(.+?)\*\*/g,`<b>$1</b>`).replace(/^\s*[-*]\s+(.*)$/gm,`<li>$1</li>`).replace(/(<li>[\s\S]*?<\/li>)/g,`<ul style="margin:6px 0 6px 18px;">$1</ul>`).replace(/\n{2,}/g,`<br><br>`).replace(/\n/g,`<br>`)}function h(e){if(!e.length)return`<div class="fin-empty">No revenue history yet.</div>`;let t=e.length,n=Math.max(1,...e.map(e=>Math.max(e.billed,e.received))),r=e=>46+(t<=1?618/2:e/(t-1)*618),o=e=>220-e/n*204,s=t=>e.map((e,n)=>`${n?`L`:`M`}${r(n).toFixed(1)} ${o(e[t]).toFixed(1)}`).join(` `),c=`M${r(0).toFixed(1)} ${220 .toFixed(1)} `+e.map((e,t)=>`L${r(t).toFixed(1)} ${o(e.billed).toFixed(1)}`).join(` `)+` L${r(t-1).toFixed(1)} ${220 .toFixed(1)} Z`,u=[0,.25,.5,.75,1].map(e=>{let t=220-e*204;return`<line x1="46" y1="${t.toFixed(1)}" x2="664" y2="${t.toFixed(1)}" class="fin-grid"/>
      <text x="38" y="${(t+3).toFixed(1)}" class="fin-axis" text-anchor="end">${a(n*e)}</text>`}).join(``),d=e.map((e,n)=>t>8&&n%2?``:`<text x="${r(n).toFixed(1)}" y="242" class="fin-axis" text-anchor="middle">${l(e.month)}</text>`).join(``),f=e.map((e,t)=>`
    <circle cx="${r(t).toFixed(1)}" cy="${o(e.billed).toFixed(1)}" r="3.4" class="fin-dot" style="--c:var(--primary)"><title>${l(e.month)} · Billed ${i(e.billed)}</title></circle>
    <circle cx="${r(t).toFixed(1)}" cy="${o(e.received).toFixed(1)}" r="3.4" class="fin-dot" style="--c:var(--success)"><title>${l(e.month)} · Received ${i(e.received)}</title></circle>`).join(``);return`<svg viewBox="0 0 680 250" class="fin-svg">
    <defs><linearGradient id="finArea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--primary)" stop-opacity=".26"/><stop offset="1" stop-color="var(--primary)" stop-opacity="0"/>
    </linearGradient></defs>
    ${u}
    <path d="${c}" fill="url(#finArea)" class="fin-area"/>
    <path d="${s(`billed`)}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linejoin="round" class="fin-line"/>
    <path d="${s(`received`)}" fill="none" stroke="var(--success)" stroke-width="2.5" stroke-linejoin="round" class="fin-line"/>
    ${f}${d}
  </svg>`}function g(e,t,n,r=168,i=26){let a=e.reduce((e,t)=>e+t.value,0),o=(r-i)/2,s=r/2,c=2*Math.PI*o,l=0;return`<svg viewBox="0 0 ${r} ${r}" width="${r}" height="${r}" class="fin-donut">
    ${a>0?e.filter(e=>e.value>0).map(e=>{let t=e.value/a,n=t*c,r=-l*c;return l+=t,`<circle cx="${s}" cy="${s}" r="${o}" fill="none" stroke="${e.color}" stroke-width="${i}"
      stroke-dasharray="${n.toFixed(2)} ${(c-n).toFixed(2)}" stroke-dashoffset="${r.toFixed(2)}"
      transform="rotate(-90 ${s} ${s})" class="fin-arc"/>`}).join(``):`<circle cx="${s}" cy="${s}" r="${o}" fill="none" stroke="var(--border)" stroke-width="${i}"/>`}
    <text x="50%" y="47%" text-anchor="middle" class="fin-donut-top">${t||``}</text>
    <text x="50%" y="61%" text-anchor="middle" class="fin-donut-sub">${n||``}</text>
  </svg>`}function _(e){return`<div class="fin-legend">${e.filter(e=>e.value>0).map(e=>`<span class="fin-leg"><i style="background:${e.color}"></i>${o(e.label)} <b>${i(e.value)}</b></span>`).join(``)||`<span class="fin-leg" style="color:var(--text-dim)">No data</span>`}</div>`}function v(e,t,n){let r=137/2,i=2*Math.PI*r,a=i*(1-Math.max(0,Math.min(100,e))/100);return`<svg viewBox="0 0 150 150" width="150" height="150" class="fin-gauge">
    <circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--border)" stroke-width="13"/>
    <circle class="fin-ring-fg" cx="75" cy="75" r="${r}" fill="none" stroke="${n}" stroke-width="13" stroke-linecap="round"
      stroke-dasharray="${i.toFixed(1)}" stroke-dashoffset="${i.toFixed(1)}" data-target="${a.toFixed(1)}" transform="rotate(-90 75 75)"/>
    <text x="50%" y="46%" text-anchor="middle" class="fin-gauge-num">${Math.round(e)}%</text>
    <text x="50%" y="62%" text-anchor="middle" class="fin-gauge-lbl">${o(t)}</text>
  </svg>`}function y(e,t,n=!0){if(t==null)return``;if(t===0)return e>0?`<span class="fin-delta good">▲ new</span>`:``;let r=(e-t)/Math.abs(t)*100;if(Math.abs(r)<.5)return`<span class="fin-delta flat">▬ 0%</span>`;let i=r>0;return`<span class="fin-delta ${i===n?`good`:`bad`}">${i?`▲`:`▼`} ${Math.abs(r).toFixed(0)}%</span>`}function b(e,t,n,r,i){return`<div class="fin-kpi fin-in">
    <div class="fin-kpi-top"><span class="fin-kpi-label">${e}</span>${r||``}</div>
    <div class="fin-kpi-value" style="color:${n}">${t}</div>
    ${i?`<div class="fin-kpi-hint">${i}</div>`:``}
  </div>`}function x(e){e.querySelectorAll(`.fin-bar-fill`).forEach(e=>{let t=e.dataset.w;e.style.width=`0%`,requestAnimationFrame(()=>{e.style.width=t+`%`})})}function S(e){e.querySelectorAll(`.fin-ring-fg`).forEach(e=>requestAnimationFrame(()=>{e.style.strokeDashoffset=e.dataset.target}))}function C(e){e.querySelectorAll(`.fin-line`).forEach(e=>{try{let t=e.getTotalLength();e.style.transition=`none`,e.style.strokeDasharray=t,e.style.strokeDashoffset=t,requestAnimationFrame(()=>{e.style.transition=`stroke-dashoffset 1.2s ease`,e.style.strokeDashoffset=`0`})}catch{}})}function w(e){let t=e.totals,r=[],a=t.billed>0?t.received/t.billed*100:0;if(r.push({tone:a>=80?`good`:a>=60?`warn`:`bad`,icon:n.rupee,title:`Collection rate ${a.toFixed(0)}%`,text:a>=80?`Healthy — most billed work is getting paid on time.`:`${i(t.pending)} billed is still uncollected. Prioritise chasing the oldest invoices.`}),e.aging[`31+`]>0&&r.push({tone:`bad`,icon:n.alert,title:`${i(e.aging[`31+`])} overdue 31+ days`,text:`This is your highest-risk money. Call or message these customers this week before it ages further.`}),e.trend&&e.trend.length>=2){let t=e.trend[e.trend.length-2].billed,i=e.trend[e.trend.length-1].billed;if(t>0){let e=(i-t)/t*100;r.push({tone:e>=0?`good`:`warn`,icon:n.dashboard,title:`Revenue ${e>=0?`up`:`down`} ${Math.abs(e).toFixed(0)}% vs last month`,text:e>=0?`Momentum is positive — keep lead flow and follow-ups consistent to compound it.`:`Revenue dipped month-on-month. Review where leads dropped and re-engage past customers.`})}}if(e.byCategory.length){let t=e.byCategory.reduce((e,t)=>e+t.revenue,0)||1,a=e.byCategory[0],s=a.revenue/t*100;r.push({tone:`good`,icon:n.box,title:`${o(a.category)} is your top earner`,text:`${i(a.revenue)} (${s.toFixed(0)}% of service revenue). Build packages/upsells around it to grow margin.`})}let s=e.byTechnician.filter(e=>e.name!==`Unassigned`);if(s.length){let e=[...s].sort((e,t)=>t.received-e.received)[0];r.push({tone:`good`,icon:n.user,title:`${o(e.name)} collected the most`,text:`${i(e.received)} across ${e.jobs} jobs. Recognise top performers and share their approach with the team.`})}return t.cashInHand>0&&r.push({tone:`warn`,icon:n.card,title:`${i(t.cashInHand)} cash not deposited`,text:`Staff are still holding collected cash. Ask them to submit it to cut leakage and reconcile faster.`}),r.push({tone:`good`,icon:n.receipt,title:`Average ticket ${i(t.avgTicket)}`,text:`Lift this with service bundles, annual maintenance contracts (AMC), and premium installs.`}),r}function T(e){if(!e.length)return`<div class="fin-empty">No technician data in this period.</div>`;let t=Math.max(1,...e.map(e=>e.billed));return e.slice(0,8).map((e,n)=>{let r=Math.max(2,e.billed/t*100),a=e.billed>0?e.received/e.billed*100:0;return`<div class="fin-tech fin-in" style="--d:${(n*.05).toFixed(2)}s">
      <div class="fin-tech-top">
        <span class="fin-ava">${s(e.name)}</span>
        <b class="fin-tech-name">${o(e.name)}</b>
        <span class="fin-tech-jobs">${e.jobs} job${e.jobs===1?``:`s`}</span>
        <span class="fin-tech-amt"><b>${i(e.received)}</b><small>of ${i(e.billed)}</small></span>
      </div>
      <div class="fin-tech-bar"><div class="fin-bar-fill fin-tech-bill" data-w="${r.toFixed(1)}"><div class="fin-tech-rec" style="width:${a.toFixed(1)}%"></div></div></div>
    </div>`}).join(``)}function E(e){let t=[[`0–7 days`,e.aging[`0-7`],`var(--success)`],[`8–30 days`,e.aging[`8-30`],`var(--warning)`],[`31+ days`,e.aging[`31+`],`var(--danger)`]],n=t.reduce((e,t)=>e+t[1],0)||1,r=t.map(([,e,t])=>e>0?`<div class="fin-stack-seg" style="width:${(e/n*100).toFixed(1)}%;background:${t}">${e/n>.1?a(e):``}</div>`:``).join(``),o=t.map(([e,t,n])=>`<span class="fin-leg"><i style="background:${n}"></i>${e} <b>${i(t)}</b></span>`).join(``);return`<div class="fin-stack">${r||`<div class="fin-stack-seg" style="width:100%;background:var(--bg-soft);color:var(--text-dim)">Nothing pending 🎉</div>`}</div><div class="fin-legend">${o}</div>`}function D(e,t,n){return`
    <div class="card fin-in" style="margin-bottom:20px;">
      <div class="card-header"><span class="card-title">${e}</span></div>
      <div class="table-wrap"><table>
        <thead><tr>${t.map(e=>`<th${e.right?` style="text-align:right"`:``}>${e.label}</th>`).join(``)}</tr></thead>
        <tbody>${n||`<tr><td colspan="${t.length}" style="text-align:center;padding:24px;color:var(--text-dim)">No data</td></tr>`}</tbody>
      </table></div>
    </div>`}function O(e){let t=[`Finance Report`,`Range,${e.range.from||`All time`},${e.range.to||``}`,``,`Metric,Value`],n=e.totals;return[[`Total Billed`,n.billed],[`Total Received`,n.received],[`Pending`,n.pending],[`Collection Rate %`,n.billed?Math.round(n.received/n.billed*100):0],[`Bills`,n.billsCount],[`Paid Bills`,n.paidCount],[`Avg Ticket`,Math.round(n.avgTicket)],[`GST Collected`,n.gst],[`Discounts Given`,n.discounts],[`Cash In Hand (unsubmitted)`,n.cashInHand]].forEach(([e,n])=>t.push(`${e},${n}`)),t.push(``,`Technician,Billed,Received,Jobs`),e.byTechnician.forEach(e=>t.push(`"${e.name}",${Math.round(e.billed)},${Math.round(e.received)},${e.jobs}`)),t.push(``,`Month,Billed,Received`),e.byMonth.forEach(e=>t.push(`${e.month},${Math.round(e.billed)},${Math.round(e.received)}`)),t.push(``,`Category,Revenue,Items`),e.byCategory.forEach(e=>t.push(`"${e.category}",${Math.round(e.revenue)},${e.items}`)),t.join(`
`)}function k(t){let n=t.totals,r=n.billed?Math.round(n.received/n.billed*100):0,a=(e,t)=>`<tr><td>${o(e)}</td><td style="text-align:right">${o(t)}</td></tr>`,s=window.open(``,`_blank`);if(!s){e(`Allow pop-ups to export PDF`,`info`);return}s.document.write(`<!doctype html><html><head><title>Finance Report</title><meta charset="utf-8">
    <style>
      body{font-family:Arial,sans-serif;color:#0f172a;padding:32px;max-width:820px;margin:auto;}
      h1{color:#064e3b;margin:0 0 4px;} .sub{color:#64748b;font-size:13px;margin-bottom:20px;}
      h2{font-size:15px;border-bottom:2px solid #10b981;padding-bottom:4px;margin:22px 0 8px;}
      table{width:100%;border-collapse:collapse;font-size:13px;} td,th{padding:6px 8px;border-bottom:1px solid #eee;text-align:left;}
      th{color:#064e3b;text-transform:uppercase;font-size:11px;} .tot{font-weight:800;color:#10b981;}
    </style></head><body>
    <h1>Networking Experts — Finance Report</h1>
    <div class="sub">Period: ${o(t.range.from||`All time`)} ${t.range.to?`→ `+o(t.range.to):``} &nbsp;·&nbsp; Generated ${new Date().toLocaleString(`en-IN`)}</div>
    <h2>Summary</h2>
    <table>
      ${a(`Total Billed`,i(n.billed))}${a(`Received`,i(n.received))}${a(`Collection Rate`,r+`%`)}${a(`Pending`,i(n.pending))}
      ${a(`Bills (paid/total)`,`${n.paidCount} / ${n.billsCount}`)}${a(`Average Ticket`,i(n.avgTicket))}
      ${a(`GST Collected`,i(n.gst))}${a(`Discounts Given`,i(n.discounts))}${a(`Cash In Hand`,i(n.cashInHand))}
      <tr class="tot"><td>Net Received</td><td style="text-align:right">${o(i(n.received))}</td></tr>
    </table>
    <h2>By Technician</h2>
    <table><thead><tr><th>Technician</th><th>Jobs</th><th>Billed</th><th>Received</th></tr></thead><tbody>
      ${t.byTechnician.map(e=>`<tr><td>${o(e.name)}</td><td>${e.jobs}</td><td>${o(i(e.billed))}</td><td>${o(i(e.received))}</td></tr>`).join(``)||`<tr><td colspan="4">No data</td></tr>`}
    </tbody></table>
    <h2>By Service Category</h2>
    <table><thead><tr><th>Category</th><th>Items</th><th>Revenue</th></tr></thead><tbody>
      ${t.byCategory.map(e=>`<tr><td>${o(e.category)}</td><td>${e.items}</td><td>${o(i(e.revenue))}</td></tr>`).join(``)||`<tr><td colspan="3">No data</td></tr>`}
    </tbody></table>
    <h2>Revenue by Month</h2>
    <table><thead><tr><th>Month</th><th>Billed</th><th>Received</th></tr></thead><tbody>
      ${t.byMonth.map(e=>`<tr><td>${e.month}</td><td>${o(i(e.billed))}</td><td>${o(i(e.received))}</td></tr>`).join(``)||`<tr><td colspan="3">No data</td></tr>`}
    </tbody></table>
    <script>window.onload=()=>window.print();<\/script></body></html>`),s.document.close()}async function A(r){t(r);let s=`this-month`,c=null,l=async()=>{t(r);let A;try{A=await f(d(s))}catch(e){r.innerHTML=`<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--danger)">${o(e.message)}</div></div>`;return}c=A;let j=A.totals,M=A.previous,N=j.billed>0?j.received/j.billed*100:0,P=M&&M.billed>0?M.received/M.billed*100:null,F=[...A.byCategory].sort((e,t)=>t.revenue-e.revenue),I=F.slice(0,8).map((e,t)=>({label:e.category,value:e.revenue,color:u[t%u.length]})),L=F.slice(8).reduce((e,t)=>e+t.revenue,0);L>0&&I.push({label:`Other`,value:L,color:`var(--text-dim)`});let R=I.reduce((e,t)=>e+t.value,0),z=[{label:`Online`,value:A.byMethod.online,color:`var(--primary)`},{label:`Cash`,value:A.byMethod.cash,color:`var(--success)`},{label:`Unspecified`,value:A.byMethod.unknown,color:`var(--text-dim)`}],B=w(A);r.innerHTML=`
      <div class="page-header fin-in" style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div><h1 class="fin-h1">${n.rupee}<span>Finance &amp; Growth</span></h1><p style="color:var(--text-soft);margin:4px 0 0;">Track revenue, collections and what to do next to grow the business.</p></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <select id="fin-range" class="fin-select">
            <option value="this-month" ${s===`this-month`?`selected`:``}>This Month</option>
            <option value="last-month" ${s===`last-month`?`selected`:``}>Last Month</option>
            <option value="this-year" ${s===`this-year`?`selected`:``}>This Year</option>
            <option value="all" ${s===`all`?`selected`:``}>All Time</option>
          </select>
          <button class="btn btn-secondary" id="fin-pdf">${n.receipt||``}<span>PDF</span></button>
          <button class="btn btn-secondary" id="fin-csv">${n.download||``}<span>CSV</span></button>
        </div>
      </div>

      <div class="fin-kpis">
        ${b(`Total Billed`,i(j.billed),`var(--primary)`,y(j.billed,M?.billed,!0),M?`vs ${a(M.billed)} prev`:`${j.billsCount} bills`)}
        ${b(`Received`,i(j.received),`var(--success)`,y(j.received,M?.received,!0),M?`vs ${a(M.received)} prev`:`collected`)}
        ${b(`Collection Rate`,`${N.toFixed(0)}%`,N>=80?`var(--success)`:N>=60?`var(--warning)`:`var(--danger)`,y(N,P,!0),`billed → paid`)}
        ${b(`Pending`,i(j.pending),`var(--warning)`,y(j.pending,M?M.billed-M.received:null,!1),`to collect`)}
        ${b(`Avg Ticket`,i(j.avgTicket),`var(--text)`,null,`${j.paidCount}/${j.billsCount} paid`)}
      </div>

      <div class="card fin-in" style="margin-bottom:20px;">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
          <span class="card-title">Revenue Trend — last 12 months</span>
          <span class="fin-chart-legend"><span><i style="background:var(--primary)"></i>Billed</span><span><i style="background:var(--success)"></i>Received</span></span>
        </div>
        <div class="card-body">${h(A.trend||[])}</div>
      </div>

      <div class="fin-grid-3">
        <div class="card fin-in"><div class="card-header"><span class="card-title">Revenue by Category</span></div>
          <div class="card-body fin-donut-wrap">${g(I,a(R),`services`)}${_(I)}</div></div>
        <div class="card fin-in"><div class="card-header"><span class="card-title">Payment Method</span></div>
          <div class="card-body fin-donut-wrap">${g(z,a(A.byMethod.online+A.byMethod.cash+A.byMethod.unknown),`received`)}${_(z)}</div></div>
        <div class="card fin-in"><div class="card-header"><span class="card-title">Business Health</span></div>
          <div class="card-body" style="text-align:center;">
            ${v(N,`Collected`,N>=80?`var(--success)`:N>=60?`var(--warning)`:`var(--danger)`)}
            <div class="fin-health-row"><span>Received</span><b style="color:var(--success)">${i(j.received)}</b></div>
            <div class="fin-health-row"><span>Still pending</span><b style="color:var(--warning)">${i(j.pending)}</b></div>
            <div class="fin-health-row"><span>GST collected</span><b>${i(j.gst)}</b></div>
          </div></div>
      </div>

      <div class="card fin-in" style="margin-bottom:20px;"><div class="card-header"><span class="card-title">Receivables Aging — how old is the pending money</span></div>
        <div class="card-body">${E(A)}</div></div>

      <div class="fin-grid-2">
        <div class="card fin-in fin-advisor"><div class="card-header"><span class="card-title">📈 Growth Advisor — what to do next</span></div>
          <div class="card-body">${B.map(e=>`
            <div class="fin-insight ${e.tone}">
              <span class="fin-insight-ico">${e.icon||n.dashboard}</span>
              <div><b>${e.title}</b><p>${e.text}</p></div>
            </div>`).join(``)}</div></div>

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
        <div class="card-body">${T(A.byTechnician)}</div></div>

      ${D(`By Service Category`,[{label:`Category`},{label:`Items`,right:!0},{label:`Revenue`,right:!0}],A.byCategory.map(e=>`<tr><td>${o(e.category)}</td><td style="text-align:right">${e.items}</td><td style="text-align:right">${i(e.revenue)}</td></tr>`).join(``))}

      ${D(`By Company`,[{label:`Company`},{label:`Billed`,right:!0},{label:`Received`,right:!0}],A.byCompany.map(e=>`<tr><td>${o(e.company)}</td><td style="text-align:right">${i(e.billed)}</td><td style="text-align:right;color:var(--success)">${i(e.received)}</td></tr>`).join(``))}
    `,x(r),S(r),C(r),r.querySelector(`#fin-range`).onchange=e=>{s=e.target.value,l()};let V=r.querySelector(`#fin-ai-out`),H=async(e,t)=>{let n=e.textContent;e.disabled=!0,e.textContent=`Thinking…`,V.innerHTML=`<span class="fin-ai-loading">Analysing your numbers…</span>`;try{V.innerHTML=m(await p(d(s),t))}catch(e){V.innerHTML=`<span style="color:var(--danger);">${o(e.message)}</span>`}finally{e.disabled=!1,e.textContent=n}};r.querySelector(`#fin-ai-summary`).onclick=e=>H(e.currentTarget,null),r.querySelector(`#fin-ai-ask`).onclick=t=>{let n=r.querySelector(`#fin-ai-q`).value.trim();if(!n)return e(`Type a question first`,`info`);H(t.currentTarget,n)},r.querySelector(`#fin-ai-q`).addEventListener(`keydown`,e=>{e.key===`Enter`&&r.querySelector(`#fin-ai-ask`).click()}),r.querySelector(`#fin-pdf`).onclick=()=>{c&&k(c)},r.querySelector(`#fin-csv`).onclick=()=>{if(!c)return;let t=new Blob([O(c)],{type:`text/csv;charset=utf-8;`}),n=URL.createObjectURL(t),r=document.createElement(`a`);r.href=n,r.download=`finance-report-${s}.csv`,document.body.appendChild(r),r.click(),r.remove(),URL.revokeObjectURL(n),e(`CSV exported`,`success`)}};await l()}export{A as renderFinanceReportTab};