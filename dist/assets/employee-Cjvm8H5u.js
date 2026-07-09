import{a as e,c as t,g as n,h as r,l as i,m as a,o,p as s,r as c,s as l,t as u,u as d}from"./icons-j8TZxXx3.js";import{r as f,t as p}from"./index-CuPRPj-i.js";import{i as m,n as h,r as g}from"./device-tracking-DDQQfS3_.js";var _=window.location.hostname!==`localhost`&&window.location.hostname!==`127.0.0.1`?`/api`:`http://localhost:5000/api`,v=()=>{let e=localStorage.getItem(`auth_token`),t={"Content-Type":`application/json`};return e&&(t.Authorization=`Bearer ${e}`),t};async function y(e){try{let t=await fetch(`${_}/device-tracking/employee/${e}`,{headers:v()}),n=await t.json();if(!t.ok)throw Error(n.error||`Failed to load devices`);return{data:n||[],error:null}}catch(e){return console.error(`Error loading employee devices:`,e),{data:[],error:e}}}async function b(e){try{let t=await fetch(`${_}/device-tracking/status/${e}`,{headers:v()}),n=await t.json();if(!t.ok)throw Error(n.error||`Failed to load status`);return{data:n,error:null}}catch(e){return console.error(`Error loading device status:`,e),{data:null,error:e}}}function x(e,t,n,r){return`
    <div style="padding: 20px 0;">
      ${t?`
        <div style="background: rgba(250, 204, 21, 0.1); padding: 16px; border-radius: 12px; border: 1px solid rgba(250, 204, 21, 0.2); margin-bottom: 16px;">
          <h4 style="margin: 0 0 12px 0;">📸 Device Taken</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <small style="color: var(--text-dim); font-weight: 600;">Taken By</small>
              <div style="margin-top: 4px;">${t.profiles?.full_name||`Unknown`}</div>
            </div>
            <div>
              <small style="color: var(--text-dim); font-weight: 600;">Taken On</small>
              <div style="margin-top: 4px;">${l(t.taken_at)}</div>
            </div>
          </div>
          ${t.device_image_url?`
            <div style="margin-bottom: 12px;">
              <small style="color: var(--text-dim); font-weight: 600;">Device Image</small>
              <img src="${t.device_image_url}" alt="Device" style="width: 100%; max-height: 200px; border-radius: 8px; margin-top: 8px; object-fit: cover;">
            </div>
          `:``}
          ${t.device_description?`
            <div>
              <small style="color: var(--text-dim); font-weight: 600;">Description</small>
              <div style="margin-top: 4px; padding: 8px; background: white; border-radius: 6px; font-size: 0.9rem;">${t.device_description}</div>
            </div>
          `:``}
        </div>
      `:`
        <div style="background: var(--bg-soft); padding: 16px; border-radius: 12px; text-align: center; margin-bottom: 16px;">
          <p style="color: var(--text-dim); margin: 0;">Device not yet marked as taken</p>
        </div>
      `}

      ${n?`
        <div style="background: rgba(34, 197, 94, 0.1); padding: 16px; border-radius: 12px; border: 1px solid rgba(34, 197, 94, 0.2);">
          <h4 style="margin: 0 0 12px 0;">✅ Device Returned</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <small style="color: var(--text-dim); font-weight: 600;">Condition</small>
              <div style="margin-top: 4px; padding: 4px 8px; background: #dcfce7; color: #15803d; border-radius: 4px; display: inline-block; font-weight: 600;">${n.device_condition?.toUpperCase()||`GOOD`}</div>
            </div>
            <div>
              <small style="color: var(--text-dim); font-weight: 600;">Returned On</small>
              <div style="margin-top: 4px;">${l(n.returned_at)}</div>
            </div>
          </div>
          ${n.return_image_url?`
            <div style="margin-bottom: 12px;">
              <small style="color: var(--text-dim); font-weight: 600;">Return Image</small>
              <img src="${n.return_image_url}" alt="Return" style="width: 100%; max-height: 200px; border-radius: 8px; margin-top: 8px; object-fit: cover;">
            </div>
          `:``}
          ${n.return_notes?`
            <div>
              <small style="color: var(--text-dim); font-weight: 600;">Notes</small>
              <div style="margin-top: 4px; padding: 8px; background: white; border-radius: 6px; font-size: 0.9rem;">${n.return_notes}</div>
            </div>
          `:``}
        </div>
      `:``}
    </div>
  `}function S(e){return`
    <div style="padding: 20px 0;">
      ${e&&e.length>0?`
        <div>
          <h4 style="margin: 0 0 16px 0;">Follow-up Updates</h4>
          ${e.map(e=>`
            <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                <strong style="color: var(--primary);">${e.status?.replace(/_/g,` `).toUpperCase()}</strong>
                <small style="color: var(--text-dim);">${l(e.created_at)}</small>
              </div>
              ${e.notes?`<div style="font-size: 0.9rem; margin-bottom: 4px;">${e.notes}</div>`:``}
              ${e.profiles?.full_name?`<small style="color: var(--text-dim);">By: ${e.profiles.full_name}</small>`:``}
            </div>
          `).join(``)}
        </div>
      `:`
        <div style="background: var(--bg-soft); padding: 16px; border-radius: 12px; text-align: center;">
          <p style="color: var(--text-dim); margin: 0;">No follow-up updates yet</p>
        </div>
      `}
    </div>
  `}var C=!0;async function w(){try{let e=window.location.hostname!==`localhost`&&window.location.hostname!==`127.0.0.1`?`/api`:`http://localhost:5000/api`;C=(await(await fetch(`${e}/settings/device-tracking`)).json()).enabled!==!1}catch{C=!0}return C}function T(e){return[`resolved`,`case_closed`,`foc`].includes(P(e))}async function E(e,t){let n=window.location.hostname!==`localhost`&&window.location.hostname!==`127.0.0.1`?`/api`:`http://localhost:5000/api`,r=await fetch(`${n}/device-tracking/toggle`,{method:`POST`,headers:{"Content-Type":`application/json`,Authorization:`Bearer ${localStorage.getItem(`auth_token`)}`},body:JSON.stringify({inquiry_id:e,enabled:t})});if(!r.ok){let e=await r.json().catch(()=>({}));throw Error(e.error||`Could not update device flag`)}return r.json()}function ee({maxWaitMs:e=8e3}={}){return new Promise((t,n)=>{if(!navigator.geolocation)return n(Error(`Geolocation not supported`));let r=!1,i=()=>{navigator.geolocation.getCurrentPosition(e=>{r||(r=!0,t(e))},e=>{r||(r=!0,n(e))},{enableHighAccuracy:!1,timeout:6e3,maximumAge:6e4})},a=setTimeout(i,e);navigator.geolocation.getCurrentPosition(e=>{clearTimeout(a),r||(r=!0,t(e))},()=>{clearTimeout(a),r||i()},{enableHighAccuracy:!0,timeout:e,maximumAge:0})})}async function D(e,t){return(await(await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e}&lon=${t}&zoom=18&addressdetails=1`)).json()).display_name||``}function O(e,t){return`https://www.google.com/maps?q=${encodeURIComponent(`${e},${t}`)}`}function te(e){return e?.customer_lat!=null&&e?.customer_lng!=null?O(e.customer_lat,e.customer_lng):`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e?.location||``)}`}function k(e,t=`Loading...`){if(!e)return()=>{};let n=e.innerHTML;return e.disabled=!0,e.classList.add(`is-loading`),e.innerHTML=`<span class="btn-spinner"></span><span>${t}</span>`,()=>{e.disabled=!1,e.classList.remove(`is-loading`),e.innerHTML=n}}async function A(e,t,r,i,a){let o=k(e,`Loading`);try{await Fe(t,r,i,a)}catch(e){console.error(e),n(`Could not open service manager`,`error`)}finally{o()}}var j={none:`Not started`,awaiting_parts:`⏳ Awaiting Parts`,repair_progress:`🔧 In Repair`,ready_return:`📦 Ready to Return`,returned:`✅ Returned`,taken:`📸 Taken`};async function ne(e,t,i={}){let a=e.querySelector(`#devices-in-service-card`),o=e.querySelector(`#devices-in-service-list`);if(!a||!o)return;if(!await w()){a.dataset.hasDevices=`0`,i.deferShow||(a.style.display=`none`);return}let{data:s}=await y(t),c=(s||[]).filter(e=>Number(e.device_service_enabled)===1);if(c.length===0){a.dataset.hasDevices=`0`,i.deferShow||(a.style.display=`none`);return}o.innerHTML=c.map(e=>{let t=e.follow_up_status&&e.follow_up_status!==`none`?e.follow_up_status:e.device_taken_logs?`taken`:`none`;return`
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid var(--border);border-radius:12px;margin-bottom:8px;">
        <div style="min-width:0;">
          <div style="font-weight:700;font-size:0.9rem;color:var(--primary);">${U(e.ticket_no||`—`)}</div>
          <div style="font-size:0.82rem;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${U(e.full_name||`Client`)} · ${U(e.service_item||`Service`)}</div>
          <span class="badge" style="margin-top:4px;display:inline-block;">${j[t]||t}</span>
        </div>
        <button class="btn btn-secondary btn-sm dev-manage-btn" data-id="${e.id}" data-status="${W(e.status||`in_progress`)}">Manage</button>
      </div>`}).join(``),a.dataset.hasDevices=`1`,i.deferShow||(a.style.display=`block`);try{let e=c.filter(e=>(e.follow_up_status||`none`)!==`returned`),i=`dev_reminder_${t}_${new Date().toISOString().slice(0,10)}`;e.length&&!localStorage.getItem(i)&&(localStorage.setItem(i,`1`),r({title:`Device follow-up reminder`,body:`You have ${e.length} device(s) in service. Please update their status today.`,type:`alert`,tag:`device-followup-daily`}),n(`Reminder: update follow-up for ${e.length} device(s) in service`,`info`))}catch{}o.querySelectorAll(`.dev-manage-btn`).forEach(n=>{n.onclick=()=>A(n,null,n.dataset.id,n.dataset.status,()=>{document.querySelector(`#task-list`)?Y(e):ne(e,t)})})}async function M(e){let{data:{user:t}}=await f.auth.getUser();if(!t){e.innerHTML=`<p>Please sign in.</p>`;return}if(!await w()){e.innerHTML=`
      <div class="page-header"><div><h1>Device Follow-up</h1></div></div>
      <div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--text-dim)">Device tracking is currently turned off by admin.</div></div>`;return}e.innerHTML=`
    <div class="page-header">
      <div>
        <h1 style="display:flex;align-items:center;gap:10px;">
          <span style="width:26px;height:26px;display:inline-flex;color:var(--primary);">${u.wrench}</span>
          <span>Device Follow-up</span>
        </h1>
        <p>Update the progress of devices you have taken for service.</p>
      </div>
    </div>
    <div id="fu-list"><div style="text-align:center;padding:30px;color:var(--text-dim);">Loading…</div></div>`;let r=e.querySelector(`#fu-list`),{data:i}=await y(t.id),a=(i||[]).filter(e=>Number(e.device_service_enabled)===1||e.device_taken_logs);if(a.length===0){r.innerHTML=`<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--text-dim)">No devices in service right now. Take a device from a ticket's <b>Device Service</b> tab to start tracking.</div></div>`;return}let o=await Promise.all(a.map(e=>b(e.id)));r.innerHTML=a.map((e,t)=>{let n=o[t]?.data?.device_follow_up_logs||[];return`
      <div class="card" style="margin-bottom:14px;" data-inq="${W(e.id)}">
        <div class="card-header"><span class="card-title">${U(e.ticket_no||`—`)} · ${U(e.full_name||`Client`)}</span></div>
        <div class="card-body">
          <div style="font-size:0.85rem;color:var(--text-soft);margin-bottom:12px;">${U(e.service_item||`Service`)}</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px 18px;background:var(--bg-soft);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:14px;font-size:0.84rem;">
            ${[[`Customer`,e.full_name],[`Phone`,e.phone],[`Company`,e.company_name],[`Address`,e.address],[`Device`,e.device_type],[`Serial No`,e.device_serial_no],[`Preferred Time`,e.preferred_time],[`Bill No`,e.bill_no]].filter(([,e])=>e).map(([e,t])=>`
              <div><div style="color:var(--text-dim);font-weight:600;font-size:0.72rem;text-transform:uppercase;letter-spacing:.04em;">${e}</div><div>${U(t)}</div></div>
            `).join(``)}
          </div>
          <div class="form-group">
            <label>Update follow-up status</label>
            <select class="fu-status">
              <option value="awaiting_parts">⏳ Awaiting Parts</option>
              <option value="repair_progress">🔧 Repair in Progress</option>
              <option value="ready_return">📦 Ready to Return</option>
              <option value="returned">✅ Returned to Client</option>
            </select>
          </div>
          <div class="form-group">
            <label>Notes</label>
            <textarea class="fu-notes" rows="2" placeholder="Latest update on this device..."></textarea>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm fu-save" data-inq="${W(e.id)}">Add update</button>
            <button class="btn btn-secondary btn-sm fu-open" data-inq="${W(e.id)}" data-status="${W(e.status||`in_progress`)}">Open ticket to complete service</button>
          </div>
          <div class="fu-history" style="margin-top:14px;">${S(n)}</div>
        </div>
      </div>`}).join(``),r.querySelectorAll(`.fu-save`).forEach(e=>{e.onclick=async()=>{let r=e.closest(`[data-inq]`),i=e.dataset.inq,a=r.querySelector(`.fu-status`).value,o=r.querySelector(`.fu-notes`).value.trim();e.disabled=!0,e.textContent=`Saving…`;let{error:s}=await m(i,a,o,t.id);if(e.disabled=!1,e.textContent=`Add update`,s)return n(s.message||`Could not save`,`error`);n(`Follow-up update added`,`success`);let{data:c}=await b(i),l=r.querySelector(`.fu-history`);l&&(l.innerHTML=S(c?.device_follow_up_logs||[]));let u=r.querySelector(`.fu-notes`);u&&(u.value=``)}}),r.querySelectorAll(`.fu-open`).forEach(t=>{t.onclick=()=>A(t,null,t.dataset.inq,t.dataset.status,()=>M(e))})}var N={name:`Networking Experts`,tagline:`Service | Installation | Support`,address:`Srinagar, J&K, India`,phone:`+91 8899133144`,email:`support@networkingexperts.in`,gstin:`-`};function P(e){return e===`closed`?`resolved`:e||`open`}function re(e){let t=P(e);return{pending:`received`,open:`received`,assigned:`assigned`,in_progress:`in progress`,resolved:`resolved`,issue_not_resolved:`issue not resolved`,case_closed:`case closed`,foc:`FOC (free)`}[t]||t.replace(`_`,` `)}var F=null;function I(e){return new Promise((t,n)=>{let r=0,i=()=>{let a=e[r++];if(!a)return n(Error(`Could not load PDF library`));let o=document.querySelector(`script[data-pdf-src="${a}"]`);if(o?.dataset.loaded===`true`)return t();let s=o||document.createElement(`script`);s.src=a,s.async=!0,s.dataset.pdfSrc=a,s.onload=()=>{s.dataset.loaded=`true`,t()},s.onerror=()=>{s.remove(),i()},o||document.head.appendChild(s)};i()})}function L(){return window.html2canvas&&(window.jspdf?.jsPDF||window.jsPDF)?Promise.resolve({html2canvas:window.html2canvas,jsPDF:window.jspdf?.jsPDF||window.jsPDF}):F||(F=(async()=>{await I([`https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js`,`https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js`,`https://unpkg.com/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js`]).catch(()=>{}),window.html2canvas||await I([`https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js`,`https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js`,`https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js`]),window.jspdf?.jsPDF||window.jsPDF||await I([`https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js`,`https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js`,`https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js`]);let e=window.html2canvas,t=window.jspdf?.jsPDF||window.jsPDF;if(!e||!t)throw Error(`PDF renderer did not load correctly`);return{html2canvas:e,jsPDF:t}})().catch(e=>{throw F=null,e}),F)}function R(e){let t=new URL(`/assets/logo-Cuxe_Kd5.png`,``+import.meta.url).href,n=e=>`₹`+Math.round(Number(e)||0).toString().replace(/\B(?=(\d{3})+(?!\d))/g,`,`),r=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),i=new Date,a=`${i.getDate().toString().padStart(2,`0`)}/${(i.getMonth()+1).toString().padStart(2,`0`)}/${i.getFullYear()}`,o=`NX-${(e.customer?.ticket_no||Date.now()).toString().slice(-8)}`,s=Array.isArray(e.services)?e.services:[],c=s.map((e,t)=>`
    <tr style="display:table-row !important;">
      <td style="display:table-cell !important; padding:10px; border-bottom:1px solid #eee; color:#9CA3AF; width:30px;">${t+1}</td>
      <td style="display:table-cell !important; padding:10px; border-bottom:1px solid #eee; color:#1F2937;">${r(e.name)}</td>
      <td style="display:table-cell !important; padding:10px; border-bottom:1px solid #eee; color:#0F172A; text-align:right; font-weight:700;">${n(e.cost)}</td>
    </tr>`).join(``)||`<tr style="display:table-row !important;"><td colspan="3" style="display:table-cell !important; text-align:center;color:#9CA3AF;padding:20px;">No itemised services</td></tr>`,l=Number(e.extra)>0?`
    <tr style="display:table-row !important;">
      <td style="display:table-cell !important; padding:10px; border-bottom:1px solid #eee; color:#9CA3AF;">${s.length+1}</td>
      <td style="display:table-cell !important; padding:10px; border-bottom:1px solid #eee; color:#1F2937;">Additional charges${e.extraReason?` <small style="color:#6B7280">(${r(e.extraReason)})</small>`:``}</td>
      <td style="display:table-cell !important; padding:10px; border-bottom:1px solid #eee; color:#0F172A; text-align:right; font-weight:700;">${n(e.extra)}</td>
    </tr>`:``,u=(e,t,{color:n=`#374151`,bold:r=!1,border:i=``,total:a=!1}={})=>`
    <div style="display:flex !important; align-items:center !important; justify-content:space-between !important; gap:16px !important; min-height:${a?`38px`:`28px`} !important; ${i}">
      <span style="display:block !important; flex:1 1 auto !important; color:${n} !important; font-weight:${r?`700`:`400`} !important;">${e}</span>
      <span style="display:block !important; flex:0 0 112px !important; width:112px !important; color:${a?`#10B981`:n} !important; font-weight:${a?`900`:`700`} !important; text-align:right !important; white-space:nowrap !important;">${t}</span>
    </div>`,d=[u(`Services subtotal`,n(e.servicesSubtotal)),Number(e.extra)>0?u(`Extra charges`,n(e.extra)):``,u(`Platform fee`,n(e.platform)),u(`Transport`,n(e.transport)),u(`Taxable`,n(e.taxable),{bold:!0,border:`border-top:1px solid #eee !important; padding-top:5px !important;`}),u(`GST (18%)`,n(e.gst)),Number(e.discount)>0?u(r(e.discountLabel||`Discount`),`-${n(e.discount)}`,{color:`#059669`}):``,u(`Total`,n(e.total),{bold:!0,total:!0,border:`border-top:2px solid #10B981 !important; margin-top:2px !important;`})].join(``);return`
  <div class="premium-bill" id="premium-bill-print" style="font-family:Arial, sans-serif !important; background:#ffffff !important; color:#0F172A !important; padding:40px !important; width:794px !important; box-sizing:border-box !important; display:block !important; visibility:visible !important; opacity:1 !important;">
    <div class="pb-header" style="display:flex !important; flex-direction:row !important; justify-content:space-between !important; align-items:center !important; border-bottom:1px dashed #eee !important; padding-bottom:20px !important; margin-bottom:20px !important;">
      <div class="pb-brand" style="display:flex !important; align-items:center !important; gap:12px !important;">
        <img src="${t}" alt="${N.name}" style="width:50px; height:50px; object-fit:contain;" onerror="this.style.display='none'"/>
        <div>
          <div style="font-size:20px; font-weight:800; color:#064E3B;">${N.name}</div>
          <div style="font-size:11px; color:#6B7280; text-transform:uppercase; letter-spacing:1px;">${N.tagline}</div>
        </div>
      </div>
      <div class="pb-meta" style="text-align:right !important;">
        <div style="display:inline-block; background:#10B981; color:#fff; padding:4px 12px; border-radius:20px; font-size:10px; font-weight:800; margin-bottom:8px;">TAX INVOICE</div>
        <div style="font-size:12px; color:#4B5563;">Bill # <b style="color:#0F172A;">${r(o)}</b></div>
        <div style="font-size:12px; color:#4B5563;">Date: <b style="color:#0F172A;">${a}</b></div>
      </div>
    </div>

    <div class="pb-parties" style="display:grid !important; grid-template-columns:1fr 1fr !important; gap:30px !important; margin-bottom:20px !important; border-bottom:1px dashed #eee !important; padding-bottom:20px !important;">
      <div>
        <div style="font-size:10px; font-weight:800; color:#10B981; text-transform:uppercase; margin-bottom:6px;">Billed To</div>
        <div style="font-size:16px; font-weight:800; color:#0F172A;">${r(e.customer?.name||`-`)}</div>
        <div style="font-size:13px; color:#4B5563;">${r(e.customer?.phone||``)}</div>
        ${e.customer?.company?`<div style="font-size:13px; color:#4B5563;">${r(e.customer.company)}</div>`:``}
        <div style="font-size:13px; color:#6B7280; font-style:italic;">${r(e.customer?.location||``)}</div>
      </div>
      <div>
        <div style="font-size:10px; font-weight:800; color:#10B981; text-transform:uppercase; margin-bottom:6px;">Service Details</div>
        <div style="font-size:13px; color:#4B5563;"><b>Ticket:</b> ${r(e.customer?.ticket_no||`-`)}</div>
        <div style="font-size:13px; color:#4B5563;"><b>Service:</b> ${r(e.customer?.service_item||`-`)}</div>
        ${e.customer?.device_type?`<div style="font-size:13px; color:#4B5563;"><b>Device:</b> ${r(e.customer.device_type)}</div>`:``}
        ${e.technician?`<div style="font-size:13px; color:#4B5563;"><b>Technician:</b> ${r(e.technician)}</div>`:``}
      </div>
    </div>

    <table style="width:100% !important; border-collapse:collapse !important; margin-bottom:20px !important; display:table !important;">
      <thead>
        <tr style="background:#f9fafb; border-bottom:2px solid #10B981; display:table-row !important;">
          <th style="display:table-cell !important; padding:12px; text-align:left; font-size:11px; color:#064E3B; text-transform:uppercase; width:30px;">#</th>
          <th style="display:table-cell !important; padding:12px; text-align:left; font-size:11px; color:#064E3B; text-transform:uppercase;">Description</th>
          <th style="display:table-cell !important; padding:12px; text-align:right; font-size:11px; color:#064E3B; text-transform:uppercase;">Amount</th>
        </tr>
      </thead>
      <tbody style="display:table-row-group !important;">${c}${l}</tbody>
    </table>

    <div style="margin-left:auto; width:300px; background:#f9fafb; padding:15px; border-radius:12px; display:block !important;">
      <div style="display:inline-block; background:#10B981; color:#fff; padding:3px 10px; border-radius:15px; font-size:9px; font-weight:800; margin-bottom:12px;">AMOUNT BREAKDOWN</div>
      <div style="display:block !important; width:100% !important; font-size:13px !important; color:#374151 !important;">${d}</div>
    </div>

    ${e.paymentLink?`
      <div style="margin-top:20px; padding:20px; border:1px dashed #10B981; border-radius:12px; text-align:center; background:rgba(16,185,129,0.02);">
        <div style="font-weight:800; font-size:11px; color:#064E3B; text-transform:uppercase; margin-bottom:10px;">Secure Payment</div>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(e.paymentLink)}" style="width:120px; height:120px; margin:0 auto 10px; display:block; border-radius:8px;"/>
        <div style="font-size:11px; color:#2563EB; word-break:break-all;">${r(e.paymentLink)}</div>
      </div>`:``}

    <div style="margin-top:30px; padding-top:20px; border-top:1px dashed #eee; text-align:center;">
      <div style="font-weight:800; color:#10B981; font-size:14px;">Thank you for your business!</div>
      <div style="font-size:11px; color:#6B7280; margin-top:5px;">
        ${N.address} | ${N.phone} | ${N.email}
      </div>
      <div style="font-size:10px; color:#9CA3AF; margin-top:5px;">GSTIN: ${N.gstin} | Computer Generated Invoice</div>
    </div>
  </div>`}async function ie(e,t){let n=document.createElement(`div`);n.setAttribute(`aria-hidden`,`true`),n.classList.add(`pdf-rendering`),n.style.width=`794px`,n.style.cssText=[`position:fixed`,`left:-9999px`,`top:0`,`width:794px`,`min-height:1123px`,`background:#ffffff`,`pointer-events:none`,`z-index:-1`].join(`;`);let r=document.createElement(`div`);r.style.cssText=`width:794px;min-height:1123px;background:#ffffff;padding:0;box-sizing:border-box;`,r.innerHTML=e,n.appendChild(r),document.body.appendChild(n),await new Promise(e=>requestAnimationFrame(()=>requestAnimationFrame(e))),await new Promise(e=>setTimeout(e,50));let i=[...r.querySelectorAll(`img`)];await Promise.all(i.map(e=>e.complete&&e.naturalWidth>0?Promise.resolve():new Promise(t=>{e.addEventListener(`load`,t,{once:!0}),e.addEventListener(`error`,t,{once:!0}),setTimeout(t,2500)})));try{let{html2canvas:e,jsPDF:n}=await L(),i=r.firstElementChild;i.style.display=`block`,i.style.overflow=`visible`,i.style.position=`relative`,i.style.width=`794px`,i.style.maxWidth=`794px`,i.style.minHeight=`1123px`;let a=await e(i,{scale:2,useCORS:!0,allowTaint:!1,backgroundColor:`#ffffff`,logging:!1,windowWidth:794,width:794,height:i.scrollHeight,scrollX:0,scrollY:0}),o=new n({unit:`px`,format:[794,1123],orientation:`portrait`,hotfixes:[`px_scaling`]}),s=o.internal.pageSize.getWidth(),c=o.internal.pageSize.getHeight(),l=s,u=a.height*l/a.width,d=a.toDataURL(`image/jpeg`,1),f=u,p=0;for(o.addImage(d,`JPEG`,0,p,l,u,void 0,`FAST`),f-=c;f>0;)p-=c,o.addPage([794,1123],`portrait`),o.addImage(d,`JPEG`,0,p,l,u,void 0,`FAST`),f-=c;let m=o.output(`blob`);return{blob:m,file:new File([m],t,{type:`application/pdf`})}}finally{n.remove()}}function ae(e,t){let n=window.open(``,`_blank`,`width=900,height=1200`);if(!n)throw Error(`Allow popups to print or save this bill as PDF`);n.opener=null;let r=String(t||`invoice.pdf`).replace(/[<>&"]/g,``);n.document.open(),n.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${r}</title>
  <style>
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; background: #ffffff; }
    body {
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-shell { width: 794px; min-height: 1123px; background: #ffffff; }
    @media print {
      body { display: block; }
      .print-shell { width: 100%; min-height: auto; }
    }
  </style>
</head>
<body>
  <div class="print-shell">${e}</div>
  <script>
    const finish = () => setTimeout(() => window.print(), 150);
    const images = Array.from(document.images || []);
    if (!images.length) finish();
    else Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve;
      setTimeout(resolve, 2500);
    }))).then(finish);
  <\/script>
