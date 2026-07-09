import{g as e,t}from"./icons-j8TZxXx3.js";import{n}from"./index-CuPRPj-i.js";var r=window.location.hostname!==`localhost`&&window.location.hostname!==`127.0.0.1`?`/api`:`http://localhost:5000/api`,i=()=>({Authorization:`Bearer ${localStorage.getItem(`auth_token`)||``}`}),a=e=>String(e??``).replace(/[&<>"]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`})[e]),o=e=>{let t=new Date(e);return isNaN(t)?``:t.toLocaleString(`en-IN`,{dateStyle:`medium`,timeStyle:`short`})},s={payment_received:`💰`,new_assignment:`📋`,new_service_request:`🆕`,device_followup_reminder:`🔧`,new_complaint:`⚠️`,sla_breach:`⏰`,finance_summary:`📊`},c={new_service_request:{admin:`inquiries`,employee:`all-tickets`},new_assignment:{admin:`inquiries`,employee:`all-tickets`},job_completed:{admin:`inquiries`,employee:`all-tickets`},sla_breach:{admin:`inquiries`,employee:`all-tickets`},payment_received:{admin:`payments`,employee:`all-tickets`},cash_collected:{admin:`cash`,employee:`my-cash`},new_complaint:{admin:`complaints`},device_status:{admin:`device-tracking`,employee:`dashboard`},device_followup_reminder:{admin:`device-tracking`,employee:`dashboard`},notice_posted:{employee:`dashboard`},training_added:{admin:`training-courses`,employee:`my-training-courses`},leave_approved:{employee:`my-leaves`},leave_rejected:{employee:`my-leaves`},leave_request:{admin:`leaves`},eod_warning:{employee:`my-eod`},leaderboard_rank:{employee:`leaderboard`},finance_summary:{admin:`finance`}};function l(e){let t=window.__appRole||`employee`,n=c[e];return n&&(n[t]||n.admin||n.employee)||null}var u=new Set([`device_status`,`device_followup_reminder`]);async function d(c){let d=[],f=`all`,p=!0,m=async()=>{let[e,t]=await Promise.all([fetch(`${r}/notifications`,{headers:i()}),fetch(`${r}/settings/device-tracking`,{headers:i()}).catch(()=>null)]),n=await e.json();if(!e.ok)throw Error(n.error||`Could not load notifications`);d=n.items||[],t&&t.ok&&(p=(await t.json())?.enabled!==!1)},h=()=>d.filter(e=>!p&&u.has(e.subject)?!1:f===`unread`?!e.read_at:f===`payment_received`?e.subject===`payment_received`:!0),g=()=>{let m=h(),_=d.filter(e=>p||!u.has(e.subject)),v=_.filter(e=>!e.read_at).length;c.innerHTML=`
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div>
          <h1 style="display:flex;align-items:center;gap:10px;">
            <span style="width:24px;height:24px;display:inline-flex;color:var(--primary);">${t.bell}</span>
            <span>Notifications</span>
          </h1>
          <p>Payments (cash & online), assignments, reminders and more</p>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-secondary" id="ntf-readall">Mark all read</button>
        </div>
      </div>

      <div class="sr-filter-bar" style="margin-bottom:16px;">
        <button class="sr-filter ${f===`all`?`active`:``}" data-f="all">All <span class="sr-filter-count">${_.length}</span></button>
        <button class="sr-filter ${f===`unread`?`active`:``}" data-f="unread">Unread <span class="sr-filter-count">${v}</span></button>
        <button class="sr-filter ${f===`payment_received`?`active`:``}" data-f="payment_received">Payments <span class="sr-filter-count">${_.filter(e=>e.subject===`payment_received`).length}</span></button>
      </div>

      <div class="card"><div class="card-body" style="padding:0;">
        ${m.length===0?`<div style="text-align:center;padding:48px;color:var(--text-dim)">No notifications</div>`:m.map(e=>`
            <div class="ntf-row ${e.read_at?``:`unread`}" data-id="${e.id}" style="display:flex;gap:14px;padding:16px 18px;border-bottom:1px solid var(--border);cursor:pointer;">
              <div style="font-size:1.4rem;line-height:1;">${s[e.subject]||`🔔`}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:700;font-size:0.92rem;">${a(e.title||`Update`)}</div>
                <div style="font-size:0.86rem;color:var(--text-soft);margin-top:2px;">${a(e.body||``)}</div>
                <div style="font-size:0.74rem;color:var(--text-dim);margin-top:6px;">${o(e.created_at)}</div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
                ${e.read_at?``:`<span style="width:9px;height:9px;border-radius:50%;background:var(--primary);margin-top:6px;"></span>`}
                ${l(e.subject)?`<span style="font-size:0.72rem;color:var(--primary);white-space:nowrap;">Go to →</span>`:``}
              </div>
            </div>`).join(``)}
      </div></div>`,c.querySelector(`#ntf-readall`).onclick=async()=>{try{await fetch(`${r}/notifications/read-all`,{method:`POST`,headers:i()})}catch{}d=d.map(e=>({...e,read_at:e.read_at||new Date().toISOString()})),e(`All marked read`,`success`),g()},c.querySelectorAll(`.sr-filter`).forEach(e=>e.onclick=()=>{f=e.dataset.f,g()}),c.querySelectorAll(`.ntf-row`).forEach(e=>e.onclick=async()=>{let t=d.find(t=>t.id===e.dataset.id);if(!t)return;if(!t.read_at){try{await fetch(`${r}/notifications/${t.id}/read`,{method:`POST`,headers:i()})}catch{}t.read_at=new Date().toISOString(),g()}let a=l(t.subject);a&&window.__appNav?window.__appNav(a):n(t)})};await(async()=>{c.innerHTML=`<div style="text-align:center;padding:40px;color:var(--text-dim)">Loading…</div>`;try{await m(),g()}catch(e){c.innerHTML=`<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--danger)">${a(e.message)}</div></div>`}})()}export{d as renderNotificationsTab};