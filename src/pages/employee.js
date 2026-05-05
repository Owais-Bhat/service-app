import { supabase } from '../supabase.js';
import { toast, formatDate, formatDateTime, formatTime, initials } from '../utils.js';

export async function renderEmployeeDashboard(container) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { container.innerHTML = 'Please sign in.'; return; }

  // Fetch Attendance, Tasks, and EOD status
  const today = new Date().toLocaleDateString('en-CA');
  let attendance, tasks, eodReport;
  try {
    console.log('Employee Dashboard: Fetching data for user', user.id, 'today:', today);
    const res = await Promise.all([
      supabase.from('attendance').select('*').eq('user_id', user.id).eq('date', today).maybeSingle(),
      supabase.from('tickets').select('*').eq('assigned_to', user.id).order('priority', { ascending: false }),
      supabase.from('eod_reports').select('*').eq('employee_id', user.id).eq('date', today).maybeSingle()
    ]);
    attendance = res[0].data; tasks = res[1].data; eodReport = res[2].data;
    if (res.some(r => r.error)) {
      console.error('Database error in Employee Portal:', res.find(r => r.error).error);
      throw new Error("Database error. Have you run the migrations in Supabase?");
    }
    console.log('Employee Attendance status:', attendance);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Setup Required</div><div class="empty-desc">${err.message}</div></div>`;
    return;
  }

  const t = tasks || [];
  const activeTasks = t.filter(x => x.status !== 'closed' && x.status !== 'resolved');

  container.innerHTML = `
    <div class="page-header">
      <h1>Employee Portal</h1>
      <p>Manage your attendance and assigned tasks</p>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color:#10B981">
        <div class="stat-value" id="attendance-status">${attendance?.clock_in ? 'Clocked In' : 'Not Clocked In'}</div>
        <div class="stat-label">${attendance?.clock_in ? 'In at ' + formatTime(attendance.clock_in) : 'Please clock in to start work'}</div>
        <div class="stat-icon">🕒</div>
      </div>
      <div class="stat-card" style="--card-color:#F59E0B">
        <div class="stat-value">${activeTasks.length}</div>
        <div class="stat-label">Pending Tasks</div>
        <div class="stat-icon">📋</div>
      </div>
    </div>

    <div class="grid-2" style="margin-top:24px">
      <div class="card">
        <div class="card-header"><span class="card-title">Attendance Tracking</span></div>
        <div class="card-body">
          <div style="text-align:center;padding:20px 0">
            <div style="font-size:2rem;font-weight:700;margin-bottom:16px;color:var(--text)" id="live-clock">--:--:--</div>
            <div style="display:flex;gap:12px;justify-content:center">
              <button class="btn btn-primary" id="btn-clock-in" ${attendance?.clock_in ? 'disabled' : ''}>Clock In</button>
              <button class="btn btn-secondary" id="btn-clock-out" ${(!attendance?.clock_in || attendance?.clock_out) ? 'disabled' : ''}>Clock Out</button>
            </div>
          </div>
          ${attendance?.location ? `<div style="font-size:0.75rem;color:var(--text3);text-align:center;margin-top:8px">📍 Location: ${attendance.location}</div>` : ''}
          ${attendance?.clock_out ? `
            <div style="margin-top:16px;padding:12px;background:var(--bg3);border-radius:8px;font-size:.88rem">
              ✅ Work session completed: ${formatTime(attendance.clock_in)} - ${formatTime(attendance.clock_out)}
            </div>
          ` : ''}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">EOD Report</span></div>
        <div class="card-body">
          ${eodReport ? `
            <div style="padding:12px;background:var(--bg3);border-radius:8px;font-size:.88rem">
              ✅ EOD Report submitted for today.
            </div>
          ` : `
            <div class="form-group">
              <label>What did you accomplish today?</label>
              <textarea id="eod-content" placeholder="Summarize your work…"></textarea>
            </div>
            <button class="btn btn-primary" id="btn-submit-eod" style="width:100%">Submit EOD Report</button>
          `}
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:24px">
      <div class="card-header"><span class="card-title">My Assigned Tasks</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Title</th><th>Status</th><th>Priority</th><th>Actions</th></tr></thead>
          <tbody>
            ${t.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--text3)">No tasks assigned</td></tr>' : 
              t.map(x => `<tr>
                <td>${x.title}</td>
                <td><span class="badge badge-${x.status}">${x.status}</span></td>
                <td><span class="badge badge-${x.priority}">${x.priority}</span></td>
                <td><button class="btn btn-secondary btn-sm task-update-btn" data-id="${x.id}" data-status="${x.status}">Update</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Live Clock
  const updateClock = () => {
    const el = container.querySelector('#live-clock');
    if (el) el.innerText = new Date().toLocaleTimeString();
  };
  setInterval(updateClock, 1000);
  updateClock();

  // Clock In
  container.querySelector('#btn-clock-in').onclick = async () => {
    const btn = container.querySelector('#btn-clock-in');
    btn.disabled = true;
    btn.textContent = 'Processing…';

    let locationStr = 'Unknown';
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
      });
      locationStr = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
    } catch (err) { console.warn('Geo failed'); }

    console.log('CLOCKED IN CLICKED - Data:', { user_id: user.id, date: today, location: locationStr });

    const { data, error } = await supabase.from('attendance').insert({
      user_id: user.id,
      clock_in: new Date().toISOString(),
      date: today,
      location: locationStr,
      status: 'present'
    }).select();

    if (error) {
      console.error('CLOCK IN ERROR:', error);
      alert('CLOCK IN FAILED: ' + error.message);
      btn.disabled = false;
      btn.textContent = 'Clock In';
    } else {
      console.log('CLOCK IN SUCCESS:', data);
      toast('Clocked in successfully!', 'success');
      renderEmployeeDashboard(container);
    }
  };

  // Clock Out
  container.querySelector('#btn-clock-out').onclick = async () => {
    const { error } = await supabase.from('attendance').update({
      clock_out: new Date().toISOString()
    }).eq('user_id', user.id).eq('date', today);
    if (error) toast(error.message, 'error');
    else { toast('Clocked out successfully!', 'success'); renderEmployeeDashboard(container); }
  };

  // Submit EOD
  const eodBtn = container.querySelector('#btn-submit-eod');
  if (eodBtn) {
    eodBtn.onclick = async () => {
      const content = container.querySelector('#eod-content').value.trim();
      if (!content) { toast('Please write your report', 'warning'); return; }
      const { error } = await supabase.from('eod_reports').insert({
        employee_id: user.id,
        content,
        date: today
      });
      if (error) toast(error.message, 'error');
      else { toast('EOD Report submitted!', 'success'); renderEmployeeDashboard(container); }
    };
  }

  container.querySelectorAll('.task-update-btn').forEach(btn => {
    btn.onclick = () => openTaskModal(btn.dataset.id, btn.dataset.status, () => renderEmployeeDashboard(container));
  });
}

function openTaskModal(taskId, currentStatus, onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-header"><span class="modal-title">Update Task</span><button class="modal-close" id="cm">✕</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Status</label>
          <select id="new-status">
            <option value="open" ${currentStatus==='open'?'selected':''}>Open</option>
            <option value="in_progress" ${currentStatus==='in_progress'?'selected':''}>In Progress</option>
            <option value="resolved" ${currentStatus==='resolved'?'selected':''}>Resolved</option>
            <option value="closed" ${currentStatus==='closed'?'selected':''}>Closed</option>
          </select>
        </div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="cm2">Cancel</button><button class="btn btn-primary" id="save-update">Save</button></div>
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
