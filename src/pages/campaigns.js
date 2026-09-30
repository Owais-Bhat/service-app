// WhatsApp Campaigns — an announcement sent to many customers at a time the
// owner chooses.
//
// It is a broadcast, not a group: every person gets the message on their own and
// cannot see who else received it. WhatsApp only lets a business start a chat with
// an approved *marketing template*, so a campaign is that template plus who it goes
// to and when. The server sends slowly, in daytime hours, up to a daily cap, keeps
// the do-not-message list out, and pauses itself if messages start failing.
import { toast } from '../utils.js';
import { ICONS } from '../icons.js';

const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api'
  : 'http://localhost:5000/api';

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const when = (v) => v ? new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const pad = (n) => String(n).padStart(2, '0');
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const STATUS = {
  draft: ['muted', 'Draft'],
  scheduled: ['warn', 'Scheduled'],
  sending: ['ok', 'Sending'],
  paused: ['danger', 'Paused'],
  done: ['ok', 'Done'],
  cancelled: ['muted', 'Cancelled'],
};
const RECIPIENT_CHIP = { sent: ['ok', 'Accepted'], failed: ['danger', 'Failed'], queued: ['muted', 'Waiting'], skipped: ['muted', 'Skipped'] };
const VARIABLE_LABEL = { name: "Customer's name", business: 'Business name', text: 'Fixed text' };

const view = { tab: 'campaigns' };
let root = null;
let campaigns = [];
let meta = null;
let optouts = [];

export async function renderCampaignsTab(container) {
  root = container;
  container.innerHTML = '<div class="loading-screen"><div class="spinner"></div></div>';
  try {
    meta = await api('GET', '/campaigns/meta');
    await load();
  } catch (err) {
    container.innerHTML = `<div class="card" style="padding:30px;text-align:center;color:var(--danger)">${esc(err.message)}</div>`;
    return;
  }
  paint();
}

async function load() {
  [campaigns, optouts] = await Promise.all([api('GET', '/campaigns'), api('GET', '/campaigns/optouts')]);
}
const reload = async () => { await load(); paint(); };

function paint() {
  const running = campaigns.filter(c => ['scheduled', 'sending'].includes(c.status)).length;
  root.innerHTML = `
    <div class="at2">
      <div class="page-header at2-head">
        <div>
          <h1>WhatsApp Campaigns</h1>
          <p>Announce an offer or a notice to your customers — sent one by one, at the time you choose</p>
        </div>
        <div class="at2-headbtns"><button class="btn btn-primary" id="cp-new">${ICONS.plus}<span>New campaign</span></button></div>
      </div>

      <div class="at2-notice" style="margin:0 0 12px">
        <b>How it works.</b> This is a <b>broadcast</b>, not a group: each person receives it on their own and cannot see who else got it.
        WhatsApp lets you start a chat only with a template <b>approved as “Marketing”</b> — make it in Fast2SMS, then paste its id here.
        Messages go out ${meta.rate_per_minute} a minute, between <b>${meta.hours.from}:00 and ${meta.hours.until}:00 ${esc(meta.hours.zone)}</b>, up to ${meta.daily_cap} a day,
        and stop by themselves if they start failing. Each message is billed by Fast2SMS. Send only to people who are happy to hear from you —
        anyone who asks you to stop goes on the do-not-message list.
      </div>

      <div class="at2-tabs">
        <button class="at2-tab${view.tab === 'campaigns' ? ' on' : ''}" data-tab="campaigns">Campaigns${running ? ` <span class="at2-chip warn" style="margin-left:4px">${running}</span>` : ''}</button>
        <button class="at2-tab${view.tab === 'optouts' ? ' on' : ''}" data-tab="optouts">Do-not-message list <span style="color:var(--text-dim);margin-left:4px">${optouts.length}</span></button>
      </div>
      <div class="at2-panel"><div class="at2-body" id="cp-body"></div></div>
    </div>`;

  root.querySelectorAll('[data-tab]').forEach(btn => { btn.onclick = () => { view.tab = btn.dataset.tab; paint(); }; });
  root.querySelector('#cp-new').onclick = () => openEditor();
  const body = root.querySelector('#cp-body');
  if (view.tab === 'optouts') return paintOptouts(body);

  if (!campaigns.length) {
    body.innerHTML = '<div class="empty" style="padding:38px;text-align:center;color:var(--text-dim)">No campaigns yet. Make your first one — an AMC offer to customers who never took one is a good start.</div>';
    return;
  }
  body.innerHTML = `
    <div class="table-wrap"><table class="at2-tbl">
      <thead><tr><th>Campaign</th><th>Goes to</th><th>Starts</th><th style="min-width:180px">Progress</th><th>Status</th></tr></thead>
      <tbody>
        ${campaigns.map(c => {
    const [tone, label] = STATUS[c.status] || ['muted', c.status];
    const p = c.progress;
    const done = p.sent + p.failed + p.skipped;
    const pct = p.total ? Math.round((done / p.total) * 100) : 0;
    return `
          <tr data-open="${esc(c.id)}">
            <td><b>${esc(c.name)}</b><div style="font-size:0.74rem;color:var(--text-dim)">Template ${esc(c.message_id)}</div></td>
            <td style="font-size:0.82rem">${audienceLabel(c.audience)}</td>
            <td style="white-space:nowrap">${esc(c.scheduled_at ? when(c.scheduled_at) : '—')}</td>
            <td>${p.total ? `<div style="height:6px;border-radius:6px;background:rgba(127,127,127,0.18);overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--primary)"></div></div>
              <div style="font-size:0.74rem;color:var(--text-dim);margin-top:3px">${p.sent} of ${p.total} sent${p.failed ? ` · <span style="color:var(--danger)">${p.failed} failed</span>` : ''}</div>` : '<span style="color:var(--text-dim);font-size:0.8rem">not scheduled yet</span>'}</td>
            <td><span class="at2-chip ${tone}">${esc(label)}</span></td>
          </tr>`;
  }).join('')}
      </tbody>
    </table></div>`;
  body.querySelectorAll('[data-open]').forEach(tr => { tr.onclick = () => openDetail(tr.dataset.open); });
}

