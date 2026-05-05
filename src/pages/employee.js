import { supabase } from '../supabase.js';
import { toast, formatDate, formatTime } from '../utils.js';

export async function renderEmployeeDashboard(container) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { container.innerHTML = '<p>Please sign in.</p>'; return; }

  const today = new Date().toLocaleDateString('en-CA');
  let attendance, tasks, eodReport;

  try {
    const res = await Promise.all([
      supabase.from('attendance').select('*').eq('user_id', user.id).eq('date', today).maybeSingle(),
      supabase.from('tickets').select('*').eq('assigned_to', user.id).order('created_at', { ascending: false }),
      supabase.from('eod_reports').select('*').eq('employee_id', user.id).eq('date', today).maybeSingle()
    ]);
    attendance = res[0].data; tasks = res[1].data; eodReport = res[2].data;
  } catch (err) {
    container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px;"><h3 style="color:var(--danger)">⚠️ Error</h3><p>${err.message}</p></div></div>`;
    return;
  }

  const t = tasks || [];
  const activeTasks = t.filter(x => x.status !== 'closed' && x.status !== 'resolved');
  const isClockedIn = !!attendance?.clock_in;
  const isClockedOut = !!attendance?.clock_out;

  container.innerHTML = `
    <div class="page-header">
      <h1>Employee Portal</h1>
      <p>Today is ${new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value" style="font-size:1.5rem;color:${isClockedIn ? 'var(--success)' : 'var(--text-dim)'}">
          ${isClockedIn ? '✅ Clocked In' : '⏸ Not Started'}
        </div>
        <div class="stat-label">${isClockedIn ? 'Since ' + formatTime(attendance.clock_in) : 'Tap Clock In to start'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--warning)">${activeTasks.length}</div>
        <div class="stat-label">Active Tasks</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color:var(--success)">${t.filter(x => x.status === 'resolved').length}</div>
        <div class="stat-label">Completed</div>
      </div>
    </div>

    <div class="grid-2">
      <!-- Attendance Card -->
      <div class="card">
        <div class="card-header"><span class="card-title">🕒 Attendance</span></div>
        <div class="card-body" style="text-align:center;padding:32px">
          <div id="live-clock" style="font-size:2.8rem;font-weight:800;color:var(--primary);letter-spacing:-2px;margin-bottom:24px;font-variant-numeric:tabular-nums;">--:--:--</div>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
            <button class="btn btn-primary" id="btn-clock-in" ${isClockedIn ? 'disabled style="opacity:0.5"' : ''}>
              ✅ Clock In
            </button>
            <button class="btn btn-secondary" id="btn-clock-out" ${(!isClockedIn || isClockedOut) ? 'disabled style="opacity:0.5"' : ''}>
              ⏸ Clock Out
            </button>
          </div>
          ${attendance?.location ? `<p style="margin-top:16px;font-size:0.8rem;color:var(--text-dim)">📍 ${attendance.location}</p>` : ''}
          ${isClockedOut ? `<div style="margin-top:20px;padding:14px;border-radius:14px;box-shadow:var(--neu-in);background:var(--bg);font-size:.88rem;color:var(--success);font-weight:600;">
            ✅ Session: ${formatTime(attendance.clock_in)} → ${formatTime(attendance.clock_out)}
          </div>` : ''}
        </div>
      </div>

      <!-- EOD Report Card -->
      <div class="card">
        <div class="card-header"><span class="card-title">📋 End of Day Report</span></div>
        <div class="card-body">
          ${eodReport ? `
            <div style="padding:20px;border-radius:16px;box-shadow:var(--neu-in);background:var(--bg);text-align:center;">
              <div style="font-size:2rem;margin-bottom:8px;">✅</div>
              <div style="font-weight:700;color:var(--success)">Report Submitted</div>
              <div style="font-size:.85rem;color:var(--text-soft);margin-top:8px">Great work today!</div>
            </div>
          ` : `
            <div class="form-group">
              <label>What did you accomplish today?</label>
              <textarea id="eod-content" rows="5" placeholder="Describe your tasks, progress, and any notes for tomorrow…"></textarea>
            </div>
            <button class="btn btn-primary btn-wide" id="btn-submit-eod">Submit Report →</button>
          `}
        </div>
      </div>
    </div>

    <!-- Tasks Table -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">📌 My Assigned Tasks</span>
        <span class="badge badge-open">${activeTasks.length} active</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Title</th><th>Status</th><th>Priority</th><th>Action</th></tr>
          </thead>
          <tbody>
            ${t.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--text-dim)">No tasks assigned yet</td></tr>' :
              t.map(x => `<tr>
                <td><b>${x.title}</b></td>
                <td><span class="badge badge-${x.status}">${x.status.replace('_',' ')}</span></td>
                <td><span class="badge badge-${x.priority || 'medium'}">${x.priority || 'medium'}</span></td>
                <td><button class="btn btn-secondary btn-sm task-btn" data-id="${x.id}" data-status="${x.status}">Update</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Live clock
  const clockEl = container.querySelector('#live-clock');
  const tick = () => { if (clockEl) clockEl.textContent = new Date().toLocaleTimeString(); };
  tick(); setInterval(tick, 1000);

  // Clock In
  container.querySelector('#btn-clock-in').onclick = async () => {
    const btn = container.querySelector('#btn-clock-in');
    btn.disabled = true; btn.textContent = 'Getting location…';
    let locationStr = 'Unknown';
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }));
      locationStr = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
    } catch (_) {}

    const { error } = await supabase.from('attendance').insert({
      user_id: user.id, clock_in: new Date().toISOString(), date: today, location: locationStr, status: 'present'
    });
    if (error) { toast(error.message, 'error'); btn.disabled = false; btn.textContent = '✅ Clock In'; }
    else { toast('Clocked in!', 'success'); renderEmployeeDashboard(container); }
  };

  // Clock Out
  container.querySelector('#btn-clock-out').onclick = async () => {
    const { error } = await supabase.from('attendance').update({ clock_out: new Date().toISOString() })
      .eq('user_id', user.id).eq('date', today);
    if (error) toast(error.message, 'error');
    else { toast('Clocked out!', 'success'); renderEmployeeDashboard(container); }
  };

  // EOD
  const eodBtn = container.querySelector('#btn-submit-eod');
  if (eodBtn) {
    eodBtn.onclick = async () => {
      const content = container.querySelector('#eod-content').value.trim();
      if (!content) { toast('Please write your report', 'warning'); return; }
      eodBtn.disabled = true; eodBtn.textContent = 'Submitting…';
      const { error } = await supabase.from('eod_reports').insert({ employee_id: user.id, content, date: today });
      if (error) { toast(error.message, 'error'); eodBtn.disabled = false; eodBtn.textContent = 'Submit Report →'; }
      else { toast('EOD Report submitted!', 'success'); renderEmployeeDashboard(container); }
    };
  }

  // Task update buttons
  container.querySelectorAll('.task-btn').forEach(btn => {
    btn.onclick = () => openTaskModal(btn.dataset.id, btn.dataset.status, () => renderEmployeeDashboard(container));
  });
}

function openTaskModal(taskId, currentStatus, onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-header">
        <span class="modal-title">Update Task Status</span>
        <button class="modal-close" id="cm">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>New Status</label>
          <select id="new-status">
            <option value="open" ${currentStatus==='open'?'selected':''}>Open</option>
            <option value="in_progress" ${currentStatus==='in_progress'?'selected':''}>In Progress</option>
            <option value="resolved" ${currentStatus==='resolved'?'selected':''}>Resolved</option>
            <option value="closed" ${currentStatus==='closed'?'selected':''}>Closed</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cm2">Cancel</button>
        <button class="btn btn-primary" id="save-update">Save Changes</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#cm').onclick = overlay.querySelector('#cm2').onclick = () => overlay.remove();
  overlay.querySelector('#save-update').onclick = async () => {
    await supabase.from('tickets').update({ status: overlay.querySelector('#new-status').value }).eq('id', taskId);
    toast('Task updated!', 'success');
    overlay.remove();
    onDone();
  };
}
