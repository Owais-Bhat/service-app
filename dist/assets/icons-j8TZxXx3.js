var e=null;function t(){return e||(e=document.createElement(`div`),e.className=`toast-container`,document.body.appendChild(e)),e}function n(e,n=`info`,r=3500){let i=t(),a=document.createElement(`div`),o={success:`✅`,error:`❌`,info:`ℹ️`,warning:`⚠️`};a.className=`toast ${n}`;let s=document.createElement(`span`);s.textContent=o[n]||`ℹ️`;let c=document.createElement(`span`);c.textContent=e==null?``:String(e),a.append(s,c),i.appendChild(a);let l=!1,u=()=>{l||(l=!0,a.style.transition=`0.25s`,a.style.opacity=`0`,a.style.transform=`translateX(120%)`,setTimeout(()=>a.remove(),260))},d=0,f=0,p=0,m=0,h=!1;a.addEventListener(`touchstart`,e=>{let t=e.touches[0];d=t.clientX,f=t.clientY,h=!0,a.style.transition=`none`},{passive:!0}),a.addEventListener(`touchmove`,e=>{if(!h)return;let t=e.touches[0];p=t.clientX-d,m=t.clientY-f,Math.abs(p)>Math.abs(m)&&(a.style.transform=`translateX(${p}px)`,a.style.opacity=String(Math.max(0,1-Math.abs(p)/180)))},{passive:!0}),a.addEventListener(`touchend`,()=>{h=!1,Math.abs(p)>90||m<-60?u():(a.style.transition=`0.2s`,a.style.transform=``,a.style.opacity=``),p=0,m=0}),a.addEventListener(`click`,u),a.style.cursor=`pointer`,setTimeout(u,r)}function r(e){if(e instanceof Date)return Number.isNaN(e.getTime())?null:e;let t=String(e||``).trim();if(!t)return null;let n=/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00\.000Z)?$/.exec(t);if(n)return new Date(Number(n[1]),Number(n[2])-1,Number(n[3]));let r=t.includes(` `)?t.replace(` `,`T`):t,i=new Date(r);return Number.isNaN(i.getTime())?null:i}function i(e){if(!e)return`—`;let t=r(e);return t?t.toLocaleDateString(`en-US`,{month:`short`,day:`numeric`,year:`numeric`}):`-`}function a(e){if(!e)return`—`;let t=r(e);return t?t.toLocaleString(`en-US`,{month:`short`,day:`numeric`,hour:`2-digit`,minute:`2-digit`,second:`2-digit`}):`-`}function o(e){if(!e)return`—`;let t=r(e);return t?t.toLocaleTimeString(`en-US`,{hour:`2-digit`,minute:`2-digit`,second:`2-digit`,hour12:!0}):`-`}function s(e){return e?e.split(` `).map(e=>e[0]).join(``).toUpperCase().slice(0,2):`?`}function c(e,t){if(!t||!t.length)return;let n=Object.keys(t[0]),r=[n.join(`,`),...t.map(e=>n.map(t=>`"${(e[t]===null||e[t]===void 0?``:String(e[t])).replace(/"/g,`""`)}"`).join(`,`))].join(`
`),i=new Blob([r],{type:`text/csv;charset=utf-8;`}),a=document.createElement(`a`),o=URL.createObjectURL(i);a.setAttribute(`href`,o),a.setAttribute(`download`,e),a.style.visibility=`hidden`,document.body.appendChild(a),a.click(),document.body.removeChild(a)}function l(){let e=localStorage.getItem(`theme`)||`light`;document.documentElement.setAttribute(`data-theme`,e),d(e)}function u(){let e=document.documentElement.getAttribute(`data-theme`)===`dark`?`light`:`dark`;document.documentElement.setAttribute(`data-theme`,e),localStorage.setItem(`theme`,e),d(e)}function d(e){document.querySelectorAll(`.theme-toggle-btn`).forEach(t=>{t.innerHTML=e===`dark`?`☀️`:`🌙`})}function f(e,t=12){let n=new Date(e),r=t;for(;r>0;){let e=n.getHours();if(n.getDay()===0){n.setDate(n.getDate()+1),n.setHours(10,0,0,0);continue}if(e<10){n.setHours(10,0,0,0);continue}if(e>=18){n.setDate(n.getDate()+1),n.setHours(10,0,0,0);continue}let t=new Date(n);t.setHours(18,0,0,0);let i=(t.getTime()-n.getTime())/(1e3*60*60);r<=i?(n.setMilliseconds(n.getMilliseconds()+r*60*60*1e3),r=0):(r-=i,n.setDate(n.getDate()+1),n.setHours(10,0,0,0))}return n}function p(e){if(!e)return null;let t=(e.scheduled_at?new Date(e.scheduled_at):f(e.created_at)).getTime();if(t+=Number(e.sla_pause_ms)||0,e.sla_paused_at){let n=new Date(e.sla_paused_at).getTime();Number.isNaN(n)||(t+=Math.max(0,Date.now()-n))}return new Date(t)}function m(e){return!!(e&&e.sla_paused_at)}var h=null;function g(){if(h)return h;let e=window.AudioContext||window.webkitAudioContext;return e?(h=new e,h):null}var _=!1;function v(){if(_)return;let e=g();e&&e.state===`suspended`&&e.resume().catch(()=>{}),_=!0,window.removeEventListener(`click`,v),window.removeEventListener(`keydown`,v),window.removeEventListener(`touchstart`,v)}typeof window<`u`&&(window.addEventListener(`click`,v,{once:!0}),window.addEventListener(`keydown`,v,{once:!0}),window.addEventListener(`touchstart`,v,{once:!0}));function y(e=`info`){let t=g();if(!t)return;t.state===`suspended`&&t.resume().catch(()=>{});let n={payment:[880,1320],success:[660,990],info:[540,720],alert:[440,660]},[r,i]=n[e]||n.info,a=t.currentTime;[r,i].forEach((e,n)=>{let r=t.createOscillator(),i=t.createGain();r.type=`sine`,r.frequency.value=e,r.connect(i).connect(t.destination);let o=a+n*.16;i.gain.setValueAtTime(0,o),i.gain.linearRampToValueAtTime(.18,o+.02),i.gain.exponentialRampToValueAtTime(.001,o+.22),r.start(o),r.stop(o+.24)})}var b=!1;async function x(){if(typeof Notification>`u`)return`unsupported`;if(Notification.permission===`granted`)return`granted`;if(Notification.permission===`denied`)return`denied`;if(b)return Notification.permission;b=!0;try{return await Notification.requestPermission()}catch{return Notification.permission}}function S({title:e,body:t,tag:r,onclick:i,type:a=`info`}){if(y(a),typeof Notification<`u`&&Notification.permission===`granted`)try{let n=new Notification(e,{body:t,tag:r,renotify:!0,silent:!1});return i&&(n.onclick=()=>{window.focus(),i(),n.close()}),n}catch{}n(`${e}${t?` — `+t:``}`,a===`payment`?`success`:a,6e3)}function C(e){let t=new Date,n=e.getTime()-t.getTime();return n<=0?`<span style="color:var(--danger);font-weight:700">OVERDUE</span>`:`<span style="color:var(--primary);font-weight:600">${Math.floor(n/(1e3*60*60))}h ${Math.floor(n%(1e3*60*60)/(1e3*60))}m left</span>`}function w(e){if(!e)return`-`;let t=new Date(e),n=new Date,r=t.getTime()<n.getTime(),i=`${t.getDate()} ${t.toLocaleDateString(`en-US`,{weekday:`long`})} ${t.toLocaleTimeString(`en-US`,{hour:`numeric`,minute:`2-digit`,hour12:!0}).toLowerCase()}`;return`<span style="color:${r?`var(--danger)`:`var(--success)`};font-weight:600;">${i}</span>`}function T(e){e&&(e.innerHTML=`
    <div style="display:flex;justify-content:center;align-items:center;min-height:300px;">
      <div style="text-align:center;">
        <div style="width:50px;height:50px;border:4px solid var(--border);border-top:4px solid var(--primary);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px;" class="loader-spinner"></div>
        <p style="color:var(--text-dim);font-weight:600;">Loading...</p>
      </div>
    </div>
  `)}var E={shield:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3L4 6.5V12c0 4 3.5 7.5 8 9 4.5-1.5 8-5 8-9V6.5z" fill="currentColor" opacity=".18" stroke="none"/>
    <path d="M4 6.5V12c0 4 3.5 7.5 8 9" fill="currentColor" opacity=".12" stroke="none"/>
    <path d="M12 3L4 6.5V12c0 4 3.5 7.5 8 9 4.5-1.5 8-5 8-9V6.5z"/>
    <path d="M12 5l6 2.5V12c0 3-2 5.5-6 7" fill="white" opacity=".15" stroke="none"/>
    <path d="m9.5 12.2 2 2.2 3.5-3.8" stroke-width="2.2"/>
  </svg>`,bell:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 14c0-4.5 2.5-7.5 7-7.5S19 9.5 19 14H5z" fill="currentColor" opacity=".18" stroke="none"/>
    <path d="M5 14h14" fill="none"/>
    <path d="M4 14h16v2H4z" fill="currentColor" opacity=".12" stroke="none"/>
    <path d="M5 14c0-4.5 2.5-7.5 7-7.5S19 9.5 19 14"/>
    <path d="M3 14h18v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-1z"/>
    <path d="M10 19.5a2 2 0 0 0 4 0"/>
    <path d="M12 2v4.5" stroke-width="2.2"/>
    <path d="M6 10.5a7 7 0 0 1 2.5-3" fill="white" opacity=".5" stroke="white" stroke-width="1.2"/>
  </svg>`,check:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9" fill="currentColor" opacity=".18" stroke="none"/>
    <path d="M3 12a9 9 0 0 1 9-9" fill="none" stroke="white" stroke-width="1.5" opacity=".6"/>
    <circle cx="12" cy="12" r="9"/>
    <path d="m8.5 12.5 2.5 2.5 5-5.5" stroke-width="2.2"/>
  </svg>`,user:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="8.5" r="4" fill="currentColor" opacity=".18" stroke="none"/>
    <circle cx="12" cy="8.5" r="4"/>
    <path d="M13.5 6.5a2.5 2.5 0 0 1 1 2" stroke="white" stroke-width="1.3" opacity=".6" stroke-linecap="round"/>
    <path d="M5 21a7 7 0 0 1 14 0" fill="currentColor" opacity=".18" stroke="none"/>
    <path d="M5 21a7 7 0 0 1 14 0"/>
    <path d="M6 21a7 7 0 0 1 4.5-4.5" stroke="white" stroke-width="1.3" opacity=".5" stroke-linecap="round"/>
  </svg>`,users:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="9" cy="7.5" r="3.5" fill="currentColor" opacity=".18" stroke="none"/>
    <circle cx="9" cy="7.5" r="3.5"/>
    <path d="M2 21a7 7 0 0 1 14 0" fill="currentColor" opacity=".18" stroke="none"/>
    <path d="M2 21a7 7 0 0 1 14 0"/>
    <path d="M16 3.5a3.5 3.5 0 0 1 0 7" stroke-dasharray="0"/>
    <path d="M22 21a6 6 0 0 0-9.5-1" stroke-dasharray="0"/>
    <path d="M3.5 21a7 7 0 0 1 4-4" stroke="white" stroke-width="1.2" opacity=".5" stroke-linecap="round"/>
  </svg>`,pin:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 10.5c0 6-8 12-8 12S4 16.5 4 10.5a8 8 0 1 1 16 0z" fill="currentColor" opacity=".18" stroke="none"/>
    <path d="M4 10.5a8 8 0 0 1 5.5-7.5" stroke="white" stroke-width="1.3" opacity=".6" stroke-linecap="round"/>
    <path d="M20 10.5c0 6-8 12-8 12S4 16.5 4 10.5a8 8 0 1 1 16 0z"/>
    <circle cx="12" cy="10.5" r="3" fill="white" opacity=".5" stroke="none"/>
    <circle cx="12" cy="10.5" r="3"/>
  </svg>`,crosshair:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="5.5" fill="currentColor" opacity=".18" stroke="none"/>
    <circle cx="12" cy="12" r="5.5"/>
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
    <circle cx="12" cy="12" r="2" fill="currentColor" opacity=".4" stroke="none"/>
    <circle cx="12" cy="12" r="2"/>
    <path d="M9 9.5a4.5 4.5 0 0 1 3-1.5" stroke="white" stroke-width="1.2" opacity=".6" stroke-linecap="round"/>
  </svg>`,edit:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.5 4.5a2 2 0 0 1 2.8 2.8L8.8 18.8l-4.3 1 1-4.3z" fill="currentColor" opacity=".18" stroke="none"/>
    <path d="M17.5 4.5a2 2 0 0 1 2.8 2.8L8.8 18.8l-4.3 1 1-4.3z"/>
    <path d="M15.5 6.5l2.8 2.8" stroke="white" stroke-width="1.3" opacity=".6" stroke-linecap="round"/>
    <path d="M3 21h8" stroke-width="2"/>
    <path d="M14.5 5.8a1.5 1.5 0 0 1 1 0.6" stroke="white" stroke-width="1.2" opacity=".4" stroke-linecap="round"/>
  </svg>`,receipt:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 3h14v18l-2.5-2-2 2-2-2-2 2-2-2L5 21z" fill="currentColor" opacity=".18" stroke="none"/>
    <path d="M5 3h6v18L9 19l-2 2z" fill="currentColor" opacity=".08" stroke="none"/>
    <path d="M5 3h14v18l-2.5-2-2 2-2-2-2 2-2-2L5 21z"/>
    <path d="M13 3h6v3" stroke="white" stroke-width="1.3" opacity=".5" stroke-linecap="round"/>
    <path d="M8.5 9h7M8.5 13h7M8.5 17h5" stroke-width="1.6"/>
  </svg>`,wrench:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16.5 2.5a5 5 0 0 0-4.9 6l-7.5 7.5a2 2 0 1 0 2.8 2.8l7.5-7.5a5 5 0 0 0 6-4.9 5 5 0 0 0-.8-2.7l-2.5 2.5-1.8-1.8 2.5-2.5a5 5 0 0 0-1.3-.4z" fill="currentColor" opacity=".18" stroke="none"/>
    <path d="M16.5 2.5a5 5 0 0 0-4.9 6l-7.5 7.5a2 2 0 1 0 2.8 2.8l7.5-7.5a5 5 0 0 0 6-4.9 5 5 0 0 0-.8-2.7l-2.5 2.5-1.8-1.8 2.5-2.5a5 5 0 0 0-1.3-.4z"/>
    <path d="M13.5 5a3.5 3.5 0 0 1 1.5 0.8" stroke="white" stroke-width="1.2" opacity=".6" stroke-linecap="round"/>
  </svg>`,refresh:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2"/>
    <path d="M21 5v6h-6"/>
    <path d="M3 19v-6h6"/>
    <path d="M16.5 6.5a9 9 0 0 1 3 5" stroke="white" stroke-width="1.3" opacity=".5" stroke-linecap="round"/>
  </svg>`,arrowRight:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 7l5.5 5-5.5 5z" fill="currentColor" opacity=".2" stroke="none"/>
    <path d="M14 7l5.5 5-5.5 5z"/>
    <path d="M15.5 8.5l3 3.5" stroke="white" stroke-width="1.2" opacity=".6" stroke-linecap="round"/>
    <path d="M4 12h15" stroke-width="2"/>
  </svg>`,arrowLeft:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 7L4.5 12l5.5 5z" fill="currentColor" opacity=".2" stroke="none"/>
    <path d="M10 7L4.5 12l5.5 5z"/>
    <path d="M8.5 8.5l-3 3.5" stroke="white" stroke-width="1.2" opacity=".6" stroke-linecap="round"/>
    <path d="M20 12H5" stroke-width="2"/>
  </svg>`,moon:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12.8a9 9 0 1 1-9.8-9.8 7 7 0 0 0 9.8 9.8z" fill="currentColor" opacity=".18" stroke="none"/>
    <path d="M21 12.8a9 9 0 1 1-9.8-9.8 7 7 0 0 0 9.8 9.8z"/>
    <path d="M14.5 5a6.5 6.5 0 0 1 2 2" stroke="white" stroke-width="1.3" opacity=".6" stroke-linecap="round"/>
    <circle cx="7.5" cy="9" r="0.8" fill="currentColor" opacity=".3" stroke="none"/>
  </svg>`,sun:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="4.5" fill="currentColor" opacity=".18" stroke="none"/>
    <circle cx="12" cy="12" r="4.5"/>
    <path d="M10.5 10a2.5 2.5 0 0 1 1.5-0.8" stroke="white" stroke-width="1.3" opacity=".6" stroke-linecap="round"/>
    <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" stroke-width="2"/>
  </svg>`,staff:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity=".18" stroke="none"/>
    <rect x="3" y="3" width="8" height="18" rx="3" fill="currentColor" opacity=".08" stroke="none"/>
    <rect x="3" y="3" width="18" height="18" rx="3"/>
    <path d="M3 8h18" stroke="white" stroke-width="1.3" opacity=".5"/>
    <circle cx="12" cy="12" r="2.5" fill="white" opacity=".35" stroke="none"/>
    <circle cx="12" cy="12" r="2.5"/>
    <path d="M7.5 17h9" stroke-width="1.8"/>
    <path d="M4 4h5" stroke="white" stroke-width="1.3" opacity=".5" stroke-linecap="round"/>
  </svg>`,dashboard:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="7" height="9" rx="1.5" fill="currentColor" opacity=".18" stroke="none"/>
    <rect x="14" y="3" width="7" height="5" rx="1.5" fill="currentColor" opacity=".18" stroke="none"/>
    <rect x="14" y="12" width="7" height="9" rx="1.5" fill="currentColor" opacity=".18" stroke="none"/>
    <rect x="3" y="16" width="7" height="5" rx="1.5" fill="currentColor" opacity=".18" stroke="none"/>
    <rect x="3" y="3" width="7" height="9" rx="1.5"/>
    <rect x="14" y="3" width="7" height="5" rx="1.5"/>
    <rect x="14" y="12" width="7" height="9" rx="1.5"/>
    <rect x="3" y="16" width="7" height="5" rx="1.5"/>
    <path d="M3.5 3.5h5" stroke="white" stroke-width="1.2" opacity=".5" stroke-linecap="round"/>
    <path d="M14.5 3.5h5" stroke="white" stroke-width="1.2" opacity=".5" stroke-linecap="round"/>
  </svg>`,ticket:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V9z" fill="currentColor" opacity=".18" stroke="none"/>
    <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V9z"/>
    <path d="M3 9h8v8H3" fill="currentColor" opacity=".08" stroke="none"/>
    <path d="M13 7v10" stroke-dasharray="2 2" stroke-width="1.8"/>
    <path d="M16.5 10h3M16.5 12h3M16.5 14h3" stroke-width="1.5"/>
    <path d="M4.5 9.5h5" stroke="white" stroke-width="1.2" opacity=".5" stroke-linecap="round"/>
  </svg>`,inbox:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 4h14l3 9v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5z" fill="currentColor" opacity=".18" stroke="none"/>
    <path d="M2 13h20" stroke="none"/>
    <path d="M5 4h14l3 9v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5l3-9z"/>
    <path d="M3 13h5l2 3h4l2-3h5"/>
    <path d="M6 4h12" stroke="white" stroke-width="1.3" opacity=".5" stroke-linecap="round"/>
  </svg>`,box:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3L21 8v8l-9 5-9-5V8z" fill="currentColor" opacity=".18" stroke="none"/>
    <path d="M3 8l9 5v8" fill="none" stroke="none"/>
    <path d="M21 8l-9 5" fill="none" stroke="none"/>
    <path d="M3 8l9-5 9 5v8l-9 5-9-5z"/>
    <path d="M3 8l9 5 9-5"/>
    <path d="M12 13v8"/>
    <path d="M21 8l-9 5V8l9-5z" fill="white" opacity=".12" stroke="none"/>
    <path d="M3 8l9 5V8L3 3z" fill="currentColor" opacity=".1" stroke="none"/>
    <path d="M12 4l7 4" stroke="white" stroke-width="1.2" opacity=".5" stroke-linecap="round"/>
  </svg>`,building:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="1.5" fill="currentColor" opacity=".18" stroke="none"/>
    <rect x="4" y="2" width="6" height="20" rx="1.5" fill="currentColor" opacity=".08" stroke="none"/>
    <rect x="4" y="2" width="16" height="20" rx="1.5"/>
    <path d="M4 7h16" stroke="white" stroke-width="1.2" opacity=".5"/>
    <rect x="6.5" y="5" width="2.5" height="2.5" rx=".5" fill="white" opacity=".5" stroke="none"/>
    <rect x="6.5" y="10" width="2.5" height="2.5" rx=".5" stroke-width="1.5"/>
    <rect x="10.8" y="10" width="2.5" height="2.5" rx=".5" stroke-width="1.5"/>
    <rect x="15" y="10" width="2.5" height="2.5" rx=".5" stroke-width="1.5"/>
    <rect x="6.5" y="14.5" width="2.5" height="2.5" rx=".5" stroke-width="1.5"/>
    <rect x="10.8" y="14.5" width="2.5" height="2.5" rx=".5" stroke-width="1.5"/>
    <rect x="9.5" y="18" width="5" height="4" rx=".5"/>
  </svg>`,clock:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9.5" fill="currentColor" opacity=".18" stroke="none"/>
    <circle cx="12" cy="12" r="9.5"/>
    <circle cx="12" cy="12" r="7" fill="white" opacity=".12" stroke="none"/>
    <path d="M6.5 8.5a8.5 8.5 0 0 1 5.5-4" stroke="white" stroke-width="1.3" opacity=".6" stroke-linecap="round"/>
    <path d="M12 7.5V12l3.5 2.5" stroke-width="2"/>
    <circle cx="12" cy="12" r="1.2" fill="currentColor" opacity=".5" stroke="none"/>
  </svg>`,clipboard:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="6" y="4" width="12" height="17.5" rx="2" fill="currentColor" opacity=".18" stroke="none"/>
    <rect x="6" y="4" width="5" height="17.5" rx="2" fill="currentColor" opacity=".08" stroke="none"/>
    <rect x="6" y="4" width="12" height="17.5" rx="2"/>
    <path d="M9.5 2.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5V5h-5z" fill="currentColor" opacity=".3" stroke="none"/>
    <path d="M9.5 2.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5V5h-5z"/>
    <path d="M9 10h6M9 13.5h6M9 17h4" stroke-width="1.8"/>
    <path d="M7 5h5" stroke="white" stroke-width="1.2" opacity=".5" stroke-linecap="round"/>
  </svg>`,search:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="7.5" fill="currentColor" opacity=".18" stroke="none"/>
    <circle cx="11" cy="11" r="7.5"/>
    <circle cx="11" cy="11" r="5" fill="white" opacity=".12" stroke="none"/>
    <path d="M7 7.5a6.5 6.5 0 0 1 4-2.5" stroke="white" stroke-width="1.3" opacity=".6" stroke-linecap="round"/>
    <path d="M16.5 16.5L21 21" stroke-width="2.5"/>
  </svg>`,eye:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1.5 12s4-7 10.5-7 10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" fill="currentColor" opacity=".18" stroke="none"/>
    <path d="M1.5 12s4-7 10.5-7 10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/>
    <path d="M4 12c1.5-3 4.5-5.5 8-5.5" stroke="white" stroke-width="1.3" opacity=".5" stroke-linecap="round"/>
    <circle cx="12" cy="12" r="3.5" fill="white" opacity=".3" stroke="none"/>
    <circle cx="12" cy="12" r="3.5"/>
    <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity=".5" stroke="none"/>
  </svg>`,eyeOff:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10.6 5.3A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.1 6.8C3.5 8.6 2 12 2 12s3.5 7 10 7a10 10 0 0 0 5.2-1.4"/>
    <path d="M9.9 9.9A3 3 0 0 0 14.1 14.1"/>
    <path d="M3 3l18 18" stroke-width="2.2"/>
  </svg>`,star:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2l3 7 7 .6-5.3 4.7 1.6 7-6.3-3.8-6.3 3.8 1.6-7L2 9.6 9 9z" fill="currentColor" opacity=".2" stroke="none"/>
    <path d="M12 2l3 7 7 .6-5.3 4.7 1.6 7-6.3-3.8-6.3 3.8 1.6-7L2 9.6 9 9z"/>
    <path d="M12 4.5l2 4.5" stroke="white" stroke-width="1.2" opacity=".6" stroke-linecap="round"/>
    <path d="M4 10l4.5 0.5" stroke="white" stroke-width="1" opacity=".4" stroke-linecap="round"/>
  </svg>`,starOutline:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2l3 7 7 .6-5.3 4.7 1.6 7-6.3-3.8-6.3 3.8 1.6-7L2 9.6 9 9z"/>
    <path d="M12 4l2 5" stroke="white" stroke-width="1.1" opacity=".5" stroke-linecap="round"/>
  </svg>`,settings:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" fill="currentColor" opacity=".12" stroke="none"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    <circle cx="12" cy="12" r="3.5" fill="white" opacity=".3" stroke="none"/>
    <circle cx="12" cy="12" r="3.5"/>
  </svg>`,block:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9.5" fill="currentColor" opacity=".18" stroke="none"/>
    <circle cx="12" cy="12" r="9.5"/>
    <path d="M6 8a9 9 0 0 1 6-4" stroke="white" stroke-width="1.3" opacity=".6" stroke-linecap="round"/>
    <path d="M5.5 5.5l13 13" stroke-width="2.2"/>
  </svg>`,rupee:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="5" y="3" width="14" height="18" rx="2" fill="currentColor" opacity=".1" stroke="none"/>
    <rect x="5" y="3" width="14" height="18" rx="2"/>
    <path d="M8 7h8M8 11h8" stroke-width="2"/>
    <path d="M8 11c0 0 0 5 5 5" stroke-width="2"/>
    <path d="M9.5 13.5L15 19" stroke-width="2"/>
    <path d="M9 4h5" stroke="white" stroke-width="1.2" opacity=".5" stroke-linecap="round"/>
  </svg>`,card:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2.5" fill="currentColor" opacity=".18" stroke="none"/>
    <rect x="2" y="5" width="20" height="5" rx="2.5" fill="currentColor" opacity=".15" stroke="none"/>
    <rect x="2" y="5" width="20" height="14" rx="2.5"/>
    <path d="M2 10h20" stroke-width="2"/>
    <path d="M3 6h8" stroke="white" stroke-width="1.2" opacity=".5" stroke-linecap="round"/>
    <rect x="5" y="14.5" width="4" height="2" rx=".8" stroke-width="1.5"/>
    <rect x="11" y="14.5" width="6" height="2" rx=".8" stroke-width="1.5"/>
  </svg>`,logout:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" fill="currentColor" opacity=".08" stroke="none"/>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <path d="M16.5 7.5L21 12l-4.5 4.5" fill="currentColor" opacity=".2" stroke="none"/>
    <path d="M16.5 7.5L21 12l-4.5 4.5"/>
    <path d="M21 12H9" stroke-width="2"/>
    <path d="M18.5 9.5L21 12" stroke="white" stroke-width="1.2" opacity=".6" stroke-linecap="round"/>
  </svg>`,menu:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <path d="M4 6h16M4 12h16M4 18h16"/>
  </svg>`,close:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>`,play:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 5l11 7-11 7z" fill="currentColor" opacity=".2" stroke="none"/>
    <path d="M8 5l11 7-11 7z"/>
    <path d="M9.5 7l7 5" stroke="white" stroke-width="1.2" opacity=".5" stroke-linecap="round"/>
  </svg>`,pause:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="5" y="4" width="4.5" height="16" rx="1.5" fill="currentColor" opacity=".2" stroke="none"/>
    <rect x="14.5" y="4" width="4.5" height="16" rx="1.5" fill="currentColor" opacity=".2" stroke="none"/>
    <rect x="5" y="4" width="4.5" height="16" rx="1.5"/>
    <rect x="14.5" y="4" width="4.5" height="16" rx="1.5"/>
    <path d="M5.5 5h3.5v2" stroke="white" stroke-width="1.1" opacity=".5" stroke-linecap="round"/>
  </svg>`,alert:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10.3 3.7L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0z" fill="currentColor" opacity=".18" stroke="none"/>
    <path d="M10.3 3.7L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0z"/>
    <path d="M5.5 18.5L12 6" stroke="white" stroke-width="1.1" opacity=".4" stroke-linecap="round"/>
    <path d="M12 9v5.5" stroke-width="2.2"/>
    <circle cx="12" cy="18" r="1.3" fill="currentColor" stroke="none"/>
  </svg>`,hourglass:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 2h12M6 22h12" stroke-width="2.2"/>
    <path d="M6 2v4l6 6 6-6V2z" fill="currentColor" opacity=".2" stroke="none"/>
    <path d="M6 22v-4l6-6 6 6v4z" fill="currentColor" opacity=".35" stroke="none"/>
    <path d="M6 2v4l6 6 6-6V2z"/>
    <path d="M6 22v-4l6-6 6 6v4z"/>
    <path d="M7 2h10v2l-5 5" stroke="white" stroke-width="1.1" opacity=".5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,plus:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round">
    <path d="M12 5v14M5 12h14"/>
  </svg>`,link:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5" fill="currentColor" opacity=".1" stroke="none"/>
    <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" fill="currentColor" opacity=".1" stroke="none"/>
    <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/>
    <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>
  </svg>`,upload:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" fill="currentColor" opacity=".12" stroke="none"/>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <path d="M17 8l-5-5-5 5z" fill="currentColor" opacity=".2" stroke="none"/>
    <path d="M17 8l-5-5-5 5z"/>
    <path d="M12 3v12" stroke-width="2.2"/>
    <path d="M10 5l2-2" stroke="white" stroke-width="1.3" opacity=".6" stroke-linecap="round"/>
    <path d="M3 17h5" stroke="white" stroke-width="1.2" opacity=".5" stroke-linecap="round"/>
  </svg>`,download:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" fill="currentColor" opacity=".12" stroke="none"/>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <path d="M7 10l5 5 5-5z" fill="currentColor" opacity=".2" stroke="none"/>
    <path d="M7 10l5 5 5-5z"/>
    <path d="M12 15V3" stroke-width="2.2"/>
    <path d="M10 12.5l2 2.5" stroke="white" stroke-width="1.3" opacity=".6" stroke-linecap="round"/>
    <path d="M3 17h5" stroke="white" stroke-width="1.2" opacity=".5" stroke-linecap="round"/>
  </svg>`,phone:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 16.9z" fill="currentColor" opacity=".18" stroke="none"/>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 16.9z"/>
    <path d="M5 3.5c2.5.5 5 2 7 4" stroke="white" stroke-width="1.2" opacity=".5" stroke-linecap="round"/>
  </svg>`,whatsapp:`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>`,filter:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="3.5" width="20" height="3" rx="1.5" fill="currentColor" opacity=".18" stroke="none"/>
    <rect x="5" y="10.5" width="14" height="3" rx="1.5" fill="currentColor" opacity=".18" stroke="none"/>
    <rect x="9" y="17.5" width="6" height="3" rx="1.5" fill="currentColor" opacity=".18" stroke="none"/>
    <path d="M2 5h20M5 12h14M9 19h6"/>
    <path d="M2 5h8" stroke="white" stroke-width="1.2" opacity=".45" stroke-linecap="round"/>
  </svg>`,calendar:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2.5" fill="currentColor" opacity=".18" stroke="none"/>
    <rect x="3" y="4" width="18" height="7" rx="2.5" fill="currentColor" opacity=".12" stroke="none"/>
    <rect x="3" y="4" width="18" height="18" rx="2.5"/>
    <path d="M8 2v4M16 2v4M3 11h18"/>
    <path d="M4 5h7" stroke="white" stroke-width="1.2" opacity=".5" stroke-linecap="round"/>
    <rect x="7" y="14" width="2.5" height="2.5" rx=".6" stroke-width="1.5"/>
    <rect x="11" y="14" width="2.5" height="2.5" rx=".6" stroke-width="1.5"/>
    <rect x="15" y="14" width="2.5" height="2.5" rx=".6" stroke-width="1.5"/>
    <rect x="7" y="18" width="2.5" height="2" rx=".6" stroke-width="1.5"/>
    <rect x="11" y="18" width="2.5" height="2" rx=".6" stroke-width="1.5"/>
  </svg>`};export{u as _,c as a,w as c,l as d,s as f,n as g,S as h,x as i,o as l,T as m,f as n,i as o,m as p,p as r,a as s,E as t,C as u};