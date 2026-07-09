import{g as e,m as t,t as n}from"./icons-j8TZxXx3.js";import{r}from"./index-CuPRPj-i.js";function i(e){return String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#039;`)}function a(e){return i(e)}function o(e){return`₹${Math.round(Number(e)||0).toString().replace(/\B(?=(\d{3})+(?!\d))/g,`,`)}`}function s(e){let t=a(e.url||``);return t?e.kind===`video`?`<video src="${t}" controls playsinline style="width:100%;max-height:260px;border-radius:8px;background:#000;"></video>`:`<img src="${t}" alt="${a(e.caption||e.title||`Media`)}" style="width:100%;max-height:260px;object-fit:cover;border-radius:8px;display:block;"/>`:``}async function c(e){if(!e)throw Error(`Choose an image or video file first.`);let t=new FormData;t.append(`file`,e);let n=localStorage.getItem(`auth_token`),r=window.location.hostname!==`localhost`&&window.location.hostname!==`127.0.0.1`?`/api`:`http://localhost:5000/api`,i=await fetch(`${r}/upload`,{method:`POST`,headers:n?{Authorization:`Bearer ${n}`}:{},body:t}),a=await i.json().catch(()=>({}));if(!i.ok)throw Error(a.error||`Upload failed`);return a.url}function l(e){return String(e?.type||``).startsWith(`video/`)?`video`:`image`}function u(e){let t=window.matchMedia(`(max-width: 767px)`).matches;return e===`mobile`?t:e===`desktop`?!t:!0}function d(e,t){if(!e?.url||sessionStorage.getItem(t)===`1`)return;sessionStorage.setItem(t,`1`);let r=(e.kind||`image`).toLowerCase()===`video`,o=a(e.url||``),s=document.createElement(`div`);s.className=`media-popup-overlay`,s.innerHTML=`
    <div class="media-popup-dialog" role="dialog" aria-modal="true">
      <button type="button" class="media-popup-close" aria-label="Close">${n.close}</button>
      <div class="media-popup-frame">
        ${r?`<video src="${o}" controls autoplay muted playsinline></video>`:`<img src="${o}" alt="${a(e.caption||`Popup ad`)}"/>`}
      </div>
      ${e.caption?`<div class="media-popup-caption">${i(e.caption)}</div>`:``}
    </div>
  `,document.body.appendChild(s);let c=()=>s.remove();s.querySelector(`.media-popup-close`).onclick=c,s.addEventListener(`click`,e=>{e.target===s&&c()})}async function f(){try{let{data:e}=await r.from(`ads`).select(`*`).eq(`placement`,`popup_employee`).eq(`active`,1).order(`position`,{ascending:!0}),t=Date.now(),n=(e||[]).find(e=>!(!u(e.device_target||`both`)||e.starts_at&&new Date(e.starts_at).getTime()>t||e.expires_at&&new Date(e.expires_at).getTime()<=t));n&&d(n,`employee-popup-${n.id}`)}catch(e){console.warn(`[popup ads] employee load failed`,e)}}function p(t,n){let a=!!t,o=document.createElement(`div`);o.className=`modal-overlay`,o.innerHTML=`
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <span class="modal-title">${a?`Edit popup`:`Add popup`}</span>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Media type</label>
        <div style="display:flex;gap:8px;margin-bottom:14px;">
          <label style="flex:1;padding:10px;border:2px solid var(--border);border-radius:10px;cursor:pointer;text-align:center;font-weight:700;">
            <input type="radio" name="popup-kind" value="image" ${!t||t.kind===`image`?`checked`:``} style="margin-right:6px"/> Image
          </label>
          <label style="flex:1;padding:10px;border:2px solid var(--border);border-radius:10px;cursor:pointer;text-align:center;font-weight:700;">
            <input type="radio" name="popup-kind" value="video" ${t?.kind===`video`?`checked`:``} style="margin-right:6px"/> Video
          </label>
        </div>
        <div style="margin-bottom:14px;">
          <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Media source</label>
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <label style="font-size:0.85rem;cursor:pointer;"><input type="radio" name="popup-media-source" value="upload" checked> Upload file</label>
            <label style="font-size:0.85rem;cursor:pointer;"><input type="radio" name="popup-media-source" value="url"> Enter URL</label>
          </div>
          <div id="popup-media-upload-div">
            <input type="file" id="popup-file" accept="image/*,video/*" style="width:100%;padding:8px;border-radius:10px;border:1px dashed var(--border);background:var(--bg);font-size:0.9rem;" />
          </div>
          <div id="popup-media-url-div" style="display:none;">
            <input id="popup-url" type="url" placeholder="https://…/image.jpg or https://…/video.mp4"
                   value="${i(t?.url||``)}"
                   style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/>
          </div>
          ${t?.url?`<div style="font-size:0.8rem;color:var(--text-dim);margin-top:6px;overflow:hidden;text-overflow:ellipsis;">Current: <a href="${i(t.url)}" target="_blank" style="color:var(--primary)">${i(t.url)}</a></div>`:``}
        </div>
        <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Popup target ${a?``:`(required)`}</label>
        <select id="popup-placement" ${a?`disabled`:``} style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;margin-bottom:14px;">
          <option value="popup_landing" ${t?.placement===`popup_landing`?`selected`:``}>Landing page popup</option>
          <option value="popup_employee" ${t?.placement===`popup_employee`?`selected`:``}>Employee portal popup</option>
        </select>
        <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Device target</label>
        <select id="popup-device-target" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;margin-bottom:14px;">
          <option value="both" ${!t?.device_target||t.device_target===`both`?`selected`:``}>Both mobile and desktop</option>
          <option value="desktop" ${t?.device_target===`desktop`?`selected`:``}>Desktop only</option>
          <option value="mobile" ${t?.device_target===`mobile`?`selected`:``}>Mobile only</option>
        </select>
        <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Caption (optional)</label>
        <input id="popup-caption" type="text" maxlength="255" placeholder="Title or description"
               value="${i(t?.caption||``)}"
               style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;margin-bottom:14px;"/>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
          <div>
            <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Duration (seconds)</label>
            <input id="popup-duration" type="number" min="2" max="60" step="0.5"
                   value="${t?(Number(t.duration_ms)||6e3)/1e3:6}"
                   style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/>
          </div>
          <div>
            <label style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;">Position</label>
            <input id="popup-position" type="number" min="0" step="1"
                   value="${t?.position??0}"
                   style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/>
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:0.9rem;margin-bottom:14px;">
          <input id="popup-active" type="checkbox" ${!t||t.active?`checked`:``}/>
          Active (show popup)
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="popup-cancel">Cancel</button>
        <button class="btn btn-primary" id="popup-save">${a?`Save`:`Add popup`}</button>
      </div>
    </div>
  `,document.body.appendChild(o);let s=()=>o.remove();o.querySelector(`.modal-close`).onclick=s,o.querySelector(`#popup-cancel`).onclick=s,o.addEventListener(`click`,e=>{e.target===o&&s()}),o.querySelectorAll(`input[name="popup-media-source"]`).forEach(e=>{e.onchange=()=>{o.querySelector(`#popup-media-upload-div`).style.display=e.value===`upload`?`block`:`none`,o.querySelector(`#popup-media-url-div`).style.display=e.value===`url`?`block`:`none`}}),o.querySelector(`#popup-save`).onclick=async()=>{let i=o.querySelector(`input[name="popup-kind"]:checked`).value,l=o.querySelector(`#popup-caption`).value.trim(),u=parseFloat(o.querySelector(`#popup-duration`).value),d=parseInt(o.querySelector(`#popup-position`).value,10)||0,f=+!!o.querySelector(`#popup-active`).checked,p=o.querySelector(`#popup-device-target`).value,m=o.querySelector(`#popup-placement`).value,h=o.querySelector(`input[name="popup-media-source"][value="upload"]`).checked,g=o.querySelector(`#popup-file`),_=o.querySelector(`#popup-url`).value.trim();if(h&&g.files.length>0){let t=o.querySelector(`#popup-save`);t.disabled=!0,t.textContent=`Uploading...`;try{_=await c(g.files[0])}catch(n){return t.disabled=!1,t.textContent=a?`Save`:`Add popup`,e(n.message,`error`)}}if(!_)if(t?.url)_=t.url;else return e(`Media file or URL is required`,`error`);if(!/^https?:\/\//i.test(_)&&!_.startsWith(`/uploads/`))return e(`URL must start with http(s):// or /uploads/`,`error`);if(!Number.isFinite(u)||u<2)return e(`Duration must be at least 2 seconds`,`error`);let v={kind:i,url:_,caption:l||null,placement:m,device_target:p,duration_ms:Math.round(u*1e3),position:d,active:f},y;if(y=a?await r.from(`ads`).update(v).eq(`id`,t.id):await r.from(`ads`).insert(v),y.error)return e(`Could not save: `+(y.error.message||``),`error`);e(a?`Popup updated`:`Popup added`,`success`),s(),n&&n()}}async function m(o){t(o);let{data:u,error:d}=await r.from(`ads`).select(`*`).order(`position`,{ascending:!0});if(d){o.innerHTML=`<div class="card"><div class="card-body">Could not load media: ${i(d.message)}</div></div>`;return}let f=(u||[]).filter(e=>[`popup_landing`,`popup_employee`].includes(e.placement));o.innerHTML=`
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>Popup Ads</h1>
        <p>Upload full-screen popup images or videos for the landing page and employee portal</p>
      </div>
    </div>
    <div class="card" style="margin-bottom:22px;">
      <div class="card-header"><span class="card-title">${n.upload}<span style="margin-left:8px">Upload Media</span></span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">
          <div class="form-group"><label>Popup target</label><select id="media-placement"><option value="popup_landing">Landing page popup</option><option value="popup_employee">Employee portal popup</option></select></div>
          <div class="form-group"><label>Device target</label><select id="media-device-target"><option value="both">Both</option><option value="desktop">Desktop only</option><option value="mobile">Mobile only</option></select></div>
          <div class="form-group"><label>Caption</label><input id="media-caption" placeholder="Short title shown with the media"/></div>
          <div class="form-group"><label>Position</label><input id="media-position" type="number" value="0"/></div>
          <div class="form-group"><label>Duration (seconds)</label><input id="media-duration" type="number" min="2" value="6"/></div>
          <div class="form-group"><label>File</label><input id="media-file" type="file" accept="image/*,video/*"/></div>
        </div>
        <div style="padding:12px;border-radius:8px;background:var(--bg-soft);border:1px solid var(--border);font-size:0.84rem;color:var(--text-soft);line-height:1.55;margin-top:6px;">
          <b>Recommended popup sizes:</b> desktop 1200x800, mobile 900x1200, square 1080x1080. Use JPG/WebP/PNG under 2 MB for images and MP4/WebM under 20 MB for videos.
        </div>
        <button class="btn btn-primary" id="media-save" style="margin-top:14px;">${n.upload}<span>Upload & Publish</span></button>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Published Media</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Preview</th><th>Placement</th><th>Caption</th><th>Status</th><th>Position</th><th style="width:240px">Actions</th></tr></thead>
          <tbody>
            ${f.length===0?`<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-dim)">No media uploaded yet</td></tr>`:f.map(e=>`
              <tr>
                <td style="width:180px">${s(e)}</td>
                <td><span class="badge badge-open">${i(e.placement===`popup_employee`?`Employee popup`:`Landing popup`)}</span><br/><small style="color:var(--text-dim)">${i(e.device_target||`both`)}</small></td>
                <td><b>${i(e.caption||`Untitled`)}</b><br/><small style="color:var(--text-dim)">${i(e.kind)}</small></td>
                <td>${Number(e.active)===1?`<span class="badge badge-resolved">Active</span>`:`<span class="badge badge-medium">Hidden</span>`}</td>
                <td>${Number(e.position)||0}</td>
                <td><button class="btn btn-secondary btn-sm popup-edit-btn" data-id="${a(e.id)}">Edit</button><button class="btn btn-secondary btn-sm media-toggle" data-id="${a(e.id)}" data-active="${Number(e.active)===1?0:1}">${Number(e.active)===1?`Hide`:`Show`}</button><button class="btn btn-secondary btn-sm popup-delete-btn" data-id="${a(e.id)}" style="color:var(--danger)">Delete</button></td>
              </tr>
            `).join(``)}
          </tbody>
        </table>
      </div>
    </div>
  `,o.querySelector(`#media-save`).onclick=async()=>{let t=o.querySelector(`#media-save`),i=o.querySelector(`#media-file`).files[0];t.disabled=!0,t.innerHTML=`<span>Uploading...</span>`;try{let t=await c(i),{error:n}=await r.from(`ads`).insert({kind:l(i),url:t,caption:o.querySelector(`#media-caption`).value.trim(),placement:o.querySelector(`#media-placement`).value,device_target:o.querySelector(`#media-device-target`).value,duration_ms:Math.max(2,Number(o.querySelector(`#media-duration`).value)||6)*1e3,position:Number(o.querySelector(`#media-position`).value)||0,active:1});if(n)throw Error(n.message);e(`Media published`,`success`),m(o)}catch(r){e(r.message,`error`),t.disabled=!1,t.innerHTML=`${n.upload}<span>Upload & Publish</span>`}};let h=()=>m(o);o.querySelectorAll(`.popup-edit-btn`).forEach(e=>{e.onclick=()=>{let t=f.find(t=>String(t.id)===e.dataset.id);t&&p(t,h)}}),o.querySelectorAll(`.media-toggle`).forEach(t=>{t.onclick=async()=>{let{error:n}=await r.from(`ads`).update({active:Number(t.dataset.active)}).eq(`id`,t.dataset.id);n?e(n.message,`error`):h()}}),o.querySelectorAll(`.popup-delete-btn`).forEach(t=>{t.onclick=async()=>{if(!confirm(`Delete this popup ad? This cannot be undone.`))return;let{error:n}=await r.from(`ads`).delete().eq(`id`,t.dataset.id);if(n)return e(`Could not delete: `+(n.message||``),`error`);e(`Popup ad deleted`,`success`),h()}})}async function h(o){t(o);let[{data:s},{data:u},{data:d}]=await Promise.all([r.from(`training_items`).select(`*`).order(`position`,{ascending:!0}),r.from(`training_completions`).select(`*, profiles(full_name)`).order(`completed_at`,{ascending:!1}),r.from(`profiles`).select(`id,full_name`).eq(`role`,`employee`)]),f=s||[],p=d||[],m=u||[],_=new Map;m.forEach(e=>{_.has(e.item_id)||_.set(e.item_id,[]),_.get(e.item_id).push(e)});let v=p.length||1,y=e=>Math.round((_.get(e.id)||[]).length/v*100),b=f.length?Math.round(f.reduce((e,t)=>e+y(t),0)/f.length):0,x=f.filter(e=>(_.get(e.id)||[]).length>=v&&v>0).length;o.innerHTML=`
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div><h1>Employee Tutorials</h1><p>Upload training media and monitor completion live</p></div>
    </div>

    <div class="stats-grid" style="margin-bottom:22px;">
      <div class="stat-card"><div class="stat-value" style="color:var(--primary)">${f.length}</div><div class="stat-label">Tutorials</div></div>
      <div class="stat-card"><div class="stat-value">${p.length}</div><div class="stat-label">Employees</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${b}%</div><div class="stat-label">Avg Completion</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--warning)">${x}</div><div class="stat-label">Fully Completed</div></div>
    </div>

    <div class="card tut-upload" style="margin-bottom:22px;">
      <div class="card-header"><span class="card-title">${n.upload}<span style="margin-left:8px">Upload New Tutorial</span></span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;">
          <div class="form-group"><label>Title</label><input id="training-title" placeholder="e.g. How to bill a service"/></div>
          <div class="form-group"><label>Category</label><input id="training-category" placeholder="e.g. Billing, Safety" value="General"/></div>
          <div class="form-group"><label>Position (order)</label><input id="training-position" type="number" value="0"/></div>
          <div class="form-group"><label>Image / Video file</label><input id="training-file" type="file" accept="image/*,video/*"/></div>
        </div>
        <div class="form-group"><label>Description</label><textarea id="training-desc" rows="2" placeholder="What should the employee learn from this?"></textarea></div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;"><input id="training-required" type="checkbox" checked style="width:18px;height:18px;"/> Required for all employees</label>
          <button class="btn btn-primary" id="training-save">${n.upload}<span>Upload Tutorial</span></button>
        </div>
      </div>
    </div>

    <div class="tut-admin-grid">
      ${f.length===0?`<div class="card"><div class="card-body" style="text-align:center;padding:36px;color:var(--text-dim)">No tutorials uploaded yet — add your first above.</div></div>`:f.map(e=>{let t=_.get(e.id)||[],r=new Set(t.map(e=>e.employee_id)),o=p.filter(e=>!r.has(e.id)).map(e=>e.full_name),s=y(e),c=Number(e.required)!==0;return`
          <div class="card tut-admin-card ${Number(e.active)===1?``:`is-hidden`}">
            <div class="tut-admin-thumb">
              ${e.kind===`video`?`<video src="${a(e.url)}#t=0.1" muted preload="metadata"></video><span class="tut-play">${n.play}</span>`:`<img src="${a(e.url)}" alt="${a(e.title)}"/>`}
              <div class="tut-badges">
                <span class="tut-type">${e.kind===`video`?`📹 Video`:`🖼️ Image`}</span>
                ${c?`<span class="tut-req">Required</span>`:`<span class="tut-opt">Optional</span>`}
                ${Number(e.active)===1?``:`<span class="tut-hidden-tag">Hidden</span>`}
              </div>
            </div>
            <div class="tut-admin-body">
              <div class="tut-admin-head">
                <div class="tut-title">${i(e.title)}</div>
                <span class="badge badge-open">${i(e.category||`General`)}</span>
              </div>
              <p class="tut-desc">${i(e.description||``)}</p>
              <div class="tut-admin-progress">
                <div class="tut-admin-progress-top"><span>${t.length} / ${p.length} completed</span><b>${s}%</b></div>
                <div class="tut-bar"><span style="width:${s}%"></span></div>
              </div>
              ${o.length?`<details class="tut-pending"><summary>${o.length} pending</summary><div class="tut-pending-list">${o.map(e=>i(e)).join(`, `)}</div></details>`:`<span class="badge badge-resolved" style="margin-top:8px;display:inline-block;">✓ All employees complete</span>`}
              <div class="tut-admin-actions">
                <button class="btn btn-secondary btn-sm training-edit" data-id="${a(e.id)}">${n.edit}<span>Edit</span></button>
                <button class="btn btn-secondary btn-sm training-toggle" data-id="${a(e.id)}" data-active="${Number(e.active)===1?0:1}">${Number(e.active)===1?`Hide`:`Show`}</button>
                <button class="btn btn-secondary btn-sm training-delete" data-id="${a(e.id)}" style="color:var(--danger)">${n.close}<span>Delete</span></button>
              </div>
            </div>
          </div>`}).join(``)}
    </div>
  `,o.querySelector(`#training-save`).onclick=async()=>{let t=o.querySelector(`#training-save`),i=o.querySelector(`#training-file`).files[0],a=o.querySelector(`#training-title`).value.trim();if(!a)return e(`Tutorial title is required`,`warning`);t.disabled=!0,t.innerHTML=`<span>Uploading...</span>`;try{let t=await c(i),{error:n}=await r.from(`training_items`).insert({title:a,description:o.querySelector(`#training-desc`).value.trim(),category:o.querySelector(`#training-category`).value.trim()||`General`,required:+!!o.querySelector(`#training-required`).checked,kind:l(i),url:t,position:Number(o.querySelector(`#training-position`).value)||0,active:1});if(n)throw Error(n.message);e(`Tutorial uploaded`,`success`),h(o)}catch(r){e(r.message,`error`),t.disabled=!1,t.innerHTML=`${n.upload}<span>Upload Tutorial</span>`}},o.querySelectorAll(`.training-toggle`).forEach(t=>{t.onclick=async()=>{let{error:n}=await r.from(`training_items`).update({active:Number(t.dataset.active)}).eq(`id`,t.dataset.id);n?e(n.message,`error`):h(o)}}),o.querySelectorAll(`.training-edit`).forEach(e=>{e.onclick=()=>{let t=f.find(t=>String(t.id)===e.dataset.id);t&&g(t,()=>h(o))}}),o.querySelectorAll(`.training-delete`).forEach(t=>{t.onclick=async()=>{if(!confirm(`Delete this tutorial? Completion records for it will also be removed. This cannot be undone.`))return;let n=t.dataset.id,{error:i}=await r.from(`training_completions`).delete().eq(`item_id`,n);if(i)return e(`Could not remove completions: `+i.message,`error`);let{error:a}=await r.from(`training_items`).delete().eq(`id`,n);if(a)return e(`Could not delete: `+a.message,`error`);e(`Tutorial deleted`,`success`),h(o)}})}function g(t,n){let o=document.createElement(`div`);o.className=`modal-overlay`,o.innerHTML=`
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <span class="modal-title">Edit tutorial</span>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label>Title</label><input id="te-title" value="${i(t.title||``)}" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/></div>
        <div class="form-group"><label>Description</label><textarea id="te-desc" rows="3" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;">${i(t.description||``)}</textarea></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group"><label>Category</label><input id="te-category" value="${a(t.category||`General`)}" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/></div>
          <div class="form-group"><label>Position</label><input id="te-position" type="number" value="${Number(t.position)||0}" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-family:inherit;font-size:0.9rem;"/></div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:0.9rem;margin-bottom:12px;">
          <input id="te-required" type="checkbox" ${Number(t.required)===0?``:`checked`}/> Required for all employees
        </label>
        <div class="form-group">
          <label>Replace media (optional)</label>
          <input id="te-file" type="file" accept="image/*,video/*" style="width:100%;padding:8px;border-radius:10px;border:1px dashed var(--border);background:var(--bg);font-size:0.9rem;"/>
          ${t.url?`<div style="font-size:0.8rem;color:var(--text-dim);margin-top:6px;overflow:hidden;text-overflow:ellipsis;">Current: <a href="${i(t.url)}" target="_blank" style="color:var(--primary)">${i(t.url)}</a></div>`:``}
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:0.9rem;">
          <input id="te-active" type="checkbox" ${Number(t.active)===1?`checked`:``}/> Active (visible to employees)
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="te-cancel">Cancel</button>
        <button class="btn btn-primary" id="te-save">Save</button>
      </div>
    </div>
  `,document.body.appendChild(o);let s=()=>o.remove();o.querySelector(`.modal-close`).onclick=s,o.querySelector(`#te-cancel`).onclick=s,o.addEventListener(`click`,e=>{e.target===o&&s()}),o.querySelector(`#te-save`).onclick=async()=>{let i=o.querySelector(`#te-title`).value.trim();if(!i)return e(`Title is required`,`warning`);let a={title:i,description:o.querySelector(`#te-desc`).value.trim(),category:o.querySelector(`#te-category`).value.trim()||`General`,required:+!!o.querySelector(`#te-required`).checked,position:Number(o.querySelector(`#te-position`).value)||0,active:+!!o.querySelector(`#te-active`).checked},u=o.querySelector(`#te-file`).files[0],d=o.querySelector(`#te-save`);d.disabled=!0,d.textContent=u?`Uploading...`:`Saving...`;try{u&&(a.url=await c(u),a.kind=l(u));let{error:i}=await r.from(`training_items`).update(a).eq(`id`,t.id);if(i)throw Error(i.message);e(`Tutorial updated`,`success`),s(),n&&n()}catch(t){e(t.message,`error`),d.disabled=!1,d.textContent=`Save`}}}function _(e){let t=document.createElement(`div`);t.className=`tut-viewer`,t.innerHTML=`
    <div class="tut-viewer-card">
      <button class="tut-viewer-close" aria-label="Close">×</button>
      <div class="tut-viewer-media">
        ${e.kind===`video`?`<video src="${a(e.url)}" controls autoplay playsinline></video>`:`<img src="${a(e.url)}" alt="${a(e.title)}"/>`}
      </div>
      <div class="tut-viewer-info">
        <div class="tut-viewer-title">${i(e.title)}</div>
        ${e.description?`<p>${i(e.description)}</p>`:``}
      </div>
    </div>`,document.body.appendChild(t);let n=()=>t.remove();t.querySelector(`.tut-viewer-close`).onclick=n,t.addEventListener(`click`,e=>{e.target===t&&n()}),document.addEventListener(`keydown`,function e(t){t.key===`Escape`&&(n(),document.removeEventListener(`keydown`,e))})}async function v(o){t(o);let{data:{user:s}}=await r.auth.getUser(),[{data:c},{data:l}]=await Promise.all([r.from(`training_items`).select(`*`).eq(`active`,1).order(`position`,{ascending:!0}),r.from(`training_completions`).select(`*`).eq(`employee_id`,s.id)]),u=new Set((l||[]).map(e=>e.item_id)),d=c||[],f=d.length,p=d.filter(e=>u.has(e.id)).length,m=d.filter(e=>Number(e.required)!==0),h=m.filter(e=>!u.has(e.id)).length,g=f?Math.round(p/f*100):0,y=[...new Set(d.map(e=>e.category||`General`))];if(o.innerHTML=`
    <div class="page-header"><h1>Employee Tutorials</h1><p>Complete your image &amp; video training</p></div>
    ${f===0?`
      <div class="card"><div class="card-body" style="text-align:center;color:var(--text-dim);padding:48px;">
        <div style="font-size:2.4rem;margin-bottom:10px;">🎓</div>
        <p style="font-weight:700;color:var(--text);">No tutorials assigned yet</p>
        <p style="font-size:0.86rem;">Your trainer hasn't added any tutorials. Check back soon.</p>
      </div></div>
    `:`
      <div class="card tut-progress">
        <div class="tut-ring" style="background:conic-gradient(var(--primary) ${g*3.6}deg, var(--border) 0deg);"><div class="tut-ring-inner">${g}<small>%</small></div></div>
        <div class="tut-progress-meta">
          <div class="tut-progress-title">Your training progress</div>
          <div class="tut-progress-sub">${p} of ${f} completed${h?` · <b style="color:var(--warning)">${h} required pending</b>`:` · <b style="color:var(--success)">all required done 🎉</b>`}</div>
          <div class="tut-bar"><span style="width:${g}%"></span></div>
        </div>
      </div>

      <div class="tut-toolbar">
        <div class="sr-filter-bar" id="tut-filters">
          <button class="sr-filter active" data-f="all">All <span class="sr-filter-count">${f}</span></button>
          <button class="sr-filter" data-f="required">Required <span class="sr-filter-count">${m.length}</span></button>
          <button class="sr-filter" data-f="pending">Pending <span class="sr-filter-count">${f-p}</span></button>
          <button class="sr-filter" data-f="completed">Completed <span class="sr-filter-count">${p}</span></button>
          ${y.length>1?y.map(e=>`<button class="sr-filter" data-f="cat:${a(e)}">${i(e)}</button>`).join(``):``}
        </div>
        <label class="tut-search"><span>${n.search}</span><input id="tut-search" type="search" placeholder="Search tutorials..." autocomplete="off"/></label>
      </div>

      <div class="tut-grid" id="tut-grid">${d.map(e=>{let t=u.has(e.id),r=Number(e.required)!==0;return`
      <div class="tut-card ${t?`is-done`:``}" data-cat="${a(e.category||`General`)}" data-done="${t?`1`:`0`}" data-req="${r?`1`:`0`}" data-search="${a((e.title+` `+(e.description||``)).toLowerCase())}">
        <div class="tut-thumb tut-watch" data-id="${a(e.id)}">
          ${e.kind===`video`?`<video src="${a(e.url)}#t=0.1" muted playsinline preload="metadata"></video><span class="tut-play">${n.play}</span>`:`<img src="${a(e.url)}" alt="${a(e.title)}"/>`}
          ${t?`<span class="tut-done-tick">✓</span>`:``}
          <div class="tut-badges">
            <span class="tut-type">${e.kind===`video`?`📹 Video`:`🖼️ Image`}</span>
            ${r?`<span class="tut-req">Required</span>`:`<span class="tut-opt">Optional</span>`}
          </div>
        </div>
        <div class="tut-body">
          <div class="tut-title">${i(e.title)}</div>
          <p class="tut-desc">${i(e.description||``)}</p>
          <div class="tut-actions">
            <button class="btn btn-secondary btn-sm tut-watch" data-id="${a(e.id)}">${n.play}<span>Watch</span></button>
            <button class="btn ${t?`btn-secondary`:`btn-primary`} btn-sm mark-training" data-id="${a(e.id)}" ${t?`disabled`:``}>${n.check}<span>${t?`Completed`:`Mark Complete`}</span></button>
          </div>
        </div>
      </div>`}).join(``)}</div>
      <div id="tut-empty" style="display:none;text-align:center;padding:30px;color:var(--text-dim);">No tutorials match this filter.</div>
    `}
  `,f===0)return;let b=`all`,x=``,S=()=>{let e=0;o.querySelectorAll(`#tut-grid .tut-card`).forEach(t=>{let n=!0;b===`required`?n=t.dataset.req===`1`:b===`pending`?n=t.dataset.done===`0`:b===`completed`?n=t.dataset.done===`1`:b.startsWith(`cat:`)&&(n=t.dataset.cat===b.slice(4)),n&&x&&(n=t.dataset.search.includes(x)),t.style.display=n?``:`none`,n&&e++});let t=o.querySelector(`#tut-empty`);t&&(t.style.display=e?`none`:`block`)};o.querySelectorAll(`#tut-filters .sr-filter`).forEach(e=>e.onclick=()=>{o.querySelectorAll(`#tut-filters .sr-filter`).forEach(e=>e.classList.remove(`active`)),e.classList.add(`active`),b=e.dataset.f,S()});let C=o.querySelector(`#tut-search`);C&&(C.oninput=e=>{x=e.target.value.trim().toLowerCase(),S()}),o.querySelectorAll(`.tut-watch`).forEach(e=>e.onclick=()=>{let t=d.find(t=>String(t.id)===e.dataset.id);t&&_(t)}),o.querySelectorAll(`.mark-training`).forEach(t=>{t.onclick=async n=>{n.stopPropagation(),t.disabled=!0;let{error:i}=await r.from(`training_completions`).insert({item_id:t.dataset.id,employee_id:s.id,completed_at:new Date().toISOString().slice(0,19).replace(`T`,` `)});i?(e(i.message,`error`),t.disabled=!1):(e(`🎉 Training marked complete`,`success`),v(o))}})}async function y(e){t(e);let[{data:n},{data:a},{data:s},{data:c},{data:l}]=await Promise.all([r.from(`inquiries`).select(`*`).order(`created_at`,{ascending:!1}),r.from(`profiles`).select(`id,full_name`).eq(`role`,`employee`),r.from(`attendance`).select(`*`).order(`date`,{ascending:!1}),r.from(`eod_reports`).select(`*`).order(`created_at`,{ascending:!1}),r.from(`cash_collections`).select(`*`).order(`created_at`,{ascending:!1})]),u=n||[],d=u.filter(e=>e.payment_status===`paid`).reduce((e,t)=>e+Number(t.bill_total||t.bill_amount||0),0),f=u.filter(e=>e.bill_amount&&e.payment_status!==`paid`).reduce((e,t)=>e+Number(t.bill_total||t.bill_amount||0),0),p=u.filter(e=>e.status===`issue_not_resolved`),m=u.filter(e=>![`resolved`,`closed`,`issue_not_resolved`].includes(e.status)),h=u.filter(e=>[`resolved`,`closed`].includes(e.status)),g=(a||[]).map(e=>{let t=u.filter(t=>t.assigned_employee_id===e.id),n=t.filter(e=>[`resolved`,`closed`].includes(e.status)).length,r=t.filter(e=>e.status===`issue_not_resolved`).length,i=(s||[]).find(t=>t.user_id===e.id&&String(t.date||``).slice(0,10)===new Date().toLocaleDateString(`en-CA`));return{...e,assigned:t.length,resolved:n,issues:r,online:!!(i?.clock_in&&!i?.clock_out)}}).sort((e,t)=>t.resolved-e.resolved||t.assigned-e.assigned),_=(l||[]).filter(e=>e.status!==`submitted`).reduce((e,t)=>e+Number(t.amount||0),0);e.innerHTML=`
    <div class="page-header"><h1>AI Report</h1><p>Business finance and employee progress summary</p></div>
    <div class="stats-grid" style="margin-bottom:22px;">
      <div class="stat-card"><div class="stat-value" style="color:var(--success)">${o(d)}</div><div class="stat-label">Paid Revenue</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--danger)">${o(f)}</div><div class="stat-label">Awaiting Payment</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--warning)">${o(_)}</div><div class="stat-label">Cash Pending</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--primary)">${h.length}</div><div class="stat-label">Resolved Services</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--danger)">${p.length}</div><div class="stat-label">Issue Not Resolved</div></div>
      <div class="stat-card"><div class="stat-value" style="color:var(--warning)">${m.length}</div><div class="stat-label">Active Services</div></div>
    </div>
    <div class="card" style="margin-bottom:22px;">
      <div class="card-header"><span class="card-title">Business Notes</span></div>
      <div class="card-body" style="line-height:1.6;color:var(--text-soft);">
        <p><b>Finance:</b> ${f>0?`Collect ${o(f)} from unpaid bills.`:`No unpaid bill amount is pending.`} ${_>0?`Cash handover pending is ${o(_)}.`:`No cash handover is pending.`}</p>
        <p><b>Service quality:</b> ${p.length?`${p.length} service(s) are marked Issue Not Resolved and need follow-up.`:`No unresolved issue services are currently marked.`}</p>
        <p><b>Employee progress:</b> ${(c||[]).length} EOD reports are recorded. ${g.filter(e=>e.online).length} employee(s) are currently clocked in.</p>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Employee Progress</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Assigned</th><th>Resolved</th><th>Issues</th><th>Status</th></tr></thead>
          <tbody>
            ${g.length===0?`<tr><td colspan="5" style="text-align:center;padding:28px;color:var(--text-dim)">No employees found</td></tr>`:g.map(e=>`
              <tr><td><b>${i(e.full_name||`Employee`)}</b></td><td>${e.assigned}</td><td style="color:var(--success);font-weight:800">${e.resolved}</td><td style="color:var(--danger);font-weight:800">${e.issues}</td><td>${e.online?`<span class="badge badge-resolved">Online</span>`:`<span class="badge badge-medium">Offline</span>`}</td></tr>
            `).join(``)}
          </tbody>
        </table>
      </div>
    </div>
  `}export{f as mountEmployeePopupAds,y as renderAIReportTab,v as renderEmployeeTrainingTab,m as renderPopupAdsTab,h as renderTrainingAdminTab};