</body>
</html>`),n.document.close()}function z(e){let t=e.querySelector(`#bill-preview-stage`),n=e.querySelector(`#bill-preview-container`),r=e.querySelector(`.modal-body`);if(!t||!n||!r)return;n.style.transform=`scale(1)`,t.style.height=`auto`;let i=Math.max(260,r.clientWidth-16),a=Math.min(1,i/794);n.style.transform=`scale(${a})`,t.style.height=`${n.offsetHeight*a}px`}function oe(e){return new Promise((t,n)=>{let r=new FileReader;r.onload=()=>{let e=String(r.result||``);t(e.includes(`,`)?e.slice(e.indexOf(`,`)+1):e)},r.onerror=()=>n(r.error||Error(`Could not read PDF blob`)),r.readAsDataURL(e)})}async function se(e,t,n){let r=await oe(e),i=localStorage.getItem(`auth_token`),a=await fetch(`/api/bills/upload`,{method:`POST`,headers:{"Content-Type":`application/json`,Authorization:`Bearer ${i}`},body:JSON.stringify({dataBase64:r,filename:t,inquiry_id:n||null})});if(!a.ok){let e=await a.json().catch(()=>({}));throw Error(e.error||`Upload failed`)}let{url:o}=await a.json();return o}async function ce(e,t){let n=localStorage.getItem(`auth_token`),r=`Invoice-${e.customer?.ticket_no||`service`}.pdf`,i=await fetch(`/api/bills/generate`,{method:`POST`,headers:{"Content-Type":`application/json`,Authorization:`Bearer ${n}`},body:JSON.stringify({billData:e,inquiry_id:t||null,filename:r})});if(!i.ok){let e=await i.json().catch(()=>({}));throw Error(e.error||`Server PDF generation failed`)}let{url:a}=await i.json();return a}async function le(e,{inquiryId:t=null,existingUrl:n=null}={}){if(n)return n;try{return await ce(e,t)}catch(n){console.warn(`[bill] server PDF unavailable, using browser render:`,n.message);let r=R(e),i=`Invoice-${e.customer?.ticket_no||`service`}.pdf`,{blob:a}=await ie(r,i);return se(a,i,t)}}function ue(e,t){let n=e=>`₹${Math.round(Number(e)||0).toLocaleString(`en-IN`)}`,r=Array.isArray(e.services)?e.services:[],i=[`Hi ${e.customer?.name||`Customer`}!`,`Your service invoice from *${N.name}* is ready.`,`Ticket: *${e.customer?.ticket_no||`-`}*`,`Device: *${e.customer?.device_type||`General Service`}*`,``,`*Bill Breakdown:*`];return r.length?r.forEach((e,t)=>i.push(`${t+1}. ${e.name}: *${n(e.cost)}*`)):i.push(`- Services Subtotal: *${n(e.servicesSubtotal)}*`),e.extra>0&&i.push(`- Additional Charges: *${n(e.extra)}*${e.extraReason?` (${e.extraReason})`:``}`),i.push(`- Platform Fee: *${n(e.platform)}*`),e.km>0&&i.push(`- Transport (${e.km} km): *${n(e.transport)}*`),e.discount>0&&i.push(`- Discount: *-${n(e.discount)}*${e.discountLabel?` (${e.discountLabel})`:``}`),i.push(`- GST (18%): *${n(e.gst)}*`,`------------------------------`,`*Total Payable: ${n(e.total)}*`,`------------------------------`,`Payment Status: *${String(e.paymentStatus||`unpaid`).toUpperCase()}*`),t&&i.push(``,`View / download your invoice (PDF):`,t),e.paymentStatus!==`paid`&&e.paymentLink&&i.push(``,`Pay here:`,e.paymentLink),i.push(``,`- ${N.name}`),i.join(`
`)}function de(e,t={}){let{onSent:r,allowShare:i=!0,title:a=`Service Invoice Preview`,inquiryId:o=null,existingPdfUrl:s=null}=t,c=R(e),l=document.createElement(`div`);l.className=`modal-overlay premium-bill-modal`,l.innerHTML=`
    <div class="modal-card modal-large">
      <div class="modal-header">
        <h3>${a}</h3>
        <button type="button" class="modal-close premium-bill-close" id="pb-close" title="Close bill" aria-label="Close bill">${u.close}</button>
      </div>
      <div class="modal-body" style="background:#F8FAFC; padding:20px; overflow-x:auto;">
        <div id="bill-preview-stage" style="width:100%; display:flex; justify-content:center;">
          <div id="bill-preview-container" style="background:white; box-shadow:0 10px 25px -5px rgba(0,0,0,0.1); border-radius:8px; width:794px; margin:0 auto; transform-origin: top center;">
            ${c}
          </div>
        </div>
      </div>
      <div class="modal-footer" style="gap:12px;">
        <button class="btn btn-secondary" id="pb-cancel">Close</button>
        <button class="btn btn-secondary" id="pb-print">Print / Save PDF</button>
        ${i?`<button class="btn btn-primary" id="pb-whatsapp">${u.whatsapp}<span>Send via WhatsApp</span></button>`:``}
      </div>
    </div>`,document.body.appendChild(l),requestAnimationFrame(()=>z(l));let d=()=>z(l);window.addEventListener(`resize`,d);let f=e=>{e.key===`Escape`&&p()},p=()=>{window.removeEventListener(`resize`,d),window.removeEventListener(`keydown`,f),l.remove()};window.addEventListener(`keydown`,f),l.querySelector(`#pb-close`).onclick=p,l.querySelector(`#pb-cancel`).onclick=p,l.addEventListener(`click`,e=>{e.target===l&&p()});let m=`Invoice-${e.customer?.ticket_no||`service`}.pdf`;l.querySelector(`#pb-print`).onclick=()=>{try{ae(c,m)}catch(e){console.error(e),n(e.message||`Could not open print window`,`error`)}},i&&(l.querySelector(`#pb-whatsapp`).onclick=async()=>{let t=l.querySelector(`#pb-whatsapp`);t.disabled=!0;let i=t.innerHTML,a=(e.customer?.phone||``).replace(/\D/g,``);if(!a){n(`Client phone number is missing on this inquiry`,`error`),t.disabled=!1,t.innerHTML=i;return}try{t.innerHTML=`<span>... preparing PDF</span>`;let i=await le(e,{inquiryId:o,existingUrl:s}),c=ue(e,i),l=`https://wa.me/${a}?text=${encodeURIComponent(c)}`;if(window.open(l,`_blank`),n(`WhatsApp opened with PDF link - send the message to the client.`,`success`),typeof r==`function`)try{await r(i)}catch{}}catch(e){console.error(e),n(e.message||`Could not send bill`,`error`)}finally{t.disabled=!1,t.innerHTML=i}})}function fe(e=new Date){return e.toLocaleDateString(`en-CA`).slice(0,7)}function B(e){if(!e)return``;if(e instanceof Date)return Number.isNaN(e.getTime())?``:e.toLocaleDateString(`en-CA`);let t=String(e).trim(),n=/^(\d{4}-\d{2}-\d{2})/.exec(t);if(n)return n[1];let r=new Date(t.replace(` `,`T`));return Number.isNaN(r.getTime())?``:r.toLocaleDateString(`en-CA`)}function pe(e){return B(e?.date||e?.clock_in)}function me(e,t){if(!e||!t)return 0;let n=B(e),r=B(t);if(!n||!r)return 0;let i=new Date(`${n}T00:00:00`),a=new Date(`${r}T00:00:00`);return Number.isNaN(i.getTime())||Number.isNaN(a.getTime())||a<i?0:Math.floor((a-i)/864e5)+1}function he(e,t){if(!e||!t)return null;let n=new Date(t)-new Date(e);return!Number.isFinite(n)||n<0?null:`${Math.floor(n/36e5)}h ${Math.floor(n%36e5/6e4)}m`}var ge=`18:00`,V=4;function _e(e=ge){let t=/^(\d{1,2}):(\d{2})$/.exec(String(e||``).trim());if(!t)return{hour:18,minute:0,label:`18:00`};let n=Math.min(23,Math.max(0,Number(t[1]))),r=Math.min(59,Math.max(0,Number(t[2])));return{hour:n,minute:r,label:`${String(n).padStart(2,`0`)}:${String(r).padStart(2,`0`)}`}}async function ve(){let e=window.location.hostname!==`localhost`&&window.location.hostname!==`127.0.0.1`?`/api`:`http://localhost:5000/api`;try{let t=await fetch(`${e}/settings/attendance`,{headers:{Authorization:`Bearer ${localStorage.getItem(`auth_token`)||``}`}});t.ok&&(ge=_e((await t.json()).autoClockOutTime).label)}catch(e){console.warn(`[employee] could not load clock-out settings`,e)}return _e()}function ye(e=new Date){let{hour:t,minute:n}=_e(),r=new Date(e);return r.setHours(t,n,0,0),e>=r}var be=8,xe=30;function Se(e=new Date){let t=new Date(e);return t.setHours(be,xe,0,0),e<t}function Ce(e,t=new Date().toLocaleDateString(`en-CA`)){return!e?.clock_in||e?.clock_out?!1:pe(e)!==t||ye()}function we(e=[],t=[],n=new Date().toLocaleDateString(`en-CA`)){let r=new Set((t||[]).map(e=>B(e.date||e.created_at)).filter(Boolean));return(e||[]).filter(e=>{let t=pe(e);return!e?.clock_in||!t||r.has(t)?!1:t!==n||ye()})}function H(e){return`\u20B9${Math.round(Number(e)||0).toLocaleString(`en-IN`)}`}function Te(e,t){let n=e?.created_at||e?.inquiries?.[0]?.created_at||0,r=t?.created_at||t?.inquiries?.[0]?.created_at||0;return new Date(r)-new Date(n)}function Ee(e,t=new Date){if(!e)return`-`;let n=new Date(e),r=new Date(t);if(Number.isNaN(n.getTime())||Number.isNaN(r.getTime()))return`-`;let i=Math.max(0,r.getTime()-n.getTime()),a=Math.floor(i/864e5),o=Math.floor(i%864e5/36e5),s=Math.floor(i%36e5/6e4);return a?`${a}d ${o}h`:o?`${o}h ${s}m`:`${s}m`}function U(e){return String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e])}function W(e){return U(e)}function De(e){let t=Math.round(Number(e)||0);return Array.from({length:5},(e,n)=>`<span style="color:${n<t?`var(--warning)`:`var(--border)`};display:inline-flex;width:14px;height:14px">${n<t?u.star:u.starOutline}</span>`).join(``)}async function Oe(){let{data:{user:e}}=await f.auth.getUser();if(!e)return{user:null};let[{data:t},{data:n},{data:r},{data:i}]=await Promise.all([f.from(`profiles`).select(`*`).eq(`id`,e.id).maybeSingle(),f.from(`attendance`).select(`*`).eq(`user_id`,e.id).order(`date`,{ascending:!1}),f.from(`leave_requests`).select(`*`).eq(`employee_id`,e.id).order(`created_at`,{ascending:!1}),f.from(`eod_reports`).select(`*`).eq(`employee_id`,e.id).order(`date`,{ascending:!1})]);return{user:e,profile:t||e,attendance:n||[],leaves:r||[],reports:i||[]}}async function ke(e){let{read:t,utils:n}=await p(async()=>{let{read:e,utils:t}=await import(`https://cdn.sheetjs.com/xlsx-0.18.5/package/xlsx.mjs`);return{read:e,utils:t}},[]),r=t(await e.arrayBuffer()),i=r.Sheets[r.SheetNames[0]];if(!i)return[];let a=n.sheet_to_json(i,{header:1});return a.length>1?a.slice(1):[]}async function Ae(e){let t=0,n=0,r=[],i=[];for(let t of e){let[e,r,a,o]=Array.isArray(t)?t:[t.category,t.sub_category,t.sub_sub_category,t.cost];if(!e||!a){n++;continue}let s=parseFloat(o)||0;if(s<0){n++;continue}i.push({id:crypto.randomUUID?.()||`svc-${Date.now()}-${Math.random()}`,category:String(e).trim(),sub_category:r?String(r).trim():null,sub_sub_category:String(a).trim(),name:String(a).trim(),cost:s})}for(let e=0;e<i.length;e+=10){let a=i.slice(e,e+10),o=0;for(;o<3;){let{error:e}=await f.from(`service_pricing`).insert(a);if(e?.status===429){o++,await new Promise(e=>setTimeout(e,1e3*2**o));continue}e?(r.push(e.message),n+=a.length):t+=a.length;break}o===3&&(r.push(`Rate limited - batch skipped`),n+=a.length)}return{inserted:t,skipped:n,errors:r}}function G(){let e=[[`Main Category`,`Sub Category`,`Sub-Sub Category`,`Price`],[`Network Installation`,`Setup`,`Basic Setup`,`500`],[`Network Installation`,`Setup`,`Advanced Setup`,`1000`],[`Repair`,`Hardware`,`Cable Replacement`,`300`]].map(e=>e.map(e=>`"${e}"`).join(`,`)).join(`
