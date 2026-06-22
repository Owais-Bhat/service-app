import{g as e,o as t,s as n,t as r}from"./icons-j8TZxXx3.js";import{r as i,t as a}from"./index-BO2-RaLs.js";var o=window.location.hostname!==`localhost`&&window.location.hostname!==`127.0.0.1`?`/api`:`http://localhost:5000/api`,s=()=>({Authorization:`Bearer ${localStorage.getItem(`auth_token`)||``}`}),c=()=>({"Content-Type":`application/json`,...s()}),l=e=>String(e??``).replace(/[&<>"]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`})[e]);async function u(e,t={}){let n=await fetch(`${o}${e}`,t),r=await n.json().catch(()=>({}));if(!n.ok)throw Error(r.error||`Request failed`);return r}async function d(e){let t=new FormData;t.append(`file`,e);let n=await fetch(`${o}/upload`,{method:`POST`,headers:s(),body:t}),r=await n.json();if(!n.ok)throw Error(r.error||`Upload failed`);return r.url}var f=(e,t=760)=>{let n=document.createElement(`div`);return n.className=`modal-overlay tr-modal`,n.innerHTML=`<div class="modal tr-pop" style="max-width:${t}px">${e}</div>`,document.body.appendChild(n),n.addEventListener(`click`,e=>{e.target===n&&n.remove()}),n},p=e=>{if(!e.media_url)return``;let t=l(e.media_url);return e.type===`video`?`<video src="${t}" controls style="width:100%;max-height:360px;border-radius:12px;margin-top:10px;"></video>`:e.type===`image`?`<img src="${t}" style="width:100%;max-height:360px;object-fit:contain;border-radius:12px;margin-top:10px;background:var(--bg);">`:`<a href="${t}" target="_blank" class="btn btn-secondary btn-sm" style="margin-top:10px;">${r.download||``}<span>Open file</span></a>`},m={video:r.play,image:r.eye,pdf:r.receipt,text:r.clipboard},h=e=>String(e||`?`).trim().split(/\s+/).slice(0,2).map(e=>e[0]).join(``).toUpperCase()||`?`;function g(e,t=54,n=6,r=`var(--primary)`){let i=(t-n)/2,a=2*Math.PI*i;return`<svg class="tr-ring" width="${t}" height="${t}" viewBox="0 0 ${t} ${t}">
    <circle cx="${t/2}" cy="${t/2}" r="${i}" fill="none" stroke="var(--border)" stroke-width="${n}"/>
    <circle class="tr-ring-fg" cx="${t/2}" cy="${t/2}" r="${i}" fill="none" stroke="${r}" stroke-width="${n}"
      stroke-linecap="round" stroke-dasharray="${a.toFixed(1)}" stroke-dashoffset="${a.toFixed(1)}"
      data-target="${(a*(1-Math.max(0,Math.min(100,e))/100)).toFixed(1)}"
      transform="rotate(-90 ${t/2} ${t/2})"/>
    <text x="50%" y="50%" dy=".34em" text-anchor="middle" class="tr-ring-txt">${Math.round(e)}%</text>
  </svg>`}function _(e){e.querySelectorAll(`.tr-ring-fg`).forEach(e=>{requestAnimationFrame(()=>{e.style.strokeDashoffset=e.dataset.target})})}function v(e){e.querySelectorAll(`.tr-bar-fill`).forEach(e=>{let t=e.dataset.w;e.style.width=`0%`,requestAnimationFrame(()=>{e.style.width=t+`%`})})}function y(e){let t=[`#10B981`,`#38BDF8`,`#FBBF24`,`#F472B6`,`#A78BFA`,`#34D399`],n=document.createElement(`div`);n.className=`tr-confetti`;for(let e=0;e<36;e++){let r=document.createElement(`i`);r.style.left=Math.random()*100+`%`,r.style.background=t[e%t.length],r.style.animationDelay=Math.random()*.3+`s`,r.style.animationDuration=.9+Math.random()*.8+`s`,r.style.transform=`rotate(${Math.random()*360}deg)`,n.appendChild(r)}e.appendChild(n),setTimeout(()=>n.remove(),2200)}var b=e=>JSON.stringify({_qz:1,...e});function x(e){let t=String(e||``);if(t[0]===`{`&&t.includes(`"_qz"`))try{let e=JSON.parse(t);return{t:e.t||`mcq`,text:e.text||``,img:e.img||null,group:e.group||null,gtitle:e.gtitle||``,left:e.left||``}}catch{}return{t:`mcq`,text:t,img:null,group:null,gtitle:``,left:``}}var S={mcq:{chip:`🎯 MCQ`,color:`var(--primary)`},fill:{chip:`✍️ Fill in the blank`,color:`#A78BFA`},image:{chip:`🖼️ Image question`,color:`#38BDF8`},match:{chip:`🧩 Match the following`,color:`#F59E0B`}};async function C(){return window.__XLSX||(window.__XLSX=await a(()=>import(`https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs`),[])),window.__XLSX}function w(e){let t=[],n=[],r=e=>{let t={};return Object.keys(e).forEach(n=>{t[String(n).toLowerCase().replace(/[^a-z]/g,``)]=e[n]}),t};return e.forEach((e,i)=>{let a=r(e),o=i+2,s=String(a.type||`mcq`).trim().toLowerCase(),c=String(a.question||``).trim(),l=String(a.imageurl||a.image||``).trim()||null,u=[`optiona`,`optionb`,`optionc`,`optiond`].map(e=>String(a[e]??``).trim()).filter(Boolean);if(!c){n.push(`Row ${o}: question is empty`);return}if(s===`match`){let e=u.map(e=>{let t=e.indexOf(`=`);return t>0?[e.slice(0,t).trim(),e.slice(t+1).trim()]:null}).filter(e=>e&&e[0]&&e[1]);if(e.length<2){n.push(`Row ${o}: match needs at least 2 "Left=Right" pairs in the Option columns`);return}let r=crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),i=e.map(e=>e[1]);e.forEach((e,n)=>t.push({question:b({t:`match`,text:c,gtitle:c,left:e[0],group:r}),options:i,correct_index:n}));return}if(u.length<2){n.push(`Row ${o}: needs at least 2 options`);return}let d=String(a.correct??a.correctanswer??`A`).trim(),f=`ABCD`.indexOf(d.toUpperCase());if(f===-1&&/^[1-4]$/.test(d)&&(f=Number(d)-1),f===-1&&(f=u.findIndex(e=>e.toLowerCase()===d.toLowerCase())),f<0||f>=u.length){n.push(`Row ${o}: Correct must be A–D, 1–4, or match an option`);return}if(s===`fill`&&!/_{2,}/.test(c)){n.push(`Row ${o}: fill questions need a blank written as ___ in the question`);return}let p=s===`image`||l&&s===`mcq`?`image`:s===`fill`?`fill`:`mcq`;t.push({question:p===`mcq`?c:b({t:p,text:c,img:l}),options:u,correct_index:f})}),{bodies:t,errors:n}}async function T(){let e=await C(),t=e.utils.aoa_to_sheet([[`Type`,`Question`,`OptionA`,`OptionB`,`OptionC`,`OptionD`,`Correct`,`ImageURL`],[`mcq`,`Which cable carries video for an analog CCTV camera?`,`Coaxial`,`HDMI`,`Audio`,`VGA`,`A`,``],[`mcq`,`What does PoE stand for?`,`Power over Ethernet`,`Point of Entry`,`Port of Exchange`,``,`A`,``],[`fill`,`The default RTSP port is ___`,`554`,`80`,`8080`,`443`,`A`,``],[`fill`,`A ___ assigns IP addresses automatically on a network`,`DHCP server`,`DNS server`,`Firewall`,`Repeater`,`A`,``],[`image`,`Which device is shown in the image?`,`DVR`,`NVR`,`Network Switch`,`Router`,`C`,`https://example.com/your-image.jpg`],[`match`,`Match the device to its purpose`,`DVR=Records analog CCTV footage`,`Switch=Connects LAN devices`,`Biometric=Marks attendance`,`VDP=Video door communication`,``,``]]);t[`!cols`]=[{wch:8},{wch:48},{wch:30},{wch:30},{wch:30},{wch:30},{wch:9},{wch:34}];let n=e.utils.book_new();e.utils.book_append_sheet(n,t,`Quiz`),e.writeFile(n,`quiz-upload-sample.xlsx`)}async function E(t){let n=async()=>{t.innerHTML=`<div class="tr-skeleton-grid">${Array.from({length:3}).map(()=>`<div class="tr-skeleton-card"></div>`).join(``)}</div>`;let i,a;try{[i,a]=await Promise.all([u(`/training/courses`,{headers:s()}),u(`/training/compliance`,{headers:s()})])}catch(e){t.innerHTML=`<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--danger)">${l(e.message)}</div></div>`;return}let o=i.reduce((e,t)=>e+Number(t.lesson_count||0),0),c=i.reduce((e,t)=>e+Number(t.quiz_count||0),0),d=a.reduce((e,t)=>e+Number(t.completed||0),0);t.innerHTML=`
      <div class="tr-head tr-in">
        <div>
          <h1 class="tr-title">${r.shield}<span>Training Academy</span></h1>
          <p class="tr-sub">Build courses with lessons &amp; quizzes, assign them, and track exactly when each employee learns.</p>
        </div>
        <button class="btn btn-primary tr-btn-new" id="tc-new">${r.plus}<span>New Course</span></button>
      </div>

      <div class="tr-stats tr-in" style="--d:.05s">
        ${D(r.clipboard,i.length,`Courses`,`var(--primary)`)}
        ${D(r.inbox,o,`Lessons`,`var(--info, #38BDF8)`)}
        ${D(r.check,c,`Quizzes`,`#A78BFA`)}
        ${D(r.users,d,`Completions`,`var(--success)`)}
      </div>

      <div class="tr-grid">
        ${i.length===0?`<div class="tr-empty card"><div class="card-body">No courses yet. Click <b>New Course</b> to build your first one.</div></div>`:i.map((e,t)=>{let n=a.find(t=>t.course_id===e.id)||{},i=Number(e.assign_count||0),o=Number(n.completed||0),s=i?Math.round(o/i*100):0,c=e.category||`General`,u=c.toLowerCase(),d=u.includes(`cctv`)||u.includes(`camera`)?`t1`:u.includes(`network`)||u.includes(`wifi`)?`t2`:u.includes(`biometric`)||u.includes(`attendance`)?`t3`:u.includes(`gate`)||u.includes(`automation`)?`t4`:[`t1`,`t2`,`t3`,`t4`,`t5`][t%5],f=u.includes(`cctv`)||u.includes(`camera`)?r.shield:u.includes(`network`)||u.includes(`wifi`)?r.link:u.includes(`biometric`)||u.includes(`attendance`)?r.users:u.includes(`gate`)||u.includes(`automation`)?r.box:r.clipboard,p=2*Math.PI*21,m=p*(1-Math.min(s,100)/100);return`
          <div class="tr-card tr-in" style="--d:${(.08+t*.05).toFixed(2)}s">
            <div class="tr-banner ${d}">
              <div class="tr-pat"></div>
              <div class="tr-bico">${f}</div>
              ${e.active?``:`<span class="tr-hidden">Hidden</span>`}
              <span class="tr-cat">${l(c)}</span>
            </div>
            <div class="tr-card-body">
              <h3 class="tr-card-title">${l(e.title)}</h3>
              <p class="tr-card-desc">${l(e.description||`No description`)}</p>
              <div class="tr-card-meta">
                <span>${O(r.inbox)} ${e.lesson_count} lessons</span>
                <span>${O(r.check)} ${e.quiz_count} quiz</span>
                <span>${O(r.users)} ${i} assigned</span>
              </div>
            </div>
            <div class="tr-card-foot">
              <svg class="tr-ring" width="48" height="48" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="21" fill="none" stroke="var(--border)" stroke-width="5"/>
                <circle cx="24" cy="24" r="21" fill="none" stroke="var(--primary)" stroke-width="5" stroke-linecap="round"
                  stroke-dasharray="${p.toFixed(2)}" stroke-dashoffset="${m.toFixed(2)}" transform="rotate(-90 24 24)"/>
                <text x="24" y="28" text-anchor="middle" font-size="11" font-weight="800" fill="var(--text)">${s}%</text>
              </svg>
              <div class="tr-prog-text">
                <div class="tr-prog-top"><span>${s>=100&&i?`Completed`:o>0?`In progress`:`Completion`}</span><b>${o}/${i||`∞`}</b></div>
                <div class="tr-bar"><div class="tr-bar-fill" data-w="${s}"></div></div>
              </div>
              <button class="tr-fab tc-progress" data-id="${e.id}" title="Progress">${r.eye}</button>
              <button class="tr-fab tr-fab-ghost tc-manage" data-id="${e.id}" title="Manage">${r.edit}</button>
              <button class="tr-fab tr-fab-danger tc-del" data-id="${e.id}" data-title="${l(e.title)}" title="Delete">${r.close}</button>
            </div>
          </div>`}).join(``)}
      </div>`,v(t),t.querySelector(`#tc-new`).onclick=()=>k(null,n),t.querySelectorAll(`.tc-manage`).forEach(e=>e.onclick=()=>A(e.dataset.id,n)),t.querySelectorAll(`.tc-progress`).forEach(e=>e.onclick=()=>A(e.dataset.id,n,`progress`)),t.querySelectorAll(`.tc-del`).forEach(t=>t.onclick=async()=>{if(confirm(`Delete course "${t.dataset.title}" and all its lessons/quiz?`))try{await u(`/training/courses/${t.dataset.id}`,{method:`DELETE`,headers:s()}),e(`Course deleted`,`success`),n()}catch(t){e(t.message,`error`)}})};await n()}var D=(e,t,n,r)=>`
  <div class="tr-stat">
    <div class="tr-stat-ico" style="color:${r};background:color-mix(in srgb, ${r} 14%, transparent);">${e}</div>
    <div><div class="tr-stat-num">${t}</div><div class="tr-stat-lbl">${n}</div></div>
  </div>`,O=e=>`<span class="tr-mini-ico">${e}</span>`;function k(t,n){let i=f(`
    <div class="modal-header"><span class="modal-title">${r.clipboard}&nbsp; ${t?`Edit`:`New`} Course</span><button class="modal-close" id="x">&times;</button></div>
    <div class="modal-body">
      <div class="form-group tr-fg"><label>Course title</label><input id="cf-title" placeholder="e.g. CCTV Installation Basics" value="${l(t?.title||``)}"></div>
      <div class="form-group tr-fg"><label>Category</label><input id="cf-cat" list="cf-cats" value="${l(t?.category||`General`)}">
        <datalist id="cf-cats"><option>General</option><option>CCTV</option><option>Video Door Phone</option><option>Networking</option><option>Biometric</option><option>Customer Handling</option><option>App &amp; Billing</option><option>Safety</option></datalist>
      </div>
      <div class="form-group tr-fg"><label>Description</label><textarea id="cf-desc" rows="3" placeholder="What this course teaches…">${l(t?.description||``)}</textarea></div>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" id="x2">Cancel</button><button class="btn btn-primary" id="cf-save">${t?`Save changes`:`Create course`}</button></div>`,520);i.querySelector(`#x`).onclick=i.querySelector(`#x2`).onclick=()=>i.remove(),i.querySelector(`#cf-save`).onclick=async()=>{let r=i.querySelector(`#cf-title`).value.trim();if(!r)return e(`Title required`,`info`);let a={title:r,category:i.querySelector(`#cf-cat`).value.trim()||`General`,description:i.querySelector(`#cf-desc`).value.trim()};try{t?await u(`/training/courses/${t.id}`,{method:`PATCH`,headers:c(),body:JSON.stringify(a)}):await u(`/training/courses`,{method:`POST`,headers:c(),body:JSON.stringify(a)}),e(`Saved`,`success`),i.remove(),n&&n()}catch(t){e(t.message,`error`)}}}async function A(a,o,p=`lessons`){let v,y;try{[v,{data:y}]=await Promise.all([u(`/training/courses/${a}/full`,{headers:s()}),i.from(`profiles`).select(`id,full_name`).eq(`role`,`employee`)])}catch(t){return e(t.message,`error`)}y||=[];let E=v.assignments.some(e=>!e.employee_id),D=new Set(v.assignments.filter(e=>e.employee_id).map(e=>e.employee_id)),k=v.assignments[0]?.due_date?String(v.assignments[0].due_date).slice(0,10):``,A=f(`
    <div class="modal-header"><span class="modal-title">${r.edit}&nbsp; ${l(v.course.title)}</span><button class="modal-close" id="x">&times;</button></div>
    <div class="modal-body">
      <div class="tr-tabs" role="tablist">
        <button class="tr-tab" data-t="lessons">${O(r.inbox)}<span>Lessons</span></button>
        <button class="tr-tab" data-t="quiz">${O(r.check)}<span>Quiz</span></button>
        <button class="tr-tab" data-t="assign">${O(r.users)}<span>Assign</span></button>
        <button class="tr-tab" data-t="progress">${O(r.clock)}<span>Progress</span></button>
        <span class="tr-tab-ink"></span>
      </div>

      <div class="ce-pane" data-p="lessons">
        <div id="ce-lessons" class="tr-list"></div>
        <div class="tr-form-card">
          <div class="tr-form-card-h">${O(r.plus)} Add a lesson</div>
          <div class="form-group tr-fg"><label>Lesson title</label><input id="le-title" placeholder="e.g. How to install a DVR"></div>
          <div class="tr-2col">
            <div class="form-group tr-fg"><label>Type</label><select id="le-type"><option value="video">🎬 Video</option><option value="image">🖼️ Image</option><option value="pdf">📄 PDF / File</option><option value="text">📝 Text only</option></select></div>
            <div class="form-group tr-fg"><label>Media file (optional)</label><input type="file" id="le-file"></div>
          </div>
          <div class="form-group tr-fg"><label>Notes / content</label><textarea id="le-content" rows="2" placeholder="What the employee should learn"></textarea></div>
          <button class="btn btn-primary btn-sm" id="le-add">${O(r.plus)}<span>Add lesson</span></button>
        </div>
      </div>

      <div class="ce-pane" data-p="quiz" style="display:none;">
        <div class="tr-form-card qx-card">
          <div class="tr-form-card-h">📊 Bulk upload from Excel</div>
          <p class="qx-hint">One file, all question types: <b>mcq</b>, <b>fill</b> (write the blank as <code>___</code>), <b>image</b> (image URL column) and <b>match</b> (pairs as <code>Left=Right</code> in the option columns). Download the sample, fill it the same way, upload — done.</p>
          <div class="qx-actions">
            <button class="btn btn-secondary btn-sm" id="qx-sample">${O(r.download||r.clipboard)}<span>Download sample Excel</span></button>
            <input type="file" id="qx-file" accept=".xlsx,.xls,.csv" hidden>
            <button class="btn btn-primary btn-sm" id="qx-upload">${O(r.plus)}<span>Upload Excel</span></button>
          </div>
          <div id="qx-status" class="qx-status"></div>
        </div>

        <div id="ce-quiz" class="tr-list"></div>

        <div class="tr-form-card">
          <div class="tr-form-card-h">${O(r.plus)} Add a single question</div>
          <div class="tr-2col">
            <div class="form-group tr-fg"><label>Type</label>
              <select id="q-type">
                <option value="mcq">🎯 Multiple choice</option>
                <option value="fill">✍️ Fill in the blank (dropdown)</option>
                <option value="image">🖼️ Image question</option>
              </select>
            </div>
            <div class="form-group tr-fg" id="q-img-wrap" style="display:none;"><label>Question image</label><input type="file" id="q-img" accept="image/*"></div>
          </div>
          <div class="form-group tr-fg"><label>Question <small id="q-text-hint" style="color:var(--text-dim);font-weight:400;"></small></label><input id="q-text" placeholder="Type the question"></div>
          <label style="font-size:.78rem;color:var(--text-dim);">Tap the circle to mark the correct answer</label>
          ${[0,1,2,3].map(e=>`<div class="tr-opt-row"><input type="radio" name="q-correct" value="${e}" ${e===0?`checked`:``} title="Mark correct"><input id="q-opt-${e}" placeholder="Option ${e+1}${e<2?` (required)`:` (optional)`}"></div>`).join(``)}
          <button class="btn btn-primary btn-sm" id="q-add" style="margin-top:6px;">${O(r.plus)}<span>Add question</span></button>
          <p class="qx-hint" style="margin-top:8px;">Need match-the-following? Use the Excel upload above — pairs go in as <code>Left=Right</code>.</p>
        </div>
      </div>

      <div class="ce-pane" data-p="assign" style="display:none;">
        <label class="tr-switch-row"><span><b>Assign to all employees</b><small>Every current &amp; future employee sees this course</small></span>
          <span class="tr-switch"><input type="checkbox" id="as-all" ${E?`checked`:``}><i></i></span></label>
        <div id="as-list" class="tr-emp-list ${E?`tr-disabled`:``}">
          ${y.map(e=>`<label class="tr-emp"><input type="checkbox" class="as-emp" value="${e.id}" ${D.has(e.id)?`checked`:``}><span class="tr-ava">${h(e.full_name)}</span><span>${l(e.full_name)}</span></label>`).join(``)||`<div style="color:var(--text-dim);padding:8px;">No employees</div>`}
        </div>
        <div class="form-group tr-fg"><label>Due date (optional)</label><input type="date" id="as-due" value="${k}"></div>
        <button class="btn btn-primary btn-sm" id="as-save">${O(r.check)}<span>Save assignment</span></button>
      </div>

      <div class="ce-pane" data-p="progress" style="display:none;">
        <div id="ce-progress"><div class="tr-loading">Loading activity…</div></div>
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" id="x2">Close</button></div>`,860),j=()=>{A.remove(),o&&o()};A.querySelector(`#x`).onclick=A.querySelector(`#x2`).onclick=j;let M=[...A.querySelectorAll(`.tr-tab`)],N=A.querySelector(`.tr-tab-ink`),P=!1,F=e=>{let t=M.find(t=>t.dataset.t===e)||M[0];M.forEach(e=>e.classList.toggle(`active`,e===t)),N.style.width=t.offsetWidth+`px`,N.style.transform=`translateX(${t.offsetLeft}px)`,A.querySelectorAll(`.ce-pane`).forEach(t=>{let n=t.dataset.p===e;t.style.display=n?`block`:`none`,n&&(t.classList.remove(`tr-pane-anim`),t.offsetWidth,t.classList.add(`tr-pane-anim`))}),e===`progress`&&!P&&(P=!0,V())};M.forEach(e=>e.onclick=()=>F(e.dataset.t));let I=()=>{let t=A.querySelector(`#ce-lessons`);t.innerHTML=v.lessons.length?v.lessons.map((e,t)=>`
      <div class="tr-row tr-in" style="--d:${(t*.03).toFixed(2)}s">
        <span class="tr-row-num">${t+1}</span>
        <span class="tr-row-ico">${m[e.type]||r.clipboard}</span>
        <div class="tr-row-main"><b>${l(e.title)}</b><span class="tr-chip tr-chip-sm">${l(e.type)}</span></div>
        <button class="btn btn-icon btn-danger btn-sm le-del" data-id="${e.id}" title="Delete">${r.close}</button>
      </div>`).join(``):`<div class="tr-empty-mini">No lessons yet. Add your first below.</div>`,t.querySelectorAll(`.le-del`).forEach(t=>t.onclick=async()=>{try{await u(`/training/lessons/${t.dataset.id}`,{method:`DELETE`,headers:s()}),v.lessons=v.lessons.filter(e=>e.id!==t.dataset.id),I()}catch(t){e(t.message,`error`)}})},L=()=>{let t=A.querySelector(`#ce-quiz`);t.innerHTML=v.quiz.length?v.quiz.map((e,t)=>{let n=x(e.question),i=S[n.t]||S.mcq,a=n.t===`match`?`${l(n.gtitle)} — <i>${l(n.left)}</i>`:l(n.text);return`
      <div class="tr-q tr-in" style="--d:${(t*.03).toFixed(2)}s">
        <div class="tr-q-top">
          <b>${t+1}. ${a} <span class="qx-chip" style="color:${i.color};border-color:${i.color}">${i.chip}</span></b>
          <button class="btn btn-icon btn-danger btn-sm q-del" data-id="${e.id}" title="Delete">${r.close}</button>
        </div>
        ${n.img?`<img src="${l(n.img)}" class="qx-thumb" alt="">`:``}
        <div class="tr-q-opts">${e.options.map((t,n)=>`<span class="${n===e.correct_index?`tr-q-correct`:``}">${n===e.correct_index?`✓`:`○`} ${l(t)}</span>`).join(``)}</div>
      </div>`}).join(``):`<div class="tr-empty-mini">No quiz questions yet. Upload an Excel or add one below.</div>`,t.querySelectorAll(`.q-del`).forEach(t=>t.onclick=async()=>{try{await u(`/training/quiz/${t.dataset.id}`,{method:`DELETE`,headers:s()}),v.quiz=v.quiz.filter(e=>e.id!==t.dataset.id),L()}catch(t){e(t.message,`error`)}})};I(),L(),A.querySelector(`#le-add`).onclick=async()=>{let t=A.querySelector(`#le-title`).value.trim();if(!t)return e(`Lesson title required`,`info`);let n=A.querySelector(`#le-add`);n.disabled=!0,n.innerHTML=`<span>Saving…</span>`;try{let n=A.querySelector(`#le-file`).files?.[0],r=n?await d(n):null,i=A.querySelector(`#le-type`).value,o=A.querySelector(`#le-content`).value.trim(),{id:s}=await u(`/training/courses/${a}/lessons`,{method:`POST`,headers:c(),body:JSON.stringify({title:t,type:i,media_url:r,content:o,position:v.lessons.length})});v.lessons.push({id:s,title:t,type:i,media_url:r,content:o}),A.querySelector(`#le-title`).value=``,A.querySelector(`#le-content`).value=``,A.querySelector(`#le-file`).value=``,I(),e(`Lesson added`,`success`)}catch(t){e(t.message,`error`)}n.disabled=!1,n.innerHTML=`${O(r.plus)}<span>Add lesson</span>`};let R=A.querySelector(`#q-type`);R.onchange=()=>{A.querySelector(`#q-img-wrap`).style.display=R.value===`image`?``:`none`,A.querySelector(`#q-text-hint`).textContent=R.value===`fill`?`— write the blank as ___`:``},A.querySelector(`#q-add`).onclick=async()=>{let t=A.querySelector(`#q-text`).value.trim(),n=[0,1,2,3].map(e=>A.querySelector(`#q-opt-${e}`).value.trim()).filter(Boolean);if(!t||n.length<2)return e(`Question and at least 2 options required`,`info`);let r=R.value;if(r===`fill`&&!/_{2,}/.test(t))return e(`Fill-in-the-blank questions need a ___ in the question text`,`info`);let i=Number(A.querySelector(`input[name="q-correct"]:checked`)?.value||0);if(i>=n.length)return e(`The marked correct option is empty`,`info`);let o=A.querySelector(`#q-add`);o.disabled=!0;try{let s=null,l=A.querySelector(`#q-img`)?.files?.[0];if(r===`image`){if(!l)return o.disabled=!1,e(`Pick an image for the question`,`info`);s=await d(l)}let f=r===`mcq`?t:b({t:r,text:t,img:s}),{id:p}=await u(`/training/courses/${a}/quiz`,{method:`POST`,headers:c(),body:JSON.stringify({question:f,options:n,correct_index:i,position:v.quiz.length})});v.quiz.push({id:p,question:f,options:n,correct_index:i}),A.querySelector(`#q-text`).value=``,[0,1,2,3].forEach(e=>A.querySelector(`#q-opt-${e}`).value=``),A.querySelector(`#q-img`)&&(A.querySelector(`#q-img`).value=``),L(),e(`Question added`,`success`)}catch(t){e(t.message,`error`)}o.disabled=!1},A.querySelector(`#qx-sample`).onclick=async()=>{try{await T()}catch(t){e(`Could not build sample: `+t.message,`error`)}};let z=A.querySelector(`#qx-file`);A.querySelector(`#qx-upload`).onclick=()=>z.click(),z.onchange=async()=>{let t=z.files?.[0];if(!t)return;let n=A.querySelector(`#qx-status`);n.innerHTML=`<span class="qx-spin"></span> Reading workbook…`;try{let r=await C(),i=r.read(await t.arrayBuffer(),{type:`array`}),o=i.Sheets[i.SheetNames[0]],{bodies:s,errors:d}=w(r.utils.sheet_to_json(o,{defval:``}));if(!s.length){n.innerHTML=`<span style="color:var(--danger)">No valid questions found.${d.length?` `+l(d[0]):``}</span>`,z.value=``;return}let f=0;for(let e of s){n.innerHTML=`<span class="qx-spin"></span> Uploading question ${f+1}/${s.length}…`;let{id:t}=await u(`/training/courses/${a}/quiz`,{method:`POST`,headers:c(),body:JSON.stringify({...e,position:v.quiz.length})});v.quiz.push({id:t,...e}),f++}L(),n.innerHTML=`<span style="color:var(--success)">✓ ${f} question${f===1?``:`s`} added.</span>`+(d.length?` <span style="color:var(--warning)">${d.length} row${d.length===1?``:`s`} skipped: ${l(d.join(` · `))}</span>`:``),e(`${f} quiz questions uploaded`,`success`)}catch(t){n.innerHTML=`<span style="color:var(--danger)">${l(t.message)}</span>`,e(t.message,`error`)}z.value=``};let B=A.querySelector(`#as-all`);B.onchange=()=>A.querySelector(`#as-list`).classList.toggle(`tr-disabled`,B.checked),A.querySelector(`#as-save`).onclick=async()=>{let t=A.querySelector(`#as-due`).value||null,n=B.checked?{all:!0,due_date:t}:{employee_ids:[...A.querySelectorAll(`.as-emp:checked`)].map(e=>e.value),due_date:t};try{await u(`/training/courses/${a}/assign`,{method:`POST`,headers:c(),body:JSON.stringify(n)}),e(`Assignment saved`,`success`),P=!1}catch(t){e(t.message,`error`)}};async function V(){let e=A.querySelector(`#ce-progress`),i;try{i=await u(`/training/courses/${a}/progress`,{headers:s()})}catch(t){e.innerHTML=`<div class="tr-empty-mini" style="color:var(--danger)">${l(t.message)}</div>`;return}let o=i.lessons.length,c=i.employees;if(!c.length){e.innerHTML=`<div class="tr-empty-mini">No employees assigned yet. Use the Assign tab.</div>`;return}let d=c.filter(e=>e.completion?.passed).length,f=c.filter(e=>e.done_count>0||e.completion).length;e.innerHTML=`
      <div class="tr-prog-summary tr-in">
        <div class="tr-ps-item">${g(Math.round(d/c.length*100),64,7,`var(--success)`)}<div><b>${d}/${c.length}</b><small>Completed course</small></div></div>
        <div class="tr-ps-divider"></div>
        <div class="tr-ps-mini"><b>${f}</b><small>Started</small></div>
        <div class="tr-ps-mini"><b>${c.length-f}</b><small>Not started</small></div>
        <div class="tr-ps-mini"><b>${o}</b><small>Lessons</small></div>
        <div class="tr-ps-mini"><b>${i.quizCount}</b><small>Quiz Qs</small></div>
      </div>
      <div class="tr-people">
        ${c.map((e,a)=>{let s=o?Math.round(e.done_count/o*100):e.completion?.passed?100:0,c=!!e.completion?.passed,u=c?[`Completed`,`var(--success)`]:e.done_count>0?[`In progress`,`var(--warning, #FBBF24)`]:[`Not started`,`var(--text-dim)`],d=!c&&e.due_date&&new Date(e.due_date)<new Date;return`
          <div class="tr-person tr-in" style="--d:${(a*.04).toFixed(2)}s" data-emp="${e.employee_id}">
            <div class="tr-person-head">
              <span class="tr-ava tr-ava-lg">${h(e.name)}</span>
              <div class="tr-person-id">
                <b>${l(e.name)}</b>
                <div class="tr-person-tags">
                  <span class="tr-dot" style="background:${u[1]}"></span><span>${u[0]}</span>
                  ${e.last_activity?`· <span title="Last activity">${O(r.clock)} ${l(n(e.last_activity))}</span>`:``}
                  ${d?`· <span style="color:var(--danger)">Overdue</span>`:e.due_date?`· Due ${l(t(e.due_date))}`:``}
                </div>
              </div>
              ${g(s,46,5,c?`var(--success)`:`var(--primary)`)}
              <button class="btn btn-icon btn-secondary btn-sm tr-person-toggle" title="Timeline">${r.arrowRight}</button>
            </div>
            <div class="tr-timeline" hidden>
              ${o?e.lessons.map((e,t)=>`
                <div class="tr-tl-item ${e.completed_at?`done`:``}">
                  <span class="tr-tl-dot">${e.completed_at?`✓`:t+1}</span>
                  <span class="tr-tl-title">${l(e.title)}</span>
                  <span class="tr-tl-time">${e.completed_at?l(n(e.completed_at)):`Not done`}</span>
                </div>`).join(``):`<div class="tr-tl-item"><span class="tr-tl-title" style="color:var(--text-dim)">No lessons in this course</span></div>`}
              ${i.quizCount?`
                <div class="tr-tl-item ${c?`done`:``}">
                  <span class="tr-tl-dot">${c?`★`:`?`}</span>
                  <span class="tr-tl-title">Quiz ${c?`passed — ${e.completion.quiz_score}%`:`not passed yet`}</span>
                  <span class="tr-tl-time">${e.completion?.completed_at?l(n(e.completion.completed_at)):`—`}</span>
                </div>`:``}
              <div class="tr-tl-foot">${e.assigned_at?`Assigned ${l(n(e.assigned_at))}`:``}${e.first_activity?` · First activity ${l(n(e.first_activity))}`:``}</div>
            </div>
          </div>`}).join(``)}
      </div>`,_(e),e.querySelectorAll(`.tr-person-toggle`).forEach(e=>e.onclick=()=>{let t=e.closest(`.tr-person`),n=t.querySelector(`.tr-timeline`);n.hasAttribute(`hidden`)?(n.removeAttribute(`hidden`),t.classList.add(`open`)):(n.setAttribute(`hidden`,``),t.classList.remove(`open`))})}requestAnimationFrame(()=>F(p))}async function j(e){let n=async()=>{e.innerHTML=`<div class="tr-skeleton-grid">${Array.from({length:3}).map(()=>`<div class="tr-skeleton-card"></div>`).join(``)}</div>`;let i;try{i=await u(`/training/my`,{headers:s()})}catch(t){e.innerHTML=`<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--danger)">${l(t.message)}</div></div>`;return}let a=i.filter(e=>Number(e.completed)>0).length,o=i.length?Math.round(i.reduce((e,t)=>{let n=t.lesson_count||0;return e+(n?t.done_count/n*100:Number(t.completed)?100:0)},0)/i.length):0;e.innerHTML=`
      <div class="tr-head tr-in">
        <div>
          <h1 class="tr-title">${r.shield}<span>My Training</span></h1>
          <p class="tr-sub">Your assigned courses, lessons and quizzes — learn at your own pace.</p>
        </div>
      </div>
      ${i.length?`<div class="tr-stats tr-in" style="--d:.05s">
        ${D(r.shield,i.length,`Courses assigned`,`var(--primary)`)}
        ${D(r.star,a,`Completed`,`#A78BFA`)}
        ${D(r.clock,o+`%`,`Average progress`,`var(--amber, #f5a524)`)}
      </div>`:``}
      ${i.length===0?`<div class="tr-empty card"><div class="card-body" style="text-align:center;padding:40px;color:var(--text-dim)">No courses assigned to you yet. Check back soon!</div></div>`:`<div class="tr-grid">
        ${i.map((e,n)=>{let i=e.lesson_count||0,a=i?Math.round(e.done_count/i*100):Number(e.completed)?100:0,o=Number(e.completed)>0,s=e.category||`General`,c=s.toLowerCase(),u=c.includes(`cctv`)||c.includes(`camera`)?`t1`:c.includes(`network`)||c.includes(`wifi`)?`t2`:c.includes(`biometric`)||c.includes(`attendance`)?`t3`:c.includes(`gate`)||c.includes(`automation`)?`t4`:[`t1`,`t2`,`t3`,`t4`,`t5`][n%5],d=c.includes(`cctv`)||c.includes(`camera`)?r.shield:c.includes(`network`)||c.includes(`wifi`)?r.link:c.includes(`biometric`)||c.includes(`attendance`)?r.users:c.includes(`gate`)||c.includes(`automation`)?r.box:r.clipboard,f=2*Math.PI*21,p=f*(1-Math.min(a,100)/100);return`
          <div class="tr-card tr-card-clickable tr-in" style="--d:${(.08+n*.05).toFixed(2)}s" data-id="${e.id}">
            <div class="tr-banner ${u}">
              <div class="tr-pat"></div>
              <div class="tr-bico">${d}</div>
              <span class="tr-cat">${l(s)}</span>
            </div>
            <div class="tr-card-body">
              <h3 class="tr-card-title">${l(e.title)}</h3>
              <p class="tr-card-desc">${l(e.description||``)}</p>
              <div class="tr-card-meta">
                <span>${O(r.inbox)} ${i} lessons</span>
                ${e.quiz_count?`<span>${O(r.check)} ${e.quiz_count} quiz</span>`:``}
                ${!o&&e.due_date?`<span style="color:var(--amber, #f5a524);font-weight:700;">${O(r.clock)} Due ${t(e.due_date)}</span>`:``}
              </div>
            </div>
            <div class="tr-card-foot">
              <svg class="tr-ring" width="48" height="48" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="21" fill="none" stroke="var(--border)" stroke-width="5"/>
                <circle cx="24" cy="24" r="21" fill="none" stroke="${o?`var(--success)`:`var(--primary)`}" stroke-width="5" stroke-linecap="round"
                  stroke-dasharray="${f.toFixed(2)}" stroke-dashoffset="${p.toFixed(2)}" transform="rotate(-90 24 24)"/>
                <text x="24" y="28" text-anchor="middle" font-size="11" font-weight="800" fill="var(--text)">${a}%</text>
              </svg>
              <div class="tr-prog-text">
                <div class="tr-prog-top"><span>${o?`Completed`:a>0?`In progress`:`Not started`}</span><b>${e.done_count||0}/${i}</b></div>
                <div class="tr-bar"><div class="tr-bar-fill" data-w="${a}" style="${o?`background:var(--success)`:``}"></div></div>
              </div>
              <button class="tr-fab" title="${o?`Review course`:`Start / continue`}">${o?r.eye:r.play}</button>
            </div>
          </div>`}).join(``)}</div>`}`,v(e),e.querySelectorAll(`[data-id]`).forEach(e=>e.onclick=()=>M(e.dataset.id,n))};await n()}async function M(t,i){let a;try{a=await u(`/training/course/${t}`,{headers:s()})}catch(t){return e(t.message,`error`)}let o=new Set(a.doneLessonIds),d=new Map((a.doneLessons||[]).map(e=>[e.lesson_id,e.completed_at])),m=f(`
    <div class="modal-header"><span class="modal-title">${r.shield}&nbsp; ${l(a.course.title)}</span><button class="modal-close" id="x">&times;</button></div>
    <div class="modal-body" id="cp-body"></div>
    <div class="modal-footer"><button class="btn btn-secondary" id="x2">Close</button></div>`,780),h=()=>{m.remove(),i&&i()};m.querySelector(`#x`).onclick=m.querySelector(`#x2`).onclick=h;let v=m.querySelector(`#cp-body`),b=()=>{let i=a.lessons.length,f=a.lessons.filter(e=>o.has(e.id)).length;v.innerHTML=`
      <div class="tr-player-hero">
        ${g(i?Math.round(f/i*100):a.completion?100:0,76,8,a.completion?`var(--success)`:`var(--primary)`)}
        <div>
          <div class="tr-player-h">${l(a.course.description||`Work through each lesson, then take the quiz.`)}</div>
          <div class="tr-player-meta">${f}/${i} lessons done${a.quiz.length?` · ${a.quiz.length} quiz questions`:``}</div>
        </div>
      </div>

      <h4 class="tr-section-h">${O(r.inbox)} Lessons</h4>
      ${a.lessons.map((e,t)=>{let i=o.has(e.id),a=d.get(e.id);return`
        <div class="tr-lesson ${i?`done`:``}">
          <div class="tr-lesson-head" data-toggle="${e.id}">
            <span class="tr-lesson-step ${i?`done`:``}">${i?`✓`:t+1}</span>
            <div class="tr-lesson-titles"><b>${l(e.title)}</b>${i&&a?`<small>${O(r.clock)} Completed ${l(n(a))}</small>`:``}</div>
            <span class="tr-lesson-caret">${r.arrowRight}</span>
          </div>
          <div class="tr-lesson-body" ${t===0&&!i?``:`hidden`}>
            ${e.content?`<div class="tr-lesson-text">${l(e.content)}</div>`:``}
            ${p(e)}
            ${i?``:`<button class="btn btn-primary btn-sm le-done" data-id="${e.id}" style="margin-top:12px;">${O(r.check)}<span>Mark complete</span></button>`}
          </div>
        </div>`}).join(``)||`<div class="tr-empty-mini">No lessons.</div>`}

      ${a.quiz.length?(()=>{let e=[],t=new Map;a.quiz.forEach(n=>{let r=x(n.question);if(r.t===`match`&&r.group){if(!t.has(r.group)){let n={t:`match`,gtitle:r.gtitle,rows:[]};t.set(r.group,n),e.push(n)}t.get(r.group).rows.push({q:n,p:r})}else e.push({t:r.t,q:n,p:r})});let i=e=>{let t=x(e.question).text.split(/_{2,}/),n=`<select class="qz-blank" data-q="${e.id}"><option value="">— choose —</option>${e.options.map((e,t)=>`<option value="${t}">${l(e)}</option>`).join(``)}</select>`;return t.map(l).join(n)},o=0;return`
        <h4 class="tr-section-h">${O(r.check)} Quiz <small style="color:var(--text-dim);font-weight:400;">(pass ≥ 70%)</small></h4>
        ${a.completion?`<div class="tr-pass-banner">${O(r.check)} Passed — score ${a.completion.quiz_score}%${a.completion.completed_at?` on ${l(n(a.completion.completed_at))}`:``}</div>`:``}
        <div class="qz-progress"><span id="qz-done">0</span>/${a.quiz.length} answered<div class="qz-progress-bar"><i id="qz-progress-fill"></i></div></div>
        <div id="cp-quiz">
          ${e.map(e=>{o++;let t=S[e.t]||S.mcq,n=`<span class="qz-type" style="color:${t.color}">${t.chip}</span>`;return e.t===`match`?`
              <div class="qz-card">
                <div class="qz-q-head"><span class="qz-num">${o}</span><b>${l(e.gtitle)}</b>${n}</div>
                <div class="qz-match">
                  ${e.rows.map(({q:e,p:t})=>`
                    <div class="qz-match-row">
                      <span class="qz-match-left">${l(t.left)}</span>
                      <span class="qz-match-arrow">⟶</span>
                      <select class="qz-blank qz-match-sel" data-q="${e.id}">
                        <option value="">— select match —</option>
                        ${e.options.map((e,t)=>`<option value="${t}">${l(e)}</option>`).join(``)}
                      </select>
                    </div>`).join(``)}
                </div>
              </div>`:e.t===`fill`?`
              <div class="qz-card">
                <div class="qz-q-head"><span class="qz-num">${o}</span><b class="qz-fill-text">${i(e.q)}</b>${n}</div>
              </div>`:`
              <div class="qz-card" data-q="${e.q.id}">
                <div class="qz-q-head"><span class="qz-num">${o}</span><b>${l(e.p.text)}</b>${n}</div>
                ${e.p.img?`<img class="qz-img" src="${l(e.p.img)}" alt="Question image" loading="lazy">`:``}
                <div class="qz-opts">
                  ${e.q.options.map((t,n)=>`
                    <label class="qz-opt">
                      <input type="radio" name="q-${e.q.id}" value="${n}">
                      <span class="qz-letter">${`ABCD`[n]||n+1}</span>
                      <span class="qz-opt-text">${l(t)}</span>
                    </label>`).join(``)}
                </div>
              </div>`}).join(``)}
        </div>
        <button class="btn btn-primary qz-submit" id="cp-submit">${O(r.check)}<span>Submit quiz</span></button>
        <div id="cp-result" class="tr-quiz-result"></div>`})():i&&f===i?`<div class="tr-pass-banner" style="margin-top:14px;">🎉 All lessons completed!</div>`:``}
    `,_(v),v.querySelectorAll(`.tr-lesson-head`).forEach(e=>e.onclick=t=>{if(t.target.closest(`.le-done`))return;let n=e.nextElementSibling,r=n.hasAttribute(`hidden`);r?n.removeAttribute(`hidden`):n.setAttribute(`hidden`,``),e.parentElement.classList.toggle(`open`,r)}),v.querySelectorAll(`.le-done`).forEach(t=>t.onclick=async n=>{n.stopPropagation(),t.disabled=!0;try{await u(`/training/lessons/${t.dataset.id}/complete`,{method:`POST`,headers:s()}),o.add(t.dataset.id),d.set(t.dataset.id,new Date().toISOString()),e(`Lesson completed`,`success`),b()}catch(n){e(n.message,`error`),t.disabled=!1}});let h=()=>{let e={};return a.quiz.forEach(t=>{let n=v.querySelector(`input[name="q-${t.id}"]:checked`);if(n){e[t.id]=Number(n.value);return}let r=v.querySelector(`.qz-blank[data-q="${t.id}"]`);r&&r.value!==``&&(e[t.id]=Number(r.value))}),e},C=()=>{let e=v.querySelector(`#qz-done`),t=v.querySelector(`#qz-progress-fill`);if(!e)return;let n=Object.keys(h()).length;e.textContent=n,t&&(t.style.width=(a.quiz.length?n/a.quiz.length*100:0)+`%`)};v.querySelectorAll(`.qz-opt input`).forEach(e=>e.onchange=()=>{e.closest(`.qz-card`).querySelectorAll(`.qz-opt`).forEach(t=>t.classList.toggle(`sel`,t.contains(e))),w(),C()}),v.querySelectorAll(`.qz-blank`).forEach(e=>e.onchange=()=>{e.classList.toggle(`filled`,e.value!==``),w(),C()});let w=()=>{v.querySelectorAll(`.qz-opt`).forEach(e=>e.classList.remove(`correct`,`wrong`)),v.querySelectorAll(`.qz-opt input`).forEach(e=>{e.disabled=!1}),v.querySelectorAll(`.qz-card`).forEach(e=>e.classList.remove(`qz-correct`,`qz-wrong`)),v.querySelectorAll(`.qz-blank`).forEach(e=>{e.classList.remove(`qz-correct`,`qz-wrong`),e.disabled=!1}),v.querySelectorAll(`.qz-feedback`).forEach(e=>e.remove())},T=e=>{w();let t=new Map(a.quiz.map(e=>[String(e.id),e]));(e||[]).forEach(e=>{let n=t.get(String(e.id));if(!n)return;let i=n.options[e.correct_index],a=v.querySelector(`.qz-card[data-q="${e.id}"]`);if(a){if(a.classList.add(e.correct?`qz-correct`:`qz-wrong`),a.querySelectorAll(`.qz-opt`).forEach(t=>{let n=t.querySelector(`input`);if(!n)return;let r=Number(n.value);n.disabled=!0,r===e.correct_index?t.classList.add(`correct`):r===e.chosen&&!e.correct&&t.classList.add(`wrong`)}),!e.correct){let e=document.createElement(`div`);e.className=`qz-feedback`,e.innerHTML=`${O(r.check)}<span>Correct answer: <b>${l(i)}</b></span>`,a.appendChild(e)}return}let o=v.querySelector(`.qz-blank[data-q="${e.id}"]`);if(o&&(o.classList.add(e.correct?`qz-correct`:`qz-wrong`),o.disabled=!0,!e.correct)){let e=o.closest(`.qz-match-row`)||o.closest(`.qz-card`),t=document.createElement(`span`);t.className=`qz-feedback`,t.innerHTML=`${O(r.check)}<span>Correct: <b>${l(i)}</b></span>`,(e||o.parentElement).appendChild(t)}})},E=v.querySelector(`#cp-submit`);E&&(E.onclick=async()=>{let n=h();if(Object.keys(n).length<a.quiz.length)return e(`Please answer all questions`,`info`);E.disabled=!0,E.innerHTML=`<span>Submitting…</span>`;try{let r=await u(`/training/course/${t}/quiz-submit`,{method:`POST`,headers:c(),body:JSON.stringify({answers:n})});T(r.results||[]);let i=v.querySelector(`#cp-result`);i.className=`tr-quiz-result `+(r.passed?`pass`:`fail`);let o=(r.results||[]).filter(e=>e.correct===!1).length;if(i.textContent=r.passed?`✓ Passed! Score ${r.score}%`:`Score ${r.score}% — need 70% to pass. ${o} answer${o===1?``:`s`} to fix — wrong ones are marked below with the correct answer. Fix them and submit again.`,r.passed)a.completion={quiz_score:r.score,completed_at:new Date().toISOString()},y(m.querySelector(`.modal`)),e(`Course completed!`,`success`);else{let e=v.querySelector(`.qz-card.qz-wrong, .qz-blank.qz-wrong`);e&&e.scrollIntoView({behavior:`smooth`,block:`center`})}}catch(t){e(t.message,`error`)}E.disabled=!1,E.innerHTML=`${O(r.check)}<span>Submit quiz</span>`})};b()}export{j as renderEmployeeCourses,E as renderTrainingCoursesAdmin};