import{g as e,m as t,s as n,t as r}from"./icons-j8TZxXx3.js";import{r as i}from"./index-CuPRPj-i.js";var a=e=>`₹${Math.round(Number(e)||0).toLocaleString(`en-IN`)}`,o=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),s=e=>e.type===`percent`?`${Number(e.value)}% off${e.max_discount?` (max ${a(e.max_discount)})`:``}`:`${a(e.value)} off`;async function c(l){t(l);let{data:d,error:f}=await i.from(`coupons`).select(`*`).order(`created_at`,{ascending:!1});if(f){l.innerHTML=`<div class="card"><div class="card-body" style="color:var(--danger)">Could not load coupons: ${o(f.message)}</div></div>`;return}let p=d||[],m=e=>e.expires_at&&new Date(e.expires_at).getTime()<Date.now(),h=e=>e.usage_limit!=null&&Number(e.used_count)>=Number(e.usage_limit);l.innerHTML=`
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap;">
      <div><h1>Coupons</h1><p>Create redeemable coupon codes employees enter at billing. Customers quote a code to get the discount.</p></div>
      <button class="btn btn-primary" id="coupon-add">${r.plus}<span>Add Coupon</span></button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Code</th><th>Discount</th><th>Min Bill</th><th>Usage</th><th>Expires</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${p.length===0?`<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-dim)">No coupons yet. Create one to let customers redeem a discount.</td></tr>`:p.map(e=>{let t=m(e),i=h(e),c=Number(e.active)===1&&!t&&!i,l=Number(e.active)===1?t?`Expired`:i?`Used up`:`Active`:`Hidden`;return`
              <tr>
                <td><code style="font-size:0.82rem;font-weight:800;color:var(--primary);letter-spacing:.04em;">${o(e.code)}</code>${e.description?`<br/><small style="color:var(--text-soft)">${o(e.description)}</small>`:``}</td>
                <td><b style="color:var(--success)">${o(s(e))}</b></td>
                <td>${Number(e.min_amount)>0?a(e.min_amount):`—`}</td>
                <td>${Number(e.used_count)||0}${e.usage_limit==null?` / ∞`:` / ${e.usage_limit}`}</td>
                <td>${e.expires_at?`<small style="color:${t?`var(--danger)`:`var(--text-dim)`}">${n(e.expires_at)}</small>`:`<small style="color:var(--text-dim)">Never</small>`}</td>
                <td><span class="badge ${c?`badge-resolved`:`badge-danger`}">${l}</span></td>
                <td>
                  <button class="btn btn-secondary btn-sm coupon-edit" data-id="${o(e.id)}">${r.edit}<span>Edit</span></button>
                  <button class="btn btn-secondary btn-sm coupon-toggle" data-id="${o(e.id)}">${Number(e.active)===1?`Hide`:`Show`}</button>
                  <button class="btn btn-secondary btn-sm coupon-delete" data-id="${o(e.id)}" style="color:var(--danger)">${r.close}<span>Delete</span></button>
                </td>
              </tr>`}).join(``)}
          </tbody>
        </table>
      </div>
    </div>
  `;let g=()=>c(l);l.querySelector(`#coupon-add`).onclick=()=>u(null,g),l.querySelectorAll(`.coupon-edit`).forEach(e=>e.onclick=()=>u(p.find(t=>t.id===e.dataset.id),g)),l.querySelectorAll(`.coupon-toggle`).forEach(t=>t.onclick=async()=>{let n=p.find(e=>e.id===t.dataset.id),{error:r}=await i.from(`coupons`).update({active:Number(n.active)===1?0:1}).eq(`id`,n.id);if(r)return e(r.message,`error`);e(Number(n.active)===1?`Coupon hidden`:`Coupon active`,`success`),g()}),l.querySelectorAll(`.coupon-delete`).forEach(t=>t.onclick=async()=>{if(!confirm(`Delete this coupon?`))return;let{error:n}=await i.from(`coupons`).delete().eq(`id`,t.dataset.id);if(n)return e(n.message,`error`);e(`Coupon deleted`,`success`),g()})}function l(e){if(!e)return``;let t=new Date(e);if(isNaN(t))return``;let n=e=>String(e).padStart(2,`0`);return`${t.getFullYear()}-${n(t.getMonth()+1)}-${n(t.getDate())}T${n(t.getHours())}:${n(t.getMinutes())}`}function u(t,n){let r=t?.type===`percent`,a=document.createElement(`div`);a.className=`modal-overlay`,a.innerHTML=`
    <div class="modal" style="max-width:540px">
      <div class="modal-header"><span class="modal-title">${t?`Edit Coupon`:`Add Coupon`}</span><button class="modal-close">×</button></div>
      <div class="modal-body">
        <label class="notice-editor-label">Coupon Code</label>
        <input id="cp-code" class="notice-editor-input" value="${o(t?.code||``)}" placeholder="SAVE50" style="text-transform:uppercase;letter-spacing:.05em;font-weight:700;">
        <label class="notice-editor-label">Discount Type</label>
        <select id="cp-type" class="notice-editor-input">
          <option value="fixed" ${r?``:`selected`}>Fixed amount (₹ off)</option>
          <option value="percent" ${r?`selected`:``}>Percentage (% off)</option>
        </select>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label class="notice-editor-label"><span id="cp-value-label">${r?`Percent off (%)`:`Amount off (₹)`}</span></label>
            <input id="cp-value" class="notice-editor-input" type="number" min="0" step="1" value="${t?.value??``}" placeholder="${r?`10`:`50`}">
          </div>
          <div id="cp-maxwrap" style="display:${r?`block`:`none`};">
            <label class="notice-editor-label">Max discount (₹, optional)</label>
            <input id="cp-max" class="notice-editor-input" type="number" min="0" step="1" value="${t?.max_discount??``}" placeholder="200">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label class="notice-editor-label">Min bill (₹, optional)</label>
            <input id="cp-min" class="notice-editor-input" type="number" min="0" step="1" value="${t?.min_amount?Number(t.min_amount):``}" placeholder="0">
          </div>
          <div>
            <label class="notice-editor-label">Usage limit (optional)</label>
            <input id="cp-limit" class="notice-editor-input" type="number" min="1" step="1" value="${t?.usage_limit??``}" placeholder="Unlimited">
          </div>
        </div>
        <label class="notice-editor-label">Expires at (optional)</label>
        <input id="cp-expires" class="notice-editor-input" type="datetime-local" value="${l(t?.expires_at)}">
        <label class="notice-editor-label">Description (optional)</label>
        <textarea id="cp-desc" class="notice-editor-input notice-editor-textarea" rows="2" placeholder="Internal note, e.g. Diwali festival offer">${o(t?.description||``)}</textarea>
        <label class="notice-editor-check"><input id="cp-active" type="checkbox" ${!t||Number(t.active)===1?`checked`:``}> Active</label>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="cp-cancel">Cancel</button><button class="btn btn-primary" id="cp-save">Save</button></div>
    </div>
  `,document.body.appendChild(a);let s=()=>a.remove();a.querySelector(`.modal-close`).onclick=s,a.querySelector(`#cp-cancel`).onclick=s,a.onclick=e=>{e.target===a&&s()};let c=a.querySelector(`#cp-type`);c.onchange=()=>{let e=c.value===`percent`;a.querySelector(`#cp-maxwrap`).style.display=e?`block`:`none`,a.querySelector(`#cp-value-label`).textContent=e?`Percent off (%)`:`Amount off (₹)`},a.querySelector(`#cp-save`).onclick=async()=>{let r=c.value===`percent`?`percent`:`fixed`,o=a.querySelector(`#cp-code`).value.trim().toUpperCase(),l=Number(a.querySelector(`#cp-value`).value)||0,u=a.querySelector(`#cp-max`).value?Number(a.querySelector(`#cp-max`).value):null,d=Number(a.querySelector(`#cp-min`).value)||0,f=a.querySelector(`#cp-limit`).value?Math.max(1,parseInt(a.querySelector(`#cp-limit`).value,10)):null,p=a.querySelector(`#cp-expires`).value,m=p?p.replace(`T`,` `)+`:00`:null;if(!o)return e(`Enter a coupon code`,`warning`);if(!/^[A-Z0-9_-]{2,40}$/.test(o))return e(`Code: 2–40 letters, numbers, - or _`,`warning`);if(l<=0)return e(`Enter a discount value above 0`,`warning`);if(r===`percent`&&l>100)return e(`Percentage cannot exceed 100`,`warning`);let h={code:o,type:r,value:l,max_discount:r===`percent`?u:null,min_amount:d,usage_limit:f,expires_at:m,description:a.querySelector(`#cp-desc`).value.trim()||null,active:+!!a.querySelector(`#cp-active`).checked},g=t?await i.from(`coupons`).update(h).eq(`id`,t.id):await i.from(`coupons`).insert(h);if(g.error)return e(/duplicate|unique/i.test(g.error.message||``)?`That coupon code already exists`:g.error.message,`error`);e(t?`Coupon updated`:`Coupon created`,`success`),s(),n()}}async function d(e){t(e);let[{data:r},{data:s}]=await Promise.all([i.from(`inquiries`).select(`*`).order(`bill_generated_at`,{ascending:!1}),i.from(`profiles`).select(`id,full_name,phone`)]),c=new Map((s||[]).map(e=>[e.id,e])),l=(r||[]).filter(e=>Number(e.discount_amount)>0);e.innerHTML=`
    <div class="page-header">
      <h1>Discount Details</h1>
      <p>All bills where employees applied admin or manual discounts</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${l.length}</div><div class="stat-label">Discounted Bills</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${a(l.reduce((e,t)=>e+Number(t.discount_amount||0),0))}</div><div class="stat-label">Total Discount</div></div>
      <div class="stat-card"><div class="stat-value">${l.filter(e=>e.discount_reason).length}</div><div class="stat-label">Manual Reasons</div></div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Ticket</th><th>Customer</th><th>Employee</th><th>Discount</th><th>Reason / Source</th></tr></thead>
          <tbody>
            ${l.length===0?`<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No discounts applied yet</td></tr>`:l.map(e=>`
              <tr>
                <td><small style="color:var(--text-dim)">${e.bill_generated_at?n(e.bill_generated_at):`-`}</small></td>
                <td><code style="font-size:0.75rem;color:var(--primary)">${o(e.ticket_no||`-`)}</code></td>
                <td><b>${o(e.full_name||`Client`)}</b><br/><small>${o(e.service_item||``)}</small></td>
                <td>${o(c.get(e.assigned_employee_id)?.full_name||`Employee`)}</td>
                <td><b style="color:var(--success)">${a(e.discount_amount)}</b><br/><small>${o(e.discount_label||`Discount`)}</small></td>
                <td style="max-width:420px;white-space:normal;color:var(--text-soft)">${o(e.discount_reason||(e.discount_preset_id?`Admin preset selected, no reason required`:`Automatic discount`))}</td>
              </tr>
            `).join(``)}
          </tbody>
        </table>
      </div>
    </div>
  `}export{d as renderDiscountRequestsTab,c as renderDiscountsTab};