`),t=new Blob([e],{type:`text/csv`}),n=URL.createObjectURL(t),r=document.createElement(`a`);r.href=n,r.download=`service-pricing-template.csv`,r.click(),URL.revokeObjectURL(n)}async function K(e){a(e);let{data:{user:t}}=await f.auth.getUser();if(!t){e.innerHTML=`<p>Please sign in.</p>`;return}let s=new Date().toLocaleDateString(`en-CA`),c=await ve(),d,p=[],m=[],h,g,_=[],v=[],y=[],b=[],x=[];try{let e=await Promise.all([f.from(`attendance`).select(`*`).eq(`user_id`,t.id).eq(`date`,s).maybeSingle(),f.from(`tickets`).select(`*, inquiries(*)`).eq(`assigned_to`,t.id).order(`created_at`,{ascending:!1}),f.from(`eod_reports`).select(`*`).eq(`employee_id`,t.id).eq(`date`,s).maybeSingle(),f.from(`inquiries`).select(`*`).eq(`assigned_employee_id`,t.id).in(`assignment_status`,[`pending`,`accepted`]).order(`created_at`,{ascending:!1}),f.from(`attendance`).select(`*`).eq(`user_id`,t.id).order(`date`,{ascending:!1}),f.from(`notices`).select(`*`).eq(`active`,1).order(`created_at`,{ascending:!1}),f.from(`eod_reports`).select(`*`).eq(`employee_id`,t.id).order(`date`,{ascending:!1}),f.from(`inquiries`).select(`feedback_rating,employee_rating,feedback_employee_id,assigned_employee_id,feedback_at,updated_at`),f.from(`profiles`).select(`id,full_name,role`)]);d=e[0].data,h=e[1].data,g=e[2].data,b=(e[7]?.data||[]).filter(e=>e.feedback_rating!=null),x=e[8]?.data||[],p=e[4].data||[],y=(e[5].data||[]).filter(e=>!e.expires_at||new Date(e.expires_at)>=new Date).slice(0,4),m=e[6].data||[];let n=e[3].data||[],r=new Map;n.forEach(e=>{e.ticket_id&&r.set(String(e.ticket_id),e)});let i=(h||[]).filter(e=>!(e.inquiries&&e.inquiries.length)&&!r.has(String(e.id))).map(e=>e.id).filter(Boolean);if(i.length){let{data:e}=await f.from(`inquiries`).select(`*`).in(`ticket_id`,i);(e||[]).forEach(e=>{e.ticket_id&&r.set(String(e.ticket_id),e)})}h=(h||[]).map(e=>{if(e.inquiries&&e.inquiries.length)return e;let t=r.get(String(e.id));return t?{...e,inquiries:[t]}:e});let a=new Set((h||[]).map(e=>e.inquiries?.[0]?.id).filter(Boolean));_=n.filter(e=>e.assignment_status===`pending`).sort(Te),v=n.filter(e=>e.assignment_status===`accepted`&&!a.has(e.id)&&![`resolved`,`closed`,`case_closed`,`paid`,`foc`,`issue_not_resolved`].includes(e.status)).sort(Te).map(e=>({...e,_company:e.company_name||null}))}catch(t){e.innerHTML=`<div class="card"><div class="card-body" style="text-align:center;padding:40px;"><h3 style="color:var(--danger);display:inline-flex;align-items:center;gap:8px;">${u.alert}<span>Error</span></h3><p>${t.message}</p></div></div>`;return}let S=h||[],C=new Set([`resolved`,`case_closed`,`foc`,`paid`]),w=S.filter(e=>{let t=P(e.status);if(C.has(t))return!1;let n=e.inquiries?.[0];return n?n.assignment_status===`accepted`&&!C.has(P(n.status)):t===`assigned`||t===`in_progress`||t===`open`}),T=!!d?.clock_in,E=!!d?.clock_out,O=ye(),k=T&&!E,j=we(p,m,s),M=j.length>=V,N=[...w,...v].sort(Te),F=N.filter(e=>P((e.inquiries?.[0]||e).status||e.status)===`in_progress`).length,I=N.length?Math.round(F/N.length*100):0,L=N.filter(e=>Number((e.inquiries?.[0]||e)?.reopened)===1),R=new Map((x||[]).filter(e=>e.role===`employee`).map(e=>[e.id,e])),ie=fe(),ae=(b||[]).filter(e=>String(e.feedback_at||e.updated_at||``).startsWith(ie)),z=new Map;ae.forEach(e=>{let t=e.feedback_employee_id||e.assigned_employee_id;if(!t||!R.has(t))return;let n=Number(e.employee_rating||e.feedback_rating||0);if(!n)return;z.has(t)||z.set(t,{total:0,count:0});let r=z.get(t);r.total+=n,r.count+=1});let oe=[...z.entries()].map(([e,t])=>({id:e,name:R.get(e)?.full_name||`Employee`,avg:t.total/t.count,count:t.count})).sort((e,t)=>t.avg-e.avg||t.count-e.count).map((e,n)=>({...e,rank:n+1,you:e.id===t.id})),se=oe.slice(0,3),ce=oe.find(e=>e.you);ce&&!se.some(e=>e.you)&&se.push(ce),e.innerHTML=`
    <!-- ── Horizontal clock row ── -->
    <div class="card emp-clock-row" style="margin-bottom:18px;">
      <div class="emp-clock-left">
        <div id="live-clock" class="clock-time">--:--:--</div>
        <div class="clock-date">${new Date().toLocaleDateString(`en-US`,{weekday:`long`,day:`numeric`,month:`long`})}</div>
        <div class="chip" style="margin-top:8px;width:fit-content;color:${T&&!E?`var(--accent,var(--primary))`:`var(--text-3,var(--text-dim))`};">
          <i style="width:8px;height:8px;border-radius:50%;background:currentColor;display:inline-block;"></i>
          ${E?`Clocked out`:T?`Clocked in`:`Not started`}
        </div>
        ${T?`<div style="font-size:0.8rem;color:var(--text-dim);margin-top:6px;">Since ${i(d.clock_in)}</div>`:``}
        ${E?`<div class="chip" style="margin-top:8px;width:fit-content;color:var(--accent,var(--primary));">${u.check}<span>${i(d.clock_in)} → ${i(d.clock_out)}</span></div>`:``}
        ${d?.location?`<p class="attendance-location" style="margin-top:8px;justify-content:flex-start;">${u.pin}<span>${U(d.location)}</span></p>`:``}
      </div>
      <div class="emp-clock-right">
        ${T||E||j.length>0?`
          <button class="btn btn-sm emp-eod-btn ${g?`emp-eod-ok`:j.length?M?`emp-eod-err`:`emp-eod-warn`:`emp-eod-ok`}" id="btn-eod-status">
            ${g?u.check:j.length?u.alert:u.clipboard}
            <span>${g?`EOD Submitted`:j.length?M?`Restricted`:`EOD Warning`:`EOD Status`}</span>
          </button>
        `:``}
        ${Se()&&!T?`<p class="attendance-lock-note" style="text-align:center;justify-content:center;margin-bottom:8px;">${u.clock}<span>Clock-in opens at 8:30 AM</span></p>`:``}
        ${O&&!T?`<p class="attendance-lock-note" style="text-align:center;justify-content:center;margin-bottom:8px;">${u.clock}<span>Closed after ${c.label}</span></p>`:``}
        <button class="btn ${k?`btn-danger`:`btn-primary`} emp-clock-toggle" id="btn-clock-toggle" ${E||!k&&(M||O||Se())?`disabled`:``}>
          ${k?u.pause:u.play}
          <span>${E?`Session Done`:k?`Clock Out`:`Clock In`}</span>
        </button>
      </div>
    </div>

    <!-- ── Notice Board ── -->
    <div class="card" style="margin-bottom:18px;">
      <div class="emp-slide-head">
        <span style="display:inline-flex;align-items:center;gap:8px;font-weight:700;">${u.bell} Notice Board</span>
        ${y.length?`<span class="df-badge" style="background:var(--primary);margin-left:4px;">${y.length}</span>`:``}
      </div>
      ${y.length===0?`<p style="margin:10px 18px 14px;font-size:0.87rem;color:var(--text-dim);">No active notices right now.</p>`:`<div class="emp-notices-list">${y.map((e,t)=>`<div class="emp-notice-item" data-notice-idx="${t}" role="button" tabindex="0"><div class="emp-notice-ico">${u.bell}</div><div style="flex:1;min-width:0;"><div class="emp-notice-title">${U(e.title||`Notice`)}</div><div class="emp-notice-date">${o(e.created_at)}</div></div><span style="color:var(--text-dim);flex-shrink:0;">${u.arrowRight}</span></div>`).join(``)}</div>`}
    </div>

    ${_.length?`
      <div class="card list-card" style="margin-bottom:18px;border-color:rgba(245,165,36,0.4);">
        <div class="card-head">
          <h3>${u.alert} Requests Waiting For Accept</h3>
          <span class="chip" style="color:var(--amber, #f5a524);">${_.length} pending</span>
        </div>
        <div class="list">
          ${_.map(e=>`
            <div class="lrow">
              <div class="lrow-ico" style="background:rgba(245,165,36,0.16);color:var(--amber, #f5a524);">${u.alert}</div>
              <div class="lrow-main">
                <b>${U(e.full_name||`Client`)}</b>
                <span class="lsub"><em class="id-mono" style="font-style:normal">${U(e.ticket_no||`No ticket`)}</em> · ${U(e.service_item||`Service request`)} · ${l(e.created_at)}</span>
              </div>
              <button class="btn btn-primary btn-sm accept-btn" data-id="${W(e.id)}" data-ticket-id="${W(e.ticket_id||``)}">${u.check}<span>Accept</span></button>
              <button class="btn btn-secondary btn-sm decline-btn" data-id="${W(e.id)}">${u.close}<span class="hide-sm">Decline</span></button>
            </div>
          `).join(``)}
        </div>
      </div>
    `:``}

    <!-- Today's Route (full-width) -->
    <div class="card" style="margin-bottom:18px;overflow:hidden;">
      <div class="card-head" style="padding:16px 18px 14px;">
        <h3>${u.wrench} Today's Route</h3>
        <span class="chip">${N.length} stop${N.length===1?``:`s`}</span>
      </div>
      ${N.length>0?`
      <div class="route-progress-wrap">
        <div class="route-progress-label">
          <span>${F?`${F} in progress`:`Not started yet`}</span>
          <span>${I}%</span>
        </div>
        <div class="bar"><i style="width:${I}%;"></i></div>
      </div>`:``}
      <div>
        ${N.length===0?`<div style="text-align:center;padding:32px 18px;color:var(--text-3,var(--text-dim));font-size:0.86rem;">No tasks assigned right now.</div>`:N.map((e,t)=>{let n=e.inquiries?.[0]||e,r=e.inquiries?e.id:n.ticket_id||``,i=P(n.status||e.status||`assigned`),a=i===`in_progress`,o=t===N.length-1,s=a?`progress`:i===`assigned`?`assigned`:`open`;return`
              <div class="route-stop">
                <div class="route-track">
                  <div class="route-dot ${a?`route-dot-active`:`route-dot-pending`}">
                    ${a?`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 2a6 6 0 0 1 6 6"/><path d="M8 5v3l2.5 1.5"/></svg>`:`${t+1}`}
                  </div>
                  ${o?``:`<div class="route-line"></div>`}
                </div>
                <div class="route-body">
                  <div class="route-name">${U(n.full_name||e.title||`Service task`)}</div>
                  <div class="route-sub"><em class="id-mono" style="font-style:normal">${U(n.ticket_no||`No ticket`)}</em> · ${U(n.service_item||e.description||`Service request`)}</div>
                  <div class="route-sub" style="margin-top:2px;">${l(n.created_at||e.created_at)}</div>
                  <div class="route-actions">
                    <span class="badge ${s}">${re(n.status||e.status||`assigned`)}</span>
                    <button class="btn btn-secondary btn-sm task-btn" data-id="${W(r)}" data-inq-id="${W(n.id||``)}" data-status="${W(n.status||e.status||`assigned`)}">${u.edit}<span>Open</span></button>
                  </div>
                </div>
              </div>`}).join(``)}
      </div>
    </div>

    ${L.length?`
      <div class="card list-card" style="margin-bottom:18px;border:1px solid var(--warning);">
        <div class="card-head">
          <h3>🔁 Reopened Tickets</h3>
          <span class="chip" style="background:var(--warning);color:#fff;">${L.length}</span>
        </div>
        <div class="list">
          ${L.map(e=>{let t=e.inquiries?.[0]||e,n=e.inquiries?e.id:t.ticket_id||``;return`
            <div class="lrow">
              <div class="lrow-ico" style="color:var(--warning);">${u.refresh}</div>
              <div class="lrow-main">
                <b>${U(t.full_name||e.title||`Client`)}</b>
                <span class="lsub"><em class="id-mono" style="font-style:normal">${U(t.ticket_no||`No ticket`)}</em> · ${U(t.service_item||`Service`)} · free rework</span>
              </div>
              <button class="btn btn-secondary btn-sm task-btn" data-id="${W(n)}" data-inq-id="${W(t.id||``)}" data-status="${W(t.status||e.status||`in_progress`)}">${u.edit}<span>Open</span></button>
            </div>`}).join(``)}
        </div>
      </div>
    `:``}

    ${v.length?`
      <div class="card list-card" style="margin-bottom:18px;">
        <div class="card-head">
          <h3>${u.ticket} Accepted Requests</h3>
          <span class="chip">${v.length}</span>
        </div>
        <div class="list">
          ${v.map(e=>{let t=P(e.status),n=t===`in_progress`?`progress`:t===`resolved`?`resolved`:t===`assigned`?`assigned`:`open`;return`
            <div class="lrow emp-job-card" data-status="${t}">
              <div class="lrow-ico">${u.ticket}</div>
              <div class="lrow-main">
                <b>${U(e.full_name||`Client`)}</b>
                <span class="lsub"><em class="id-mono" style="font-style:normal">${U(e.ticket_no||`No ticket`)}</em> · ${U(e.service_item||`Service request`)} · ${l(e.created_at)}</span>
              </div>
              <span class="badge ${n} hide-sm">${re(e.status)}</span>
              <button class="btn btn-secondary btn-sm task-btn" data-id="${e.ticket_id||``}" data-inq-id="${e.id}" data-status="${e.status}">
                ${u.edit}<span>Update</span>
              </button>
              <button class="btn btn-primary btn-sm" onclick="window.open('${W(te(e))}')">
                ${u.pin}<span class="hide-sm">Map</span>
              </button>
            </div>
          `}).join(``)}
        </div>
      </div>
    `:``}

    <div id="devices-in-service-card" style="display:none;margin-bottom:18px;">
      <div class="card list-card">
        <div class="card-head"><h3>${u.wrench} Devices in Service</h3></div>
        <div id="devices-in-service-list">
          <div style="text-align:center;padding:20px;color:var(--text-3, var(--text-dim));font-size:0.85rem;">Loading…</div>
        </div>
      </div>
    </div>

    <!-- Leave Request (hidden; opened from Attendance page) -->
    <div class="card" style="display:none">
      <div class="card-body">
        <button class="btn btn-secondary btn-wide" id="btn-open-leave-modal">
          ${u.plus}<span>Submit Leave Request</span>
        </button>
      </div>
    </div>
  `;let le=e.querySelector(`#live-clock`),ue=()=>{le&&(le.textContent=new Date().toLocaleTimeString())};ue(),setInterval(ue,1e3);let de=e.querySelector(`#emp-company-tabs`);de&&de.querySelectorAll(`.sr-filter`).forEach(t=>{t.onclick=()=>{de.querySelectorAll(`.sr-filter`).forEach(e=>e.classList.remove(`active`)),t.classList.add(`active`);let n=t.dataset.company;e.querySelectorAll(`.emp-job-card`).forEach(e=>{e.style.display=n===`all`||e.dataset.company===n?``:`none`})}});let B=(t,n)=>{let r=e.querySelector(t);r&&(r.onclick=n)};B(`#btn-clock-toggle`,async()=>{if(k){if(!g){me();return}await pe();return}if(M){n(`Clock-in is restricted because you have 4 or more missed EOD reports. Contact admin.`,`error`);return}if(Se()){n(`Clock-in is not allowed before 8:00 AM.`,`error`);return}if(ye()){n(`Clock-in is closed after ${_e().label}. Please contact admin.`,`error`);return}let r=e.querySelector(`#btn-clock-toggle`);r.disabled=!0,r.innerHTML=`${u.crosshair}<span>Getting location…</span>`;let i=`Unknown`,a={lat:null,lng:null,accuracy:null};try{let{latitude:e,longitude:t,accuracy:n}=(await ee()).coords;a={lat:e,lng:t,accuracy:n};try{i=await D(e,t)||`${e.toFixed(6)}, ${t.toFixed(6)}`}catch{i=`${e.toFixed(6)}, ${t.toFixed(6)}`}}catch{}let{error:o}=await f.from(`attendance`).insert({user_id:t.id,clock_in:new Date().toISOString(),date:s,location:i,latitude:a.lat,longitude:a.lng,status:`present`});o?(n(o.message,`error`),r.disabled=!1,r.innerHTML=`${u.play}<span>Clock In</span>`):(n(`Clocked in!`,`success`),K(e))});let pe=async()=>{let{error:r}=await f.from(`attendance`).update({clock_out:new Date().toISOString()}).eq(`user_id`,t.id).eq(`date`,s);r?n(r.message,`error`):(n(`Clocked out!`,`success`),K(e))},me=()=>{let e=document.createElement(`div`);e.className=`modal-overlay`,e.innerHTML=`
      <div class="modal" style="max-width:520px">
        <div class="modal-header">
          <span class="modal-title">End of Day Report</span>
          <button class="modal-close" id="eod-modal-x">✕</button>
        </div>
        <div class="modal-body">
          <p style="color:var(--text-soft);font-size:0.88rem;margin:0 0 14px;">Submit your EOD report to clock out for today.</p>
          <div class="field">
            <label>Today's progress</label>
            <textarea id="eod-modal-content" rows="5" placeholder="What did you achieve today? Break it down briefly..."></textarea>
          </div>
          <button class="btn btn-primary" id="eod-modal-submit" style="width:100%;">
            <span>Submit Report &amp; Clock Out</span>${u.arrowRight}
          </button>
          <p class="eod-fineprint" style="margin-top:10px;">Reports are visible to your manager immediately.</p>
        </div>
      </div>`,document.body.appendChild(e),e.querySelector(`#eod-modal-x`).onclick=()=>e.remove(),e.querySelector(`#eod-modal-submit`).onclick=async()=>{let r=e.querySelector(`#eod-modal-content`).value.trim();if(!r){n(`Please write your report`,`warning`);return}let i=e.querySelector(`#eod-modal-submit`);i.disabled=!0,i.textContent=`Submitting...`;let{error:a}=await f.from(`eod_reports`).insert({employee_id:t.id,content:r,date:s});if(a){n(a.message,`error`),i.disabled=!1,i.innerHTML=`<span>Submit Report &amp; Clock Out</span>${u.arrowRight}`;return}n(`EOD Report submitted!`,`success`),e.remove(),await pe()}};if(e.querySelector(`#btn-eod-status`)?.addEventListener(`click`,()=>{let e=document.createElement(`div`);e.className=`modal-overlay`;let t=!!g,n=!t&&M&&j.length>0;!t&&!n&&j.length;let r=t?`var(--success)`:n?`var(--danger)`:`var(--warning)`,i=t?`EOD Submitted`:n?`Clock-in Restricted`:`EOD Warning`;e.innerHTML=`
      <div class="modal" style="max-width:420px;">
        <div class="modal-header">
          <span class="modal-title" style="color:${r};">${t?u.check:u.alert}<span>${i}</span></span>
          <button class="modal-close" id="eod-status-close">✕</button>
        </div>
        <div class="modal-body">
          <p style="margin:0;font-size:0.9rem;color:var(--text-soft);line-height:1.6;">${t?`Your End of Day report for today has been submitted successfully. Great work!`:`You have ${j.length} missed EOD report${j.length===1?``:`s`}. ${n?`Clock-in is restricted until you contact admin.`:`Please submit your EOD report before the day closes.`}`}</p>
          ${j.length>0?`<div style="margin-top:14px;padding:10px 12px;background:var(--bg-soft);border-radius:8px;font-size:0.83rem;color:var(--text-dim);">Missed dates: ${j.map(e=>o(e)).join(`, `)}</div>`:``}
        </div>
      </div>`,document.body.appendChild(e),e.querySelector(`#eod-status-close`).onclick=()=>e.remove(),e.onclick=t=>{t.target===e&&e.remove()}}),e.querySelectorAll(`.emp-notice-item`).forEach(e=>{e.onclick=()=>{let t=parseInt(e.dataset.noticeIdx,10),n=y[t];if(!n)return;let r=document.createElement(`div`);r.className=`modal-overlay`,r.innerHTML=`
        <div class="modal" style="max-width:600px;">
          <div class="modal-header">
            <span class="modal-title">${u.bell}<span>${U(n.title||`Notice`)}</span></span>
            <button class="modal-close" id="notice-close-btn">✕</button>
          </div>
          <div class="modal-body">
            <p style="font-size:0.85rem;color:var(--text-dim);margin:0 0 16px">${l(n.created_at)}</p>
            <div style="line-height:1.7;white-space:pre-wrap;font-size:0.95rem;">${U(n.body||n.message||n.content||`(No details available.)`)}</div>
          </div>
        </div>`,document.body.appendChild(r);let i=()=>r.remove();r.querySelector(`#notice-close-btn`).onclick=i,r.onclick=e=>{e.target===r&&i()}}}),e.querySelector(`#btn-submit-eod`)&&B(`#btn-submit-eod`,async()=>{let r=e.querySelector(`#eod-content`).value.trim();if(!r){n(`Please write your report`,`warning`);return}let i=e.querySelector(`#btn-submit-eod`);i.disabled=!0,i.textContent=`Submitting...`;let{error:a}=await f.from(`eod_reports`).insert({employee_id:t.id,content:r,date:s});a?(n(a.message,`error`),i.disabled=!1,i.textContent=`Submit Report →`):(n(`EOD Report submitted!`,`success`),K(e))}),document.querySelectorAll(`.clockin-gate`).forEach(e=>e.remove()),!T&&!E&&!O&&!M&&!Se()){let t=document.createElement(`div`);t.className=`modal-overlay clockin-gate`,t.innerHTML=`
      <div class="modal" style="max-width:430px;">
        <div class="modal-body" style="padding:32px;text-align:center;">
          <div style="width:68px;height:68px;border-radius:50%;background:var(--accent-soft);color:var(--primary);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
            <span style="width:30px;height:30px;display:flex;">${u.clock}</span>
          </div>
          <h3 style="margin:0 0 6px;font-family:var(--font-display);">Clock in to start your day</h3>
          <p style="color:var(--text-soft);font-size:0.9rem;margin:0 0 20px;line-height:1.5;">You must clock in before using the portal. Your location will be recorded.</p>
          <button class="btn btn-primary" id="gate-clock-in" style="width:100%;">${u.play}<span>Clock In Now</span></button>
        </div>
      </div>`,document.body.appendChild(t),t.querySelector(`#gate-clock-in`).onclick=()=>{t.remove(),e.querySelector(`#btn-clock-toggle`)?.click()}}B(`#btn-open-leave-modal`,()=>Ie(t.id,()=>K(e))),e.querySelectorAll(`.task-btn`).forEach(t=>{t.onclick=()=>A(t,t.dataset.id,t.dataset.inqId,t.dataset.status,()=>K(e))}),ne(e,t.id),e.querySelectorAll(`.accept-btn`).forEach(t=>{t.onclick=async()=>{let r=[f.from(`inquiries`).update({assignment_status:`accepted`,status:`in_progress`}).eq(`id`,t.dataset.id)];t.dataset.ticketId&&r.push(f.from(`tickets`).update({status:`in_progress`}).eq(`id`,t.dataset.ticketId));let i=(await Promise.all(r)).find(e=>e.error)?.error;i?n(i.message,`error`):(n(`Task accepted!`,`success`),K(e))}}),e.querySelectorAll(`.decline-btn`).forEach(t=>{t.onclick=()=>{let r=prompt(`Please provide a reason for declining:`);if(r!==null){if(!r.trim()){n(`Reason is required to decline`,`warning`);return}(async()=>{let{error:i}=await f.from(`inquiries`).update({assignment_status:`declined`,decline_reason:r.trim(),status:`open`}).eq(`id`,t.dataset.id);i?n(i.message,`error`):(n(`Task declined`,`info`),K(e))})()}}});let he=f.channel(`employee-jobs-${t.id}`).on(`postgres_changes`,{event:`*`,schema:`public`,table:`inquiries`,filter:`assigned_employee_id=eq.${t.id}`},t=>{let n=t.new;t.eventType===`INSERT`||t.eventType===`UPDATE`&&n?.assignment_status===`pending`?r({title:`🔔 New Job Assigned`,body:`${n?.full_name||`A client`} - ${n?.service_item||`new service`}`,type:`alert`,tag:`assign-${n?.id||``}`}):t.eventType===`UPDATE`&&n?.payment_status===`paid`&&r({title:`💰 Payment Received`,body:`${n?.full_name||`Client`} paid for ticket ${n?.ticket_no||``}`,type:`payment`,tag:`pay-${n?.id||``}`}),K(e)}).subscribe(),ge=setInterval(()=>{document.body.contains(e)||(f.removeChannel(he),clearInterval(ge))},5e3)}async function je(e){a(e);let{user:t,attendance:n,reports:r}=await Oe();if(!t){e.innerHTML=`<p>Please sign in.</p>`;return}let s=fe(),c=n.filter(e=>String(e.date||``).startsWith(s)),l=new Set(c.map(e=>e.date)).size,u=c.filter(e=>e.clock_in&&e.clock_out),d=we(n,r),f=d.length>=V,p=u.reduce((e,t)=>e+Math.max(0,new Date(t.clock_out)-new Date(t.clock_in))/6e4,0),m=`${Math.floor(p/60)}h ${Math.round(p%60)}m`;e.innerHTML=`
    <div class="page-header">
      <h1>Attendance Records</h1>
      <p>Your check-ins, locations, and monthly attendance count</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${l}</div><div class="stat-label">Days Present This Month</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${c.filter(e=>e.clock_in&&!e.clock_out&&!Ce(e)).length}</div><div class="stat-label">Active Sessions</div></div>
      <div class="stat-card"><div class="stat-value" style="color:${d.length?`var(--danger)`:`var(--success)`}">${d.length}</div><div class="stat-label">${f?`Strict Warning`:`Missed EOD`}</div></div>
      <div class="stat-card"><div class="stat-value" style="font-size:1.7rem;color:var(--warning)">${m}</div><div class="stat-label">Logged Hours This Month</div></div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Location</th></tr></thead>
          <tbody>
            ${n.length===0?`<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-dim)">No attendance records yet</td></tr>`:n.map(e=>`<tr>
                <td>${o(e.date)}</td>
                <td><span class="badge badge-open">${i(e.clock_in)}</span></td>
                <td>${e.clock_out?`<span class="badge badge-resolved">${i(e.clock_out)}</span>`:Ce(e)?`<span class="badge badge-open">Auto clock-out pending</span>`:`<span class="badge badge-open">Active</span>`}</td>
                <td>${he(e.clock_in,e.clock_out)||`-`}</td>
                <td><small>${e.location||`-`}</small></td>
              </tr>`).join(``)}
          </tbody>
        </table>
      </div>
    </div>
  `}async function Me(e){a(e);let{user:t,leaves:n}=await Oe();if(!t){e.innerHTML=`<p>Please sign in.</p>`;return}let r=n.filter(e=>e.status===`pending`).length,i=n.filter(e=>e.status===`approved`).reduce((e,t)=>e+me(t.start_date,t.end_date),0);e.innerHTML=`
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>Leave Requests</h1>
        <p>Submit leave and track approval from admin</p>
      </div>
      <button class="btn btn-primary" id="leave-new">${u.plus}<span>New Request</span></button>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${r}</div><div class="stat-label">Pending Requests</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${i}</div><div class="stat-label">Approved Leave Days</div></div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th></tr></thead>
          <tbody>
            ${n.length===0?`<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-dim)">No leave requests yet</td></tr>`:n.map(e=>`<tr>
                <td><small>${o(e.start_date)} to ${o(e.end_date)}</small></td>
                <td>${me(e.start_date,e.end_date)}</td>
                <td style="max-width:360px;white-space:normal">${e.reason}</td>
                <td><span class="badge badge-${e.status}">${e.status}</span></td>
              </tr>`).join(``)}
          </tbody>
        </table>
      </div>
    </div>
  `,e.querySelector(`#leave-new`).onclick=()=>Ie(t.id,()=>Me(e))}async function Ne(e){a(e);let{user:t,reports:r}=await Oe();if(!t){e.innerHTML=`<p>Please sign in.</p>`;return}let s=new Date().toLocaleDateString(`en-CA`),c=r.find(e=>e.date===s);e.innerHTML=`
    <div class="page-header">
      <h1>EOD Reports</h1>
      <p>View every daily summary you have submitted</p>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title sr-icon-title">${u.clipboard}<span>Today's Summary</span></span></div>
      <div class="card-body">
        ${c?`
          <div class="eod-done">
            <div class="eod-done-ring">${u.check}</div>
            <h3 class="eod-done-title">Submitted today</h3>
            <p class="eod-done-sub">${c.content}</p>
          </div>
        `:`
          <div class="form-group">
            <label class="sr-icon-label">${u.edit}<span>Today's progress</span></label>
            <textarea id="employee-eod-content" rows="5" placeholder="What did you complete today?"></textarea>
          </div>
          <button class="btn btn-primary btn-wide" id="employee-eod-submit">Submit Daily Report</button>
        `}
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Submitted</th><th>Summary</th></tr></thead>
          <tbody>
            ${r.length===0?`<tr><td colspan="3" style="text-align:center;padding:32px;color:var(--text-dim)">No reports yet</td></tr>`:r.map(e=>`<tr>
                <td>${o(e.date)}</td>
                <td>${i(e.created_at)}</td>
                <td style="max-width:560px;white-space:normal;line-height:1.5">${e.content}</td>
              </tr>`).join(``)}
          </tbody>
        </table>
      </div>
    </div>
  `;let l=e.querySelector(`#employee-eod-submit`);l&&(l.onclick=async()=>{let r=e.querySelector(`#employee-eod-content`).value.trim();if(!r){n(`Please write your report`,`warning`);return}l.disabled=!0,l.textContent=`Submitting...`;let{error:i}=await f.from(`eod_reports`).insert({employee_id:t.id,content:r,date:s});i?(n(i.message,`error`),l.disabled=!1,l.textContent=`Submit Daily Report`):(n(`EOD Report submitted!`,`success`),Ne(e))})}async function Pe(e){a(e);let{data:{user:t}}=await f.auth.getUser();if(!t){e.innerHTML=`<p>Please sign in.</p>`;return}let{data:n}=await f.from(`inquiries`).select(`*`).eq(`assigned_employee_id`,t.id).eq(`payment_method`,`cash`).eq(`payment_status`,`paid`).order(`cash_collected_at`,{ascending:!1}),r=(Array.isArray(n)?n:[]).filter(e=>e.cash_collected_at),i=r.filter(e=>!e.cash_submitted_at),o=r.filter(e=>e.cash_submitted_at),s=i.reduce((e,t)=>e+(Number(t.bill_total)||0),0),c=o.reduce((e,t)=>e+(Number(t.bill_total)||0),0),l=s+c,d=e=>{if(!e)return`-`;try{let t=new Date(String(e).replace(` `,`T`));return Number.isNaN(t.getTime())?e:t.toLocaleString(`en-IN`,{dateStyle:`medium`,timeStyle:`short`})}catch{return e}},p=e=>e.length===0?`<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No cash collections yet</td></tr>`:e.map(e=>`
      <tr>
        <td><small style="color:var(--text-dim)">${d(e.cash_collected_at)}</small></td>
        <td><code style="font-size:0.75rem;">${e.ticket_no||(e.id||``).slice(0,8)}</code></td>
        <td><b>${e.full_name||`-`}</b><br/><small style="color:var(--text-dim)">${e.phone||``}</small></td>
        <td><small>${e.service_item||`-`}</small></td>
        <td><b>₹${Math.round(Number(e.bill_total)||0).toLocaleString(`en-IN`)}</b></td>
        <td>${e.cash_submitted_at?`<span class="badge badge-resolved">Submitted</span><br/><small style="color:var(--text-dim)">${d(e.cash_submitted_at)}</small>`:`<span class="badge badge-medium">Pending</span>`}</td>
      </tr>`).join(``);e.innerHTML=`
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>My Cash</h1>
        <p>Cash you've collected from clients. Hand it to admin to clear the pending balance.</p>
      </div>
    </div>

    <div class="stats-grid" style="margin-bottom:24px;">
      <div class="stat-card">
        <div class="stat-value" style="color:var(--warning); font-size:1.9rem;">₹${Math.round(s).toLocaleString(`en-IN`)}</div>
        <div class="stat-label">Pending Submission</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--success); font-size:1.9rem;">₹${Math.round(c).toLocaleString(`en-IN`)}</div>
        <div class="stat-label">Already Submitted</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${r.length}</div>
        <div class="stat-label">Total Cash Jobs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="font-size:1.7rem;">₹${Math.round(l).toLocaleString(`en-IN`)}</div>
        <div class="stat-label">Total Collected (All Time)</div>
      </div>
    </div>

    ${s>0?`
      <div style="padding:14px 16px; border-radius:14px; background:rgba(245,158,11,0.08); border:1px dashed var(--warning); margin-bottom:18px; font-size:0.88rem; color:var(--text);">
        You have <b>₹${Math.round(s).toLocaleString(`en-IN`)}</b> in cash to hand over to admin. Once admin records the submission in their Cash Collections tab, these entries will move to <b>Submitted</b>.
      </div>`:``}

    <div class="df-wrap" style="margin-bottom:16px;">
      <button class="btn btn-secondary df-toggle" id="cash-filter-btn">${u.filter}<span>Filters</span></button>
      <div class="df-panel" id="cash-panel" style="display:none">
        <div class="df-field">
          <span class="df-label">Status</span>
          <select id="cash-status-sel">
            <option value="pending">Pending (${i.length})</option>
            <option value="submitted">Submitted (${o.length})</option>
            <option value="all">All (${r.length})</option>
          </select>
        </div>
        <div class="df-footer"><button class="btn btn-ghost btn-sm" id="cash-clear">Clear</button><button class="btn btn-primary btn-sm" id="cash-ok">Apply</button></div>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Ticket</th><th>Customer</th><th>Service</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>${p(i)}</tbody>
        </table>
      </div>
    </div>
  `;let m={pending:i,submitted:o,all:r},h=e.querySelector(`#cash-panel`),g=e.querySelector(`#cash-filter-btn`),_=e=>{g.closest(`.df-wrap`).contains(e.target)||(h.style.display=`none`,g.classList.remove(`df-open`),document.removeEventListener(`click`,_))},v=()=>{h.style.display=`none`,g.classList.remove(`df-open`),document.removeEventListener(`click`,_)};g.onclick=e=>{e.stopPropagation(),h.style.display===`none`?(h.style.display=``,g.classList.add(`df-open`),setTimeout(()=>document.addEventListener(`click`,_),0)):v()},e.querySelector(`#cash-ok`).onclick=()=>{let t=m[e.querySelector(`#cash-status-sel`).value]||r;e.querySelector(`tbody`).innerHTML=p(t),v()},e.querySelector(`#cash-clear`).onclick=()=>{e.querySelector(`#cash-status-sel`).value=`pending`,e.querySelector(`tbody`).innerHTML=p(i),v()}}async function q(e){a(e);let{data:{user:t}}=await f.auth.getUser();if(!t){e.innerHTML=`<p>Please sign in.</p>`;return}let n=fe(),r=localStorage.getItem(`auth_token`),i=await fetch(`/api/leaderboard?month=${n}`,{headers:{Authorization:`Bearer ${r}`}}).then(e=>e.ok?e.json():null).catch(()=>null);if(!i){e.innerHTML=`<div class="card" style="padding:32px;text-align:center;color:var(--text-dim)">Could not load leaderboard. Please try again.</div>`;return}let o=i.monthly||[],s=i.allTime||[],c=o.find(e=>e.id===t.id),l=s.find(e=>e.id===t.id),u=o.findIndex(e=>e.id===t.id)+1,d=s.findIndex(e=>e.id===t.id)+1,p=[`🥇`,`🥈`,`🥉`],m=[`120px`,`88px`,`64px`],h=[1,0,2],g=e=>String(e).trim().split(/\s+/).map(e=>e[0]).slice(0,2).join(``).toUpperCase()||`?`,_=h.map(e=>o[e]||{id:null,name:`—`,count:0,avg:0,fiveStars:0,_empty:!0}),v=(e,n)=>{let r=e.id===t.id;return`
      <div class="lb-podium-slot lb-podium-slot-${n}">
        <div class="lb-podium-medal">${p[n]}</div>
        <div class="lb-podium-avatar ${e._empty?`lb-podium-empty-av`:``} ${r?`lb-podium-you`:``}">
          ${e._empty?`?`:g(e.name)}
        </div>
        <div class="lb-podium-name">${e._empty?`<span style="color:var(--text-dim)">Available</span>`:U(e.name)+(r?` <span class="lb-you-tag">You</span>`:``)}</div>
        <div class="lb-podium-reviews">${e._empty?`<span style="color:var(--text-dim);font-size:0.75rem;">No one yet</span>`:`<b>${e.count}</b> review${e.count===1?``:`s`}`}</div>
        <div class="lb-podium-stars">${e._empty||e.count===0?`<span style="color:var(--text-dim);font-size:0.75rem;">No reviews yet</span>`:`${De(e.avg)} <span>${e.avg.toFixed(1)}</span>`}</div>
        <div class="lb-podium-bar" style="height:${m[n]};${e._empty?`opacity:0.3;`:``}"></div>
      </div>`};e.innerHTML=`
    <div class="page-header">
      <h1>Leaderboard</h1>
      <p>Ranked by most reviews received this month.</p>
    </div>

    <!-- Podium -->
    <div class="card" style="margin-bottom:24px;">
      <div class="card-header"><span class="card-title">🏆 Top 3 — Most Reviews</span></div>
      <div style="padding:24px 16px 8px;">
        ${`<div class="lb-podium">
    ${_.map((e,t)=>v(e,h[t])).join(``)}
  </div>`}
      </div>
    </div>

    <!-- Monthly Rank Card -->
    <div class="lb-my-rank-card" style="margin-bottom:14px;">
      <div class="lb-my-rank-left">
        <div class="lb-my-rank-avatar">${g(c?.name||`Me`)}</div>
        <div>
          <div class="lb-my-rank-name">${U(c?.name||`You`)}</div>
          <div class="lb-my-rank-sub">Your position this month</div>
        </div>
      </div>
      <div class="lb-my-rank-stats">
        <div class="lb-my-stat">
          <div class="lb-my-stat-val">#${u||`—`}</div>
          <div class="lb-my-stat-label">Rank</div>
        </div>
        <div class="lb-my-stat-div"></div>
        <div class="lb-my-stat">
          <div class="lb-my-stat-val">${c?.count??0}</div>
          <div class="lb-my-stat-label">Reviews</div>
        </div>
        <div class="lb-my-stat-div"></div>
        <div class="lb-my-stat">
          <div class="lb-my-stat-val">${c&&c.count>0?c.avg.toFixed(1):`—`}</div>
          <div class="lb-my-stat-label">Avg Rating</div>
        </div>
        <div class="lb-my-stat-div"></div>
        <div class="lb-my-stat">
          <div class="lb-my-stat-val">${c?.fiveStars??0}</div>
          <div class="lb-my-stat-label">5-Stars</div>
        </div>
      </div>
    </div>

    <!-- All-Time Rank Card -->
    <div class="lb-my-rank-card" style="margin-bottom:14px;">
      <div class="lb-my-rank-left">
        <div class="lb-my-rank-avatar">${g(l?.name||`Me`)}</div>
        <div>
          <div class="lb-my-rank-name">${U(l?.name||`You`)}</div>
          <div class="lb-my-rank-sub">Your all-time position</div>
        </div>
      </div>
      <div class="lb-my-rank-stats">
        <div class="lb-my-stat">
          <div class="lb-my-stat-val">#${d||`—`}</div>
          <div class="lb-my-stat-label">Rank</div>
        </div>
        <div class="lb-my-stat-div"></div>
        <div class="lb-my-stat">
          <div class="lb-my-stat-val">${l?.count??0}</div>
          <div class="lb-my-stat-label">Reviews</div>
        </div>
        <div class="lb-my-stat-div"></div>
        <div class="lb-my-stat">
          <div class="lb-my-stat-val">${l&&l.count>0?l.avg.toFixed(1):`—`}</div>
          <div class="lb-my-stat-label">Avg Rating</div>
        </div>
        <div class="lb-my-stat-div"></div>
        <div class="lb-my-stat">
          <div class="lb-my-stat-val">${l?.fiveStars??0}</div>
          <div class="lb-my-stat-label">5-Stars</div>
        </div>
      </div>
    </div>
  `}async function J(e){a(e);let{data:{user:t}}=await f.auth.getUser();if(!t){e.innerHTML=`<p>Please sign in.</p>`;return}try{let[{data:t},{data:r},{data:i}]=await Promise.all([f.from(`service_pricing`).select(`*`).order(`category`),f.from(`discount_presets`).select(`*`).eq(`active`,1).order(`created_at`,{ascending:!1}),f.from(`companies`).select(`*`).order(`name`)]),a={};(t||[]).forEach(e=>{let t=e.category||`Uncategorized`,n=e.sub_category&&e.sub_category.trim()||``,r=e.sub_sub_category||e.name||``;r&&(a[t]??={},a[t][n]??=[],a[t][n].push({id:e.id,leaf:r,cost:Number(e.cost)||0}))});let o=Object.keys(a).sort(),s=Array.isArray(i)?i:[],c=Array.isArray(r)?r:[];e.innerHTML=`
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
        <div>
          <h1>Estimator</h1>
          <p>Prepare a complete service cost estimate and send it to the client on WhatsApp.</p>
        </div>
        <button class="btn btn-secondary" id="est-reset">${u.refresh}<span>Reset</span></button>
      </div>

      <div class="estimator-layout">
        <div class="card estimator-form-card">
          <div class="card-header"><span class="card-title sr-icon-title">${u.user}<span>Client Details</span></span></div>
          <div class="card-body">
            <div class="estimator-grid">
              <div class="form-group"><label>Client Name</label><input id="est-client-name" type="text" placeholder="Client name"></div>
              <div class="form-group"><label>WhatsApp Number</label><input id="est-client-phone" type="tel" placeholder="10 digit mobile number"></div>
              <div class="form-group"><label>Service / Project</label><input id="est-service-title" type="text" placeholder="e.g. CCTV service visit"></div>
              <div class="form-group"><label>Location</label><input id="est-location" type="text" placeholder="Client location"></div>
              <div class="form-group">
                <label>Company</label>
                <select id="est-company">
                  <option value="Networking Experts">Networking Experts</option>
                  ${s.map(e=>`<option value="${W(e.name||``)}">${U(e.name||``)}</option>`).join(``)}
                  <option value="Other">Other</option>
                </select>
              </div>
              <div class="form-group"><label>Custom Company</label><input id="est-company-custom" type="text" placeholder="Company name" disabled></div>
            </div>
          </div>
        </div>

        <div class="card estimator-form-card">
          <div class="card-header"><span class="card-title sr-icon-title">${u.wrench}<span>Services</span></span></div>
          <div class="card-body">
            ${o.length===0?`
              <div style="padding:14px;border-radius:12px;background:var(--bg-soft);color:var(--text-dim);font-size:0.9rem;">No service pricing is available yet.</div>
            `:`
              <div class="form-group" style="position:relative;margin-bottom:12px;">
                <div class="search-input-wrap">
                  <span>${u.search}</span>
                  <input class="search-input" id="est-svc-search" placeholder="Search service by name…" autocomplete="off">
                </div>
                <div id="est-svc-results" style="display:none;position:absolute;left:0;right:0;z-index:300;background:var(--bg);border:1px solid var(--border);border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.14);margin-top:4px;max-height:240px;overflow-y:auto;"></div>
              </div>
              <div class="svc-picker-wrap">
                <select id="est-svc-main" class="svc-picker">
                  <option value="">Select Main Category...</option>
                  ${o.map(e=>`<option value="${W(e)}">${U(e)}</option>`).join(``)}
                </select>
                <select id="est-svc-sub" class="svc-picker" disabled><option value="">Select Sub Category...</option></select>
                <select id="est-svc-leaf" class="svc-picker" disabled><option value="">Select Specific Issue...</option></select>
                <div class="svc-picker-actions">
                  <div class="svc-preview-text" id="est-svc-preview">Pick an issue to see the price.</div>
                  <button type="button" class="btn btn-primary btn-sm" id="est-svc-add" disabled>${u.plus}<span>Add</span></button>
                </div>
              </div>
              <div id="est-selected-services" class="est-selected-services"></div>
            `}
          </div>
        </div>

        <div class="card estimator-form-card">
          <div class="card-header"><span class="card-title sr-icon-title">${u.receipt}<span>Fees & Discount</span></span></div>
          <div class="card-body">
            <div class="estimator-grid">
              <div class="form-group"><label>Extra Charge</label><input id="est-extra" type="number" min="0" step="1" placeholder="0"></div>
              <div class="form-group"><label>Extra Reason</label><input id="est-extra-reason" type="text" placeholder="Material, labour, etc."></div>
              <div class="form-group"><label>Platform Fee</label><input id="est-platform" type="number" min="0" step="1" value="50"></div>
              <div class="form-group"><label>Travel Distance (km)</label><input id="est-km" type="number" min="0" step="0.1" placeholder="0"></div>
              <div class="form-group"><label>Travel Rate / km</label><input id="est-km-rate" type="number" min="0" step="1" value="5"></div>
              <div class="form-group"><label>GST %</label><input id="est-gst-rate" type="number" min="0" step="0.1" value="18"></div>
            </div>
            <div class="form-group">
              <label>Admin Discount</label>
              <select id="est-discount-preset">
                <option value="">No admin discount</option>
                ${c.map(e=>`<option value="${W(e.id)}" data-amount="${Number(e.amount)||0}" data-name="${W(e.name||`Discount`)}">${U(e.name||`Discount`)} - ${H(e.amount)}</option>`).join(``)}
              </select>
            </div>
            <div class="estimator-grid">
              <div class="form-group"><label>Manual Discount</label><input id="est-manual-discount" type="number" min="0" step="1" placeholder="0"></div>
              <div class="form-group"><label>Discount Reason</label><input id="est-discount-reason" type="text" placeholder="Required for manual discount"></div>
            </div>
          </div>
        </div>

        <div class="card estimator-preview-card">
          <div class="card-header">
            <span class="card-title sr-icon-title">${u.receipt}<span>Estimate Preview</span></span>
          </div>
          <div class="card-body">
            <div class="estimate-slip" id="estimate-slip"></div>
            <div class="estimator-actions">
              <button class="btn btn-secondary" id="est-copy">${u.clipboard}<span>Copy Text</span></button>
              <button class="btn btn-primary" id="est-whatsapp">${u.whatsapp}<span>Send WhatsApp</span></button>
            </div>
          </div>
        </div>
      </div>
    `;let l=[],d=t=>e.querySelector(t),p=H,m=d(`#est-selected-services`),h=d(`#estimate-slip`),g=d(`#est-svc-main`),_=d(`#est-svc-sub`),v=d(`#est-svc-leaf`),y=d(`#est-svc-preview`),b=d(`#est-svc-add`),x=d(`#est-company`),S=d(`#est-company-custom`),C=()=>x.value===`Other`?S.value.trim():x.value.trim(),w=d(`#est-svc-search`),T=d(`#est-svc-results`);if(w){let n=(t||[]).map(e=>({id:e.id,leaf:e.sub_sub_category||e.name||``,sub:e.sub_category&&e.sub_category.trim()||``,main:e.category||``,cost:Number(e.cost)||0})).filter(e=>e.leaf),r=()=>{T.style.display=`none`,T.innerHTML=``};w.oninput=()=>{let e=w.value.trim().toLowerCase();if(e.length<1){r();return}let t=n.filter(t=>t.leaf.toLowerCase().includes(e)||t.sub.toLowerCase().includes(e)||t.main.toLowerCase().includes(e)).slice(0,10);if(!t.length){T.innerHTML=`<div style="padding:12px 16px;color:var(--text-dim);font-size:0.87rem;">No services found</div>`,T.style.display=`block`;return}T.innerHTML=t.map((e,t)=>`
          <div class="est-svc-result" data-idx="${t}" style="padding:10px 16px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;transition:background .12s;">
            <div style="min-width:0;">
              <div style="font-weight:700;font-size:0.88rem;">${U(e.leaf)}</div>
              <div style="font-size:0.75rem;color:var(--text-dim);">${U([e.main,e.sub].filter(Boolean).join(` › `))}</div>
            </div>
            <span style="font-weight:700;color:var(--primary);white-space:nowrap;font-size:0.88rem;">₹${e.cost.toLocaleString(`en-IN`)}</span>
          </div>`).join(``),T.style.display=`block`,T.querySelectorAll(`.est-svc-result`).forEach((e,n)=>{e.onmouseenter=()=>{e.style.background=`var(--bg-soft)`},e.onmouseleave=()=>{e.style.background=``},e.onclick=()=>{let e=t[n];l.push({...e}),w.value=``,r(),ee(),O()}})},e.addEventListener(`click`,e=>{!e.target.closest(`#est-svc-search`)&&!e.target.closest(`#est-svc-results`)&&r()})}let E=()=>{let e=l.reduce((e,t)=>e+Number(t.cost||0),0),t=Math.max(0,Number(d(`#est-extra`).value)||0),n=Math.max(0,Number(d(`#est-platform`).value)||0),r=Math.max(0,Number(d(`#est-km`).value)||0),i=Math.max(0,Number(d(`#est-km-rate`).value)||0),a=Math.round(r*i),o=d(`#est-discount-preset`)?.selectedOptions?.[0],s=d(`#est-discount-preset`).value?Number(o?.dataset.amount||0):0,c=Math.max(0,Number(d(`#est-manual-discount`).value)||0),u=e+t+n+a,f=Math.min(u,s+c),p=Math.max(0,Number(d(`#est-gst-rate`).value)||0),m=Math.max(0,u-f),h=Math.round(m*p/100),g=m+h,_=[];return s&&_.push(o?.dataset.name||`Admin discount`),c&&_.push(`Manual discount`),{servicesSubtotal:e,extra:t,platform:n,km:r,kmRate:i,transport:a,presetDiscount:s,manualDiscount:c,discount:f,discountLabel:_.join(` + `),taxable:m,gstRate:p,gst:h,total:g}},ee=()=>{if(!l.length){m.innerHTML=`<div class="est-empty">No services added yet</div>`;return}m.innerHTML=l.map((e,t)=>`
        <div class="est-selected-row">
          <div><b>${U(e.leaf)}</b><small>${U([e.main,e.sub].filter(Boolean).join(` > `))}</small></div>
          <span>${p(e.cost)}</span>
          <button type="button" class="btn btn-secondary btn-sm est-remove" data-idx="${t}" title="Remove">${u.close}</button>
        </div>
      `).join(``),m.querySelectorAll(`.est-remove`).forEach(e=>{e.onclick=()=>{l.splice(Number(e.dataset.idx),1),ee(),O()}})},D=()=>{let e=E(),t=d(`#est-client-name`).value.trim()||`Client`,n=d(`#est-service-title`).value.trim()||`Service estimate`,r=d(`#est-location`).value.trim(),i=[`Hi ${t},`,`Here is your estimated cost from ${N.name}.`,``,`Service: ${n}`];return r&&i.push(`Location: ${r}`),C()&&i.push(`Company: ${C()}`),i.push(``,`Items:`),l.length?l.forEach((e,t)=>i.push(`${t+1}. ${e.leaf} - ${p(e.cost)}`)):i.push(`No itemised service selected`),e.extra>0&&i.push(`Extra charge${d(`#est-extra-reason`).value.trim()?` (${d(`#est-extra-reason`).value.trim()})`:``}: ${p(e.extra)}`),i.push(``,`Services subtotal: ${p(e.servicesSubtotal)}`),i.push(`Platform fee: ${p(e.platform)}`),i.push(`Travel: ${e.km} km x ${p(e.kmRate)} = ${p(e.transport)}`),e.discount>0&&i.push(`Discount${e.discountLabel?` (${e.discountLabel})`:``}: -${p(e.discount)}`),i.push(`Taxable amount: ${p(e.taxable)}`),i.push(`GST (${e.gstRate}%): ${p(e.gst)}`),i.push(`Estimated total: ${p(e.total)}`),i.push(``,`Final bill may change if extra work or material is required.`),i.push(`- ${N.name}`),i.join(`
`)},O=()=>{let e=E(),t=d(`#est-client-name`).value.trim()||`Client`,n=d(`#est-service-title`).value.trim()||`Service estimate`;h.innerHTML=`
        <div class="estimate-slip-head">
          <div>
            <b>${N.name}</b>
            <small>Cost Estimate</small>
          </div>
          <span>${new Date().toLocaleDateString(`en-IN`)}</span>
        </div>
        <div class="estimate-client">
          <b>${U(t)}</b>
          <small>${U(n)}${d(`#est-location`).value.trim()?` - ${U(d(`#est-location`).value.trim())}`:``}</small>
        </div>
        <div class="estimate-items">
          ${l.length?l.map(e=>`<div><span>${U(e.leaf)}</span><b>${p(e.cost)}</b></div>`).join(``):`<div><span>No service selected</span><b>Rs.0</b></div>`}
          ${e.extra>0?`<div><span>Extra charge</span><b>${p(e.extra)}</b></div>`:``}
        </div>
        <div class="bill-breakdown estimate-breakdown">
          <div class="bill-row"><span>Services subtotal</span><b>${p(e.servicesSubtotal)}</b></div>
          <div class="bill-row"><span>Platform fee</span><b>${p(e.platform)}</b></div>
          <div class="bill-row"><span>Travel (${e.km} km x ${p(e.kmRate)})</span><b>${p(e.transport)}</b></div>
          ${e.discount>0?`<div class="bill-row bill-row-discount"><span>${U(e.discountLabel||`Discount`)}</span><b>-${p(e.discount)}</b></div>`:``}
          <div class="bill-row"><span>Taxable amount</span><b>${p(e.taxable)}</b></div>
          <div class="bill-row"><span>GST (${e.gstRate}%)</span><b>${p(e.gst)}</b></div>
          <div class="bill-row bill-row-total"><span>Estimated total</span><b>${p(e.total)}</b></div>
        </div>
        <div class="estimate-note">Final bill may change if extra work or material is required.</div>
      `},te=()=>{let e=g.value;if(_.innerHTML=`<option value="">Select Sub Category...</option>`,v.innerHTML=`<option value="">Select Specific Issue...</option>`,v.disabled=!0,y.textContent=`Pick an issue to see the price.`,b.disabled=!0,!e||!a[e]){_.disabled=!0;return}let t=Object.keys(a[e]).sort();t.forEach(e=>{let t=document.createElement(`option`);t.value=e,t.textContent=e||`- (no sub-group)`,_.appendChild(t)}),_.disabled=!1,t.length===1&&(_.value=t[0],k())},k=()=>{let e=g.value,t=_.value;if(v.innerHTML=`<option value="">Select Specific Issue...</option>`,y.textContent=`Pick an issue to see the price.`,b.disabled=!0,!e||!a[e]?.[t]){v.disabled=!0;return}a[e][t].forEach((e,t)=>{let n=document.createElement(`option`);n.value=String(t),n.textContent=`${e.leaf} (${H(e.cost)})`,v.appendChild(n)}),v.disabled=!1};g&&(g.onchange=te,_.onchange=k,v.onchange=()=>{let e=a[g.value]?.[_.value]?.[Number(v.value)];if(!e){y.textContent=`Pick an issue to see the price.`,b.disabled=!0;return}y.innerHTML=`Price: <b style="color:var(--primary)">${H(e.cost)}</b>`,b.disabled=!1},b.onclick=()=>{let e=a[g.value]?.[_.value]?.[Number(v.value)];e&&(l.push({...e,main:g.value,sub:_.value}),ee(),O())}),x.onchange=()=>{let e=x.value===`Other`;S.disabled=!e,e||(S.value=``);let t=C().toLowerCase().replace(/\s+/g,` `);d(`#est-platform`).value=t===`networking experts`?`50`:`100`,O()},e.querySelectorAll(`input, select`).forEach(e=>{[`est-svc-main`,`est-svc-sub`,`est-svc-leaf`].includes(e.id)||(e.addEventListener(`input`,O),e.addEventListener(`change`,O))}),d(`#est-copy`).onclick=async()=>{await navigator.clipboard.writeText(D()),n(`Estimate copied`,`success`)},d(`#est-whatsapp`).onclick=()=>{let e=E();if(e.total<=0){n(`Add at least one service or charge`,`warning`);return}if(e.manualDiscount>0&&!d(`#est-discount-reason`).value.trim()){n(`Enter reason for manual discount`,`warning`);return}let t=d(`#est-client-phone`).value.replace(/\D/g,``),r=t.length>10?t.slice(-10):t;if(r.length!==10){n(`Enter a valid 10 digit WhatsApp number`,`warning`);return}window.open(`https://wa.me/91${r}?text=${encodeURIComponent(D())}`,`_blank`)},d(`#est-reset`).onclick=()=>J(e),ee(),O()}catch(t){console.error(`[employee estimator] initialization failed:`,t),e.innerHTML=`
      <div class="card" style="padding:32px;text-align:center;">
        <p style="color:var(--danger);margin:0;font-weight:600;">Could not load estimator</p>
        <small style="color:var(--text-dim);">${U(t?.message||`An unexpected error occurred`)}</small>
      </div>
    `}}async function Y(e){let{data:{user:t}}=await f.auth.getUser();if(!t){e.innerHTML=`<p>Please sign in.</p>`;return}if(e._tasksChannel){try{f.removeChannel(e._tasksChannel)}catch{}e._tasksChannel=null}e.innerHTML=`
    <div class="employee-task-loader" role="status" aria-live="polite">
      <div class="employee-task-loader-card">
        <span class="employee-task-loader-spinner"></span>
        <div>
          <div class="employee-task-loader-title">Loading your tasks</div>
          <div class="employee-task-loader-sub">Fetching assigned jobs, active services, and pending requests...</div>
        </div>
      </div>
    </div>
  `;let i,a,o;try{let[e,n]=await Promise.all([f.from(`tickets`).select(`*, inquiries(*)`).eq(`assigned_to`,t.id).order(`created_at`,{ascending:!1}),f.from(`inquiries`).select(`*`).eq(`assigned_employee_id`,t.id).in(`assignment_status`,[`pending`,`accepted`]).order(`created_at`,{ascending:!1})]);i=e.data||[];let r=n.data||[],s=new Map;r.forEach(e=>{e.ticket_id&&s.set(String(e.ticket_id),e)});let c=i.filter(e=>!(e.inquiries&&e.inquiries.length)&&!s.has(String(e.id))).map(e=>e.id).filter(Boolean);if(c.length){let{data:e}=await f.from(`inquiries`).select(`*`).in(`ticket_id`,c);(e||[]).forEach(e=>{e.ticket_id&&s.set(String(e.ticket_id),e)})}i=i.map(e=>{if(e.inquiries&&e.inquiries.length)return e;let t=s.get(String(e.id));return t?{...e,inquiries:[t]}:e});let l=new Set(i.map(e=>e.inquiries?.[0]?.id).filter(Boolean));a=r.filter(e=>e.assignment_status===`pending`).sort(Te),o=r.filter(e=>e.assignment_status===`accepted`&&!l.has(e.id)).sort(Te).map(e=>({...e,_company:e.company_name||null}))}catch(t){e.innerHTML=`<div class="card"><div class="card-body" style="text-align:center;padding:40px;"><h3 style="color:var(--danger);display:inline-flex;align-items:center;gap:8px;">${u.alert}<span>Error</span></h3><p>${t.message}</p></div></div>`;return}let p=i.filter(e=>{let t=P(e.status);if(t===`resolved`||t===`issue_not_resolved`||t===`foc`)return!1;let n=e.inquiries?.[0];return n?n.assignment_status===`accepted`&&![`resolved`,`issue_not_resolved`].includes(P(n.status)):t===`assigned`||t===`in_progress`||t===`open`}),m=i.filter(e=>P(e.status)===`resolved`),h=i.filter(e=>P(e.status)===`issue_not_resolved`),g=o.filter(e=>![`resolved`,`closed`,`issue_not_resolved`].includes(e.status)),_=o.filter(e=>[`resolved`,`closed`].includes(e.status)),v=o.filter(e=>e.status===`issue_not_resolved`),y=e=>e===`in_progress`?`in_progress`:e===`resolved`||e===`foc`?`resolved`:e===`issue_not_resolved`?`issue_not_resolved`:e===`case_closed`?`case_closed`:`active`,b=[...o,...i].sort(Te),x={active:0,in_progress:0,resolved:0,issue_not_resolved:0,case_closed:0};b.forEach(e=>{x[y(P(e.status))]++});let S=b.filter(e=>Number((e.inquiries?.[0]||e)?.reopened)===1).length,C=e=>{let t=P(e.status),n=e.created_at?c(e):null,r=[`resolved`,`closed`,`issue_not_resolved`,`foc`].includes(t)?`Service Completed`:s(e)?`<span style="color:var(--warning)">⏸ Paused (device in service)</span>`:n?d(n):`-`;return`
    <div class="emp-job-card" data-status="${t}" data-reopened="${Number(e.reopened)===1?`1`:`0`}" data-company="${e._company||``}" style="padding:20px; border-radius:20px; background:var(--bg); box-shadow:var(--neu-sm); margin-bottom:20px; border:1px solid var(--border);${Number(e.reopened)===1?`border-left:4px solid var(--warning);`:``}">
       ${Number(e.reopened)===1?`<div style="display:inline-flex;align-items:center;gap:6px;font-size:0.72rem;font-weight:800;color:var(--warning);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">🔁 Reopened — free rework</div>`:``}
       <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
         <div>
           <div style="font-weight:800; font-size:1.15rem; color:var(--primary)">${e.full_name}</div>
           ${e._company?`<div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);margin-top:2px;text-transform:uppercase;letter-spacing:0.5px">${e._company}</div>`:``}
           <div style="font-size:0.85rem; color:var(--text-soft); margin-top:4px;"><b>Ticket:</b> ${e.ticket_no||`-`}</div>
           <div style="font-size:0.82rem; color:var(--text-dim); margin-top:4px;"><b>Created:</b> ${l(e.created_at)}</div>
           <div style="font-size:0.85rem; color:var(--text-soft); margin-top:4px;">${e.service_item}</div>
           ${e.employee_update_detail?`<div style="font-size:0.82rem;color:var(--text-soft);margin-top:8px;padding:10px;border-radius:10px;background:var(--bg-soft);"><b>Employee update:</b> ${U(e.employee_update_detail)}</div>`:``}
         </div>
         <span class="badge badge-${t}" style="font-size:0.75rem">${re(e.status)}</span>
       </div>

       <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:16px; margin-top:16px; padding-top:16px; border-top:1px solid rgba(16,185,129,0.1);">
         <div>
           <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">Contact Info</div>
           <div style="display:flex; align-items:center; gap:10px; margin-top:8px;">
             <span style="font-weight:700; font-size:0.95rem">${e.phone}</span>
             <div style="display:flex; gap:6px;">
               <a href="tel:${e.phone}" style="display:flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:50%; background:var(--primary); color:white;">
                 <span style="width:16px;height:16px;display:flex;">${u.phone}</span>
               </a>
               <a href="https://wa.me/${e.phone.replace(/\D/g,``)}" target="_blank" style="display:flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:50%; background:#25D366; color:white;">
                 <span style="width:16px;height:16px;display:flex;">${u.whatsapp}</span>
               </a>
             </div>
           </div>
         </div>
         <div>
           <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">Service Location</div>
           <div style="font-size:0.88rem; font-weight:600; margin-top:8px; display:flex; align-items:flex-start; gap:6px;">
             <span style="width:18px;height:18px;display:flex;flex-shrink:0;color:var(--primary)">${u.pin}</span>
             <span style="line-height:1.4">${e.location||`-`}</span>
           </div>
         </div>
         <div>
           <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">Preferred Time</div>
           <div style="font-size:0.88rem; font-weight:700; margin-top:8px; color:var(--primary)">${e.preferred_time||`Flexible`}</div>
         </div>
         <div>
           <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">SLA Timer</div>
           <div style="font-size:0.88rem; font-weight:700; margin-top:8px;">${r}</div>
         </div>
       </div>

       <div style="margin-top:20px; display:flex; gap:10px; flex-wrap:wrap;">
         <button class="btn btn-secondary btn-sm task-btn" data-id="${e.ticket_id}" data-inq-id="${e.id}" data-status="${e.status}" style="flex:1; min-width:120px; height:40px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px;">
           <span style="width:16px;height:16px;display:flex;">${u.edit}</span> Update Status
         </button>
         ${e.phone?`
           <a href="tel:${W(e.phone)}" class="btn btn-secondary btn-sm" style="flex:1; min-width:100px; height:40px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px; text-decoration:none;">
             <span style="width:16px;height:16px;display:flex;">${u.phone}</span> Call
           </a>
           <a href="https://wa.me/${(e.phone||``).replace(/\D/g,``)}" target="_blank" rel="noopener" class="btn btn-sm" style="flex:1; min-width:100px; height:40px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px; text-decoration:none; background:#25D366; color:#fff;">
             <span style="width:16px;height:16px;display:flex;">${u.whatsapp}</span> WhatsApp
           </a>
         `:``}
         <button class="btn btn-primary btn-sm" onclick="window.open('${W(te(e))}')" style="flex:1; min-width:120px; height:40px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px;">
           <span style="width:16px;height:16px;display:flex;">${u.pin}</span> Open Maps
         </button>
       </div>
    </div>
  `},w=e=>{let t=e.inquiries?.[0],n=P(e.status);return`
      <div class="emp-task-card" data-status="${n}" data-reopened="${Number(t?.reopened)===1?`1`:`0`}" style="padding:20px; border-radius:20px; background:var(--bg); box-shadow:var(--neu-sm); margin-bottom:20px; border:1px solid var(--border);${Number(t?.reopened)===1?`border-left:4px solid var(--warning);`:``}">
        ${Number(t?.reopened)===1?`<div style="display:inline-flex;align-items:center;gap:6px;font-size:0.72rem;font-weight:800;color:var(--warning);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">🔁 Reopened — free rework</div>`:``}
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div style="flex:1">
            <div style="font-weight:800; font-size:1.1rem; color:var(--text)">${e.title}</div>
            <div style="font-size:0.82rem; color:var(--text-dim); margin-top:4px;"><b>Created:</b> ${l(t?.created_at||e.created_at)}</div>
            <div style="font-size:0.85rem; color:var(--text-soft); margin-top:4px;">${e.description||`No description provided.`}</div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
            <span class="badge badge-${n}">${re(e.status)}</span>
            <span class="badge badge-${e.priority||`medium`}">${e.priority||`medium`}</span>
          </div>
        </div>
        
        ${t?`
          <div style="margin-top:16px; padding:14px; background:var(--bg-soft); border-radius:14px; border:1px dashed var(--primary);">
            <div style="font-size:0.75rem; color:var(--primary); font-weight:800; text-transform:uppercase; margin-bottom:10px;">Linked Service Request</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
              <div>
                <div style="font-size:0.7rem; color:var(--text-dim)">Client</div>
                <div style="font-size:0.9rem; font-weight:700">${t.full_name}</div>
              </div>
              <div>
                <div style="font-size:0.7rem; color:var(--text-dim)">Ticket</div>
                <div style="font-size:0.9rem; font-weight:700; color:var(--primary)">${t.ticket_no||`-`}</div>
              </div>
              <div>
                <div style="font-size:0.7rem; color:var(--text-dim)">Contact</div>
                <div style="font-size:0.9rem; font-weight:700; display:flex; align-items:center; gap:6px;">
                  ${t.phone}
                  <a href="tel:${t.phone}" style="color:var(--primary); display:flex;"><span style="width:14px;height:14px;display:flex;">${u.phone}</span></a>
                  <a href="https://wa.me/${(t.phone||``).replace(/\\D/g,``)}" target="_blank" style="color:#25D366; display:flex;"><span style="width:14px;height:14px;display:flex;">${u.whatsapp}</span></a>
                </div>
              </div>
              <div>
                <div style="font-size:0.7rem; color:var(--text-dim)">Service</div>
                <div style="font-size:0.9rem; font-weight:600">${t.service_item||`-`}</div>
              </div>
              ${t.employee_update_detail?`
                <div style="grid-column: span 2">
                  <div style="font-size:0.7rem; color:var(--text-dim)">Employee update</div>
                  <div style="font-size:0.88rem; font-weight:600; white-space:pre-wrap;">${U(t.employee_update_detail)}</div>
                </div>
              `:``}
              <div style="grid-column: span 2">
                <div style="font-size:0.7rem; color:var(--text-dim)">Location</div>
                <div style="font-size:0.88rem; font-weight:600; display:flex; align-items:flex-start; gap:6px;">
                  <span style="width:14px;height:14px;display:flex;flex-shrink:0;color:var(--primary);margin-top:2px;">${u.pin}</span>
                  ${t.location||`-`}
                </div>
              </div>
            </div>
          </div>
        `:``}
        
        <div style="margin-top:16px; display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm task-btn" data-id="${e.id}" data-inq-id="${t?t.id:``}" data-status="${e.status}" style="flex:1; min-width:120px; height:42px; display:flex; align-items:center; justify-content:center; gap:6px; font-weight:700;">
            <span style="width:16px;height:16px;display:flex;">${u.edit}</span> Update Status
          </button>
          ${t&&t.phone?`
            <a href="tel:${W(t.phone)}" class="btn btn-secondary btn-sm" style="flex:1; min-width:100px; height:42px; display:flex; align-items:center; justify-content:center; gap:6px; font-weight:700; text-decoration:none;">
              <span style="width:16px;height:16px;display:flex;">${u.phone}</span> Call
            </a>
            <a href="https://wa.me/${(t.phone||``).replace(/\D/g,``)}" target="_blank" rel="noopener" class="btn btn-sm" style="flex:1; min-width:100px; height:42px; display:flex; align-items:center; justify-content:center; gap:6px; font-weight:700; text-decoration:none; background:#25D366; color:#fff;">
              <span style="width:16px;height:16px;display:flex;">${u.whatsapp}</span> WhatsApp
            </a>
          `:``}
          ${t?`
            <button class="btn btn-primary btn-sm" onclick="window.open('${W(te(t))}')" style="flex:1; min-width:120px; height:42px; display:flex; align-items:center; justify-content:center; gap:6px; font-weight:700;">
              <span style="width:16px;height:16px;display:flex;">${u.pin}</span> Open Maps
            </button>
          `:``}
        </div>
      </div>
    `};[...g,...p].sort(Te),[..._,...m].sort(Te),[...v,...h].sort(Te),e.innerHTML=`
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1 style="display:flex; align-items:center; gap:12px;">
          <span style="width:32px; height:32px; display:flex; color:var(--primary);">${u.ticket}</span>
          <span>My Tasks</span>
        </h1>
        <p>All your assigned tasks, service jobs, and pending assignments</p>
      </div>
    </div>

    ${a.length>0?`
      <div style="margin-bottom:24px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px;">
          <span style="width:24px;height:24px;color:var(--primary);display:flex;">${u.alert}</span>
          <h2 style="margin:0; color:var(--primary); font-size:1.3rem;">New Assignments Pending</h2>
          <span style="background:var(--primary);color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.9rem;">${a.length}</span>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:16px;">
          ${a.map(e=>`
            <div style="background:linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%); border:2px solid var(--primary); border-radius:16px; padding:20px; box-shadow:0 4px 12px rgba(16, 185, 129, 0.1);">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px;">
                <div>
                  <div style="font-size:0.75rem; color:var(--primary); font-weight:800; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Service Request</div>
                  <div style="font-size:1.1rem; font-weight:800; color:var(--text);">${U(e.full_name)}</div>
                </div>
                <span style="background:var(--primary); color:white; padding:6px 12px; border-radius:20px; font-size:0.75rem; font-weight:700;">${U(e.service_item)}</span>
              </div>

              <div style="background:rgba(16, 185, 129, 0.08); border-left:3px solid var(--primary); padding:12px; border-radius:8px; margin-bottom:14px;">
                <div style="font-size:0.72rem; color:var(--text-dim); font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Ticket</div>
                <div style="font-size:0.95rem; font-weight:700; color:var(--primary);">${U(e.ticket_no||`NE-`+Math.random().toString(36).substring(2,10).toUpperCase())}</div>
              </div>

              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
                <div>
                  <div style="font-size:0.7rem; color:var(--text-dim); font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Created</div>
                  <div style="font-size:0.85rem; font-weight:600;">${l(e.created_at)}</div>
                </div>
                <div>
                  <div style="font-size:0.7rem; color:var(--text-dim); font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Preferred Time</div>
                  <div style="font-size:0.85rem; font-weight:600; color:var(--primary);">${U(e.preferred_time||`Flexible`)}</div>
                </div>
              </div>

              <div style="margin-bottom:14px;">
                <div style="font-size:0.7rem; color:var(--text-dim); font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Location</div>
                <div style="font-size:0.85rem; font-weight:600; display:flex; align-items:flex-start; gap:6px;">
                  <span style="color:var(--primary); flex-shrink:0; margin-top:2px; width:14px; height:14px; display:flex;">${u.pin}</span>
                  <span>${U(e.location||`Not specified`)}</span>
                </div>
              </div>

              <div style="display:flex; gap:8px;">
                <button class="btn btn-primary btn-sm accept-btn" data-id="${e.id}" data-ticket-id="${e.ticket_id||``}" style="flex:1; height:40px; display:flex; align-items:center; justify-content:center; gap:6px; font-weight:700;">${u.check}<span>Accept</span></button>
                <button class="btn btn-danger btn-sm decline-btn" data-id="${e.id}" style="flex:1; height:40px; display:flex; align-items:center; justify-content:center; gap:6px; font-weight:700;">${u.close}<span>Decline</span></button>
              </div>
            </div>
          `).join(``)}
        </div>
      </div>
    `:``}

    <div class="df-wrap" style="margin-bottom:24px;">
      <button class="btn btn-secondary df-toggle" id="task-filter-btn">${u.filter}<span>Filters</span><span class="df-badge" id="task-badge" style="display:none">0</span></button>
      <div class="df-panel" id="task-panel" style="display:none">
        <div class="df-field">
          <span class="df-label">Status</span>
          <select id="task-status-sel">
            <option value="in_progress">In Progress (${x.in_progress+x.active})</option>
            ${S?`<option value="reopened">🔁 Reopened (${S})</option>`:``}
            <option value="resolved">Resolved (${x.resolved})</option>
            <option value="issue_not_resolved">Issue Not Resolved (${x.issue_not_resolved})</option>
            <option value="device_followup">Device Follow Up</option>
            <option value="case_closed">Case Closed (${x.case_closed})</option>
          </select>
        </div>
        <div class="df-field">
          <span class="df-label">Search</span>
          <input id="task-search" type="search" placeholder="Search by title, client, or ticket…" autocomplete="off"/>
        </div>
        <div class="df-footer">
          <button class="btn btn-ghost btn-sm" id="task-filter-clear">Clear</button>
          <button class="btn btn-primary btn-sm" id="task-ok">Apply</button>
        </div>
      </div>
    </div>

    <div id="task-list">
      ${i.length===0&&o.length===0?`<div class="card"><div class="card-body" style="text-align:center;padding:48px;color:var(--text-dim)"><div style="font-size:2rem;margin-bottom:12px;"></div><p style="font-weight:600;">No tasks assigned yet</p><p style="font-size:0.85rem;">Tasks will appear here once admin assigns service requests to you.</p></div></div>`:`
          <div class="card" id="services-card">
            <div class="card-header"><span class="card-title" id="services-card-title">Active Services</span></div>
            <div class="card-body emp-scroll-list emp-grid-2" id="services-list">
              ${b.map(e=>e.inquiries?w(e):C(e)).join(``)}
              <div id="services-empty" style="display:none;text-align:center;padding:28px;color:var(--text-dim)">Nothing here for this status.</div>
            </div>
          </div>
        `}
    </div>

    <div id="devices-in-service-card" style="display:none;margin-top:16px;">
      <div class="card">
        <div class="card-header"><span class="card-title sr-icon-title">${u.wrench}<span>Devices in Service</span></span></div>
        <div class="card-body emp-scroll-list" id="devices-in-service-list">
          <div style="text-align:center;padding:20px;color:var(--text-dim);font-size:0.85rem;">Loading…</div>
        </div>
      </div>
    </div>
  `,ne(e,t.id,{deferShow:!0});let T=null;e._tasksChannel=f.channel(`employee-tasks-${t.id}`).on(`postgres_changes`,{event:`*`,schema:`public`,table:`inquiries`,filter:`assigned_employee_id=eq.${t.id}`},t=>{let n=t.new;(t.eventType===`INSERT`||t.eventType===`UPDATE`&&n?.assignment_status===`pending`)&&r({title:`🔔 New Job Assigned`,body:`${n?.full_name||`A client`} - ${n?.service_item||`new service`}`,type:`alert`,tag:`assign-${n?.id||``}`}),clearTimeout(T),T=setTimeout(()=>{document.body.contains(e)&&Y(e)},400)}).subscribe();let E=setInterval(()=>{if(!document.body.contains(e)){try{f.removeChannel(e._tasksChannel)}catch{}e._tasksChannel=null,clearInterval(E)}},5e3),ee={active:`In Progress Services`,in_progress:`In Progress Services`,reopened:`🔁 Reopened Tickets (free rework)`,resolved:`Resolved Services`,issue_not_resolved:`Issue Not Resolved Services`,case_closed:`Case Closed Services`},D=`in_progress`,O=``,k=()=>{let t=e.querySelector(`#services-card`),n=e.querySelector(`#devices-in-service-card`),r=O.toLowerCase();if(D===`device_followup`){if(t&&(t.style.display=`none`),n&&(n.style.display=`block`,n.dataset.hasDevices!==`1`)){let e=n.querySelector(`#devices-in-service-list`);e&&(e.innerHTML=`<div style="text-align:center;padding:28px;color:var(--text-dim)">No devices in the service center right now.</div>`)}return}n&&(n.style.display=`none`),t&&(t.style.display=``);let i=e.querySelector(`#services-card-title`);i&&(i.textContent=ee[D]||`Services`);let a=0;e.querySelectorAll(`#services-list .emp-task-card, #services-list .emp-job-card`).forEach(e=>{let t=y(e.dataset.status),n=(D===`reopened`?e.dataset.reopened===`1`:D===`in_progress`?t===`in_progress`||t===`active`:t===D)&&(!r||e.textContent.toLowerCase().includes(r));e.style.display=n?``:`none`,n&&a++});let o=e.querySelector(`#services-empty`);o&&(o.style.display=a?`none`:``)},j=e.querySelector(`#task-panel`),M=e.querySelector(`#task-filter-btn`),N=e.querySelector(`#task-badge`),F=()=>{let e=(D===`in_progress`?0:1)+ +!!O;N.textContent=e,N.style.display=e?``:`none`},I=e=>{M.closest(`.df-wrap`).contains(e.target)||(j.style.display=`none`,M.classList.remove(`df-open`),document.removeEventListener(`click`,I))};M.onclick=e=>{e.stopPropagation(),j.style.display===`none`?(j.style.display=``,M.classList.add(`df-open`),setTimeout(()=>document.addEventListener(`click`,I),0)):(j.style.display=`none`,M.classList.remove(`df-open`),document.removeEventListener(`click`,I))};let L=e.querySelector(`#task-search`),R=()=>{j.style.display=`none`,M.classList.remove(`df-open`),document.removeEventListener(`click`,I)};e.querySelector(`#task-ok`).onclick=()=>{D=e.querySelector(`#task-status-sel`).value,O=L?L.value:``,k(),F(),R()},e.querySelector(`#task-filter-clear`).onclick=()=>{D=`in_progress`,O=``,e.querySelector(`#task-status-sel`).value=`in_progress`,L&&(L.value=``),k(),F(),R()},k(),e.querySelectorAll(`.task-btn`).forEach(t=>{t.onclick=()=>A(t,t.dataset.id,t.dataset.inqId,t.dataset.status,()=>Y(e))}),e.querySelectorAll(`.accept-btn`).forEach(t=>{t.onclick=async()=>{let r=[f.from(`inquiries`).update({assignment_status:`accepted`,status:`in_progress`}).eq(`id`,t.dataset.id)];t.dataset.ticketId&&r.push(f.from(`tickets`).update({status:`in_progress`}).eq(`id`,t.dataset.ticketId));let i=(await Promise.all(r)).find(e=>e.error)?.error;i?n(i.message,`error`):(n(`Task accepted!`,`success`),Y(e))}}),e.querySelectorAll(`.decline-btn`).forEach(t=>{t.onclick=()=>{let r=prompt(`Please provide a reason for declining:`);if(r!==null){if(!r.trim()){n(`Reason is required to decline`,`warning`);return}(async()=>{let{error:i}=await f.from(`inquiries`).update({assignment_status:`declined`,decline_reason:r.trim(),status:`open`}).eq(`id`,t.dataset.id);i?n(i.message,`error`):(n(`Task declined`,`info`),Y(e))})()}}})}function Fe(e,a,o,d){return(async()=>{let{data:p}=await f.from(`service_pricing`).select(`*`).order(`category`),{data:_}=await f.from(`discount_presets`).select(`*`).eq(`active`,1).order(`created_at`,{ascending:!1}),{data:v}=await f.from(`device_types`).select(`name`).order(`name`),y=Array.isArray(v)?v:[],{data:D}=await f.from(`companies`).select(`*`).order(`name`),k=Array.isArray(D)?D:[],A={status:`unpaid`,received_at:null},j=null;if(a){let{data:e}=await f.from(`inquiries`).select(`*`).eq(`id`,a).single();e&&(j=e,A={status:e.payment_status||`unpaid`,received_at:e.payment_received_at||null})}if(!j&&e){let{data:t}=await f.from(`inquiries`).select(`*`).eq(`ticket_id`,e).maybeSingle();t&&(j=t,a=t.id,A={status:t.payment_status||`unpaid`,received_at:t.payment_received_at||null})}let{data:{user:ne}}=await f.auth.getUser(),M=ne?(await f.from(`profiles`).select(`*`).eq(`id`,ne.id).single()).data:null,N=new Date().toLocaleDateString(`en-CA`),F={lat:null,lng:null,location:null};if(ne){let{data:e}=await f.from(`attendance`).select(`latitude,longitude,location,clock_in`).eq(`user_id`,ne.id).eq(`date`,N).order(`clock_in`,{ascending:!1});Array.isArray(e)&&e[0]&&(F={lat:e[0].latitude,lng:e[0].longitude,location:e[0].location})}let I={};(p||[]).forEach(e=>{let t=e.category||`Uncategorized`,n=e.sub_category&&e.sub_category.trim()||``,r=e.sub_sub_category||e.name||``;r&&(I[t]??={},I[t][n]??=[],I[t][n].push({id:e.id,leaf:r,cost:Number(e.cost)||0}))}),Object.keys(I).sort();let L=P(o),R=T(L),ie=L===`resolved`;await w();let ae=C,z=Number(j?.device_service_enabled)===1,oe=Number(j?.device_service_enabled)!==1||j?.follow_up_status===`returned`||j?.device_status===`returned`,se=j?c(j):null,ce=s(j),fe=(()=>{if(!j?.scheduled_at)return``;let e=new Date(j.scheduled_at);return Number.isNaN(e.getTime())?``:new Date(e.getTime()-e.getTimezoneOffset()*6e4).toISOString().slice(0,16)})();Ee(j?.created_at,j?.updated_at||new Date),[`resolved`,`closed`,`issue_not_resolved`].includes(P(j?.status))&&Ee(j?.created_at,j?.updated_at||j?.bill_generated_at||new Date);let B=[];if(a){let{data:e}=await f.from(`inquiry_services`).select(`service_id, service_pricing(name, category, sub_category, sub_sub_category, cost)`).eq(`inquiry_id`,a);if(Array.isArray(e)){let t=new Set;e.forEach(e=>{if(!e.service_id||t.has(e.service_id))return;t.add(e.service_id);let n=e.service_pricing||{};B.push({id:e.service_id,main:n.category||`Service`,sub:n.sub_category||``,leaf:n.sub_sub_category||n.name||``,cost:Number(n.cost)||0})})}}let pe=()=>B.reduce((e,t)=>e+(Number(t.cost)||0),0),me=()=>Math.max(0,(Number(j?.bill_amount)||0)-(Number(j?.extra_cost)||0)),he=()=>{let e=pe();return e>0?e:me()},ge=0;if(j){he(),Number(j.extra_cost);let e=Number(j.transport_km)||0;Math.round(e*5),(j.company_name||`networking experts`).toLowerCase().replace(/\s+/g,` `);let t=Number(j.discount_amount)||0;ge=Math.max(0,t)}let V=document.createElement(`div`);V.className=`modal-overlay`,V.innerHTML=`
      <div class="modal" style="max-width:720px">
        <div class="modal-header">
          <span class="modal-title">Manage Service</span>
          <button class="modal-close" id="cm">&times;</button>
        </div>
        <div class="modal-body" style="padding-top:14px;">
          <div class="mst-tabs" role="tablist">
            <button type="button" class="mst-tab active" data-tab="status">${u.pin}<span>Status</span></button>
            <button type="button" class="mst-tab" data-tab="device">${u.wrench}<span>Device</span></button>
            <button type="button" class="mst-tab" data-tab="bill">${u.receipt}<span>Bill</span></button>
          </div>

          ${j?`
            <div style="margin:0 0 16px;padding:16px;border-radius:14px;background:var(--bg-soft);border:1px solid var(--border);">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:14px;">
                <div>
                  <div style="font-size:0.72rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Ticket</div>
                  <div style="font-size:0.95rem;font-weight:700;color:var(--primary);">${U(j.ticket_no||`No ticket`)}</div>
                </div>
                <span class="badge badge-${P(j.status)}">${re(j.status)}</span>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid rgba(16,185,129,0.1);">
                <div>
                  <div style="font-size:0.7rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Service Created</div>
                  <div style="font-size:0.88rem;font-weight:600;">${l(j.created_at)}</div>
                </div>
                <div>
                  <div style="font-size:0.7rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Last Updated</div>
                  <div style="font-size:0.88rem;font-weight:600;">${j.updated_at?l(j.updated_at):l(j.created_at)}</div>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
                <div>
                  <div style="font-size:0.7rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Name</div>
                  <div style="font-size:0.88rem;font-weight:600;">${U(j.full_name||`Client`)}</div>
                </div>
                <div>
                  <div style="font-size:0.7rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Phone</div>
                  <div style="font-size:0.88rem;font-weight:600;">${U(j.phone||`-`)}</div>
                </div>
              </div>
              <div style="margin-bottom:14px;">
                <div style="font-size:0.7rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Service Item</div>
                <div style="font-size:0.88rem;font-weight:600;">${U(j.service_item||`Service request`)}</div>
              </div>
              ${j.description?`
                <div style="margin-bottom:14px;padding:10px;background:rgba(16,185,129,0.05);border-radius:10px;border-left:3px solid var(--primary);">
                  <div style="font-size:0.7rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Customer Description</div>
                  <div style="font-size:0.82rem;line-height:1.4;color:var(--text);">${U(j.description)}</div>
                </div>
              `:``}
              <div style="margin-bottom:14px;">
                <div style="font-size:0.7rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Location</div>
                <div style="font-size:0.88rem;font-weight:600;display:flex;align-items:flex-start;gap:6px;">
                  <span style="color:var(--primary);flex-shrink:0;margin-top:2px;width:16px;height:16px;display:flex;">${u.pin}</span>
                  <span style="line-height:1.4;">${U(j.location||`-`)}</span>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
                <div>
                  <div style="font-size:0.7rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Preferred Time</div>
                  <div style="font-size:0.88rem;font-weight:600;color:var(--primary);">${U(j.preferred_time||`Flexible`)}</div>
                </div>
                <div>
                  <div style="font-size:0.7rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">SLA Deadline${j?.scheduled_at?` (rescheduled)`:``}</div>
                  <div style="font-size:0.88rem;font-weight:600;">${[`resolved`,`closed`,`issue_not_resolved`,`foc`].includes(j?.status)?`Service Completed`:ce?`<span style="color:var(--warning)">⏸ Paused — device in service</span>`:se?t(se):`-`}</div>
                </div>
              </div>
            </div>
          `:``}

          ${j?`
            <div style="background:var(--bg-soft);border:1px solid var(--border);border-radius:14px;padding:14px;margin:0 0 12px;">
              <div style="font-size:0.72rem;color:var(--text-dim);font-weight:800;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px;">Customer Details</div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px 16px;font-size:0.85rem;margin-bottom:12px;">
                ${[[`Name`,j.full_name],[`Phone`,j.phone],[`Ticket`,j.ticket_no],[`Service`,j.service_item],[`Company`,j.company_name],[`Address`,j.address||j.location]].filter(([,e])=>e).map(([e,t])=>`<div><div style="color:var(--text-dim);font-size:0.7rem;font-weight:700;text-transform:uppercase;">${e}</div><div style="font-weight:600;">${U(t)}</div></div>`).join(``)}
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                ${j.phone?`
                  <a href="tel:${W(j.phone)}" class="btn btn-secondary btn-sm" style="flex:1;min-width:90px;height:38px;display:flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;font-weight:700;"><span style="width:15px;height:15px;display:flex;">${u.phone}</span>Call</a>
                  <a href="https://wa.me/${(j.phone||``).replace(/\D/g,``)}" target="_blank" rel="noopener" class="btn btn-sm" style="flex:1;min-width:90px;height:38px;display:flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;font-weight:700;background:#25D366;color:#fff;"><span style="width:15px;height:15px;display:flex;">${u.whatsapp}</span>WhatsApp</a>
                `:``}
                <a href="${W(te(j))}" target="_blank" rel="noopener" class="btn btn-primary btn-sm" style="flex:1;min-width:90px;height:38px;display:flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;font-weight:700;"><span style="width:15px;height:15px;display:flex;">${u.pin}</span>Open Map</a>
              </div>
            </div>
          `:``}

          ${F.lat!=null||j?.customer_lat!=null?`
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 12px;">
              <a href="${F.lat==null?`#`:W(O(F.lat,F.lng))}" target="_blank" rel="noopener"
                 style="padding:10px;border-radius:10px;background:var(--bg-soft);border:1px solid var(--border);text-decoration:none;color:var(--text);font-size:0.78rem;${F.lat==null?`pointer-events:none;opacity:.55;`:``}">
                <b style="display:block;color:var(--primary);margin-bottom:3px;">Employee pin</b>
                <span>${U(F.location||`Clock-in GPS`)}</span>
              </a>
              <a href="${j?.customer_lat==null?`#`:W(O(j.customer_lat,j.customer_lng))}" target="_blank" rel="noopener"
                 style="padding:10px;border-radius:10px;background:var(--bg-soft);border:1px solid var(--border);text-decoration:none;color:var(--text);font-size:0.78rem;${j?.customer_lat==null?`pointer-events:none;opacity:.55;`:``}">
                <b style="display:block;color:var(--primary);margin-bottom:3px;">Client pin</b>
                <span>${U(j?.location||`Customer GPS`)}</span>
              </a>
            </div>
          `:``}

          ${j?.description?`
            <div style="margin:0 0 14px;padding:12px;border-radius:10px;background:var(--bg-soft);border:1px solid var(--border);">
              <div style="font-size:0.72rem;font-weight:700;color:var(--primary);letter-spacing:0.04em;text-transform:uppercase;margin-bottom:6px;">Client's reported issue</div>
              <div style="white-space:pre-wrap;line-height:1.45;font-size:0.86rem;">${U(j.description)}</div>
            </div>
          `:``}

          <!-- TAB 1: STATUS -->
          <div class="mst-pane active" data-pane="status">
            ${Number(j?.reopened)===1?`
              <div style="padding:12px 14px;border-radius:12px;background:rgba(245,158,11,0.12);border:1px solid var(--warning);margin-bottom:14px;font-size:0.85rem;line-height:1.5;">
                🔁 <b>Reopened ticket — issue not resolved.</b> The customer already paid for this service, so complete the rework as <b>FOC (Free of Cost)</b> — no new bill will be generated.
              </div>`:``}
            <div class="form-group">
              <label>New Status</label>
              <select id="new-status" ${R?`disabled`:``}>
                ${Number(j?.reopened)===1?`
                  <option value="resolved" ${L===`resolved`?`selected`:``}>Resolved</option>
                  <option value="foc" ${L===`foc`?`selected`:``}>FOC — Free of Cost (no bill generated)</option>
                `:`
                  <option value="in_progress" ${L===`in_progress`?`selected`:``}>In Progress</option>
                  <option value="resolved" ${L===`resolved`?`selected`:``}>Resolved</option>
                  <option value="reschedule">📅 Reschedule (set new visit time)</option>
                  <option value="issue_not_resolved" ${L===`issue_not_resolved`?`selected`:``}>Issue Not Resolved</option>
                  <option value="case_closed" ${L===`case_closed`?`selected`:``}>Case Closed — customer didn't cooperate / no fee</option>
                `}
              </select>
              <small id="case-closed-hint" style="display:${L===`case_closed`?`block`:`none`}; margin-top:6px; color:var(--danger); font-size:0.75rem;">⚠️ Case Closed is final — the ticket will be locked and cannot be reopened.</small>
            </div>

            <div class="form-group" id="foc-billno-group" style="display:${L===`foc`?`block`:`none`};">
              <label>Client Bill Number <span style="color:var(--danger)">*</span></label>
              <input type="text" id="foc-bill-no" value="${U(j?.bill_no||``)}" placeholder="Enter the customer's existing bill number" />
              <small style="color:var(--text-dim);font-size:0.75rem;">FOC service: no new bill is generated, but the client's bill number is required for the record.</small>
            </div>

            <div class="form-group" id="reschedule-group" style="display:none;">
              <label>New visit date &amp; time <span style="color:var(--danger)">*</span></label>
              <input type="datetime-local" id="reschedule-at" value="${fe}" />
              <small style="color:var(--text-dim);font-size:0.75rem;">Saving sends the customer an SMS with this new time, and the SLA timer resets to it.</small>
            </div>

            <div class="form-group">
              <label id="progress-detail-label">Work Details / Progress Update <span style="color:var(--danger)">*</span></label>
              <textarea id="progress-detail" rows="5" placeholder="Describe what you did... (Mandatory)"></textarea>
            </div>

            <div id="feedback-link-box" style="display:none; padding:12px; border-radius:12px; background:rgba(16,185,129,0.07); border:1px solid var(--primary);">
              <div style="font-size:0.78rem; font-weight:700; color:var(--primary); margin-bottom:6px;"> Feedback Link for Client</div>
              <div style="display:flex; gap:8px;">
                <input id="feedback-url" type="text" readonly style="flex:1; font-size:0.78rem; background:var(--bg);"/>
                <button class="btn btn-secondary btn-sm" id="copy-feedback-url">Copy</button>
              </div>
              <button class="btn btn-primary btn-sm" id="share-feedback-wa" style="width:100%; margin-top:8px; justify-content:center; gap:8px;">
                ${u.whatsapp}<span>Share Feedback Link via WhatsApp</span>
              </button>
            </div>
          </div>

          <!-- TAB 2: DEVICE INFO -->
          <div class="mst-pane" data-pane="device">
            <div class="form-group">
              <label>Company Name <span style="color:var(--danger)">*</span></label>
              <select id="resolve-company" style="margin-bottom:8px;" ${R?`disabled`:``}>
                <option value="">Select Company...</option>
                ${k.map(e=>{let t=(j?.company_name||`networking experts`).toLowerCase()===e.name.toLowerCase();return`<option value="${e.name.replace(/"/g,`&quot;`)}" ${t?`selected`:``}>${e.name}</option>`}).join(``)}
                <option value="Other">Other (Type manually)</option>
              </select>
              <input type="text" id="resolve-company-custom" placeholder="Type custom company name (Mandatory)" style="display:none;" ${R?`disabled`:``}/>
            </div>
            <div class="form-group">
              <label>Device Type</label>
              <input type="text" id="device-type" list="emp-device-types" placeholder="${y.length?`Start typing or pick...`:`e.g. Video Door Phone`}" value="${(j?.device_type||``).replace(/"/g,`&quot;`)}" ${R?`disabled`:``}/>
              <datalist id="emp-device-types">
                ${y.map(e=>`<option value="${(e.name||``).replace(/"/g,`&quot;`)}"></option>`).join(``)}
              </datalist>
              ${y.length===0?`<small style="display:block; margin-top:6px; color:var(--text-dim); font-size:0.75rem;">Tip: ask admin to add device types so this becomes a quick-pick list.</small>`:``}
            </div>
            <div class="form-group">
              <label>Device Serial No</label>
              <input type="text" id="device-serial" placeholder="e.g. SN-12345" value="${(j?.device_serial_no||``).replace(/"/g,`&quot;`)}" ${R?`disabled`:``}/>
            </div>
            <small style="display:block; color:var(--text-dim); font-size:0.78rem; margin-top:-4px;">These are saved on the inquiry whenever you press Save Changes - and they appear on the bill template.</small>
          </div>

          ${ae?`
          <!-- TAB: DEVICE SERVICE -->
          <div class="mst-pane" data-pane="service">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:12px;background:var(--bg-soft);border:1px solid var(--border);margin-bottom:14px;">
              <div>
                <div style="font-weight:700;font-size:0.9rem;">Send device to service center</div>
                <small style="color:var(--text-dim);font-size:0.76rem;">Turn on when you take the customer's device for off-site repair. The ticket stays In Progress.</small>
              </div>
              <label class="switch">
                <input type="checkbox" id="device-service-toggle" ${z?`checked`:``}>
                <span class="switch-slider"></span>
              </label>
            </div>

            <div id="device-service-body" style="display:${z?`block`:`none`};">
              <div class="form-group">
                <label>Device Photo (when taken) <span style="color:var(--danger)">*</span></label>
                <input type="file" id="device-taken-image" accept="image/*">
              </div>
              <div class="form-group">
                <label>Device Description / Condition on pickup</label>
                <textarea id="device-taken-desc" rows="3" placeholder="e.g. CCTV DVR, power issue, scratches on top panel"></textarea>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" id="save-device-taken">Save device taken</button>

              <hr style="border:none;border-top:1px solid var(--border);margin:16px 0;">

              <div class="form-group">
                <label>Return photo (when handing back to client) <span style="color:var(--danger)">*</span></label>
                <input type="file" id="device-return-image" accept="image/*">
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group">
                  <label>Condition</label>
                  <select id="device-return-condition">
                    <option value="repaired">Repaired</option>
                    <option value="good">Good</option>
                    <option value="damaged">Damaged</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Return notes</label>
                  <input type="text" id="device-return-notes" placeholder="e.g. replaced adapter">
                </div>
              </div>
              <button type="button" class="btn btn-primary btn-sm" id="save-device-return">Mark returned / sent back to client</button>

              <hr style="border:none;border-top:1px solid var(--border);margin:16px 0;">

              <!-- Follow-up status updates (awaiting parts / in repair / ready to return) -->
              <div id="followup-body">
                <div style="font-weight:700;font-size:0.88rem;margin-bottom:8px;">Repair / follow-up progress</div>
                <div class="form-group">
                  <label>Update status</label>
                  <select id="device-followup-status">
                    <option value="awaiting_parts">⏳ Awaiting Parts</option>
                    <option value="repair_progress">🔧 Repair in Progress</option>
                    <option value="ready_return">📦 Ready to Return</option>
                    <option value="returned">✅ Returned to Client</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Progress note</label>
                  <textarea id="device-followup-notes" rows="2" placeholder="Latest update on this device..."></textarea>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" id="save-device-followup">Add follow-up update</button>
                <div id="followup-history" style="margin-top:14px;"></div>
              </div>
              <small id="followup-disabled-hint" style="display:none;color:var(--text-dim);">Turn on device service above to log follow-up updates.</small>

              <div id="device-history" style="margin-top:18px;"><div style="text-align:center;color:var(--text-dim);font-size:0.82rem;padding:10px;">Loading device history…</div></div>
            </div>
          </div>
          `:``}

          <!-- TAB 3: BILL -->
          <div class="mst-pane" data-pane="bill">
            <div id="bill-locked-hint" style="display:${ie?`none`:`block`}; padding:14px; border-radius:12px; background:var(--bg-soft); border:1px dashed var(--border); margin-bottom:14px; font-size:0.85rem; color:var(--text-soft);">
              ℹ️ Set status to <b>Resolved</b> on the Status tab to enable billing.
            </div>
            <div id="pricing-section" style="display:${ie?`block`:`none`};">
              <label style="font-weight:700; margin-bottom:8px; display:block;">Diagnose Issue & Add Services</label>
              ${(p||[]).length===0?`
                <p style="font-size:0.8rem; color:var(--text-dim); padding:10px; background:var(--bg-soft); border-radius:10px;">No standard services defined by Admin.</p>
              `:`
                <div class="svc-search-row">
                  <div class="svc-search-input-wrap">
                    <span class="svc-search-icon">${u.search}</span>
                    <input type="search" id="svc-search" class="svc-search-input" placeholder="Search services (e.g. CCTV, network, door, camera…)" autocomplete="off"/>
                    <div id="svc-results" class="svc-results"></div>
                  </div>
                </div>
                <div id="svc-selected" style="display:none; margin-bottom:12px;"></div>
              `}

              <div class="form-group">
                <label>Additional Charges (Optional)</label>
                <input type="number" id="extra-cost" placeholder="₹0" value="${j?.extra_cost||``}" style="margin-bottom:8px;"/>
                <input type="text" id="extra-reason" placeholder="Reason for extra charge..." value="${U(j?.extra_cost_reason||``)}"/>
              </div>

              <div class="form-group">
                <label>Redeem Coupon</label>
                <div style="display:flex;gap:8px;align-items:stretch;">
                  <input type="text" id="coupon-code" placeholder="Enter coupon code (e.g. SAVE50)" value="${U(j?.coupon_code||``)}" style="flex:1 1 auto;min-width:0;text-transform:uppercase;letter-spacing:.04em;font-weight:700;"/>
                  <button type="button" class="btn btn-secondary btn-sm" id="coupon-apply" style="white-space:nowrap;flex:0 0 auto;">Apply</button>
                  <button type="button" class="btn btn-secondary btn-sm" id="coupon-clear" style="white-space:nowrap;flex:0 0 auto;display:none;">Remove</button>
                </div>
                <small id="coupon-msg" style="display:none;margin-top:6px;font-size:0.75rem;font-weight:600;"></small>
                <label style="margin-top:12px;">Employee Discount (optional)</label>
                <div style="display:grid;grid-template-columns:1fr 1.4fr;gap:8px;">
                  <input type="number" id="manual-discount" min="0" step="1" placeholder="Extra discount Rs.0" value="${ge||``}"/>
                  <input type="text" id="discount-reason" placeholder="Reason required for employee discount" value="${U(j?.discount_reason||``)}"/>
                </div>
                <small style="display:block;margin-top:6px;color:var(--text-dim);font-size:0.75rem;">Coupons apply automatically once validated. Any extra employee/manual discount requires a reason and appears in Discount Details.</small>
              </div>

              <div class="form-group">
                <label>Transport Distance (km)</label>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <input type="number" id="transport-km" min="0" step="0.1" placeholder="0" value="${j?.transport_km||``}" style="flex:1; min-width:120px;"/>
                  <button type="button" class="btn btn-secondary btn-sm" id="capture-loc" style="white-space:nowrap" title="Capture your precise GPS location right now (you should be at the customer site)">📍 Capture My Location</button>
                  <button type="button" class="btn btn-secondary btn-sm" id="auto-km" style="white-space:nowrap" title="Calculate km from your clock-in location to the precise location">🧮 Auto km</button>
                </div>
                <small id="transport-km-hint" style="display:block; margin-top:6px; color:var(--text-dim); font-size:0.75rem;">₹5 per km  ?  capture your precise location at the customer site, then click 🧮 Auto km.</small>
                <small id="bill-loc-status" style="display:none; margin-top:4px; color:var(--primary); font-size:0.75rem; font-weight:600;"></small>
              </div>

              <div class="bill-breakdown" id="bill-breakdown">
                <div id="br-service-lines"></div>
                <div class="bill-row" id="br-extra-row" style="display:none;"><span id="br-extra-label">Additional charges</span><b id="br-extra">₹0</b></div>
                <div class="bill-row"><span>Platform fee</span><b id="br-platform">₹50</b></div>
                <div class="bill-row"><span>Transport (<span id="br-km">0</span> km x ₹5)</span><b id="br-transport">₹0</b></div>
                <div class="bill-row"><span>GST (18%)</span><b id="br-gst">₹0</b></div>
                <div class="bill-row bill-row-discount" id="br-discount-row" style="display:none;"><span>Discount</span><b id="br-discount">-₹0</b></div>
                <div class="bill-row bill-row-total"><span>Final total</span><b id="br-total">₹0</b></div>
                <input type="hidden" id="total-bill-display" value="0"/>
              </div>

              <button type="button" class="btn btn-primary btn-wide" id="open-bill-modal" style="margin-bottom:14px;">${u.receipt}<span>Generate &amp; Send Premium Bill</span></button>
              <div id="bill-pdf-actions" style="display:${j?.bill_pdf_url?`block`:`none`}; margin-bottom:14px; padding:14px; border-radius:14px; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.35);">
                <div style="font-weight:800; color:var(--success); font-size:0.88rem; margin-bottom:8px;">Saved bill ready</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <a class="btn btn-secondary btn-sm" id="bill-pdf-view" href="${W(j?.bill_pdf_url||`#`)}" target="_blank" rel="noopener" style="text-decoration:none;">${u.receipt}<span>View PDF</span></a>
                  <button type="button" class="btn btn-primary btn-sm" id="bill-details-whatsapp">${u.whatsapp}<span>Send via WhatsApp</span></button>
                </div>
              </div>

              <!-- Payment Method choice -->
              <div class="form-group" style="margin-bottom:14px;">
                <label>How will the client pay?</label>
                <div class="pay-method-toggle" id="pay-method-toggle">
                  <button type="button" class="pay-method-btn active" data-method="online">${u.card}<span>Online (Razorpay)</span></button>
                  <button type="button" class="pay-method-btn" data-method="cash">${u.rupee}<span>Cash on Service</span></button>
                </div>
              </div>

              <!-- Cash collection section (hidden until method=cash) -->
              <div id="cash-section" style="display:none; padding:14px; background:rgba(245,158,11,0.06); border-radius:14px; border:1px solid var(--warning); margin-bottom:14px;">
                <div style="font-weight:700; font-size:0.9rem; color:var(--text); margin-bottom:8px;">Cash Collection</div>
                <div style="font-size:0.82rem; color:var(--text-soft); margin-bottom:12px;">
                  Mark this once you have <b>physically received</b> the cash from the client. The amount will appear in your <b>My Cash</b> tab as <i>pending submission</i> until you hand it to admin.
                </div>
                <button type="button" class="btn btn-primary btn-wide" id="mark-cash-btn" style="background:var(--warning); box-shadow:0 8px 24px rgba(245,158,11,0.32);">
                  Mark Cash Collected - <span id="cash-amount-display">₹0</span>
                </button>
                <div id="cash-collected-banner" style="display:none; margin-top:10px; padding:10px 12px; border-radius:10px; background:rgba(16,185,129,0.08); border:1px solid var(--success); font-size:0.85rem; color:var(--success); font-weight:700;">
                  Cash collected - appears in your My Cash tab.
                </div>
              </div>

              <!-- Payment Link + QR -->
              <div style="padding:14px; background:var(--bg-soft); border-radius:14px; border:1px solid var(--border);">
                <div class="icon-text-label" style="font-weight:700; font-size:0.85rem; margin-bottom:10px; color:var(--text)">${u.card}<span>Payment Link & QR</span></div>
                <div style="display:flex; gap:8px; margin-bottom:10px;">
                  <input id="emp-pay-link" type="url" placeholder="Payment link will appear here..." style="flex:1 1 auto; min-width:0; font-size:0.82rem;" readonly/>
                  <button class="btn btn-secondary btn-sm" id="emp-gen-link" style="white-space:nowrap; flex:0 0 auto;">${u.link}<span>Generate</span></button>
                </div>
                <div id="emp-qr-wrap" style="display:none; text-align:center; margin-bottom:10px;">
                  <img id="emp-qr-img" src="" alt="QR Code" style="width:160px; height:160px; border-radius:12px; border:2px solid var(--primary);"/>
                  <div style="font-size:0.75rem; color:var(--text-dim); margin-top:6px;">Client can scan to pay</div>
                </div>
                <button class="btn btn-primary btn-sm" id="emp-share-wa" style="width:100%; display:none; gap:8px; justify-content:center;">
                  ${u.whatsapp}<span>Share via WhatsApp</span>
                </button>

                <div id="emp-pay-status" style="margin-top:12px; padding:12px; border-radius:12px; background:var(--bg); border:2px solid var(--border); display:flex; align-items:center; gap:10px;">
                  <div id="emp-pay-status-icon" style="width:32px; height:32px; display:flex; align-items:center; justify-content:center; color:var(--text-dim);">${u.clock}</div>
                  <div style="flex:1">
                    <div id="emp-pay-status-title" style="font-weight:800; font-size:0.9rem; color:var(--text)">Payment: Unpaid</div>
                    <div id="emp-pay-status-sub" style="font-size:0.75rem; color:var(--text-dim);">Generate a link, then wait for the client to pay.</div>
                  </div>
                  <button class="btn btn-secondary btn-sm" id="emp-pay-check" title="Re-check payment" style="white-space:nowrap">↻</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cm2">Cancel</button>
          <button class="btn btn-primary" id="save-update">Save Changes</button>
        </div>
      </div>`,document.body.appendChild(V);let _e=()=>V.remove();if(V.querySelector(`#cm`)?.addEventListener(`click`,_e),V.querySelector(`#cm2`)?.addEventListener(`click`,_e),V.addEventListener(`click`,e=>{e.target===V&&_e()}),j?.employee_update_detail){let e=document.createElement(`div`);e.style.cssText=`padding:12px;border-radius:12px;background:var(--bg-soft);border:1px solid var(--border);margin:12px 0;`,e.innerHTML=`<div class="sr-meta-label">Last submitted detail</div><div class="sr-meta-value" style="white-space:pre-wrap;line-height:1.45;">${U(j.employee_update_detail)}</div><small style="color:var(--text-dim)">Status: ${re(j.employee_update_status||j.status)}${j.employee_update_at?` - ${l(j.employee_update_at)}`:``}</small>`,V.querySelector(`[data-pane="status"]`)?.appendChild(e)}let ve=`svc-progress-draft:`+(a||e||``),ye=V.querySelector(`#progress-detail`),be=V.querySelector(`#new-status`);if(ye){let e=``;try{e=sessionStorage.getItem(ve)||``}catch{}ye.value=e||j?.employee_update_detail||``;let t=()=>{try{sessionStorage.setItem(ve,ye.value)}catch{}};ye.addEventListener(`input`,t),be&&be.addEventListener(`change`,t)}let xe=[`status`,`device`,`bill`],Se=()=>V.querySelector(`.mst-tab.active`)?.dataset.tab||xe[0],Ce=()=>Se()===xe[xe.length-1],we=e=>{V.querySelectorAll(`.mst-tab`).forEach(t=>t.classList.toggle(`active`,t.dataset.tab===e)),V.querySelectorAll(`.mst-pane`).forEach(t=>t.classList.toggle(`active`,t.dataset.pane===e)),$()};V.querySelectorAll(`.mst-tab`).forEach(e=>{e.onclick=()=>we(e.dataset.tab)}),(()=>{let e=V.querySelector(`[data-pane="service"]`),t=V.querySelector(`[data-pane="status"]`);if(!e||!t)return;e.classList.remove(`mst-pane`),e.removeAttribute(`data-pane`),e.style.display=`block`;let n=V.querySelector(`#device-serial`)?.closest(`.form-group`),r=e.querySelector(`#device-service-body`);n&&r&&r.insertBefore(n,r.firstChild);let i=document.createElement(`hr`);i.style.cssText=`border:none;border-top:1px solid var(--border);margin:18px 0 14px;`,t.appendChild(i),t.appendChild(e)})();let H=V.querySelector(`#new-status`),Te=V.querySelector(`#pricing-section`),De=V.querySelector(`#total-bill-display`),Oe=V.querySelector(`#extra-cost`),ke=V.querySelector(`#extra-reason`),Ae=V.querySelector(`#coupon-code`),G=V.querySelector(`#coupon-apply`),K=V.querySelector(`#coupon-clear`),je=V.querySelector(`#coupon-msg`),Me=V.querySelector(`#manual-discount`),Ne=V.querySelector(`#discount-reason`),Pe=V.querySelector(`#transport-km`),q=V.querySelector(`#save-update`),J=e=>`₹${Math.round(Number(e)||0).toLocaleString(`en-IN`)}`,Y=()=>{let e=V.querySelector(`#resolve-company`),t=V.querySelector(`#resolve-company-custom`);return e?e.value===`Other`?t?.value.trim()||``:e.value:``},Fe=()=>Y().toLowerCase().replace(/\s+/g,` `)===`networking experts`?50:100,Ie=async e=>{if(!e)return;let t=e.trim();if(t.toLowerCase()===`networking experts`||k.some(e=>e.name.toLowerCase()===t.toLowerCase()))return;let{data:n}=await f.from(`companies`).select(`name`).eq(`name`,t).maybeSingle();if(n)return;let{error:r}=await f.from(`companies`).insert({id:crypto.randomUUID?crypto.randomUUID():String(Math.random()),name:t});r||k.push({name:t})},X={servicesSubtotal:0,extra:0,platform:Fe(),km:0,transport:0,couponDiscount:0,couponCode:``,couponLabel:``,manualDiscount:0,discount:0,discountLabel:``,discountReason:``,discountPresetId:null,taxable:0,gst:0,total:0},Le=j?.bill_pdf_url||``,Re=j?.payment_link||``,ze=()=>{let e=V.querySelector(`#bill-pdf-actions`),t=V.querySelector(`#bill-pdf-view`);e&&(e.style.display=Le?`block`:`none`,Le&&t&&(t.href=Le))},Be=(e=j||{})=>{let t=B.length?B.map(e=>({name:`${e.main}${e.sub?` > `+e.sub:``} > ${e.leaf}`,cost:e.cost})):X.servicesSubtotal>0?[{name:e.service_item||`Service`,cost:X.servicesSubtotal}]:[];return{...X,customer:{name:e.full_name||``,phone:e.phone||``,location:e.location||``,company:Y()||e.company_name||``,device_type:V.querySelector(`#device-type`)?.value.trim()||e.device_type||``,device_serial:V.querySelector(`#device-serial`)?.value.trim()||e.device_serial_no||``,service_item:e.service_item||``,ticket_no:e.ticket_no||``},technician:M?.full_name||`Technician`,services:t,extraReason:V.querySelector(`#extra-reason`)?.value.trim()||``,discountLabel:X.discountLabel,discountReason:X.manualDiscount>0?X.discountReason:``,paymentLink:Re||e.payment_link||``,paymentStatus:e.payment_status||`unpaid`}},Z=()=>{X.servicesSubtotal=he(),X.extra=Number(Oe.value)||0,X.km=Math.max(0,Number(Pe.value)||0),X.transport=Math.round(X.km*5),X.platform=Fe();let e=X.servicesSubtotal+X.extra+X.platform+X.transport;X.taxable=e,X.gst=Math.round(e*.18);let t=e+X.gst,n=Math.min(X.couponDiscount||0,t);X.manualDiscount=Math.max(0,Number(Me?.value)||0),X.discount=Math.min(t,n+X.manualDiscount);let r=[];n>0&&r.push(X.couponLabel||(X.couponCode?`Coupon ${X.couponCode}`:`Coupon`)),X.manualDiscount>0&&r.push(`Employee discount`),X.discountLabel=r.join(` + `)||``,X.discountReason=Ne?.value.trim()||``,X.total=t-X.discount;let i=V.querySelector(`#br-service-lines`);if(i){let e=B.length?B.map(e=>({label:`${e.main}${e.sub?` > `+e.sub:``} > ${e.leaf}`,cost:Number(e.cost)||0})):X.servicesSubtotal>0?[{label:j?.service_item||`Service`,cost:X.servicesSubtotal}]:[];i.innerHTML=e.length?e.map(e=>`
              <div class="bill-row">
                <span>${U(e.label)}</span>
                <b>${J(e.cost)}</b>
              </div>
            `).join(``):`<div class="bill-row"><span>No service added</span><b>${J(0)}</b></div>`}let a=V.querySelector(`#br-extra-row`),o=V.querySelector(`#br-extra-label`);if(a&&(a.style.display=X.extra>0?`flex`:`none`),o){let e=ke?.value.trim();o.textContent=e?`Additional charges (${e})`:`Additional charges`}V.querySelector(`#br-extra`).textContent=J(X.extra),V.querySelector(`#br-platform`).textContent=J(X.platform),V.querySelector(`#br-km`).textContent=X.km.toString(),V.querySelector(`#br-transport`).textContent=J(X.transport);let s=V.querySelector(`#br-discount-row`);s.style.display=X.discount>0?`flex`:`none`,s.querySelector(`span`).textContent=X.discountLabel||`Discount`,V.querySelector(`#br-discount`).textContent=`-${J(X.discount)}`,V.querySelector(`#br-gst`).textContent=J(X.gst),V.querySelector(`#br-total`).textContent=J(X.total),De.value=String(X.total);let c=V.querySelector(`#cash-amount-display`);c&&(c.textContent=J(X.total))},Ve=()=>(Z(),X.manualDiscount>0&&!X.discountReason?(n(`Please enter reason for employee discount`,`warning`),!1):!0),He=(e,t,n,r)=>{let i=e=>e*Math.PI/180,a=i(n-e),o=i(r-t),s=Math.sin(a/2)**2+Math.cos(i(e))*Math.cos(i(n))*Math.sin(o/2)**2;return 2*6371*Math.asin(Math.sqrt(s))},Q={lat:null,lng:null,accuracy:null},Ue=V.querySelector(`#auto-km`),We=V.querySelector(`#capture-loc`),Ge=V.querySelector(`#transport-km-hint`),Ke=V.querySelector(`#bill-loc-status`),qe=()=>{let e=F.lat,t=F.lng,n=Q.lat!=null,r=j?.customer_lat!=null&&j?.customer_lng!=null;if(e==null||t==null){Ge.textContent=`₹5 per km  ?  enter manually (no clock-in GPS on record for today).`,Ue.disabled=!0,Ue.style.opacity=`0.5`;return}if(!n&&!r){Ge.textContent=`₹5 per km  ?  capture your precise location at the customer site to enable Auto km.`,Ue.disabled=!0,Ue.style.opacity=`0.5`;return}Ue.disabled=!1,Ue.style.opacity=`1`,Ge.textContent=n?`Start point: your clock-in location (fixed for today) → on-site capture. ₹5/km, auto-filled.`:`Start point: your clock-in location (fixed for today) → customer GPS. ₹5/km, auto-filled. Capture on-site for best accuracy.`};qe(),We.onclick=async()=>{We.disabled=!0;let e=We.textContent;We.innerHTML=`<span class="srf-spin"></span> Locating...`;try{let{latitude:e,longitude:t,accuracy:r}=(await ee()).coords;Q.lat=e,Q.lng=t,Q.accuracy=r,Ke.style.display=`block`,Ke.textContent=`📍 Captured: ${e.toFixed(6)}, ${t.toFixed(6)} (±${Math.round(r)}m)`,n(`Precise location captured (±${Math.round(r)}m)`,`success`),qe()}catch(e){n(`Could not capture location - check GPS permission`,`error`),console.error(`Capture location failed:`,e)}finally{We.disabled=!1,We.textContent=e}};let Je=({silent:e}={})=>{let t=F.lat,r=F.lng;if(t==null||r==null)return!1;let i,a,o;if(Q.lat!=null&&Q.lng!=null)i=Q.lat,a=Q.lng,o=`on-site capture`;else if(j?.customer_lat!=null&&j?.customer_lng!=null)i=j.customer_lat,a=j.customer_lng,o=`customer GPS`;else return!1;let s=He(Number(t),Number(r),Number(i),Number(a))*1.3;return Pe.value=s.toFixed(1),Z(),e||$(),e||n(`Distance: ${s.toFixed(1)} km (clock-in location → ${o})`,`success`),!0};Ue.onclick=()=>Je({silent:!1}),(!Pe.value||Number(Pe.value)===0)&&Je({silent:!0}),Pe.oninput=()=>{Z(),$()};let Ye=V.querySelector(`#progress-detail`);Ye&&(Ye.oninput=()=>{$()});let Xe=V.querySelector(`#resolve-company`),Ze=V.querySelector(`#resolve-company-custom`),Qe=()=>{Xe.value===`Other`?Ze.style.display=`block`:(Ze.style.display=`none`,Ze.value=``),Z(),$()};if(Xe){Xe.onchange=Qe;let e=j?.company_name||`networking experts`;k.some(t=>t.name.toLowerCase()===e.toLowerCase())?(Xe.value=k.find(t=>t.name.toLowerCase()===e.toLowerCase())?.name||e,Ze.style.display=`none`,Ze.value=``):(Xe.value=`Other`,Ze.style.display=`block`,Ze.value=e)}Ze&&(Ze.oninput=()=>{Z(),$()});let $e=V.querySelector(`#svc-selected`),et=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]),tt=()=>{if($e){if(B.length===0){$e.style.display=`none`,$e.innerHTML=``;return}$e.style.display=`block`,$e.innerHTML=`
        <div style="font-size:0.78rem; font-weight:700; color:var(--text-dim); margin-bottom:6px;">Services performed (${B.length})</div>
        ${B.map((e,t)=>`
          <div style="display:flex; align-items:center; gap:8px; padding:8px 10px; background:var(--bg); border:1px solid var(--border); border-radius:10px; margin-bottom:6px;">
            <div style="flex:1; font-size:0.85rem;">
              <b>${et(e.main)}</b>${e.sub?` › ${et(e.sub)}`:``} › ${et(e.leaf)}
            </div>
            <span style="font-weight:700; color:var(--primary);">₹${Number(e.cost).toLocaleString(`en-IN`)}</span>
            <button type="button" class="btn btn-danger btn-sm svc-remove" data-idx="${t}" title="Remove" ${R?`style="display:none;" disabled`:``}>✕</button>
          </div>
        `).join(``)}
      `,$e.querySelectorAll(`.svc-remove`).forEach(e=>{e.onclick=()=>{B.splice(Number(e.dataset.idx),1),tt(),Z(),$()}})}},nt=(p||[]).map(e=>({id:e.id,main:e.category||`Uncategorized`,sub:(e.sub_category||``).trim(),leaf:e.sub_sub_category||e.name||``,cost:Number(e.cost)||0,_s:[e.category,e.sub_category,e.sub_sub_category,e.name].filter(Boolean).join(` `).toLowerCase()})).filter(e=>e.leaf),rt=V.querySelector(`#svc-search`),it=V.querySelector(`#svc-results`),at=()=>{it&&(it.innerHTML=``,it.style.display=`none`)},ot=e=>{if(B.some(t=>t.id===e.id)){n(`Already added`,`warning`);return}B.push({id:e.id,main:e.main,sub:e.sub,leaf:e.leaf,cost:e.cost}),tt(),Z(),$(),rt&&(rt.value=``),at()};rt&&(rt.addEventListener(`input`,()=>{let e=rt.value.trim().toLowerCase();if(!e){at();return}let t=e.split(/\s+/),n=nt.filter(e=>t.every(t=>e._s.includes(t))).slice(0,10);if(n.length===0){it.innerHTML=`<div class="svc-result-empty">No services match "<b>${et(e)}</b>"</div>`,it.style.display=`block`;return}it.innerHTML=n.map((e,t)=>`
          <div class="svc-result-item" data-idx="${t}">
            <div class="svc-result-name">${et(e.main)}${e.sub?` <span class="svc-result-sep">›</span> ${et(e.sub)}`:``} <span class="svc-result-sep">›</span> <b>${et(e.leaf)}</b></div>
            <span class="svc-result-price">₹${e.cost.toLocaleString(`en-IN`)}</span>
          </div>`).join(``),it.style.display=`block`,it.querySelectorAll(`.svc-result-item`).forEach((e,t)=>{e.addEventListener(`mousedown`,e=>{e.preventDefault(),ot(n[t])})})}),rt.addEventListener(`blur`,()=>setTimeout(at,180)),rt.addEventListener(`focus`,()=>{rt.value.trim()&&rt.dispatchEvent(new Event(`input`))}));let st=V.querySelector(`#emp-pay-status`),ct=V.querySelector(`#emp-pay-status-icon`),lt=V.querySelector(`#emp-pay-status-title`),ut=V.querySelector(`#emp-pay-status-sub`),dt=!1,ft=!1,$=()=>{let e=H.value===`resolved`,t=Number(De.value)||0,n=e&&t>0,r=A.status===`paid`;r?(st.style.borderColor=`var(--success)`,st.style.background=`rgba(16,185,129,0.08)`,ct.innerHTML=u.check,ct.style.color=`var(--success)`,lt.textContent=`✓ Payment Received`,lt.style.color=`var(--success)`,ut.textContent=A.received_at?`Received at ${i(A.received_at)} - you can now submit.`:`You can now submit the resolution.`):dt?(st.style.borderColor=`var(--warning)`,st.style.background=`rgba(245,158,11,0.06)`,ct.innerHTML=u.clock,ct.style.color=`var(--warning)`,lt.textContent=`⏳ Waiting for Payment`,lt.style.color=`var(--warning)`,ut.textContent=`Auto-checking every 3s - Save unlocks the moment Razorpay confirms.`):(st.style.borderColor=`var(--border)`,st.style.background=`var(--bg)`,ct.innerHTML=u.clock,ct.style.color=`var(--text-dim)`,lt.textContent=`Payment: ${A.status===`paid`?`Paid`:`Unpaid`}`,lt.style.color=`var(--text)`,ut.textContent=n?`Generate a link, then wait for the client to pay before submitting.`:`Generate a link, then wait for the client to pay.`);let a=V.querySelector(`#progress-detail`)?.value.trim()||``,o=Y(),s=a.length>0,c=o.length>0;if(R)q.disabled=!0,q.textContent=Ce()?`Resolved`:`Next →`,q.style.opacity=`0.6`,q.style.cursor=`not-allowed`,q.title=`Resolved tasks are read-only.`;else if(!e){let e=H.value===`foc`,t=H.value===`reschedule`,n=V.querySelector(`#foc-bill-no`)?.value.trim()||``,r=V.querySelector(`#reschedule-at`)?.value||``;t?r?(q.disabled=!1,q.textContent=`📅 Save Schedule`,q.style.opacity=`1`,q.style.cursor=`pointer`,q.title=``):(q.disabled=!0,q.textContent=`Pick a date & time`,q.style.opacity=`0.6`,q.style.cursor=`not-allowed`,q.title=`Choose the new visit date & time first.`):s?e&&!n?(q.disabled=!0,q.textContent=`Enter client bill number`,q.style.opacity=`0.6`,q.style.cursor=`not-allowed`,q.title=`FOC requires the client's bill number before you can complete the service.`):e&&z&&!oe?(q.disabled=!0,q.textContent=`Return device first`,q.style.opacity=`0.6`,q.style.cursor=`not-allowed`,q.title=`This ticket has a device in service. Mark the device as returned before closing the service.`):(q.disabled=!1,q.textContent=e?`Complete (FOC)`:`Save Changes`,q.style.opacity=`1`,q.style.cursor=`pointer`,q.title=``):(q.disabled=!0,q.textContent=`Save Changes`,q.style.opacity=`0.6`,q.style.cursor=`not-allowed`,q.title=`Please fill out the Work Details / Progress Update first.`)}else if(Ce())!s||!c?(q.disabled=!0,q.textContent=`Save Changes`,q.style.opacity=`0.6`,q.style.cursor=`not-allowed`,q.title=`Please fill out all mandatory fields in previous tabs (Status and Device Info).`):z&&!oe?(q.disabled=!0,q.textContent=`Return device first`,q.style.opacity=`0.6`,q.style.cursor=`not-allowed`,q.title=`This ticket has a device in service. Mark the device as returned (Device Service tab) before completing the service.`):n&&!r?(q.disabled=!0,q.textContent=`Awaiting Payment...`,q.style.opacity=`0.6`,q.style.cursor=`not-allowed`,q.title=`Payment must be detected automatically, or marked paid by admin, before you can submit a resolution.`):(q.disabled=!1,q.textContent=ft?`💰 Save & Resolve`:`Save Changes`,q.style.opacity=`1`,q.style.cursor=`pointer`,q.title=``);else{let e=Se(),t=!0,n=``;e===`status`?(t=s,n=`Please fill out the Work Details / Progress Update first.`):e===`device`&&(t=c,n=`Please fill out the Company Name first.`),t?(q.disabled=!1,q.textContent=`Next →`,q.style.opacity=`1`,q.style.cursor=`pointer`,q.title=``):(q.disabled=!0,q.textContent=`Next →`,q.style.opacity=`0.6`,q.style.cursor=`not-allowed`,q.title=n)}};if(H.onchange=()=>{let e=H.value===`resolved`;Te.style.display=e?`block`:`none`;let t=V.querySelector(`#bill-locked-hint`);t&&(t.style.display=e?`none`:`block`);let n=V.querySelector(`#foc-billno-group`);n&&(n.style.display=H.value===`foc`?`block`:`none`);let r=V.querySelector(`#reschedule-group`);r&&(r.style.display=H.value===`reschedule`?`block`:`none`);let i=H.value===`case_closed`,a=V.querySelector(`#case-closed-hint`);a&&(a.style.display=i?`block`:`none`);let o=V.querySelector(`#progress-detail-label`);o&&(o.innerHTML=i?`Reason for closing (customer didn't cooperate / no fee) <span style="color:var(--danger)">*</span>`:`Work Details / Progress Update <span style="color:var(--danger)">*</span>`),$()},V.querySelector(`#foc-bill-no`)?.addEventListener(`input`,()=>$()),V.querySelector(`#reschedule-at`)?.addEventListener(`input`,()=>$()),Number(j?.reopened)===1&&H.onchange(),ae&&a){let e=V.querySelector(`#device-service-toggle`),t=V.querySelector(`#device-service-body`),r=V.querySelector(`#device-history`),i=V.querySelector(`#followup-body`),o=V.querySelector(`#followup-disabled-hint`),s=V.querySelector(`#followup-history`),c=ne?.id||null,l=async()=>{let{data:e}=await b(a),t=e?.device_taken_logs||null,n=e?.device_return_logs||null,i=e?.device_follow_up_logs||[];r&&(r.innerHTML=x(a,t,n,i)),s&&(s.innerHTML=S(i)),oe=!z||!!n||e?.inquiry?.follow_up_status===`returned`||e?.inquiry?.device_status===`returned`||i[0]?.status===`returned`,$()};e&&(e.onchange=async()=>{let r=e.checked;try{await E(a,r),z=r,t&&(t.style.display=r?`block`:`none`),i&&(i.style.display=r?`block`:`none`),o&&(o.style.display=r?`none`:`block`),n(r?`Device marked for service center`:`Device service turned off`,`success`),r?l():(oe=!0,$())}catch(t){e.checked=!r,n(t.message||`Could not update`,`error`)}});let u=V.querySelector(`#save-device-taken`);u&&(u.onclick=async()=>{let e=V.querySelector(`#device-taken-image`)?.files?.[0]||null,t=V.querySelector(`#device-taken-desc`)?.value.trim()||``;if(!e)return n(`Please add a photo of the device first`,`warning`);u.disabled=!0,u.textContent=`Saving…`;let{error:r}=await g(a,c,e,t);if(u.disabled=!1,u.textContent=`Save device taken`,r)return n(r.message||`Could not save`,`error`);n(`Device taken saved`,`success`),l()});let d=V.querySelector(`#save-device-followup`);d&&(d.onclick=async()=>{let e=V.querySelector(`#device-followup-status`)?.value,t=V.querySelector(`#device-followup-notes`)?.value.trim()||``;d.disabled=!0,d.textContent=`Saving…`;let{error:r}=await m(a,e,t,c);if(d.disabled=!1,d.textContent=`Add follow-up update`,r)return n(r.message||`Could not save`,`error`);let i=V.querySelector(`#device-followup-notes`);i&&(i.value=``),n(`Follow-up update added`,`success`),l()});let f=V.querySelector(`#save-device-return`);f&&(f.onclick=async()=>{let e=V.querySelector(`#device-return-image`)?.files?.[0]||null,t=V.querySelector(`#device-return-condition`)?.value||`good`,r=V.querySelector(`#device-return-notes`)?.value.trim()||``;if(!e)return n(`Please add a photo of the returned device first`,`warning`);f.disabled=!0,f.textContent=`Saving…`;let{error:i}=await h(a,e,t,r);if(f.disabled=!1,f.textContent=`Mark returned / sent back to client`,i)return n(i.message||`Could not save`,`error`);n(`Device return recorded`,`success`),l()}),z&&l()}Oe.oninput=()=>{Z(),$()},ke&&(ke.oninput=()=>{Z(),$()}),Me&&(Me.oninput=()=>{Z(),$()}),Ne&&(Ne.oninput=()=>{Z(),$()});let pt=(e,t)=>{if(je){if(!e){je.style.display=`none`;return}je.style.display=`block`,je.textContent=e,je.style.color=t===`error`?`var(--danger)`:`var(--primary)`}},mt=e=>{K&&(K.style.display=e?`inline-flex`:`none`),G&&(G.style.display=e?`none`:`inline-flex`),Ae&&(Ae.readOnly=e)},ht=()=>{X.couponDiscount=0,X.couponCode=``,X.couponLabel=``,Ae&&(Ae.value=``),pt(``,`info`),mt(!1),Z(),$()},gt=async({silent:e=!1}={})=>{let t=(Ae?.value||``).trim().toUpperCase();if(!t)return e||n(`Enter a coupon code`,`warning`),!1;Z();let r=X.taxable+X.gst;G&&(G.disabled=!0,G.textContent=`...`);try{let n=localStorage.getItem(`auth_token`)||(await f.auth.getSession()).data.session?.access_token,i=await fetch(`/api/coupons/validate`,{method:`POST`,headers:{"Content-Type":`application/json`,Authorization:`Bearer ${n}`},body:JSON.stringify({code:t,amount:r})}),a=await i.json();return!i.ok||!a.valid?(e||(X.couponDiscount=0,X.couponCode=``,X.couponLabel=``),pt(a.error||`Invalid coupon`,`error`),mt(!1),Z(),$(),!1):(X.couponDiscount=Number(a.discount)||0,X.couponCode=t,X.couponLabel=a.label||`Coupon ${t}`,pt(`Applied: −₹${Math.round(X.couponDiscount).toLocaleString(`en-IN`)} (${X.couponLabel})`,`info`),mt(!0),Z(),$(),!0)}catch{return pt(`Could not validate coupon — check your connection`,`error`),!1}finally{G&&(G.disabled=!1,G.textContent=`Apply`)}};G&&(G.onclick=()=>gt()),K&&(K.onclick=ht),Ae&&Ae.addEventListener(`keydown`,e=>{e.key===`Enter`&&(e.preventDefault(),gt())});let _t=async()=>{if(X.couponCode)try{let e=X.taxable+X.gst,t=localStorage.getItem(`auth_token`)||(await f.auth.getSession()).data.session?.access_token,r=await fetch(`/api/coupons/redeem`,{method:`POST`,headers:{"Content-Type":`application/json`,Authorization:`Bearer ${t}`},body:JSON.stringify({code:X.couponCode,amount:e,inquiry_id:a||null})});if(!r.ok){let e=await r.json().catch(()=>({}));r.status===409&&n(e.error||`Coupon usage limit reached`,`warning`)}}catch{}},vt=async()=>{if(a)try{await f.from(`inquiry_services`).delete().eq(`inquiry_id`,a);let e=B.map(e=>e.id).filter(Boolean);e.length&&await f.from(`inquiry_services`).insert(e.map(e=>({inquiry_id:a,service_id:e})))}catch{}};j?.coupon_code&&Ae&&(async()=>{if(await gt({silent:!0})){let e=Number(j.discount_amount)||0,t=Math.max(0,e-X.couponDiscount);Me&&(Me.value=t||``),Z(),$()}})();let yt=!1,bt=()=>{yt||H.value===`resolved`&&(we(`bill`),$(),setTimeout(()=>{let e=V.querySelector(`#save-update`);e&&!e.disabled&&(yt=!0,e.click())},300))},xt=async e=>{if(!a)return;let t=null;try{let e=localStorage.getItem(`auth_token`)||(await f.auth.getSession()).data.session?.access_token,n=await fetch(`/api/payments/check-status`,{method:`POST`,headers:{"Content-Type":`application/json`,Authorization:`Bearer ${e}`},body:JSON.stringify({inquiry_id:a})});n.ok&&(t=await n.json())}catch{}if(t||=(await f.from(`inquiries`).select(`payment_status,payment_received_at`).eq(`id`,a).single()).data,!t)return;let i=A.status===`paid`;if(A={status:t.payment_status||`unpaid`,received_at:t.payment_received_at||null},!i&&A.status===`paid`){ft=!0,r({title:`💰 Payment Received`,body:`Saving the resolution…`,type:`payment`,tag:`pay-${a}`}),$(),bt();return}else e&&n(A.status===`paid`?`Payment confirmed`:`Still waiting for client to pay...`,A.status===`paid`?`success`:`info`);$()};V.querySelector(`#emp-pay-check`).onclick=()=>xt(!0);let St=null,Ct=()=>{St&&=(clearInterval(St),null)};A.status!==`paid`&&(St||!a||(St=setInterval(async()=>{if(A.status===`paid`)return Ct();await xt(!1)},3e3)));let wt=f.channel(`task-modal-${a||e}`).on(`postgres_changes`,{event:`UPDATE`,schema:`public`,table:`inquiries`,filter:a?`id=eq.${a}`:``},e=>{let t=e.new;if(!t||a&&t.id!==a)return;let n=A.status===`paid`;if(t.payment_status&&(A.status=t.payment_status),t.payment_received_at&&(A.received_at=t.payment_received_at),!n&&A.status===`paid`){ft=!0,r({title:`💰 Payment Received!`,body:`Client just paid — saving the resolution…`,type:`payment`,tag:`pay-${a}`}),$(),bt();return}$()}).subscribe();tt(),Z(),$(),R&&(V.querySelector(`#progress-detail`).disabled=!0,V.querySelectorAll(`
        #pricing-section input:not(#total-bill-display),
        #pricing-section select,
        #pricing-section textarea,
        #svc-add,
        #capture-loc,
        #auto-km,
        .pay-method-btn,
        #mark-cash-btn,
        #emp-gen-link,
        #emp-pay-check
      `).forEach(e=>{e.disabled=!0,e.style.opacity=`0.6`,e.style.cursor=`not-allowed`}),V.querySelectorAll(`.mst-pane[data-pane="device"] input, .mst-pane[data-pane="device"] select`).forEach(e=>{e.disabled=!0,e.style.opacity=`0.6`,e.style.cursor=`not-allowed`}));let Tt=V.querySelector(`#emp-gen-link`),Et=V.querySelector(`#emp-pay-link`),Dt=V.querySelector(`#emp-qr-wrap`),Ot=V.querySelector(`#emp-qr-img`),kt=V.querySelector(`#emp-share-wa`),At=e=>{Re=e,Et.value=e,Ot.src=`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(e)}`,Dt.style.display=`block`,kt.style.display=`flex`};Tt&&(Tt.onclick=async()=>{let e=Number(De.value)||0;if(!e){n(`Select services or enter a bill amount first`,`warning`);return}if(!Ve())return;let{data:t}=await f.from(`inquiries`).select(`full_name,phone,service_item,ticket_no`).eq(`id`,a).single();if(!t){n(`Could not load inquiry details`,`error`);return}Tt.disabled=!0,Tt.textContent=`...`;try{let r=Y();await Ie(r);let i=localStorage.getItem(`auth_token`)||(await f.auth.getSession()).data.session?.access_token,o=await fetch(`/api/payments/create-link`,{method:`POST`,headers:{"Content-Type":`application/json`,Authorization:`Bearer ${i}`},body:JSON.stringify({amount:e,description:`Service: ${t.service_item}`,ticket_no:t.ticket_no,customer:{name:t.full_name,phone:t.phone}})}),s=await o.json();if(!o.ok)throw Error(s.error||`Failed`);At(s.short_url),await _t(),await vt(),await f.from(`inquiries`).update({payment_link:s.short_url,payment_link_id:s.id||null,bill_amount:X.servicesSubtotal+X.extra,extra_cost:X.extra,extra_cost_reason:V.querySelector(`#extra-reason`)?.value.trim()||null,transport_km:X.km,transport_fee:X.transport,platform_fee:X.platform,discount_amount:X.discount,discount_label:X.discountLabel||null,discount_reason:X.manualDiscount>0?X.discountReason:null,discount_preset_id:X.discountPresetId||null,coupon_code:X.couponCode||null,gst_amount:X.gst,bill_total:X.total,bill_generated_at:new Date().toISOString().slice(0,19).replace(`T`,` `),device_type:V.querySelector(`#device-type`)?.value.trim()||null,device_serial_no:V.querySelector(`#device-serial`)?.value.trim()||null,company_name:r||null,employee_bill_lat:Q.lat,employee_bill_lng:Q.lng}).eq(`id`,a),dt=!0,$(),n(`Payment link generated! Waiting for client to pay...`,`success`)}catch(e){n(e.message,`error`)}finally{Tt.disabled=!1,Tt.innerHTML=`${u.link}<span>Generate</span>`}});let jt=V.querySelector(`#open-bill-modal`);jt&&(jt.onclick=async()=>{if(X.total<=0){n(`Add services or charges first to generate a bill`,`warning`);return}if(!Ve())return;let e=jt.innerHTML;jt.disabled=!0,jt.innerHTML=`<span class="btn-spinner"></span><span>Saving PDF...</span>`;try{let e=Y();await Ie(e);let{data:t}=a?await f.from(`inquiries`).select(`*`).eq(`id`,a).single():{data:j},r=Be(t||j||{}),i=await le(r,{inquiryId:a||null});if(Le=i,a){await _t(),await vt();let t={bill_amount:X.servicesSubtotal+X.extra,extra_cost:X.extra,extra_cost_reason:V.querySelector(`#extra-reason`)?.value.trim()||null,transport_km:X.km,transport_fee:X.transport,platform_fee:X.platform,discount_amount:X.discount,discount_label:X.discountLabel||null,discount_reason:X.manualDiscount>0?X.discountReason:null,discount_preset_id:X.discountPresetId||null,coupon_code:X.couponCode||null,gst_amount:X.gst,bill_total:X.total,bill_generated_at:new Date().toISOString().slice(0,19).replace(`T`,` `),bill_pdf_url:i,device_type:r.customer.device_type||null,device_serial_no:r.customer.device_serial||null,company_name:e||null,employee_bill_lat:Q.lat,employee_bill_lng:Q.lng},{error:n}=await f.from(`inquiries`).update(t).eq(`id`,a);if(n)throw Error(n.message);j={...j||{},...t}}ze(),n(`Bill PDF saved. You can download or send it from this tab.`,`success`),de(r,{inquiryId:a||null,existingPdfUrl:i,onSent:async e=>{e&&(Le=e,ze())}})}catch(e){console.error(e),n(e.message||`Could not save bill PDF`,`error`)}finally{jt.disabled=!1,jt.innerHTML=e}});let Mt=V.querySelector(`#bill-details-whatsapp`);Mt&&(Mt.onclick=()=>{let e=Be(j||{}),t=(e.customer?.phone||``).replace(/\D/g,``);if(!t){n(`Client phone number is missing on this inquiry`,`error`);return}let r=`https://wa.me/${t}?text=${encodeURIComponent(ue(e,null))}`;window.open(r,`_blank`)}),ze(),kt&&(kt.onclick=()=>{Re&&window.open(`https://wa.me/?text=${encodeURIComponent(`Please use this link to pay for your service: `+Re)}`,`_blank`)});let Nt=V.querySelector(`#pay-method-toggle`),Pt=V.querySelector(`#cash-section`),Ft=V.querySelector(`#emp-pay-link`)?.closest(`div[style*="background:var(--bg-soft)"]`),It=V.querySelector(`#cash-amount-display`),Lt=V.querySelector(`#cash-collected-banner`),Rt=V.querySelector(`#mark-cash-btn`),zt=j?.payment_method===`cash`?`cash`:`online`,Bt=()=>{Nt.querySelectorAll(`.pay-method-btn`).forEach(e=>{e.classList.toggle(`active`,e.dataset.method===zt)}),Pt.style.display=zt===`cash`?`block`:`none`,Ft&&(Ft.style.display=zt===`cash`?`none`:`block`),It&&(It.textContent=`₹${Math.round(X.total).toLocaleString(`en-IN`)}`),j?.payment_method===`cash`&&j?.payment_status===`paid`&&Lt&&(Lt.style.display=`block`,Rt&&(Rt.disabled=!0,Rt.style.opacity=`0.55`))};Nt.querySelectorAll(`.pay-method-btn`).forEach(e=>{e.onclick=()=>{zt=e.dataset.method,Bt()}}),Bt(),Rt&&(Rt.onclick=async()=>{if(!a){n(`Cannot mark cash on a task without an inquiry record`,`error`);return}if(X.total<=0){n(`Add services or charges first`,`warning`);return}if(!Ve())return;let e=Y();Rt.disabled=!0;let t=Rt.innerHTML;Rt.innerHTML=`<span>Saving...</span>`;try{await Ie(e),await _t(),await vt();let t=new Date().toISOString().slice(0,19).replace(`T`,` `),r={payment_method:`cash`,payment_status:`paid`,payment_received_at:t,cash_collected_at:t,bill_amount:X.servicesSubtotal+X.extra,extra_cost:X.extra,extra_cost_reason:V.querySelector(`#extra-reason`)?.value.trim()||null,transport_km:X.km,transport_fee:X.transport,platform_fee:X.platform,discount_amount:X.discount,discount_label:X.discountLabel||null,discount_reason:X.manualDiscount>0?X.discountReason:null,discount_preset_id:X.discountPresetId||null,coupon_code:X.couponCode||null,gst_amount:X.gst,bill_total:X.total,bill_generated_at:t,device_type:V.querySelector(`#device-type`)?.value.trim()||null,device_serial_no:V.querySelector(`#device-serial`)?.value.trim()||null,company_name:e||null,employee_bill_lat:Q.lat,employee_bill_lng:Q.lng},{error:i}=await f.from(`inquiries`).update(r).eq(`id`,a);if(i)throw Error(i.message);A={status:`paid`,received_at:t},j={...j||{},...r},ft=!0,$(),Bt(),n(`✓ Cash recorded — finalising the ticket…`,`success`),bt()}catch(e){n(e.message||`Could not mark cash`,`error`),Rt.disabled=!1,Rt.innerHTML=t}});let Vt=()=>{Ct();try{f.removeChannel(wt)}catch{}V.remove()},Ht=V.querySelector(`#cm`);Ht&&(Ht.onclick=Vt);let Ut=V.querySelector(`#cm2`);Ut&&(Ut.onclick=Vt),V.addEventListener(`click`,e=>{e.target===V&&Vt()}),V.querySelector(`#save-update`).onclick=async()=>{let t=H.value,r=t===`resolved`;if(r&&!Ce()){we(xe[xe.indexOf(Se())+1]);return}if(R){n(`Resolved tasks are read-only`,`info`);return}let i=V.querySelector(`#progress-detail`).value.trim(),o=Y(),s=t===`foc`,c=V.querySelector(`#foc-bill-no`)?.value.trim()||``,l=t===`reschedule`,u=V.querySelector(`#reschedule-at`)?.value||``,p=l?`in_progress`:t;if(l&&!u){n(`Pick the new visit date & time`,`warning`);return}if(!l&&!i){n(`Please provide details of your work`,`warning`);return}if(s){if(!c){n(`Enter the client's bill number for this FOC service`,`warning`);return}if(z&&!oe){n(`Mark the device as returned before closing this service`,`warning`);return}}if(r){if(!o){n(`Please provide the company name`,`warning`);return}if(!Ve())return}let m=V.querySelector(`#save-update`);m.disabled=!0,m.textContent=`Saving...`;try{r&&o&&await Ie(o)}catch(e){console.error(`Failed to ensure company:`,e)}let h=[];r&&B.forEach(e=>{h.push(e.id)});let{data:{user:g}}=await f.auth.getUser(),_=[];e&&_.push(f.from(`tickets`).update({status:p}).eq(`id`,e));let v={status:p,employee_update_detail:i,employee_update_status:t,employee_update_at:new Date().toISOString().slice(0,19).replace(`T`,` `)},y=V.querySelector(`#device-type`)?.value.trim(),b=V.querySelector(`#device-serial`)?.value.trim();o&&(v.company_name=o),y&&(v.device_type=y),b&&(v.device_serial_no=b),l&&(v.scheduled_at=u?new Date(u).toISOString().slice(0,19).replace(`T`,` `):null),s&&(v.bill_no=c,v.bill_total=0,v.bill_amount=0,v.payment_status=`foc`),r&&X.total>0&&(v.bill_amount=X.servicesSubtotal+X.extra,v.extra_cost=X.extra,v.extra_cost_reason=V.querySelector(`#extra-reason`).value.trim()||null,v.transport_km=X.km,v.transport_fee=X.transport,v.platform_fee=X.platform,v.discount_amount=X.discount,v.discount_label=X.discountLabel||null,v.discount_reason=X.manualDiscount>0?X.discountReason:null,v.discount_preset_id=X.discountPresetId||null,v.coupon_code=X.couponCode||null,v.gst_amount=X.gst,v.bill_total=X.total,v.employee_bill_lat=Q.lat,v.employee_bill_lng=Q.lng),r&&X.total>0&&await _t(),a?_.push(f.from(`inquiries`).update(v).eq(`id`,a)):e&&_.push(f.from(`inquiries`).update(v).eq(`ticket_id`,e)),a&&(await f.from(`inquiry_services`).delete().eq(`inquiry_id`,a),h.length>0&&_.push(f.from(`inquiry_services`).insert(h.map(e=>({inquiry_id:a,service_id:e}))))),e&&_.push(f.from(`ticket_comments`).insert({ticket_id:e,user_id:g.id,content:`[Status: ${t.replace(`_`,` `)}] ${i}${r&&X.total>0?` (Bill: ₹${X.total})`:``}`})),await Promise.all(_);try{sessionStorage.removeItem(ve)}catch{}n(`Task updated!`,`success`),t===`resolved`&&n(`Secure feedback link will be sent after payment is received`,`info`),Vt(),d()}})()}function Ie(e,t){let r=document.createElement(`div`);r.className=`modal-overlay`,r.innerHTML=`
    <div class="modal" style="max-width:450px">
      <div class="modal-header">
        <span class="modal-title">Submit Leave Request</span>
        <button class="modal-close" id="cl">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
          <div class="form-group"><label>Start Date</label><input type="date" id="l-start" required/></div>
          <div class="form-group"><label>End Date</label><input type="date" id="l-end" required/></div>
        </div>
        <div class="form-group">
          <label>Reason for Leave</label>
          <textarea id="l-reason" rows="4" placeholder="Explain your reason..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cl2">Cancel</button>
        <button class="btn btn-primary" id="btn-submit-leave">Submit Request</button>
      </div>
    </div>`,document.body.appendChild(r),r.querySelector(`#cl`).onclick=r.querySelector(`#cl2`).onclick=()=>r.remove(),r.querySelector(`#btn-submit-leave`).onclick=async()=>{let i=r.querySelector(`#l-start`).value,a=r.querySelector(`#l-end`).value,o=r.querySelector(`#l-reason`).value.trim();if(!i||!a||!o){n(`Please fill in all fields`,`warning`);return}let s=r.querySelector(`#btn-submit-leave`);s.disabled=!0,s.textContent=`Submitting...`;let{error:c}=await f.from(`leave_requests`).insert({employee_id:e,start_date:i,end_date:a,reason:o,status:`pending`});c?(n(c.message,`error`),s.disabled=!1,s.textContent=`Submit Request`):(n(`Leave request submitted!`,`success`),r.remove(),t())}}async function X(t){a(t);try{let{data:r,error:i}=await f.from(`service_pricing`).select(`*`).order(`category`);if(i)throw i;let a=r||[],o=[...new Set(a.map(e=>e.category||`Service`))].sort(),s=[...new Set(a.map(e=>e.sub_category||``).filter(Boolean))].sort(),c=e=>e.length===0?`<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No services match this filter</td></tr>`:e.map(e=>`
          <tr data-main="${W(e.category||`Service`)}" data-sub="${W(e.sub_category||``)}" data-search="${W(`${e.category||``} ${e.sub_category||``} ${e.sub_sub_category||``} ${e.name||``}`.toLowerCase())}">
            <td><input type="checkbox" class="service-checkbox" data-id="${e.id}"></td>
            <td><span class="badge badge-open">${U(e.category||`Service`)}</span></td>
            <td>${e.sub_category?U(e.sub_category):`<span style="color:var(--text-dim)">-</span>`}</td>
            <td><b>${U(e.sub_sub_category||e.name||``)}</b></td>
            <td>${H(e.cost)}</td>
            <td style="display:flex;gap:6px;"><button class="btn btn-secondary btn-sm edit-price" data-id="${e.id}" title="Edit">${u.edit||`Edit`}</button><button class="btn btn-danger btn-sm del-price" data-id="${e.id}" title="Delete">${u.close}</button></td>
          </tr>
        `).join(``);t.innerHTML=`
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
        <div style="flex:1;min-width:250px;">
          <h1 style="display:flex;align-items:center;gap:12px;margin:0 0 8px;">
            <span style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;color:var(--primary);font-size:1.4rem;flex-shrink:0;">${u.receipt||``}</span>
            <span>Service Pricing</span>
          </h1>
          <p style="margin:0;font-size:0.95rem;">Manage and filter service rates</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
          <button class="btn btn-secondary" id="dl-template" style="white-space:nowrap;">${u.download||``}<span>Template</span></button>
          <button class="btn btn-secondary" id="upload-price" style="white-space:nowrap;">${u.upload||``}<span>Upload</span></button>
          <button class="btn btn-primary" id="add-price" style="white-space:nowrap;">${u.plus}<span>Add</span></button>
          <input type="file" id="upload-price-file" accept=".xlsx,.xls,.csv" style="display:none">
          <button class="btn btn-primary" id="emp-pricing-export" style="white-space:nowrap;">${u.download||``}<span>Export</span></button>
        </div>
      </div>

      <div class="card" style="margin-bottom:12px;padding:12px 16px;font-size:13px;color:var(--text-dim);">
        Excel/CSV columns: <b>Main Category</b>, <b>Sub Category</b>, <b>Sub-Sub Category</b>, <b>Price</b>. Sub Category is optional - a 3-column file is also accepted.
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div class="card-body" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;align-items:end;">
          <div class="form-group" style="margin:0;">
            <label>Main Category</label>
            <select id="emp-price-main">
              <option value="all">All categories</option>
              ${o.map(e=>`<option value="${W(e)}">${U(e)}</option>`).join(``)}
            </select>
          </div>
          <div class="form-group" style="margin:0;">
            <label>Sub Category</label>
            <select id="emp-price-sub">
              <option value="all">All sub categories</option>
              ${s.map(e=>`<option value="${W(e)}">${U(e)}</option>`).join(``)}
            </select>
          </div>
          <div class="form-group" style="margin:0;">
            <label>Search</label>
            <input id="emp-price-search" type="search" placeholder="Search service or issue"/>
          </div>
          <button class="btn btn-secondary" id="emp-price-reset">${u.refresh||``}<span>Reset</span></button>
        </div>
      </div>

      <div class="card">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;" id="bulk-actions">
          <button class="btn btn-danger btn-sm" id="del-selected" style="display:none;">Delete Selected</button>
          <button class="btn btn-warning btn-sm" id="remove-dupes">Remove Duplicates</button>
        </div>
        <div class="card-header">
          <span class="card-title">Services</span>
          <span id="emp-price-count" style="font-size:0.82rem;color:var(--text-dim);font-weight:700;">${a.length} item${a.length===1?``:`s`}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th style="width:30px;"><input type="checkbox" id="select-all" title="Select all"></th><th>Main Category</th><th>Sub Category</th><th>Service / Issue</th><th>Price</th><th>Actions</th></tr>
            </thead>
            <tbody id="emp-price-body">${c(a)}</tbody>
          </table>
        </div>
      </div>
    `;let l=t.querySelector(`#emp-price-main`),d=t.querySelector(`#emp-price-sub`),p=t.querySelector(`#emp-price-search`),m=t.querySelector(`#emp-price-body`),h=t.querySelector(`#emp-price-count`),g=t.querySelector(`#select-all`),_=t.querySelector(`#del-selected`),v=[...a],y=()=>{let e=l.value;d.innerHTML=`<option value="all">All sub categories</option>`+(e===`all`?s:[...new Set(a.filter(t=>t.category===e).map(e=>e.sub_category||``).filter(Boolean))].sort()).map(e=>`<option value="${e}">${e}</option>`).join(``),d.value=`all`,b()},b=()=>{let e=l.value,t=d.value,n=p.value.trim().toLowerCase();v=a.filter(r=>{let i=r.category||`Service`,a=r.sub_category||``,o=`${r.category||``} ${r.sub_category||``} ${r.sub_sub_category||``} ${r.name||``}`.toLowerCase();return(e===`all`||i===e)&&(t===`all`||a===t)&&(!n||o.includes(n))}),m.innerHTML=c(v),h.textContent=`${v.length} item${v.length===1?``:`s`}`,S(),x()},x=()=>{let e=t.querySelectorAll(`.service-checkbox:checked`).length;_.style.display=e>0?``:`none`},S=()=>{t.querySelectorAll(`.service-checkbox`).forEach(e=>{e.onchange=x}),t.querySelectorAll(`.edit-price`).forEach(e=>{e.onclick=async()=>{let r=a.find(t=>t.id===e.dataset.id);if(!r)return;let i=prompt(`Main Category:`,r.category||`Service`);if(i===null)return;let o=prompt(`Sub Category:`,r.sub_category||``);if(o===null)return;let s=prompt(`Sub-Sub Category:`,r.sub_sub_category||r.name||``);if(!s)return;let c=prompt(`Price (₹):`,String(r.cost||0)),l=parseFloat(c);if(!Number.isFinite(l)||l<0){n(`Invalid price`,`error`);return}let{error:u}=await f.from(`service_pricing`).update({category:i||`Uncategorized`,sub_category:o.trim()||null,sub_sub_category:s,name:s,cost:l}).eq(`id`,r.id);u?n(u.message,`error`):(n(`Service updated`,`success`),X(t))}}),t.querySelectorAll(`.del-price`).forEach(e=>{e.onclick=async()=>{if(!confirm(`Delete this service?`))return;let{error:r}=await f.from(`service_pricing`).delete().eq(`id`,e.dataset.id);r?n(r.message,`error`):(n(`Service deleted`,`success`),X(t))}})};l.onchange=y,d.onchange=b,p.oninput=b,g.onchange=()=>{t.querySelectorAll(`.service-checkbox`).forEach(e=>e.checked=g.checked),x()},t.querySelector(`#emp-price-reset`).onclick=()=>{l.value=`all`,d.value=`all`,p.value=``,b()},_.onclick=async()=>{let e=Array.from(t.querySelectorAll(`.service-checkbox:checked`)).map(e=>e.dataset.id);if(!e.length||!confirm(`Delete ${e.length} service${e.length===1?``:`s`}?`))return;let r=0;for(let t of e){let{error:e}=await f.from(`service_pricing`).delete().eq(`id`,t);e||r++}n(`Deleted ${r} service${r===1?``:`s`}`,`success`),X(t)},t.querySelector(`#remove-dupes`).onclick=async()=>{let e=new Map,r=[];if(a.forEach(t=>{let n=`${t.category}||${t.sub_category}||${t.sub_sub_category}`;e.has(n)?r.push(t.id):e.set(n,t.id)}),!r.length){n(`No duplicates found`,`info`);return}if(!confirm(`Found ${r.length} duplicate service${r.length===1?``:`s`}. Delete them?`))return;let i=0;for(let e of r){let{error:t}=await f.from(`service_pricing`).delete().eq(`id`,e);t||i++}n(`Removed ${i} duplicate${i===1?``:`s`}`,`success`),X(t)};let C=!1;t.querySelector(`#add-price`).onclick=()=>{if(C)return;let e=prompt(`Enter Main Category:`);if(e===null)return;let r=prompt(`Enter Sub Category (optional):`);if(r===null)return;let i=prompt(`Enter Sub-Sub Category (specific issue):`);if(!i)return;let a=prompt(`Enter Price (₹):`),o=parseFloat(a);if(!Number.isFinite(o)||o<0){n(`Invalid price`,`error`);return}C=!0,(async()=>{try{let{error:a}=await f.from(`service_pricing`).insert({id:crypto.randomUUID?.()||`svc-${Date.now()}`,category:e||`Uncategorized`,sub_category:r.trim()||null,sub_sub_category:i,name:i,cost:o});a?.status===429?n(`Server is busy - please try again in a few seconds`,`error`):a?n(a.message||`Failed to add service`,`error`):(n(`Service added`,`success`),X(t))}finally{C=!1}})()};let w=t.querySelector(`#upload-price-file`),T=!1;t.querySelector(`#upload-price`).onclick=()=>{if(T){n(`Upload in progress...`,`info`);return}w.click()},w.onchange=async()=>{let e=w.files?.[0];if(e){if(T){n(`Upload already in progress`,`warning`);return}T=!0,w.value=``,n(`Reading ${e.name}...`,`info`);try{let r=await ke(e);if(!r.length){n(`File is empty`,`warning`);return}let{inserted:i,skipped:a}=await Ae(r);i?n(`Imported ${i} service${i===1?``:`s`}${a?` (${a} skipped)`:``}`,`success`):n(`No rows imported${a?` - ${a} skipped`:``}`,`warning`),X(t)}catch(e){console.error(`[pricing import] failed`,e),n(e.message||`Failed to read file`,`error`)}finally{T=!1}}},t.querySelector(`#dl-template`).onclick=G,t.querySelector(`#emp-pricing-export`).onclick=()=>{if(!v.length){n(`No services to export`,`warning`);return}e(`service-pricing-${l.value===`all`?`all-main-categories`:l.value.toLowerCase().replace(/[^a-z0-9]+/g,`-`).replace(/^-+|-+$/g,``)}.csv`,v.map(e=>({main_category:e.category||`Service`,sub_category:e.sub_category||``,service:e.sub_sub_category||e.name||``,price:Number(e.cost)||0})))},S(),x()}catch(e){console.error(`[employee pricing] initialization failed:`,e),t.innerHTML=`
      <div class="card" style="padding:32px;text-align:center;">
        <p style="color:var(--danger);margin:0;font-weight:600;">Could not load service pricing</p>
        <small style="color:var(--text-dim);">${U(e?.message||`An unexpected error occurred`)}</small>
      </div>
    `}}export{de as openPremiumBillModal,je as renderEmployeeAttendanceRecords,Pe as renderEmployeeCash,K as renderEmployeeDashboard,Ne as renderEmployeeEODReports,J as renderEmployeeEstimatorTab,M as renderEmployeeFollowUp,q as renderEmployeeLeaderboard,Me as renderEmployeeLeaveRequests,X as renderEmployeePricingTab,Y as renderEmployeeTasks,le as shareBillToPublicLink};