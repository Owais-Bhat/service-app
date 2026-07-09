const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/employee-Cjvm8H5u.js","assets/icons-j8TZxXx3.js","assets/device-tracking-DDQQfS3_.js","assets/stats-2ktHz7R6.js","assets/dashboard-widgets-BBXbUQBH.js","assets/collections-BTInrfTP.js","assets/media-training-f0YrcdYi.js","assets/notifications-CQyKlR3K.js","assets/training-BOudn49a.js","assets/profile-DzWIbox-.js","assets/admin-Cv-2zvA7.js","assets/discounts-Bz4GwxAB.js","assets/admin-notices-DxU2oj2c.js","assets/device-tracking-admin-B8BHTAhP.js","assets/finance-BO3tsEgI.js"])))=>i.map(i=>d[i]);
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
      </div>`,i.querySelector(`.theme-toggle-btn`).addEventListener(`click`,()=>{e(),o()});let l=document.getElementById(`auth-back-btn`);l&&(l.onclick=n),i.querySelectorAll(`.password-toggle`).forEach(e=>{e.onclick=()=>{let t=document.getElementById(e.dataset.target),n=t.type===`text`;t.type=n?`password`:`text`,e.innerHTML=n?s.eye:s.eyeOff;let r=e.dataset.target===`reg_key`;e.title=n?r?`Show access key`:`Show password`:r?`Hide access key`:`Hide password`,e.setAttribute(`aria-label`,e.title)}}),document.getElementById(`toggle-mode`).onclick=e=>{e.preventDefault(),a=a===`login`?`signup`:`login`,o()},document.getElementById(`auth-form`).onsubmit=async e=>{e.preventDefault();let n=document.getElementById(`submit-btn`),i=document.getElementById(`auth-error`);i.style.display=`none`,n.disabled=!0,n.textContent=`Please wait…`;let s=document.getElementById(`email`).value.trim(),c=document.getElementById(`password`).value,l;if(l=a===`signup`?await te(s,c,document.getElementById(`full_name`).value.trim(),document.getElementById(`reg_key`).value.trim()):await ee(s,c),l.error){i.textContent=l.error.message,i.style.display=`block`,n.disabled=!1,n.textContent=a===`login`?`Sign In →`:`Create Account →`;return}if(a===`signup`){let e=await ee(s,c);if(e.error)r(`Account created! Please sign in.`,`success`),a=`login`,o();else{let n=e.data.user.role||await b(e.data.user.id);r(`Account created successfully!`,`success`),t(e.data.user,n)}}else{let e=l.data.user.role||await b(l.data.user.id);t(l.data.user,e)}}};o()}var ie=`voice_alerts`,S=e=>Math.round(Number(e)||0).toLocaleString(`en-IN`),ae={new_service_request:{admin:`inquiries`,employee:`all-tickets`},new_assignment:{admin:`inquiries`,employee:`all-tickets`},job_completed:{admin:`inquiries`,employee:`all-tickets`},sla_breach:{admin:`inquiries`,employee:`all-tickets`},payment_received:{admin:`payments`,employee:`all-tickets`},cash_collected:{admin:`cash`,employee:`my-cash`},new_complaint:{admin:`complaints`},device_status:{admin:`device-tracking`,employee:`dashboard`},device_followup_reminder:{admin:`device-tracking`,employee:`dashboard`},notice_posted:{employee:`dashboard`},training_added:{admin:`training-courses`,employee:`my-training-courses`},leave_approved:{employee:`my-leaves`},leave_rejected:{employee:`my-leaves`},leave_request:{admin:`leaves`},eod_warning:{employee:`my-eod`},leaderboard_rank:{employee:`leaderboard`},finance_summary:{admin:`finance`}};function oe(e){let t=window.__appRole||`employee`,n=ae[e];return n&&(n[t]||n.admin||n.employee)||null}var C={payment_received:{icon:`💰`,label:`Payment Received`,voice:e=>e.data?.amount?`Rupees ${S(e.data.amount)} has been received${e.data?.ticket_no?` on ticket ${e.data.ticket_no}`:``}.`:`A payment has been received.`},cash_collected:{icon:`🧾`,label:`Cash Collected`,voice:e=>e.data?.amount?`Rupees ${S(e.data.amount)} cash has been collected by admin.`:`Cash has been collected by admin.`},new_assignment:{icon:`📋`,label:`New Assignment`,voice:()=>`A new service has been assigned to you.`},new_service_request:{icon:`🆕`,label:`New Service Request`,voice:()=>`A new service request has arrived.`},new_complaint:{icon:`⚠️`,label:`New Complaint`,voice:()=>`A new complaint has been filed.`},sla_breach:{icon:`⏰`,label:`Overdue`,voice:e=>e.body||`A ticket is overdue.`},overdue:{icon:`⏰`,label:`Overdue`,voice:e=>e.body||`A ticket is overdue.`},job_completed:{icon:`✅`,label:`Job Completed`,voice:e=>e.body||`A job has been completed.`},device_status:{icon:`🔧`,label:`Device Update`,voice:e=>e.body||`Device repair status updated.`},device_followup_reminder:{icon:`🔧`,label:`Device Follow-up`,voice:()=>`You have a device follow-up reminder.`},notice_posted:{icon:`📢`,label:`New Notice`,voice:e=>`New notice. ${e.title||``}`},leaderboard_rank:{icon:`🏆`,label:`Leaderboard`,voice:e=>e.body||`You are first on the leaderboard this month.`},training_added:{icon:`🎓`,label:`Training Added`,voice:e=>e.title?`New training added. ${e.title}`:`A new training program has been added.`},leave_approved:{icon:`✅`,label:`Leave Approved`,voice:()=>`Your leave request has been approved.`},leave_rejected:{icon:`🚫`,label:`Leave Rejected`,voice:()=>`Your leave request has been rejected.`},leave_request:{icon:`🌴`,label:`Leave Request`,voice:e=>e.body||`A new leave request needs your approval.`},eod_warning:{icon:`📝`,label:`EOD Reminder`,voice:()=>`Reminder. Please submit your end of day report.`},employee_clock_in:{icon:`🟢`,label:`Clock In`,voice:e=>e.body||`An employee clocked in.`},employee_clock_out:{icon:`🔴`,label:`Clock Out`,voice:e=>e.body||`An employee clocked out.`},finance_summary:{icon:`📊`,label:`Finance Summary`,voice:()=>`The daily finance summary is ready.`},feedback_received:{icon:`⭐`,label:`Feedback`,voice:()=>`New customer feedback received.`}};function se(e){return C[e]?.icon||`🔔`}function ce(e){return C[e]?.label||`Notification`}var le=!1,w=null;function ue(){if(w||typeof speechSynthesis>`u`)return w;let e=speechSynthesis.getVoices()||[];return w=e.find(e=>/en-IN/i.test(e.lang))||e.find(e=>/en-GB/i.test(e.lang))||e.find(e=>/^en/i.test(e.lang))||e[0]||null,w}if(typeof speechSynthesis<`u`)try{speechSynthesis.onvoiceschanged=()=>{w=null,ue()}}catch{}function T(){if(!(le||typeof speechSynthesis>`u`)){le=!0;try{let e=new SpeechSynthesisUtterance(` `);e.volume=0,speechSynthesis.speak(e)}catch{}}}document.addEventListener(`click`,T,{once:!0}),document.addEventListener(`touchstart`,T,{once:!0});function E(){return localStorage.getItem(ie)!==`0`}function de(e){if(!E()||typeof speechSynthesis>`u`)return;let t=e?.data?.voice;if(!t){let n=C[e?.subject];t=n?n.voice(e):e?.title?`${e.title}. ${e.body||``}`:e?.body||``}if(!(!t||!String(t).trim()))try{let e=new SpeechSynthesisUtterance(String(t).slice(0,240)),n=ue();n&&(e.voice=n),e.lang=n&&n.lang||`en-IN`,e.rate=1,e.pitch=1,e.volume=1;try{speechSynthesis.cancel()}catch{}speechSynthesis.speak(e)}catch{}}var D=e=>String(e??``).replace(/[&<>"]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`})[e]),fe=e=>{let t=new Date(e);return isNaN(t)?``:t.toLocaleString(`en-IN`,{dateStyle:`full`,timeStyle:`short`})};function O(e){if(!e)return;let t=e.data;if(typeof t==`string`)try{t=JSON.parse(t)}catch{t={}}t||={};let n=new Set([`voice`,`url`]),r={amount:`Amount`,ticket_no:`Ticket`,customer:`Customer`,employee:`Employee`,payment_method:`Payment Mode`,status:`Status`,service:`Service`,company:`Company`},i=Object.entries(t).filter(([e,t])=>!n.has(e)&&t!=null&&t!==``).map(([e,t])=>{let n=r[e]||e.replace(/_/g,` `).replace(/\b\w/g,e=>e.toUpperCase()),i=e===`amount`?`₹${S(t)}`:D(t);return`<div class="ntf-detail-row"><span class="ntf-detail-k">${D(n)}</span><span class="ntf-detail-v">${i}</span></div>`}).join(``);document.querySelectorAll(`.ntf-fullscreen`).forEach(e=>e.remove());let a=document.createElement(`div`);a.className=`ntf-fullscreen`,a.innerHTML=`
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
    </div>`,document.body.appendChild(a);let o=()=>a.remove();a.querySelector(`.ntf-fullscreen-close`).onclick=o,a.querySelector(`.ntf-fullscreen-dismiss`).onclick=o,a.addEventListener(`click`,e=>{e.target===a&&o()}),document.addEventListener(`keydown`,function e(t){t.key===`Escape`&&(o(),document.removeEventListener(`keydown`,e))});let s=a.querySelector(`.ntf-goto-btn`);s&&(s.onclick=()=>{let t=oe(e.subject);t&&window.__appNav&&(o(),window.__appNav(t))})}var pe=window.location.hostname!==`localhost`&&window.location.hostname!==`127.0.0.1`?`/api`:`http://localhost:5000/api`,me=()=>({"Content-Type":`application/json`,Authorization:`Bearer ${localStorage.getItem(`auth_token`)||``}`}),k=e=>String(e??``).replace(/[&<>"]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`})[e]),A=`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.7 4.6L18.3 8 13.7 9.7 12 14l-1.7-4.3L5.7 8l4.6-1.4L12 2zm6.5 9l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4zM6 13l.8 2 2 .8-2 .8L6 19l-.8-2-2-.8 2-.8L6 13z"/></svg>`,he=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>`,ge=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>`,_e=`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7L8 5z"/></svg>`;function ve(e){let t=k(e).replace(/\*\*(.+?)\*\*/g,`<strong>$1</strong>`),n=t.split(`
`),r=``,i=!1;for(let e of n){let t=e.trim();/^[-*•]\s+/.test(t)?(i||=(r+=`<ul>`,!0),r+=`<li>${t.replace(/^[-*•]\s+/,``)}</li>`):(i&&=(r+=`</ul>`,!1),t&&(r+=`<p>${t}</p>`))}return i&&(r+=`</ul>`),r||`<p>${t}</p>`}function ye(e){return e.embed?`<div class="ai-video">
      <div class="ai-video-frame"><iframe src="${k(e.embed)}" title="${k(e.title)}" frameborder="0" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>
      <div class="ai-video-title"><span class="ai-yt">${_e}</span>${k(e.title)}</div>
    </div>`:e.search?`<a class="ai-video ai-video--link" href="${k(e.search)}" target="_blank" rel="noopener">
      <span class="ai-yt ai-yt--lg">${_e}</span>
      <span class="ai-video-link-text"><b>${k(e.title)}</b><span>Watch solution videos on YouTube ↗</span></span>
    </a>`:`<div class="ai-video ai-video--empty">
    <div class="ai-video-title"><span class="ai-yt">${_e}</span>${k(e.title)}</div>
    <div class="ai-video-note">Video coming soon.</div>
  </div>`}var be=!1,xe=[];function Se(){if(be||document.getElementById(`ai-assistant-fab`))return;be=!0;let e=document.createElement(`div`);e.id=`ai-assistant-root`,e.innerHTML=`
    <button id="ai-assistant-fab" class="ai-fab" type="button" title="AI Solution Assistant" aria-label="Open AI Solution Assistant">
      <span class="ai-fab-icon">${A}</span>
      <span class="ai-fab-label">AI Assistant</span>
    </button>
    <div id="ai-assistant-panel" class="ai-panel" role="dialog" aria-modal="true" aria-label="AI Solution Assistant">
      <div class="ai-panel-head">
        <div class="ai-panel-id">
          <span class="ai-panel-avatar">${A}</span>
          <div class="ai-panel-meta">
            <span class="ai-panel-title">AI Solution Assistant</span>
            <span class="ai-panel-status"><span class="ai-panel-dot"></span>Online · powered by AI</span>
          </div>
        </div>
        <button class="ai-panel-close" type="button" aria-label="Close assistant">${he}</button>
      </div>
      <div class="ai-panel-body" id="ai-panel-body"></div>
      <form class="ai-panel-input" id="ai-panel-form">
        <input id="ai-panel-text" type="text" autocomplete="off"
          placeholder="Describe the problem, e.g. CCTV shows no signal…" />
        <button type="submit" class="ai-send-btn" aria-label="Send message">${ge}</button>
      </form>
    </div>`,document.body.appendChild(e);let t=e.querySelector(`#ai-assistant-fab`),n=e.querySelector(`#ai-assistant-panel`),r=e.querySelector(`#ai-panel-body`),i=e.querySelector(`#ai-panel-form`),a=e.querySelector(`#ai-panel-text`),o=()=>{r.scrollTop=r.scrollHeight},s=(e,t)=>{let n=document.createElement(`div`);return n.className=`ai-msg ai-msg--${e}`,n.innerHTML=t,r.appendChild(n),o(),n},c=()=>{r.childElementCount||s(`assistant`,`<p>Hi 👋 I'm your service assistant. Describe the problem you're facing on site and I'll walk you through the fix and point you to a solution video.</p>
      <div class="ai-suggests">
        ${[`CCTV shows no signal`,`View CCTV on mobile`,`Weak WiFi at site`,`Door lock not opening`].map(e=>`<button type="button" class="ai-suggest" data-q="${k(e)}">${k(e)}</button>`).join(``)}
      </div>`)},l=()=>n.classList.contains(`ai-panel--open`),u=()=>{n.classList.add(`ai-panel--open`),t.classList.add(`ai-fab--hidden`),c(),setTimeout(()=>a.focus(),60)},d=()=>{n.classList.remove(`ai-panel--open`),t.classList.remove(`ai-fab--hidden`)};t.addEventListener(`click`,()=>l()?d():u()),e.querySelector(`.ai-panel-close`).addEventListener(`click`,d),document.addEventListener(`keydown`,e=>{e.key===`Escape`&&l()&&d()}),r.addEventListener(`click`,e=>{let t=e.target.closest(`.ai-suggest`);t&&(a.value=t.dataset.q,f())});async function f(){let e=a.value.trim();if(!e)return;a.value=``,s(`user`,`<p>${k(e)}</p>`),xe.push({role:`user`,content:e});let t=s(`assistant`,`<div class="ai-typing"><span></span><span></span><span></span></div>`);try{let e=await fetch(`${pe}/ai/assistant`,{method:`POST`,headers:me(),body:JSON.stringify({messages:xe})}),n=await e.json().catch(()=>({}));if(!e.ok)throw Error(n.error||`Request failed`);xe.push({role:`assistant`,content:n.answer||``});let r=(n.videos||[]).map(ye).join(``);t.innerHTML=ve(n.answer||`No answer.`)+r}catch(e){t.innerHTML=`<p class="ai-error">${k(e.message||`Something went wrong. Please try again.`)}</p>`}o()}i.addEventListener(`submit`,e=>{e.preventDefault(),f()})}var Ce=new URL(`/assets/logo-Cuxe_Kd5.png`,``+import.meta.url).href,j=window.location.hostname!==`localhost`&&window.location.hostname!==`127.0.0.1`?`/api`:`http://localhost:5000/api`,M=()=>({Authorization:`Bearer ${localStorage.getItem(`auth_token`)||``}`}),N=null,we=!1;document.addEventListener(`click`,e=>{if(!e.target.closest(`#logout-btn`)||document.getElementById(`logout-confirm-modal`))return;let t=document.createElement(`div`);t.id=`logout-confirm-modal`,t.className=`modal-overlay`,t.innerHTML=`
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
    </div>`,document.body.appendChild(t);let n=()=>t.remove();t.querySelector(`#logout-cancel`).onclick=n,t.addEventListener(`click`,e=>{e.target===t&&n()}),t.querySelector(`#logout-confirm`).onclick=async()=>{let e=t.querySelector(`#logout-confirm`);e.disabled=!0,e.textContent=`Signing out…`,await x(),location.reload()}});function Te({user:t,role:r,activePage:i,navItems:a,onNav:o,pageContent:c}){let l=document.getElementById(`app`),u=t?.user_metadata?.full_name||t?.email?.split(`@`)[0]||`User`,d=localStorage.getItem(`theme`)||`light`,f=l.querySelector(`.portal-layout`);if(f&&f.dataset.role===r){let e=document.getElementById(`sidebar-nav`),t=e?e.scrollTop:0;Ee(a,i,o),e&&(e.scrollTop=t);let n=document.getElementById(`sidebar`),r=document.getElementById(`sidebar-overlay`),s=()=>{n?.classList.remove(`open`),r?.classList.remove(`active`)};s(),document.querySelectorAll(`.nav-item`).forEach(e=>e.addEventListener(`click`,s)),De(c,a,i);return}if(l.innerHTML=`
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
            <img src="${Ce}" alt="" onerror="this.style.display='none';this.parentElement.textContent='N'"/>
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
    </div>`,Ee(a,i,o),Oe(o,r),ke(o),Se(),!document.getElementById(`global-refresh-fab`)){let e=document.createElement(`button`);e.id=`global-refresh-fab`,e.className=`global-refresh-fab`,e.title=`Refresh page`,e.setAttribute(`aria-label`,`Refresh page`),e.innerHTML=`<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
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
    </svg>`,document.body.appendChild(e),e.addEventListener(`click`,()=>{typeof window.__softRefresh==`function`?window.__softRefresh():location.reload()})}l.querySelector(`.theme-toggle-btn`).addEventListener(`click`,e);let p=document.getElementById(`sidebar`),m=document.getElementById(`sidebar-overlay`),h=document.getElementById(`menu-toggle`),g=()=>{p.classList.remove(`open`),m.classList.remove(`active`)};h.onclick=()=>{p.classList.add(`open`),m.classList.add(`active`)},m.onclick=g,document.querySelectorAll(`.nav-item`).forEach(e=>e.addEventListener(`click`,g)),De(c,a,i)}function Ee(e,t,n){let r=document.getElementById(`sidebar-nav`);r.innerHTML=e.map(e=>{if(e.type===`section`)return`<div class="nav-section">${e.label}</div>`;let n=e.id===t?`active`:``,r=e.badge?`<span class="nav-badge">${e.badge}</span>`:``;return`<div class="nav-item ${n}" data-nav="${e.id}">
      <span class="nav-icon">${e.icon}</span>
      <span style="flex:1">${e.label}</span>
      ${r}
    </div>`}).join(``),r.querySelectorAll(`[data-nav]`).forEach(e=>{e.addEventListener(`click`,()=>n(e.dataset.nav))})}function De(e,t,n){let r=t.find(e=>e.id===n)?.label||``,i=n===`dashboard`?`Live overview of your operations`:n===`notifications`?`Alerts, assignments and updates`:n===`profile`?`Account details and preferences`:`NEST service portal`;document.getElementById(`topbar-title`).innerHTML=`<h1>${r}</h1><p>${i}</p>`;let a=document.getElementById(`page-content`);a.innerHTML=``,a.scrollTop=0,typeof e==`function`?e(a):a.innerHTML=e||``}function Oe(e,t){let n=document.getElementById(`portal-nav-search`),r=document.getElementById(`global-search-results`);if(!n||!r)return;let i=e=>String(e??``).replace(/[&<>"]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`})[e]),a=()=>[...document.querySelectorAll(`#sidebar-nav .nav-item[data-nav]`)].map(e=>({id:e.dataset.nav,label:(e.querySelector(`span:nth-child(2)`)?.textContent||e.textContent||``).trim(),icon:e.querySelector(`.nav-icon`)?.innerHTML||``})),o=null,c=!1,l=async()=>{if(!(o||c)){c=!0;try{let{data:e}=await y.from(`inquiries`).select(`id,ticket_no,full_name,phone,service_item,status`).order(`created_at`,{ascending:!1});o=Array.isArray(e)?e:[]}catch{o=[]}c=!1}},u=()=>{r.style.display=`block`},d=()=>{r.style.display=`none`},f=t=>{let c=t.toLowerCase(),l=a().filter(e=>e.label.toLowerCase().includes(c)).slice(0,6),f=(o||[]).filter(e=>(e.ticket_no||``).toLowerCase().includes(c)||(e.full_name||``).toLowerCase().includes(c)||(e.phone||``).toLowerCase().includes(c)||(e.service_item||``).toLowerCase().includes(c)).slice(0,6);if(!c){d();return}if(!l.length&&!f.length){r.innerHTML=`<div class="gs-empty">No results for "${i(t)}"${o?``:` — still loading…`}</div>`,u();return}r.innerHTML=`
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
    `,u(),r.querySelectorAll(`.gs-item`).forEach(t=>t.onclick=()=>{let r=t.dataset.type;if(n.value=``,d(),r===`page`)e(t.dataset.id);else{try{localStorage.setItem(`search_focus_ticket`,t.dataset.id)}catch{}e(`all-tickets`)}})},p=null;n.addEventListener(`input`,()=>{let e=n.value.trim();l().then(()=>{n.value.trim()===e&&f(e)}),clearTimeout(p),p=setTimeout(()=>f(e),120)}),n.addEventListener(`focus`,()=>{l(),n.value.trim()&&f(n.value.trim())}),n.addEventListener(`keydown`,e=>{e.key===`Escape`&&(n.value=``,d(),n.blur())}),document.addEventListener(`click`,e=>{e.target.closest(`.global-search-wrap`)||d()}),document.addEventListener(`keydown`,e=>{e.key===`/`&&document.activeElement!==n&&!/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||``)&&(e.preventDefault(),n.focus())})}function ke(e){let t=document.getElementById(`notif-bell`),n=document.getElementById(`notif-badge`),r=document.getElementById(`notif-dropdown`);if(!t||!n||!r)return;let i=e=>String(e??``).replace(/[&<>"]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`})[e]),a=e=>{let t=new Date(e);return isNaN(t)?``:t.toLocaleString(`en-IN`,{day:`2-digit`,month:`short`,hour:`2-digit`,minute:`2-digit`})},o=e=>{e>0?(n.textContent=e>99?`99+`:String(e),n.style.display=`flex`):n.style.display=`none`},s=async()=>{try{o((await(await fetch(`${j}/notifications/unread-count`,{headers:M()})).json()).unread||0)}catch{}},c=t=>{if(!t.length){r.innerHTML=`<div class="notif-empty">No notifications yet</div>`;return}r.innerHTML=`
      <div class="notif-head"><b>Notifications</b><button class="notif-link" id="notif-readall">Mark all read</button></div>
      <div class="notif-list">
        ${t.slice(0,12).map(e=>`
          <div class="notif-item ${e.read_at?``:`unread`}" data-id="${e.id}">
            <div class="notif-item-title">${i(e.title||`Update`)}</div>
            <div class="notif-item-body">${i(e.body||``)}</div>
            <div class="notif-item-time">${a(e.created_at)}</div>
          </div>`).join(``)}
      </div>
      <div class="notif-foot"><button class="notif-link" id="notif-viewall">View all notifications</button></div>`,r.querySelector(`#notif-readall`).onclick=async e=>{e.stopPropagation();try{await fetch(`${j}/notifications/read-all`,{method:`POST`,headers:M()})}catch{}l(),s()},r.querySelector(`#notif-viewall`).onclick=t=>{t.stopPropagation(),r.style.display=`none`,e(`notifications`)},r.querySelectorAll(`.notif-item`).forEach(e=>e.onclick=async()=>{let n=t.find(t=>String(t.id)===String(e.dataset.id));if(n&&(r.style.display=`none`,O(n)),e.classList.contains(`unread`)){try{await fetch(`${j}/notifications/${e.dataset.id}/read`,{method:`POST`,headers:M()})}catch{}e.classList.remove(`unread`),s()}})},l=async()=>{r.style.display=`block`,r.innerHTML=`<div class="notif-empty">Loading…</div>`;try{let e=await(await fetch(`${j}/notifications`,{headers:M()})).json();c(e.items||[]),o(e.unread||0)}catch{r.innerHTML=`<div class="notif-empty">Could not load</div>`}};if(t.onclick=e=>{e.stopPropagation(),r.style.display===`block`?r.style.display=`none`:l()},we||=(document.addEventListener(`click`,e=>{let t=document.getElementById(`notif-dropdown`),n=document.getElementById(`notif-bell`);t&&n&&!t.contains(e.target)&&!n.contains(e.target)&&(t.style.display=`none`)}),!0),N){try{N()}catch{}N=null}N=g(null,()=>{s(),document.getElementById(`notif-dropdown`)?.style.display===`block`&&l()}),s()}var Ae=class{constructor(e,t=[],n={}){if(this.container=document.getElementById(e),!this.container)throw Error(`Container #${e} not found`);let r=window.matchMedia(`(max-width: 767px)`).matches;this.ads=t.filter(e=>{if(!e||!e.url)return!1;let t=e.device_target||`both`;return!(t===`mobile`&&!r||t===`desktop`&&r)}),this.currentIndex=0,this.autoRotateMs=n.autoRotateMs??5e3,this.rotateTimer=null,this.isPlaying=!0,this.render(),this.setupEventListeners(),this.startAutoRotate()}render(){this.container.innerHTML=`
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
    `,this.updateMedia()}updateMedia(){if(this.ads.length===0)return;let e=this.ads[this.currentIndex],t=this.container.querySelector(`.ad-carousel__media-slot`);(e.kind||`image`).toLowerCase()===`video`?(t.innerHTML=`
        <div class="ad-carousel__video-wrap">
          <video class="ad-carousel__video" preload="metadata" playsinline controls
                 src="${e.url}#t=0.1"></video>
          <button type="button" class="ad-carousel__video-play" aria-label="Play ad with sound">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
      `,this.bindVideoPlayback(t)):t.innerHTML=`
        <img class="ad-carousel__image" src="${e.url}" alt="Ad" loading="lazy" />
      `,this.container.querySelectorAll(`.ad-carousel__indicator`).forEach((e,t)=>{e.classList.toggle(`active`,t===this.currentIndex)})}bindVideoPlayback(e){let t=e.querySelector(`.ad-carousel__video`),n=e.querySelector(`.ad-carousel__video-play`);!t||!n||(n.addEventListener(`click`,()=>{this.pauseAutoRotate(),t.muted=!1;let e=t.play();e&&e.catch&&e.catch(()=>{})}),t.addEventListener(`play`,()=>n.classList.add(`is-hidden`)),t.addEventListener(`pause`,()=>n.classList.remove(`is-hidden`)),t.addEventListener(`ended`,()=>{n.classList.remove(`is-hidden`),this.resumeAutoRotate()}))}setupEventListeners(){let e=this.container.querySelector(`.ad-carousel__nav--prev`),t=this.container.querySelector(`.ad-carousel__nav--next`),n=this.container.querySelector(`.ad-carousel__play-btn`),r=this.container.querySelectorAll(`.ad-carousel__indicator`);e?.addEventListener(`click`,()=>this.prev()),t?.addEventListener(`click`,()=>this.next()),n?.addEventListener(`click`,()=>this.toggleAutoRotate()),r.forEach(e=>{e.addEventListener(`click`,()=>{this.currentIndex=parseInt(e.dataset.index),this.updateMedia(),this.resetAutoRotate()})}),this.container.addEventListener(`mouseenter`,()=>this.pauseAutoRotate()),this.container.addEventListener(`mouseleave`,()=>this.resumeAutoRotate())}prev(){this.currentIndex=(this.currentIndex-1+this.ads.length)%this.ads.length,this.updateMedia(),this.resetAutoRotate()}next(){this.currentIndex=(this.currentIndex+1)%this.ads.length,this.updateMedia(),this.resetAutoRotate()}toggleAutoRotate(){this.isPlaying?this.pauseAutoRotate():this.resumeAutoRotate()}pauseAutoRotate(){this.rotateTimer&&=(clearTimeout(this.rotateTimer),null),this.isPlaying=!1,this.updatePlayButton()}resumeAutoRotate(){this.isPlaying=!0,this.startAutoRotate(),this.updatePlayButton()}startAutoRotate(){!this.isPlaying||this.ads.length<=1||(this.rotateTimer=setInterval(()=>{this.currentIndex=(this.currentIndex+1)%this.ads.length,this.updateMedia()},this.autoRotateMs))}resetAutoRotate(){this.rotateTimer&&clearInterval(this.rotateTimer),this.startAutoRotate()}updatePlayButton(){let e=this.container.querySelector(`.ad-carousel__play-btn`);e&&(this.isPlaying?e.innerHTML=`
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13 8A5 5 0 1 1 3 8a5 5 0 0 1 10 0ZM6.5 5.5v5l3.5-2.5z"/>
        </svg>
      `:e.innerHTML=`
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13 8A5 5 0 1 1 3 8a5 5 0 0 1 10 0ZM5.5 5.5v5l4-2.5z"/>
        </svg>
      `)}destroy(){this.rotateTimer&&clearInterval(this.rotateTimer),this.container.innerHTML=``}updateAds(e){let t=window.matchMedia(`(max-width: 767px)`).matches;this.ads=e.filter(e=>{if(!e||!e.url)return!1;let n=e.device_target||`both`;return!(n===`mobile`&&!t||n===`desktop`&&t)}),this.currentIndex=0,this.render(),this.setupEventListeners(),this.startAutoRotate()}},je=new URL(`/assets/logo-Cuxe_Kd5.png`,``+import.meta.url).href,Me=window.location.hostname!==`localhost`&&window.location.hostname!==`127.0.0.1`?`/api`:`http://localhost:5000/api`,Ne=`8899133144`,Pe=`+91 88991 33144`,Fe=`tel:+91${Ne}`,Ie=`https://wa.me/91${Ne}?text=Hello%20Networking%20Experts%2C%20I%20need%20help%20with%20a%20service%20request.`;async function P(e,t){try{let n=await fetch(`${Me}${e}`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(t)}),r=await n.json().catch(()=>({}));return n.ok?{ok:!0,...r}:{ok:!1,error:r.error||`Request failed`}}catch(e){return{ok:!1,error:e.message||`Network request failed`}}}var Le=e=>P(`/otp/send`,{phone:e}),Re=(e,t)=>P(`/otp/verify`,{phone:e,otp:t}),ze=e=>P(`/otp/resend`,{phone:e}),Be=`nest_landing_ads_v2`,Ve=600*1e3,He=`nest_landing_bootstrap_v1`,Ue=600*1e3;function We(){let e=new Date;return`NE-${String(e.getFullYear()).slice(-2)}${String(e.getMonth()+1).padStart(2,`0`)}${String(e.getDate()).padStart(2,`0`)}-${String(Math.floor(1e3+Math.random()*9e3))}`}var Ge=[`open`,`assigned`,`in_progress`,`resolved`],Ke={pending:`Received`,open:`Received`,assigned:`Assigned`,in_progress:`In Progress`,resolved:`Resolved`,closed:`Resolved`};function qe(e){return e===`closed`?`resolved`:e||`open`}var Je=[{value:`internet-down`,label:`Internet down`},{value:`slow-connection`,label:`Slow connection`},{value:`wifi-issue`,label:`Wi-Fi issue`},{value:`cctv-not-working`,label:`CCTV not working`},{value:`camera-offline`,label:`Camera offline`},{value:`hardware-repair`,label:`Hardware repair`},{value:`software-issue`,label:`Software issue`},{value:`new-installation`,label:`New installation`},{value:`other`,label:`Other (specify below)`}],Ye={value:`other`,label:`Other (specify below)`};function Xe(e){return String(e||``).toLowerCase().trim().replace(/[^a-z0-9]+/g,`-`).replace(/^-+|-+$/g,``)||`option`}function Ze(){try{let e=JSON.parse(localStorage.getItem(Be)||`null`);return!e||!Array.isArray(e.ads)||!e.ads.length||Date.now()-Number(e.savedAt||0)>Ve?[]:e.ads.map(e=>({...e,url:tt(e.url)})).filter(e=>e.url)}catch{return[]}}function Qe(e){try{localStorage.setItem(Be,JSON.stringify({savedAt:Date.now(),ads:e}))}catch{}}function $e(){try{let e=JSON.parse(localStorage.getItem(He)||`null`);return!e||Date.now()-Number(e.savedAt||0)>Ue?null:e.data||null}catch{return null}}function et(e){try{localStorage.setItem(He,JSON.stringify({savedAt:Date.now(),data:e}))}catch{}}function tt(e){let t=String(e||``).trim();return t?/^(https?:)?\/\//i.test(t)||t.startsWith(`/`)?t:/^[A-Za-z0-9._-]+\.(png|jpe?g|gif|webp|mp4|webm|ogg)$/i.test(t)?`/uploads/${t}`:``:``}function nt(e){if(!e?.url)return Promise.resolve();let t=(e.kind||`image`).toLowerCase()===`video`;return new Promise(n=>{let r=()=>{clearTimeout(i),n()},i=setTimeout(n,8e3);if(t){let t=document.createElement(`video`);t.muted=!0,t.preload=`metadata`,t.playsInline=!0,t.onloadeddata=r,t.onloadedmetadata=r,t.onerror=r,t.src=e.url,t.load();return}let a=new Image;a.onload=r,a.onerror=r,a.src=e.url,a.decode&&a.decode().then(r).catch(()=>{})})}async function rt(e){await Promise.all((e||[]).map(nt))}function it({maxWaitMs:e=8e3}={}){return new Promise((t,n)=>{if(!navigator.geolocation)return n(Error(`Geolocation not supported`));let r=!1,i=()=>{navigator.geolocation.getCurrentPosition(e=>{r||(r=!0,t(e))},e=>{r||(r=!0,n(e))},{enableHighAccuracy:!1,timeout:6e3,maximumAge:6e4})},a=setTimeout(i,e);navigator.geolocation.getCurrentPosition(e=>{clearTimeout(a),r||(r=!0,t(e))},()=>{clearTimeout(a),r||i()},{enableHighAccuracy:!0,timeout:e,maximumAge:0})})}async function at(e,t){return(await(await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e}&lon=${t}&zoom=18&addressdetails=1`)).json()).display_name||``}function ot(e,t){return`https://www.google.com/maps?q=${encodeURIComponent(`${e},${t}`)}`}var st=[{label:`CCTV Camera Installation`,icon:`📹`,tagline:`HD/IP cameras, DVR/NVR & remote viewing`,includes:[`Site survey & camera placement`,`Cabling, DVR/NVR & storage setup`,`Mobile + desktop remote viewing`,`Demo & 30-day support`]},{label:`Networking & LAN Setup`,icon:`🌐`,tagline:`Structured cabling, switches & routers`,includes:[`LAN/WAN design & cabling`,`Router, switch & firewall config`,`IP planning & testing`,`Labelling & documentation`]},{label:`WiFi / Access Point Setup`,icon:`📶`,tagline:`Whole-home / office coverage`,includes:[`Coverage heat-map survey`,`Access point mounting & config`,`Seamless roaming setup`,`Speed & coverage testing`]},{label:`Biometric & Access Control`,icon:`🔒`,tagline:`Fingerprint, RFID & door locks`,includes:[`Device mounting & wiring`,`User enrolment & software`,`Door lock / strike integration`,`Attendance & report setup`]},{label:`Video Door Phone / Intercom`,icon:`🔔`,tagline:`See & speak to visitors`,includes:[`Outdoor + indoor unit install`,`Wiring & power setup`,`Mobile call forwarding`,`Demo & handover`]},{label:`Smart Home Automation`,icon:`🏠`,tagline:`Lights, sensors & smart control`,includes:[`Needs assessment`,`Device & hub installation`,`App & voice control setup`,`Training & support`]}];function ct(t,n){let i=new URLSearchParams(window.location.search),a=i.get(`tab`),c=i.get(`ticket`)||``,l=(i.get(`phone`)||``).replace(/^\+91/,``).replace(/\D/g,``),u=a===`install`&&i.get(`type`)?i.get(`type`):``,d=window.location.pathname.match(/^\/f\/([^/?#]+)/)?.[1]||``,f=(i.get(`token`)||i.get(`feedback`)||i.get(`f`)||d||``).trim(),p=$e(),m=Ze(),h={mode:a===`track`||f?`track`:`new`,step:1,phone:``,otp:``,captcha:F(),locationMode:`gps`,locationValue:``,coords:null,customerName:``,billNo:``,preferredTime:`Morning (10 AM - 1 PM)`,otherIssue:``,description:``,ticketNo:``,trackTicketNo:c,trackPhone:l,trackResult:null,trackList:null,trackLoading:!1,isFeedbackPage:!!f,feedbackToken:f,feedbackLoading:!!f,feedbackError:``,complaintTicketNo:``,complaintPhone:``,complaintText:``,complaintLoading:!1,complaintSubmitted:!1,reopenText:``,reopenLoading:!1,reopenSubmitted:!1,reopenButtonEnabled:p?.reopenButtonEnabled!==!1,reopenLimit:typeof p?.reopenLimit==`number`?p.reopenLimit:2,ads:p?.ads||m,adsLoading:!1,popupAds:p?.popupAds||[],popupEnabled:p?.popupEnabled!==!1,_popupShown:!1,adIndex:0,_adTimer:null,issueOptions:Array.isArray(p?.issueOptions)&&p.issueOptions.length?p.issueOptions:Je,issueValue:``,installType:u||``};function g(){if(h.isFeedbackPage){_();return}let e=(localStorage.getItem(`theme`)||`light`)===`dark`?s.sun:s.moon;t.innerHTML=`
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
        .srf-install-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:14px; margin-top:6px; }
        .srf-install-card { border:1px solid var(--border); border-radius:16px; padding:16px; background:var(--bg); display:flex; flex-direction:column; gap:12px; transition:transform .15s, box-shadow .15s, border-color .15s; }
        .srf-install-card:hover { transform:translateY(-3px); box-shadow:0 12px 30px rgba(15,23,42,0.10); border-color:var(--primary); }
        .srf-install-head { display:flex; align-items:flex-start; gap:12px; }
        .srf-install-emoji { font-size:1.7rem; line-height:1; }
        .srf-install-name { font-weight:800; font-size:0.98rem; color:var(--text); }
        .srf-install-tag { font-size:0.78rem; color:var(--text-dim); margin-top:2px; }
        .srf-install-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:7px; }
        .srf-install-list li { display:flex; align-items:flex-start; gap:8px; font-size:0.82rem; color:var(--text-soft); }
        .srf-install-list li svg { width:15px; height:15px; color:var(--primary); flex:0 0 auto; margin-top:2px; }
        .srf-install-book { margin-top:auto; }
        .srf-install-banner { display:flex; align-items:center; gap:12px; padding:12px 14px; border-radius:14px; background:rgba(16,185,129,0.08); border:1px solid var(--primary); margin-bottom:14px; }
        .srf-install-banner svg { width:22px; height:22px; color:var(--primary); flex:0 0 auto; }
        .srf-install-banner-label { font-size:0.7rem; text-transform:uppercase; letter-spacing:.05em; color:var(--primary); font-weight:800; }
        .srf-install-banner-name { font-weight:800; color:var(--text); font-size:0.95rem; }
        .srf-install-change { margin-left:auto; background:none; border:1px solid var(--border); border-radius:10px; padding:6px 12px; font-size:0.78rem; font-weight:700; color:var(--text); cursor:pointer; }
      </style>
      <div class="srf-page">
        ${h.adsLoading?`
          <div class="srf-loading-screen" role="status" aria-live="polite">
            <div class="srf-loading-card">
              <img src="${je}" alt="Networking Experts" class="srf-loading-logo"
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
              <img src="${je}" alt="" onerror="this.style.display='none';this.parentElement.textContent='N'"/>
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
            ${h.ads.length>0?`
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
                <button class="srf-mode-tab ${h.mode===`new`?`active`:``}" data-mode="new" role="tab">
                  ${s.wrench}<span>New Request</span>
                </button>
                <button class="srf-mode-tab ${h.mode===`track`?`active`:``}" data-mode="track" role="tab">
                  ${s.search}<span>Track Request</span>
                </button>
                <button class="srf-mode-tab ${h.mode===`complaint`?`active`:``}" data-mode="complaint" role="tab">
                  ${s.shield}<span>Complaint</span>
                </button>
                <button class="srf-mode-tab ${h.mode===`install`?`active`:``}" data-mode="install" role="tab">
                  ${s.box}<span>Installation</span>
                </button>
              </div>
              <div class="srf-req-body">
                <div id="srf-stepper-wrap">${ne()}</div>
                <div class="srf-card" id="srf-card">
                  ${ie()}
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
    `,de(),D(),ee()}function _(){let e=(localStorage.getItem(`theme`)||`light`)===`dark`?s.sun:s.moon,n=h.trackResult,r=n?qe(n.status):``,i=n?.feedback_rating!=null,a=n&&!i&&!h.feedbackLoading&&!h.feedbackError;t.innerHTML=`
      <div class="srf-page srf-feedback-page">
        <div class="bg-mesh" aria-hidden="true"><span class="m1"></span><span class="m2"></span><span class="m3"></span><span class="m4"></span></div>

        <nav class="srf-nav">
          <img src="${je}" alt="Networking Experts" class="srf-logo"
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
              ${h.feedbackLoading?`
                <div style="text-align:center;padding:32px 10px;">
                  <span class="srf-spin"></span>
                  <h2 class="srf-card-title" style="margin-top:18px;">Opening feedback</h2>
                  <p class="srf-card-sub">Please wait while we verify your secure link.</p>
                </div>
              `:h.feedbackError?`
                <div style="text-align:center;padding:28px 10px;">
                  <div style="width:58px;height:58px;border-radius:18px;margin:0 auto 16px;background:rgba(239,68,68,.10);color:var(--danger);display:flex;align-items:center;justify-content:center;">${s.shield}</div>
                  <h2 class="srf-card-title">Feedback link unavailable</h2>
                  <p class="srf-card-sub">${L(h.feedbackError)}</p>
                  <button class="srf-btn srf-btn-secondary" id="srf-feedback-home-2">${s.arrowLeft}<span>Open service portal</span></button>
                </div>
              `:i?`
                <div class="srf-fb-done" style="box-shadow:none;margin:0;">
                  <div class="srf-fb-done-ring">${s.star}</div>
                  <h2 style="font-weight:800;font-size:1.25rem;color:var(--text);margin:0 0 8px;">Thank you for your feedback</h2>
                  <p style="font-size:0.95rem;color:var(--text-soft);margin:0 0 8px;">You rated us <strong style="color:var(--warning)">${n.feedback_rating}/5 ★</strong></p>
                  ${n.feedback_comment?`<p style="font-size:0.88rem;color:var(--text-soft);font-style:italic;margin:0;">"${L(n.feedback_comment)}"</p>`:``}
                </div>
              `:a?`
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:22px;">
                  <div style="padding:14px;border-radius:14px;background:var(--bg-soft);border:1px solid var(--border);">
                    <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);font-weight:800;">Ticket</div>
                    <div style="margin-top:4px;font-weight:800;color:var(--text);">${L(n.ticket_no||`-`)}</div>
                  </div>
                  <div style="padding:14px;border-radius:14px;background:var(--bg-soft);border:1px solid var(--border);">
                    <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);font-weight:800;">Status</div>
                    <div style="margin-top:4px;font-weight:800;color:var(--primary);">${L(Ke[r]||r||`-`)}</div>
                  </div>
                  <div style="grid-column:1/-1;padding:14px;border-radius:14px;background:var(--bg-soft);border:1px solid var(--border);">
                    <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);font-weight:800;">Service</div>
                    <div style="margin-top:4px;font-weight:800;color:var(--text);">${L(n.service_item||`-`)}</div>
                    <div style="margin-top:3px;font-size:.86rem;color:var(--text-soft);">${L(n.full_name||`Customer`)}</div>
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
    `,he()}function v(e){if(!e?.url)return;let t=(e.kind||`image`).toLowerCase()===`video`,n=document.createElement(`div`);n.className=`media-popup-overlay`,n.innerHTML=`
      <div class="media-popup-dialog" role="dialog" aria-modal="true">
        <button type="button" class="media-popup-close" aria-label="Close">${s.close}</button>
        <div class="media-popup-frame">
          ${t?`<video src="${I(e.url)}#t=0.1" controls playsinline preload="metadata"></video>`:`<img src="${I(e.url)}" alt="${I(e.caption||`Advertisement`)}"/>`}
        </div>
        ${e.caption?`<div class="media-popup-caption">${L(e.caption)}</div>`:``}
      </div>
    `,document.body.appendChild(n);let r=()=>n.remove();n.querySelector(`.media-popup-close`).onclick=r,n.addEventListener(`click`,e=>{e.target===n&&r()})}async function b(){if(h._popupShown)return;let e=h.popupAds.find(Boolean);!e||h.popupEnabled===!1||(h._popupShown=!0,setTimeout(()=>v(e),500))}function ee(){if(h._adTimer&&=(clearTimeout(h._adTimer),null),h._adCarousel&&h._adCarousel.destroy(),h.ads.length&&t.querySelector(`#srf-ad-slot`))try{h._adCarousel=new Ae(`srf-ad-slot`,h.ads,{autoRotateMs:5e3})}catch(e){console.warn(`AdCarousel mount failed:`,e)}}function te(e){let t=Date.now(),n=window.matchMedia(`(max-width: 767px)`).matches;return(e||[]).map(e=>({...e,url:tt(e.url)})).filter(e=>{if(!e.url||e.kind!==`image`&&e.kind!==`video`)return!1;let r=e.device_target||`both`;return!(r===`mobile`&&!n||r===`desktop`&&n||e.starts_at&&new Date(e.starts_at).getTime()>t||e.expires_at&&new Date(e.expires_at).getTime()<=t)})}async function x(){try{let e=await fetch(`${Me}/landing/bootstrap`);if(!e.ok)throw Error(`Landing bootstrap failed (${e.status})`);let t=await e.json(),n=te(t.ads),r=n.filter(e=>(e.placement||`landing`)===`landing`);h.popupAds=n.filter(e=>e.placement===`popup_landing`),h.popupEnabled=t.popupEnabled!==!1,h.reopenButtonEnabled=t.reopenButtonEnabled!==!1,h.reopenLimit=typeof t.reopenLimit==`number`?t.reopenLimit:2;let i=new Map;(t.categories||[]).forEach(e=>{let t=String(e||``).trim();if(!t)return;let n=Xe(t);i.has(n)||i.set(n,{value:n,label:t})}),h.issueOptions=i.size?[...i.values(),Ye]:Je,h.ads=r,Qe(r),et({ads:r,popupAds:h.popupAds,issueOptions:h.issueOptions,popupEnabled:h.popupEnabled,reopenButtonEnabled:h.reopenButtonEnabled,reopenLimit:h.reopenLimit}),g(),rt(r).catch(()=>{}),b()}catch(e){console.warn(`Could not refresh landing content:`,e)}}function ne(){return h.mode===`new`?`
      <div class="srf-stepper">
        ${[1,2,3].map(e=>`
          <div class="srf-step ${h.step===e?`active`:``} ${h.step>e?`done`:``}">
            <div class="srf-step-dot">${h.step>e?s.check:e}</div>
            <span>${[`Verify`,`OTP`,`Details`][e-1]}</span>
          </div>
          ${e<3?`<div class="srf-step-line ${h.step>e?`done`:``}"></div>`:``}
        `).join(``)}
      </div>
    `:``}function re(){t.querySelectorAll(`.srf-mode-tab`).forEach(e=>{e.classList.toggle(`active`,e.dataset.mode===h.mode)});let e=t.querySelector(`#srf-stepper-wrap`);e&&(e.innerHTML=ne());let n=t.querySelector(`#srf-card`);n&&(n.innerHTML=ie()),D()}function ie(){return h.mode===`track`?w():h.mode===`complaint`?le():h.mode===`install`?C():h.step===1?S():h.step===2?ae():h.step===3?oe():ce()}function S(){return`
      <h2 class="srf-card-title">Enter your mobile number</h2>
      <p class="srf-card-sub">We'll send a one-time code to verify it's you.</p>

      <label class="srf-label" for="srf-phone">Phone number</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.phone}</span>
        <span class="srf-cc">+91</span>
        <input id="srf-phone" type="tel" inputmode="numeric" maxlength="10"
               placeholder="98765 43210" class="srf-input srf-input-cc" value="${h.phone}" />
      </div>

      <label class="srf-label" for="srf-captcha">Quick check: type these letters</label>
      <div style="display:inline-flex;gap:6px;align-items:center;margin:2px 0 8px;padding:8px 12px;border-radius:10px;background:var(--bg-soft);border:1px solid var(--border);font-size:1.05rem;font-weight:900;letter-spacing:0.22em;color:var(--primary);user-select:none;">
        ${h.captcha.code.split(``).map(e=>`<span>${e}</span>`).join(``)}
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
    `}function ae(){return`
      <button class="srf-back" id="srf-back">${s.arrowLeft}<span>Back</span></button>
      <h2 class="srf-card-title">Enter the 6-digit code</h2>
      <p class="srf-card-sub">Sent by SMS to <strong>+91 ${lt(h.phone)}</strong></p>

      <div class="srf-otp-row">
        ${Array.from({length:6}).map((e,t)=>`
          <input class="srf-otp-box" maxlength="1" inputmode="numeric" data-idx="${t}" />
        `).join(``)}
      </div>

      <button class="srf-btn srf-btn-primary" id="srf-verify-otp">
        <span>Verify & continue</span> ${s.arrowRight}
      </button>

      <button class="srf-btn-link" id="srf-resend">Resend code</button>
    `}function oe(){return`
      <h2 class="srf-card-title">${h.installType?`Book your installation`:`Tell us what's wrong`}</h2>
      <p class="srf-card-sub">${h.installType?`A few details and we'll schedule your visit.`:`A few quick details so we can help fast.`}</p>

      <label class="srf-label" for="srf-name">Your name</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.user}</span>
        <input id="srf-name" type="text" placeholder="Full name" class="srf-input" value="${I(h.customerName)}" />
      </div>

      <label class="srf-label">Location</label>
      <div class="srf-segmented">
        <button type="button" data-mode="gps" class="srf-seg ${h.locationMode===`gps`?`active`:``}">
          ${s.crosshair}<span>Current</span>
        </button>
        <button type="button" data-mode="manual" class="srf-seg ${h.locationMode===`manual`?`active`:``}">
          ${s.edit}<span>Manual</span>
        </button>
      </div>

      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.pin}</span>
        <input id="srf-location" type="text"
               placeholder="${h.locationMode===`gps`?`Tap "Detect" to auto-fill…`:`Type your address…`}"
               class="srf-input" value="${h.locationValue}" ${h.locationMode===`gps`?`readonly`:``}/>
        ${h.locationMode===`gps`?`<button type="button" class="srf-input-action" id="srf-detect">${s.crosshair}</button>`:``}
      </div>

      ${h.coords?`
        <a href="${I(ot(h.coords.lat,h.coords.lng))}" target="_blank" rel="noopener"
           style="display:inline-flex;align-items:center;gap:6px;margin:6px 0 12px;color:var(--primary);font-size:0.78rem;font-weight:700;text-decoration:none;">
          ${s.pin}<span>Open exact pin (${Math.round(Number(h.coords.accuracy)||0)}m accuracy)</span>
        </a>
      `:``}

      <label class="srf-label" for="srf-time">Preferred Visit Time</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.clock}</span>
        <select id="srf-time" class="srf-input srf-select">
          ${[`Morning (10 AM - 1 PM)`,`Afternoon (1 PM - 4 PM)`,`Evening (4 PM - 6 PM)`,`Tomorrow Morning`,`I'm Flexible`].map(e=>`<option value="${I(e)}" ${h.preferredTime===e?`selected`:``}>${L(e)}</option>`).join(``)}
        </select>
      </div>

      <label class="srf-label" for="srf-bill">Device bill number <span class="srf-optional">(optional)</span></label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.receipt}</span>
        <input id="srf-bill" type="text" placeholder="e.g. INV-2024-001" class="srf-input" value="${I(h.billNo)}" />
      </div>

      ${h.installType?`
      <div class="srf-install-banner">
        ${s.shield}
        <div>
          <div class="srf-install-banner-label">Installation booking</div>
          <div class="srf-install-banner-name">${L(h.installType)}</div>
        </div>
        <button type="button" class="srf-install-change" id="srf-install-change">Change</button>
      </div>
      `:`
      <label class="srf-label" for="srf-issue">What's the issue?</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.wrench}</span>
        <select id="srf-issue" class="srf-input srf-select">
          <option value="">Select an issue…</option>
          ${h.issueOptions.map(e=>`<option value="${I(e.value)}" ${h.issueValue===e.value?`selected`:``}>${L(e.label)}</option>`).join(``)}
        </select>
      </div>
      <div class="srf-input-wrap srf-other-wrap" id="srf-other-wrap" style="display:none;">
        <span class="srf-input-icon">${s.edit}</span>
        <input id="srf-other" type="text" placeholder="Describe your issue briefly" class="srf-input" value="${I(h.otherIssue)}" />
      </div>
      `}

      <label class="srf-label" for="srf-desc">Describe the problem <span class="srf-optional">(optional)</span></label>
      <div class="srf-input-wrap" style="align-items:flex-start;">
        <span class="srf-input-icon" style="margin-top:12px;">${s.edit}</span>
        <textarea id="srf-desc" rows="3" maxlength="1000"
                  placeholder="Anything our technician should know — model, when it started, what you tried, etc."
                  class="srf-input"
                  style="padding-top:12px;padding-bottom:12px;resize:vertical;min-height:84px;">${h.description?String(h.description).replace(/[<>]/g,``):``}</textarea>
      </div>

      <button class="srf-btn srf-btn-primary" id="srf-submit">
        <span>Submit request</span> ${s.arrowRight}
      </button>
    `}function C(){return`
      <h2 class="srf-card-title">Book an installation</h2>
      <p class="srf-card-sub">Pick what you'd like installed — we'll verify your number and schedule a visit.</p>
      <div class="srf-install-grid">
        ${st.map(e=>`
          <div class="srf-install-card">
            <div class="srf-install-head">
              <span class="srf-install-emoji">${e.icon}</span>
              <div>
                <div class="srf-install-name">${L(e.label)}</div>
                <div class="srf-install-tag">${L(e.tagline)}</div>
              </div>
            </div>
            <ul class="srf-install-list">
              ${e.includes.map(e=>`<li>${s.check}<span>${L(e)}</span></li>`).join(``)}
            </ul>
            <button class="srf-btn srf-btn-primary srf-install-book" data-install="${I(e.label)}">
              <span>Book this</span> ${s.arrowRight}
            </button>
          </div>
        `).join(``)}
      </div>
    `}function se(){t.querySelectorAll(`.srf-install-book`).forEach(e=>{e.onclick=()=>{h.installType=e.dataset.install||``,h.mode=`new`,h.step=1,g()}})}function ce(){return`
      <div class="srf-success">
        <div class="srf-success-ring">${s.check}</div>
        <h2 class="srf-card-title">Request received!</h2>
        <p class="srf-card-sub">Save your ticket number — you can track progress anytime from the <strong>Track Request</strong> tab.</p>

        <div class="srf-ticket-pill">
          ${s.ticket}
          <span class="srf-ticket-no" id="srf-ticket-no">${h.ticketNo}</span>
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
    `}function le(){return h.complaintSubmitted?`
        <div class="srf-success">
          <div class="srf-success-ring">${s.check}</div>
          <h2 class="srf-card-title">Complaint received</h2>
          <p class="srf-card-sub">Our team has been notified and will follow up on ticket <strong>${h.complaintTicketNo}</strong> soon.</p>
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
               value="${h.complaintTicketNo}" autocomplete="off"/>
      </div>

      <label class="srf-label" for="srf-cmp-phone">Phone number</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.phone}</span>
        <span class="srf-cc">+91</span>
        <input id="srf-cmp-phone" type="tel" inputmode="numeric" maxlength="10"
               placeholder="98765 43210" class="srf-input srf-input-cc" value="${h.complaintPhone}"/>
      </div>

      <label class="srf-label" for="srf-cmp-text">What's the issue?</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.edit}</span>
        <textarea id="srf-cmp-text" placeholder="Describe what went wrong — the issue came back, the technician didn't show, billing was wrong, etc." class="srf-input" rows="4" maxlength="2000" style="padding-top:12px;padding-bottom:12px;resize:vertical;min-height:100px;">${L(h.complaintText)}</textarea>
      </div>

      <button class="srf-btn srf-btn-primary" id="srf-cmp-submit" ${h.complaintLoading?`disabled`:``}>
        ${h.complaintLoading?`<span class="srf-spin"></span>`:``}<span>Submit complaint</span> ${s.arrowRight}
      </button>
    `}function w(){return h.feedbackToken&&h.feedbackLoading?`
        <h2 class="srf-card-title">Opening feedback</h2>
        <p class="srf-card-sub">Please wait while we verify your secure feedback link.</p>
        <div style="padding:28px;text-align:center;color:var(--text-soft);"><span class="srf-spin"></span></div>
      `:h.feedbackToken&&h.feedbackError?`
        <h2 class="srf-card-title">Feedback link unavailable</h2>
        <p class="srf-card-sub">${L(h.feedbackError)}</p>
        <button class="srf-btn srf-btn-secondary" id="srf-feedback-track">${s.search}<span>Track request instead</span></button>
      `:h.trackResult?T(h.trackResult):h.trackList?ue(h.trackList):`
      <h2 class="srf-card-title">Track your requests</h2>
      <p class="srf-card-sub">Enter your mobile number to see all the tickets you've filed. Add a ticket number to jump to one directly.</p>

      <label class="srf-label" for="srf-track-phone">Phone number</label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.phone}</span>
        <span class="srf-cc">+91</span>
        <input id="srf-track-phone" type="tel" inputmode="numeric" maxlength="10"
               placeholder="98765 43210" class="srf-input srf-input-cc" value="${h.trackPhone}"/>
      </div>

      <label class="srf-label" for="srf-track-tno">Ticket number <span class="srf-optional">(optional)</span></label>
      <div class="srf-input-wrap">
        <span class="srf-input-icon">${s.ticket}</span>
        <input id="srf-track-tno" type="text" placeholder="NE-260506-1234" class="srf-input"
               value="${h.trackTicketNo}" autocomplete="off"/>
      </div>

      <button class="srf-btn srf-btn-primary" id="srf-track-go" ${h.trackLoading?`disabled`:``}>
        ${h.trackLoading?`<span class="srf-spin"></span>`:``}<span>${h.trackTicketNo?`Get this ticket`:`Show my tickets`}</span> ${s.arrowRight}
      </button>
    `}function ue(e){return`
      <button class="srf-back" id="srf-track-back">${s.arrowLeft}<span>New search</span></button>
      <h2 class="srf-card-title">Your tickets</h2>
      <p class="srf-card-sub">${e.length} ticket${e.length===1?``:`s`} found for +91 ${lt(h.trackPhone)}</p>

      <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px;">
        ${e.length===0?`
          <div style="padding:24px;text-align:center;color:var(--text-soft);background:var(--bg-soft);border-radius:14px;">
            No tickets found for this phone number.
          </div>
        `:e.map(e=>{let t=qe(e.status),n=Ke[t===`pending`?`open`:t]||t,r=t===`resolved`?`var(--success)`:t===`in_progress`?`var(--warning)`:t===`assigned`?`var(--primary)`:`var(--text-dim)`;return`
            <button type="button" class="srf-ticket-row" data-ticket-id="${e.id}"
              style="display:flex;align-items:center;gap:14px;padding:14px;border-radius:14px;background:var(--bg-soft);border:1px solid var(--border);cursor:pointer;text-align:left;font-family:inherit;width:100%;">
              <div style="flex-shrink:0;width:44px;height:44px;border-radius:12px;background:var(--bg);color:${r};display:flex;align-items:center;justify-content:center;">${s.ticket}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:800;font-size:0.95rem;color:var(--text);">${L(e.ticket_no||e.id.slice(0,8))}</div>
                <div style="font-size:0.82rem;color:var(--text-soft);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${L(e.service_item||`—`)}</div>
                <div style="font-size:0.74rem;color:var(--text-dim);margin-top:2px;">${e.created_at?new Date(e.created_at).toLocaleDateString(`en-US`,{month:`short`,day:`numeric`,year:`numeric`}):``}</div>
              </div>
              <span style="font-size:0.75rem;font-weight:700;padding:6px 12px;border-radius:999px;background:${r}1a;color:${r};white-space:nowrap;">${n}</span>
            </button>
          `}).join(``)}
      </div>
    `}function T(e){let t=qe(e.status),n=t===`pending`?`open`:t,r=Math.max(0,Ge.indexOf(n)),i=t===`resolved`,a=e.bill_amount!=null&&Number(e.bill_amount)>0,c=e.payment_status===`paid`,l=e.feedback_rating!=null,u=!!h.feedbackToken&&i&&!l,d=e.profiles||null;return`
      <button class="srf-back" id="srf-track-back">${s.arrowLeft}<span>Look up another</span></button>
      <h2 class="srf-card-title">Ticket ${e.ticket_no||e.id.slice(0,8)}</h2>
      <p class="srf-card-sub">${e.full_name} · ${e.service_item}</p>

      ${i?``:`
        <div style="background:var(--bg-soft); padding:18px 20px; border-radius:16px; margin:20px 0; border:1px solid var(--border); display:flex; align-items:center; gap:16px;">
          <div style="width:48px;height:48px;border-radius:14px;background:var(--gradient);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 6px 16px rgba(16,185,129,0.25);">${s.clock}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.72rem; color:var(--text-dim); text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">Service commitment</div>
            <div style="font-size:0.85rem; color:var(--text-soft); margin-top:2px;">Resolved by</div>
            <div style="font-size:1.2rem; color:var(--text); font-weight:800; margin-top:4px; letter-spacing:-0.01em;">${ut(o(e.created_at))}</div>
          </div>
        </div>
      `}

      <div class="srf-timeline">
        ${Ge.map((e,t)=>`
          <div class="srf-tl-step ${t<=r?`done`:``} ${t===r?`current`:``}">
            <div class="srf-tl-dot">${t<=r?s.check:t+1}</div>
            <div class="srf-tl-label">${Ke[e]}</div>
          </div>
          ${t<Ge.length-1?`<div class="srf-tl-line ${t<r?`done`:``}"></div>`:``}
        `).join(``)}
      </div>

      ${dt(n,e,d)}

      ${a?`
        <div class="srf-bill-card">
          <div class="srf-bill-row">
            <div class="srf-bill-icon">${s.rupee}</div>
            <div class="srf-bill-info">
              <div class="srf-bill-label">${c?`Amount paid`:`Amount due`}</div>
              <div class="srf-bill-amount">₹${Number(e.bill_total||e.bill_amount).toLocaleString(`en-IN`)}</div>
            </div>
            ${c?`<span class="srf-bill-paid">${s.check}<span>Paid</span></span>`:e.payment_link?`<a class="srf-btn srf-btn-primary srf-pay-btn" href="${I(e.payment_link)}" target="_blank" rel="noopener">${s.card}<span>Pay now</span></a>`:`<span class="srf-bill-pending">${s.hourglass}<span>Link pending</span></span>`}
          </div>
          ${c&&e.bill_pdf_url?`
            <a class="srf-btn srf-btn-primary" href="${I(e.bill_pdf_url)}" target="_blank" rel="noopener" style="margin-top:14px;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;">
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

      ${i&&c&&h.reopenButtonEnabled&&(h.reopenLimit===0||(Number(e.reopen_count)||0)<h.reopenLimit)?`
        <div class="srf-feedback" style="margin-top:14px;">
          <h3 class="srf-fb-title">Issue not resolved?</h3>
          <p class="srf-fb-sub">If the problem is still there, let us know and we'll reopen your ticket and send a technician again — free of cost.</p>
          ${h.reopenSubmitted?`
            <div style="padding:12px 14px;border-radius:12px;background:rgba(16,185,129,0.08);border:1px solid var(--primary);font-size:0.88rem;">✅ Your ticket has been reopened. Our team will reassign a technician shortly — no extra charge.</div>
          `:`
            <textarea id="srf-reopen-text" class="srf-input" rows="3" maxlength="2000" placeholder="Tell us what's still wrong..." style="margin-bottom:10px;resize:vertical;min-height:84px;">${L(h.reopenText||``)}</textarea>
            <button class="srf-btn srf-btn-primary" id="srf-reopen-btn" ${h.reopenLoading?`disabled`:``}>
              ${h.reopenLoading?`<span class="srf-spin"></span>`:``}<span>Issue not resolved — reopen ticket</span>
            </button>
          `}
        </div>
      `:i&&c&&h.reopenButtonEnabled?`
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
    `}let E=(e,n,r=`onclick`)=>{let i=t.querySelector(e);i&&(i[r]=n)};function de(){E(`.theme-toggle-btn`,()=>{e(),g()}),E(`.srf-staff-btn`,n),t.querySelectorAll(`.srf-mode-tab`).forEach(e=>{e.onclick=()=>{if(e.dataset.mode===`install`){typeof window.__goToInstall==`function`&&window.__goToInstall();return}h.mode!==e.dataset.mode&&(h.installType=``,h.mode=e.dataset.mode,h.mode===`track`&&(h.trackResult=null,h.trackList=null),h.mode===`complaint`&&(h.complaintSubmitted=!1),re())}})}function D(){if(h.mode===`track`)return k();if(h.mode===`complaint`)return ge();if(h.mode===`install`)return se();h.step===1?fe():h.step===2?O():h.step===3?pe():me()}function fe(){let e=t.querySelector(`#srf-phone`),n=t.querySelector(`#srf-captcha`),i=t.querySelector(`#srf-send-otp`);e.addEventListener(`input`,e=>{let t=e.target.value.replace(/\D/g,``);t.length>10&&t.startsWith(`91`)?t=t.slice(2):t.length===11&&t.startsWith(`0`)&&(t=t.slice(1)),e.target.value=t.slice(0,10),h.phone=e.target.value}),E(`#srf-refresh-captcha`,()=>{h.captcha=F(),g()}),i&&(i.onclick=async()=>{if(!/^\d{10}$/.test(h.phone))return r(`Enter a valid 10-digit number`,`error`);if(String(n.value||``).trim().toLowerCase()!==h.captcha.code.toLowerCase())return r(`Captcha is incorrect`,`error`),h.captcha=F(),g();i.disabled=!0,i.innerHTML=`<span class="srf-spin"></span><span>Sending…</span>`;let e=await Le(`+91`+h.phone);if(!e.ok){r(e.error||`Could not send OTP`,`error`),g();return}r(`OTP sent by SMS`,`success`),h.step=2,g()})}function O(){let e=[...t.querySelectorAll(`.srf-otp-box`)];e[0]?.focus();let n=()=>e.forEach(e=>e.classList.toggle(`filled`,e.value.length>0));e.forEach((t,r)=>{t.addEventListener(`input`,()=>{t.value=t.value.replace(/\D/g,``),n(),t.value&&r<e.length-1&&e[r+1].focus()}),t.addEventListener(`keydown`,n=>{n.key===`Backspace`&&!t.value&&r>0&&e[r-1].focus()}),t.addEventListener(`paste`,t=>{let r=(t.clipboardData.getData(`text`)||``).replace(/\D/g,``).slice(0,6);r&&(t.preventDefault(),e.forEach((e,t)=>{e.value=r[t]||``}),n(),e[Math.min(r.length,5)].focus())})}),E(`#srf-back`,()=>{h.step=1,g()}),E(`#srf-verify-otp`,async()=>{let n=e.map(e=>e.value).join(``);if(n.length!==6)return r(`Enter the full 6-digit code`,`error`);let i=t.querySelector(`#srf-verify-otp`);i.disabled=!0,i.innerHTML=`<span class="srf-spin"></span><span>Verifying...</span>`;let a=await Re(`+91`+h.phone,n);if(!a.ok){r(a.error||`Incorrect code`,`error`),g();return}h.step=3,g()}),E(`#srf-resend`,async()=>{let e=t.querySelector(`#srf-resend`);e&&(e.disabled=!0,e.textContent=`Sending...`);let n=await ze(`+91`+h.phone);if(!n.ok){r(n.error||`Could not resend OTP`,`error`),g();return}r(`New code sent`,`success`),g()})}function pe(){let e=t.querySelector(`#srf-issue`),n=t.querySelector(`#srf-other-wrap`),i=()=>{h.customerName=t.querySelector(`#srf-name`)?.value||h.customerName,h.billNo=t.querySelector(`#srf-bill`)?.value||``,h.preferredTime=t.querySelector(`#srf-time`)?.value||h.preferredTime,h.issueValue=e?.value||h.issueValue,h.otherIssue=t.querySelector(`#srf-other`)?.value||``,h.description=t.querySelector(`#srf-desc`)?.value||``,h.locationValue=t.querySelector(`#srf-location`)?.value||h.locationValue};e&&n&&(n.style.display=e.value===`other`?``:`none`,e.onchange=()=>{h.issueValue=e.value,n.style.display=e.value===`other`?``:`none`});let a=t.querySelector(`#srf-install-change`);a&&(a.onclick=()=>{h.installType=``,h.mode=`install`,g()}),t.querySelectorAll(`.srf-seg`).forEach(e=>{e.onclick=()=>{i(),h.locationMode=e.dataset.mode,h.locationValue=``,h.coords=null,g()}});let o=t.querySelector(`#srf-detect`);o&&(o.onclick=async()=>{i(),o.innerHTML=`<span class="srf-spin"></span>`;try{let{latitude:e,longitude:n,accuracy:i}=(await it()).coords;h.coords={lat:e,lng:n,accuracy:i};try{h.locationValue=await at(e,n)||`GPS: ${e.toFixed(6)}, ${n.toFixed(6)}`}catch(t){console.error(`Reverse geocoding failed:`,t),h.locationValue=`GPS: ${e.toFixed(6)}, ${n.toFixed(6)}`}t.querySelector(`#srf-location`).value=h.locationValue,r(`Location detected (${Math.round(Number(i)||0)}m accuracy)`,`success`),re()}catch{r(`Could not detect location - switch to Manual`,`error`),o.innerHTML=s.crosshair}}),t.querySelector(`#srf-location`).addEventListener(`input`,e=>{h.locationValue=e.target.value});let c=t.querySelector(`#srf-name`);c&&c.addEventListener(`input`,e=>{h.customerName=e.target.value});let l=t.querySelector(`#srf-bill`);l&&l.addEventListener(`input`,e=>{h.billNo=e.target.value});let u=t.querySelector(`#srf-time`);u&&u.addEventListener(`change`,e=>{h.preferredTime=e.target.value});let d=t.querySelector(`#srf-other`);d&&d.addEventListener(`input`,e=>{h.otherIssue=e.target.value});let f=t.querySelector(`#srf-desc`);f&&f.addEventListener(`input`,e=>{h.description=e.target.value}),E(`#srf-submit`,async()=>{i();let n=t.querySelector(`#srf-name`).value.trim(),a=t.querySelector(`#srf-bill`).value.trim(),o=t.querySelector(`#srf-time`).value,s=e?e.value:``;h.issueValue=s;let c=h.issueOptions.find(e=>e.value===s)?.label||``,l=t.querySelector(`#srf-other`)?.value.trim()||``;if(!n)return r(`Please enter your name`,`error`);if(!h.locationValue)return r(`Please add your location`,`error`);if(!h.installType){if(!s)return r(`Please pick an issue`,`error`);if(s===`other`&&!l)return r(`Please describe the issue`,`error`)}let u=h.installType?`Installation — ${h.installType}`:s===`other`?`Other: ${l}`:c,d=(h.description||``).trim().slice(0,1e3)||null,f=t.querySelector(`#srf-submit`);f.disabled=!0,f.innerHTML=`<span class="srf-spin"></span><span>Submitting…</span>`;let p=We(),m=await P(`/data/inquiries`,{full_name:n,phone:`+91`+h.phone,location:h.locationValue,customer_lat:h.coords?.lat??null,customer_lng:h.coords?.lng??null,bill_no:a||null,service_item:u,description:d,status:`open`,assignment_status:`none`,ticket_no:p,preferred_time:o});if(!m.ok){r(m.error||`Could not submit - please try again`,`error`),console.error(m),g();return}h.ticketNo=p,r(`Request submitted`,`success`),h.step=4,g()})}function me(){E(`#srf-copy-ticket`,async()=>{try{await navigator.clipboard.writeText(h.ticketNo),r(`Ticket number copied`,`success`)}catch{r(`Copy failed — select and copy manually`,`error`)}}),E(`#srf-track-now`,()=>{h.mode=`track`,h.trackTicketNo=h.ticketNo,h.trackPhone=h.phone,h.trackResult=null,g()}),E(`#srf-new`,()=>{h.step=1,h.phone=``,h.otp=``,h.ticketNo=``,h.captcha=F(),h.locationMode=`gps`,h.locationValue=``,h.coords=null,h.customerName=``,h.billNo=``,h.preferredTime=`Morning (10 AM - 1 PM)`,h.otherIssue=``,h.description=``,h.issueValue=``,h.installType=``,g()})}function k(){if(h.feedbackToken&&h.feedbackError){E(`#srf-feedback-track`,()=>{h.feedbackToken=``,h.feedbackError=``,h.feedbackLoading=!1,h.trackResult=null,g()});return}if(h.trackResult){t.querySelector(`#srf-track-back`).onclick=()=>{h.trackResult=null,h.reopenSubmitted=!1,h.reopenText=``,g()};let e=t.querySelector(`#srf-reopen-text`);e&&e.addEventListener(`input`,e=>{h.reopenText=e.target.value});let n=t.querySelector(`#srf-reopen-btn`);n&&(n.onclick=async()=>{let e=h.trackResult||{},t=(h.reopenText||``).trim();if(t.length<10)return r(`Please describe what is still wrong (at least 10 characters)`,`error`);let n=e.phone||`+91`+(h.trackPhone||``);if(!e.ticket_no||!n)return r(`Could not identify this ticket`,`error`);h.reopenLoading=!0,g();let{error:i}=await y.from(`complaints`).insert({ticket_no:e.ticket_no,phone:n,complaint_text:`ISSUE NOT RESOLVED: `+t});if(h.reopenLoading=!1,i){r(/No ticket found/i.test(i.message||``)?`We could not match this ticket. Please use the Complaint tab.`:i.message||`Could not reopen the ticket`,`error`),g();return}h.reopenSubmitted=!0,h.reopenText=``,r(`Ticket reopened — our team will reassign a technician`,`success`),g()});let i=t.querySelector(`#srf-stars`);if(i){let e=(e,t)=>{if(!e)return;let n=[...e.querySelectorAll(`.srf-star`)],r=0,i=e=>n.forEach((t,n)=>{t.innerHTML=n<e?s.star:s.starOutline,t.classList.toggle(`on`,n<e)});return n.forEach((n,a)=>{n.onmouseenter=()=>i(a+1),n.onmouseleave=()=>i(r),n.onclick=()=>{r=a+1,e.dataset.rating=r,i(r),t&&t(r)}}),()=>r},n=[``,`😞 Poor`,`😐 Fair`,`😊 Good`,`😁 Great`,`🤩 Excellent!`],a=0,o=``,c=t.querySelector(`#srf-fb-submit`),l=()=>{c&&(c.disabled=!a,c.style.opacity=a?`1`:`0.5`,c.style.cursor=a?`pointer`:`not-allowed`)};e(i,e=>{a=e;let r=t.querySelector(`#srf-rating-label`);r&&(r.textContent=n[e]||``),l()}),e(t.querySelector(`#srf-stars-quality`)),e(t.querySelector(`#srf-stars-tech`)),t.querySelectorAll(`.srf-rec-btn`).forEach(e=>{e.onclick=()=>{o=e.dataset.val,t.querySelectorAll(`.srf-rec-btn`).forEach(e=>{e.style.borderColor=e.dataset.val===o?`var(--primary)`:`var(--border)`,e.style.color=e.dataset.val===o?`var(--primary)`:`var(--text-soft)`,e.style.background=e.dataset.val===o?`rgba(16,185,129,0.08)`:`var(--bg-soft)`})}}),E(`#srf-fb-submit`,async()=>{if(!a)return r(`Please pick an overall star rating`,`warning`);let e=Number(t.querySelector(`#srf-stars-quality`)?.dataset.rating||0),n=Number(t.querySelector(`#srf-stars-tech`)?.dataset.rating||0),i=[t.querySelector(`#srf-fb-comment`).value.trim(),e?`Service quality: ${e}/5`:``,n?`Technician: ${n}/5`:``,o?o===`yes`?`Would recommend ✓`:`Would not recommend`:``].filter(Boolean).join(` | `),c=t.querySelector(`#srf-fb-submit`);c.disabled=!0,c.innerHTML=`<span class="srf-spin"></span><span>Submitting…</span>`;let l=await fetch(`/api/feedback/submit`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({token:h.feedbackToken,rating:a,employee_rating:n||null,comment:i||null})}),u=await l.json().catch(()=>({}));if(!l.ok){r(u.error||`Could not submit feedback`,`error`),c.disabled=!1,c.innerHTML=`<span>Submit Feedback</span> ${s.arrowRight}`;return}h.trackResult=u.inquiry||{...h.trackResult,feedback_rating:a,feedback_comment:i||null,feedback_at:new Date().toISOString()},r(`Thanks for your feedback! 🙏`,`success`),g()})}return}if(h.trackList){E(`#srf-track-back`,()=>{h.trackList=null,g()}),t.querySelectorAll(`.srf-ticket-row`).forEach(e=>{e.onclick=async()=>{let t=e.dataset.ticketId,n=h.trackList.find(e=>e.id===t);if(!n)return;h.trackLoading=!0,g();let{data:r}=await y.from(`inquiries`).select(`*,profiles(id,full_name,phone,role)`).eq(`ticket_no`,n.ticket_no).eq(`phone`,n.phone).maybeSingle();h.trackLoading=!1,h.trackResult=r||n,g()}});return}let e=t.querySelector(`#srf-track-tno`),n=t.querySelector(`#srf-track-phone`);e.addEventListener(`input`,e=>{h.trackTicketNo=e.target.value.trim().toUpperCase(),e.target.value=h.trackTicketNo}),n.addEventListener(`input`,e=>{e.target.value=e.target.value.replace(/\D/g,``).slice(0,10),h.trackPhone=e.target.value}),E(`#srf-track-go`,async()=>{let e=h.trackTicketNo,t=h.trackPhone;if(!/^\d{10}$/.test(t))return r(`Enter a valid 10-digit phone number`,`error`);if(h.trackLoading=!0,g(),e){let{data:n,error:i}=await y.from(`inquiries`).select(`*,profiles(id,full_name,phone,role)`).eq(`ticket_no`,e).eq(`phone`,`+91`+t).maybeSingle();if(h.trackLoading=!1,i){console.error(i),r(`Lookup failed`,`error`),g();return}if(!n){r(`No matching ticket. Check the number and phone.`,`error`),g();return}h.trackResult=n,g();return}let{data:n,error:i}=await y.from(`inquiries`).select(`*`).eq(`phone`,`+91`+t).order(`created_at`,{ascending:!1});if(h.trackLoading=!1,i){console.error(i),r(`Lookup failed`,`error`),g();return}let a=Array.isArray(n)?n:n?[n]:[];if(!a.length){r(`No tickets found for that phone number.`,`error`),g();return}if(a.length===1){let{data:e}=await y.from(`inquiries`).select(`*,profiles(id,full_name,phone,role)`).eq(`ticket_no`,a[0].ticket_no).eq(`phone`,a[0].phone).maybeSingle();h.trackResult=e||a[0]}else h.trackList=a;g()})}function A(e,t){if(!e)return()=>0;let n=[...e.querySelectorAll(`.srf-star`)],r=Number(e.dataset.rating||0),i=e=>n.forEach((t,n)=>{t.innerHTML=n<e?s.star:s.starOutline,t.classList.toggle(`on`,n<e)});return n.forEach((n,a)=>{n.onmouseenter=()=>i(a+1),n.onmouseleave=()=>i(r),n.onclick=()=>{r=a+1,e.dataset.rating=String(r),i(r),t&&t(r)}}),i(r),()=>r}function he(){E(`.theme-toggle-btn`,()=>{e(),g()});let n=()=>{window.history.replaceState({},``,`/`),h.isFeedbackPage=!1,h.feedbackToken=``,h.feedbackError=``,h.feedbackLoading=!1,h.trackResult=null,g(),x()};if(E(`#srf-feedback-home`,n),E(`#srf-feedback-home-2`,n),!h.trackResult||h.feedbackLoading||h.feedbackError||h.trackResult.feedback_rating!=null)return;let i=[``,`Poor`,`Fair`,`Good`,`Great`,`Excellent`],a=0,o=t.querySelector(`#srf-fb-submit`),c=()=>{o&&(o.disabled=!a,o.style.opacity=a?`1`:`0.5`,o.style.cursor=a?`pointer`:`not-allowed`)};A(t.querySelector(`#srf-stars`),e=>{a=e;let n=t.querySelector(`#srf-rating-label`);n&&(n.textContent=i[e]||``),c()}),A(t.querySelector(`#srf-stars-tech`)),E(`#srf-fb-submit`,async()=>{if(!a)return r(`Please pick an overall star rating`,`warning`);let e=Number(t.querySelector(`#srf-stars-tech`)?.dataset.rating||0),n=[(t.querySelector(`#srf-fb-comment`)?.value||``).trim(),e?`Technician: ${e}/5`:``].filter(Boolean).join(` | `),i=t.querySelector(`#srf-fb-submit`);i.disabled=!0,i.innerHTML=`<span class="srf-spin"></span><span>Submitting...</span>`;let o=await fetch(`/api/feedback/submit`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({token:h.feedbackToken,rating:a,employee_rating:e||null,comment:n||null})}),c=await o.json().catch(()=>({}));if(!o.ok){r(c.error||`Could not submit feedback`,`error`),i.disabled=!1,i.innerHTML=`<span>Submit Feedback</span> ${s.arrowRight}`;return}h.trackResult=c.inquiry||{...h.trackResult,feedback_rating:a,feedback_comment:n||null,feedback_at:new Date().toISOString()},r(`Thanks for your feedback`,`success`),g()})}function ge(){if(h.complaintSubmitted){E(`#srf-complaint-another`,()=>{h.complaintSubmitted=!1,h.complaintTicketNo=``,h.complaintText=``,g()}),E(`#srf-complaint-to-track`,()=>{h.mode=`track`,h.trackTicketNo=h.complaintTicketNo,h.trackPhone=h.complaintPhone,h.trackResult=null,h.trackList=null,g()});return}let e=t.querySelector(`#srf-cmp-tno`),n=t.querySelector(`#srf-cmp-phone`),i=t.querySelector(`#srf-cmp-text`);e.addEventListener(`input`,e=>{h.complaintTicketNo=e.target.value.trim().toUpperCase(),e.target.value=h.complaintTicketNo}),n.addEventListener(`input`,e=>{e.target.value=e.target.value.replace(/\D/g,``).slice(0,10),h.complaintPhone=e.target.value}),i.addEventListener(`input`,e=>{h.complaintText=e.target.value}),E(`#srf-cmp-submit`,async()=>{let e=h.complaintTicketNo,t=h.complaintPhone,n=h.complaintText.trim();if(!e)return r(`Enter your ticket number`,`error`);if(!/^\d{10}$/.test(t))return r(`Enter a valid 10-digit number`,`error`);if(n.length<10)return r(`Please describe the issue (at least 10 characters)`,`error`);h.complaintLoading=!0,g();let{error:i}=await y.from(`complaints`).insert({ticket_no:e,phone:`+91`+t,complaint_text:n});if(h.complaintLoading=!1,i){r(/No ticket found/i.test(i.message||``)?`No ticket matches that number and phone. Double-check and try again.`:`Could not submit complaint — please try again.`,`error`),g();return}h.complaintSubmitted=!0,r(`Complaint received`,`success`),g()})}if(g(),u)try{window.history.replaceState({},``,`/`)}catch{}h.isFeedbackPage||(b(),x()),f&&(async()=>{h.feedbackLoading=!0,g();try{let e=await fetch(`/api/feedback/resolve?token=${encodeURIComponent(f)}`),t=await e.json().catch(()=>({}));if(h.feedbackLoading=!1,!e.ok){h.feedbackError=t.error||`This feedback link is invalid or expired.`,g();return}h.trackResult=t.inquiry||null,t.used&&t.inquiry&&(h.trackResult=t.inquiry)}catch{h.feedbackLoading=!1,h.feedbackError=`Could not open feedback link. Please try again.`}g()})(),!f&&a===`track`&&c&&l&&l.length===10&&(async()=>{h.trackLoading=!0,g();let{data:e}=await y.from(`inquiries`).select(`*,profiles(id,full_name,phone,role)`).eq(`ticket_no`,c).eq(`phone`,`+91`+l).maybeSingle();h.trackLoading=!1,e&&(h.trackResult=e),g()})()}function F(){return{code:Array.from({length:5},()=>`ABCDEFGHJKLMNPQRSTUVWXYZ`[Math.floor(Math.random()*24)]).join(``)}}function lt(e){return e.length===10?`${e.slice(0,5)} ${e.slice(5)}`:e}function I(e){return String(e).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e])}function L(e){return String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e])}function ut(e){let t=e instanceof Date?e:new Date(e),n=t.toLocaleDateString(`en-US`,{weekday:`short`}),r=t.toLocaleDateString(`en-US`,{month:`short`}),i=t.getDate(),a=t.getFullYear();return`${t.toLocaleTimeString(`en-US`,{hour:`numeric`,minute:`2-digit`,hour12:!0})}, ${n} ${i} ${r} ${a}`}function dt(e,t,n){let r=`<div style="margin:18px 0;padding:18px;border-radius:18px;background:var(--bg-soft);box-shadow:var(--neu-in);border:1px solid var(--border);">`,i=`</div>`,a=(e,t)=>`
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
          ${o(s.user,`Customer`,L(t.full_name))}
          ${o(s.phone,`Contact`,L(t.phone))}
          ${o(s.pin,`Location`,L(t.location||`—`))}
          ${o(s.wrench,`Service`,L(t.service_item||`—`))}
          ${t.description?o(s.edit,`Description`,L(t.description)):``}
          ${t.preferred_time?o(s.clock,`Preferred time`,L(t.preferred_time)):``}
        </div>
      ${i}
    `;if(e===`assigned`||e===`in_progress`){let t=e===`assigned`?`Technician assigned`:`Technician on the job`;return n?`
      ${r}
        ${a(t,e===`assigned`?`Your technician has been dispatched and will reach out shortly.`:`Your technician is actively working on your service.`)}
        <div style="margin-top:10px;">
          ${o(s.user,`Name`,L(n.full_name||`Technician`))}
          ${n.phone?o(s.phone,`Phone`,`<a href="tel:${I(n.phone)}" style="color:var(--primary);text-decoration:none;">${L(n.phone)}</a>`):``}
          ${n.role?o(s.shield,`Role`,L(n.role.charAt(0).toUpperCase()+n.role.slice(1))):``}
        </div>
      ${i}
    `:`
        ${r}
          ${a(t,`Technician details will appear here once assignment is confirmed.`)}
        ${i}
      `}return``}var ft=new URL(`/assets/logo-Cuxe_Kd5.png`,``+import.meta.url).href,pt=`8899133144`,mt=`+91 88991 33144`,ht=`tel:+91${pt}`,gt=`https://wa.me/91${pt}?text=Hello%20Networking%20Experts%2C%20I%20need%20help%20with%20a%20new%20installation.`,_t=window.location.hostname!==`localhost`&&window.location.hostname!==`127.0.0.1`?`/api`:`http://localhost:5000/api`;async function R(e,t){try{let n=await fetch(`${_t}${e}`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(t)}),r=await n.json().catch(()=>({}));return n.ok?{ok:!0,...r}:{ok:!1,error:r.error||`Request failed`}}catch(e){return{ok:!1,error:e.message||`Network request failed`}}}var vt=[{label:`CCTV Camera Installation`,icon:`📹`,tagline:`HD/IP cameras, DVR/NVR & remote viewing`,color:`#10B981`,includes:[`Site survey & camera placement`,`Cabling, DVR/NVR & storage setup`,`Mobile + desktop remote viewing`,`Demo & 30-day support`],highlights:[`4K/2K options`,`Night vision`,`Cloud storage`]},{label:`Networking & LAN Setup`,icon:`🌐`,tagline:`Structured cabling, switches & routers`,color:`#3B82F6`,includes:[`LAN/WAN design & cabling`,`Router, switch & firewall config`,`IP planning & testing`,`Labelling & documentation`],highlights:[`Cat6/Cat6A`,`Managed switches`,`VLAN setup`]},{label:`WiFi / Access Point Setup`,icon:`📶`,tagline:`Whole-home / office coverage`,color:`#8B5CF6`,includes:[`Coverage heat-map survey`,`Access point mounting & config`,`Seamless roaming setup`,`Speed & coverage testing`],highlights:[`WiFi 6/6E`,`Mesh ready`,`Zero dead zones`]},{label:`Biometric & Access Control`,icon:`🔒`,tagline:`Fingerprint, RFID & door locks`,color:`#F59E0B`,includes:[`Device mounting & wiring`,`User enrolment & software`,`Door lock / strike integration`,`Attendance & report setup`],highlights:[`Face & finger`,`RFID cards`,`Cloud logs`]},{label:`Video Door Phone / Intercom`,icon:`🔔`,tagline:`See & speak to visitors`,color:`#EF4444`,includes:[`Outdoor + indoor unit install`,`Wiring & power setup`,`Mobile call forwarding`,`Demo & handover`],highlights:[`HD video`,`Remote unlock`,`Night vision`]},{label:`Smart Home Automation`,icon:`🏠`,tagline:`Lights, sensors & smart control`,color:`#14B8A6`,includes:[`Needs assessment`,`Device & hub installation`,`App & voice control setup`,`Training & support`],highlights:[`Alexa/Google`,`Scene control`,`Energy saving`]}];function z(e){return String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e])}function yt(){let e=new Date;return`INST-${String(e.getFullYear()).slice(-2)}${String(e.getMonth()+1).padStart(2,`0`)}${String(e.getDate()).padStart(2,`0`)}-${String(Math.floor(1e3+Math.random()*9e3))}`}function bt(t,n){t.innerHTML=`
    <style>
      .inst-page {
        min-height: 100vh;
        position: relative;
        overflow-x: hidden;
        background: var(--bg);
        display: flex;
        flex-direction: column;
      }
      .inst-page *, .inst-page *::before, .inst-page *::after { box-sizing: border-box; }

      /* Background mesh — reuse landing's bg-mesh */
      .inst-bg-mesh { position:fixed; inset:0; pointer-events:none; z-index:0; overflow:hidden; }
      .inst-bg-mesh span { position:absolute; border-radius:50%; filter:blur(90px); opacity:0.4; }
      .inst-bg-mesh .im1 { width:500px; height:500px; top:-140px; left:-80px; background:radial-gradient(circle,rgba(16,185,129,0.35),transparent 70%); animation: instFloat 20s ease-in-out infinite; }
      .inst-bg-mesh .im2 { width:420px; height:420px; bottom:-100px; right:-60px; background:radial-gradient(circle,rgba(59,130,246,0.25),transparent 70%); animation: instFloat 20s ease-in-out infinite reverse; }
      .inst-bg-mesh .im3 { width:300px; height:300px; top:40%; left:50%; background:radial-gradient(circle,rgba(139,92,246,0.2),transparent 70%); animation: instFloat 18s ease-in-out infinite 5s; }

      @keyframes instFloat {
        0%, 100% { transform: translate(0,0) scale(1); }
        50% { transform: translate(25px,-35px) scale(1.08); }
      }

      /* Nav */
      .inst-nav {
        position: relative; z-index: 10;
        display: flex; align-items: center; justify-content: space-between;
        padding: 18px clamp(20px,5vw,80px);
      }
      .inst-nav-brand {
        display: flex; align-items: center; gap: 12px; text-decoration: none;
      }
      .inst-nav-logo { height: 42px; object-fit: contain; border-radius: 12px; }
      .inst-nav-word { display: flex; flex-direction: column; }
      .inst-nav-word b { font-size: 1.05rem; font-weight: 800; color: var(--text); line-height: 1.2; }
      .inst-nav-word small { font-size: 0.72rem; color: var(--text-dim); font-weight: 600; }
      .inst-nav-actions { display: flex; gap: 10px; align-items: center; }

      /* Hero */
      .inst-hero {
        position: relative; z-index: 5;
        text-align: center;
        padding: 36px clamp(20px,5vw,80px) 24px;
        max-width: 800px; margin: 0 auto;
      }
      .inst-hero-badge {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 8px 18px; border-radius: 999px;
        background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.25);
        font-size: 0.78rem; font-weight: 700; color: var(--primary);
        margin-bottom: 18px;
      }
      .inst-hero-badge svg { width: 16px; height: 16px; }
      .inst-hero h1 {
        font-size: clamp(1.8rem, 4.2vw, 2.8rem);
        font-weight: 800; line-height: 1.15;
        color: var(--text); margin: 0 0 14px;
        letter-spacing: -0.02em;
      }
      .inst-hero h1 span {
        background: var(--gradient);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .inst-hero p {
        font-size: 1.02rem; color: var(--text-soft);
        line-height: 1.6; margin: 0; max-width: 600px; margin: 0 auto;
      }

      /* Grid */
      .inst-grid {
        position: relative; z-index: 5;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 22px;
        padding: 12px clamp(20px,5vw,80px) 40px;
        max-width: 1200px; margin: 0 auto; width: 100%;
      }

      /* Card */
      .inst-card {
        position: relative;
        border-radius: 22px;
        background: var(--glass-bg, var(--bg-soft));
        border: 1px solid var(--glass-border, var(--border));
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        padding: 0;
        display: flex; flex-direction: column;
        overflow: hidden;
        transition: transform 0.22s cubic-bezier(.4,0,.2,1), box-shadow 0.22s, border-color 0.22s;
        cursor: default;
      }
      .inst-card:hover {
        transform: translateY(-6px);
        box-shadow: 0 20px 50px rgba(15,23,42,0.12);
        border-color: var(--primary);
      }

      .inst-card-accent {
        height: 4px; width: 100%;
      }

      .inst-card-body {
        padding: 22px 22px 0;
        flex: 1;
        display: flex; flex-direction: column;
      }

      .inst-card-head {
        display: flex; align-items: flex-start; gap: 14px;
        margin-bottom: 16px;
      }
      .inst-card-icon {
        width: 52px; height: 52px;
        border-radius: 16px;
        display: flex; align-items: center; justify-content: center;
        font-size: 1.6rem; flex-shrink: 0;
        box-shadow: 0 4px 14px rgba(0,0,0,0.08);
      }
      .inst-card-title {
        font-size: 1.08rem; font-weight: 800; color: var(--text);
        margin: 0; line-height: 1.3;
      }
      .inst-card-tagline {
        font-size: 0.82rem; color: var(--text-dim);
        margin-top: 3px; line-height: 1.3;
      }

      /* Highlights row */
      .inst-highlights {
        display: flex; flex-wrap: wrap; gap: 6px;
        margin-bottom: 14px;
      }
      .inst-hl-tag {
        font-size: 0.7rem; font-weight: 700;
        padding: 4px 10px; border-radius: 8px;
        text-transform: uppercase; letter-spacing: 0.04em;
      }

      /* Includes list */
      .inst-includes {
        list-style: none; margin: 0; padding: 0;
        display: flex; flex-direction: column; gap: 9px;
        flex: 1;
      }
      .inst-includes li {
        display: flex; align-items: flex-start; gap: 10px;
        font-size: 0.86rem; color: var(--text-soft); line-height: 1.4;
      }
      .inst-includes li svg {
        width: 16px; height: 16px; color: var(--primary);
        flex: 0 0 16px; margin-top: 2px;
      }

      /* Book button */
      .inst-card-footer {
        padding: 18px 22px;
      }
      .inst-book-btn {
        width: 100%;
        display: flex; align-items: center; justify-content: center; gap: 8px;
        padding: 13px 20px;
        border: none; border-radius: 14px;
        font-family: inherit; font-size: 0.92rem; font-weight: 700;
        color: #fff; cursor: pointer;
        background: var(--gradient);
        box-shadow: 0 6px 22px rgba(16,185,129,0.25);
        transition: transform 0.15s, box-shadow 0.15s;
      }
      .inst-book-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 30px rgba(16,185,129,0.35);
      }
      .inst-book-btn svg { width: 18px; height: 18px; }

      /* Back button */
      .inst-back-btn {
        display: inline-flex; align-items: center; gap: 6px;
        background: var(--glass-bg, var(--bg-soft));
        border: 1px solid var(--glass-border, var(--border));
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-radius: 14px;
        padding: 10px 18px 10px 14px;
        font-family: inherit; font-size: 0.88rem; font-weight: 700;
        color: var(--text); cursor: pointer;
        transition: all 0.16s ease;
      }
      .inst-back-btn:hover { border-color: var(--primary); color: var(--primary); }
      .inst-back-btn svg { width: 18px; height: 18px; }

      /* Contact bar */
      .inst-contact {
        position: relative; z-index: 5;
        width: 100%; max-width: 1200px;
        margin: 0 auto;
        padding: 0 clamp(20px,5vw,80px) clamp(36px,5vw,60px);
        display: flex; justify-content: center;
      }
      .inst-contact-card {
        display: flex; align-items: center; justify-content: space-between;
        gap: 18px; flex-wrap: wrap;
        width: 100%;
        padding: 18px 22px; border-radius: 20px;
        background: var(--glass-bg, var(--bg-soft));
        border: 1px solid var(--glass-border, var(--border));
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
      }
      .inst-contact-copy {
        display: flex; flex-direction: column; gap: 2px;
      }
      .inst-contact-kicker {
        font-size: 0.72rem; font-weight: 800; color: var(--text-dim);
        text-transform: uppercase; letter-spacing: 0.06em;
      }
      .inst-contact-number {
        color: var(--text); font-size: 1.08rem; font-weight: 800;
        text-decoration: none; font-variant-numeric: tabular-nums;
      }
      .inst-contact-number:hover { color: var(--primary); }
      .inst-contact-note { color: var(--text-soft); font-size: 0.84rem; }
      .inst-contact-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .inst-contact-action {
        display: inline-flex; align-items: center; justify-content: center;
        gap: 8px; min-height: 42px;
        padding: 8px 14px 8px 8px;
        border-radius: 14px;
        background: var(--bg-soft); border: 1px solid var(--border);
        color: var(--text); text-decoration: none;
        font-weight: 800; font-size: 0.88rem;
        transition: all 0.16s ease;
      }
      .inst-contact-action:hover { border-color: var(--primary); color: var(--primary); transform: translateY(-1px); }
      .inst-contact-icon {
        width: 30px; height: 30px; border-radius: 10px;
        display: inline-flex; align-items: center; justify-content: center;
        color: #fff; flex: 0 0 30px;
      }
      .inst-contact-icon svg { width: 16px; height: 16px; }
      .inst-contact-call .inst-contact-icon { background: linear-gradient(135deg, var(--primary), #0c6f3d); }
      .inst-contact-whatsapp .inst-contact-icon { background: linear-gradient(135deg, #25D366, #128C7E); }

      /* Trust strip */
      .inst-trust {
        position: relative; z-index: 5;
        display: flex; justify-content: center; flex-wrap: wrap;
        gap: 28px; padding: 8px 20px 32px;
      }
      .inst-trust-item {
        display: flex; align-items: center; gap: 8px;
        font-size: 0.82rem; font-weight: 700; color: var(--text-dim);
      }
      .inst-trust-item svg { width: 18px; height: 18px; color: var(--primary); }

      /* Modal overlay for verification and form */
      .inst-modal-overlay {
        position: fixed; inset: 0; z-index: 1000;
        background: rgba(15, 23, 42, 0.65);
        backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        padding: 16px; animation: instFadeIn 0.2s ease-out;
      }
      .inst-modal {
        background: var(--bg-soft, #ffffff);
        border: 1px solid var(--border);
        border-radius: 30px;
        box-shadow: var(--neu-shadow, 0 25px 60px rgba(15, 23, 42, 0.15));
        display: flex; flex-direction: column; overflow: hidden;
        animation: instSlideUp 0.3s cubic-bezier(0.34, 1.4, 0.64, 1);
        position: relative;
        width: 100%; max-width: 520px;
      }
      .inst-modal-header {
        padding: 20px 24px; display: flex; align-items: center; justify-content: space-between;
        border-bottom: 1px solid var(--border);
      }
      .inst-modal-title { font-size: 1.15rem; font-weight: 800; color: var(--text); display: flex; align-items: center; gap: 8px; }
      .inst-modal-title svg { width: 20px; height: 20px; color: var(--primary); }
      .inst-modal-close {
        background: none; border: none; font-size: 1.4rem; color: var(--text-dim); cursor: pointer;
        padding: 4px; display: flex; align-items: center; justify-content: center; border-radius: 50%;
        transition: background 0.2s, color 0.2s; width: 32px; height: 32px;
      }
      .inst-modal-close:hover { background: var(--border); color: var(--text); }
      .inst-modal-close svg { width: 16px; height: 16px; flex-shrink: 0; }
      .inst-modal-body { padding: 24px; overflow-y: auto; max-height: 80vh; }
      
      /* Steps bar */
      .inst-steps { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; position: relative; }
      .inst-step-item { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; font-weight: 700; color: var(--text-dim); z-index: 2; }
      .inst-step-item.active { color: var(--primary); }
      .inst-step-num {
        width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        background: var(--bg-soft); border: 2px solid var(--border); color: var(--text-dim); font-size: 0.75rem; transition: all 0.25s;
      }
      .inst-step-item.active .inst-step-num { background: var(--primary); border-color: var(--primary); color: #fff; }
      .inst-step-line {
        position: absolute; top: 13px; left: 10px; right: 10px; height: 2px;
        background: var(--border); z-index: 1;
      }
      
      /* Form Layouts */
      .inst-form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
      .inst-form-group label { font-size: 0.82rem; font-weight: 700; color: var(--text-soft); }
      .inst-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      
      .inst-timer-text { font-size: 0.8rem; color: var(--text-dim); text-align: center; margin-top: 14px; line-height: 1.4; }
      .inst-resend-link { color: var(--primary); text-decoration: none; font-weight: 700; cursor: pointer; margin-left: 4px; }
      .inst-resend-link.disabled { color: var(--text-dim); cursor: not-allowed; text-decoration: none; font-weight: normal; }

      /* Success Screen */
      .inst-success-box { text-align: center; padding: 16px 0; }
      .inst-success-icon {
        width: 64px; height: 64px; border-radius: 50%; background: rgba(16, 185, 129, 0.1);
        border: 2px solid var(--primary); color: var(--primary); display: flex; align-items: center;
        justify-content: center; margin: 0 auto 18px; font-size: 2rem;
      }
      .inst-success-icon svg { width: 32px; height: 32px; flex-shrink: 0; }

      @keyframes instFadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes instSlideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

      @media (max-width: 640px) {
        .inst-nav-word { display: none !important; }
        .inst-grid { grid-template-columns: 1fr; }
        .inst-hero h1 { font-size: 1.7rem; }
        .inst-form-row { grid-template-columns: 1fr; gap: 0; }
      }
    </style>

    <div class="inst-page">
      <div class="inst-bg-mesh" aria-hidden="true">
        <span class="im1"></span><span class="im2"></span><span class="im3"></span>
      </div>

      <nav class="inst-nav">
        <a class="inst-nav-brand" href="#" id="inst-back-logo">
          <img src="${ft}" alt="" class="inst-nav-logo"
               onerror="this.style.display='none';this.parentElement.querySelector('.inst-nav-word').innerHTML='<b>NE</b>'"/>
          <span class="inst-nav-word"><b>Networking Experts</b><small>Installation Services</small></span>
        </a>
        <div class="inst-nav-actions">
          <button class="srf-icon-btn inst-theme-btn" title="Toggle theme">${(localStorage.getItem(`theme`)||`light`)===`dark`?s.sun:s.moon}</button>
          <button class="inst-back-btn" id="inst-back-btn">${s.arrowLeft}<span>Back</span></button>
        </div>
      </nav>

      <section class="inst-hero">
        <div class="inst-hero-badge">${s.box}<span>Professional Installation</span></div>
        <h1>Expert installations,<br/><span>done right the first time.</span></h1>
        <p>CCTV, networking, smart home & more — pick a service below and book your visit in minutes. Our certified technicians cover the entire valley.</p>
      </section>

      <div class="inst-trust">
        <div class="inst-trust-item">${s.shield}<span>Certified technicians</span></div>
        <div class="inst-trust-item">${s.clock}<span>Same-day dispatch</span></div>
        <div class="inst-trust-item">${s.star}<span>4.9★ rating</span></div>
        <div class="inst-trust-item">${s.check}<span>30-day warranty</span></div>
      </div>

      <div class="inst-grid">
        ${vt.map((e,t)=>`
          <div class="inst-card" data-idx="${t}">
            <div class="inst-card-accent" style="background:${e.color};"></div>
            <div class="inst-card-body">
              <div class="inst-card-head">
                <div class="inst-card-icon" style="background:${e.color}15; border: 1px solid ${e.color}30;">${e.icon}</div>
                <div>
                  <div class="inst-card-title">${z(e.label)}</div>
                  <div class="inst-card-tagline">${z(e.tagline)}</div>
                </div>
              </div>
              <div class="inst-highlights">
                ${e.highlights.map(t=>`<span class="inst-hl-tag" style="background:${e.color}12; color:${e.color}; border: 1px solid ${e.color}20;">${z(t)}</span>`).join(``)}
              </div>
              <ul class="inst-includes">
                ${e.includes.map(e=>`<li>${s.check}<span>${z(e)}</span></li>`).join(``)}
              </ul>
            </div>
            <div class="inst-card-footer">
              <button class="inst-book-btn" data-install="${z(e.label)}">
                <span>Book ${z(e.label.split(` `)[0])}</span> ${s.arrowRight}
              </button>
            </div>
          </div>
        `).join(``)}
      </div>

      <section class="inst-contact">
        <div class="inst-contact-card">
          <div class="inst-contact-copy">
            <span class="inst-contact-kicker">Need help choosing?</span>
            <a class="inst-contact-number" href="${ht}">${mt}</a>
            <span class="inst-contact-note">Our team will help you pick the right installation package.</span>
          </div>
          <div class="inst-contact-actions">
            <a class="inst-contact-action inst-contact-call" href="${ht}" aria-label="Call">
              <span class="inst-contact-icon">${s.phone}</span><span>Call</span>
            </a>
            <a class="inst-contact-action inst-contact-whatsapp" href="${gt}" target="_blank" rel="noopener" aria-label="WhatsApp">
              <span class="inst-contact-icon">${s.whatsapp}</span><span>WhatsApp</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  `;let r=()=>{typeof n==`function`&&n()};t.querySelector(`#inst-back-btn`)?.addEventListener(`click`,r),t.querySelector(`#inst-back-logo`)?.addEventListener(`click`,e=>{e.preventDefault(),r()}),t.querySelector(`.inst-theme-btn`)?.addEventListener(`click`,()=>{e(),bt(t,n)}),t.querySelectorAll(`.inst-book-btn`).forEach(e=>{e.addEventListener(`click`,()=>{xt(e.dataset.install||``)})})}function xt(e){let t=document.createElement(`div`);t.className=`inst-modal-overlay`,document.body.appendChild(t);let n={step:1,phone:``,otp:``,timer:60,timerInterval:null};function i(){n.timerInterval&&=(clearInterval(n.timerInterval),null)}function a(){i(),n.timer=60,n.timerInterval=setInterval(()=>{n.timer--;let e=t.querySelector(`#inst-timer-display`);e&&(n.timer>0?e.innerHTML=`Resend code in <b>${n.timer}s</b>`:(i(),e.innerHTML=`Didn't get code? <span class="inst-resend-link" id="inst-resend-btn">Resend OTP</span>`,t.querySelector(`#inst-resend-btn`)?.addEventListener(`click`,c)))},1e3)}async function o(){let e=(t.querySelector(`#inst-phone-field`)?.value||``).replace(/\D/g,``);if(e.length!==10){r(`Please enter a valid 10-digit mobile number.`,`error`);return}let i=`+91${e}`,o=d(t.querySelector(`#inst-send-otp-btn`),`Sending`),s=await R(`/otp/send`,{phone:i});o(),s.ok?(n.phone=i,n.step=2,f(),a(),r(`OTP sent successfully!`,`success`)):r(s.error||`Failed to send OTP. Please try again.`,`error`)}async function c(){let e=await R(`/otp/resend`,{phone:n.phone});e.ok?(a(),r(`OTP resent successfully!`,`success`)):r(e.error||`Failed to resend OTP. Please try again.`,`error`)}async function l(){let e=(t.querySelector(`#inst-otp-field`)?.value||``).trim();if(e.length!==6){r(`Please enter the 6-digit verification code.`,`error`);return}let a=d(t.querySelector(`#inst-verify-otp-btn`),`Verifying`),o=await R(`/otp/verify`,{phone:n.phone,otp:e});a(),o.ok&&o.verified?(i(),n.otp=e,n.step=3,f(),r(`Phone verified successfully!`,`success`)):r(o.error||`Incorrect code. Please check and try again.`,`error`)}async function u(t){t.preventDefault();let i=t.target,a=d(i.querySelector(`#inst-submit-request-btn`),`Registering`),o=yt(),s=await R(`/data/installations`,{ticket_no:o,full_name:i.elements.fullName.value.trim(),phone:n.phone,company_name:i.elements.companyName.value.trim()||null,location:i.elements.locationName.value.trim(),installation_type:e,preferred_date:i.elements.prefDate.value,preferred_time:i.elements.prefTime.value,address:i.elements.address.value.trim(),description:i.elements.description.value.trim()||null,status:`pending`});a(),s.ok?(n.step=4,n.ticketNo=o,f(),r(`Installation request booked!`,`success`)):r(s.error||`Could not register installation. Please try again.`,`error`)}function d(e,t=`Loading...`){if(!e)return()=>{};let n=e.innerHTML;return e.disabled=!0,e.classList.add(`is-loading`),e.innerHTML=`<span class="btn-spinner"></span> <span>${t}</span>`,()=>{e.disabled=!1,e.classList.remove(`is-loading`),e.innerHTML=n}}function f(){let r=``,a=``;if(n.step<=3&&(a=`
        <div class="inst-steps">
          <div class="inst-step-line"></div>
          <div class="inst-step-item ${n.step>=1?`active`:``}">
            <div class="inst-step-num">1</div>
            <span>Phone</span>
          </div>
          <div class="inst-step-item ${n.step>=2?`active`:``}">
            <div class="inst-step-num">2</div>
            <span>Verify</span>
          </div>
          <div class="inst-step-item ${n.step>=3?`active`:``}">
            <div class="inst-step-num">3</div>
            <span>Details</span>
          </div>
        </div>
      `),n.step===1)r=`
        ${a}
        <div style="text-align: center; margin-bottom: 24px;">
          <h3 style="margin:0 0 8px; color:var(--text)">Verify Your Mobile</h3>
          <p style="margin:0; font-size:0.88rem; color:var(--text-dim)">To request an installation, please verify your mobile number first.</p>
        </div>
        <div class="inst-form-group">
          <label class="srf-label" for="inst-phone-field">Mobile Number</label>
          <div class="srf-input-wrap">
            <span class="srf-cc">+91</span>
            <input type="tel" id="inst-phone-field" class="srf-input" maxlength="10" placeholder="Enter 10-digit number" autocomplete="tel" />
          </div>
        </div>
        <button class="btn btn-primary btn-wide" id="inst-send-otp-btn" style="margin-top:10px;">
          <span>Send OTP</span> ${s.arrowRight}
        </button>
      `;else if(n.step===2)r=`
        ${a}
        <div style="text-align: center; margin-bottom: 24px;">
          <h3 style="margin:0 0 8px; color:var(--text)">Enter Verification Code</h3>
          <p style="margin:0; font-size:0.88rem; color:var(--text-dim)">We sent a 6-digit OTP code to <b style="color:var(--text)">${n.phone}</b></p>
        </div>
        <div class="inst-form-group">
          <div style="display:flex; justify-content:center; width:100%;">
            <div class="srf-input-wrap" style="max-width:200px; width:100%; justify-content:center;">
              <input type="text" id="inst-otp-field" class="srf-input" maxlength="6" placeholder="••••••" style="letter-spacing:0.4em; text-align:center; font-size:1.6rem; font-weight:800; padding:10px 0; border:none; background:transparent;" />
            </div>
          </div>
        </div>
        <button class="btn btn-primary btn-wide" id="inst-verify-otp-btn" style="margin-top:14px;">
          <span>Verify & Proceed</span> ${s.check}
        </button>
        <div class="inst-timer-text" id="inst-timer-display">Resend code in <b>60s</b></div>
      `;else if(n.step===3){let t=new Date;t.setDate(t.getDate()+1);let n=t.toISOString().split(`T`)[0];r=`
        ${a}
        <div style="text-align: center; margin-bottom: 20px;">
          <h3 style="margin:0 0 4px; color:var(--text)">Installation Details</h3>
          <p style="margin:0; font-size:0.85rem; color:var(--text-dim)">Booking for: <b style="color:var(--primary)">${z(e)}</b></p>
        </div>
        <form id="inst-booking-form">
          <div class="inst-form-group">
            <label class="srf-label">Full Name</label>
            <div class="srf-input-wrap">
              <input type="text" name="fullName" class="srf-input" placeholder="Your full name" required />
            </div>
          </div>
          <div class="inst-form-row">
            <div class="inst-form-group">
              <label class="srf-label">Company Name <span class="srf-optional">(Optional)</span></label>
              <div class="srf-input-wrap">
                <input type="text" name="companyName" class="srf-input" placeholder="e.g. Acme Corp" />
              </div>
            </div>
            <div class="inst-form-group">
              <label class="srf-label">Location Name</label>
              <div class="srf-input-wrap">
                <input type="text" name="locationName" class="srf-input" placeholder="e.g. Home, Office, Server Room" required />
              </div>
            </div>
          </div>
          <div class="inst-form-row">
            <div class="inst-form-group">
              <label class="srf-label">Preferred Date</label>
              <div class="srf-input-wrap">
                <input type="date" name="prefDate" min="${n}" class="srf-input" required style="width:100%; border:none; background:transparent;" />
              </div>
            </div>
            <div class="inst-form-group">
              <label class="srf-label">Time Slot</label>
              <div class="srf-input-wrap">
                <select name="prefTime" class="srf-input srf-select" required>
                  <option value="10:00 AM - 01:00 PM">10:00 AM - 01:00 PM</option>
                  <option value="01:00 PM - 04:00 PM">01:00 PM - 04:00 PM</option>
                  <option value="04:00 PM - 07:00 PM">04:00 PM - 07:00 PM</option>
                </select>
              </div>
            </div>
          </div>
          <div class="inst-form-group">
            <label class="srf-label">Complete Installation Address</label>
            <div class="srf-input-wrap" style="align-items: flex-start; padding: 10px 14px;">
              <textarea name="address" class="srf-input" placeholder="House/Office No, Building name, Street details, Landmark" rows="3" required style="resize:vertical; width:100%; border:none; background:transparent; font-family:inherit; font-size:0.98rem;"></textarea>
            </div>
          </div>
          <div class="inst-form-group">
            <label class="srf-label">Special Instructions <span class="srf-optional">(Optional)</span></label>
            <div class="srf-input-wrap" style="align-items: flex-start; padding: 10px 14px;">
              <textarea name="description" class="srf-input" placeholder="Tell us about camera heights, specific cabling routes, etc." rows="2" style="resize:vertical; width:100%; border:none; background:transparent; font-family:inherit; font-size:0.98rem;"></textarea>
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-wide" id="inst-submit-request-btn" style="margin-top:10px;">
            <span>Book Installation</span> ${s.check}
          </button>
        </form>
      `}else n.step===4&&(r=`
        <div class="inst-success-box">
          <div class="inst-success-icon">${s.check}</div>
          <h3 style="margin:0 0 8px; color:var(--text); font-size:1.4rem;">Booking Confirmed!</h3>
          <p style="margin:0 0 24px; font-size:0.92rem; color:var(--text-dim); line-height:1.5;">
            Your request for <b>${z(e)}</b> has been registered successfully.
          </p>
          <div style="background:var(--bg-soft); border:1px solid var(--border); padding:16px; border-radius:16px; margin-bottom:24px; text-align:center;">
            <span style="font-size:0.75rem; font-weight:800; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.04em; display:block; margin-bottom:4px;">Your Ticket Number</span>
            <code style="font-size:1.25rem; font-weight:800; color:var(--primary); font-family:monospace; letter-spacing:0.02em;">${n.ticketNo}</code>
          </div>
          <p style="font-size:0.82rem; color:var(--text-dim); margin-bottom:24px;">An SMS confirmation with details has been sent to your verified mobile number.</p>
          <button class="btn btn-primary btn-wide" id="inst-success-close-btn">
            <span>Finish</span>
          </button>
        </div>
      `);if(t.querySelector(`.inst-modal-body`).innerHTML=r,n.step===1){t.querySelector(`#inst-send-otp-btn`).addEventListener(`click`,o);let e=t.querySelector(`#inst-phone-field`);e.focus(),e.addEventListener(`keypress`,e=>{e.key===`Enter`&&o()})}else if(n.step===2){t.querySelector(`#inst-verify-otp-btn`).addEventListener(`click`,l);let e=t.querySelector(`#inst-otp-field`);e.focus(),e.addEventListener(`keypress`,e=>{e.key===`Enter`&&l()})}else n.step===3?t.querySelector(`#inst-booking-form`).addEventListener(`submit`,u):n.step===4&&t.querySelector(`#inst-success-close-btn`).addEventListener(`click`,()=>{i(),t.remove()})}t.innerHTML=`
    <div class="inst-modal">
      <div class="inst-modal-header">
        <span class="inst-modal-title">${s.box} <span>Book Installation</span></span>
        <button class="inst-modal-close" id="inst-modal-close-btn">${s.close}</button>
      </div>
      <div class="inst-modal-body"></div>
    </div>
  `,t.querySelector(`#inst-modal-close-btn`).onclick=()=>{i(),t.remove()},t.onclick=e=>{e.target===t&&(i(),t.remove())},f()}var St=window.location.hostname!==`localhost`&&window.location.hostname!==`127.0.0.1`?`/api`:`http://localhost:5000/api`;function Ct(e){let t=(e+`=`.repeat((4-e.length%4)%4)).replace(/-/g,`+`).replace(/_/g,`/`),n=atob(t),r=new Uint8Array(n.length);for(let e=0;e<n.length;e++)r[e]=n.charCodeAt(e);return r}var B=!1;async function wt(){if(!B&&!(!(`serviceWorker`in navigator)||!(`PushManager`in window))&&localStorage.getItem(`auth_token`)){B=!0;try{let{key:e}=await(await fetch(`${St}/push/vapid-public`)).json();if(!e){B=!1;return}if(Notification.permission===`default`&&await Notification.requestPermission()!==`granted`){B=!1;return}if(Notification.permission!==`granted`){B=!1;return}let t=await navigator.serviceWorker.register(`/push-sw.js`,{scope:`/app-push/`}),n=await t.pushManager.getSubscription()||await t.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:Ct(e)});await fetch(`${St}/push/subscribe`,{method:`POST`,headers:{"Content-Type":`application/json`,Authorization:`Bearer ${localStorage.getItem(`auth_token`)}`},body:JSON.stringify({subscription:n})})}catch(e){console.warn(`[push] init failed`,e),B=!1}}}var Tt=`modulepreload`,Et=function(e){return`/`+e},Dt={},V=function(e,t,n){let r=Promise.resolve();if(t&&t.length>0){let e=document.getElementsByTagName(`link`),i=document.querySelector(`meta[property=csp-nonce]`),a=i?.nonce||i?.getAttribute(`nonce`);function o(e){return Promise.all(e.map(e=>Promise.resolve(e).then(e=>({status:`fulfilled`,value:e}),e=>({status:`rejected`,reason:e}))))}r=o(t.map(t=>{if(t=Et(t,n),t in Dt)return;Dt[t]=!0;let r=t.endsWith(`.css`),i=r?`[rel="stylesheet"]`:``;if(n)for(let n=e.length-1;n>=0;n--){let i=e[n];if(i.href===t&&(!r||i.rel===`stylesheet`))return}else if(document.querySelector(`link[href="${t}"]${i}`))return;let o=document.createElement(`link`);if(o.rel=r?`stylesheet`:Tt,r||(o.as=`script`),o.crossOrigin=``,o.href=t,a&&o.setAttribute(`nonce`,a),document.head.appendChild(o),r)return new Promise((e,n)=>{o.addEventListener(`load`,e),o.addEventListener(`error`,()=>n(Error(`Unable to preload CSS for ${t}`)))})}))}function i(e){let t=new Event(`vite:preloadError`,{cancelable:!0});if(t.payload=e,window.dispatchEvent(t),!t.defaultPrevented)throw e}return r.then(t=>{for(let e of t||[])e.status===`rejected`&&i(e.reason);return e().catch(i)})},Ot=`true`,kt=`false`,At=Ot===`true`,jt=kt===`true`;function Mt(e={}){let{immediate:t=!1,onNeedReload:n,onNeedRefresh:r,onOfflineReady:i,onRegistered:a,onRegisteredSW:o,onRegisterError:s}=e,c,l,u,d=async(e=!0)=>{await l,At||u?.()};async function f(){if(`serviceWorker`in navigator){if(c=await V(async()=>{let{Workbox:e}=await import(`./workbox-window.prod.es5-C_4Sg3IW.js`);return{Workbox:e}},[]).then(({Workbox:e})=>new e(`/sw.js`,{scope:`/`,type:`classic`})).catch(e=>{s?.(e)}),!c)return;if(u=()=>{c?.messageSkipWaiting()},!jt)if(At)c.addEventListener(`activated`,e=>{(e.isUpdate||e.isExternal)&&(n?n():window.location.reload())}),c.addEventListener(`installed`,e=>{e.isUpdate||i?.()});else{let e=!1,t=()=>{e=!0,c?.addEventListener(`controlling`,e=>{e.isUpdate&&(n?n():window.location.reload())}),r?.()};c.addEventListener(`installed`,n=>{n.isUpdate===void 0?n.isExternal===void 0?!e&&i?.():n.isExternal?t():!e&&i?.():n.isUpdate||i?.()}),c.addEventListener(`waiting`,t)}c.register({immediate:t}).then(e=>{o?o(`/sw.js`,e):a?.(e)}).catch(e=>{s?.(e)})}}return l=f(),d}Mt({immediate:!0,onRegisteredSW(e,t){if(!t)return;let n=()=>{t.update().catch(()=>{})};setInterval(n,3600*1e3),document.addEventListener(`visibilitychange`,()=>{document.visibilityState===`visible`&&n()})},onNeedRefresh(){},onOfflineReady(){}});var H,U=null;window.addEventListener(`beforeinstallprompt`,e=>{e.preventDefault(),H=e});function Nt(){!H||U||(U=document.createElement(`button`),U.className=`pwa-install-btn`,U.innerHTML=`${s.download||`📥`} Install App`,document.body.appendChild(U),U.addEventListener(`click`,async()=>{if(!H)return;H.prompt();let{outcome:e}=await H.userChoice;e===`accepted`&&(H=null),W()}))}function W(){U&&=(U.remove(),null)}t();var G=document.getElementById(`app`),K=null,q=null,J=!1,Y=`dashboard`,Pt=new Set([`dashboard`,`notifications`,`profile`]);function Ft(e){if(!Q)return e;let t=e.filter(e=>e.type===`section`||Pt.has(e.id)||Q.has(String(e.id)));return t.filter((e,n)=>{if(e.type!==`section`)return!0;let r=t[n+1];return r&&r.type!==`section`})}function It(e){let t=[{type:`section`,label:`Main`},{id:`dashboard`,icon:s.dashboard,label:`Dashboard`}];if(e===`employee`){let e=[...t,{id:`my-stats`,icon:s.star,label:`My Stats`},{id:`all-tickets`,icon:s.ticket,label:`My Tasks`},{id:`notifications`,icon:s.bell,label:`Notifications`},{type:`section`,label:`Work`},{id:`my-attendance`,icon:s.clock,label:`Attendance Records`},{id:`my-leaves`,icon:s.hourglass,label:`Leave Requests`},{id:`my-eod`,icon:s.clipboard,label:`EOD Reports`},{id:`my-cash`,icon:s.rupee,label:`My Cash`},{id:`my-collections`,icon:s.card,label:`Collections`},{id:`leaderboard`,icon:s.star,label:`Leaderboard`},{id:`employee-training`,icon:s.play,label:`Tutorials`},{id:`my-training-courses`,icon:s.shield,label:`Training`}];return e.push({id:`device-followup`,icon:s.wrench,label:`Device Follow-up`}),e.push({type:`section`,label:`Services`}),e.push({id:`estimator`,icon:s.receipt,label:`Estimator`}),J&&e.push({id:`service-pricing`,icon:s.receipt,label:`Service Pricing`}),e.push({type:`section`,label:`Account`},{id:`profile`,icon:s.user,label:`Profile`}),Ft(e)}return[...t,{id:`stats`,icon:s.clipboard,label:`Stats`},{id:`notifications`,icon:s.bell,label:`Notifications`},{type:`section`,label:`Operations`},{id:`attendance`,icon:s.clock,label:`Attendance`},{id:`inquiries`,icon:s.inbox,label:`Service Requests`},{id:`installations`,icon:s.plus,label:`Installations`},{id:`auto-assignment`,icon:s.refresh,label:`Auto Assignment`},{id:`device-tracking`,icon:s.wrench,label:`Device Follow-up`},{type:`section`,label:`Management`},{id:`contacts`,icon:s.phone,label:`Contacts`},{id:`users`,icon:s.users,label:`Users`},{id:`device-types`,icon:s.box,label:`Device Types`},{id:`training-admin`,icon:s.play,label:`Employee Tutorials`},{id:`training-courses`,icon:s.shield,label:`Training Courses`},{type:`section`,label:`Reports`},{id:`finance`,icon:s.rupee,label:`Finance Report`},{id:`ai-report`,icon:s.star,label:`AI Report`},{id:`payments`,icon:s.rupee,label:`Payments`},{id:`bills`,icon:s.receipt,label:`Bills`},{id:`cash`,icon:s.rupee,label:`Cash Collections`},{id:`collections`,icon:s.card,label:`Collection Reports`},{id:`salary`,icon:s.rupee,label:`Salary`},{id:`leaves`,icon:s.hourglass,label:`Leave Requests`},{id:`eod`,icon:s.clipboard,label:`EOD Summaries`},{id:`feedback`,icon:s.star,label:`Leaderboard`},{id:`complaints`,icon:s.shield,label:`Complaints`},{type:`section`,label:`Marketing`},{id:`ads`,icon:s.box,label:`Landing Ads`},{id:`popup-ads`,icon:s.box,label:`Popup Ads`},{id:`notices`,icon:s.clipboard,label:`Notices`},{id:`discounts`,icon:s.receipt,label:`Coupons`},{id:`discount-details`,icon:s.receipt,label:`Discount Details`},{id:`pricing`,icon:s.receipt,label:`Service Pricing`},{type:`section`,label:`Config`},{id:`settings`,icon:s.settings||`⚙️`,label:`Settings`},{type:`section`,label:`Account`},{id:`profile`,icon:s.user,label:`Profile`}]}var Lt={employee:{dashboard:()=>V(()=>import(`./employee-Cjvm8H5u.js`).then(e=>e.renderEmployeeDashboard),__vite__mapDeps([0,1,2])),"my-stats":()=>V(()=>import(`./stats-2ktHz7R6.js`).then(e=>e.renderEmployeeStats),__vite__mapDeps([3,1,4])),"all-tickets":()=>V(()=>import(`./employee-Cjvm8H5u.js`).then(e=>e.renderEmployeeTasks),__vite__mapDeps([0,1,2])),"my-attendance":()=>V(()=>import(`./employee-Cjvm8H5u.js`).then(e=>e.renderEmployeeAttendanceRecords),__vite__mapDeps([0,1,2])),"my-leaves":()=>V(()=>import(`./employee-Cjvm8H5u.js`).then(e=>e.renderEmployeeLeaveRequests),__vite__mapDeps([0,1,2])),"my-eod":()=>V(()=>import(`./employee-Cjvm8H5u.js`).then(e=>e.renderEmployeeEODReports),__vite__mapDeps([0,1,2])),"my-cash":()=>V(()=>import(`./employee-Cjvm8H5u.js`).then(e=>e.renderEmployeeCash),__vite__mapDeps([0,1,2])),"my-collections":()=>V(()=>import(`./collections-BTInrfTP.js`).then(e=>e.renderEmployeeCollections),__vite__mapDeps([5,1])),leaderboard:()=>V(()=>import(`./employee-Cjvm8H5u.js`).then(e=>e.renderEmployeeLeaderboard),__vite__mapDeps([0,1,2])),"employee-training":()=>V(()=>import(`./media-training-f0YrcdYi.js`).then(e=>e.renderEmployeeTrainingTab),__vite__mapDeps([6,1])),estimator:()=>V(()=>import(`./employee-Cjvm8H5u.js`).then(e=>e.renderEmployeeEstimatorTab),__vite__mapDeps([0,1,2])),"service-pricing":()=>V(()=>import(`./employee-Cjvm8H5u.js`).then(e=>e.renderEmployeePricingTab),__vite__mapDeps([0,1,2])),"device-followup":()=>V(()=>import(`./employee-Cjvm8H5u.js`).then(e=>e.renderEmployeeFollowUp),__vite__mapDeps([0,1,2])),notifications:()=>V(()=>import(`./notifications-CQyKlR3K.js`).then(e=>e.renderNotificationsTab),__vite__mapDeps([7,1])),"my-training-courses":()=>V(()=>import(`./training-BOudn49a.js`).then(e=>e.renderEmployeeCourses),__vite__mapDeps([8,1])),profile:()=>V(()=>import(`./profile-DzWIbox-.js`).then(e=>e.renderProfile),__vite__mapDeps([9,1]))},admin:{dashboard:()=>V(()=>import(`./admin-Cv-2zvA7.js`).then(e=>e.renderAdminDashboard),__vite__mapDeps([10,1,0,2])),stats:()=>V(()=>import(`./stats-2ktHz7R6.js`).then(e=>e.renderAdminStats),__vite__mapDeps([3,1,4])),attendance:()=>V(()=>import(`./admin-Cv-2zvA7.js`).then(e=>e.renderAttendance),__vite__mapDeps([10,1,0,2])),inquiries:()=>V(()=>import(`./admin-Cv-2zvA7.js`).then(e=>e.renderInquiries),__vite__mapDeps([10,1,0,2])),installations:()=>V(()=>import(`./admin-Cv-2zvA7.js`).then(e=>e.renderInstallationsTab),__vite__mapDeps([10,1,0,2])),contacts:()=>V(()=>import(`./admin-Cv-2zvA7.js`).then(e=>e.renderContacts),__vite__mapDeps([10,1,0,2])),users:()=>V(()=>import(`./admin-Cv-2zvA7.js`).then(e=>e.renderUsers),__vite__mapDeps([10,1,0,2])),profile:()=>V(()=>import(`./profile-DzWIbox-.js`).then(e=>e.renderProfile),__vite__mapDeps([9,1])),payments:()=>V(()=>import(`./admin-Cv-2zvA7.js`).then(e=>e.renderPaymentsTab),__vite__mapDeps([10,1,0,2])),bills:()=>V(()=>import(`./admin-Cv-2zvA7.js`).then(e=>e.renderBillsTab),__vite__mapDeps([10,1,0,2])),cash:()=>V(()=>import(`./admin-Cv-2zvA7.js`).then(e=>e.renderCashCollectionsTab),__vite__mapDeps([10,1,0,2])),salary:()=>V(()=>import(`./admin-Cv-2zvA7.js`).then(e=>e.renderSalaryOverview),__vite__mapDeps([10,1,0,2])),leaves:()=>V(()=>import(`./admin-Cv-2zvA7.js`).then(e=>e.renderLeaveRequests),__vite__mapDeps([10,1,0,2])),eod:()=>V(()=>import(`./admin-Cv-2zvA7.js`).then(e=>e.renderEODReports),__vite__mapDeps([10,1,0,2])),pricing:()=>V(()=>import(`./admin-Cv-2zvA7.js`).then(e=>e.renderPricingTab),__vite__mapDeps([10,1,0,2])),collections:()=>V(()=>import(`./collections-BTInrfTP.js`).then(e=>e.renderAdminCollections),__vite__mapDeps([5,1])),discounts:()=>V(()=>import(`./discounts-Bz4GwxAB.js`).then(e=>e.renderDiscountsTab),__vite__mapDeps([11,1])),"discount-details":()=>V(()=>import(`./discounts-Bz4GwxAB.js`).then(e=>e.renderDiscountRequestsTab),__vite__mapDeps([11,1])),"popup-ads":()=>V(()=>import(`./media-training-f0YrcdYi.js`).then(e=>e.renderPopupAdsTab),__vite__mapDeps([6,1])),"training-admin":()=>V(()=>import(`./media-training-f0YrcdYi.js`).then(e=>e.renderTrainingAdminTab),__vite__mapDeps([6,1])),"ai-report":()=>V(()=>import(`./media-training-f0YrcdYi.js`).then(e=>e.renderAIReportTab),__vite__mapDeps([6,1])),"device-types":()=>V(()=>import(`./admin-Cv-2zvA7.js`).then(e=>e.renderDeviceTypesTab),__vite__mapDeps([10,1,0,2])),feedback:()=>V(()=>import(`./admin-Cv-2zvA7.js`).then(e=>e.renderFeedbackTab),__vite__mapDeps([10,1,0,2])),complaints:()=>V(()=>import(`./admin-Cv-2zvA7.js`).then(e=>e.renderComplaintsTab),__vite__mapDeps([10,1,0,2])),ads:()=>V(()=>import(`./admin-Cv-2zvA7.js`).then(e=>e.renderAdsTab),__vite__mapDeps([10,1,0,2])),notices:()=>V(()=>import(`./admin-notices-DxU2oj2c.js`).then(e=>e.renderNoticesTab),__vite__mapDeps([12,1])),settings:()=>V(()=>import(`./admin-Cv-2zvA7.js`).then(e=>e.renderSettingsTab),__vite__mapDeps([10,1,0,2])),"auto-assignment":()=>V(()=>import(`./admin-Cv-2zvA7.js`).then(e=>e.renderAutoAssignmentTab),__vite__mapDeps([10,1,0,2])),"device-tracking":()=>V(()=>import(`./device-tracking-admin-B8BHTAhP.js`).then(e=>e.renderDeviceTrackingTab),__vite__mapDeps([13,1,2])),finance:()=>V(()=>import(`./finance-BO3tsEgI.js`).then(e=>e.renderFinanceReportTab),__vite__mapDeps([14,1])),notifications:()=>V(()=>import(`./notifications-CQyKlR3K.js`).then(e=>e.renderNotificationsTab),__vite__mapDeps([7,1])),"training-courses":()=>V(()=>import(`./training-BOudn49a.js`).then(e=>e.renderTrainingCoursesAdmin),__vite__mapDeps([8,1]))}};function Rt(e,t){let n=(Lt[e]||Lt.admin)[t];return n?e=>{let r=t;e.innerHTML=`<div class="loading-screen"><div class="spinner"></div></div>`,n().then(t=>{Y===r&&(typeof t==`function`?t(e):e.innerHTML=``)}).catch(n=>{if(console.error(`[page] failed to load`,t,n),Y!==r)return;e.innerHTML=`<div class="card" style="padding:28px;text-align:center;"><p style="color:var(--danger);font-weight:600;margin:0 0 10px;">Couldn't load this page.</p><button class="btn btn-secondary" id="page-reload">Reload</button></div>`;let i=e.querySelector(`#page-reload`);i&&(i.onclick=()=>location.reload())})}:null}var zt=!1;function Bt(){zt||!(`serviceWorker`in navigator)||(zt=!0,navigator.serviceWorker.addEventListener(`message`,e=>{let t=e.data;t&&t.type===`notification-click`&&O(t)}))}var Vt=null;function Ht(){Bt(),!Vt&&(a(),wt(),T(),Vt=g(null,e=>{de(e),i({title:e.title||`Update`,body:e.body||``,tag:e.subject||`app-notify`,onclick:()=>O(e),type:e.subject===`payment_received`?`payment`:e.subject===`new_assignment`||e.subject===`new_service_request`||e.subject===`new_complaint`||e.subject===`employee_clock_in`||e.subject===`employee_clock_out`||e.subject===`device_followup_reminder`||e.subject===`sla_breach`?`alert`:`info`})}))}var Ut=!1;function X(e,t={}){if(W(),Y=e,t.push!==!1)try{Ut?history.pushState({page:e,app:!0},``,`#${e}`):(history.replaceState({page:e,app:!0},``,`#${e}`),Ut=!0)}catch{}let n=It(q),r=Rt(q,e);Te({user:K,role:q,activePage:Y,navItems:n,onNav:X,pageContent:r||(()=>{})}),Ht(),q===`employee`&&V(()=>import(`./media-training-f0YrcdYi.js`).then(e=>e.mountEmployeePopupAds()),__vite__mapDeps([6,1])).catch(()=>{}),window.__softRefresh=()=>X(Y,{push:!1}),window.__appNav=e=>X(e),window.__appRole=q}window.addEventListener(`popstate`,e=>{let t=document.querySelectorAll(`.modal-overlay`);if(t.length){let e=t[t.length-1],n=e.querySelector(`.modal-close`);n?n.click():e.remove();try{history.pushState({page:Y,app:!0},``,`#${Y}`)}catch{}return}e.state&&e.state.app&&e.state.page&&q&&X(e.state.page,{push:!1})});function Z(){ct(G,Zt),Nt()}function Wt(){W(),bt(G,e=>{e?window.history.replaceState({},``,`/?tab=install&type=${encodeURIComponent(e)}`):window.history.replaceState({},``,`/`),Z()})}window.__goToInstall=Wt;function Gt(){let e=new URLSearchParams(window.location.search);return e.get(`tab`)===`install`&&!e.has(`type`)}function Kt(){let e=new URLSearchParams(window.location.search),t=window.location.pathname.replace(/\/+$/,``)||`/`;return t===`/feedback`||t.startsWith(`/f/`)||e.has(`feedback`)||e.has(`f`)||e.has(`token`)}var qt=e=>e?.can_add_service===1||e?.can_add_service===!0,Q=null,Jt=e=>{let t=e?.allowed_tabs;if(t==null||t===``)return null;if(typeof t==`string`)try{t=JSON.parse(t)}catch{return null}return Array.isArray(t)?new Set(t.map(String)):null},Yt=null;function Xt(e){Yt&&=(y.removeChannel(Yt),null),Yt=y.channel(`my-profile`).on(`postgres_changes`,{event:`UPDATE`,schema:`public`,table:`profiles`,filter:`id=eq.${e}`},e=>{let t=e.new;t&&q===`employee`&&(J=qt(t),Q=Jt(t),X(Y,{push:!1}))}).subscribe()}function Zt(){re(async(e,t)=>{if(t!==`admin`&&t!==`employee`){await x(),r(`Client accounts cannot log in here. Please use the public service request form.`,`error`),Z();return}K=e,q=t,localStorage.setItem($,Qt()),t===`employee`&&(J=qt(e),Q=Jt(e)),Xt(e.id),X(`dashboard`)},()=>Z())}var $=`nest-session-day`,Qt=()=>new Date().toLocaleDateString(`en-CA`);function $t(){let e=localStorage.getItem($);return!!e&&e!==Qt()}async function en(){localStorage.setItem($,Qt());try{await x()}catch{}K=null,q=null,r(`Your daily session has ended. Please log in and clock in again.`,`info`),Z()}setInterval(()=>{q===`employee`&&$t()&&en()},60*1e3);async function tn(){if(G.innerHTML=`<div class="loading-screen"><div class="spinner"></div></div>`,Kt()){ct(G,Zt),W();return}if(Gt()){Wt();return}let e=null;try{({data:{session:e}}=await y.auth.getSession())}catch(e){console.warn(`[boot] session check failed`,e),Z();return}if(e?.user)try{if(K=e.user,q=e.user.role||await b(K.id),q!==`admin`&&q!==`employee`){await x(),K=null,q=null,Z();return}if(q===`employee`&&$t()){await en();return}localStorage.setItem($,Qt()),q===`employee`&&(J=qt(K),Q=Jt(K)),Xt(K.id),X(`dashboard`)}catch(e){console.warn(`[boot] dashboard load failed`,e),Z()}else Z()}y.auth.onAuthStateChange(e=>{e===`SIGNED_OUT`&&(K=null,q=null,Z())}),tn();export{O as n,y as r,V as t};