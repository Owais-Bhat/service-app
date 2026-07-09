import{g as e,o as t,s as n,t as r}from"./icons-j8TZxXx3.js";import"./index-CuPRPj-i.js";import{i,n as a,t as o}from"./device-tracking-DDQQfS3_.js";async function s(t){t.innerHTML=`
    <div class="page-header">
      <div>
        <h1 style="display:flex;align-items:center;gap:10px;">
          <span style="width:26px;height:26px;display:inline-flex;flex-shrink:0;color:var(--primary);">${r.wrench}</span>
          <span>Device Tracking</span>
        </h1>
        <p>Devices taken for service and their follow-up / return status.</p>
      </div>
    </div>

    <div style="margin-bottom: 20px; display: flex; gap: 12px;">
      <input type="text" id="dt-search" placeholder="Search by ticket, phone, or customer..."
             style="flex: 1; padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px;">
      <select id="dt-device-status" style="padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px;">
        <option value="">All Device Status</option>
        <option value="taken">📸 Device Taken</option>
        <option value="returned">✅ Device Returned</option>
      </select>
      <select id="dt-followup-status" style="padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px;">
        <option value="">All Follow-up Status</option>
        <option value="awaiting_parts">Awaiting Parts</option>
        <option value="repair_progress">Repair in Progress</option>
        <option value="ready_return">Ready to Return</option>
        <option value="returned">Device Returned</option>
      </select>
    </div>

    <div id="dt-loading" style="text-align: center; padding: 40px;">
      <div style="font-size: 24px; margin-bottom: 10px;">⏳</div>
      <p>Loading device tracking data...</p>
    </div>

    <div id="dt-content" style="display: none;"></div>
  `;let n=t.querySelector(`#dt-loading`),i=t.querySelector(`#dt-content`),a=t.querySelector(`#dt-search`),l=t.querySelector(`#dt-device-status`),u=t.querySelector(`#dt-followup-status`),d=[],{data:f,error:p}=await o();if(p){e(`Failed to load device tracking data`,`error`),n.innerHTML=`<p style="color: var(--danger);">Failed to load data</p>`;return}let m=()=>s(t);d=f,n.style.display=`none`,i.style.display=`block`,c(i,d,m);let h=()=>{let e=a.value.toLowerCase(),t=l.value,n=u.value;c(i,d.filter(r=>{let i=!e||r.ticket_no?.toLowerCase().includes(e)||r.phone?.includes(e)||r.full_name?.toLowerCase().includes(e),a=!t||r.device_status===t,o=!n||r.follow_up_status===n;return i&&a&&o}),m)};a.addEventListener(`input`,h),l.addEventListener(`change`,h),u.addEventListener(`change`,h)}function c(e,n,r){if(n.length===0){e.innerHTML=`
      <div style="text-align: center; padding: 60px 20px; background: var(--bg-soft); border-radius: 12px;">
        <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
        <h3>No device tracking data found</h3>
        <p style="color: var(--text-soft);">Devices taken for service will appear here</p>
      </div>
    `;return}e.innerHTML=`
    <div class="card">
      <div class="card-header">
        <span class="card-title">Devices Taken for Service</span>
        <span class="badge" style="background: var(--bg-soft);">${n.length}</span>
      </div>
      <div class="card-body" style="padding: 0; overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: var(--bg-soft); border-bottom: 2px solid var(--border);">
              <th style="padding: 12px 16px; text-align: left; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-dim);">Ticket</th>
              <th style="padding: 12px 16px; text-align: left; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-dim);">Customer</th>
              <th style="padding: 12px 16px; text-align: left; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-dim);">Service</th>
              <th style="padding: 12px 16px; text-align: left; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-dim);">Device Status</th>
              <th style="padding: 12px 16px; text-align: left; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-dim);">Follow-up</th>
              <th style="padding: 12px 16px; text-align: left; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-dim);">Taken By</th>
              <th style="padding: 12px 16px; text-align: right; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-dim);"></th>
            </tr>
          </thead>
          <tbody>
            ${n.map(e=>`
              <tr style="border-bottom: 1px solid var(--border);" data-id="${e.id}">
                <td style="padding: 14px 16px;"><strong style="color: var(--primary);">${e.ticket_no||`—`}</strong></td>
                <td style="padding: 14px 16px;">
                  <div style="font-weight: 600;">${e.full_name||`Client`}</div>
                  <small style="color: var(--text-dim);">${e.phone||``}</small>
                </td>
                <td style="padding: 14px 16px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${e.service_item||`—`}</td>
                <td style="padding: 14px 16px;">${l(e.device_status)}</td>
                <td style="padding: 14px 16px;">${u(e.follow_up_status)}</td>
                <td style="padding: 14px 16px;">
                  ${e.device_taken_logs&&e.device_taken_logs.length>0?`<small>${e.device_taken_logs[0].profiles?.full_name||`—`}</small><br><small style="color: var(--text-dim);">${t(e.device_taken_logs[0].taken_at)}</small>`:`<small style="color: var(--text-dim);">—</small>`}
                </td>
                <td style="padding: 14px 16px; text-align: right;">
                  <button class="btn btn-secondary btn-sm view-details" data-id="${e.id}" style="cursor: pointer;">View / Follow-up</button>
                </td>
              </tr>
            `).join(``)}
          </tbody>
        </table>
      </div>
    </div>
  `,e.querySelectorAll(`.view-details`).forEach(e=>{e.addEventListener(`click`,t=>{let i=e.getAttribute(`data-id`),a=n.find(e=>e.id===i);a&&d(a,r)})})}function l(e){return{taken:`<span style="background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">📸 Taken</span>`,returned:`<span style="background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">✅ Returned</span>`,in_service:`<span style="background: #dbeafe; color: #0c4a6e; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">🔧 In Service</span>`,pending:`<span style="background: #f3f4f6; color: #6b7280; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">⏳ Pending</span>`}[e]||`<span style="padding: 4px 8px; border-radius: 4px; font-size: 0.75rem;">—</span>`}function u(e){return{none:`<span style="padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; color: var(--text-dim);">—</span>`,awaiting_parts:`<span style="background: #fecaca; color: #7f1d1d; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">⏳ Awaiting Parts</span>`,repair_progress:`<span style="background: #dbeafe; color: #0c4a6e; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">🔧 In Progress</span>`,ready_return:`<span style="background: #bfdbfe; color: #1e3a8a; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">📦 Ready</span>`,returned:`<span style="background: #86efac; color: #15803d; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">✅ Returned</span>`}[e]||`<span style="padding: 4px 8px; border-radius: 4px; font-size: 0.75rem;">—</span>`}function d(t,o){let s=document.createElement(`div`);s.className=`modal-overlay`,s.innerHTML=`
    <div class="modal" style="max-width: 700px;">
      <div class="modal-header">
        <span class="modal-title"><span style="width:20px;height:20px;display:inline-flex;vertical-align:middle;">${r.wrench}</span><span style="margin-left: 8px;">Device Tracking Details</span></span>
        <button class="modal-close" id="close-modal" style="background: none; border: none; font-size: 24px; cursor: pointer;">✕</button>
      </div>
      <div class="modal-body">
        <div style="background: var(--bg-soft); padding: 16px; border-radius: 12px; margin-bottom: 16px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <div style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-dim); font-weight: 800; margin-bottom: 4px;">Ticket</div>
              <div style="font-weight: 700;">${t.ticket_no}</div>
            </div>
            <div>
              <div style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-dim); font-weight: 800; margin-bottom: 4px;">Customer</div>
              <div style="font-weight: 700;">${t.full_name}</div>
            </div>
          </div>
          <div>
            <div style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-dim); font-weight: 800; margin-bottom: 4px;">Service Item</div>
            <div>${t.service_item||`—`}</div>
          </div>
        </div>

        <div style="background: rgba(16,185,129,0.06); padding: 16px; border-radius: 12px; border: 1px solid var(--primary); margin-bottom: 16px;">
          <h4 style="margin: 0 0 12px 0;">📋 Follow-up &amp; Update</h4>

          <div style="margin-bottom: 12px;">
            <div style="font-weight: 600; margin-bottom: 8px; font-size: 0.9rem;">Add follow-up update</div>
            <select id="admin-followup-status" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px;">
              <option value="awaiting_parts">⏳ Awaiting Parts</option>
              <option value="repair_progress">🔧 Repair in Progress</option>
              <option value="ready_return">📦 Ready to Return</option>
              <option value="returned">✅ Returned to Client</option>
            </select>
            <textarea id="admin-followup-notes" rows="2" placeholder="Update notes..." style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px;"></textarea>
            <button class="btn btn-primary btn-sm" id="admin-save-followup">Add update</button>
          </div>

          <div style="padding-top: 12px; border-top: 1px solid rgba(16,185,129,0.2);">
            <div style="font-weight: 600; margin-bottom: 8px; font-size: 0.9rem;">Mark returned / sent back to client</div>
            <input type="file" id="admin-return-image" accept="image/*" style="margin-bottom: 8px; display: block;">
            <select id="admin-return-condition" style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px;">
              <option value="repaired">Repaired</option>
              <option value="good">Good</option>
              <option value="damaged">Damaged</option>
              <option value="lost">Lost</option>
            </select>
            <input type="text" id="admin-return-notes" placeholder="Return notes..." style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px;">
            <button class="btn btn-secondary btn-sm" id="admin-save-return">Mark returned</button>
          </div>
        </div>

        ${t.device_taken_logs&&t.device_taken_logs.length>0?`
          <div style="background: rgba(250, 204, 21, 0.05); padding: 16px; border-radius: 12px; border: 1px solid rgba(250, 204, 21, 0.2); margin-bottom: 16px;">
            <h4 style="margin: 0 0 12px 0;">📸 Device Taken</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
              <div>
                <small style="color: var(--text-dim); font-weight: 600;">Taken By</small>
                <div style="margin-top: 4px;">${t.device_taken_logs[0].profiles?.full_name||`Unknown`}</div>
              </div>
              <div>
                <small style="color: var(--text-dim); font-weight: 600;">Taken On</small>
                <div style="margin-top: 4px;">${n(t.device_taken_logs[0].taken_at)}</div>
              </div>
            </div>
            ${t.device_taken_logs[0].device_image_url?`
              <div style="margin-bottom: 12px;">
                <small style="color: var(--text-dim); font-weight: 600;">Device Image</small>
                <img src="${t.device_taken_logs[0].device_image_url}" alt="Device" style="width: 100%; max-height: 300px; border-radius: 8px; margin-top: 8px; object-fit: cover;">
              </div>
            `:``}
            ${t.device_taken_logs[0].device_description?`
              <div>
                <small style="color: var(--text-dim); font-weight: 600;">Description</small>
                <div style="margin-top: 4px; padding: 8px; background: white; border-radius: 6px; font-size: 0.9rem;">${t.device_taken_logs[0].device_description}</div>
              </div>
            `:``}
          </div>
        `:``}

        ${t.device_return_logs&&t.device_return_logs.length>0?`
          <div style="background: rgba(34, 197, 94, 0.05); padding: 16px; border-radius: 12px; border: 1px solid rgba(34, 197, 94, 0.2); margin-bottom: 16px;">
            <h4 style="margin: 0 0 12px 0;">✅ Device Returned</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
              <div>
                <small style="color: var(--text-dim); font-weight: 600;">Condition</small>
                <div style="margin-top: 4px; padding: 4px 8px; background: #dcfce7; color: #15803d; border-radius: 4px; display: inline-block; font-weight: 600;">${t.device_return_logs[0].device_condition?.toUpperCase()||`GOOD`}</div>
              </div>
              <div>
                <small style="color: var(--text-dim); font-weight: 600;">Returned On</small>
                <div style="margin-top: 4px;">${n(t.device_return_logs[0].returned_at)}</div>
              </div>
            </div>
            ${t.device_return_logs[0].return_image_url?`
              <div style="margin-bottom: 12px;">
                <small style="color: var(--text-dim); font-weight: 600;">Return Image</small>
                <img src="${t.device_return_logs[0].return_image_url}" alt="Return" style="width: 100%; max-height: 300px; border-radius: 8px; margin-top: 8px; object-fit: cover;">
              </div>
            `:``}
            ${t.device_return_logs[0].return_notes?`
              <div>
                <small style="color: var(--text-dim); font-weight: 600;">Notes</small>
                <div style="margin-top: 4px; padding: 8px; background: white; border-radius: 6px; font-size: 0.9rem;">${t.device_return_logs[0].return_notes}</div>
              </div>
            `:``}
          </div>
        `:``}

        ${t.device_follow_up_logs&&t.device_follow_up_logs.length>0?`
          <div style="margin-top: 16px;">
            <h4 style="margin: 0 0 12px 0;">📋 Follow-up Updates</h4>
            ${t.device_follow_up_logs.map(e=>`
              <div style="background: #f5f5f5; padding: 12px; border-radius: 8px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                  <strong style="color: var(--primary);">${e.status?.replace(/_/g,` `).toUpperCase()}</strong>
                  <small style="color: var(--text-dim);">${n(e.created_at)}</small>
                </div>
                ${e.notes?`<div style="font-size: 0.9rem;">${e.notes}</div>`:``}
                ${e.profiles?.full_name?`<small style="color: var(--text-dim); margin-top: 4px; display: block;">Updated by: ${e.profiles.full_name}</small>`:``}
              </div>
            `).join(``)}
          </div>
        `:``}

      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="close-modal-btn">Close</button>
      </div>
    </div>
  `,document.body.appendChild(s),s.querySelector(`#close-modal`).onclick=s.querySelector(`#close-modal-btn`).onclick=()=>s.remove();let c=s.querySelector(`#admin-save-followup`);c&&(c.onclick=async()=>{let n=s.querySelector(`#admin-followup-status`).value,r=s.querySelector(`#admin-followup-notes`).value.trim();c.disabled=!0,c.textContent=`Saving…`;let{error:a}=await i(t.id,n,r);if(a)return c.disabled=!1,c.textContent=`Add update`,e(a.message||`Could not save`,`error`);e(`Follow-up update added`,`success`),s.remove(),o?.()});let l=s.querySelector(`#admin-save-return`);l&&(l.onclick=async()=>{let n=s.querySelector(`#admin-return-image`).files?.[0]||null,r=s.querySelector(`#admin-return-condition`).value,i=s.querySelector(`#admin-return-notes`).value.trim();l.disabled=!0,l.textContent=`Saving…`;let{error:c}=await a(t.id,n,r,i);if(c)return l.disabled=!1,l.textContent=`Mark returned`,e(c.message||`Could not save`,`error`);e(`Device return recorded`,`success`),s.remove(),o?.()})}export{s as renderDeviceTrackingTab};