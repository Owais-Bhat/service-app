import { supabase } from '../supabase.js';
import { toast, formatDate } from '../utils.js';

export async function renderProfile(container) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const p = profile || {};

  container.innerHTML = `
    <div class="page-header"><h1>My Profile</h1><p>Manage your account details</p></div>
    <div class="card" style="max-width:560px">
      <div class="card-header"><span class="card-title">Account Information</span></div>
      <div class="card-body">
        <div class="form-group"><label>Full Name</label><input type="text" id="p-name" value="${p.full_name||''}"/></div>
        <div class="form-group"><label>Email</label><input type="email" value="${user.email}" disabled style="opacity:.6"/></div>
        <div class="form-group"><label>Phone</label><input type="tel" id="p-phone" value="${p.phone||''}"/></div>
        <div class="form-group"><label>Company</label><input type="text" id="p-company" value="${p.company||''}"/></div>
        <button class="btn btn-primary" style="width:auto" id="save-profile">Save Changes</button>
      </div>
    </div>
    <div class="card" style="max-width:560px;margin-top:16px">
      <div class="card-header"><span class="card-title">Change Password</span></div>
      <div class="card-body">
        <div class="form-group"><label>New Password</label><input type="password" id="new-pass" placeholder="Min 8 characters"/></div>
        <button class="btn btn-secondary" style="width:auto" id="save-pass">Update Password</button>
      </div>
    </div>`;

  const bind = (sel, cb) => {
    const el = container.querySelector(sel);
    if (el) el.onclick = cb;
  };

  bind('#save-profile', async () => {
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      full_name: container.querySelector('#p-name').value.trim(),
      phone: container.querySelector('#p-phone').value.trim(),
      company: container.querySelector('#p-company').value.trim(),
    });
    if (error) toast(error.message, 'error');
    else toast('Profile saved!', 'success');
  });
  bind('#save-pass', async () => {
    const pass = container.querySelector('#new-pass').value;
    if (pass.length < 8) { toast('Min 8 characters', 'error'); return; }
    const { error } = await supabase.auth.updateUser({ password: pass });
    if (error) toast(error.message, 'error');
    else toast('Password updated!', 'success');
  });
}
