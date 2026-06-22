import{g as e,m as t,s as n,t as r}from"./icons-j8TZxXx3.js";import{r as i}from"./index-BO2-RaLs.js";var a=e=>`₹${Math.round(Number(e)||0).toLocaleString(`en-IN`)}`,o=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]);async function s(n){t(n);let{data:l,error:u}=await i.from(`discount_presets`).select(`*`).order(`created_at`,{ascending:!1});if(u){n.innerHTML=`<div class="card"><div class="card-body" style="color:var(--danger)">Could not load discounts: ${o(u.message)}</div></div>`;return}let d=l||[];n.innerHTML=`
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap;">
      <div><h1>Discounts</h1><p>Create predefined discounts employees can select while billing</p></div>
      <button class="btn btn-primary" id="discount-add">${r.plus}<span>Add Discount</span></button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Amount</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${d.length===0?`<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-dim)">No discount presets yet</td></tr>`:d.map(e=>`
              <tr>
                <td><b>${o(e.name)}</b></td>
                <td><b style="color:var(--success)">${a(e.amount)}</b></td>
                <td style="max-width:360px;white-space:normal;color:var(--text-soft)">${o(e.description||`-`)}</td>
                <td><span class="badge ${Number(e.active)===1?`badge-resolved`:`badge-danger`}">${Number(e.active)===1?`Active`:`Hidden`}</span></td>
                <td>
                  <button class="btn btn-secondary btn-sm discount-edit" data-id="${o(e.id)}">${r.edit}<span>Edit</span></button>
                  <button class="btn btn-secondary btn-sm discount-toggle" data-id="${o(e.id)}">${Number(e.active)===1?`Hide`:`Show`}</button>
                  <button class="btn btn-secondary btn-sm discount-delete" data-id="${o(e.id)}" style="color:var(--danger)">${r.close}<span>Delete</span></button>
                </td>
              </tr>
            `).join(``)}
          </tbody>
        </table>
      </div>
    </div>
  `;let f=()=>s(n);n.querySelector(`#discount-add`).onclick=()=>c(null,f),n.querySelectorAll(`.discount-edit`).forEach(e=>e.onclick=()=>c(d.find(t=>t.id===e.dataset.id),f)),n.querySelectorAll(`.discount-toggle`).forEach(t=>t.onclick=async()=>{let n=d.find(e=>e.id===t.dataset.id),{error:r}=await i.from(`discount_presets`).update({active:Number(n.active)===1?0:1}).eq(`id`,n.id);if(r)return e(r.message,`error`);e(Number(n.active)===1?`Discount hidden`:`Discount active`,`success`),f()}),n.querySelectorAll(`.discount-delete`).forEach(t=>t.onclick=async()=>{if(!confirm(`Delete this discount?`))return;let{error:n}=await i.from(`discount_presets`).delete().eq(`id`,t.dataset.id);if(n)return e(n.message,`error`);e(`Discount deleted`,`success`),f()})}function c(t,n){let r=document.createElement(`div`);r.className=`modal-overlay`,r.innerHTML=`
    <div class="modal" style="max-width:520px">
      <div class="modal-header"><span class="modal-title">${t?`Edit Discount`:`Add Discount`}</span><button class="modal-close">×</button></div>
      <div class="modal-body">
        <label class="notice-editor-label">Discount Name</label>
        <input id="disc-name" class="notice-editor-input" value="${o(t?.name||``)}" placeholder="Festival offer">
        <label class="notice-editor-label">Amount</label>
        <input id="disc-amount" class="notice-editor-input" type="number" min="0" step="1" value="${t?.amount||``}" placeholder="100">
        <label class="notice-editor-label">Description</label>
        <textarea id="disc-desc" class="notice-editor-input notice-editor-textarea" rows="3" placeholder="Shown to employees while billing">${o(t?.description||``)}</textarea>
        <label class="notice-editor-check"><input id="disc-active" type="checkbox" ${!t||Number(t.active)===1?`checked`:``}> Active</label>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="disc-cancel">Cancel</button><button class="btn btn-primary" id="disc-save">Save</button></div>
    </div>
  `,document.body.appendChild(r);let a=()=>r.remove();r.querySelector(`.modal-close`).onclick=a,r.querySelector(`#disc-cancel`).onclick=a,r.onclick=e=>{e.target===r&&a()},r.querySelector(`#disc-save`).onclick=async()=>{let o={name:r.querySelector(`#disc-name`).value.trim(),amount:Number(r.querySelector(`#disc-amount`).value)||0,description:r.querySelector(`#disc-desc`).value.trim()||null,active:+!!r.querySelector(`#disc-active`).checked};if(!o.name)return e(`Enter discount name`,`warning`);if(o.amount<=0)return e(`Enter discount amount`,`warning`);let s=t?await i.from(`discount_presets`).update(o).eq(`id`,t.id):await i.from(`discount_presets`).insert(o);if(s.error)return e(s.error.message,`error`);e(t?`Discount updated`:`Discount added`,`success`),a(),n()}}async function l(e){t(e);let[{data:r},{data:s}]=await Promise.all([i.from(`inquiries`).select(`*`).order(`bill_generated_at`,{ascending:!1}),i.from(`profiles`).select(`id,full_name,phone`)]),c=new Map((s||[]).map(e=>[e.id,e])),l=(r||[]).filter(e=>Number(e.discount_amount)>0);e.innerHTML=`
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
  `}export{l as renderDiscountRequestsTab,s as renderDiscountsTab};