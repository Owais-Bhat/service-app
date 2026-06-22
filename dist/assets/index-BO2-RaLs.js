const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/employee-CWQOlzTT.js","assets/icons-j8TZxXx3.js","assets/device-tracking-DDQQfS3_.js","assets/stats-BvrlYv3v.js","assets/dashboard-widgets-BBXbUQBH.js","assets/collections-BAZgk5XN.js","assets/media-training-u1t18R8T.js","assets/notifications-V60DrLBR.js","assets/training-BHhj3_YW.js","assets/profile-Vo1cmcVg.js","assets/admin-CNYbIrsG.js","assets/discounts-DQ5CMOJx.js","assets/admin-notices-BRMdGrtT.js","assets/device-tracking-admin-CCBSewpY.js","assets/finance-BO3tsEgI.js"])))=>i.map(i=>d[i]);
import{_ as e,d as t,f as n,g as r,h as i,i as a,n as o,t as s}from"./icons-j8TZxXx3.js";(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var c=window.location.hostname!==`localhost`&&window.location.hostname!==`127.0.0.1`?`/api`:`http://localhost:5000/api`,l=()=>{let e=localStorage.getItem(`auth_token`),t={"Content-Type":`application/json`};return e&&(t.Authorization=`Bearer ${e}`),t};function u(e,t={},n=12e3){if(typeof AbortController>`u`)return fetch(e,t);let r=new AbortController,i=setTimeout(()=>r.abort(),n);return fetch(e,{...t,signal:r.signal}).finally(()=>clearTimeout(i))}var d=class{constructor(e){this.table=e,this.params={},this.eqs=[],this.method=`GET`,this.body=null,this.isSingle=!1}select(e=`*`){return this.params.select=e,this}eq(e,t){return this.eqs.push(`${e}:${t}`),this}order(e,{ascending:t=!0}={}){return this.params.order=`${e}:${t?`asc`:`desc`}`,this}in(e,t){return this.params.in=`${e}:${t.join(`,`)}`,this}maybeSingle(){return this.isSingle=!0,this}single(){return this.isSingle=!0,this}_buildQuery(){let e=new URLSearchParams;return Object.entries(this.params).forEach(([t,n])=>e.set(t,n)),this.eqs.forEach(t=>e.append(`eq`,t)),e.toString()}insert(e){return this.method=`POST`,this.body=e,this}upsert(e){return this.method=`POST`,this.body=e,this}update(e){return this.method=`PATCH`,this.body=e,this}delete(){return this.method=`DELETE`,this}async then(e,t){try{let t=this.method===`POST`?``:`?${this._buildQuery()}`,n={method:this.method,headers:l()};this.body&&(n.body=JSON.stringify(this.body));let r=await u(`${c}/data/${this.table}${t}`,n),i=await r.json();if(!r.ok)return e({data:null,error:{message:i.error||`Request failed`,status:r.status}});e({data:this.isSingle&&Array.isArray(i)?i[0]:i,error:null})}catch(t){e({data:null,error:{message:t.message}})}}},f=3e3,p=2,m=`realtime_force_poll`,h=(()=>{let e=null,t=null,n=0,r=0,i=`idle`,a=new Set,o=new Set,s=e=>{if(!e)return null;let t=/^(\w+)=eq\.(.+)$/.exec(e);return t?{col:t[1],val:t[2]}:null},l=(e,t)=>{if(e.table&&e.table!==t.table||e.events&&!e.events.has(`*`)&&!e.events.has(t.type))return!1;if(e.filter){let n=s(e.filter);if(n&&t.row&&String(t.row[n.col])!==String(n.val))return!1}return!0},u=e=>{if(e.kind===`db`){let t={eventType:e.type,schema:`public`,table:e.table,new:e.row,old:null};a.forEach(n=>{if(l(n,e))try{n.cb(t)}catch(e){console.error(`[realtime] handler error`,e)}})}else e.kind===`notify`&&o.forEach(t=>{if(!(t.subjects&&!t.subjects.has(e.subject)))try{t.cb(e)}catch(e){console.error(`[realtime] notify handler error`,e)}})},d=()=>{if(e){try{e.close()}catch{}e=null}},h=()=>{t&&=(clearInterval(t),null)},g=()=>{if(i===`poll`)return;d(),i=`poll`,console.warn(`[realtime] using polling fallback (interval `+f+`ms)`);let e=async()=>{let e=localStorage.getItem(`auth_token`);if(e)try{let t=await fetch(`${c}/events/poll?since=${n}`,{headers:{Authorization:`Bearer ${e}`}});if(!t.ok)return;let r=await t.json();typeof r.cursor==`number`&&(n=Math.max(n,r.cursor)),(r.events||[]).forEach(u)}catch{}};e(),t=setInterval(e,f)},_=async()=>{if(i===`sse`)return;let t=localStorage.getItem(`auth_token`);if(!t)return;if(typeof EventSource>`u`||localStorage.getItem(m)===`1`)return g();i=`sse`;let a;try{a=await fetch(`${c}/events/ticket`,{method:`POST`,headers:{Authorization:`Bearer ${t}`}})}catch{return g()}if(!a.ok)return g();let o=await a.json();if(!o.ticket)return g();let s=`${c}/events?ticket=${encodeURIComponent(o.ticket)}`;e=new EventSource(s);let l=!1;e.onopen=()=>{l=!0,r=0},e.onmessage=e=>{let t;try{t=JSON.parse(e.data)}catch{return}typeof t._id==`number`&&(n=Math.max(n,t._id)),u(t)},e.onerror=()=>{if(l||(r+=1),r>=p){try{localStorage.setItem(m,`1`)}catch{}g()}}},v=()=>{i===`idle`&&_()},y=()=>{a.size===0&&o.size===0&&(d(),h(),i=`idle`)};return{addSub(e){return a.add(e),v(),()=>{a.delete(e),y()}},addNotifySub(e){return o.add(e),v(),()=>{o.delete(e),y()}},reset(){d(),h(),a.clear(),o.clear(),n=0,r=0,i=`idle`}}})();function g(e,t){return h.addNotifySub({subjects:e?new Set(e):null,cb:t})}function _(){h.reset()}var v=class{constructor(e){this.name=e,this._handlers=[],this._unsubs=[]}on(e,t,n){let r=new Set([t.event||`*`]);return this._handlers.push({events:r,table:t.table||null,filter:t.filter||null,cb:n}),this}subscribe(){return this._handlers.forEach(e=>this._unsubs.push(h.addSub(e))),this}unsubscribe(){this._unsubs.forEach(e=>e()),this._unsubs=[]}},y={from:e=>new d(e),channel:e=>new v(e),removeChannel:e=>{try{e?.unsubscribe?.()}catch{}},auth:{getSession:async()=>{let e=await y.auth.getUser();return{data:{session:e.data.user?{user:e.data.user}:null}}},onAuthStateChange:e=>{let t=t=>{t.key===`auth_token`&&e(t.newValue?`SIGNED_IN`:`SIGNED_OUT`,null)};return window.addEventListener(`storage`,t),{data:{subscription:{unsubscribe:()=>window.removeEventListener(`storage`,t)}}}},getUser:async()=>{if(!localStorage.getItem(`auth_token`))return{data:{user:null}};try{let e=await u(`${c}/auth/me`,{headers:l()},1e4),t=await e.json();return e.ok?{data:{user:t.user}}:{data:{user:null}}}catch{return{data:{user:null}}}},updateUser:async({password:e})=>{try{let t=await fetch(`${c}/auth/update-password`,{method:`POST`,headers:l(),body:JSON.stringify({password:e})}),n=await t.json();return t.ok?{data:{user:n.user},error:null}:{data:null,error:{message:n.error}}}catch(e){return{data:null,error:{message:e.message}}}},signInWithPassword:async({email:e,password:t})=>{try{let n=await fetch(`${c}/auth/signin`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({email:e,password:t})}),r=await n.json();return n.ok?(_(),localStorage.removeItem(m),localStorage.setItem(`auth_token`,r.token),{data:{user:r.user},error:null}):{data:null,error:{message:r.error}}}catch(e){return{data:null,error:{message:e.message}}}},signUp:async({email:e,password:t,options:n})=>{try{let r=await fetch(`${c}/auth/signup`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({email:e,password:t,fullName:n.data.full_name,access_key:n.data.access_key||n.data.regKey})}),i=await r.json();return r.ok?{data:{user:{id:i.userId,email:e}},error:null}:{data:null,error:{message:i.error}}}catch(e){return{data:null,error:{message:e.message}}}},signOut:async()=>(localStorage.removeItem(`auth_token`),{error:null})}};async function b(e){let{data:{user:t}}=await y.auth.getUser();if(t?.role)return t.role;let{data:n,error:r}=await y.from(`profiles`).select(`role`).eq(`id`,e).single();return r?`client`:n?.role||`client`}async function ee(e,t){let n=await fetch(`${c}/auth/signin`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({email:e,password:t})}),r=await n.json();return n.ok&&r.token?(_(),localStorage.removeItem(m),localStorage.setItem(`auth_token`,r.token),{data:{user:r.user},error:null}):{data:null,error:{message:r.error||`Sign in failed`}}}async function te(e,t,n,r){let i=await fetch(`${c}/auth/signup`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({email:e,password:t,fullName:n,access_key:r})}),a=await i.json();return i.ok?{data:{user:a.userId},error:null}:{data:null,error:{message:a.error||`Sign up failed`}}}async function x(){return localStorage.removeItem(`auth_token`),localStorage.removeItem(`realtime_force_poll`),_(),{error:null}}var ne=new URL(`/assets/logo-Cuxe_Kd5.png`,``+import.meta.url).href;function re(t,n){let i=document.getElementById(`app`),a=`login`,o=()=>{let c=localStorage.getItem(`theme`)||`light`;i.innerHTML=`
      <div class="auth-page">
        ${n?`
        <button class="btn btn-secondary" id="auth-back-btn" style="position: absolute; top: 20px; left: 20px; padding: 8px; border-radius: 50%; min-width: 42px; min-height: 42px; z-index: 10; display: flex; align-items: center; justify-content: center;" title="Back">
          <span style="width: 20px; height: 20px; display: flex;">
            ${s.arrowLeft}
          </span>
        </button>
        `:``}
        <button class="btn btn-secondary theme-toggle-btn" style="position: absolute; top: 20px; right: 20px; padding: 8px; border-radius: 50%; min-width: 42px; min-height: 42px; z-index: 10; display: flex; align-items: center; justify-content: center;" title="Toggle Theme">
          <span style="width: 20px; height: 20px; display: flex;">
            ${c===`dark`?s.sun:s.moon}
          </span>
        </button>
        <div class="auth-card">
          <div class="auth-logo">
            <img src="${ne}" alt="Networking Experts" onerror="this.style.display='none'" />
          </div>
          <h2 class="auth-title">${a===`login`?`Welcome Back`:`Create Account`}</h2>
          <p class="auth-subtitle">${a===`login`?`Sign in to continue`:`Register your account`}</p>
          <div id="auth-error" class="auth-error" style="display:none"></div>

          <form id="auth-form">
            ${a===`signup`?`
              <div class="form-group">
                <label>Full Name</label>
                <input type="text" id="full_name" placeholder="John Doe" required />
              </div>
              <div class="form-group">
                <label>Staff / Admin Access Key</label>
                <div class="password-field">
                  <input type="password" id="reg_key" placeholder="Enter staff or admin secret key" required />
                  <button type="button" class="password-toggle" data-target="reg_key" title="Show access key" aria-label="Show access key">${s.eye}</button>
                </div>
              </div>`:``}
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" id="email" placeholder="you@example.com" required autocomplete="email"/>
            </div>
            <div class="form-group">
              <label>Password</label>
              <div class="password-field">
                <input type="password" id="password" placeholder="Password" required autocomplete="${a===`login`?`current-password`:`new-password`}"/>
                <button type="button" class="password-toggle" data-target="password" title="Show password" aria-label="Show password">${s.eye}</button>
              </div>
            </div>
            <button type="submit" class="btn btn-primary btn-wide" id="submit-btn">
              ${a===`login`?`Sign In →`:`Create Account →`}
            </button>
          </form>

          <div style="margin-top:24px;text-align:center;font-size:.88rem;color:var(--text-soft)">
            ${a===`login`?`Don't have an account? <a href="#" id="toggle-mode" style="color:var(--primary);font-weight:700">Sign up</a>`:`Already have an account? <a href="#" id="toggle-mode" style="color:var(--primary);font-weight:700">Sign in</a>`}
          </div>
        </div>
      </div>`,i.querySelector(`.theme-toggle-btn`).addEventListener(`click`,()=>{e(),o()});let l=document.getElementById(`auth-back-btn`);l&&(l.onclick=n),i.querySelectorAll(`.password-toggle`).forEach(e=>{e.onclick=()=>{let t=document.getElementById(e.dataset.target),n=t.type===`text`;t.type=n?`password`:`text`,e.innerHTML=n?s.eye:s.eyeOff;let r=e.dataset.target===`reg_key`;e.title=n?r?`Show access key`:`Show password`:r?`Hide access key`:`Hide password`,e.setAttribute(`aria-label`,e.title)}}),document.getElementById(`toggle-mode`).onclick=e=>{e.preventDefault(),a=a===`login`?`signup`:`login`,o()},document.getElementById(`auth-form`).onsubmit=async e=>{e.preventDefault();let n=document.getElementById(`submit-btn`),i=document.getElementById(`auth-error`);i.style.display=`none`,n.disabled=!0,n.textContent=`Please wait…`;let s=document.getElementById(`email`).value.trim(),c=document.getElementById(`password`).value,l;if(l=a===`signup`?await te(s,c,document.getElementById(`full_name`).value.trim(),document.getElementById(`reg_key`).value.trim()):await ee(s,c),l.error){i.textContent=l.error.message,i.style.display=`block`,n.disabled=!1,n.textContent=a===`login`?`Sign In →`:`Create Account →`;return}if(a===`signup`){let e=await ee(s,c);if(e.error)r(`Account created! Please sign in.`,`success`),a=`login`,o();else{let n=e.data.user.role||await b(e.data.user.id);r(`Account created successfully!`,`success`),t(e.data.user,n)}}else{let e=l.data.user.role||await b(l.data.user.id);t(l.data.user,e)}}};o()}var ie=`voice_alerts`,S=e=>Math.round(Number(e)||0).toLocaleString(`en-IN`),ae={new_service_request:{admin:`inquiries`,employee:`all-tickets`},new_assignment:{admin:`inquiries`,employee:`all-tickets`},job_completed:{admin:`inquiries`,employee:`all-tickets`},sla_breach:{admin:`inquiries`,employee:`all-tickets`},payment_received:{admin:`payments`,employee:`all-tickets`},cash_collected:{admin:`cash`,employee:`my-cash`},new_complaint:{admin:`complaints`},device_status:{admin:`device-tracking`,employee:`dashboard`},device_followup_reminder:{admin:`device-tracking`,employee:`dashboard`},notice_posted:{employee:`dashboard`},training_added:{admin:`training-courses`,employee:`my-training-courses`},leave_approved:{employee:`my-leaves`},leave_rejected:{employee:`my-leaves`},leave_request:{admin:`leaves`},eod_warning:{employee:`my-eod`},leaderboard_rank:{employee:`leaderboard`},finance_summary:{admin:`finance`}};function oe(e){let t=window.__appRole||`employee`,n=ae[e];return n&&(n[t]||n.admin||n.employee)||null}var C={payment_received:{icon:`💰`,label:`Payment Received`,voice:e=>e.data?.amount?`Rupees ${S(e.data.amount)} has been received${e.data?.ticket_no?` on ticket ${e.data.ticket_no}`:``}.`:`A payment has been received.`},cash_collected:{icon:`🧾`,label:`Cash Collected`,voice:e=>e.data?.amount?`Rupees ${S(e.data.amount)} cash has been collected by admin.`:`Cash has been collected by admin.`},new_assignment:{icon:`📋`,label:`New Assignment`,voice:()=>`A new service has been assigned to you.`},new_service_request:{icon:`🆕`,label:`New Service Request`,voice:()=>`A new service request has arrived.`},new_complaint:{icon:`⚠️`,label:`New Complaint`,voice:()=>`A new complaint has been filed.`},sla_breach:{icon:`⏰`,label:`Overdue`,voice:e=>e.body||`A ticket is overdue.`},overdue:{icon:`⏰`,label:`Overdue`,voice:e=>e.body||`A ticket is overdue.`},job_completed:{icon:`✅`,label:`Job Completed`,voice:e=>e.body||`A job has been completed.`},device_status:{icon:`🔧`,label:`Device Update`,voice:e=>e.body||`Device repair status updated.`},device_followup_reminder:{icon:`🔧`,label:`Device Follow-up`,voice:()=>`You have a device follow-up reminder.`},notice_posted:{icon:`📢`,label:`New Notice`,voice:e=>`New notice. ${e.title||``}`},leaderboard_rank:{icon:`🏆`,label:`Leaderboard`,voice:e=>e.body||`You are first on the leaderboard this month.`},training_added:{icon:`🎓`,label:`Training Added`,voice:e=>e.title?`New training added. ${e.title}`:`A new training program has been added.`},leave_approved:{icon:`✅`,label:`Leave Approved`,voice:()=>`Your leave request has been approved.`},leave_rejected:{icon:`🚫`,label:`Leave Rejected`,voice:()=>`Your leave request has been rejected.`},leave_request:{icon:`🌴`,label:`Leave Request`,voice:e=>e.body||`A new leave request needs your approval.`},eod_warning:{icon:`📝`,label:`EOD Reminder`,voice:()=>`Reminder. Please submit your end of day report.`},employee_clock_in:{icon:`🟢`,label:`Clock In`,voice:e=>e.body||`An employee clocked in.`},employee_clock_out:{icon:`🔴`,label:`Clock Out`,voice:e=>e.body||`An employee clocked out.`},finance_summary:{icon:`📊`,label:`Finance Summary`,voice:()=>`The daily finance summary is ready.`},feedback_received:{icon:`⭐`,label:`Feedback`,voice:()=>`New customer feedback received.`}};function se(e){return C[e]?.icon||`🔔`}function ce(e){return C[e]?.label||`Notification`}var le=!1,w=null;function T(){if(w||typeof speechSynthesis>`u`)return w;let e=speechSynthesis.getVoices()||[];return w=e.find(e=>/en-IN/i.test(e.lang))||e.find(e=>/en-GB/i.test(e.lang))||e.find(e=>/^en/i.test(e.lang))||e[0]||null,w}if(typeof speechSynthesis<`u`)try{speechSynthesis.onvoiceschanged=()=>{w=null,T()}}catch{}function E(){if(!(le||typeof speechSynthesis>`u`)){le=!0;try{let e=new SpeechSynthesisUtterance(` `);e.volume=0,speechSynthesis.speak(e)}catch{}}}document.addEventListener(`click`,E,{once:!0}),document.addEventListener(`touchstart`,E,{once:!0});function ue(){return localStorage.getItem(ie)!==`0`}function de(e){if(!ue()||typeof speechSynthesis>`u`)return;let t=e?.data?.voice;if(!t){let n=C[e?.subject];t=n?n.voice(e):e?.title?`${e.title}. ${e.body||``}`:e?.body||``}if(!(!t||!String(t).trim()))try{let e=new SpeechSynthesisUtterance(String(t).slice(0,240)),n=T();n&&(e.voice=n),e.lang=n&&n.lang||`en-IN`,e.rate=1,e.pitch=1,e.volume=1;try{speechSynthesis.cancel()}catch{}speechSynthesis.speak(e)}catch{}}var D=e=>String(e??``).replace(/[&<>"]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`})[e]),fe=e=>{let t=new Date(e);return isNaN(t)?``:t.toLocaleString(`en-IN`,{dateStyle:`full`,timeStyle:`short`})};function O(e){if(!e)return;let t=e.data;if(typeof t==`string`)try{t=JSON.parse(t)}catch{t={}}t||={};let n=new Set([`voice`,`url`]),r={amount:`Amount`,ticket_no:`Ticket`,customer:`Customer`,employee:`Employee`,payment_method:`Payment Mode`,status:`Status`,service:`Service`,company:`Company`},i=Object.entries(t).filter(([e,t])=>!n.has(e)&&t!=null&&t!==``).map(([e,t])=>{let n=r[e]||e.replace(/_/g,` `).replace(/\b\w/g,e=>e.toUpperCase()),i=e===`amount`?`₹${S(t)}`:D(t);return`<div class="ntf-detail-row"><span class="ntf-detail-k">${D(n)}</span><span class="ntf-detail-v">${i}</span></div>`}).join(``);document.querySelectorAll(`.ntf-fullscreen`).forEach(e=>e.remove());let a=document.createElement(`div`);a.className=`ntf-fullscreen`,a.innerHTML=`
    <div class="ntf-fullscreen-card">
      <button class="ntf-fullscreen-close" aria-label="Close">×</button>
      <div class="ntf-fullscreen-icon">${se(e.subject)}</div>
      <div class="ntf-fullscreen-kicker">${D(ce(e.subject))}</div>
      <h2 class="ntf-fullscreen-title">${D(e.title||`Notification`)}</h2>
      ${e.body?`<p class="ntf-fullscreen-body">${D(e.body)}</p>`:``}
      ${i?`<div class="ntf-detail-list">${i}</div>`:``}
      <div class="ntf-fullscreen-time">${fe(e.created_at||Date.now())}</div>
      <div class="ntf-fullscreen-actions">
        ${t.url?`<a class="btn btn-primary" href="${D(t.url)}">Open</a>`:``}
        ${oe(e.subject)?`<button class="btn btn-primary ntf-goto-btn">Go to page →</button>`:``}
        <button class="btn btn-secondary ntf-fullscreen-dismiss">Dismiss</button>
      </div>
    </div>`,document.body.appendChild(a);let o=()=>a.remove();a.querySelector(`.ntf-fullscreen-close`).onclick=o,a.querySelector(`.ntf-fullscreen-dismiss`).onclick=o,a.addEventListener(`click`,e=>{e.target===a&&o()}),document.addEventListener(`keydown`,function e(t){t.key===`Escape`&&(o(),document.removeEventListener(`keydown`,e))});let s=a.querySelector(`.ntf-goto-btn`);s&&(s.onclick=()=>{let t=oe(e.subject);t&&window.__appNav&&(o(),window.__appNav(t))})}var pe=window.location.hostname!==`localhost`&&window.location.hostname!==`127.0.0.1`?`/api`:`http://localhost:5000/api`,me=()=>({"Content-Type":`application/json`,Authorization:`Bearer ${localStorage.getItem(`auth_token`)||``}`}),k=e=>String(e??``).replace(/[&<>"]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`})[e]),he=`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.7 4.6L18.3 8 13.7 9.7 12 14l-1.7-4.3L5.7 8l4.6-1.4L12 2zm6.5 9l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4zM6 13l.8 2 2 .8-2 .8L6 19l-.8-2-2-.8 2-.8L6 13z"/></svg>`,ge=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>`,_e=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>`,ve=`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7L8 5z"/></svg>`;function ye(e){let t=k(e).replace(/\*\*(.+?)\*\*/g,`<strong>$1</strong>`),n=t.split(`
`),r=``,i=!1;for(let e of n){let t=e.trim();/^[-*•]\s+/.test(t)?(i||=(r+=`<ul>`,!0),r+=`<li>${t.replace(/^[-*•]\s+/,``)}</li>`):(i&&=(r+=`</ul>`,!1),t&&(r+=`<p>${t}</p>`))}return i&&(r+=`</ul>`),r||`<p>${t}</p>`}function be(e){return e.embed?`<div class="ai-video">
      <div class="ai-video-frame"><iframe src="${k(e.embed)}" title="${k(e.title)}" frameborder="0" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>
      <div class="ai-video-title"><span class="ai-yt">${ve}</span>${k(e.title)}</div>
    </div>`:e.search?`<a class="ai-video ai-video--link" href="${k(e.search)}" target="_blank" rel="noopener">
      <span class="ai-yt ai-yt--lg">${ve}</span>
      <span class="ai-video-link-text"><b>${k(e.title)}</b><span>Watch solution videos on YouTube ↗</span></span>
    </a>`:`<div class="ai-video ai-video--empty">
    <div class="ai-video-title"><span class="ai-yt">${ve}</span>${k(e.title)}</div>
    <div class="ai-video-note">Video coming soon.</div>
  </div>`}var xe=!1,Se=[];function Ce(){if(xe||document.getElementById(`ai-assistant-fab`))return;xe=!0;let e=document.createElement(`div`);e.id=`ai-assistant-root`,e.innerHTML=`
    <button id="ai-assistant-fab" class="ai-fab" type="button" title="AI Solution Assistant" aria-label="Open AI Solution Assistant">
      <span class="ai-fab-icon">${he}</span>
      <span class="ai-fab-label">AI Assistant</span>
    </button>
    <div id="ai-assistant-panel" class="ai-panel" role="dialog" aria-modal="true" aria-label="AI Solution Assistant">
      <div class="ai-panel-head">
        <div class="ai-panel-id">
          <span class="ai-panel-avatar">${he}</span>
          <div class="ai-panel-meta">
            <span class="ai-panel-title">AI Solution Assistant</span>
            <span class="ai-panel-status"><span class="ai-panel-dot"></span>Online · powered by AI</span>
          </div>
        </div>
        <button class="ai-panel-close" type="button" aria-label="Close assistant">${ge}</button>
      </div>
      <div class="ai-panel-body" id="ai-panel-body"></div>
      <form class="ai-panel-input" id="ai-panel-form">
        <input id="ai-panel-text" type="text" autocomplete="off"
          placeholder="Describe the problem, e.g. CCTV shows no signal…" />
        <button type="submit" class="ai-send-btn" aria-label="Send message">${_e}</button>
      </form>
    </div>`,document.body.appendChild(e);let t=e.querySelector(`#ai-assistant-fab`),n=e.querySelector(`#ai-assistant-panel`),r=e.querySelector(`#ai-panel-body`),i=e.querySelector(`#ai-panel-form`),a=e.querySelector(`#ai-panel-text`),o=()=>{r.scrollTop=r.scrollHeight},s=(e,t)=>{let n=document.createElement(`div`);return n.className=`ai-msg ai-msg--${e}`,n.innerHTML=t,r.appendChild(n),o(),n},c=()=>{r.childElementCount||s(`assistant`,`<p>Hi 👋 I'm your service assistant. Describe the problem you're facing on site and I'll walk you through the fix and point you to a solution video.</p>
      <div class="ai-suggests">
        ${[`CCTV shows no signal`,`View CCTV on mobile`,`Weak WiFi at site`,`Door lock not opening`].map(e=>`<button type="button" class="ai-suggest" data-q="${k(e)}">${k(e)}</button>`).join(``)}
      </div>`)},l=()=>n.classList.contains(`ai-panel--open`),u=()=>{n.classList.add(`ai-panel--open`),t.classList.add(`ai-fab--hidden`),c(),setTimeout(()=>a.focus(),60)},d=()=>{n.classList.remove(`ai-panel--open`),t.classList.remove(`ai-fab--hidden`)};t.addEventListener(`click`,()=>l()?d():u()),e.querySelector(`.ai-panel-close`).addEventListener(`click`,d),document.addEventListener(`keydown`,e=>{e.key===`Escape`&&l()&&d()}),r.addEventListener(`click`,e=>{let t=e.target.closest(`.ai-suggest`);t&&(a.value=t.dataset.q,f())});async function f(){let e=a.value.trim();if(!e)return;a.value=``,s(`user`,`<p>${k(e)}</p>`),Se.push({role:`user`,content:e});let t=s(`assistant`,`<div class="ai-typing"><span></span><span></span><span></span></div>`);try{let e=await fetch(`${pe}/ai/assistant`,{method:`POST`,headers:me(),body:JSON.stringify({messages:Se})}),n=await e.json().catch(()=>({}));if(!e.ok)throw Error(n.error||`Request failed`);Se.push({role:`assistant`,content:n.answer||``});let r=(n.videos||[]).map(be).join(``);t.innerHTML=ye(n.answer||`No answer.`)+r}catch(e){t.innerHTML=`<p class="ai-error">${k(e.message||`Something went wrong. Please try again.`)}</p>`}o()}i.addEventListener(`submit`,e=>{e.preventDefault(),f()})}var we=new URL(`/assets/logo-Cuxe_Kd5.png`,``+import.meta.url).href,A=window.location.hostname!==`localhost`&&window.location.hostname!==`127.0.0.1`?`/api`:`http://localhost:5000/api`,j=()=>({Authorization:`Bearer ${localStorage.getItem(`auth_token`)||``}`}),M=null,Te=!1;document.addEventListener(`click`,e=>{if(!e.target.closest(`#logout-btn`)||document.getElementById(`logout-confirm-modal`))return;let t=document.createElement(`div`);t.id=`logout-confirm-modal`,t.className=`modal-overlay`,t.innerHTML=`
    <div class="modal" style="max-width:360px;">
      <div class="modal-body" style="padding:32px;text-align:center;">
        <div style="width:60px;height:60px;border-radius:50%;background:rgba(239,68,68,0.12);color:var(--danger,#ef4444);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </div>
        <h3 style="margin:0 0 8px;font-family:var(--font-display);">Sign Out?</h3>
        <p style="color:var(--text-soft);font-size:0.9rem;margin:0 0 24px;line-height:1.5;">You'll be returned to the login screen.</p>
        <div style="display:flex;gap:12px;">
          <button class="btn btn-secondary" id="logout-cancel" style="flex:1;">Cancel</button>
          <button class="btn btn-primary" id="logout-confirm" style="flex:1;background:var(--danger,#ef4444);border-color:var(--danger,#ef4444);">Sign Out</button>
        </div>
      </div>
    </div>`,document.body.appendChild(t);let n=()=>t.remove();t.querySelector(`#logout-cancel`).onclick=n,t.addEventListener(`click`,e=>{e.target===t&&n()}),t.querySelector(`#logout-confirm`).onclick=async()=>{let e=t.querySelector(`#logout-confirm`);e.disabled=!0,e.textContent=`Signing out…`,await x(),location.reload()}});function Ee({user:t,role:r,activePage:i,navItems:a,onNav:o,pageContent:c}){let l=document.getElementById(`app`),u=t?.user_metadata?.full_name||t?.email?.split(`@`)[0]||`User`,d=localStorage.getItem(`theme`)||`light`,f=l.querySelector(`.portal-layout`);if(f&&f.dataset.role===r){let e=document.getElementById(`sidebar-nav`),t=e?e.scrollTop:0;De(a,i,o),e&&(e.scrollTop=t);let n=document.getElementById(`sidebar`),r=document.getElementById(`sidebar-overlay`),s=()=>{n?.classList.remove(`open`),r?.classList.remove(`active`)};s(),document.querySelectorAll(`.nav-item`).forEach(e=>e.addEventListener(`click`,s)),Oe(c,a,i);return}if(l.innerHTML=`
    <div class="portal-layout" data-role="${r}">
      <div class="portal-mesh bg-mesh" aria-hidden="true">
        <span class="portal-mesh-1 m1"></span>
        <span class="portal-mesh-2 m2"></span>
        <span class="portal-mesh-3 m3"></span>
        <span class="portal-mesh-4 m4"></span>
      </div>
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-logo">
          <div class="sidebar-logo-mark">
            <img src="${we}" alt="" onerror="this.style.display='none';this.parentElement.textContent='N'"/>
          </div>
          <span class="logo-text">
            <b>NEST Portal</b>
            <small>Networking Experts</small>
          </span>
        </div>
        <nav class="sidebar-nav" id="sidebar-nav"></nav>
        <div class="sidebar-footer">
          <div class="user-info">
            <div class="user-avatar">${n(u)}</div>
            <div class="user-details">
              <div class="user-name">${u}</div>
              <div class="user-role">${r}</div>
            </div>
            <button class="logout-btn" id="logout-btn" title="Sign Out">${s.logout}</button>
          </div>
        </div>
      </aside>

      <div class="main-content">
        <div class="topbar">
          <button class="menu-toggle icon-btn" id="menu-toggle" aria-label="Toggle navigation">${s.menu}</button>
          <div class="topbar-title" id="topbar-title"></div>
          <div id="topbar-actions" class="topbar-actions">
            <div class="global-search-wrap">
              <label class="topbar-search" for="portal-nav-search">
                ${s.search}
                <input id="portal-nav-search" type="search" placeholder="Search tickets, customers, pages…" autocomplete="off" />
                <kbd class="search-kbd">/</kbd>
              </label>
              <div class="global-search-results" id="global-search-results" style="display:none;"></div>
            </div>
            <div class="notif-bell-wrap">
              <button class="icon-btn" id="notif-bell" title="Notifications">
                ${s.bell}
                <span class="notif-badge" id="notif-badge" style="display:none;"></span>
              </button>
              <div class="notif-dropdown" id="notif-dropdown" style="display:none;"></div>
            </div>
            <button class="icon-btn theme-toggle-btn" title="Toggle Theme">${d===`dark`?s.sun:s.moon}</button>
          </div>
        </div>
        <div class="page-content" id="page-content"></div>
      </div>
    </div>`,De(a,i,o),ke(o,r),Ae(o),Ce(),!document.getElementById(`global-refresh-fab`)){let e=document.createElement(`button`);e.id=`global-refresh-fab`,e.className=`global-refresh-fab`,e.title=`Refresh page`,e.setAttribute(`aria-label`,`Refresh page`),e.innerHTML=`<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="rfab-sphere" cx="38%" cy="32%" r="65%" fx="38%" fy="32%">
          <stop offset="0%" stop-color="#a78bfa"/>
          <stop offset="55%" stop-color="#6d28d9"/>
          <stop offset="100%" stop-color="#3b0764"/>
        </radialGradient>
        <radialGradient id="rfab-shine" cx="40%" cy="28%" r="45%">
          <stop offset="0%" stop-color="white" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="white" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="18" cy="18" r="17" fill="url(#rfab-sphere)"/>
      <circle cx="18" cy="18" r="17" fill="url(#rfab-shine)"/>
      <circle cx="18" cy="18" r="17" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
      <path d="M11 18a7 7 0 0 1 12.12-4.77" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-opacity="0.95"/>
      <path d="M25 18a7 7 0 0 1-12.12 4.77" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-opacity="0.95"/>
      <polyline points="23.5,10 24,14.5 19.5,14.5" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.95"/>
      <polyline points="12.5,26 12,21.5 16.5,21.5" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.95"/>
    </svg>`,document.body.appendChild(e),e.addEventListener(`click`,()=>{typeof window.__softRefresh==`function`?window.__softRefresh():location.reload()})}l.querySelector(`.theme-toggle-btn`).addEventListener(`click`,e);let p=document.getElementById(`sidebar`),m=document.getElementById(`sidebar-overlay`),h=document.getElementById(`menu-toggle`),g=()=>{p.classList.remove(`open`),m.classList.remove(`active`)};h.onclick=()=>{p.classList.add(`open`),m.classList.add(`active`)},m.onclick=g,document.querySelectorAll(`.nav-item`).forEach(e=>e.addEventListener(`click`,g)),Oe(c,a,i)}function De(e,t,n){let r=document.getElementById(`sidebar-nav`);r.innerHTML=e.map(e=>{if(e.type===`section`)return`<div class="nav-section">${e.label}</div>`;let n=e.id===t?`active`:``,r=e.badge?`<span class="nav-badge">${e.badge}</span>`:``;return`<div class="nav-item ${n}" data-nav="${e.id}">
      <span class="nav-icon">${e.icon}</span>
      <span style="flex:1">${e.label}</span>
      ${r}
    </div>`}).join(``),r.querySelectorAll(`[data-nav]`).forEach(e=>{e.addEventListener(`click`,()=>n(e.dataset.nav))})}function Oe(e,t,n){let r=t.find(e=>e.id===n)?.label||``,i=n===`dashboard`?`Live overview of your operations`:n===`notifications`?`Alerts, assignments and updates`:n===`profile`?`Account details and preferences`:`NEST service portal`;document.getElementById(`topbar-title`).innerHTML=`<h1>${r}</h1><p>${i}</p>`;let a=document.getElementById(`page-content`);a.innerHTML=``,a.scrollTop=0,typeof e==`function`?e(a):a.innerHTML=e||``}function ke(e,t){let n=document.getElementById(`portal-nav-search`),r=document.getElementById(`global-search-results`);if(!n||!r)return;let i=e=>String(e??``).replace(/[&<>"]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`})[e]),a=()=>[...document.querySelectorAll(`#sidebar-nav .nav-item[data-nav]`)].map(e=>({id:e.dataset.nav,label:(e.querySelector(`span:nth-child(2)`)?.textContent||e.textContent||``).trim(),icon:e.querySelector(`.nav-icon`)?.innerHTML||``})),o=null,c=!1,l=async()=>{if(!(o||c)){c=!0;try{let{data:e}=await y.from(`inquiries`).select(`id,ticket_no,full_name,phone,service_item,status`).order(`created_at`,{ascending:!1});o=Array.isArray(e)?e:[]}catch{o=[]}c=!1}},u=()=>{r.style.display=`block`},d=()=>{r.style.display=`none`},f=t=>{let c=t.toLowerCase(),l=a().filter(e=>e.label.toLowerCase().includes(c)).slice(0,6),f=(o||[]).filter(e=>(e.ticket_no||``).toLowerCase().includes(c)||(e.full_name||``).toLowerCase().includes(c)||(e.phone||``).toLowerCase().includes(c)||(e.service_item||``).toLowerCase().includes(c)).slice(0,6);if(!c){d();return}if(!l.length&&!f.length){r.innerHTML=`<div class="gs-empty">No results for "${i(t)}"${o?``:` — still loading…`}</div>`,u();return}r.innerHTML=`
      ${l.length?`<div class="gs-group"><div class="gs-group-label">Pages</div>${l.map(e=>`
        <button class="gs-item" data-type="page" data-id="${i(e.id)}">
          <span class="gs-ico">${e.icon}</span><span class="gs-text">${i(e.label)}</span>
        </button>`).join(``)}</div>`:``}
      ${f.length?`<div class="gs-group"><div class="gs-group-label">Service Requests</div>${f.map(e=>`
        <button class="gs-item" data-type="req" data-id="${i(e.id)}">
          <span class="gs-ico">${s.ticket}</span>
          <span class="gs-text"><b>${i(e.full_name||`Client`)}</b><small>${i(e.ticket_no||``)}${e.service_item?` · `+i(e.service_item):``}</small></span>
          <span class="gs-badge">${i(e.status||``)}</span>
        </button>`).join(``)}</div>`:``}
    `,u(),r.querySelectorAll(`.gs-item`).forEach(t=>t.onclick=()=>{let r=t.dataset.type;if(n.value=``,d(),r===`page`)e(t.dataset.id);else{try{localStorage.setItem(`search_focus_ticket`,t.dataset.id)}catch{}e(`all-tickets`)}})},p=null;n.addEventListener(`input`,()=>{let e=n.value.trim();l().then(()=>{n.value.trim()===e&&f(e)}),clearTimeout(p),p=setTimeout(()=>f(e),120)}),n.addEventListener(`focus`,()=>{l(),n.value.trim()&&f(n.value.trim())}),n.addEventListener(`keydown`,e=>{e.key===`Escape`&&(n.value=``,d(),n.blur())}),document.addEventListener(`click`,e=>{e.target.closest(`.global-search-wrap`)||d()}),document.addEventListener(`keydown`,e=>{e.key===`/`&&document.activeElement!==n&&!/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||``)&&(e.preventDefault(),n.focus())})}function Ae(e){let t=document.getElementById(`notif-bell`),n=document.getElementById(`notif-badge`),r=document.getElementById(`notif-dropdown`);if(!t||!n||!r)return;let i=e=>String(e??``).replace(/[&<>"]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`})[e]),a=e=>{let t=new Date(e);return isNaN(t)?``:t.toLocaleString(`en-IN`,{day:`2-digit`,month:`short`,hour:`2-digit`,minute:`2-digit`})},o=e=>{e>0?(n.textContent=e>99?`99+`:String(e),n.style.display=`flex`):n.style.display=`none`},s=async()=>{try{o((await(await fetch(`${A}/notifications/unread-count`,{headers:j()})).json()).unread||0)}catch{}},c=t=>{if(!t.length){r.innerHTML=`<div class="notif-empty">No notifications yet</div>`;return}r.innerHTML=`
      <div class="notif-head"><b>Notifications</b><button class="notif-link" id="notif-readall">Mark all read</button></div>
      <div class="notif-list">
        ${t.slice(0,12).map(e=>`
          <div class="notif-item ${e.read_at?``:`unread`}" data-id="${e.id}">
            <div class="notif-item-title">${i(e.title||`Update`)}</div>
            <div class="notif-item-body">${i(e.body||``)}</div>
            <div class="notif-item-time">${a(e.created_at)}</div>
          </div>`).join(``)}
      </div>
      <div class="notif-foot"><button class="notif-link" id="notif-viewall">View all notifications</button></div>`,r.querySelector(`#notif-readall`).onclick=async e=>{e.stopPropagation();try{await fetch(`${A}/notifications/read-all`,{method:`POST`,headers:j()})}catch{}l(),s()},r.querySelector(`#notif-viewall`).onclick=t=>{t.stopPropagation(),r.style.display=`none`,e(`notifications`)},r.querySelectorAll(`.notif-item`).forEach(e=>e.onclick=async()=>{let n=t.find(t=>String(t.id)===String(e.dataset.id));if(n&&(r.style.display=`none`,O(n)),e.classList.contains(`unread`)){try{await fetch(`${A}/notifications/${e.dataset.id}/read`,{method:`POST`,headers:j()})}catch{}e.classList.remove(`unread`),s()}})},l=async()=>{r.style.display=`block`,r.innerHTML=`<div class="notif-empty">Loading…</div>`;try{let e=await(await fetch(`${A}/notifications`,{headers:j()})).json();c(e.items||[]),o(e.unread||0)}catch{r.innerHTML=`<div class="notif-empty">Could not load</div>`}};if(t.onclick=e=>{e.stopPropagation(),r.style.display===`block`?r.style.display=`none`:l()},Te||=(document.addEventListener(`click`,e=>{let t=document.getElementById(`notif-dropdown`),n=document.getElementById(`notif-bell`);t&&n&&!t.contains(e.target)&&!n.contains(e.target)&&(t.style.display=`none`)}),!0),M){try{M()}catch{}M=null}M=g(null,()=>{s(),document.getElementById(`notif-dropdown`)?.style.display===`block`&&l()}),s()}var je=class{constructor(e,t=[],n={}){if(this.container=document.getElementById(e),!this.container)throw Error(`Container #${e} not found`);let r=window.matchMedia(`(max-width: 767px)`).matches;this.ads=t.filter(e=>{if(!e||!e.url)return!1;let t=e.device_target||`both`;return!(t===`mobile`&&!r||t===`desktop`&&r)}),this.currentIndex=0,this.autoRotateMs=n.autoRotateMs??5e3,this.rotateTimer=null,this.isPlaying=!0,this.render(),this.setupEventListeners(),this.startAutoRotate()}render(){this.container.innerHTML=`
      <div class="ad-carousel">
        <div class="ad-carousel__media-container">
          ${this.ads.length===0?`<div class="ad-carousel__empty">No ads available</div>`:``}
          <div class="ad-carousel__media-slot"></div>
        </div>

        ${this.ads.length>1?`
          <div class="ad-carousel__controls">
            <button class="ad-carousel__nav ad-carousel__nav--prev" aria-label="Previous ad">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M12 4L6 10l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
            <div class="ad-carousel__indicators">
              ${this.ads.map((e,t)=>`<div class="ad-carousel__indicator ${t===0?`active`:``}" data-index="${t}"></div>`).join(``)}
            </div>
            <button class="ad-carousel__nav ad-carousel__nav--next" aria-label="Next ad">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M8 4l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        `:``}

        <div class="ad-carousel__play-pause">
          <button class="ad-carousel__play-btn" aria-label="Toggle auto-rotate">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13 8A5 5 0 1 1 3 8a5 5 0 0 1 10 0ZM6.5 5.5v5l3.5-2.5z"/>
            </svg>
          </button>
        </div>
      </div>
    `,this.updateMedia()}updateMedia(){if(this.ads.length===0)return;let e=this.ads[this.currentIndex],t=this.container.querySelector(`.ad-carousel__media-slot`);(e.kind||`image`).toLowerCase()===`video`?t.innerHTML=`
        <video class="ad-carousel__video" autoplay muted playsinline loop>
          <source src="${e.url}" />
        </video>
      `:t.innerHTML=`
        <img class="ad-carousel__image" src="${e.url}" alt="Ad" loading="lazy" />
      `,this.container.querySelectorAll(`.ad-carousel__indicator`).forEach((e,t)=>{e.classList.toggle(`active`,t===this.currentIndex)})}setupEventListeners(){let e=this.container.querySelector(`.ad-carousel__nav--prev`),t=this.container.querySelector(`.ad-carousel__nav--next`),n=this.container.querySelector(`.ad-carousel__play-btn`),r=this.container.querySelectorAll(`.ad-carousel__indicator`);e?.addEventListener(`click`,()=>this.prev()),t?.addEventListener(`click`,()=>this.next()),n?.addEventListener(`click`,()=>this.toggleAutoRotate()),r.forEach(e=>{e.addEventListener(`click`,()=>{this.currentIndex=parseInt(e.dataset.index),this.updateMedia(),this.resetAutoRotate()})}),this.container.addEventListener(`mouseenter`,()=>this.pauseAutoRotate()),this.container.addEventListener(`mouseleave`,()=>this.resumeAutoRotate())}prev(){this.currentIndex=(this.currentIndex-1+this.ads.length)%this.ads.length,this.updateMedia(),this.resetAutoRotate()}next(){this.currentIndex=(this.currentIndex+1)%this.ads.length,this.updateMedia(),this.resetAutoRotate()}toggleAutoRotate(){this.isPlaying?this.pauseAutoRotate():this.resumeAutoRotate()}pauseAutoRotate(){this.rotateTimer&&=(clearTimeout(this.rotateTimer),null),this.isPlaying=!1,this.updatePlayButton()}resumeAutoRotate(){this.isPlaying=!0,this.startAutoRotate(),this.updatePlayButton()}startAutoRotate(){!this.isPlaying||this.ads.length<=1||(this.rotateTimer=setInterval(()=>{this.currentIndex=(this.currentIndex+1)%this.ads.length,this.updateMedia()},this.autoRotateMs))}resetAutoRotate(){this.rotateTimer&&clearInterval(this.rotateTimer),this.startAutoRotate()}updatePlayButton(){let e=this.container.querySelector(`.ad-carousel__play-btn`);e&&(this.isPlaying?e.innerHTML=`
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13 8A5 5 0 1 1 3 8a5 5 0 0 1 10 0ZM6.5 5.5v5l3.5-2.5z"/>
        </svg>
      `:e.innerHTML=`
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13 8A5 5 0 1 1 3 8a5 5 0 0 1 10 0ZM5.5 5.5v5l4-2.5z"/>
        </svg>
      `)}destroy(){this.rotateTimer&&clearInterval(this.rotateTimer),this.container.innerHTML=``}updateAds(e){let t=window.matchMedia(`(max-width: 767px)`).matches;this.ads=e.filter(e=>{if(!e||!e.url)return!1;let n=e.device_target||`both`;return!(n===`mobile`&&!t||n===`desktop`&&t)}),this.currentIndex=0,this.render(),this.setupEventListeners(),this.startAutoRotate()}},N=new URL(`/assets/logo-Cuxe_Kd5.png`,``+import.meta.url).href,Me=window.location.hostname!==`localhost`&&window.location.hostname!==`127.0.0.1`?`/api`:`http://localhost:5000/api`,Ne=`8899133144`,Pe=`+91 88991 33144`,Fe=`tel:+91${Ne}`,Ie=`https://wa.me/91${Ne}?text=Hello%20Networking%20Experts%2C%20I%20need%20help%20with%20a%20service%20request.`;async function P(e,t){try{let n=await fetch(`${Me}${e}`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(t)}),r=await n.json().catch(()=>({}));return n.ok?{ok:!0,...r}:{ok:!1,error:r.error||`Request failed`}}catch(e){return{ok:!1,error:e.message||`Network request failed`}}}var Le=e=>P(`/otp/send`,{phone:e}),Re=(e,t)=>P(`/otp/verify`,{phone:e,otp:t}),ze=e=>P(`/otp/resend`,{phone:e}),Be=`nest_landing_ads_v2`,Ve=600*1e3,He=`nest_landing_bootstrap_v1`,Ue=600*1e3;function We(){let e=new Date;return`NE-${String(e.getFullYear()).slice(-2)}${String(e.getMonth()+1).padStart(2,`0`)}${String(e.getDate()).padStart(2,`0`)}-${String(Math.floor(1e3+Math.random()*9e3))}`}var F=[`open`,`assigned`,`in_progress`,`resolved`],I={pending:`Received`,open:`Received`,assigned:`Assigned`,in_progress:`In Progress`,resolved:`Resolved`,closed:`Resolved`};function L(e){return e===`closed`?`resolved`:e||`open`}var Ge=[{value:`internet-down`,label:`Internet down`},{value:`slow-connection`,label:`Slow connection`},{value:`wifi-issue`,label:`Wi-Fi issue`},{value:`cctv-not-working`,label:`CCTV not working`},{value:`camera-offline`,label:`Camera offline`},{value:`hardware-repair`,label:`Hardware repair`},{value:`software-issue`,label:`Software issue`},{value:`new-installation`,label:`New installation`},{value:`other`,label:`Other (specify below)`}],Ke={value:`other`,label:`Other (specify below)`};function qe(e){return String(e||``).toLowerCase().trim().replace(/[^a-z0-9]+/g,`-`).replace(/^-+|-+$/g,``)||`option`}function Je(){try{let e=JSON.parse(localStorage.getItem(Be)||`null`);return!e||!Array.isArray(e.ads)||!e.ads.length||Date.now()-Number(e.savedAt||0)>Ve?[]:e.ads.map(e=>({...e,url:Qe(e.url)})).filter(e=>e.url)}catch{return[]}}function Ye(e){try{localStorage.setItem(Be,JSON.stringify({savedAt:Date.now(),ads:e}))}catch{}}function Xe(){try{let e=JSON.parse(localStorage.getItem(He)||`null`);return!e||Date.now()-Number(e.savedAt||0)>Ue?null:e.data||null}catch{return null}}function Ze(e){try{localStorage.setItem(He,JSON.stringify({savedAt:Date.now(),data:e}))}catch{}}function Qe(e){let t=String(e||``).trim();return t?/^(https?:)?\/\//i.test(t)||t.startsWith(`/`)?t:/^[A-Za-z0-9._-]+\.(png|jpe?g|gif|webp|mp4|webm|ogg)$/i.test(t)?`/uploads/${t}`:``:``}function $e(e){if(!e?.url)return Promise.resolve();let t=(e.kind||`image`).toLowerCase()===`video`;return new Promise(n=>{let r=()=>{clearTimeout(i),n()},i=setTimeout(n,8e3);if(t){let t=document.createElement(`video`);t.muted=!0,t.preload=`metadata`,t.playsInline=!0,t.onloadeddata=r,t.onloadedmetadata=r,t.onerror=r,t.src=e.url,t.load();return}let a=new Image;a.onload=r,a.onerror=r,a.src=e.url,a.decode&&a.decode().then(r).catch(()=>{})})}async function et(e){await Promise.all((e||[]).map($e))}function tt({maxWaitMs:e=8e3}={}){return new Promise((t,n)=>{if(!navigator.geolocation)return n(Error(`Geolocation not supported`));let r=!1,i=()=>{navigator.geolocation.getCurrentPosition(e=>{r||(r=!0,t(e))},e=>{r||(r=!0,n(e))},{enableHighAccuracy:!1,timeout:6e3,maximumAge:6e4})},a=setTimeout(i,e);navigator.geolocation.getCurrentPosition(e=>{clearTimeout(a),r||(r=!0,t(e))},()=>{clearTimeout(a),r||i()},{enableHighAccuracy:!0,timeout:e,maximumAge:0})})}async function nt(e,t){return(await(await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e}&lon=${t}&zoom=18&addressdetails=1`)).json()).display_name||``}function rt(e,t){return`https://www.google.com/maps?q=${encodeURIComponent(`${e},${t}`)}`}function it(t,n){let i=new URLSearchParams(window.location.search),a=i.get(`tab`),c=i.get(`ticket`)||``,l=(i.get(`phone`)||``).replace(/^\+91/,``).replace(/\D/g,``),u=window.location.pathname.match(/^\/f\/([^/?#]+)/)?.[1]||``,d=(i.get(`token`)||i.get(`feedback`)||i.get(`f`)||u||``).trim(),f=Xe(),p=Je(),m={mode:a===`track`||d?`track`:`new`,step:1,phone:``,otp:``,captcha:R(),locationMode:`gps`,locationValue:``,coords:null,customerName:``,billNo:``,preferredTime:`Morning (10 AM - 1 PM)`,otherIssue:``,description:``,ticketNo:``,trackTicketNo:c,trackPhone:l,trackResult:null,trackList:null,trackLoading:!1,isFeedbackPage:!!d,feedbackToken:d,feedbackLoading:!!d,feedbackError:``,complaintTicketNo:``,complaintPhone:``,complaintText:``,complaintLoading:!1,complaintSubmitted:!1,reopenText:``,reopenLoading:!1,reopenSubmitted:!1,reopenButtonEnabled:f?.reopenButtonEnabled!==!1,reopenLimit:typeof f?.reopenLimit==`number`?f.reopenLimit:2,ads:f?.ads||p,adsLoading:!1,popupAds:f?.popupAds||[],popupEnabled:f?.popupEnabled!==!1,adIndex:0,_adTimer:null,issueOptions:Array.isArray(f?.issueOptions)&&f.issueOptions.length?f.issueOptions:Ge,issueValue:``};function h(){if(m.isFeedbackPage){g();return}let e=(localStorage.getItem(`theme`)||`light`)===`dark`?s.sun:s.moon;t.innerHTML=`
      <style>
        @media (max-width: 640px) { .srf-nav-title { display: none !important; } }
        @keyframes srfAdZoom {
          0% { transform: scale(1); }
          100% { transform: scale(1.08); }
        }
        @keyframes srfFadeUp {
          0% { opacity: 0; transform: translateY(15px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      </style>
      <div class="srf-page">
        ${m.adsLoading?`
          <div class="srf-loading-screen" role="status" aria-live="polite">
            <div class="srf-loading-card">
              <img src="${N}" alt="Networking Experts" class="srf-loading-logo"
                   onerror="this.style.display='none'"/>
              <span class="srf-loading-spinner"></span>
              <div class="srf-loading-title">Loading service portal</div>
            </div>
          </div>
        `:``}
        <div class="bg-mesh" aria-hidden="true"><span class="m1"></span><span class="m2"></span><span class="m3"></span><span class="m4"></span></div>

        <nav class="srf-nav">
          <div class="srf-brand-wrap">
            <div class="srf-logo-mark">
              <img src="${N}" alt="" onerror="this.style.display='none';this.parentElement.textContent='N'"/>
            </div>
            <span class="srf-logo-word"><b>Networking Experts</b><small>Service Portal</small></span>
          </div>
          <div class="srf-nav-actions">
            <button class="srf-icon-btn theme-toggle-btn" title="Toggle theme">${e}</button>
            <button class="staff-btn srf-staff-btn" title="Staff Login">${s.staff}<span>Staff login</span></button>
          </div>
        </nav>

        <section class="srf-top-banner" style="max-width:1000px; margin:0 auto; padding: 24px 20px 0; text-align:center;">
          <div class="srf-badge" style="margin: 0 auto 16px;">${s.shield}<span>Verified Service Request</span></div>
          <h1 class="srf-title" style="text-align:center; margin-bottom:18px;">Need help?<br/><span class="srf-grad">We'll be there in minutes.</span></h1>
          <p class="srf-sub" style="margin: 0 auto 32px; text-align:center; max-width:600px;">Raise a service request in three quick steps. We'll send a one-time code by SMS, take your details, and dispatch the right technician.</p>
        </section>

        <main class="srf-main">
          <section class="srf-intro">
            ${m.ads.length>0?`
              <div id="srf-ad-slot"></div>
            `:`
              <div class="promo">
                <div class="grid-pat"></div>
                <div class="promo-top">
                  <span class="promo-tag">${s.shield}<span style="margin-left:6px">NEST Smart Security</span></span>
                </div>
                <div class="promo-body">
                  <h3>CCTV, networking &amp; automation — installed and supported by experts.</h3>
                  <p>From a single camera to a full smart-security setup, our certified technicians have you covered across the valley.</p>
                </div>
                <div class="promo-stats">
                  <div class="ps"><b>12 hr</b><span>Avg. resolution</span></div>
                  <div class="ps"><b>4,200+</b><span>Jobs completed</span></div>
                  <div class="ps"><b>4.9★</b><span>Customer rating</span></div>
                </div>
              </div>
            `}
          </section>

          <section class="srf-card-wrap">
            <div class="srf-req-card glass">
              <div class="srf-mode-tabs" role="tablist">
                <button class="srf-mode-tab ${m.mode===`new`?`active`:``}" data-mode="new" role="tab">
                  ${s.wrench}<span>New Request</span>
                </button>
                <button class="srf-mode-tab ${m.mode===`track`?`active`:``}" data-mode="track" role="tab">
                  ${s.search}<span>Track Request</span>
                </button>
                <button class="srf-mode-tab ${m.mode===`complaint`?`active`:``}" data-mode="complaint" role="tab">
                  ${s.shield}<span>Complaint</span>
                </button>
              </div>
              <div class="srf-req-body">
                <div id="srf-stepper-wrap">${x()}</div>
                <div class="srf-card" id="srf-card">
                  ${re()}
                </div>
              </div>
            </div>
          </section>
        </main>
        <section class="srf-contact-section">
          <div class="srf-contact-card" aria-label="Contact Networking Experts">
            <div class="srf-contact-copy">
              <span class="srf-contact-kicker">Need urgent support?</span>
              <a class="srf-contact-number" href="${Fe}">${Pe}</a>
              <span class="srf-contact-note">Direct support for service requests, billing, and technician updates.</span>
            </div>
            <div class="srf-contact-actions">
              <a class="srf-contact-action srf-contact-call" href="${Fe}" aria-label="Call Networking Experts at ${Pe}">
                <span class="srf-contact-icon">${s.phone}</span>
                <span>Call</span>
              </a>
              <a class="srf-contact-action srf-contact-whatsapp" href="${Ie}" target="_blank" rel="noopener" aria-label="Message Networking Experts on WhatsApp">
                <span class="srf-contact-icon">${s.whatsapp}</span>
                <span>WhatsApp</span>
              </a>
            </div>
          </div>
        </section>
      </div>
    `,T(),E(),b()}function g(){let e=(localStorage.getItem(`theme`)||`light`)===`dark`?s.sun:s.moon,n=m.trackResult,r=n?L(n.status):``,i=n?.feedback_rating!=null,a=n&&!i&&!m.feedbackLoading&&!m.feedbackError;t.innerHTML=`
      <div class="srf-page srf-feedback-page">
        <div class="bg-mesh" aria-hidden="true"><span class="m1"></span><span class="m2"></span><span class="m3"></span><span class="m4"></span></div>

        <nav class="srf-nav">
          <img src="${N}" alt="Networking Experts" class="srf-logo"
               onerror="this.outerHTML='<span class=\\'srf-brand\\'>Networking Experts</span>'"/>
          <div class="srf-nav-actions">
            <button class="srf-icon-btn theme-toggle-btn" title="Toggle theme">${e}</button>
            <button class="srf-icon-btn" id="srf-feedback-home" title="Service portal">${s.home||s.wrench}</button>
          </div>
        </nav>

        <main style="min-height:calc(100vh - 96px);display:flex;align-items:center;justify-content:center;padding:32px 18px 56px;">
          <section class="srf-card" style="width:min(100%,620px);padding:0;overflow:hidden;">
            <div style="padding:28px 28px 22px;background:linear-gradient(135deg,rgba(16,185,129,.10),rgba(255,255,255,.45));border-bottom:1px solid var(--border);">
              <div class="srf-badge" style="margin-bottom:14px;">${s.shield}<span>Secure Feedback</span></div>
              <h1 class="srf-card-title" style="font-size:1.65rem;margin-bottom:8px;">Rate your service experience</h1>
              <p class="srf-card-sub" style="margin:0;">This page opens only from your secure payment feedback link.</p>
            </div>

            <div style="padding:28px;">
              ${m.feedbackLoading?`
                <div style="text-align:center;padding:32px 10px;">
                  <span class="srf-spin"></span>
                  <h2 class="srf-card-title" style="margin-top:18px;">Opening feedback</h2>
                  <p class="srf-card-sub">Please wait while we verify your secure link.</p>
                </div>
              `:m.feedbackError?`
                <div style="text-align:center;padding:28px 10px;">
                  <div style="width:58px;height:58px;border-radius:18px;margin:0 auto 16px;background:rgba(239,68,68,.10);color:var(--danger);display:flex;align-items:center;justify-content:center;">${s.shield}</div>
                  <h2 class="srf-card-title">Feedback link unavailable</h2>
                  <p class="srf-card-sub">${B(m.feedbackError)}</p>
                  <button class="srf-btn srf-btn-secondary" id="srf-feedback-home-2">${s.arrowLeft}<span>Open service portal</span></button>
                </div>
              `:i?`
                <div class="srf-fb-done" style="box-shadow:none;margin:0;">
                  <div class="srf-fb-done-ring">${s.star}</div>
                  <h2 style="font-weight:800;font-size:1.25rem;color:var(--text);margin:0 0 8px;">Thank you for your feedback</h2>
                  <p style="font-size:0.95rem;color:var(--text-soft);margin:0 0 8px;">You rated us <strong style="color:var(--warning)">${n.feedback_rating}/5 ★</strong></p>
                  ${n.feedback_comment?`<p style="font-size:0.88rem;color:var(--text-soft);font-style:italic;margin:0;">"${B(n.feedback_comment)}"</p>`:``}
                </div>
              `:a?`
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:22px;">
                  <div style="padding:14px;border-radius:14px;background:var(--bg-soft);border:1px solid var(--border);">
                    <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);font-weight:800;">Ticket</div>
                    <div style="margin-top:4px;font-weight:800;color:var(--text);">${B(n.ticket_no||`-`)}</div>
                  </div>
                  <div style="padding:14px;border-radius:14px;background:var(--bg-soft);border:1px solid var(--border);">
                    <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);font-weight:800;">Status</div>
                    <div style="margin-top:4px;font-weight:800;color:var(--primary);">${B(I[r]||r||`-`)}</div>
                  </div>
                  <div style="grid-column:1/-1;padding:14px;border-radius:14px;background:var(--bg-soft);border:1px solid var(--border);">
                    <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);font-weight:800;">Service</div>
                    <div style="margin-top:4px;font-weight:800;color:var(--text);">${B(n.service_item||`-`)}</div>
                    <div style="margin-top:3px;font-size:.86rem;color:var(--text-soft);">${B(n.full_name||`Customer`)}</div>
                  </div>
                </div>

                <div style="margin-bottom:20px;">
                  <div style="font-size:0.76rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Overall experience</div>
                  <div class="srf-stars" id="srf-stars" data-rating="0">
                    ${[1,2,3,4,5].map(e=>`<button type="button" class="srf-star" data-val="${e}">${s.starOutline}</button>`).join(``)}
                  </div>
                  <div id="srf-rating-label" style="font-size:0.86rem;color:var(--primary);font-weight:800;margin-top:8px;min-height:20px;"></div>
                </div>

                <div style="margin-bottom:20px;">
                  <div style="font-size:0.76rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Technician rating</div>
                  <div class="srf-stars" id="srf-stars-tech" data-rating="0">
                    ${[1,2,3,4,5].map(e=>`<button type="button" class="srf-star" data-val="${e}">${s.starOutline}</button>`).join(``)}
                  </div>
                </div>

                <div class="srf-input-wrap" style="margin-bottom:16px;">
                  <span class="srf-input-icon">${s.edit}</span>
                  <textarea id="srf-fb-comment" placeholder="Tell us about your experience..." class="srf-input" rows="4" style="padding-top:12px;padding-bottom:12px;resize:vertical;min-height:92px;"></textarea>
                </div>

                <button class="srf-btn srf-btn-primary" id="srf-fb-submit" disabled style="opacity:.5;cursor:not-allowed;">
                  <span>Submit Feedback</span> ${s.arrowRight}
                </button>
                <p style="text-align:center;font-size:.76rem;color:var(--text-dim);margin:10px 0 0;">Overall star rating is required.</p>
              `:`
                <div style="text-align:center;padding:28px 10px;">
                  <h2 class="srf-card-title">Feedback not ready</h2>
                  <p class="srf-card-sub">This secure link could not load feedback details.</p>
                </div>
              `}
            </div>
          </section>
        </main>
      </div>
    `,me()}function _(e){if(!e?.url)return;let t=(e.kind||`image`).toLowerCase()===`video`,n=document.createElement(`div`);n.className=`media-popup-overlay`,n.innerHTML=`
      <div class="media-popup-dialog" role="dialog" aria-modal="true">
        <button type="button" class="media-popup-close" aria-label="Close">${s.close}</button>
        <div class="media-popup-frame">
          ${t?`<video src="${z(e.url)}" controls autoplay muted playsinline></video>`:`<img src="${z(e.url)}" alt="${z(e.caption||`Advertisement`)}"/>`}
        </div>
        ${e.caption?`<div class="media-popup-caption">${B(e.caption)}</div>`:``}
      </div>
    `,document.body.appendChild(n);let r=()=>n.remove();n.querySelector(`.media-popup-close`).onclick=r,n.addEventListener(`click`,e=>{e.target===n&&r()})}async function v(){let e=m.popupAds.find(Boolean);!e||m.popupEnabled===!1||setTimeout(()=>_(e),500)}function b(){if(m._adTimer&&=(clearTimeout(m._adTimer),null),m._adCarousel&&m._adCarousel.destroy(),m.ads.length&&t.querySelector(`#srf-ad-slot`))try{m._adCarousel=new je(`srf-ad-slot`,m.ads,{autoRotateMs:5e3})}catch(e){console.warn(`AdCarousel mount failed:`,e)}}function ee(e){let t=Date.now(),n=window.matchMedia(`(max-width: 767px)`).matches;return(e||[]).map(e=>({...e,url:Qe(e.url)})).filter(e=>{if(!e.url||e.kind!==`image`&&e.kind!==`video`)return!1;let r=e.device_target||`both`;return!(r===`mobile`&&!n||r===`desktop`&&n||e.starts_at&&new Date(e.starts_at).getTime()>t||e.expires_at&&new Date(e.expires_at).getTime()<=t)})}async function te(){try{let e=await fetch(`${Me}/landing/bootstrap`);if(!e.ok)throw Error(`Landing bootstrap failed (${e.status})`);let t=await e.json(),n=ee(t.ads),r=n.filter(e=>(e.placement||`landing`)===`landing`);m.popupAds=n.filter(e=>e.placement===`popup_landing`),m.popupEnabled=t.popupEnabled!==!1,m.reopenButtonEnabled=t.reopenButtonEnabled!==!1,m.reopenLimit=typeof t.reopenLimit==`number`?t.reopenLimit:2;let i=new Map;(t.categories||[]).forEach(e=>{let t=String(e||``).trim();if(!t)return;let n=qe(t);i.has(n)||i.set(n,{value:n,label:t})}),m.issueOptions=i.size?[...i.values(),Ke]:Ge,m.ads=r,Ye(r),Ze({ads:r,popupAds:m.popupAds,issueOptions:m.issueOptions,popupEnabled:m.popupEnabled,reopenButtonEnabled:m.reopenButtonEnabled,reopenLimit:m.reopenLimit}),h(),et(r).catch(()=>{}),v()}catch(e){console.warn(`Could not refresh landing content:`,e)}}function x(){return m.mode===`new`?`
      <div class="srf-stepper">
        ${[1,2,3].map(e=>`
          <div class="srf-step ${m.step===e?`active`:``} ${m.step>e?`done`:``}">
            <div class="srf-step-dot">${m.step>e?s.check:e}</div>
            <span>${[`Verify`,`OTP`,`Details`][e-1]}</span>
          </div>
          ${e<3?`<div class="srf-step-line ${m.step>e?`done`:``}"></div>`:``}
        `).join(``)}
      </div>
    `:``}function ne(){t.querySelectorAll(`.srf-mode-tab`).forEach(e=>{e.classList.toggle(`active`,e.dataset.mode===m.mode)});let e=t.querySelector(`#srf-stepper-wrap`);e&&(e.innerHTML=x());let n=t.querySelector(`#srf-card`);n&&(n.innerHTML=re()),E()}function re(){return m.mode===`track`?se():m.mode===`complaint`?C():m.step===1?ie():m.step===2?S():m.step===3?ae():oe()}function ie(){return`
      <h2 class="srf-card-title">Enter your mobile number</h2>
      <p class="srf-card-sub">We'll send a one-time code to verify it's you.</p>

      <label class="srf-label" for="srf-phone">Phone number</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.phone}</span>
        <span class="srf-cc">+91</span>
        <input id="srf-phone" type="tel" inputmode="numeric" maxlength="10"
               placeholder="98765 43210" class="srf-input srf-input-cc" value="${m.phone}" />
      </div>

      <label class="srf-label" for="srf-captcha">Quick check: type these letters</label>
      <div style="display:inline-flex;gap:6px;align-items:center;margin:2px 0 8px;padding:8px 12px;border-radius:10px;background:var(--bg-soft);border:1px solid var(--border);font-size:1.05rem;font-weight:900;letter-spacing:0.22em;color:var(--primary);user-select:none;">
        ${m.captcha.code.split(``).map(e=>`<span>${e}</span>`).join(``)}
      </div>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.shield}</span>
        <input id="srf-captcha" type="text" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false"
               placeholder="Enter the letters" class="srf-input" />
        <button type="button" class="srf-input-action" id="srf-refresh-captcha" title="New question">${s.refresh}</button>
      </div>

      <button class="srf-btn srf-btn-primary" id="srf-send-otp">
        <span>Send OTP by SMS</span> ${s.arrowRight}
      </button>

      <p class="srf-fineprint">${s.shield}<span>Your number is only used to verify and contact you about this request.</span></p>
    `}function S(){return`
      <button class="srf-back" id="srf-back">${s.arrowLeft}<span>Back</span></button>
      <h2 class="srf-card-title">Enter the 6-digit code</h2>
      <p class="srf-card-sub">Sent by SMS to <strong>+91 ${at(m.phone)}</strong></p>

      <div class="srf-otp-row">
        ${Array.from({length:6}).map((e,t)=>`
          <input class="srf-otp-box" maxlength="1" inputmode="numeric" data-idx="${t}" />
        `).join(``)}
      </div>

      <button class="srf-btn srf-btn-primary" id="srf-verify-otp">
        <span>Verify & continue</span> ${s.arrowRight}
      </button>

      <button class="srf-btn-link" id="srf-resend">Resend code</button>
    `}function ae(){return`
      <h2 class="srf-card-title">Tell us what's wrong</h2>
      <p class="srf-card-sub">A few quick details so we can help fast.</p>

      <label class="srf-label" for="srf-name">Your name</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.user}</span>
        <input id="srf-name" type="text" placeholder="Full name" class="srf-input" value="${z(m.customerName)}" />
      </div>

      <label class="srf-label">Location</label>
      <div class="srf-segmented">
        <button type="button" data-mode="gps" class="srf-seg ${m.locationMode===`gps`?`active`:``}">
          ${s.crosshair}<span>Current</span>
        </button>
        <button type="button" data-mode="manual" class="srf-seg ${m.locationMode===`manual`?`active`:``}">
          ${s.edit}<span>Manual</span>
        </button>
      </div>

      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.pin}</span>
        <input id="srf-location" type="text"
               placeholder="${m.locationMode===`gps`?`Tap "Detect" to auto-fill…`:`Type your address…`}"
               class="srf-input" value="${m.locationValue}" ${m.locationMode===`gps`?`readonly`:``}/>
        ${m.locationMode===`gps`?`<button type="button" class="srf-input-action" id="srf-detect">${s.crosshair}</button>`:``}
      </div>

      ${m.coords?`
        <a href="${z(rt(m.coords.lat,m.coords.lng))}" target="_blank" rel="noopener"
           style="display:inline-flex;align-items:center;gap:6px;margin:6px 0 12px;color:var(--primary);font-size:0.78rem;font-weight:700;text-decoration:none;">
          ${s.pin}<span>Open exact pin (${Math.round(Number(m.coords.accuracy)||0)}m accuracy)</span>
        </a>
      `:``}

      <label class="srf-label" for="srf-time">Preferred Visit Time</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.clock}</span>
        <select id="srf-time" class="srf-input srf-select">
          ${[`Morning (10 AM - 1 PM)`,`Afternoon (1 PM - 4 PM)`,`Evening (4 PM - 6 PM)`,`Tomorrow Morning`,`I'm Flexible`].map(e=>`<option value="${z(e)}" ${m.preferredTime===e?`selected`:``}>${B(e)}</option>`).join(``)}
        </select>
      </div>

      <label class="srf-label" for="srf-bill">Device bill number <span class="srf-optional">(optional)</span></label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.receipt}</span>
        <input id="srf-bill" type="text" placeholder="e.g. INV-2024-001" class="srf-input" value="${z(m.billNo)}" />
      </div>

      <label class="srf-label" for="srf-issue">What's the issue?</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.wrench}</span>
        <select id="srf-issue" class="srf-input srf-select">
          <option value="">Select an issue…</option>
          ${m.issueOptions.map(e=>`
            <option value="${z(e.value)}" ${m.issueValue===e.value?`selected`:``}>
              ${B(e.label)}
            </option>
          `).join(``)}
        </select>
      </div>

      <div class="srf-input-wrap srf-other-wrap" id="srf-other-wrap" style="display:none;">
        <span class="srf-input-icon">${s.edit}</span>
        <input id="srf-other" type="text" placeholder="Describe your issue briefly" class="srf-input" value="${z(m.otherIssue)}" />
      </div>

      <label class="srf-label" for="srf-desc">Describe the problem <span class="srf-optional">(optional)</span></label>
      <div class="srf-input-wrap" style="align-items:flex-start;">
        <span class="srf-input-icon" style="margin-top:12px;">${s.edit}</span>
        <textarea id="srf-desc" rows="3" maxlength="1000"
                  placeholder="Anything our technician should know — model, when it started, what you tried, etc."
                  class="srf-input"
                  style="padding-top:12px;padding-bottom:12px;resize:vertical;min-height:84px;">${m.description?String(m.description).replace(/[<>]/g,``):``}</textarea>
      </div>

      <button class="srf-btn srf-btn-primary" id="srf-submit">
        <span>Submit request</span> ${s.arrowRight}
      </button>
    `}function oe(){return`
      <div class="srf-success">
        <div class="srf-success-ring">${s.check}</div>
        <h2 class="srf-card-title">Request received!</h2>
        <p class="srf-card-sub">Save your ticket number — you can track progress anytime from the <strong>Track Request</strong> tab.</p>

        <div class="srf-ticket-pill">
          ${s.ticket}
          <span class="srf-ticket-no" id="srf-ticket-no">${m.ticketNo}</span>
          <button type="button" class="srf-input-action" id="srf-copy-ticket" title="Copy">${s.clipboard}</button>
        </div>

        <p class="srf-fineprint" style="justify-content:center;text-align:center;">
          ${s.phone}<span>Your request has been saved with this mobile number.</span>
        </p>

        <button class="srf-btn srf-btn-primary" id="srf-track-now">
          <span>Track this request</span> ${s.arrowRight}
        </button>
        <button class="srf-btn-link" id="srf-new">Submit another request</button>
      </div>
    `}function C(){return m.complaintSubmitted?`
        <div class="srf-success">
          <div class="srf-success-ring">${s.check}</div>
          <h2 class="srf-card-title">Complaint received</h2>
          <p class="srf-card-sub">Our team has been notified and will follow up on ticket <strong>${m.complaintTicketNo}</strong> soon.</p>
          <button class="srf-btn srf-btn-primary" id="srf-complaint-another">
            <span>File another complaint</span> ${s.arrowRight}
          </button>
          <button class="srf-btn-link" id="srf-complaint-to-track">Track this ticket instead</button>
        </div>
      `:`
      <h2 class="srf-card-title">File a complaint</h2>
      <p class="srf-card-sub">Tell us what went wrong with a previous service. We verify the ticket against your mobile number before forwarding it to the team.</p>

      <label class="srf-label" for="srf-cmp-tno">Ticket number</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.ticket}</span>
        <input id="srf-cmp-tno" type="text" placeholder="NE-260506-1234" class="srf-input"
               value="${m.complaintTicketNo}" autocomplete="off"/>
      </div>

      <label class="srf-label" for="srf-cmp-phone">Phone number</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.phone}</span>
        <span class="srf-cc">+91</span>
        <input id="srf-cmp-phone" type="tel" inputmode="numeric" maxlength="10"
               placeholder="98765 43210" class="srf-input srf-input-cc" value="${m.complaintPhone}"/>
      </div>

      <label class="srf-label" for="srf-cmp-text">What's the issue?</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.edit}</span>
        <textarea id="srf-cmp-text" placeholder="Describe what went wrong — the issue came back, the technician didn't show, billing was wrong, etc." class="srf-input" rows="4" maxlength="2000" style="padding-top:12px;padding-bottom:12px;resize:vertical;min-height:100px;">${B(m.complaintText)}</textarea>
      </div>

      <button class="srf-btn srf-btn-primary" id="srf-cmp-submit" ${m.complaintLoading?`disabled`:``}>
        ${m.complaintLoading?`<span class="srf-spin"></span>`:``}<span>Submit complaint</span> ${s.arrowRight}
      </button>
    `}function se(){return m.feedbackToken&&m.feedbackLoading?`
        <h2 class="srf-card-title">Opening feedback</h2>
        <p class="srf-card-sub">Please wait while we verify your secure feedback link.</p>
        <div style="padding:28px;text-align:center;color:var(--text-soft);"><span class="srf-spin"></span></div>
      `:m.feedbackToken&&m.feedbackError?`
        <h2 class="srf-card-title">Feedback link unavailable</h2>
        <p class="srf-card-sub">${B(m.feedbackError)}</p>
        <button class="srf-btn srf-btn-secondary" id="srf-feedback-track">${s.search}<span>Track request instead</span></button>
      `:m.trackResult?le(m.trackResult):m.trackList?ce(m.trackList):`
      <h2 class="srf-card-title">Track your requests</h2>
      <p class="srf-card-sub">Enter your mobile number to see all the tickets you've filed. Add a ticket number to jump to one directly.</p>

      <label class="srf-label" for="srf-track-phone">Phone number</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.phone}</span>
        <span class="srf-cc">+91</span>
        <input id="srf-track-phone" type="tel" inputmode="numeric" maxlength="10"
               placeholder="98765 43210" class="srf-input srf-input-cc" value="${m.trackPhone}"/>
      </div>

      <label class="srf-label" for="srf-track-tno">Ticket number <span class="srf-optional">(optional)</span></label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.ticket}</span>
        <input id="srf-track-tno" type="text" placeholder="NE-260506-1234" class="srf-input"
               value="${m.trackTicketNo}" autocomplete="off"/>
      </div>

      <button class="srf-btn srf-btn-primary" id="srf-track-go" ${m.trackLoading?`disabled`:``}>
        ${m.trackLoading?`<span class="srf-spin"></span>`:``}<span>${m.trackTicketNo?`Get this ticket`:`Show my tickets`}</span> ${s.arrowRight}
      </button>
    `}function ce(e){return`
      <button class="srf-back" id="srf-track-back">${s.arrowLeft}<span>New search</span></button>
      <h2 class="srf-card-title">Your tickets</h2>
      <p class="srf-card-sub">${e.length} ticket${e.length===1?``:`s`} found for +91 ${at(m.trackPhone)}</p>

      <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px;">
        ${e.length===0?`
          <div style="padding:24px;text-align:center;color:var(--text-soft);background:var(--bg-soft);border-radius:14px;">
            No tickets found for this phone number.
          </div>
        `:e.map(e=>{let t=L(e.status),n=I[t===`pending`?`open`:t]||t,r=t===`resolved`?`var(--success)`:t===`in_progress`?`var(--warning)`:t===`assigned`?`var(--primary)`:`var(--text-dim)`;return`
            <button type="button" class="srf-ticket-row" data-ticket-id="${e.id}"
              style="display:flex;align-items:center;gap:14px;padding:14px;border-radius:14px;background:var(--bg-soft);border:1px solid var(--border);cursor:pointer;text-align:left;font-family:inherit;width:100%;">
              <div style="flex-shrink:0;width:44px;height:44px;border-radius:12px;background:var(--bg);color:${r};display:flex;align-items:center;justify-content:center;">${s.ticket}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:800;font-size:0.95rem;color:var(--text);">${B(e.ticket_no||e.id.slice(0,8))}</div>
                <div style="font-size:0.82rem;color:var(--text-soft);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${B(e.service_item||`—`)}</div>
                <div style="font-size:0.74rem;color:var(--text-dim);margin-top:2px;">${e.created_at?new Date(e.created_at).toLocaleDateString(`en-US`,{month:`short`,day:`numeric`,year:`numeric`}):``}</div>
              </div>
              <span style="font-size:0.75rem;font-weight:700;padding:6px 12px;border-radius:999px;background:${r}1a;color:${r};white-space:nowrap;">${n}</span>
            </button>
          `}).join(``)}
      </div>
    `}function le(e){let t=L(e.status),n=t===`pending`?`open`:t,r=Math.max(0,F.indexOf(n)),i=t===`resolved`,a=e.bill_amount!=null&&Number(e.bill_amount)>0,c=e.payment_status===`paid`,l=e.feedback_rating!=null,u=!!m.feedbackToken&&i&&!l,d=e.profiles||null;return`
      <button class="srf-back" id="srf-track-back">${s.arrowLeft}<span>Look up another</span></button>
      <h2 class="srf-card-title">Ticket ${e.ticket_no||e.id.slice(0,8)}</h2>
      <p class="srf-card-sub">${e.full_name} · ${e.service_item}</p>

      ${i?``:`
        <div style="background:var(--bg-soft); padding:18px 20px; border-radius:16px; margin:20px 0; border:1px solid var(--border); display:flex; align-items:center; gap:16px;">
          <div style="width:48px;height:48px;border-radius:14px;background:var(--gradient);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 6px 16px rgba(16,185,129,0.25);">${s.clock}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.72rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">Service commitment</div>
            <div style="font-size:0.85rem; color:var(--text-soft); margin-top:2px;">Resolved by</div>
            <div style="font-size:1.2rem; color:var(--text); font-weight:800; margin-top:4px; letter-spacing:-0.01em;">${ot(o(e.created_at))}</div>
          </div>
        </div>
      `}

      <div class="srf-timeline">
        ${F.map((e,t)=>`
          <div class="srf-tl-step ${t<=r?`done`:``} ${t===r?`current`:``}">
            <div class="srf-tl-dot">${t<=r?s.check:t+1}</div>
            <div class="srf-tl-label">${I[e]}</div>
          </div>
          ${t<F.length-1?`<div class="srf-tl-line ${t<r?`done`:``}"></div>`:``}
        `).join(``)}
      </div>

      ${st(n,e,d)}

      ${a?`
        <div class="srf-bill-card">
          <div class="srf-bill-row">
            <div class="srf-bill-icon">${s.rupee}</div>
            <div class="srf-bill-info">
              <div class="srf-bill-label">${c?`Amount paid`:`Amount due`}</div>
              <div class="srf-bill-amount">₹${Number(e.bill_total||e.bill_amount).toLocaleString(`en-IN`)}</div>
            </div>
            ${c?`<span class="srf-bill-paid">${s.check}<span>Paid</span></span>`:e.payment_link?`<a class="srf-btn srf-btn-primary srf-pay-btn" href="${z(e.payment_link)}" target="_blank" rel="noopener">${s.card}<span>Pay now</span></a>`:`<span class="srf-bill-pending">${s.hourglass}<span>Link pending</span></span>`}
          </div>
          ${c&&e.bill_pdf_url?`
            <a class="srf-btn srf-btn-primary" href="${z(e.bill_pdf_url)}" target="_blank" rel="noopener" style="margin-top:14px;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;">
              ${s.download}<span>Download Bill (PDF)</span>
            </a>`:``}
        </div>
      `:``}

      ${i&&!l&&!u?`
        <div class="srf-feedback">
          <h3 class="srf-fb-title">Feedback secured</h3>
          <p class="srf-fb-sub">For your safety, feedback can be submitted only from the secure link sent after payment.</p>
        </div>
      `:``}

      ${i&&c&&m.reopenButtonEnabled&&(m.reopenLimit===0||(Number(e.reopen_count)||0)<m.reopenLimit)?`
        <div class="srf-feedback" style="margin-top:14px;">
          <h3 class="srf-fb-title">Issue not resolved?</h3>
          <p class="srf-fb-sub">If the problem is still there, let us know and we'll reopen your ticket and send a technician again — free of cost.</p>
          ${m.reopenSubmitted?`
            <div style="padding:12px 14px;border-radius:12px;background:rgba(16,185,129,0.08);border:1px solid var(--primary);font-size:0.88rem;">✅ Your ticket has been reopened. Our team will reassign a technician shortly — no extra charge.</div>
          `:`
            <textarea id="srf-reopen-text" class="srf-input" rows="3" maxlength="2000" placeholder="Tell us what's still wrong..." style="margin-bottom:10px;resize:vertical;min-height:84px;">${B(m.reopenText||``)}</textarea>
            <button class="srf-btn srf-btn-primary" id="srf-reopen-btn" ${m.reopenLoading?`disabled`:``}>
              ${m.reopenLoading?`<span class="srf-spin"></span>`:``}<span>Issue not resolved — reopen ticket</span>
            </button>
          `}
        </div>
      `:i&&c&&m.reopenButtonEnabled?`
        <div class="srf-feedback" style="margin-top:14px;">
          <h3 class="srf-fb-title">Issue not resolved?</h3>
          <p class="srf-fb-sub">This ticket has reached the maximum number of reopens. Please use the Complaint tab or call us for further help.</p>
        </div>
      `:``}

      ${u?`
        <div class="srf-feedback">
          <h3 class="srf-fb-title">How did we do?</h3>
          <p class="srf-fb-sub">Your honest feedback helps us serve you better.</p>

          <div style="margin-bottom:18px;">
            <div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Overall Experience</div>
            <div class="srf-stars" id="srf-stars" data-rating="0">
              ${[1,2,3,4,5].map(e=>`<button type="button" class="srf-star" data-val="${e}">${s.starOutline}</button>`).join(``)}
            </div>
            <div id="srf-rating-label" style="font-size:0.82rem;color:var(--primary);font-weight:700;margin-top:6px;min-height:18px;"></div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">
            <div>
              <div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Service Quality</div>
              <div class="srf-stars" id="srf-stars-quality" data-rating="0" style="gap:2px;">
                ${[1,2,3,4,5].map(e=>`<button type="button" class="srf-star" data-val="${e}" style="padding:2px;">${s.starOutline}</button>`).join(``)}
              </div>
            </div>
            <div>
              <div style="font-size:0.75rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Technician</div>
              <div class="srf-stars" id="srf-stars-tech" data-rating="0" style="gap:2px;">
                ${[1,2,3,4,5].map(e=>`<button type="button" class="srf-star" data-val="${e}" style="padding:2px;">${s.starOutline}</button>`).join(``)}
              </div>
            </div>
          </div>

          <div style="display:flex;gap:8px;margin-bottom:18px;" id="srf-rec-wrap">
            <button class="srf-rec-btn" id="srf-rec-yes" data-val="yes" style="flex:1;padding:10px 8px;border-radius:12px;border:2px solid var(--border);background:var(--bg-soft);font-weight:700;font-size:0.82rem;cursor:pointer;color:var(--text-soft);font-family:inherit;transition:all 0.2s;">👍 Recommend</button>
            <button class="srf-rec-btn" id="srf-rec-no" data-val="no" style="flex:1;padding:10px 8px;border-radius:12px;border:2px solid var(--border);background:var(--bg-soft);font-weight:700;font-size:0.82rem;cursor:pointer;color:var(--text-soft);font-family:inherit;transition:all 0.2s;">👎 Would Not</button>
          </div>

          <div class="srf-input-wrap" style="margin-bottom:14px;">
            <span class="srf-input-icon">${s.edit}</span>
            <textarea id="srf-fb-comment" placeholder="Tell us about your experience — what went well, what could improve…" class="srf-input" rows="3" style="padding-top:12px;padding-bottom:12px;resize:vertical;min-height:72px;"></textarea>
          </div>

          <button class="srf-btn srf-btn-primary" id="srf-fb-submit" disabled style="opacity:0.5;cursor:not-allowed;">
            <span>Submit Feedback</span> ${s.arrowRight}
          </button>
          <p style="text-align:center;font-size:0.75rem;color:var(--text-dim);margin-top:8px;">Overall star rating is required</p>
        </div>
      `:``}

      ${i&&l?`
        <div class="srf-fb-done">
          <div class="srf-fb-done-ring">${s.star}</div>
          <h3 style="font-weight:800;font-size:1.1rem;color:var(--text);margin:0 0 6px;">Thank you for your feedback!</h3>
          <p style="font-size:0.9rem;color:var(--text-soft);margin:0 0 8px;">You rated us <strong style="color:var(--warning)">${e.feedback_rating}/5 ★</strong></p>
          ${e.feedback_comment?`<p style="font-size:0.85rem;color:var(--text-soft);font-style:italic;margin:0;">"${e.feedback_comment}"</p>`:``}
        </div>
      `:``}
    `}let w=(e,n,r=`onclick`)=>{let i=t.querySelector(e);i&&(i[r]=n)};function T(){w(`.theme-toggle-btn`,()=>{e(),h()}),w(`.srf-staff-btn`,n),t.querySelectorAll(`.srf-mode-tab`).forEach(e=>{e.onclick=()=>{m.mode!==e.dataset.mode&&(m.mode=e.dataset.mode,m.mode===`track`&&(m.trackResult=null,m.trackList=null),m.mode===`complaint`&&(m.complaintSubmitted=!1),ne())}})}function E(){if(m.mode===`track`)return O();if(m.mode===`complaint`)return k();m.step===1?ue():m.step===2?de():m.step===3?D():fe()}function ue(){let e=t.querySelector(`#srf-phone`),n=t.querySelector(`#srf-captcha`),i=t.querySelector(`#srf-send-otp`);e.addEventListener(`input`,e=>{let t=e.target.value.replace(/\D/g,``);t.length>10&&t.startsWith(`91`)?t=t.slice(2):t.length===11&&t.startsWith(`0`)&&(t=t.slice(1)),e.target.value=t.slice(0,10),m.phone=e.target.value}),w(`#srf-refresh-captcha`,()=>{m.captcha=R(),h()}),i&&(i.onclick=async()=>{if(!/^\d{10}$/.test(m.phone))return r(`Enter a valid 10-digit number`,`error`);if(String(n.value||``).trim().toLowerCase()!==m.captcha.code.toLowerCase())return r(`Captcha is incorrect`,`error`),m.captcha=R(),h();i.disabled=!0,i.innerHTML=`<span class="srf-spin"></span><span>Sending…</span>`;let e=await Le(`+91`+m.phone);if(!e.ok){r(e.error||`Could not send OTP`,`error`),h();return}r(`OTP sent by SMS`,`success`),m.step=2,h()})}function de(){let e=[...t.querySelectorAll(`.srf-otp-box`)];e[0]?.focus();let n=()=>e.forEach(e=>e.classList.toggle(`filled`,e.value.length>0));e.forEach((t,r)=>{t.addEventListener(`input`,()=>{t.value=t.value.replace(/\D/g,``),n(),t.value&&r<e.length-1&&e[r+1].focus()}),t.addEventListener(`keydown`,n=>{n.key===`Backspace`&&!t.value&&r>0&&e[r-1].focus()}),t.addEventListener(`paste`,t=>{let r=(t.clipboardData.getData(`text`)||``).replace(/\D/g,``).slice(0,6);r&&(t.preventDefault(),e.forEach((e,t)=>{e.value=r[t]||``}),n(),e[Math.min(r.length,5)].focus())})}),w(`#srf-back`,()=>{m.step=1,h()}),w(`#srf-verify-otp`,async()=>{let n=e.map(e=>e.value).join(``);if(n.length!==6)return r(`Enter the full 6-digit code`,`error`);let i=t.querySelector(`#srf-verify-otp`);i.disabled=!0,i.innerHTML=`<span class="srf-spin"></span><span>Verifying...</span>`;let a=await Re(`+91`+m.phone,n);if(!a.ok){r(a.error||`Incorrect code`,`error`),h();return}m.step=3,h()}),w(`#srf-resend`,async()=>{let e=t.querySelector(`#srf-resend`);e&&(e.disabled=!0,e.textContent=`Sending...`);let n=await ze(`+91`+m.phone);if(!n.ok){r(n.error||`Could not resend OTP`,`error`),h();return}r(`New code sent`,`success`),h()})}function D(){let e=t.querySelector(`#srf-issue`),n=t.querySelector(`#srf-other-wrap`),i=()=>{m.customerName=t.querySelector(`#srf-name`)?.value||m.customerName,m.billNo=t.querySelector(`#srf-bill`)?.value||``,m.preferredTime=t.querySelector(`#srf-time`)?.value||m.preferredTime,m.issueValue=e?.value||m.issueValue,m.otherIssue=t.querySelector(`#srf-other`)?.value||``,m.description=t.querySelector(`#srf-desc`)?.value||``,m.locationValue=t.querySelector(`#srf-location`)?.value||m.locationValue};n.style.display=e.value===`other`?``:`none`,e.onchange=()=>{m.issueValue=e.value,n.style.display=e.value===`other`?``:`none`},t.querySelectorAll(`.srf-seg`).forEach(e=>{e.onclick=()=>{i(),m.locationMode=e.dataset.mode,m.locationValue=``,m.coords=null,h()}});let a=t.querySelector(`#srf-detect`);a&&(a.onclick=async()=>{i(),a.innerHTML=`<span class="srf-spin"></span>`;try{let{latitude:e,longitude:n,accuracy:i}=(await tt()).coords;m.coords={lat:e,lng:n,accuracy:i};try{m.locationValue=await nt(e,n)||`GPS: ${e.toFixed(6)}, ${n.toFixed(6)}`}catch(t){console.error(`Reverse geocoding failed:`,t),m.locationValue=`GPS: ${e.toFixed(6)}, ${n.toFixed(6)}`}t.querySelector(`#srf-location`).value=m.locationValue,r(`Location detected (${Math.round(Number(i)||0)}m accuracy)`,`success`),ne()}catch{r(`Could not detect location - switch to Manual`,`error`),a.innerHTML=s.crosshair}}),t.querySelector(`#srf-location`).addEventListener(`input`,e=>{m.locationValue=e.target.value});let o=t.querySelector(`#srf-name`);o&&o.addEventListener(`input`,e=>{m.customerName=e.target.value});let c=t.querySelector(`#srf-bill`);c&&c.addEventListener(`input`,e=>{m.billNo=e.target.value});let l=t.querySelector(`#srf-time`);l&&l.addEventListener(`change`,e=>{m.preferredTime=e.target.value});let u=t.querySelector(`#srf-other`);u&&u.addEventListener(`input`,e=>{m.otherIssue=e.target.value});let d=t.querySelector(`#srf-desc`);d&&d.addEventListener(`input`,e=>{m.description=e.target.value}),w(`#srf-submit`,async()=>{i();let n=t.querySelector(`#srf-name`).value.trim(),a=t.querySelector(`#srf-bill`).value.trim(),o=t.querySelector(`#srf-time`).value,s=e.value;m.issueValue=s;let c=m.issueOptions.find(e=>e.value===s)?.label||``,l=t.querySelector(`#srf-other`)?.value.trim()||``;if(!n)return r(`Please enter your name`,`error`);if(!m.locationValue)return r(`Please add your location`,`error`);if(!s)return r(`Please pick an issue`,`error`);if(s===`other`&&!l)return r(`Please describe the issue`,`error`);let u=s===`other`?`Other: ${l}`:c,d=(m.description||``).trim().slice(0,1e3)||null,f=t.querySelector(`#srf-submit`);f.disabled=!0,f.innerHTML=`<span class="srf-spin"></span><span>Submitting…</span>`;let p=We(),g=await P(`/data/inquiries`,{full_name:n,phone:`+91`+m.phone,location:m.locationValue,customer_lat:m.coords?.lat??null,customer_lng:m.coords?.lng??null,bill_no:a||null,service_item:u,description:d,status:`open`,assignment_status:`none`,ticket_no:p,preferred_time:o});if(!g.ok){r(g.error||`Could not submit - please try again`,`error`),console.error(g),h();return}m.ticketNo=p,r(`Request submitted`,`success`),m.step=4,h()})}function fe(){w(`#srf-copy-ticket`,async()=>{try{await navigator.clipboard.writeText(m.ticketNo),r(`Ticket number copied`,`success`)}catch{r(`Copy failed — select and copy manually`,`error`)}}),w(`#srf-track-now`,()=>{m.mode=`track`,m.trackTicketNo=m.ticketNo,m.trackPhone=m.phone,m.trackResult=null,h()}),w(`#srf-new`,()=>{m.step=1,m.phone=``,m.otp=``,m.ticketNo=``,m.captcha=R(),m.locationMode=`gps`,m.locationValue=``,m.coords=null,m.customerName=``,m.billNo=``,m.preferredTime=`Morning (10 AM - 1 PM)`,m.otherIssue=``,m.description=``,m.issueValue=``,h()})}function O(){if(m.feedbackToken&&m.feedbackError){w(`#srf-feedback-track`,()=>{m.feedbackToken=``,m.feedbackError=``,m.feedbackLoading=!1,m.trackResult=null,h()});return}if(m.trackResult){t.querySelector(`#srf-track-back`).onclick=()=>{m.trackResult=null,m.reopenSubmitted=!1,m.reopenText=``,h()};let e=t.querySelector(`#srf-reopen-text`);e&&e.addEventListener(`input`,e=>{m.reopenText=e.target.value});let n=t.querySelector(`#srf-reopen-btn`);n&&(n.onclick=async()=>{let e=m.trackResult||{},t=(m.reopenText||``).trim();if(t.length<10)return r(`Please describe what is still wrong (at least 10 characters)`,`error`);let n=e.phone||`+91`+(m.trackPhone||``);if(!e.ticket_no||!n)return r(`Could not identify this ticket`,`error`);m.reopenLoading=!0,h();let{error:i}=await y.from(`complaints`).insert({ticket_no:e.ticket_no,phone:n,complaint_text:`ISSUE NOT RESOLVED: `+t});if(m.reopenLoading=!1,i){r(/No ticket found/i.test(i.message||``)?`We could not match this ticket. Please use the Complaint tab.`:i.message||`Could not reopen the ticket`,`error`),h();return}m.reopenSubmitted=!0,m.reopenText=``,r(`Ticket reopened — our team will reassign a technician`,`success`),h()});let i=t.querySelector(`#srf-stars`);if(i){let e=(e,t)=>{if(!e)return;let n=[...e.querySelectorAll(`.srf-star`)],r=0,i=e=>n.forEach((t,n)=>{t.innerHTML=n<e?s.star:s.starOutline,t.classList.toggle(`on`,n<e)});return n.forEach((n,a)=>{n.onmouseenter=()=>i(a+1),n.onmouseleave=()=>i(r),n.onclick=()=>{r=a+1,e.dataset.rating=r,i(r),t&&t(r)}}),()=>r},n=[``,`😞 Poor`,`😐 Fair`,`😊 Good`,`😁 Great`,`🤩 Excellent!`],a=0,o=``,c=t.querySelector(`#srf-fb-submit`),l=()=>{c&&(c.disabled=!a,c.style.opacity=a?`1`:`0.5`,c.style.cursor=a?`pointer`:`not-allowed`)};e(i,e=>{a=e;let r=t.querySelector(`#srf-rating-label`);r&&(r.textContent=n[e]||``),l()}),e(t.querySelector(`#srf-stars-quality`)),e(t.querySelector(`#srf-stars-tech`)),t.querySelectorAll(`.srf-rec-btn`).forEach(e=>{e.onclick=()=>{o=e.dataset.val,t.querySelectorAll(`.srf-rec-btn`).forEach(e=>{e.style.borderColor=e.dataset.val===o?`var(--primary)`:`var(--border)`,e.style.color=e.dataset.val===o?`var(--primary)`:`var(--text-soft)`,e.style.background=e.dataset.val===o?`rgba(16,185,129,0.08)`:`var(--bg-soft)`})}}),w(`#srf-fb-submit`,async()=>{if(!a)return r(`Please pick an overall star rating`,`warning`);let e=Number(t.querySelector(`#srf-stars-quality`)?.dataset.rating||0),n=Number(t.querySelector(`#srf-stars-tech`)?.dataset.rating||0),i=[t.querySelector(`#srf-fb-comment`).value.trim(),e?`Service quality: ${e}/5`:``,n?`Technician: ${n}/5`:``,o?o===`yes`?`Would recommend ✓`:`Would not recommend`:``].filter(Boolean).join(` | `),c=t.querySelector(`#srf-fb-submit`);c.disabled=!0,c.innerHTML=`<span class="srf-spin"></span><span>Submitting…</span>`;let l=await fetch(`/api/feedback/submit`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({token:m.feedbackToken,rating:a,employee_rating:n||null,comment:i||null})}),u=await l.json().catch(()=>({}));if(!l.ok){r(u.error||`Could not submit feedback`,`error`),c.disabled=!1,c.innerHTML=`<span>Submit Feedback</span> ${s.arrowRight}`;return}m.trackResult=u.inquiry||{...m.trackResult,feedback_rating:a,feedback_comment:i||null,feedback_at:new Date().toISOString()},r(`Thanks for your feedback! 🙏`,`success`),h()})}return}if(m.trackList){w(`#srf-track-back`,()=>{m.trackList=null,h()}),t.querySelectorAll(`.srf-ticket-row`).forEach(e=>{e.onclick=async()=>{let t=e.dataset.ticketId,n=m.trackList.find(e=>e.id===t);if(!n)return;m.trackLoading=!0,h();let{data:r}=await y.from(`inquiries`).select(`*,profiles(id,full_name,phone,role)`).eq(`ticket_no`,n.ticket_no).eq(`phone`,n.phone).maybeSingle();m.trackLoading=!1,m.trackResult=r||n,h()}});return}let e=t.querySelector(`#srf-track-tno`),n=t.querySelector(`#srf-track-phone`);e.addEventListener(`input`,e=>{m.trackTicketNo=e.target.value.trim().toUpperCase(),e.target.value=m.trackTicketNo}),n.addEventListener(`input`,e=>{e.target.value=e.target.value.replace(/\D/g,``).slice(0,10),m.trackPhone=e.target.value}),w(`#srf-track-go`,async()=>{let e=m.trackTicketNo,t=m.trackPhone;if(!/^\d{10}$/.test(t))return r(`Enter a valid 10-digit phone number`,`error`);if(m.trackLoading=!0,h(),e){let{data:n,error:i}=await y.from(`inquiries`).select(`*,profiles(id,full_name,phone,role)`).eq(`ticket_no`,e).eq(`phone`,`+91`+t).maybeSingle();if(m.trackLoading=!1,i){console.error(i),r(`Lookup failed`,`error`),h();return}if(!n){r(`No matching ticket. Check the number and phone.`,`error`),h();return}m.trackResult=n,h();return}let{data:n,error:i}=await y.from(`inquiries`).select(`*`).eq(`phone`,`+91`+t).order(`created_at`,{ascending:!1});if(m.trackLoading=!1,i){console.error(i),r(`Lookup failed`,`error`),h();return}let a=Array.isArray(n)?n:n?[n]:[];if(!a.length){r(`No tickets found for that phone number.`,`error`),h();return}if(a.length===1){let{data:e}=await y.from(`inquiries`).select(`*,profiles(id,full_name,phone,role)`).eq(`ticket_no`,a[0].ticket_no).eq(`phone`,a[0].phone).maybeSingle();m.trackResult=e||a[0]}else m.trackList=a;h()})}function pe(e,t){if(!e)return()=>0;let n=[...e.querySelectorAll(`.srf-star`)],r=Number(e.dataset.rating||0),i=e=>n.forEach((t,n)=>{t.innerHTML=n<e?s.star:s.starOutline,t.classList.toggle(`on`,n<e)});return n.forEach((n,a)=>{n.onmouseenter=()=>i(a+1),n.onmouseleave=()=>i(r),n.onclick=()=>{r=a+1,e.dataset.rating=String(r),i(r),t&&t(r)}}),i(r),()=>r}function me(){w(`.theme-toggle-btn`,()=>{e(),h()});let n=()=>{window.history.replaceState({},``,`/`),m.isFeedbackPage=!1,m.feedbackToken=``,m.feedbackError=``,m.feedbackLoading=!1,m.trackResult=null,h(),te()};if(w(`#srf-feedback-home`,n),w(`#srf-feedback-home-2`,n),!m.trackResult||m.feedbackLoading||m.feedbackError||m.trackResult.feedback_rating!=null)return;let i=[``,`Poor`,`Fair`,`Good`,`Great`,`Excellent`],a=0,o=t.querySelector(`#srf-fb-submit`),c=()=>{o&&(o.disabled=!a,o.style.opacity=a?`1`:`0.5`,o.style.cursor=a?`pointer`:`not-allowed`)};pe(t.querySelector(`#srf-stars`),e=>{a=e;let n=t.querySelector(`#srf-rating-label`);n&&(n.textContent=i[e]||``),c()}),pe(t.querySelector(`#srf-stars-tech`)),w(`#srf-fb-submit`,async()=>{if(!a)return r(`Please pick an overall star rating`,`warning`);let e=Number(t.querySelector(`#srf-stars-tech`)?.dataset.rating||0),n=[(t.querySelector(`#srf-fb-comment`)?.value||``).trim(),e?`Technician: ${e}/5`:``].filter(Boolean).join(` | `),i=t.querySelector(`#srf-fb-submit`);i.disabled=!0,i.innerHTML=`<span class="srf-spin"></span><span>Submitting...</span>`;let o=await fetch(`/api/feedback/submit`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({token:m.feedbackToken,rating:a,employee_rating:e||null,comment:n||null})}),c=await o.json().catch(()=>({}));if(!o.ok){r(c.error||`Could not submit feedback`,`error`),i.disabled=!1,i.innerHTML=`<span>Submit Feedback</span> ${s.arrowRight}`;return}m.trackResult=c.inquiry||{...m.trackResult,feedback_rating:a,feedback_comment:n||null,feedback_at:new Date().toISOString()},r(`Thanks for your feedback`,`success`),h()})}function k(){if(m.complaintSubmitted){w(`#srf-complaint-another`,()=>{m.complaintSubmitted=!1,m.complaintTicketNo=``,m.complaintText=``,h()}),w(`#srf-complaint-to-track`,()=>{m.mode=`track`,m.trackTicketNo=m.complaintTicketNo,m.trackPhone=m.complaintPhone,m.trackResult=null,m.trackList=null,h()});return}let e=t.querySelector(`#srf-cmp-tno`),n=t.querySelector(`#srf-cmp-phone`),i=t.querySelector(`#srf-cmp-text`);e.addEventListener(`input`,e=>{m.complaintTicketNo=e.target.value.trim().toUpperCase(),e.target.value=m.complaintTicketNo}),n.addEventListener(`input`,e=>{e.target.value=e.target.value.replace(/\D/g,``).slice(0,10),m.complaintPhone=e.target.value}),i.addEventListener(`input`,e=>{m.complaintText=e.target.value}),w(`#srf-cmp-submit`,async()=>{let e=m.complaintTicketNo,t=m.complaintPhone,n=m.complaintText.trim();if(!e)return r(`Enter your ticket number`,`error`);if(!/^\d{10}$/.test(t))return r(`Enter a valid 10-digit number`,`error`);if(n.length<10)return r(`Please describe the issue (at least 10 characters)`,`error`);m.complaintLoading=!0,h();let{error:i}=await y.from(`complaints`).insert({ticket_no:e,phone:`+91`+t,complaint_text:n});if(m.complaintLoading=!1,i){r(/No ticket found/i.test(i.message||``)?`No ticket matches that number and phone. Double-check and try again.`:`Could not submit complaint — please try again.`,`error`),h();return}m.complaintSubmitted=!0,r(`Complaint received`,`success`),h()})}h(),m.isFeedbackPage||te(),d&&(async()=>{m.feedbackLoading=!0,h();try{let e=await fetch(`/api/feedback/resolve?token=${encodeURIComponent(d)}`),t=await e.json().catch(()=>({}));if(m.feedbackLoading=!1,!e.ok){m.feedbackError=t.error||`This feedback link is invalid or expired.`,h();return}m.trackResult=t.inquiry||null,t.used&&t.inquiry&&(m.trackResult=t.inquiry)}catch{m.feedbackLoading=!1,m.feedbackError=`Could not open feedback link. Please try again.`}h()})(),!d&&a===`track`&&c&&l&&l.length===10&&(async()=>{m.trackLoading=!0,h();let{data:e}=await y.from(`inquiries`).select(`*,profiles(id,full_name,phone,role)`).eq(`ticket_no`,c).eq(`phone`,`+91`+l).maybeSingle();m.trackLoading=!1,e&&(m.trackResult=e),h()})()}function R(){return{code:Array.from({length:5},()=>`ABCDEFGHJKLMNPQRSTUVWXYZ`[Math.floor(Math.random()*24)]).join(``)}}function at(e){return e.length===10?`${e.slice(0,5)} ${e.slice(5)}`:e}function z(e){return String(e).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e])}function B(e){return String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e])}function ot(e){let t=e instanceof Date?e:new Date(e),n=t.toLocaleDateString(`en-US`,{weekday:`short`}),r=t.toLocaleDateString(`en-US`,{month:`short`}),i=t.getDate(),a=t.getFullYear();return`${t.toLocaleTimeString(`en-US`,{hour:`numeric`,minute:`2-digit`,hour12:!0})}, ${n} ${i} ${r} ${a}`}function st(e,t,n){let r=`<div style="margin:18px 0;padding:18px;border-radius:18px;background:var(--bg-soft);box-shadow:var(--neu-in);border:1px solid var(--border);">`,i=`</div>`,a=(e,t)=>`
    <div style="font-size:0.72rem;color:var(--text-dim);text-transform:uppercase;font-weight:800;letter-spacing:0.5px;">${e}</div>
    ${t?`<div style="font-size:0.85rem;color:var(--text-soft);margin-top:2px;">${t}</div>`:``}
  `,o=(e,t,n)=>`
    <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-top:1px solid var(--border);">
      <div style="width:32px;height:32px;border-radius:10px;background:var(--bg);color:var(--primary);display:flex;align-items:center;justify-content:center;flex-shrink:0;">${e}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.7rem;color:var(--text-dim);text-transform:uppercase;font-weight:700;letter-spacing:0.4px;">${t}</div>
        <div style="font-size:0.92rem;color:var(--text);font-weight:600;word-break:break-word;">${n}</div>
      </div>
    </div>
  `;if(e===`open`)return`
      ${r}
        ${a(`Request received`,`We're reviewing your request and will dispatch the right technician shortly. You'll see their details here as soon as they're assigned.`)}
        <div style="margin-top:10px;">
          ${o(s.user,`Customer`,B(t.full_name))}
          ${o(s.phone,`Contact`,B(t.phone))}
          ${o(s.pin,`Location`,B(t.location||`—`))}
          ${o(s.wrench,`Service`,B(t.service_item||`—`))}
          ${t.description?o(s.edit,`Description`,B(t.description)):``}
          ${t.preferred_time?o(s.clock,`Preferred time`,B(t.preferred_time)):``}
        </div>
      ${i}
    `;if(e===`assigned`||e===`in_progress`){let t=e===`assigned`?`Technician assigned`:`Technician on the job`;return n?`
      ${r}
        ${a(t,e===`assigned`?`Your technician has been dispatched and will reach out shortly.`:`Your technician is actively working on your service.`)}
        <div style="margin-top:10px;">
          ${o(s.user,`Name`,B(n.full_name||`Technician`))}
          ${n.phone?o(s.phone,`Phone`,`<a href="tel:${z(n.phone)}" style="color:var(--primary);text-decoration:none;">${B(n.phone)}</a>`):``}
          ${n.role?o(s.shield,`Role`,B(n.role.charAt(0).toUpperCase()+n.role.slice(1))):``}
        </div>
      ${i}
    `:`
        ${r}
          ${a(t,`Technician details will appear here once assignment is confirmed.`)}
        ${i}
      `}return``}var ct=window.location.hostname!==`localhost`&&window.location.hostname!==`127.0.0.1`?`/api`:`http://localhost:5000/api`;function lt(e){let t=(e+`=`.repeat((4-e.length%4)%4)).replace(/-/g,`+`).replace(/_/g,`/`),n=atob(t),r=new Uint8Array(n.length);for(let e=0;e<n.length;e++)r[e]=n.charCodeAt(e);return r}var V=!1;async function ut(){if(!V&&!(!(`serviceWorker`in navigator)||!(`PushManager`in window))&&localStorage.getItem(`auth_token`)){V=!0;try{let{key:e}=await(await fetch(`${ct}/push/vapid-public`)).json();if(!e){V=!1;return}if(Notification.permission===`default`&&await Notification.requestPermission()!==`granted`){V=!1;return}if(Notification.permission!==`granted`){V=!1;return}let t=await navigator.serviceWorker.register(`/push-sw.js`,{scope:`/app-push/`}),n=await t.pushManager.getSubscription()||await t.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:lt(e)});await fetch(`${ct}/push/subscribe`,{method:`POST`,headers:{"Content-Type":`application/json`,Authorization:`Bearer ${localStorage.getItem(`auth_token`)}`},body:JSON.stringify({subscription:n})})}catch(e){console.warn(`[push] init failed`,e),V=!1}}}var dt=`modulepreload`,ft=function(e){return`/`+e},pt={},H=function(e,t,n){let r=Promise.resolve();if(t&&t.length>0){let e=document.getElementsByTagName(`link`),i=document.querySelector(`meta[property=csp-nonce]`),a=i?.nonce||i?.getAttribute(`nonce`);function o(e){return Promise.all(e.map(e=>Promise.resolve(e).then(e=>({status:`fulfilled`,value:e}),e=>({status:`rejected`,reason:e}))))}r=o(t.map(t=>{if(t=ft(t,n),t in pt)return;pt[t]=!0;let r=t.endsWith(`.css`),i=r?`[rel="stylesheet"]`:``;if(n)for(let n=e.length-1;n>=0;n--){let i=e[n];if(i.href===t&&(!r||i.rel===`stylesheet`))return}else if(document.querySelector(`link[href="${t}"]${i}`))return;let o=document.createElement(`link`);if(o.rel=r?`stylesheet`:dt,r||(o.as=`script`),o.crossOrigin=``,o.href=t,a&&o.setAttribute(`nonce`,a),document.head.appendChild(o),r)return new Promise((e,n)=>{o.addEventListener(`load`,e),o.addEventListener(`error`,()=>n(Error(`Unable to preload CSS for ${t}`)))})}))}function i(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}return r.then(t=>{for(let e of t||[])e.status===`rejected`&&i(e.reason);return e().catch(i)})},mt=`true`,ht=`false`,gt=mt===`true`,_t=ht===`true`;function vt(e={}){let{immediate:t=!1,onNeedReload:n,onNeedRefresh:r,onOfflineReady:i,onRegistered:a,onRegisteredSW:o,onRegisterError:s}=e,c,l,u,d=async(e=!0)=>{await l,gt||u?.()};async function f(){if(`serviceWorker`in navigator){if(c=await H(async()=>{let{Workbox:e}=await import(`./workbox-window.prod.es5-C_4Sg3IW.js`);return{Workbox:e}},[]).then(({Workbox:e})=>new e(`/sw.js`,{scope:`/`,type:`classic`})).catch(e=>{s?.(e)}),!c)return;if(u=()=>{c?.messageSkipWaiting()},!_t)if(gt)c.addEventListener(`activated`,e=>{(e.isUpdate||e.isExternal)&&(n?n():window.location.reload())}),c.addEventListener(`installed`,e=>{e.isUpdate||i?.()});else{let e=!1,t=()=>{e=!0,c?.addEventListener(`controlling`,e=>{e.isUpdate&&(n?n():window.location.reload())}),r?.()};c.addEventListener(`installed`,n=>{n.isUpdate===void 0?n.isExternal===void 0?!e&&i?.():n.isExternal?t():!e&&i?.():n.isUpdate||i?.()}),c.addEventListener(`waiting`,t)}c.register({immediate:t}).then(e=>{o?o(`/sw.js`,e):a?.(e)}).catch(e=>{s?.(e)})}}return l=f(),d}vt({immediate:!0,onRegisteredSW(e,t){if(!t)return;let n=()=>{t.update().catch(()=>{})};setInterval(n,3600*1e3),document.addEventListener(`visibilitychange`,()=>{document.visibilityState===`visible`&&n()})},onNeedRefresh(){},onOfflineReady(){}});var U,W=null;window.addEventListener(`beforeinstallprompt`,e=>{e.preventDefault(),U=e});function yt(){!U||W||(W=document.createElement(`button`),W.className=`pwa-install-btn`,W.innerHTML=`${s.download||`📥`} Install App`,document.body.appendChild(W),W.addEventListener(`click`,async()=>{if(!U)return;U.prompt();let{outcome:e}=await U.userChoice;e===`accepted`&&(U=null),bt()}))}function bt(){W&&=(W.remove(),null)}t();var xt=document.getElementById(`app`),G=null,K=null,q=!1,J=`dashboard`,St=new Set([`dashboard`,`notifications`,`profile`]);function Ct(e){if(!Z)return e;let t=e.filter(e=>e.type===`section`||St.has(e.id)||Z.has(String(e.id)));return t.filter((e,n)=>{if(e.type!==`section`)return!0;let r=t[n+1];return r&&r.type!==`section`})}function wt(e){let t=[{type:`section`,label:`Main`},{id:`dashboard`,icon:s.dashboard,label:`Dashboard`}];if(e===`employee`){let e=[...t,{id:`my-stats`,icon:s.star,label:`My Stats`},{id:`all-tickets`,icon:s.ticket,label:`My Tasks`},{id:`notifications`,icon:s.bell,label:`Notifications`},{type:`section`,label:`Work`},{id:`my-attendance`,icon:s.clock,label:`Attendance Records`},{id:`my-leaves`,icon:s.hourglass,label:`Leave Requests`},{id:`my-eod`,icon:s.clipboard,label:`EOD Reports`},{id:`my-cash`,icon:s.rupee,label:`My Cash`},{id:`my-collections`,icon:s.card,label:`Collections`},{id:`leaderboard`,icon:s.star,label:`Leaderboard`},{id:`employee-training`,icon:s.play,label:`Tutorials`},{id:`my-training-courses`,icon:s.shield,label:`Training`}];return e.push({id:`device-followup`,icon:s.wrench,label:`Device Follow-up`}),e.push({type:`section`,label:`Services`}),e.push({id:`estimator`,icon:s.receipt,label:`Estimator`}),q&&e.push({id:`service-pricing`,icon:s.receipt,label:`Service Pricing`}),e.push({type:`section`,label:`Account`},{id:`profile`,icon:s.user,label:`Profile`}),Ct(e)}return[...t,{id:`stats`,icon:s.clipboard,label:`Stats`},{id:`notifications`,icon:s.bell,label:`Notifications`},{type:`section`,label:`Operations`},{id:`attendance`,icon:s.clock,label:`Attendance`},{id:`inquiries`,icon:s.inbox,label:`Service Requests`},{id:`auto-assignment`,icon:s.refresh,label:`Auto Assignment`},{id:`device-tracking`,icon:s.wrench,label:`Device Follow-up`},{type:`section`,label:`Management`},{id:`contacts`,icon:s.phone,label:`Contacts`},{id:`users`,icon:s.users,label:`Users`},{id:`device-types`,icon:s.box,label:`Device Types`},{id:`training-admin`,icon:s.play,label:`Employee Tutorials`},{id:`training-courses`,icon:s.shield,label:`Training Courses`},{type:`section`,label:`Reports`},{id:`finance`,icon:s.rupee,label:`Finance Report`},{id:`ai-report`,icon:s.star,label:`AI Report`},{id:`payments`,icon:s.rupee,label:`Payments`},{id:`bills`,icon:s.receipt,label:`Bills`},{id:`cash`,icon:s.rupee,label:`Cash Collections`},{id:`collections`,icon:s.card,label:`Collection Reports`},{id:`salary`,icon:s.rupee,label:`Salary`},{id:`leaves`,icon:s.hourglass,label:`Leave Requests`},{id:`eod`,icon:s.clipboard,label:`EOD Summaries`},{id:`feedback`,icon:s.star,label:`Leaderboard`},{id:`complaints`,icon:s.shield,label:`Complaints`},{type:`section`,label:`Marketing`},{id:`ads`,icon:s.box,label:`Landing Ads`},{id:`popup-ads`,icon:s.box,label:`Popup Ads`},{id:`notices`,icon:s.clipboard,label:`Notices`},{id:`discounts`,icon:s.receipt,label:`Add Discounts`},{id:`discount-details`,icon:s.receipt,label:`Discount Details`},{id:`pricing`,icon:s.receipt,label:`Service Pricing`},{type:`section`,label:`Config`},{id:`settings`,icon:s.settings||`⚙️`,label:`Settings`},{type:`section`,label:`Account`},{id:`profile`,icon:s.user,label:`Profile`}]}var Tt={employee:{dashboard:()=>H(()=>import(`./employee-CWQOlzTT.js`).then(e=>e.renderEmployeeDashboard),__vite__mapDeps([0,1,2])),"my-stats":()=>H(()=>import(`./stats-BvrlYv3v.js`).then(e=>e.renderEmployeeStats),__vite__mapDeps([3,1,4])),"all-tickets":()=>H(()=>import(`./employee-CWQOlzTT.js`).then(e=>e.renderEmployeeTasks),__vite__mapDeps([0,1,2])),"my-attendance":()=>H(()=>import(`./employee-CWQOlzTT.js`).then(e=>e.renderEmployeeAttendanceRecords),__vite__mapDeps([0,1,2])),"my-leaves":()=>H(()=>import(`./employee-CWQOlzTT.js`).then(e=>e.renderEmployeeLeaveRequests),__vite__mapDeps([0,1,2])),"my-eod":()=>H(()=>import(`./employee-CWQOlzTT.js`).then(e=>e.renderEmployeeEODReports),__vite__mapDeps([0,1,2])),"my-cash":()=>H(()=>import(`./employee-CWQOlzTT.js`).then(e=>e.renderEmployeeCash),__vite__mapDeps([0,1,2])),"my-collections":()=>H(()=>import(`./collections-BAZgk5XN.js`).then(e=>e.renderEmployeeCollections),__vite__mapDeps([5,1])),leaderboard:()=>H(()=>import(`./employee-CWQOlzTT.js`).then(e=>e.renderEmployeeLeaderboard),__vite__mapDeps([0,1,2])),"employee-training":()=>H(()=>import(`./media-training-u1t18R8T.js`).then(e=>e.renderEmployeeTrainingTab),__vite__mapDeps([6,1])),estimator:()=>H(()=>import(`./employee-CWQOlzTT.js`).then(e=>e.renderEmployeeEstimatorTab),__vite__mapDeps([0,1,2])),"service-pricing":()=>H(()=>import(`./employee-CWQOlzTT.js`).then(e=>e.renderEmployeePricingTab),__vite__mapDeps([0,1,2])),"device-followup":()=>H(()=>import(`./employee-CWQOlzTT.js`).then(e=>e.renderEmployeeFollowUp),__vite__mapDeps([0,1,2])),notifications:()=>H(()=>import(`./notifications-V60DrLBR.js`).then(e=>e.renderNotificationsTab),__vite__mapDeps([7,1])),"my-training-courses":()=>H(()=>import(`./training-BHhj3_YW.js`).then(e=>e.renderEmployeeCourses),__vite__mapDeps([8,1])),profile:()=>H(()=>import(`./profile-Vo1cmcVg.js`).then(e=>e.renderProfile),__vite__mapDeps([9,1]))},admin:{dashboard:()=>H(()=>import(`./admin-CNYbIrsG.js`).then(e=>e.renderAdminDashboard),__vite__mapDeps([10,1,0,2])),stats:()=>H(()=>import(`./stats-BvrlYv3v.js`).then(e=>e.renderAdminStats),__vite__mapDeps([3,1,4])),attendance:()=>H(()=>import(`./admin-CNYbIrsG.js`).then(e=>e.renderAttendance),__vite__mapDeps([10,1,0,2])),inquiries:()=>H(()=>import(`./admin-CNYbIrsG.js`).then(e=>e.renderInquiries),__vite__mapDeps([10,1,0,2])),contacts:()=>H(()=>import(`./admin-CNYbIrsG.js`).then(e=>e.renderContacts),__vite__mapDeps([10,1,0,2])),users:()=>H(()=>import(`./admin-CNYbIrsG.js`).then(e=>e.renderUsers),__vite__mapDeps([10,1,0,2])),profile:()=>H(()=>import(`./profile-Vo1cmcVg.js`).then(e=>e.renderProfile),__vite__mapDeps([9,1])),payments:()=>H(()=>import(`./admin-CNYbIrsG.js`).then(e=>e.renderPaymentsTab),__vite__mapDeps([10,1,0,2])),bills:()=>H(()=>import(`./admin-CNYbIrsG.js`).then(e=>e.renderBillsTab),__vite__mapDeps([10,1,0,2])),cash:()=>H(()=>import(`./admin-CNYbIrsG.js`).then(e=>e.renderCashCollectionsTab),__vite__mapDeps([10,1,0,2])),salary:()=>H(()=>import(`./admin-CNYbIrsG.js`).then(e=>e.renderSalaryOverview),__vite__mapDeps([10,1,0,2])),leaves:()=>H(()=>import(`./admin-CNYbIrsG.js`).then(e=>e.renderLeaveRequests),__vite__mapDeps([10,1,0,2])),eod:()=>H(()=>import(`./admin-CNYbIrsG.js`).then(e=>e.renderEODReports),__vite__mapDeps([10,1,0,2])),pricing:()=>H(()=>import(`./admin-CNYbIrsG.js`).then(e=>e.renderPricingTab),__vite__mapDeps([10,1,0,2])),collections:()=>H(()=>import(`./collections-BAZgk5XN.js`).then(e=>e.renderAdminCollections),__vite__mapDeps([5,1])),discounts:()=>H(()=>import(`./discounts-DQ5CMOJx.js`).then(e=>e.renderDiscountsTab),__vite__mapDeps([11,1])),"discount-details":()=>H(()=>import(`./discounts-DQ5CMOJx.js`).then(e=>e.renderDiscountRequestsTab),__vite__mapDeps([11,1])),"popup-ads":()=>H(()=>import(`./media-training-u1t18R8T.js`).then(e=>e.renderPopupAdsTab),__vite__mapDeps([6,1])),"training-admin":()=>H(()=>import(`./media-training-u1t18R8T.js`).then(e=>e.renderTrainingAdminTab),__vite__mapDeps([6,1])),"ai-report":()=>H(()=>import(`./media-training-u1t18R8T.js`).then(e=>e.renderAIReportTab),__vite__mapDeps([6,1])),"device-types":()=>H(()=>import(`./admin-CNYbIrsG.js`).then(e=>e.renderDeviceTypesTab),__vite__mapDeps([10,1,0,2])),feedback:()=>H(()=>import(`./admin-CNYbIrsG.js`).then(e=>e.renderFeedbackTab),__vite__mapDeps([10,1,0,2])),complaints:()=>H(()=>import(`./admin-CNYbIrsG.js`).then(e=>e.renderComplaintsTab),__vite__mapDeps([10,1,0,2])),ads:()=>H(()=>import(`./admin-CNYbIrsG.js`).then(e=>e.renderAdsTab),__vite__mapDeps([10,1,0,2])),notices:()=>H(()=>import(`./admin-notices-BRMdGrtT.js`).then(e=>e.renderNoticesTab),__vite__mapDeps([12,1])),settings:()=>H(()=>import(`./admin-CNYbIrsG.js`).then(e=>e.renderSettingsTab),__vite__mapDeps([10,1,0,2])),"auto-assignment":()=>H(()=>import(`./admin-CNYbIrsG.js`).then(e=>e.renderAutoAssignmentTab),__vite__mapDeps([10,1,0,2])),"device-tracking":()=>H(()=>import(`./device-tracking-admin-CCBSewpY.js`).then(e=>e.renderDeviceTrackingTab),__vite__mapDeps([13,1,2])),finance:()=>H(()=>import(`./finance-BO3tsEgI.js`).then(e=>e.renderFinanceReportTab),__vite__mapDeps([14,1])),notifications:()=>H(()=>import(`./notifications-V60DrLBR.js`).then(e=>e.renderNotificationsTab),__vite__mapDeps([7,1])),"training-courses":()=>H(()=>import(`./training-BHhj3_YW.js`).then(e=>e.renderTrainingCoursesAdmin),__vite__mapDeps([8,1]))}};function Et(e,t){let n=(Tt[e]||Tt.admin)[t];return n?e=>{let r=t;e.innerHTML=`<div class="loading-screen"><div class="spinner"></div></div>`,n().then(t=>{J===r&&(typeof t==`function`?t(e):e.innerHTML=``)}).catch(n=>{if(console.error(`[page] failed to load`,t,n),J!==r)return;e.innerHTML=`<div class="card" style="padding:28px;text-align:center;"><p style="color:var(--danger);font-weight:600;margin:0 0 10px;">Couldn't load this page.</p><button class="btn btn-secondary" id="page-reload">Reload</button></div>`;let i=e.querySelector(`#page-reload`);i&&(i.onclick=()=>location.reload())})}:null}var Dt=!1;function Ot(){Dt||!(`serviceWorker`in navigator)||(Dt=!0,navigator.serviceWorker.addEventListener(`message`,e=>{let t=e.data;t&&t.type===`notification-click`&&O(t)}))}var kt=null;function At(){Ot(),!kt&&(a(),ut(),E(),kt=g(null,e=>{de(e),i({title:e.title||`Update`,body:e.body||``,tag:e.subject||`app-notify`,onclick:()=>O(e),type:e.subject===`payment_received`?`payment`:e.subject===`new_assignment`||e.subject===`new_service_request`||e.subject===`new_complaint`||e.subject===`employee_clock_in`||e.subject===`employee_clock_out`||e.subject===`device_followup_reminder`||e.subject===`sla_breach`?`alert`:`info`})}))}var jt=!1;function Y(e,t={}){if(bt(),J=e,t.push!==!1)try{jt?history.pushState({page:e,app:!0},``,`#${e}`):(history.replaceState({page:e,app:!0},``,`#${e}`),jt=!0)}catch{}let n=wt(K),r=Et(K,e);Ee({user:G,role:K,activePage:J,navItems:n,onNav:Y,pageContent:r||(()=>{})}),At(),K===`employee`&&H(()=>import(`./media-training-u1t18R8T.js`).then(e=>e.mountEmployeePopupAds()),__vite__mapDeps([6,1])).catch(()=>{}),window.__softRefresh=()=>Y(J,{push:!1}),window.__appNav=e=>Y(e),window.__appRole=K}window.addEventListener(`popstate`,e=>{let t=document.querySelectorAll(`.modal-overlay`);if(t.length){let e=t[t.length-1],n=e.querySelector(`.modal-close`);n?n.click():e.remove();try{history.pushState({page:J,app:!0},``,`#${J}`)}catch{}return}e.state&&e.state.app&&e.state.page&&K&&Y(e.state.page,{push:!1})});function X(){it(xt,Lt),yt()}function Mt(){let e=new URLSearchParams(window.location.search),t=window.location.pathname.replace(/\/+$/,``)||`/`;return t===`/feedback`||t.startsWith(`/f/`)||e.has(`feedback`)||e.has(`f`)||e.has(`token`)}var Nt=e=>e?.can_add_service===1||e?.can_add_service===!0,Z=null,Pt=e=>{let t=e?.allowed_tabs;if(t==null||t===``)return null;if(typeof t==`string`)try{t=JSON.parse(t)}catch{return null}return Array.isArray(t)?new Set(t.map(String)):null},Ft=null;function It(e){Ft&&=(y.removeChannel(Ft),null),Ft=y.channel(`my-profile`).on(`postgres_changes`,{event:`UPDATE`,schema:`public`,table:`profiles`,filter:`id=eq.${e}`},e=>{let t=e.new;t&&K===`employee`&&(q=Nt(t),Z=Pt(t),Y(J,{push:!1}))}).subscribe()}function Lt(){re(async(e,t)=>{if(t!==`admin`&&t!==`employee`){await x(),r(`Client accounts cannot log in here. Please use the public service request form.`,`error`),X();return}G=e,K=t,localStorage.setItem(Q,$()),t===`employee`&&(q=Nt(e),Z=Pt(e)),It(e.id),Y(`dashboard`)},()=>X())}var Q=`nest-session-day`,$=()=>new Date().toLocaleDateString(`en-CA`);function Rt(){let e=localStorage.getItem(Q);return!!e&&e!==$()}async function zt(){localStorage.setItem(Q,$());try{await x()}catch{}G=null,K=null,r(`Your daily session has ended. Please log in and clock in again.`,`info`),X()}setInterval(()=>{K===`employee`&&Rt()&&zt()},60*1e3);async function Bt(){if(xt.innerHTML=`<div class="loading-screen"><div class="spinner"></div></div>`,Mt()){it(xt,Lt),bt();return}let e=null;try{({data:{session:e}}=await y.auth.getSession())}catch(e){console.warn(`[boot] session check failed`,e),X();return}if(e?.user)try{if(G=e.user,K=e.user.role||await b(G.id),K!==`admin`&&K!==`employee`){await x(),G=null,K=null,X();return}if(K===`employee`&&Rt()){await zt();return}localStorage.setItem(Q,$()),K===`employee`&&(q=Nt(G),Z=Pt(G)),It(G.id),Y(`dashboard`)}catch(e){console.warn(`[boot] dashboard load failed`,e),X()}else X()}y.auth.onAuthStateChange(e=>{e===`SIGNED_OUT`&&(G=null,K=null,X())}),Bt();export{O as n,y as r,H as t};