function audienceLabel(a) {
  const lists = [a.customers ? 'Customers' : null, a.contacts ? 'Contacts' : null].filter(Boolean).join(' + ');
  const seg = a.segment && a.segment !== 'all' ? ` — ${esc(meta.segments[a.segment] || a.segment)}` : '';
  return `${esc(lists)}${seg}`;
}

// ── do-not-message list ─────────────────────────────────────────────────
function paintOptouts(body) {
  body.innerHTML = `
    <p class="at2-note" style="margin-top:0">Numbers here are never included in a campaign — not even one that was scheduled before they were added. Add anyone who asks you to stop.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      <textarea id="oo-numbers" rows="2" placeholder="Paste one or many mobile numbers — separated by commas, spaces or new lines" style="flex:1;min-width:240px"></textarea>
      <input type="text" id="oo-reason" placeholder="Reason (optional)" style="width:200px">
      <button class="btn btn-primary" id="oo-add">Add</button>
    </div>
    ${optouts.length ? `<div class="table-wrap"><table class="at2-tbl"><thead><tr><th>Number</th><th>Reason</th><th>Added</th><th></th></tr></thead><tbody>
      ${optouts.map(o => `<tr><td><code>${esc(o.phone)}</code></td><td>${esc(o.reason || '')}</td><td>${esc(when(o.created_at))}</td>
        <td style="text-align:right"><button class="btn btn-secondary btn-sm" data-remove="${esc(o.phone)}">Remove</button></td></tr>`).join('')}
    </tbody></table></div>` : '<div style="color:var(--text-dim);font-size:0.86rem">Nobody is on the list.</div>'}`;
  body.querySelector('#oo-add').onclick = async () => {
    const numbers = body.querySelector('#oo-numbers').value;
    if (!numbers.trim()) return toast('Enter at least one number', 'warning');
    try {
      const out = await api('POST', '/campaigns/optouts', { numbers, reason: body.querySelector('#oo-reason').value.trim() });
      toast(`${out.added} added${out.unreadable ? `, ${out.unreadable} could not be read as a mobile number` : ''}`, out.added ? 'success' : 'warning');
      await reload();
    } catch (err) { toast(err.message, 'error'); }
  };
  body.querySelectorAll('[data-remove]').forEach(b => {
    b.onclick = async () => {
      if (!confirm(`Take ${b.dataset.remove} off the list? They can then receive campaigns again.`)) return;
      try { await api('DELETE', `/campaigns/optouts/${encodeURIComponent(b.dataset.remove)}`); await reload(); } catch (err) { toast(err.message, 'error'); }
    };
  });
}

