import{g as e,m as t,s as n,t as r}from"./icons-j8TZxXx3.js";import{r as i}from"./index-BO2-RaLs.js";function a(e){return String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e])}function o(e){return a(e)}function s(e,t=`Saving`){if(!e)return()=>{};let n=e.innerHTML;return e.disabled=!0,e.classList.add(`is-loading`),e.innerHTML=`<span class="btn-spinner"></span><span>${t}</span>`,()=>{e.disabled=!1,e.classList.remove(`is-loading`),e.innerHTML=n}}function c(e){if(!e)return``;let t=new Date(e);return Number.isNaN(t.getTime())?``:new Date(t.getTime()-t.getTimezoneOffset()*6e4).toISOString().slice(0,16)}async function l(s){t(s);let{data:c,error:d}=await i.from(`notices`).select(`*`).order(`created_at`,{ascending:!1});if(d){s.innerHTML=`<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--danger);">Could not load notices: ${a(d.message||``)}</div></div>`;return}let f=c||[],p=f.filter(e=>Number(e.active)===1).length;s.innerHTML=`
    <div class="page-header admin-notice-header">
      <div>
        <h1><span>${r.clipboard}</span> Notice Board</h1>
        <p>Publish staff notices directly to the employee dashboard</p>
      </div>
      <button class="btn btn-primary" id="notice-add-btn">${r.plus}<span>New Notice</span></button>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${f.length}</div><div class="stat-label">Total Notices</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${p}</div><div class="stat-label">Active</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--text-dim)">${f.length-p}</div><div class="stat-label">Hidden</div></div>
    </div>
    <div class="admin-notice-grid">
      ${f.length===0?`
        <div class="card"><div class="card-body admin-notice-empty">${r.clipboard}<p>No notices yet</p></div></div>
      `:f.map(e=>`
        <article class="admin-notice-card notice-${o(e.priority||`normal`)}">
          <div class="admin-notice-top">
            <span class="admin-notice-icon">${e.priority===`urgent`?r.alert:e.priority===`high`?r.star:r.clipboard}</span>
            <div>
              <span class="badge ${Number(e.active)===1?`badge-resolved`:`badge-danger`}">${Number(e.active)===1?`Active`:`Hidden`}</span>
              <span class="badge badge-${e.priority===`urgent`?`danger`:e.priority===`high`?`medium`:`open`}">${a(e.priority||`normal`)}</span>
            </div>
          </div>
          <h3>${a(e.title)}</h3>
          <p>${a(e.body)}</p>
          <small>Posted ${n(e.created_at)}${e.expires_at?` · Expires ${n(e.expires_at)}`:``}</small>
          <div class="admin-notice-actions">
            <button class="btn btn-secondary btn-sm notice-edit-btn" data-id="${o(e.id)}">${r.edit}<span>Edit</span></button>
            <button class="btn btn-secondary btn-sm notice-toggle-btn" data-id="${o(e.id)}">${Number(e.active)===1?`Hide`:`Show`}</button>
            <button class="btn btn-secondary btn-sm notice-delete-btn" data-id="${o(e.id)}" style="color:var(--danger)">${r.close}<span>Delete</span></button>
          </div>
        </article>
      `).join(``)}
    </div>
  `;let m=()=>l(s);s.querySelector(`#notice-add-btn`).onclick=()=>u(null,m),s.querySelectorAll(`.notice-edit-btn`).forEach(e=>{e.onclick=()=>u(f.find(t=>t.id===e.dataset.id),m)}),s.querySelectorAll(`.notice-toggle-btn`).forEach(t=>{t.onclick=async()=>{let n=f.find(e=>e.id===t.dataset.id),{error:r}=await i.from(`notices`).update({active:Number(n.active)===1?0:1}).eq(`id`,n.id);if(r)return e(`Could not update notice: `+(r.message||``),`error`);e(Number(n.active)===1?`Notice hidden`:`Notice published`,`success`),m()}}),s.querySelectorAll(`.notice-delete-btn`).forEach(t=>{t.onclick=async()=>{if(!confirm(`Delete this notice?`))return;let{error:n}=await i.from(`notices`).delete().eq(`id`,t.dataset.id);if(n)return e(`Could not delete notice: `+(n.message||``),`error`);e(`Notice deleted`,`success`),m()}})}function u(t,n){let r=!!t,l=document.createElement(`div`);l.className=`modal-overlay`,l.innerHTML=`
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <span class="modal-title">${r?`Edit Notice`:`New Notice`}</span>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <label class="notice-editor-label">Title</label>
        <input id="notice-title" maxlength="160" value="${o(t?.title||``)}" placeholder="Morning briefing at 10 AM" class="notice-editor-input">
        <label class="notice-editor-label">Notice Message</label>
        <textarea id="notice-body" rows="5" placeholder="Write the update employees should see..." class="notice-editor-input notice-editor-textarea">${a(t?.body||``)}</textarea>
        <div class="notice-editor-grid">
          <div>
            <label class="notice-editor-label">Priority</label>
            <select id="notice-priority" class="notice-editor-input">
              <option value="normal" ${(t?.priority||`normal`)===`normal`?`selected`:``}>Normal</option>
              <option value="high" ${t?.priority===`high`?`selected`:``}>High</option>
              <option value="urgent" ${t?.priority===`urgent`?`selected`:``}>Urgent</option>
            </select>
          </div>
          <div>
            <label class="notice-editor-label">Expires At</label>
            <input id="notice-expires" type="datetime-local" value="${c(t?.expires_at)}" class="notice-editor-input">
          </div>
        </div>
        <label class="notice-editor-check">
          <input id="notice-active" type="checkbox" ${!t||Number(t.active)===1?`checked`:``}>
          Publish to employee dashboard
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="notice-cancel">Cancel</button>
        <button class="btn btn-primary" id="notice-save">${r?`Save Notice`:`Publish Notice`}</button>
      </div>
    </div>
  `,document.body.appendChild(l);let u=()=>l.remove();l.querySelector(`.modal-close`).onclick=u,l.querySelector(`#notice-cancel`).onclick=u,l.addEventListener(`click`,e=>{e.target===l&&u()}),l.querySelector(`#notice-save`).onclick=async()=>{let a=l.querySelector(`#notice-title`).value.trim(),o=l.querySelector(`#notice-body`).value.trim(),c=l.querySelector(`#notice-priority`).value,d=l.querySelector(`#notice-expires`).value,f=+!!l.querySelector(`#notice-active`).checked;if(!a)return e(`Notice title is required`,`warning`);if(!o)return e(`Notice message is required`,`warning`);let p={title:a,body:o,priority:c,active:f,expires_at:d?new Date(d).toISOString().slice(0,19).replace(`T`,` `):null};if(!r){let{data:{user:e}}=await i.auth.getUser();p.created_by=e?.id||null}let m=s(l.querySelector(`#notice-save`),`Saving`),h=r?await i.from(`notices`).update(p).eq(`id`,t.id):await i.from(`notices`).insert(p);if(m(),h.error)return e(`Could not save notice: `+(h.error.message||``),`error`);e(r?`Notice updated`:`Notice published`,`success`),u(),n&&n()}}export{l as renderNoticesTab};