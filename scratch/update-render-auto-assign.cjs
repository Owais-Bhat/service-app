const fs = require('fs');

const filePath = 'src/pages/admin.js';
const source = fs.readFileSync(filePath, 'utf8');

const startStr = 'export async function renderAutoAssignmentTab(';
const startIdx = source.indexOf(startStr);

if (startIdx === -1) {
  console.error('Could not find start of renderAutoAssignmentTab');
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
  console.error('Could not find end of renderAutoAssignmentTab (braces mismatch)');
  process.exit(1);
}

const newRenderAutoAssignmentTab = `export async function renderAutoAssignmentTab(container) {
  showLoader(container);
  const apiBase = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? '/api' : 'http://localhost:5000/api';
  const authHeaders = () => ({ Authorization: \`Bearer \${localStorage.getItem('auth_token') || ''}\` });
  const dateOf = (value) => {
    if (!value) return '-';
    const dt = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(dt.getTime()) ? String(value) : dt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  };

  try {
    const [statusRes, logsRes] = await Promise.all([
      fetch(\`\${apiBase}/auto-assignment/status\`, { headers: authHeaders() }),
      fetch(\`\${apiBase}/auto-assignment/logs?limit=50\`, { headers: authHeaders() }),
    ]);
    const status = await statusRes.json();
    const logsData = await logsRes.json();
    if (!statusRes.ok) throw new Error(status.error || 'Could not load auto-assignment status');
    if (!logsRes.ok) throw new Error(logsData.error || 'Could not load auto-assignment logs');

    const queue = status.queue || [];
    const logs = logsData.logs || [];
    const queueHtml = queue.length === 0
      ? '<tr><td colspan="5" style="text-align:center;padding:28px;color:var(--text-dim)">No employees are clocked in right now.</td></tr>'
      : queue.map(emp => \`<tr>
          <td><span class="badge \${emp.is_next ? 'badge-resolved' : 'badge-open'}">#\${emp.queue_position}</span></td>
          <td><b>\${escapeHtml(emp.full_name || 'Employee')}</b><br/><small style="color:var(--text-dim)">\${escapeHtml(emp.id)}</small></td>
          <td>\${dateOf(emp.clock_in)}</td>
          <td><b>\${emp.assignments_today || 0}</b></td>
          <td>\${emp.is_next ? '<span class="badge badge-resolved">Next</span>' : '<span style="color:var(--text-dim)">-</span>'}</td>
        </tr>\`).join('');
    const logsHtml = logs.length === 0
      ? '<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-dim)">No auto-assignment history yet.</td></tr>'
      : logs.map(log => \`<tr>
          <td><small style="color:var(--text-dim)">\${dateOf(log.assigned_at)}</small></td>
          <td><code style="font-size:0.78rem;color:var(--primary)">\${escapeHtml(log.ticket_no || (log.inquiry_id || '').slice(0, 8))}</code></td>
          <td><b>\${escapeHtml(log.customer_name || 'Customer')}</b><br/><small style="color:var(--text-dim)">\${escapeHtml(log.service_item || '')}</small></td>
          <td>\${escapeHtml(log.employee_name || 'Employee')}</td>
          <td>#\${log.queue_position}</td>
          <td><span class="badge badge-open">\${escapeHtml(log.inquiry_status || 'open')}</span></td>
        </tr>\`).join('');

    container.innerHTML = \`
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div>
          <h1>Auto Assignment</h1>
          <p>Round-robin queue based on employees clocked in today</p>
        </div>
        <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
          <div style="display:inline-flex;align-items:center;gap:10px;padding:6px 14px;border-radius:100px;background:var(--bg-soft);box-shadow:var(--neu-sm);">
            <span style="font-size:0.82rem;font-weight:700;color:var(--text-dim);">Auto Assign:</span>
            <label class="switch-container" style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none;">
              <div class="switch-outer" id="auto-assign-switch-outer" style="position:relative;width:44px;height:22px;background:\${status.auto_assignment_enabled ? 'var(--success)' : 'var(--border)'};border-radius:100px;transition:0.3s;box-shadow:inset 0 1px 3px rgba(0,0,0,0.15);">
                <div class="switch-inner" id="auto-assign-switch-inner" style="position:absolute;top:2px;left:\${status.auto_assignment_enabled ? '24px' : '2px'};width:18px;height:18px;background:#ffffff;border-radius:50%;transition:0.3s;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></div>
              </div>
              <span style="font-size:0.85rem;font-weight:700;color:\${status.auto_assignment_enabled ? 'var(--success)' : 'var(--text-dim)'};" id="auto-assign-status-text">\${status.auto_assignment_enabled ? 'ON' : 'OFF'}</span>
              <input type="checkbox" id="auto-assign-toggle-input" style="display:none;" \${status.auto_assignment_enabled ? 'checked' : ''} />
            </label>
          </div>
          <button class="btn btn-secondary" id="auto-assign-refresh">\${ICONS.refresh}<span>Refresh</span></button>
        </div>
      </div>
      <div class="stats-grid" style="margin-bottom:24px;">
        <div class="stat-card"><div class="stat-value" style="color:var(--primary)">\${queue.length}</div><div class="stat-label">Clocked In</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--success)">\${status.total_today || 0}</div><div class="stat-label">Assigned Today</div></div>
        <div class="stat-card"><div class="stat-value" style="font-size:1.5rem;color:var(--warning)">\${escapeHtml(queue.find(e => e.is_next)?.full_name || '-')}</div><div class="stat-label">Next Employee</div></div>
      </div>
      <div class="card" style="margin-bottom:24px;">
        <div class="card-header"><span class="card-title">Current Queue</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Position</th><th>Employee</th><th>Clock In</th><th>Assignments Today</th><th>Status</th></tr></thead>
            <tbody>\${queueHtml}</tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Recent Assignments</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Assigned</th><th>Ticket</th><th>Customer</th><th>Employee</th><th>Queue Pos</th><th>Status</th></tr></thead>
            <tbody>\${logsHtml}</tbody>
          </table>
        </div>
      </div>
    \`;

    const toggleInput = container.querySelector('#auto-assign-toggle-input');
    const switchOuter = container.querySelector('#auto-assign-switch-outer');
    const switchInner = container.querySelector('#auto-assign-switch-inner');
    const statusText = container.querySelector('#auto-assign-status-text');

    if (toggleInput && switchOuter && switchInner && statusText) {
      toggleInput.onchange = async () => {
        const enabled = toggleInput.checked;
        switchOuter.style.background = enabled ? 'var(--success)' : 'var(--border)';
        switchInner.style.left = enabled ? '24px' : '2px';
        statusText.textContent = enabled ? 'ON' : 'OFF';
        statusText.style.color = enabled ? 'var(--success)' : 'var(--text-dim)';
        
        try {
          const res = await fetch(\`\${apiBase}/auto-assignment/status\`, {
            method: 'PUT',
            headers: {
              ...authHeaders(),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ enabled })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Failed to update auto-assignment status');
          
          toast(\`Auto assignment turned \${enabled ? 'on' : 'off'}\`, 'success');
        } catch (err) {
          toast(err.message || 'Could not update status', 'error');
          toggleInput.checked = !enabled;
          switchOuter.style.background = !enabled ? 'var(--success)' : 'var(--border)';
          switchInner.style.left = !enabled ? '24px' : '2px';
          statusText.textContent = !enabled ? 'ON' : 'OFF';
          statusText.style.color = !enabled ? 'var(--success)' : 'var(--text-dim)';
        }
      };
      
      switchOuter.onclick = (e) => {
        e.preventDefault();
        toggleInput.checked = !toggleInput.checked;
        toggleInput.dispatchEvent(new Event('change'));
      };
    }

    container.querySelector('#auto-assign-refresh').onclick = () => renderAutoAssignmentTab(container);
  } catch (err) {
    container.innerHTML = \`<div class="page-header"><h1>Auto Assignment</h1><p style="color:var(--danger)">\${escapeHtml(err.message || 'Could not load auto assignment')}</p></div>\`;
    toast(err.message || 'Could not load auto assignment', 'error');
  }
}`;

const updatedSource = source.slice(0, startIdx) + newRenderAutoAssignmentTab + source.slice(endIdx);
fs.writeFileSync(filePath, updatedSource, 'utf8');
console.log('Successfully updated renderAutoAssignmentTab in src/pages/admin.js');
