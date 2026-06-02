const fs = require('fs');

const filePath = 'src/pages/admin.js';
const source = fs.readFileSync(filePath, 'utf8');

const startStr = 'export async function renderUsers(';
const startIdx = source.indexOf(startStr);

if (startIdx === -1) {
  console.error('Could not find start of renderUsers');
  process.exit(1);
}

let depth = 0;
let endIdx = -1;

for (let i = startIdx; i < source.length; i++) {
  if (source[i] === '{') {
    depth++;
  } else if (source[i] === '}') {
    depth--;
    if (depth === 0) {
      endIdx = i + 1;
      break;
    }
  }
}

if (endIdx === -1) {
  console.error('Could not find end of renderUsers (braces mismatch)');
  process.exit(1);
}

const newRenderUsers = `export async function renderUsers(container) {
  showLoader(container);
  
  const apiBase = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? '/api' : 'http://localhost:5000/api';
  const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': \`Bearer \${localStorage.getItem('auth_token') || ''}\`
  });

  let users = [];
  try {
    const res = await fetch(\`\${apiBase}/admin/users\`, { headers: authHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to load users');
    }
    users = await res.json();
  } catch (err) {
    container.innerHTML = \`
      <div class="card" style="text-align:center;padding:40px;">
        <h2 style="color:var(--danger);">Error loading users</h2>
        <p>\${err.message}</p>
        <button class="btn btn-primary" id="retry-users" style="margin-top:16px;">Retry</button>
      </div>
    \`;
    const retryBtn = container.querySelector('#retry-users');
    if (retryBtn) retryBtn.onclick = () => renderUsers(container);
    return;
  }

  const rows = users || [];

  const accessCell = (u) => u.role === 'employee' ? \`
    <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;">
      <input type="checkbox" class="can-add-service-chk" data-uid="\${u.id}" \${u.can_add_service ? 'checked' : ''} style="cursor:pointer;width:16px;height:16px;margin:0;"/>
      Add Service
    </label>
  \` : '<span style="color:var(--text-dim)">-</span>';

  const profileCell = (u) => u.role === 'employee' ? \`
    <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;">
      <input type="checkbox" class="can-update-profile-chk" data-uid="\${u.id}" \${u.can_update_profile ? 'checked' : ''} style="cursor:pointer;width:16px;height:16px;margin:0;"/>
      Profile Edit
    </label>
  \` : '<span style="color:var(--text-dim)">-</span>';

  container.innerHTML = \`
    <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
      <div>
        <h1>User Management</h1>
        <p>Control roles, credentials, SMS phone numbers, and staff access permissions.</p>
      </div>
      <button class="btn btn-primary" id="create-user-btn">\${ICONS.plus}<span>Create New User</span></button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name / Email</th>
              <th>Current Role</th>
              <th>SMS Phone</th>
              <th>Service Access</th>
              <th>Profile Access</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            \${rows.length ? rows.map(u => \`
              <tr>
                <td>
                  <b>\${escapeHtml(u.full_name || '-')}</b>
                  <div style="font-size:0.78rem;color:var(--text-dim);margin-top:2px;">\${escapeHtml(u.email || '-')}</div>
                </td>
                <td><span class="badge \${u.role === 'admin' ? 'badge-danger' : u.role === 'employee' ? 'badge-open' : 'badge-resolved'}">\${escapeHtml(u.role || 'client')}</span></td>
                <td>
                  \${u.phone ? \`<b>\${escapeHtml(u.phone)}</b>\` : '<span style="color:var(--text-dim)">—</span>'}
                </td>
                <td>\${accessCell(u)}</td>
                <td>\${profileCell(u)}</td>
                <td>
                  <div style="display:flex;gap:8px;">
                    <button class="btn btn-secondary btn-sm edit-user-btn" data-uid="\${u.id}">\${ICONS.edit || '📝'}<span>Edit</span></button>
                    <button class="btn btn-danger btn-sm delete-user-btn" data-uid="\${u.id}">\${ICONS.close || '🗑️'}</button>
                  </div>
                </td>
              </tr>
            \`).join('') : '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-dim)">No users found</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  \`;

  const bindAccessToggle = (selector, column, label) => {
    container.querySelectorAll(selector).forEach(chk => {
      chk.addEventListener('change', async () => {
        const { error } = await supabase.from('profiles').update({ [column]: chk.checked ? 1 : 0 }).eq('id', chk.dataset.uid);
        if (error) {
          toast(\`Failed to update \${label}: \` + (error.message || ''), 'error');
          chk.checked = !chk.checked;
          return;
        }
        toast(\`\${label} updated\`, 'success');
      });
    });
  };
  bindAccessToggle('.can-add-service-chk', 'can_add_service', 'Service access');
  bindAccessToggle('.can-update-profile-chk', 'can_update_profile', 'Profile edit access');

  container.querySelectorAll('.delete-user-btn').forEach(btn => {
    btn.onclick = async () => {
      const uid = btn.dataset.uid;
      const user = rows.find(u => u.id === uid);
      if (!user) return;
      if (!confirm(\`Are you sure you want to delete user "\${user.full_name || user.email}"? This will permanently delete their profile and credentials.\`)) return;

      const restore = setButtonLoading(btn, 'Deleting');
      try {
        const res = await fetch(\`\${apiBase}/admin/users/\${uid}\`, {
          method: 'DELETE',
          headers: authHeaders()
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to delete user');

        toast('User deleted successfully', 'success');
        renderUsers(container);
      } catch (err) {
        toast(err.message, 'error');
        restore();
      }
    };
  });

  container.querySelectorAll('.edit-user-btn').forEach(btn => {
    btn.onclick = () => {
      const uid = btn.dataset.uid;
      const user = rows.find(u => u.id === uid);
      if (user) openUserModal(user, () => renderUsers(container));
    };
  });

  const createBtn = container.querySelector('#create-user-btn');
  if (createBtn) {
    createBtn.onclick = () => openUserModal(null, () => renderUsers(container));
  }

  function openUserModal(user, onDone) {
    const isEdit = !!user;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = \`
      <div class="modal" style="max-width:580px">
        <div class="modal-header">
          <span class="modal-title">\${isEdit ? 'Edit User Details' : 'Create New User'}</span>
          <button class="modal-close" id="user-modal-close">\${ICONS.close || '×'}</button>
        </div>
        <div class="modal-body">
          <form id="user-form" style="display:flex;flex-direction:column;gap:16px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div class="form-group">
                <label>Full Name *</label>
                <input id="usr-name" type="text" placeholder="John Doe" value="\${isEdit ? escapeHtml(user.full_name || '') : ''}" required />
              </div>
              <div class="form-group">
                <label>Email *</label>
                <input id="usr-email" type="email" placeholder="john@example.com" value="\${isEdit ? escapeHtml(user.email || '') : ''}" required />
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div class="form-group">
                <label>Password \${isEdit ? '(leave blank to keep unchanged)' : '*'}</label>
                <input id="usr-password" type="password" placeholder="Min 8 characters" \${isEdit ? '' : 'required'} />
              </div>
              <div class="form-group">
                <label>Role</label>
                <select id="usr-role">
                  <option value="client" \${isEdit && user.role === 'client' ? 'selected' : ''}>Client</option>
                  <option value="employee" \${isEdit && user.role === 'employee' ? 'selected' : ''}>Staff</option>
                  <option value="admin" \${isEdit && user.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div class="form-group">
                <label>Phone Number (10 digits)</label>
                <input id="usr-phone" type="tel" placeholder="9876543210" value="\${isEdit ? escapeHtml((user.phone || '').replace(/^\\\\+91\\\\s*/, '')) : ''}" />
              </div>
              <div class="form-group">
                <label>Salary (Staff only)</label>
                <input id="usr-salary" type="number" step="0.01" placeholder="0.00" value="\${isEdit ? user.salary || 0 : 0}" />
              </div>
            </div>
            <div class="form-group">
              <label>Company / Building Name</label>
              <input id="usr-company" type="text" placeholder="Company Name" value="\${isEdit ? escapeHtml(user.company || '') : ''}" />
            </div>
            <div class="form-group">
              <label>Address</label>
              <textarea id="usr-address" rows="2" placeholder="Full Address">\${isEdit ? escapeHtml(user.address || '') : ''}</textarea>
            </div>
            
            <div style="display:flex;gap:18px;margin-top:8px;">
              <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="checkbox" id="usr-add-service" \${isEdit && user.can_add_service ? 'checked' : ''} style="cursor:pointer;width:16px;height:16px;margin:0;"/>
                Add Service Access (Staff only)
              </label>
              <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                <input type="checkbox" id="usr-edit-profile" \${isEdit && user.can_update_profile ? 'checked' : ''} style="cursor:pointer;width:16px;height:16px;margin:0;"/>
                Profile Edit Access (Staff only)
              </label>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="user-modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="user-modal-submit">\${ICONS.check || '✓'}<span>\${isEdit ? 'Save Changes' : 'Create User'}</span></button>
        </div>
      </div>
    \`;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#user-modal-close').onclick = close;
    overlay.querySelector('#user-modal-cancel').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    const phoneInput = overlay.querySelector('#usr-phone');
    phoneInput.oninput = () => {
      let v = phoneInput.value.replace(/\\\\D/g, '');
      if (v.length > 10 && v.startsWith('91')) v = v.slice(2);
      else if (v.length === 11 && v.startsWith('0')) v = v.slice(1);
      phoneInput.value = v.slice(0, 10);
    };

    const submitBtn = overlay.querySelector('#user-modal-submit');
    submitBtn.onclick = async (e) => {
      e.preventDefault();
      
      const fullName = overlay.querySelector('#usr-name').value.trim();
      const email = overlay.querySelector('#usr-email').value.trim();
      const password = overlay.querySelector('#usr-password').value;
      const role = overlay.querySelector('#usr-role').value;
      const rawPhone = phoneInput.value;
      const salary = overlay.querySelector('#usr-salary').value;
      const company = overlay.querySelector('#usr-company').value.trim();
      const address = overlay.querySelector('#usr-address').value.trim();
      const can_add_service = overlay.querySelector('#usr-add-service').checked;
      const can_update_profile = overlay.querySelector('#usr-edit-profile').checked;

      if (!fullName) return toast('Full name is required', 'warning');
      if (!email) return toast('Email is required', 'warning');
      if (!isEdit && (!password || password.length < 8)) return toast('Password must be at least 8 characters', 'warning');
      if (isEdit && password && password.length < 8) return toast('Password must be at least 8 characters', 'warning');
      if (rawPhone && !/^[6-9]\\\\d{9}$/.test(rawPhone)) return toast('Enter a valid 10-digit Indian mobile number', 'warning');

      const payload = {
        fullName,
        email,
        role,
        phone: rawPhone ? \`+91\${rawPhone}\` : null,
        salary: Number(salary) || 0,
        company: company || null,
        address: address || null,
        can_add_service: can_add_service ? 1 : 0,
        can_update_profile: can_update_profile ? 1 : 0
      };

      if (password) payload.password = password;

      const restore = setButtonLoading(submitBtn, isEdit ? 'Saving' : 'Creating');
      try {
        const url = isEdit ? \`\${apiBase}/admin/users/\${user.id}\` : \`\${apiBase}/admin/users\`;
        const method = isEdit ? 'PATCH' : 'POST';

        const res = await fetch(url, {
          method,
          headers: authHeaders(),
          body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to save user');

        toast(isEdit ? 'User updated successfully' : 'User created successfully', 'success');
        close();
        onDone();
      } catch (err) {
        toast(err.message, 'error');
        restore();
      }
    };
  }
}`;

const updatedSource = source.slice(0, startIdx) + newRenderUsers + source.slice(endIdx);
fs.writeFileSync(filePath, updatedSource, 'utf8');
console.log('Successfully updated renderUsers in src/pages/admin.js');
