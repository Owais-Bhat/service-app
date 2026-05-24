import { supabase } from '../supabase.js';
import { toast } from '../utils.js';
import { ICONS } from '../icons.js';

function escapeAttr(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

export async function renderProfile(container) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const p = profile || {};
  const canEditProfile = p.role === 'admin' || p.can_update_profile === 1 || p.can_update_profile === true;
  const profileLockAttrs = canEditProfile ? '' : 'disabled aria-disabled="true"';

  container.innerHTML = `
    <div class="page-header"><h1>My Profile</h1><p>Manage your account details</p></div>
    <div class="card" style="max-width:560px">
      <div class="card-header"><span class="card-title">Account Information</span></div>
      <div class="card-body">
        ${canEditProfile ? '' : `
          <div class="access-lock-note">
            <span>${ICONS.block}</span>
            <div>
              <b>Profile editing is locked</b>
              <small>Admin must enable Profile Edit access before you can update these details.</small>
            </div>
          </div>
        `}
        <div class="form-group"><label>Full Name</label><input type="text" id="p-name" value="${escapeAttr(p.full_name)}" ${profileLockAttrs}/></div>
        <div class="form-group"><label>Email</label><input type="email" value="${user.email}" disabled style="opacity:.6"/></div>
        <div class="form-group"><label>Phone</label><input type="tel" id="p-phone" value="${escapeAttr(p.phone)}" ${profileLockAttrs}/></div>
        <div class="form-group"><label>Company</label><input type="text" id="p-company" value="${escapeAttr(p.company)}" ${profileLockAttrs}/></div>
        <button class="btn btn-primary" style="width:auto" id="save-profile" ${canEditProfile ? '' : 'disabled'}>${ICONS.check}<span>Save Changes</span></button>
      </div>
    </div>
    <div class="card" style="max-width:560px;margin-top:16px">
      <div class="card-header"><span class="card-title">Change Password</span></div>
      <div class="card-body">
        <div class="form-group">
          <label>New Password</label>
          <div class="password-field">
            <input type="password" id="new-pass" placeholder="Min 8 characters" autocomplete="new-password"/>
            <button type="button" class="password-toggle" data-target="new-pass" title="Show password" aria-label="Show password">${ICONS.eye}</button>
          </div>
        </div>
        <button class="btn btn-secondary" style="width:auto" id="save-pass">Update Password</button>
      </div>
    </div>`;

  const bind = (sel, cb) => {
    const el = container.querySelector(sel);
    if (el) el.onclick = cb;
  };

  bind('#save-profile', async () => {
    if (!canEditProfile) {
      toast('Profile updates require admin access', 'error');
      return;
    }
    const { error } = await supabase.from('profiles').update({
      full_name: container.querySelector('#p-name').value.trim(),
      phone: container.querySelector('#p-phone').value.trim(),
      company: container.querySelector('#p-company').value.trim(),
    }).eq('id', user.id);
    if (error) toast(error.message, 'error');
    else toast('Profile saved!', 'success');
  });
  container.querySelectorAll('.password-toggle').forEach(btn => {
    btn.onclick = () => {
      const input = container.querySelector(`#${btn.dataset.target}`);
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.innerHTML = showing ? ICONS.eye : ICONS.eyeOff;
      btn.title = showing ? 'Show password' : 'Hide password';
      btn.setAttribute('aria-label', btn.title);
    };
  });
  bind('#save-pass', async () => {
    const pass = container.querySelector('#new-pass').value;
    if (pass.length < 8) { toast('Min 8 characters', 'error'); return; }
    const { error } = await supabase.auth.updateUser({ password: pass });
    if (error) toast(error.message, 'error');
    else toast('Password updated!', 'success');
  });
}
