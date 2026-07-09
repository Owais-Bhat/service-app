import{g as e,t}from"./icons-j8TZxXx3.js";import{r as n}from"./index-CuPRPj-i.js";function r(e){return String(e||``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e])}async function i(i){let{data:{user:a}}=await n.auth.getUser(),{data:o}=await n.from(`profiles`).select(`*`).eq(`id`,a.id).single(),s=o||{},c=s.role===`admin`||s.can_update_profile===1||s.can_update_profile===!0,l=c?``:`disabled aria-disabled="true"`;i.innerHTML=`
    <div class="page-header"><h1>My Profile</h1><p>Manage your account details</p></div>
    <div class="card" style="max-width:560px">
      <div class="card-header"><span class="card-title">Account Information</span></div>
      <div class="card-body">
        ${c?``:`
          <div class="access-lock-note">
            <span>${t.block}</span>
            <div>
              <b>Profile editing is locked</b>
              <small>Admin must enable Profile Edit access before you can update these details.</small>
            </div>
          </div>
        `}
        <div class="form-group"><label>Full Name</label><input type="text" id="p-name" value="${r(s.full_name)}" ${l}/></div>
        <div class="form-group"><label>Email</label><input type="email" value="${a.email}" disabled style="opacity:.6"/></div>
        <div class="form-group"><label>Phone</label><input type="tel" id="p-phone" value="${r(s.phone)}" ${l}/></div>
        <div class="form-group"><label>Company</label><input type="text" id="p-company" value="${r(s.company)}" ${l}/></div>
        <button class="btn btn-primary" style="width:auto" id="save-profile" ${c?``:`disabled`}>${t.check}<span>Save Changes</span></button>
      </div>
    </div>
    <div class="card" style="max-width:560px;margin-top:16px">
      <div class="card-header"><span class="card-title">Change Password</span></div>
      <div class="card-body">
        <div class="form-group">
          <label>New Password</label>
          <div class="password-field">
            <input type="password" id="new-pass" placeholder="Min 8 characters" autocomplete="new-password"/>
            <button type="button" class="password-toggle" data-target="new-pass" title="Show password" aria-label="Show password">${t.eye}</button>
          </div>
        </div>
        <button class="btn btn-secondary" style="width:auto" id="save-pass">Update Password</button>
      </div>
    </div>`;let u=(e,t)=>{let n=i.querySelector(e);n&&(n.onclick=t)};u(`#save-profile`,async()=>{if(!c){e(`Profile updates require admin access`,`error`);return}let{error:t}=await n.from(`profiles`).update({full_name:i.querySelector(`#p-name`).value.trim(),phone:i.querySelector(`#p-phone`).value.trim(),company:i.querySelector(`#p-company`).value.trim()}).eq(`id`,a.id);t?e(t.message,`error`):e(`Profile saved!`,`success`)}),i.querySelectorAll(`.password-toggle`).forEach(e=>{e.onclick=()=>{let n=i.querySelector(`#${e.dataset.target}`),r=n.type===`text`;n.type=r?`password`:`text`,e.innerHTML=r?t.eye:t.eyeOff,e.title=r?`Show password`:`Hide password`,e.setAttribute(`aria-label`,e.title)}}),u(`#save-pass`,async()=>{let t=i.querySelector(`#new-pass`).value;if(t.length<8){e(`Min 8 characters`,`error`);return}let{error:r}=await n.auth.updateUser({password:t});r?e(r.message,`error`):e(`Password updated!`,`success`)})}export{i as renderProfile};