// ── editor ──────────────────────────────────────────────────────────────
function openEditor(existing = null) {
  const c = existing;
  const state = {
    variables: (c?.variables || []).map(v => ({ ...v })),
    media_path: c?.media_path || '',
  };
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:720px">
      <div class="modal-header"><span class="modal-title">${c ? 'Edit campaign' : 'New campaign'}</span><button class="modal-close" id="ce-close">${ICONS.close}</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Campaign name * <small>(for you — customers do not see it)</small></label>
          <input type="text" id="ce-name" value="${esc(c?.name || '')}" placeholder="Diwali AMC offer"></div>

        <div class="form-group"><label>Marketing template id *</label>
          <input type="text" id="ce-mid" value="${esc(c?.message_id || '')}" placeholder="e.g. 14">
          <small style="color:var(--text-dim);font-size:0.76rem">In Fast2SMS → WhatsApp → Templates, create a template in the <b>Marketing</b> category, wait for approval, and paste its id. Include a line such as “Reply STOP to unsubscribe”.</small></div>

        <div class="form-group"><label>What fills the blanks in the template <small>(in the order of {{1}}, {{2}}…)</small></label>
          <div id="ce-vars"></div>
          <button type="button" class="at2-addline" id="ce-addvar" style="margin-top:6px">${ICONS.plus}<span>Add a blank</span></button></div>

        <div class="form-group"><label>Picture or PDF in the header <small>(only if your template has one)</small></label>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input type="file" id="ce-file" accept="image/png,image/jpeg,application/pdf" style="flex:1;min-width:200px">
            <span id="ce-filename" style="font-size:0.8rem;color:var(--text-dim)"></span>
            <button type="button" class="btn btn-secondary btn-sm" id="ce-clearfile" hidden>Remove</button>
          </div></div>

        <div class="card" style="margin-top:6px"><div class="card-header"><span class="card-title">Who it goes to</span></div>
          <div style="padding:14px;display:grid;gap:10px">
            <label class="at2-check"><input type="checkbox" id="ce-customers" ${(c?.audience?.customers ?? true) ? 'checked' : ''}> Customers <small style="color:var(--text-dim)">(Customers &amp; Suppliers list)</small></label>
            <label class="at2-check"><input type="checkbox" id="ce-contacts" ${c?.audience?.contacts && (c?.audience?.segment || 'all') === 'all' ? 'checked' : ''}> Contacts <small style="color:var(--text-dim)">(everyone who ever raised a service request)</small></label>
            <div class="form-group" style="margin:0"><label>Narrow it down</label>
              <select id="ce-segment">${Object.entries(meta.segments).map(([k, l]) => `<option value="${k}"${(c?.audience?.segment || 'all') === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              <button type="button" class="btn btn-secondary" id="ce-check">Check who this reaches</button>
              <span id="ce-count" style="font-size:0.84rem"></span></div>
          </div></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="ce-cancel">Cancel</button><button class="btn btn-primary" id="ce-save">${c ? 'Save changes' : 'Save as draft'}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#ce-close').onclick = close;
  $('#ce-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  const paintVars = () => {
    $('#ce-vars').innerHTML = state.variables.length ? state.variables.map((v, i) => `
      <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">
        <code style="min-width:40px">{{${i + 1}}}</code>
        <select data-vtype="${i}" style="width:180px">${Object.entries(VARIABLE_LABEL).map(([k, l]) => `<option value="${k}"${v.type === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        ${v.type === 'text' ? `<input type="text" data-vvalue="${i}" value="${esc(v.value || '')}" placeholder="The words to put here" style="flex:1;min-width:0">` : '<span style="flex:1"></span>'}
        <button type="button" class="at2-photo" data-vdel="${i}" title="Remove">${ICONS.close}</button>
      </div>`).join('') : '<div style="font-size:0.8rem;color:var(--text-dim)">None — the template has no blanks.</div>';
    overlay.querySelectorAll('[data-vtype]').forEach(s => { s.onchange = () => { state.variables[s.dataset.vtype] = { type: s.value, value: '' }; paintVars(); }; });
    overlay.querySelectorAll('[data-vvalue]').forEach(i => { i.oninput = () => { state.variables[i.dataset.vvalue].value = i.value; }; });
    overlay.querySelectorAll('[data-vdel]').forEach(b => { b.onclick = () => { state.variables.splice(Number(b.dataset.vdel), 1); paintVars(); }; });
  };
  paintVars();
  $('#ce-addvar').onclick = () => {
    if (state.variables.length >= 5) return toast('A template can have at most 5 blanks', 'warning');
    state.variables.push({ type: state.variables.length ? 'text' : 'name', value: '' });
    paintVars();
  };

  const paintFile = () => {
    $('#ce-filename').textContent = state.media_path ? `Attached: ${state.media_path.split('/').pop()}` : '';
    $('#ce-clearfile').hidden = !state.media_path;
  };
  paintFile();
  $('#ce-clearfile').onclick = () => { state.media_path = ''; $('#ce-file').value = ''; paintFile(); };
  $('#ce-file').onchange = async () => {
    const file = $('#ce-file').files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { $('#ce-file').value = ''; return toast('WhatsApp allows up to 5 MB here', 'warning'); }
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch(`${API}/upload`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` }, body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      state.media_path = data.url;
      paintFile();
    } catch (err) { toast(err.message, 'error'); }
  };

  // A segment (AMC, warranty) is worked out from customer records, so it leaves plain contacts out.
  const syncSegment = () => {
    const narrowed = $('#ce-segment').value !== 'all';
    if (narrowed) $('#ce-contacts').checked = false;
    $('#ce-contacts').disabled = narrowed;
  };
  $('#ce-segment').onchange = syncSegment;
  syncSegment();

  const audience = () => ({ customers: $('#ce-customers').checked, contacts: $('#ce-contacts').checked, segment: $('#ce-segment').value });
  $('#ce-check').onclick = async () => {
    $('#ce-count').textContent = 'Checking…';
    try {
      const r = await api('POST', '/campaigns/audience', audience());
      const left = [r.invalid ? `${r.invalid} without a valid mobile number` : null, r.duplicates ? `${r.duplicates} duplicates` : null, r.opted_out ? `${r.opted_out} on the do-not-message list` : null].filter(Boolean);
      $('#ce-count').innerHTML = `<b>${r.will_send}</b> people would receive it${left.length ? ` <span style="color:var(--text-dim)">(left out: ${left.join(', ')})</span>` : ''}`;
    } catch (err) { $('#ce-count').textContent = err.message; }
  };

  $('#ce-save').onclick = async () => {
    const payload = {
      name: $('#ce-name').value.trim(), message_id: $('#ce-mid').value.trim(),
      variables: state.variables, media_path: state.media_path || null, audience: audience(),
    };
    if (!payload.name) return toast('Give the campaign a name', 'warning');
    if (!payload.message_id) return toast('Enter the template id from Fast2SMS', 'warning');
    $('#ce-save').disabled = true;
    try {
      const saved = c ? await api('PATCH', `/campaigns/${encodeURIComponent(c.id)}`, payload) : await api('POST', '/campaigns', payload);
      toast(c ? 'Saved' : 'Saved as a draft — test it, then schedule it', 'success');
      close();
      await reload();
      openDetail(saved.id);
    } catch (err) { toast(err.message, 'error'); $('#ce-save').disabled = false; }
  };
}

// ── detail ──────────────────────────────────────────────────────────────
async function openDetail(id) {
  let c;
  try { c = await api('GET', `/campaigns/${encodeURIComponent(id)}`); } catch (err) { return toast(err.message, 'error'); }
  const [tone, label] = STATUS[c.status] || ['muted', c.status];
  const p = c.progress;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:780px">
      <div class="modal-header"><span class="modal-title">${esc(c.name)} <span class="at2-chip ${tone}">${esc(label)}</span></span><button class="modal-close" id="cd-close">${ICONS.close}</button></div>
      <div class="modal-body">
        ${c.pause_reason ? `<div class="at2-notice ${c.status === 'paused' ? 'danger' : ''}">${esc(c.pause_reason)}</div>` : ''}
        <div class="at2-stats" style="margin:0 0 12px">
          <div class="at2-stat"><div class="k">Accepted</div><div class="v">${p.sent}</div><div class="s">of ${p.total || '—'}</div></div>
          <div class="at2-stat ${p.failed ? 'danger' : 'muted'}"><div class="k">Failed</div><div class="v ${p.failed ? 'bad' : ''}">${p.failed}</div></div>
          <div class="at2-stat muted"><div class="k">Waiting</div><div class="v">${p.queued}</div></div>
          <div class="at2-stat muted"><div class="k">Skipped</div><div class="v">${p.skipped}</div></div>
        </div>
        <div style="font-size:0.84rem;line-height:1.7;margin-bottom:10px">
          <div><b>Template</b> ${esc(c.message_id)}${c.media_path ? ' · with a picture / PDF header' : ''}</div>
          <div><b>Blanks</b> ${c.variables.length ? c.variables.map((v, i) => `{{${i + 1}}} = ${esc(v.type === 'text' ? `“${v.value}”` : VARIABLE_LABEL[v.type])}`).join(' · ') : 'none'}</div>
          <div><b>Goes to</b> ${audienceLabel(c.audience)}</div>
          ${c.scheduled_at ? `<div><b>Starts</b> ${esc(when(c.scheduled_at))}${c.finished_at ? ` · <b>Finished</b> ${esc(when(c.finished_at))}` : ''}</div>` : ''}
        </div>
        ${c.recipients?.length ? `
        <div class="card"><div class="card-header"><span class="card-title">Recipients</span></div>
          <div class="table-wrap" style="max-height:280px;overflow:auto"><table class="at2-tbl"><tbody>
            ${c.recipients.map(r => { const [rt, rl] = RECIPIENT_CHIP[r.status] || ['muted', r.status]; return `<tr>
              <td>${esc(r.name || '—')}</td><td><code>${esc(r.phone.slice(0, 2))}••••••${esc(r.phone.slice(-2))}</code></td>
              <td><span class="at2-chip ${rt}">${rl}</span>${r.error ? `<div style="font-size:0.72rem;color:var(--text-dim)">${esc(r.error)}</div>` : ''}</td></tr>`; }).join('')}
          </tbody></table></div></div>
        <p class="at2-note">“Accepted” means Fast2SMS took the message. Whether it reached each phone is shown in your Fast2SMS dashboard.</p>` : ''}
      </div>
      <div class="modal-footer" style="gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary" id="cd-cancel">Close</button>
        ${c.status === 'draft' ? '<button class="btn btn-secondary" id="cd-delete">Delete</button><button class="btn btn-secondary" id="cd-edit">Edit</button><button class="btn btn-secondary" id="cd-test">Send me a test</button><button class="btn btn-primary" id="cd-schedule">Schedule…</button>' : ''}
        ${['scheduled', 'sending'].includes(c.status) ? '<button class="btn btn-secondary" id="cd-pause">Pause</button>' : ''}
        ${c.status === 'paused' ? '<button class="btn btn-primary" id="cd-resume">Resume</button>' : ''}
        ${['scheduled', 'sending', 'paused'].includes(c.status) ? '<button class="btn btn-secondary" id="cd-stop">Cancel campaign</button>' : ''}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#cd-close').onclick = close;
  $('#cd-cancel').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  const again = async () => { close(); await reload(); openDetail(id); };
  const act = (action, msg, ask) => async () => {
    if (ask && !confirm(ask)) return;
    try { await api('POST', `/campaigns/${encodeURIComponent(id)}/${action}`); toast(msg, 'success'); await again(); } catch (err) { toast(err.message, 'error'); }
  };

  if ($('#cd-edit')) $('#cd-edit').onclick = () => { close(); openEditor(c); };
  if ($('#cd-delete')) $('#cd-delete').onclick = async () => {
    if (!confirm('Delete this draft?')) return;
    try { await api('DELETE', `/campaigns/${encodeURIComponent(id)}`); close(); await reload(); } catch (err) { toast(err.message, 'error'); }
  };
  if ($('#cd-test')) $('#cd-test').onclick = async () => {
    const phone = prompt('Your own mobile number — the test message will be sent to it');
    if (!phone) return;
    try { await api('POST', `/campaigns/${encodeURIComponent(id)}/test`, { phone }); toast('Test sent — check your WhatsApp', 'success'); } catch (err) { toast(err.message, 'error'); }
  };
  if ($('#cd-schedule')) $('#cd-schedule').onclick = () => openSchedule(c, again);
  if ($('#cd-pause')) $('#cd-pause').onclick = act('pause', 'Paused');
  if ($('#cd-resume')) $('#cd-resume').onclick = act('resume', 'Resumed');
  if ($('#cd-stop')) $('#cd-stop').onclick = act('cancel', 'Campaign cancelled', 'Cancel this campaign? Whatever has not been sent yet will not go out.');
}

async function openSchedule(c, done) {
  let reach;
  try { reach = await api('POST', '/campaigns/audience', c.audience); } catch (err) { return toast(err.message, 'error'); }
  const soon = new Date(Date.now() + 60 * 60 * 1000);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '10050';
  overlay.innerHTML = `
    <div class="modal at2-modal" style="max-width:480px">
      <div class="modal-header"><span class="modal-title">Schedule “${esc(c.name)}”</span><button class="modal-close" id="sc-close">${ICONS.close}</button></div>
      <div class="modal-body">
        <div class="at2-notice ${reach.will_send ? '' : 'danger'}">${reach.will_send
      ? `<b>${reach.will_send}</b> people will receive it.${reach.opted_out ? ` ${reach.opted_out} on the do-not-message list are left out.` : ''} The list is fixed when you confirm.`
      : '<b>Nobody</b> would receive this — there is no customer with a valid mobile number in that audience. Go back and change who it goes to.'}</div>
        <label class="at2-check" style="margin:10px 0"><input type="radio" name="sc-when" value="now" checked> Start as soon as sending hours allow</label>
        <label class="at2-check"><input type="radio" name="sc-when" value="at"> Start at</label>
        <input type="datetime-local" id="sc-at" value="${localInput(soon)}" style="margin:6px 0 10px 24px">
        <p class="at2-note" style="margin:0">Messages go out ${meta.rate_per_minute} a minute between ${meta.hours.from}:00 and ${meta.hours.until}:00 ${esc(meta.hours.zone)}, up to ${meta.daily_cap} a day —
          so ${reach.will_send} people take about ${Math.max(1, Math.ceil(reach.will_send / meta.rate_per_minute))} minutes of sending time.
          Send yourself a test first if you have not.</p>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="sc-cancel">Back</button><button class="btn btn-primary" id="sc-go" ${reach.will_send ? '' : 'disabled'}>Confirm and schedule</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const $ = (sel) => overlay.querySelector(sel);
  const close = () => overlay.remove();
  $('#sc-close').onclick = close;
  $('#sc-cancel').onclick = close;
  $('#sc-at').onfocus = () => { overlay.querySelector('input[value=at]').checked = true; };
  $('#sc-go').onclick = async () => {
    const mode = overlay.querySelector('input[name=sc-when]:checked').value;
    const at = mode === 'at' ? new Date($('#sc-at').value) : null;
    if (mode === 'at' && Number.isNaN(at.getTime())) return toast('Choose a date and time', 'warning');
    if (!confirm(`Send “${c.name}” to ${reach.will_send} people${at ? ` starting ${at.toLocaleString('en-IN')}` : ' as soon as possible'}?`)) return;
    $('#sc-go').disabled = true;
    try {
      const out = await api('POST', `/campaigns/${encodeURIComponent(c.id)}/schedule`, { scheduled_at: at ? at.toISOString() : null });
      toast(`Scheduled for ${out.recipients} people`, 'success');
      close();
      await done();
    } catch (err) { toast(err.message, 'error'); $('#sc-go').disabled = false; }
  };
}
