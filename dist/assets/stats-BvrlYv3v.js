import{g as e,l as t,m as n,n as r,t as i}from"./icons-j8TZxXx3.js";import{r as a}from"./index-BO2-RaLs.js";import{n as o,t as s}from"./dashboard-widgets-BBXbUQBH.js";var c=e=>String(e??``).replace(/[&<>"]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`})[e]),l=e=>e?new Date(e).toLocaleDateString(`en-CA`):``,u=e=>`₹${Math.round(Number(e)||0).toLocaleString(`en-IN`)}`,d=[{key:`check`,svg:i.check},{key:`ticket`,svg:i.ticket},{key:`clock`,svg:i.clock},{key:`rupee`,svg:i.rupee},{key:`users`,svg:i.users},{key:`user`,svg:i.user},{key:`inbox`,svg:i.inbox},{key:`shield`,svg:i.shield},{key:`receipt`,svg:i.receipt},{key:`box`,svg:i.box},{key:`star`,svg:i.star},{key:`refresh`,svg:i.refresh},{key:`dashboard`,svg:i.dashboard},{key:`bell`,svg:i.bell},{key:`wrench`,svg:i.wrench},{key:`alert`,svg:i.alert},{key:`card`,svg:i.card},{key:`pin`,svg:i.pin},{key:`clipboard`,svg:i.clipboard},{key:`hourglass`,svg:i.hourglass}],f=[{key:`green`,label:`Green`,css:`var(--success)`},{key:`blue`,label:`Blue`,css:`var(--primary)`},{key:`amber`,label:`Amber`,css:`var(--warning)`},{key:`red`,label:`Red`,css:`var(--danger)`},{key:`purple`,label:`Purple`,css:`#7c5cfc`},{key:`sky`,label:`Sky`,css:`#2e9bff`},{key:`teal`,label:`Teal`,css:`#0ea5a5`}];function p(e){return d.find(t=>t.key===e)?.svg||i.check}function m(e){return f.find(t=>t.key===e)?.css||`var(--primary)`}function h(e,t,n,r=`var(--primary)`,i=``){return`<div class="glass stat-mini">
    <div class="ic" style="background:${r}1a;color:${r}">${e}</div>
    <div class="v" style="color:${r}">${t}</div>
    <div class="l">${n}</div>
    ${i?`<div class="stat-sub">${i}</div>`:``}
  </div>`}function g(e,t){let n=p(e.icon),r=m(e.color);return`<div class="glass stat-mini stat-custom" data-idx="${t}">
    <div class="ic" style="background:${r}1a;color:${r}">${n}</div>
    <div class="v" style="color:${r}">${c(String(e.value))}</div>
    <div class="l">${c(e.label)}</div>
    ${e.note?`<div class="stat-sub">${c(e.note)}</div>`:``}
    <div class="stat-custom-actions">
      <button class="btn btn-secondary btn-sm edit-stat-btn" data-idx="${t}" title="Edit">${i.edit}</button>
      <button class="btn btn-secondary btn-sm del-stat-btn"  data-idx="${t}" title="Remove">${i.close}</button>
    </div>
  </div>`}function _(){return`<div class="glass stat-mini stat-add-btn" id="add-stat-btn" style="cursor:pointer;border:2px dashed var(--border);justify-content:center;align-items:center;flex-direction:column;gap:8px;min-height:110px">
    <div style="font-size:1.8rem;color:var(--text-dim);line-height:1">${i.plus}</div>
    <div style="font-size:0.82rem;font-weight:700;color:var(--text-dim)">Add Stat</div>
  </div>`}function v(e={}){let t=d.map(t=>`<button type="button" class="icon-opt-btn${e.icon===t.key?` selected`:``}" data-icon="${t.key}"
      style="width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;
             border:2px solid ${e.icon===t.key?`var(--primary)`:`var(--border)`};background:var(--bg);cursor:pointer">
      ${t.svg}
    </button>`).join(``),n=f.map(t=>`<button type="button" class="color-opt-btn${e.color===t.key?` selected`:``}" data-color="${t.key}"
      title="${t.label}"
      style="width:28px;height:28px;border-radius:50%;background:${t.css};border:3px solid ${e.color===t.key?`var(--text)`:`transparent`};cursor:pointer">
    </button>`).join(``);return`<div class="modal-overlay" id="stat-modal-overlay">
    <div class="modal" style="max-width:420px">
      <div class="modal-header">
        <span class="modal-title">${i.check}<span style="margin-left:8px">${e.label?`Edit Stat`:`Add Custom Stat`}</span></span>
        <button class="modal-close" id="stat-modal-close">${i.close}</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:16px">
        <div class="form-group">
          <label>Label</label>
          <input id="stat-label" class="form-control" placeholder="e.g. Monthly Target" value="${c(e.label||``)}">
        </div>
        <div class="form-group">
          <label>Value</label>
          <input id="stat-value" class="form-control" placeholder="e.g. 50 or ₹12,000" value="${c(String(e.value??``))}">
        </div>
        <div class="form-group">
          <label>Note <span style="color:var(--text-dim);font-size:0.78rem">(optional)</span></label>
          <input id="stat-note" class="form-control" placeholder="e.g. set by manager" value="${c(e.note||``)}">
        </div>
        <div class="form-group">
          <label>Icon</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${t}</div>
          <input type="hidden" id="stat-icon" value="${c(e.icon||`check`)}">
        </div>
        <div class="form-group">
          <label>Color</label>
          <div style="display:flex;gap:8px;align-items:center">${n}</div>
          <input type="hidden" id="stat-color" value="${c(e.color||`blue`)}">
        </div>
      </div>
      <div class="modal-footer" style="display:flex;gap:10px;justify-content:flex-end;padding:16px 20px;border-top:1px solid var(--border)">
        <button class="btn btn-secondary" id="stat-modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="stat-modal-save">Save</button>
      </div>
    </div>
  </div>`}function y(t,n,r,i=-1){let a=i>=0?r[i]:{};document.body.insertAdjacentHTML(`beforeend`,v(a));let o=document.getElementById(`stat-modal-overlay`);o.querySelectorAll(`.icon-opt-btn`).forEach(e=>{e.addEventListener(`click`,()=>{o.querySelectorAll(`.icon-opt-btn`).forEach(e=>{e.style.borderColor=`var(--border)`,e.classList.remove(`selected`)}),e.style.borderColor=`var(--primary)`,e.classList.add(`selected`),o.querySelector(`#stat-icon`).value=e.dataset.icon})}),o.querySelectorAll(`.color-opt-btn`).forEach(e=>{e.addEventListener(`click`,()=>{o.querySelectorAll(`.color-opt-btn`).forEach(e=>{e.style.borderColor=`transparent`,e.classList.remove(`selected`)}),e.style.borderColor=`var(--text)`,e.classList.add(`selected`),o.querySelector(`#stat-color`).value=e.dataset.color})});let s=()=>o.remove();o.querySelector(`#stat-modal-close`).onclick=s,o.querySelector(`#stat-modal-cancel`).onclick=s,o.addEventListener(`click`,e=>{e.target===o&&s()}),o.querySelector(`#stat-modal-save`).onclick=()=>{let a=o.querySelector(`#stat-label`).value.trim(),c=o.querySelector(`#stat-value`).value.trim();if(!a||!c){e(`Label and Value are required`,`error`);return}let l={label:a,value:c,note:o.querySelector(`#stat-note`).value.trim(),icon:o.querySelector(`#stat-icon`).value||`check`,color:o.querySelector(`#stat-color`).value||`blue`};i>=0?r[i]=l:r.push(l),localStorage.setItem(n,JSON.stringify(r)),s(),b(t,n,r),e(i>=0?`Stat updated`:`Stat added`,`success`)}}function b(e,t,n){let r=e.querySelector(`#custom-stats-grid`);r&&(r.innerHTML=n.map((e,t)=>g(e,t)).join(``)+_(),x(e,t,n))}function x(t,n,r){t.querySelector(`#add-stat-btn`)?.addEventListener(`click`,()=>y(t,n,r)),t.querySelectorAll(`.edit-stat-btn`).forEach(e=>e.addEventListener(`click`,i=>{i.stopPropagation(),y(t,n,r,Number(e.dataset.idx))})),t.querySelectorAll(`.del-stat-btn`).forEach(i=>i.addEventListener(`click`,a=>{a.stopPropagation();let o=Number(i.dataset.idx);r.splice(o,1),localStorage.setItem(n,JSON.stringify(r)),b(t,n,r),e(`Stat removed`,`success`)}))}async function S(e){n(e);let t=new Date().toLocaleDateString(`en-CA`),s=`nest-custom-stats-admin`,d=[],f=[],p=[],m=[],g=[],_=[];try{let[e,t,n,r,i,o]=await Promise.all([a.from(`inquiries`).select(`*`).order(`created_at`,{ascending:!1}),a.from(`attendance`).select(`*`).order(`clock_in`,{ascending:!1}),a.from(`complaints`).select(`*`),a.from(`profiles`).select(`*`),a.from(`eod_reports`).select(`*`).order(`date`,{ascending:!1}),a.from(`inventory`).select(`id,quantity,min_stock`)]);d=e.data||[],f=t.data||[],p=n.data||[],m=r.data||[],g=i.data||[],_=o.data||[]}catch(t){e.innerHTML=`<div class="card" style="text-align:center;padding:40px"><p style="color:var(--danger)">${c(t.message)}</p></div>`;return}let v=d,y=v.filter(e=>[`resolved`,`closed`].includes(e.status)),b=v.filter(e=>![`resolved`,`closed`,`issue_not_resolved`].includes(e.status)),S=v.filter(e=>l(e.created_at)===t).length,C=y.filter(e=>l(e.updated_at||e.created_at)===t).length,w=v.filter(e=>e.status===`in_progress`).length,T=b.filter(e=>!e.assigned_employee_id).length,E=v.filter(e=>e.bill_amount&&e.payment_status!==`paid`).length,D=v.filter(e=>e.payment_method===`cash`&&e.payment_status===`paid`&&e.cash_collected_at&&!e.cash_submitted_at).reduce((e,t)=>e+(Number(t.bill_total)||0),0),O=p.filter(e=>![`resolved`,`closed`].includes(String(e.status||``).toLowerCase())).length,k=_.filter(e=>e.quantity<=e.min_stock).length,A=y.filter(e=>l(e.updated_at||e.created_at)===t?new Date(e.updated_at||e.created_at)<=r(e.created_at):!1).length,j=C>0?Math.round(A/C*100):0,M=m.filter(e=>e.role===`employee`).length,N=f.filter(e=>l(e.clock_in)===t),P=N.filter(e=>e.clock_in&&!e.clock_out).length,ee=new Set(N.map(e=>e.user_id).filter(Boolean)),te=new Set(g.filter(e=>e.date===t).map(e=>e.employee_id).filter(Boolean)),F=[...ee].filter(e=>!te.has(e)).length,I=v.filter(e=>e.bill_amount||e.bill_total).length,L=v.filter(e=>e.payment_status===`paid`).length,R=v.filter(e=>e.assigned_employee_id).length,z=Math.max(1,parseInt(localStorage.getItem(`nest-daily-target`)||`8`,10)),B=Math.min(100,Math.round(C/z*100)),V=[],H=new Date;for(let e=5;e>=0;e--)V.push(new Date(H.getFullYear(),H.getMonth()-e,1));let ne=V.map(e=>e.toLocaleDateString(`en-US`,{month:`short`})),re=V.map(e=>v.filter(t=>{let n=new Date(t.created_at);return n.getFullYear()===e.getFullYear()&&n.getMonth()===e.getMonth()}).length),U=new Map([[`CCTV`,0],[`Networking`,0],[`Biometric`,0],[`Gate Automation`,0],[`Other`,0]]);v.forEach(e=>{let t=(e.service_item||``).toLowerCase();t.includes(`cctv`)||t.includes(`camera`)||t.includes(`dvr`)||t.includes(`nvr`)?U.set(`CCTV`,U.get(`CCTV`)+1):t.includes(`network`)||t.includes(`wifi`)||t.includes(`switch`)||t.includes(`router`)?U.set(`Networking`,U.get(`Networking`)+1):t.includes(`biometric`)||t.includes(`attendance`)||t.includes(`fingerprint`)?U.set(`Biometric`,U.get(`Biometric`)+1):t.includes(`gate`)||t.includes(`barrier`)||t.includes(`boom`)||t.includes(`automation`)?U.set(`Gate Automation`,U.get(`Gate Automation`)+1):U.set(`Other`,U.get(`Other`)+1)});let ie=[{label:`CCTV`,value:U.get(`CCTV`),color:`#15a05a`},{label:`Networking`,value:U.get(`Networking`),color:`#0ea5a5`},{label:`Biometric`,value:U.get(`Biometric`),color:`#6366f1`},{label:`Gate Auto`,value:U.get(`Gate Automation`),color:`#e08a14`},{label:`Other`,value:U.get(`Other`),color:`#94a3b8`}].filter(e=>e.value>0),ae=[{label:`New`,value:S,color:`var(--primary)`},{label:`Pending`,value:T,color:`#f5a524`},{label:`In Progress`,value:w,color:`#2e9bff`},{label:`Resolved`,value:C,color:`var(--success)`}],W=[{label:`Low Stock`,value:k,color:`#f5a524`},{label:`Unpaid`,value:E,color:`#f0556d`},{label:`Complaints`,value:O,color:`#ef4444`},{label:`EOD Warn`,value:F,color:`#7c5cfc`}],G=new Map,K=new Map;m.forEach(e=>{e.phone&&e.company&&G.set(e.phone,e.company),e.id&&K.set(e.id,e)});let q=new Map;v.forEach(e=>{let t=e.company_name||G.get(e.phone)||`Walk-in / Unregistered`;q.has(t)||q.set(t,{total:0,active:0,resolved:0});let n=q.get(t);n.total++,[`resolved`,`closed`].includes(e.status)?n.resolved++:n.active++});let J=[...q.entries()].sort((e,t)=>t[1].total-e[1].total).slice(0,8),Y=new Map;v.forEach(e=>{if(!e.assigned_employee_id||![`resolved`,`closed`].includes(e.status))return;let t=K.get(e.assigned_employee_id);!t?.full_name||t.role===`admin`||(Y.has(e.assigned_employee_id)||Y.set(e.assigned_employee_id,{name:t.full_name,jobs:0}),Y.get(e.assigned_employee_id).jobs++)});let X=[...Y.values()].sort((e,t)=>t.jobs-e.jobs).slice(0,6),Z=0,Q=0,oe=0,$=0;v.forEach(e=>{[`resolved`,`closed`].includes(e.status)?oe++:e.status===`in_progress`?Q++:[`pending`,`open`].includes(e.status)?Z++:$++});let se=[{label:`Open`,color:`#3B82F6`,value:Z},{label:`In Progress`,color:`#f5a524`,value:Q},{label:`Resolved`,color:`#15a05a`,value:oe}];$&&se.push({label:`Other`,color:`#94a3b8`,value:$});let ce=[h(i.inbox,S,`New Today`,`#2e9bff`),h(i.clock,T,`Pending Assignment`,`var(--warning)`),h(i.refresh,w,`In Progress`,`#7c5cfc`),h(i.check,C,`Resolved Today`,`var(--success)`),h(i.receipt,E,`Unpaid Bills`,`var(--danger)`),h(i.rupee,u(D),`Cash Pending`,`var(--warning)`),h(i.shield,O,`Open Complaints`,`var(--danger)`),h(i.clipboard,F,`EOD Warnings`,F>0?`var(--warning)`:`var(--success)`)].join(``),le=[];try{le=JSON.parse(localStorage.getItem(s)||`[]`)}catch{le=[]}e.innerHTML=`
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:24px">
      <div>
        <h1 style="display:inline-flex;align-items:center;gap:10px">${i.dashboard}<span>Stats</span></h1>
        <p style="color:var(--text-soft);margin:4px 0 0">Live analytics — charts, trends &amp; metrics</p>
      </div>
    </div>

    <div id="stats-hero" class="dash-hero"></div>

    <div class="card" id="today-scorecard" style="margin-bottom:20px">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <span class="card-title" style="display:inline-flex;align-items:center;gap:8px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${C>=z?`var(--success)`:`var(--primary)`};display:inline-block"></span>
          Today's Scorecard
        </span>
        <div style="display:inline-flex;align-items:center;gap:8px;font-size:0.82rem;">
          <span style="color:var(--text-dim);font-weight:600;">Daily Target:</span>
          <input type="number" id="daily-target-input" min="1" max="999" value="${z}"
                 style="width:64px;padding:4px 10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-weight:700;font-size:0.9rem;text-align:center;">
        </div>
      </div>
      <div class="card-body" style="display:grid;grid-template-columns:repeat(3,1fr);gap:0;padding:0;">
        <div style="padding:20px 24px;text-align:center;border-right:1px solid var(--border);">
          <div style="font-size:0.7rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;">Resolved Today</div>
          <div style="font-size:2.8rem;font-weight:800;line-height:1;color:${C>=z?`var(--success)`:`var(--text)`}">
            ${C}<span style="font-size:1.1rem;font-weight:600;color:var(--text-dim)"> / ${z}</span>
          </div>
          <div style="margin-top:14px;height:8px;background:var(--border);border-radius:6px;overflow:hidden">
            <div id="target-progress-bar" style="height:100%;width:${B}%;background:${C>=z?`var(--success)`:`var(--primary)`};border-radius:6px;transition:width 0.5s ease;min-width:${C>0?4:0}px"></div>
          </div>
          <div style="margin-top:8px;font-size:0.78rem;font-weight:600;color:${C>=z?`var(--success)`:`var(--text-dim)`}">
            ${C>=z?`🎯 Goal reached!`:`${z-C} more to reach goal`}
          </div>
        </div>
        <div style="padding:20px 24px;text-align:center;border-right:1px solid var(--border);">
          <div style="font-size:0.7rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;">On-Time Rate Today</div>
          <div style="font-size:2.8rem;font-weight:800;line-height:1;color:${j>=80?`var(--success)`:j>=60?`var(--warning)`:C===0?`var(--text-dim)`:`var(--danger)`}">
            ${j}<span style="font-size:1.1rem;font-weight:600;color:var(--text-dim)">%</span>
          </div>
          <div style="margin-top:14px;height:8px;background:var(--border);border-radius:6px;overflow:hidden">
            <div style="height:100%;width:${j}%;background:${j>=80?`var(--success)`:j>=60?`var(--warning)`:`var(--danger)`};border-radius:6px;min-width:${A>0?4:0}px"></div>
          </div>
          <div style="margin-top:8px;font-size:0.78rem;font-weight:600;color:var(--text-dim)">
            ${C===0?`No tickets resolved yet today`:`${A} of ${C} within SLA (12 hrs)`}
          </div>
        </div>
        <div style="padding:20px 24px;text-align:center;">
          <div style="font-size:0.7rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;">New Today</div>
          <div style="font-size:2.8rem;font-weight:800;line-height:1;color:var(--primary)">${S}</div>
          <div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
            <span style="padding:3px 10px;border-radius:20px;background:rgba(124,92,252,0.12);color:var(--violet,#7c5cfc);font-size:0.75rem;font-weight:700">${w} in progress</span>
            <span style="padding:3px 10px;border-radius:20px;background:rgba(245,165,36,0.12);color:var(--amber,var(--warning));font-size:0.75rem;font-weight:700">${T} unassigned</span>
          </div>
          <div style="margin-top:8px;font-size:0.78rem;font-weight:600;color:var(--text-dim)">
            ${S>0&&C>0?`Net ${S>C?`+`:``}${S-C} tickets ${S>C?`added`:`cleared`} today`:S>0?`All pending action`:`Clean slate today`}
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:24px">
      <div class="card-header"><span class="card-title">Quick Metrics</span></div>
      <div class="card-body" style="padding-top:0">
        <div class="grid-stats">${ce}</div>
      </div>
    </div>

  `,e.querySelector(`#stats-hero`).innerHTML=o({resolutionRate:v.length?y.length/v.length*100:0,assignmentRate:v.length?R/v.length*100:0,collectionRate:I?L/I*100:0,attendanceRate:M?P/M*100:0,resolved:y.length,totalReq:v.length,assigned:R,paid:L,billed:I,inCount:P,empTotal:M,trendLabels:ne,trendValues:re,statusSegs:se,pipeline:ae,alerts:W,companies:J,topTechs:X,categorySegs:ie}),e.querySelector(`#daily-target-input`)?.addEventListener(`change`,t=>{let n=Math.max(1,parseInt(t.target.value,10)||8);t.target.value=n,localStorage.setItem(`nest-daily-target`,String(n));let r=e.querySelector(`#target-progress-bar`);r&&(r.style.width=Math.min(100,Math.round(C/n*100))+`%`,r.style.background=C>=n?`var(--success)`:`var(--primary)`)}),x(e,s,le)}async function C(o){n(o);let{data:{user:u}}=await a.auth.getUser();if(!u){o.innerHTML=`<p>Please sign in.</p>`;return}let d=new Date().toLocaleDateString(`en-CA`),f=`nest-custom-stats-employee`,p=null,m=[],g=null,_=[],v=[],y=[];try{let[e,t,n,r,i,o]=await Promise.all([a.from(`attendance`).select(`*`).eq(`user_id`,u.id).eq(`date`,d).maybeSingle(),a.from(`tickets`).select(`*, inquiries(*)`).eq(`assigned_to`,u.id).order(`created_at`,{ascending:!1}),a.from(`eod_reports`).select(`*`).eq(`employee_id`,u.id).eq(`date`,d).maybeSingle(),a.from(`inquiries`).select(`*`).eq(`assigned_employee_id`,u.id).order(`created_at`,{ascending:!1}),a.from(`attendance`).select(`*`).eq(`user_id`,u.id).order(`date`,{ascending:!1}),a.from(`eod_reports`).select(`*`).eq(`employee_id`,u.id).order(`date`,{ascending:!1})]);p=e.data,m=t.data||[],g=n.data,_=r.data||[],v=i.data||[],y=o.data||[]}catch(e){o.innerHTML=`<div class="card" style="text-align:center;padding:40px"><p style="color:var(--danger)">${c(e.message)}</p></div>`;return}let b=!!p?.clock_in&&!p?.clock_out,S=!!p?.clock_out,C=m.filter(e=>![`resolved`,`closed`].includes(e.status)),w=m.filter(e=>[`resolved`,`closed`].includes(e.status)),T=w.filter(e=>l(e.updated_at||e.created_at)===d).length,E=w.filter(e=>{if(l(e.updated_at||e.created_at)!==d)return!1;let t=(Array.isArray(e.inquiries)?e.inquiries[0]:null)?.created_at||e.created_at;return new Date(e.updated_at||e.created_at)<=r(t)}).length,D=T>0?Math.round(E/T*100):0,O=_.filter(e=>e.assignment_status===`accepted`),k=O.length,A=_.filter(e=>e.assignment_status===`pending`).length,j=new Set([`resolved`,`closed`,`case_closed`,`paid`,`foc`]),M=`issue_not_resolved`,N=m.filter(e=>((Array.isArray(e.inquiries)?e.inquiries[0]?.status:null)||e.status||``)===M).length,P=O.filter(e=>!j.has(e.status)&&e.status!==M).length,ee=O.filter(e=>j.has(e.status)).length,te=O.filter(e=>e.status===M).length,F=m.length+k,I=C.length+P,L=w.length+ee,R=N+te,z=[{label:`Active`,value:I,color:`var(--warning)`},{label:`Completed`,value:L,color:`var(--success)`},{label:`Issues`,value:R,color:`var(--danger)`}],B=z.reduce((e,t)=>e+t.value,0),V=2*Math.PI*44,H=0,ne=`
    <div class="card" style="margin-bottom:24px;">
      <div class="card-header"><span class="card-title">Jobs Overview</span></div>
      <div class="card-body" style="padding-top:0;">
        <div class="stats-grid" style="margin-bottom:20px;">
          <div class="stat-card"><div class="stat-value" style="color:var(--primary)">${F}</div><div class="stat-label">Total Jobs</div></div>
          <div class="stat-card"><div class="stat-value" style="color:var(--warning)">${I}</div><div class="stat-label">Active</div></div>
          <div class="stat-card"><div class="stat-value" style="color:var(--success)">${L}</div><div class="stat-label">Completed</div></div>
          <div class="stat-card"><div class="stat-value" style="color:var(--danger)">${R}</div><div class="stat-label">Issues</div></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:center;gap:28px;flex-wrap:wrap;">
          <svg width="150" height="150" viewBox="0 0 120 120" role="img" aria-label="Job status distribution">
            <g transform="rotate(-90 60 60)">
              <circle cx="60" cy="60" r="44" fill="none" stroke="var(--border)" stroke-width="14"/>
              ${z.filter(e=>e.value>0).map(e=>{let t=e.value/B*V,n=`<circle cx="60" cy="60" r="44" fill="none" stroke="${e.color}" stroke-width="14"
      stroke-dasharray="${t.toFixed(2)} ${(V-t).toFixed(2)}" stroke-dashoffset="${(-H).toFixed(2)}"/>`;return H+=t,n}).join(``)}
            </g>
            <text x="60" y="58" text-anchor="middle" font-size="24" font-weight="800" fill="var(--text)" font-family="var(--font-display)">${B}</text>
            <text x="60" y="74" text-anchor="middle" font-size="8" font-weight="700" letter-spacing="1" fill="var(--text-dim)">TOTAL JOBS</text>
          </svg>
          <div style="display:flex;flex-direction:column;gap:10px;min-width:160px;">
            ${z.map(e=>`
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="width:10px;height:10px;border-radius:50%;background:${e.color};flex-shrink:0;"></span>
                <span style="flex:1;font-size:0.85rem;font-weight:600;color:var(--text-soft);">${e.label}</span>
                <span style="font-size:0.9rem;font-weight:800;">${e.value}</span>
              </div>`).join(``)}
          </div>
        </div>
      </div>
    </div>`,re=new Set(y.map(e=>e.date)),U=v.filter(e=>e.date!==d&&!re.has(e.date)).length,ie=d.slice(0,7),ae=v.filter(e=>e.date?.startsWith(ie)&&e.clock_in).length,W=Math.max(1,parseInt(localStorage.getItem(`nest-daily-target-emp`)||`5`,10)),G=Math.min(100,Math.round(T/W*100)),K=[h(i.clock,b?`IN`:S?`OUT`:`—`,`Clock Status`,b?`var(--success)`:S?`var(--warning)`:`var(--text-dim)`,b?`currently clocked in`:S?`clocked out today`:`not clocked in`),h(i.check,`${T} / ${W}`,`Completed / Target`,T>=W?`var(--success)`:`var(--primary)`,`<div style="margin-top:6px;height:5px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;width:${G}%;background:${T>=W?`var(--success)`:`var(--primary)`};border-radius:3px"></div></div>`),h(i.hourglass,`${D}%`,`On-Time Rate Today`,D>=80?`var(--success)`:D>=60?`var(--warning)`:T===0?`var(--text-dim)`:`var(--danger)`,T===0?`no completions yet`:`${E}/${T} within SLA`),h(i.ticket,C.length,`Active Tasks`,`#7c5cfc`),h(i.inbox,k,`Accepted Requests`,`var(--primary)`),h(i.clock,A,`Pending Review`,`var(--warning)`,`awaiting your response`),h(i.check,w.length,`Total Completed`,`var(--success)`,`all time`),h(i.clipboard,g?`✓ Done`:`✗ Pending`,`EOD Today`,g?`var(--success)`:`var(--warning)`),h(i.shield,U,`Missed EODs`,U>0?`var(--danger)`:`var(--success)`,`past days`),h(i.calendar||i.clock,ae,`Days Worked`,`var(--primary)`,`this month`)].join(``),q=`
    <div class="glass stat-mini" style="justify-content:center;flex-direction:column;gap:6px;padding:14px 16px">
      <div style="font-size:0.7rem;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em">Daily Target</div>
      <input type="number" id="emp-daily-target" min="1" max="99" value="${W}"
        style="width:70px;padding:6px 10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-weight:800;font-size:1.2rem;text-align:center">
      <div style="font-size:0.72rem;color:var(--text-dim)">tasks / day</div>
    </div>`,J=[];try{J=JSON.parse(localStorage.getItem(f)||`[]`)}catch{J=[]}let Y=w.length,X=C.length+k+Y,Z=e=>X?e/X*100:0,Q=`<div class="dash-kpis" style="margin-bottom:24px;">
    ${s(b?100:0,`Clock Status`,b?`Since `+t(p?.clock_in):S?`Clocked out today`:`Not clocked in`,b?`var(--success)`:`var(--text-dim)`,b?`IN`:`OUT`)}
    ${s(Z(C.length),`Active Tasks`,`of ${X} total jobs`,`var(--warning)`,`${C.length}`)}
    ${s(Z(k),`Accepted Requests`,`awaiting completion`,`var(--info)`,`${k}`)}
    ${s(Z(Y),`Completed`,`${Y} of ${X} resolved`,`var(--success)`,`${Y}`)}
  </div>`;o.innerHTML=`
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:24px">
      <div>
        <h1 style="display:inline-flex;align-items:center;gap:10px">${i.dashboard}<span>My Stats</span></h1>
        <p style="color:var(--text-soft);margin:4px 0 0">Your personal metrics — live data + custom cards</p>
      </div>
    </div>
    ${Q}
    ${ne}
    <div class="card" style="margin-bottom:24px">
      <div class="card-header">
        <span class="card-title">Live Stats</span>
        <span style="font-size:0.78rem;color:var(--text-dim);margin-left:10px">auto-refreshes on reload</span>
      </div>
      <div class="card-body" style="padding-top:0">
        <div class="grid-stats">
          ${K}${q}
        </div>
      </div>
    </div>
  `,x(o,f,J),o.querySelector(`#emp-daily-target`)?.addEventListener(`change`,t=>{let n=Math.max(1,parseInt(t.target.value,10)||5);t.target.value=n,localStorage.setItem(`nest-daily-target-emp`,String(n)),e(`Daily target saved`,`success`)})}export{S as renderAdminStats,C as renderEmployeeStats};