import{a as e,m as t,o as n,t as r}from"./icons-j8TZxXx3.js";import{r as i}from"./index-BO2-RaLs.js";var a=e=>`₹${Math.round(Number(e)||0).toLocaleString(`en-IN`)}`,o=e=>Number(e)||0;function s(e){return String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e])}function c(e){if(!e)return``;let t=String(e).trim(),n=/^(\d{4}-\d{2}-\d{2})/.exec(t);if(n)return n[1];let r=new Date(t.replace(` `,`T`));return Number.isNaN(r.getTime())?``:r.toLocaleDateString(`en-CA`)}function l(e){let t=new Date,n=t.toLocaleDateString(`en-CA`),r=new Date(t);if(e===`daily`)return{from:n,to:n};if(e===`weekly`)r.setDate(t.getDate()-6);else if(e===`monthly`)r.setMonth(t.getMonth(),1);else if(e===`yearly`)r.setMonth(0,1);else return{from:``,to:``};return{from:r.toLocaleDateString(`en-CA`),to:n}}function u(e){return c(e.payment_received_at||e.cash_collected_at||e.bill_generated_at||e.updated_at||e.created_at)}function d(e,t){return e.filter(e=>{let n=u(e);return!(t.from&&n&&n<t.from||t.to&&n&&n>t.to||t.employee&&t.employee!==`all`&&e.assigned_employee_id!==t.employee)})}function f(e){let t=o(e.bill_total),n=o(e.gst_amount),r=o(e.platform_fee),i=o(e.transport_fee),a=o(e.discount_amount),s=o(e.extra_cost),c=Math.max(0,t-n),l=Math.max(0,c-s-r-i+a),u=l+s,d=u+i;return{net:t,gst:n,gstRate:c>0?Math.round(n/c*100):0,platform:r,travel:i,discount:a,extra:s,taxable:c,servicesSubtotal:l,service:u,gross:d}}var p=null;async function m(){if(p)return p;let{data:e}=await i.from(`service_pricing`).select(`id,name,cost`),t=new Map;return(e||[]).forEach(e=>t.set(String(e.id),{name:e.name,cost:Number(e.cost)||0})),p=t,t}var h=(e,t,n={})=>`<div style="display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid var(--border);font-size:.92rem;${n.total?`font-weight:800;border-bottom:none;border-top:2px solid var(--border);margin-top:4px;padding-top:12px;`:``}${n.color?`color:${n.color};`:``}"><span>${e}</span><span>${t}</span></div>`;async function g(e,{admin:t}){let r=document.createElement(`div`);r.className=`modal-overlay`,r.innerHTML=`
    <div class="modal" style="max-width:520px">
      <div class="modal-header">
        <span class="modal-title">Bill Detail — ${s(e.ticket_no||``)}</span>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body" id="bill-detail-body"><div style="text-align:center;padding:34px;color:var(--text-dim)">Loading…</div></div>
    </div>`,document.body.appendChild(r);let c=()=>r.remove();r.querySelector(`.modal-close`).onclick=c,r.addEventListener(`click`,e=>{e.target===r&&c()});let[{data:l},d]=await Promise.all([i.from(`inquiry_services`).select(`*`).eq(`inquiry_id`,e.id),m()]),p=(l||[]).map(e=>d.get(String(e.service_id))).filter(Boolean),g=f(e),_=o(e.extra_cost),v=p.length?p.map(e=>h(s(e.name||`Service`),a(e.cost))).join(``):h(`<span style="color:var(--text-dim)">Service charge</span>`,a(Math.max(0,g.service-_))),y=r.querySelector(`#bill-detail-body`);y.innerHTML=`
    <div style="margin-bottom:12px;">
      <b>${s(e.full_name||`Client`)}</b><br>
      <small style="color:var(--text-dim)">${s(e.service_item||``)}${u(e)?` · `+n(u(e)):``}</small>
    </div>
    <div style="text-transform:uppercase;letter-spacing:.05em;font-size:.72rem;font-weight:700;color:var(--text-dim);margin-bottom:4px;">Services</div>
    ${v}
    ${_>0?h(`Additional charges${e.extra_cost_reason?` (${s(e.extra_cost_reason)})`:``}`,a(_)):``}
    ${t&&g.platform>0?h(`Platform fee`,a(g.platform)):``}
    ${h(`Travel`,a(g.travel))}
    ${t?(g.discount>0?h(`Discount given (your profit cut)`,`-${a(g.discount)}`,{color:`var(--danger)`}):``)+h(`Taxable`,a(g.taxable))+(g.gst>0?h(`GST${g.gstRate?` (${g.gstRate}%)`:``}`,a(g.gst)):``)+h(`Net collected`,a(g.net),{total:!0})+h(`<span style="color:var(--text-dim)">Payment mode</span>`,e.payment_method===`cash`?`Cash`:`Online`):h(`Total`,a(g.service+g.travel),{total:!0})}
  `}function _(e){return e.reduce((e,t)=>{let n=f(t);return e.service+=n.service,e.travel+=n.travel,e.total+=n.service+n.travel,e.count+=1,e},{service:0,travel:0,total:0,count:0})}function v(e){return e.reduce((e,t)=>{let n=f(t);return e.service+=n.service,e.travel+=n.travel,e.platform+=n.platform,e.gst+=n.gst,e.discount+=n.discount,e.net+=n.net,e.count+=1,e},{service:0,travel:0,platform:0,gst:0,discount:0,net:0,count:0})}function y(e){return`
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Ticket</th><th>Customer</th><th>Service</th><th>Travel</th><th>Total</th></tr></thead>
        <tbody>
          ${e.length===0?`<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No collections found</td></tr>`:e.map(e=>{let t=f(e);return`
            <tr class="coll-row" data-id="${s(e.id)}" style="cursor:pointer;">
              <td><small style="color:var(--text-dim)">${u(e)?n(u(e)):`-`}</small></td>
              <td><code style="font-size:0.75rem;color:var(--primary)">${s(e.ticket_no||`-`)}</code></td>
              <td><b>${s(e.full_name||`Client`)}</b><br/><small style="color:var(--text-dim)">${s(e.service_item||``)}</small></td>
              <td>${a(t.service)}</td>
              <td>${a(t.travel)}</td>
              <td><b>${a(t.service+t.travel)}</b></td>
            </tr>`}).join(``)}
        </tbody>
      </table>
    </div>
  `}async function b(e){t(e);let{data:{user:n}}=await i.auth.getUser();if(!n){e.innerHTML=`<p>Please sign in.</p>`;return}let{data:r}=await i.from(`inquiries`).select(`*`).eq(`assigned_employee_id`,n.id).eq(`payment_status`,`paid`).order(`payment_received_at`,{ascending:!1}),s=Array.isArray(r)?r.filter(e=>o(e.bill_total)>0):[],c={...l(e.dataset.period||`monthly`)};c.from=e.dataset.from||c.from,c.to=e.dataset.to||c.to;let u=d(s,c),f=_(u),p=e.dataset.period||`monthly`;e.innerHTML=`
    <div class="page-header collection-header">
      <div>
        <h1>My Collections</h1>
        <p>Service charges and travel you have collected</p>
      </div>
    </div>

    <div class="coll-filter-bar">
      <div class="coll-filter-group">
        <label class="coll-filter-label">Period</label>
        <select id="coll-period" class="coll-select">
          <option value="daily"   ${p===`daily`?`selected`:``}>Today</option>
          <option value="weekly"  ${p===`weekly`?`selected`:``}>This Week</option>
          <option value="monthly" ${p===`monthly`?`selected`:``}>This Month</option>
          <option value="yearly"  ${p===`yearly`?`selected`:``}>This Year</option>
          <option value="custom"  ${p===`custom`?`selected`:``}>Custom Range</option>
          <option value="all"     ${p===`all`?`selected`:``}>All Time</option>
        </select>
      </div>
      <div class="coll-filter-group coll-date-wrap" id="coll-custom-dates" style="${p===`custom`?``:`display:none`}">
        <label class="coll-filter-label">From</label>
        <input type="date" id="coll-from" class="coll-date-input" value="${c.from}">
        <label class="coll-filter-label" style="margin-left:8px;">To</label>
        <input type="date" id="coll-to" class="coll-date-input" value="${c.to}">
        <button class="btn btn-primary btn-sm" id="coll-apply">Apply</button>
      </div>
    </div>

    <div class="coll-stats-row">
      <div class="coll-stat-card coll-stat-service">
        <div class="coll-stat-icon">🔧</div>
        <div class="coll-stat-body">
          <div class="coll-stat-val">${a(f.service)}</div>
          <div class="coll-stat-lbl">Service · ${f.count} ticket${f.count===1?``:`s`}</div>
        </div>
      </div>
      <div class="coll-stat-card coll-stat-travel">
        <div class="coll-stat-icon">🚗</div>
        <div class="coll-stat-body">
          <div class="coll-stat-val">${a(f.travel)}</div>
          <div class="coll-stat-lbl">Travel</div>
        </div>
      </div>
      <div class="coll-stat-card coll-stat-total">
        <div class="coll-stat-icon">💰</div>
        <div class="coll-stat-body">
          <div class="coll-stat-val">${a(f.total)}</div>
          <div class="coll-stat-lbl">Total Collected</div>
        </div>
      </div>
    </div>

    <div class="card">${y(u)}</div>
  `,e.querySelectorAll(`.coll-row`).forEach(e=>e.onclick=()=>{let t=u.find(t=>String(t.id)===e.dataset.id);t&&g(t,{admin:!1})}),e.querySelector(`#coll-period`).onchange=function(){let t=this.value,n=e.querySelector(`#coll-custom-dates`);t===`custom`?n.style.display=``:(n.style.display=`none`,e.dataset.period=t,e.dataset.from=``,e.dataset.to=``,b(e))};let m=e.querySelector(`#coll-apply`);m&&(m.onclick=()=>{e.dataset.period=`custom`,e.dataset.from=e.querySelector(`#coll-from`).value,e.dataset.to=e.querySelector(`#coll-to`).value,b(e)})}function x(e,t){return`
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Ticket</th><th>Customer</th><th>Employee</th><th>Service</th><th>Travel</th><th>Platform</th><th>GST</th><th>Discount</th><th>Net</th></tr></thead>
        <tbody>
          ${e.length===0?`<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-dim)">No collections found</td></tr>`:e.map(e=>{let r=f(e);return`
            <tr class="coll-row" data-id="${s(e.id)}" style="cursor:pointer;">
              <td><small style="color:var(--text-dim)">${u(e)?n(u(e)):`-`}</small></td>
              <td><code style="font-size:0.75rem;color:var(--primary)">${s(e.ticket_no||`-`)}</code></td>
              <td><b>${s(e.full_name||`Client`)}</b><br/><small style="color:var(--text-dim)">${s(e.service_item||``)}</small></td>
              <td>${s(t.get(e.assigned_employee_id)?.full_name||`Employee`)}</td>
              <td>${a(r.service)}</td>
              <td>${a(r.travel)}</td>
              <td>${r.platform>0?a(r.platform):`<small style="color:var(--text-dim)">—</small>`}</td>
              <td>${r.gst>0?`${a(r.gst)}${r.gstRate?`<br/><small style="color:var(--text-dim)">${r.gstRate}%</small>`:``}`:`<small style="color:var(--text-dim)">—</small>`}</td>
              <td>${r.discount>0?`<span style="color:var(--danger)">-${a(r.discount)}</span>`:`<small style="color:var(--text-dim)">—</small>`}</td>
              <td><b>${a(r.net)}</b><br/><small style="color:var(--text-dim)">${e.payment_method===`cash`?`Cash`:`Online`}</small></td>
            </tr>`}).join(``)}
        </tbody>
      </table>
    </div>
  `}async function S(n){t(n);let[{data:c},{data:p}]=await Promise.all([i.from(`inquiries`).select(`*`).eq(`payment_status`,`paid`).order(`payment_received_at`,{ascending:!1}),i.from(`profiles`).select(`id,full_name,phone`).eq(`role`,`employee`)]),m=(c||[]).filter(e=>o(e.bill_total)>0),h=p||[],_=new Map(h.map(e=>[e.id,e])),y=l(n.dataset.period||`monthly`),b={from:n.dataset.from||y.from,to:n.dataset.to||y.to,employee:n.dataset.employee||`all`},C=d(m,b),w=v(C),T=new Map;C.forEach(e=>{let t=e.assigned_employee_id||`unassigned`;T.has(t)||T.set(t,[]),T.get(t).push(e)});let E=[...T.entries()].map(([e,t])=>{let n=v(t);return{id:e,name:_.get(e)?.full_name||`Unassigned`,...n}}).sort((e,t)=>t.net-e.net),D=n.dataset.period||`monthly`;n.innerHTML=`
    <div class="page-header collection-header">
      <div>
        <h1>Collection Reports</h1>
        <p>Detailed service collections, discounts and net by employee</p>
      </div>
      <button class="btn btn-primary" id="coll-export">${r.download}<span>Export</span></button>
    </div>

    <div class="coll-filter-bar">
      <div class="coll-filter-group">
        <label class="coll-filter-label">Period</label>
        <select id="coll-period" class="coll-select">
          <option value="daily"   ${D===`daily`?`selected`:``}>Today</option>
          <option value="weekly"  ${D===`weekly`?`selected`:``}>This Week</option>
          <option value="monthly" ${D===`monthly`?`selected`:``}>This Month</option>
          <option value="yearly"  ${D===`yearly`?`selected`:``}>This Year</option>
          <option value="custom"  ${D===`custom`?`selected`:``}>Custom Range</option>
          <option value="all"     ${D===`all`?`selected`:``}>All Time</option>
        </select>
      </div>
      <div class="coll-filter-group">
        <label class="coll-filter-label">Employee</label>
        <select id="coll-employee" class="coll-select">
          <option value="all">All Employees</option>
          ${h.map(e=>`<option value="${e.id}" ${b.employee===e.id?`selected`:``}>${s(e.full_name||e.phone||e.id)}</option>`).join(``)}
        </select>
      </div>
      <div class="coll-filter-group coll-date-wrap" id="coll-custom-dates" style="${D===`custom`?``:`display:none`}">
        <label class="coll-filter-label">From</label>
        <input type="date" id="coll-from" class="coll-date-input" value="${b.from}">
        <label class="coll-filter-label" style="margin-left:8px;">To</label>
        <input type="date" id="coll-to" class="coll-date-input" value="${b.to}">
        <button class="btn btn-primary btn-sm" id="coll-apply">Apply</button>
      </div>
    </div>

    <div class="coll-stats-row">
      <div class="coll-stat-card coll-stat-service">
        <div class="coll-stat-icon">🔧</div>
        <div class="coll-stat-body">
          <div class="coll-stat-val">${a(w.service)}</div>
          <div class="coll-stat-lbl">Service · ${w.count} ticket${w.count===1?``:`s`}</div>
        </div>
      </div>
      <div class="coll-stat-card coll-stat-travel">
        <div class="coll-stat-icon">🚗</div>
        <div class="coll-stat-body">
          <div class="coll-stat-val">${a(w.travel)}</div>
          <div class="coll-stat-lbl">Travel</div>
        </div>
      </div>
      <div class="coll-stat-card coll-stat-platform">
        <div class="coll-stat-icon">🏷️</div>
        <div class="coll-stat-body">
          <div class="coll-stat-val">${a(w.platform)}</div>
          <div class="coll-stat-lbl">Platform Fee</div>
        </div>
      </div>
      <div class="coll-stat-card coll-stat-gst">
        <div class="coll-stat-icon">🧾</div>
        <div class="coll-stat-body">
          <div class="coll-stat-val">${a(w.gst)}</div>
          <div class="coll-stat-lbl">GST (18%)</div>
        </div>
      </div>
      <div class="coll-stat-card coll-stat-discount">
        <div class="coll-stat-icon">🎁</div>
        <div class="coll-stat-body">
          <div class="coll-stat-val">${a(w.discount)}</div>
          <div class="coll-stat-lbl">Discount Given</div>
        </div>
      </div>
      <div class="coll-stat-card coll-stat-total">
        <div class="coll-stat-icon">💰</div>
        <div class="coll-stat-body">
          <div class="coll-stat-val">${a(w.net)}</div>
          <div class="coll-stat-lbl">Net Collected</div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header"><span class="card-title">By Employee</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Service</th><th>Travel</th><th>Platform</th><th>GST</th><th>Discount</th><th>Net</th></tr></thead>
          <tbody>${E.length===0?`<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-dim)">No collections found</td></tr>`:E.map(e=>`
            <tr><td><b>${s(e.name)}</b></td><td>${a(e.service)}</td><td>${a(e.travel)}</td><td>${a(e.platform)}</td><td>${a(e.gst)}</td><td style="color:var(--danger)">${e.discount>0?`-`+a(e.discount):`—`}</td><td><b>${a(e.net)}</b></td></tr>
          `).join(``)}</tbody>
        </table>
      </div>
    </div>
    <div class="card">${x(C,_)}</div>
  `,n.querySelectorAll(`.coll-row`).forEach(e=>e.onclick=()=>{let t=C.find(t=>String(t.id)===e.dataset.id);t&&g(t,{admin:!0})}),n.querySelector(`#coll-period`).onchange=function(){let e=this.value,t=n.querySelector(`#coll-custom-dates`);e===`custom`?t.style.display=``:(t.style.display=`none`,n.dataset.period=e,n.dataset.employee=n.querySelector(`#coll-employee`).value,n.dataset.from=``,n.dataset.to=``,S(n))},n.querySelector(`#coll-employee`).onchange=function(){n.dataset.employee=this.value,S(n)};let O=n.querySelector(`#coll-apply`);O&&(O.onclick=()=>{n.dataset.period=`custom`,n.dataset.employee=n.querySelector(`#coll-employee`).value,n.dataset.from=n.querySelector(`#coll-from`).value,n.dataset.to=n.querySelector(`#coll-to`).value,S(n)}),n.querySelector(`#coll-export`).onclick=()=>e(`collection-report.csv`,C.map(e=>{let t=f(e);return{date:u(e),ticket:e.ticket_no||``,customer:e.full_name||``,employee:_.get(e.assigned_employee_id)?.full_name||``,service:t.service,travel:t.travel,platform_fee:t.platform,gst:t.gst,discount:t.discount,net:t.net,payment_method:e.payment_method===`cash`?`cash`:`online`}}))}export{S as renderAdminCollections,b as renderEmployeeCollections};