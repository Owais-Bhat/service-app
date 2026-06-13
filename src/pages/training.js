// Comprehensive Training — Courses → Lessons + Quiz, progress, assignments.
// Animated, professional UI with detailed per-employee activity tracking.
import { supabase } from '../supabase.js';
import { toast, formatDate, formatDateTime } from '../utils.js';
import { ICONS } from '../icons.js';

const API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api' : 'http://localhost:5000/api';
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` });
const jsonH = () => ({ 'Content-Type': 'application/json', ...authH() });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API}/upload`, { method: 'POST', headers: authH(), body: fd });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || 'Upload failed');
  return d.url;
}

/* ───────────────────────── shared helpers ───────────────────────── */

const modal = (inner, maxW = 760) => {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay tr-modal';
  ov.innerHTML = `<div class="modal tr-pop" style="max-width:${maxW}px">${inner}</div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  return ov;
};

const lessonMedia = (l) => {
  if (!l.media_url) return '';
  const url = esc(l.media_url);
  if (l.type === 'video') return `<video src="${url}" controls style="width:100%;max-height:360px;border-radius:12px;margin-top:10px;"></video>`;
  if (l.type === 'image') return `<img src="${url}" style="width:100%;max-height:360px;object-fit:contain;border-radius:12px;margin-top:10px;background:var(--bg);">`;
  return `<a href="${url}" target="_blank" class="btn btn-secondary btn-sm" style="margin-top:10px;">${ICONS.download || ''}<span>Open file</span></a>`;
};

const TYPE_ICON = { video: ICONS.play, image: ICONS.eye, pdf: ICONS.receipt, text: ICONS.clipboard };
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

// Animated SVG progress ring. Returns markup; call animateRings(scope) after insert.
function ring(pct, size = 54, stroke = 6, color = 'var(--primary)') {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return `<svg class="tr-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${stroke}"/>
    <circle class="tr-ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${circ.toFixed(1)}"
      data-target="${(circ * (1 - Math.max(0, Math.min(100, pct)) / 100)).toFixed(1)}"
      transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" dy=".34em" text-anchor="middle" class="tr-ring-txt">${Math.round(pct)}%</text>
  </svg>`;
}
function animateRings(scope) {
  scope.querySelectorAll('.tr-ring-fg').forEach(el => {
    requestAnimationFrame(() => { el.style.strokeDashoffset = el.dataset.target; });
  });
}

// Animated horizontal bar fill.
function animateBars(scope) {
  scope.querySelectorAll('.tr-bar-fill').forEach(el => {
    const w = el.dataset.w; el.style.width = '0%';
    requestAnimationFrame(() => { el.style.width = w + '%'; });
  });
}

function burstConfetti(host) {
  const colors = ['#10B981', '#38BDF8', '#FBBF24', '#F472B6', '#A78BFA', '#34D399'];
  const wrap = document.createElement('div');
  wrap.className = 'tr-confetti';
  for (let i = 0; i < 36; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = (Math.random() * 0.3) + 's';
    p.style.animationDuration = (0.9 + Math.random() * 0.8) + 's';
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    wrap.appendChild(p);
  }
  host.appendChild(wrap);
  setTimeout(() => wrap.remove(), 2200);
}

/* ─────────────── quiz question types (envelope helpers) ───────────────
   The DB stores every question as (question TEXT, options JSON, correct_index).
   Rich types pack metadata into the question column as a JSON envelope:
   { _qz:1, t:'mcq'|'fill'|'image'|'match', text, img, group, gtitle, left }
   Match-the-following uploads create ONE row PER PAIR (same group id) so the
   server's index-based grading keeps working untouched. */
const packQ = (o) => JSON.stringify({ _qz: 1, ...o });
function parseQ(raw) {
  const s = String(raw || '');
  if (s[0] === '{' && s.includes('"_qz"')) {
    try {
      const o = JSON.parse(s);
      return { t: o.t || 'mcq', text: o.text || '', img: o.img || null, group: o.group || null, gtitle: o.gtitle || '', left: o.left || '' };
    } catch (_) { /* fall through */ }
  }
  return { t: 'mcq', text: s, img: null, group: null, gtitle: '', left: '' };
}
const QTYPE_META = {
  mcq:   { chip: '🎯 MCQ',            color: 'var(--primary)' },
  fill:  { chip: '✍️ Fill in the blank', color: '#A78BFA' },
  image: { chip: '🖼️ Image question',  color: '#38BDF8' },
  match: { chip: '🧩 Match the following', color: '#F59E0B' },
};

// SheetJS loaded on demand from CDN — no build dependency needed.
async function loadXLSX() {
  if (window.__XLSX) return window.__XLSX;
  window.__XLSX = await import(/* @vite-ignore */ 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
  return window.__XLSX;
}

// Parse uploaded workbook rows → array of { question, options, correct_index } bodies.
function rowsToQuizBodies(rows) {
  const bodies = [];
  const errors = [];
  const norm = (row) => {
    const out = {};
    Object.keys(row).forEach(k => { out[String(k).toLowerCase().replace(/[^a-z]/g, '')] = row[k]; });
    return out;
  };
  rows.forEach((rawRow, idx) => {
    const r = norm(rawRow);
    const line = idx + 2; // header is row 1
    const type = String(r.type || 'mcq').trim().toLowerCase();
    const text = String(r.question || '').trim();
    const img = String(r.imageurl || r.image || '').trim() || null;
    const opts = ['optiona', 'optionb', 'optionc', 'optiond'].map(k => String(r[k] ?? '').trim()).filter(Boolean);
    if (!text) { errors.push(`Row ${line}: question is empty`); return; }

    if (type === 'match') {
      const pairs = opts.map(p => {
        const i = p.indexOf('=');
        return i > 0 ? [p.slice(0, i).trim(), p.slice(i + 1).trim()] : null;
      }).filter(p => p && p[0] && p[1]);
      if (pairs.length < 2) { errors.push(`Row ${line}: match needs at least 2 "Left=Right" pairs in the Option columns`); return; }
      const group = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
      const rights = pairs.map(p => p[1]);
      pairs.forEach((p, i) => bodies.push({
        question: packQ({ t: 'match', text, gtitle: text, left: p[0], group }),
        options: rights,
        correct_index: i,
      }));
      return;
    }

    if (opts.length < 2) { errors.push(`Row ${line}: needs at least 2 options`); return; }
    const cRaw = String(r.correct ?? r.correctanswer ?? 'A').trim();
    let correct_index = 'ABCD'.indexOf(cRaw.toUpperCase());
    if (correct_index === -1 && /^[1-4]$/.test(cRaw)) correct_index = Number(cRaw) - 1;
    if (correct_index === -1) correct_index = opts.findIndex(o => o.toLowerCase() === cRaw.toLowerCase());
    if (correct_index < 0 || correct_index >= opts.length) { errors.push(`Row ${line}: Correct must be A–D, 1–4, or match an option`); return; }

    if (type === 'fill' && !/_{2,}/.test(text)) { errors.push(`Row ${line}: fill questions need a blank written as ___ in the question`); return; }
    const t = type === 'image' || (img && type === 'mcq') ? 'image' : (type === 'fill' ? 'fill' : 'mcq');
    bodies.push({
      question: (t === 'mcq') ? text : packQ({ t, text, img }),
      options: opts,
      correct_index,
    });
  });
  return { bodies, errors };
}

// Build + download the sample workbook covering every question type.
async function downloadQuizSample() {
  const XLSX = await loadXLSX();
  const rows = [
    ['Type', 'Question', 'OptionA', 'OptionB', 'OptionC', 'OptionD', 'Correct', 'ImageURL'],
    ['mcq', 'Which cable carries video for an analog CCTV camera?', 'Coaxial', 'HDMI', 'Audio', 'VGA', 'A', ''],
    ['mcq', 'What does PoE stand for?', 'Power over Ethernet', 'Point of Entry', 'Port of Exchange', '', 'A', ''],
    ['fill', 'The default RTSP port is ___', '554', '80', '8080', '443', 'A', ''],
    ['fill', 'A ___ assigns IP addresses automatically on a network', 'DHCP server', 'DNS server', 'Firewall', 'Repeater', 'A', ''],
    ['image', 'Which device is shown in the image?', 'DVR', 'NVR', 'Network Switch', 'Router', 'C', 'https://example.com/your-image.jpg'],
    ['match', 'Match the device to its purpose', 'DVR=Records analog CCTV footage', 'Switch=Connects LAN devices', 'Biometric=Marks attendance', 'VDP=Video door communication', '', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 8 }, { wch: 48 }, { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 9 }, { wch: 34 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Quiz');
  XLSX.writeFile(wb, 'quiz-upload-sample.xlsx');
}

/* ───────────────────────────── ADMIN ───────────────────────────── */

export async function renderTrainingCoursesAdmin(container) {
  const load = async () => {
    container.innerHTML = `<div class="tr-skeleton-grid">${Array.from({ length: 3 }).map(() => '<div class="tr-skeleton-card"></div>').join('')}</div>`;
    let courses, compliance;
    try {
      [courses, compliance] = await Promise.all([
        api('/training/courses', { headers: authH() }),
        api('/training/compliance', { headers: authH() }),
      ]);
    } catch (err) {
      container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--danger)">${esc(err.message)}</div></div>`;
      return;
    }

    const totalLessons = courses.reduce((s, c) => s + Number(c.lesson_count || 0), 0);
    const totalQuiz = courses.reduce((s, c) => s + Number(c.quiz_count || 0), 0);
    const totalCompleted = compliance.reduce((s, r) => s + Number(r.completed || 0), 0);

    container.innerHTML = `
      <div class="tr-head tr-in">
        <div>
          <h1 class="tr-title">${ICONS.shield}<span>Training Academy</span></h1>
          <p class="tr-sub">Build courses with lessons &amp; quizzes, assign them, and track exactly when each employee learns.</p>
        </div>
        <button class="btn btn-primary tr-btn-new" id="tc-new">${ICONS.plus}<span>New Course</span></button>
      </div>

      <div class="tr-stats tr-in" style="--d:.05s">
        ${statCard(ICONS.clipboard, courses.length, 'Courses', 'var(--primary)')}
        ${statCard(ICONS.inbox, totalLessons, 'Lessons', 'var(--info, #38BDF8)')}
        ${statCard(ICONS.check, totalQuiz, 'Quizzes', '#A78BFA')}
        ${statCard(ICONS.users, totalCompleted, 'Completions', 'var(--success)')}
      </div>

      <div class="tr-grid">
        ${courses.length === 0 ? `<div class="tr-empty card"><div class="card-body">No courses yet. Click <b>New Course</b> to build your first one.</div></div>`
        : courses.map((co, i) => {
          const compRow = compliance.find(r => r.course_id === co.id) || {};
          const assigned = Number(co.assign_count || 0);
          const completed = Number(compRow.completed || 0);
          const pct = assigned ? Math.round((completed / assigned) * 100) : 0;
          const cat = (co.category || 'General');
          const cl = cat.toLowerCase();
          const theme = cl.includes('cctv') || cl.includes('camera') ? 't1'
            : cl.includes('network') || cl.includes('wifi') ? 't2'
            : cl.includes('biometric') || cl.includes('attendance') ? 't3'
            : cl.includes('gate') || cl.includes('automation') ? 't4'
            : ['t1', 't2', 't3', 't4', 't5'][i % 5];
          const bico = cl.includes('cctv') || cl.includes('camera') ? ICONS.shield
            : cl.includes('network') || cl.includes('wifi') ? ICONS.link
            : cl.includes('biometric') || cl.includes('attendance') ? ICONS.users
            : cl.includes('gate') || cl.includes('automation') ? ICONS.box
            : ICONS.clipboard;
          const ringC = 2 * Math.PI * 21;
          const ringOff = ringC * (1 - Math.min(pct, 100) / 100);
          return `
          <div class="tr-card tr-in" style="--d:${(0.08 + i * 0.05).toFixed(2)}s">
            <div class="tr-banner ${theme}">
              <div class="tr-pat"></div>
              <div class="tr-bico">${bico}</div>
              ${co.active ? '' : `<span class="tr-hidden">Hidden</span>`}
              <span class="tr-cat">${esc(cat)}</span>
            </div>
            <div class="tr-card-body">
              <h3 class="tr-card-title">${esc(co.title)}</h3>
              <p class="tr-card-desc">${esc(co.description || 'No description')}</p>
              <div class="tr-card-meta">
                <span>${miniIcon(ICONS.inbox)} ${co.lesson_count} lessons</span>
                <span>${miniIcon(ICONS.check)} ${co.quiz_count} quiz</span>
                <span>${miniIcon(ICONS.users)} ${assigned} assigned</span>
              </div>
            </div>
            <div class="tr-card-foot">
              <svg class="tr-ring" width="48" height="48" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="21" fill="none" stroke="var(--border)" stroke-width="5"/>
                <circle cx="24" cy="24" r="21" fill="none" stroke="var(--primary)" stroke-width="5" stroke-linecap="round"
                  stroke-dasharray="${ringC.toFixed(2)}" stroke-dashoffset="${ringOff.toFixed(2)}" transform="rotate(-90 24 24)"/>
                <text x="24" y="28" text-anchor="middle" font-size="11" font-weight="800" fill="var(--text)">${pct}%</text>
              </svg>
              <div class="tr-prog-text">
                <div class="tr-prog-top"><span>${pct >= 100 && assigned ? 'Completed' : completed > 0 ? 'In progress' : 'Completion'}</span><b>${completed}/${assigned || '∞'}</b></div>
                <div class="tr-bar"><div class="tr-bar-fill" data-w="${pct}"></div></div>
              </div>
              <button class="tr-fab tc-progress" data-id="${co.id}" title="Progress">${ICONS.eye}</button>
              <button class="tr-fab tr-fab-ghost tc-manage" data-id="${co.id}" title="Manage">${ICONS.edit}</button>
              <button class="tr-fab tr-fab-danger tc-del" data-id="${co.id}" data-title="${esc(co.title)}" title="Delete">${ICONS.close}</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;

    animateBars(container);
    container.querySelector('#tc-new').onclick = () => openCourseForm(null, load);
    container.querySelectorAll('.tc-manage').forEach(b => b.onclick = () => openCourseEditor(b.dataset.id, load));
    container.querySelectorAll('.tc-progress').forEach(b => b.onclick = () => openCourseEditor(b.dataset.id, load, 'progress'));
    container.querySelectorAll('.tc-del').forEach(b => b.onclick = async () => {
      if (!confirm(`Delete course "${b.dataset.title}" and all its lessons/quiz?`)) return;
      try { await api(`/training/courses/${b.dataset.id}`, { method: 'DELETE', headers: authH() }); toast('Course deleted', 'success'); load(); }
      catch (e) { toast(e.message, 'error'); }
    });
  };
  await load();
}

const statCard = (icon, value, label, color) => `
  <div class="tr-stat">
    <div class="tr-stat-ico" style="color:${color};background:color-mix(in srgb, ${color} 14%, transparent);">${icon}</div>
    <div><div class="tr-stat-num">${value}</div><div class="tr-stat-lbl">${label}</div></div>
  </div>`;
const miniIcon = (svg) => `<span class="tr-mini-ico">${svg}</span>`;

function openCourseForm(course, onSaved) {
  const ov = modal(`
    <div class="modal-header"><span class="modal-title">${ICONS.clipboard}&nbsp; ${course ? 'Edit' : 'New'} Course</span><button class="modal-close" id="x">&times;</button></div>
    <div class="modal-body">
      <div class="form-group tr-fg"><label>Course title</label><input id="cf-title" placeholder="e.g. CCTV Installation Basics" value="${esc(course?.title || '')}"></div>
      <div class="form-group tr-fg"><label>Category</label><input id="cf-cat" list="cf-cats" value="${esc(course?.category || 'General')}">
        <datalist id="cf-cats"><option>General</option><option>CCTV</option><option>Video Door Phone</option><option>Networking</option><option>Biometric</option><option>Customer Handling</option><option>App &amp; Billing</option><option>Safety</option></datalist>
      </div>
      <div class="form-group tr-fg"><label>Description</label><textarea id="cf-desc" rows="3" placeholder="What this course teaches…">${esc(course?.description || '')}</textarea></div>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" id="x2">Cancel</button><button class="btn btn-primary" id="cf-save">${course ? 'Save changes' : 'Create course'}</button></div>`, 520);
  ov.querySelector('#x').onclick = ov.querySelector('#x2').onclick = () => ov.remove();
  ov.querySelector('#cf-save').onclick = async () => {
    const title = ov.querySelector('#cf-title').value.trim();
    if (!title) return toast('Title required', 'info');
    const body = { title, category: ov.querySelector('#cf-cat').value.trim() || 'General', description: ov.querySelector('#cf-desc').value.trim() };
    try {
      if (course) await api(`/training/courses/${course.id}`, { method: 'PATCH', headers: jsonH(), body: JSON.stringify(body) });
      else await api('/training/courses', { method: 'POST', headers: jsonH(), body: JSON.stringify(body) });
      toast('Saved', 'success'); ov.remove(); onSaved && onSaved();
    } catch (e) { toast(e.message, 'error'); }
  };
}

async function openCourseEditor(courseId, onClose, startTab = 'lessons') {
  let data, employees;
  try {
    [data, { data: employees }] = await Promise.all([
      api(`/training/courses/${courseId}/full`, { headers: authH() }),
      supabase.from('profiles').select('id,full_name').eq('role', 'employee'),
    ]);
  } catch (e) { return toast(e.message, 'error'); }
  employees = employees || [];
  const assignedAll = data.assignments.some(a => !a.employee_id);
  const assignedIds = new Set(data.assignments.filter(a => a.employee_id).map(a => a.employee_id));
  const dueDate = data.assignments[0]?.due_date ? String(data.assignments[0].due_date).slice(0, 10) : '';

  const ov = modal(`
    <div class="modal-header"><span class="modal-title">${ICONS.edit}&nbsp; ${esc(data.course.title)}</span><button class="modal-close" id="x">&times;</button></div>
    <div class="modal-body">
      <div class="tr-tabs" role="tablist">
        <button class="tr-tab" data-t="lessons">${miniIcon(ICONS.inbox)}<span>Lessons</span></button>
        <button class="tr-tab" data-t="quiz">${miniIcon(ICONS.check)}<span>Quiz</span></button>
        <button class="tr-tab" data-t="assign">${miniIcon(ICONS.users)}<span>Assign</span></button>
        <button class="tr-tab" data-t="progress">${miniIcon(ICONS.clock)}<span>Progress</span></button>
        <span class="tr-tab-ink"></span>
      </div>

      <div class="ce-pane" data-p="lessons">
        <div id="ce-lessons" class="tr-list"></div>
        <div class="tr-form-card">
          <div class="tr-form-card-h">${miniIcon(ICONS.plus)} Add a lesson</div>
          <div class="form-group tr-fg"><label>Lesson title</label><input id="le-title" placeholder="e.g. How to install a DVR"></div>
          <div class="tr-2col">
            <div class="form-group tr-fg"><label>Type</label><select id="le-type"><option value="video">🎬 Video</option><option value="image">🖼️ Image</option><option value="pdf">📄 PDF / File</option><option value="text">📝 Text only</option></select></div>
            <div class="form-group tr-fg"><label>Media file (optional)</label><input type="file" id="le-file"></div>
          </div>
          <div class="form-group tr-fg"><label>Notes / content</label><textarea id="le-content" rows="2" placeholder="What the employee should learn"></textarea></div>
          <button class="btn btn-primary btn-sm" id="le-add">${miniIcon(ICONS.plus)}<span>Add lesson</span></button>
        </div>
      </div>

      <div class="ce-pane" data-p="quiz" style="display:none;">
        <div class="tr-form-card qx-card">
          <div class="tr-form-card-h">📊 Bulk upload from Excel</div>
          <p class="qx-hint">One file, all question types: <b>mcq</b>, <b>fill</b> (write the blank as <code>___</code>), <b>image</b> (image URL column) and <b>match</b> (pairs as <code>Left=Right</code> in the option columns). Download the sample, fill it the same way, upload — done.</p>
          <div class="qx-actions">
            <button class="btn btn-secondary btn-sm" id="qx-sample">${miniIcon(ICONS.download || ICONS.clipboard)}<span>Download sample Excel</span></button>
            <input type="file" id="qx-file" accept=".xlsx,.xls,.csv" hidden>
            <button class="btn btn-primary btn-sm" id="qx-upload">${miniIcon(ICONS.plus)}<span>Upload Excel</span></button>
          </div>
          <div id="qx-status" class="qx-status"></div>
        </div>

        <div id="ce-quiz" class="tr-list"></div>

        <div class="tr-form-card">
          <div class="tr-form-card-h">${miniIcon(ICONS.plus)} Add a single question</div>
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
          ${[0, 1, 2, 3].map(i => `<div class="tr-opt-row"><input type="radio" name="q-correct" value="${i}" ${i === 0 ? 'checked' : ''} title="Mark correct"><input id="q-opt-${i}" placeholder="Option ${i + 1}${i < 2 ? ' (required)' : ' (optional)'}"></div>`).join('')}
          <button class="btn btn-primary btn-sm" id="q-add" style="margin-top:6px;">${miniIcon(ICONS.plus)}<span>Add question</span></button>
          <p class="qx-hint" style="margin-top:8px;">Need match-the-following? Use the Excel upload above — pairs go in as <code>Left=Right</code>.</p>
        </div>
      </div>

      <div class="ce-pane" data-p="assign" style="display:none;">
        <label class="tr-switch-row"><span><b>Assign to all employees</b><small>Every current &amp; future employee sees this course</small></span>
          <span class="tr-switch"><input type="checkbox" id="as-all" ${assignedAll ? 'checked' : ''}><i></i></span></label>
        <div id="as-list" class="tr-emp-list ${assignedAll ? 'tr-disabled' : ''}">
          ${employees.map(e => `<label class="tr-emp"><input type="checkbox" class="as-emp" value="${e.id}" ${assignedIds.has(e.id) ? 'checked' : ''}><span class="tr-ava">${initials(e.full_name)}</span><span>${esc(e.full_name)}</span></label>`).join('') || '<div style="color:var(--text-dim);padding:8px;">No employees</div>'}
        </div>
        <div class="form-group tr-fg"><label>Due date (optional)</label><input type="date" id="as-due" value="${dueDate}"></div>
        <button class="btn btn-primary btn-sm" id="as-save">${miniIcon(ICONS.check)}<span>Save assignment</span></button>
      </div>

      <div class="ce-pane" data-p="progress" style="display:none;">
        <div id="ce-progress"><div class="tr-loading">Loading activity…</div></div>
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" id="x2">Close</button></div>`, 860);

  const close = () => { ov.remove(); onClose && onClose(); };
  ov.querySelector('#x').onclick = ov.querySelector('#x2').onclick = close;

  const tabs = [...ov.querySelectorAll('.tr-tab')];
  const ink = ov.querySelector('.tr-tab-ink');
  let progressLoaded = false;
  const selectTab = (name) => {
    const tab = tabs.find(t => t.dataset.t === name) || tabs[0];
    tabs.forEach(x => x.classList.toggle('active', x === tab));
    ink.style.width = tab.offsetWidth + 'px';
    ink.style.transform = `translateX(${tab.offsetLeft}px)`;
    ov.querySelectorAll('.ce-pane').forEach(p => {
      const on = p.dataset.p === name;
      p.style.display = on ? 'block' : 'none';
      if (on) { p.classList.remove('tr-pane-anim'); void p.offsetWidth; p.classList.add('tr-pane-anim'); }
    });
    if (name === 'progress' && !progressLoaded) { progressLoaded = true; loadProgress(); }
  };
  tabs.forEach(t => t.onclick = () => selectTab(t.dataset.t));

  const renderLessons = () => {
    const box = ov.querySelector('#ce-lessons');
    box.innerHTML = data.lessons.length ? data.lessons.map((l, i) => `
      <div class="tr-row tr-in" style="--d:${(i * 0.03).toFixed(2)}s">
        <span class="tr-row-num">${i + 1}</span>
        <span class="tr-row-ico">${TYPE_ICON[l.type] || ICONS.clipboard}</span>
        <div class="tr-row-main"><b>${esc(l.title)}</b><span class="tr-chip tr-chip-sm">${esc(l.type)}</span></div>
        <button class="btn btn-icon btn-danger btn-sm le-del" data-id="${l.id}" title="Delete">${ICONS.close}</button>
      </div>`).join('') : '<div class="tr-empty-mini">No lessons yet. Add your first below.</div>';
    box.querySelectorAll('.le-del').forEach(b => b.onclick = async () => {
      try { await api(`/training/lessons/${b.dataset.id}`, { method: 'DELETE', headers: authH() }); data.lessons = data.lessons.filter(x => x.id !== b.dataset.id); renderLessons(); } catch (e) { toast(e.message, 'error'); }
    });
  };
  const renderQuiz = () => {
    const box = ov.querySelector('#ce-quiz');
    box.innerHTML = data.quiz.length ? data.quiz.map((q, i) => {
      const p = parseQ(q.question);
      const meta = QTYPE_META[p.t] || QTYPE_META.mcq;
      const heading = p.t === 'match' ? `${esc(p.gtitle)} — <i>${esc(p.left)}</i>` : esc(p.text);
      return `
      <div class="tr-q tr-in" style="--d:${(i * 0.03).toFixed(2)}s">
        <div class="tr-q-top">
          <b>${i + 1}. ${heading} <span class="qx-chip" style="color:${meta.color};border-color:${meta.color}">${meta.chip}</span></b>
          <button class="btn btn-icon btn-danger btn-sm q-del" data-id="${q.id}" title="Delete">${ICONS.close}</button>
        </div>
        ${p.img ? `<img src="${esc(p.img)}" class="qx-thumb" alt="">` : ''}
        <div class="tr-q-opts">${q.options.map((o, oi) => `<span class="${oi === q.correct_index ? 'tr-q-correct' : ''}">${oi === q.correct_index ? '✓' : '○'} ${esc(o)}</span>`).join('')}</div>
      </div>`;
    }).join('') : '<div class="tr-empty-mini">No quiz questions yet. Upload an Excel or add one below.</div>';
    box.querySelectorAll('.q-del').forEach(b => b.onclick = async () => {
      try { await api(`/training/quiz/${b.dataset.id}`, { method: 'DELETE', headers: authH() }); data.quiz = data.quiz.filter(x => x.id !== b.dataset.id); renderQuiz(); } catch (e) { toast(e.message, 'error'); }
    });
  };
  renderLessons(); renderQuiz();

  ov.querySelector('#le-add').onclick = async () => {
    const title = ov.querySelector('#le-title').value.trim();
    if (!title) return toast('Lesson title required', 'info');
    const btn = ov.querySelector('#le-add'); btn.disabled = true; btn.innerHTML = '<span>Saving…</span>';
    try {
      const file = ov.querySelector('#le-file').files?.[0];
      const media_url = file ? await uploadFile(file) : null;
      const type = ov.querySelector('#le-type').value;
      const content = ov.querySelector('#le-content').value.trim();
      const { id } = await api(`/training/courses/${courseId}/lessons`, { method: 'POST', headers: jsonH(), body: JSON.stringify({ title, type, media_url, content, position: data.lessons.length }) });
      data.lessons.push({ id, title, type, media_url, content });
      ov.querySelector('#le-title').value = ''; ov.querySelector('#le-content').value = ''; ov.querySelector('#le-file').value = '';
      renderLessons(); toast('Lesson added', 'success');
    } catch (e) { toast(e.message, 'error'); }
    btn.disabled = false; btn.innerHTML = `${miniIcon(ICONS.plus)}<span>Add lesson</span>`;
  };

  // Manual add — type-aware (mcq / fill / image with photo upload).
  const qType = ov.querySelector('#q-type');
  qType.onchange = () => {
    ov.querySelector('#q-img-wrap').style.display = qType.value === 'image' ? '' : 'none';
    ov.querySelector('#q-text-hint').textContent = qType.value === 'fill' ? '— write the blank as ___' : '';
  };
  ov.querySelector('#q-add').onclick = async () => {
    const text = ov.querySelector('#q-text').value.trim();
    const options = [0, 1, 2, 3].map(i => ov.querySelector(`#q-opt-${i}`).value.trim()).filter(Boolean);
    if (!text || options.length < 2) return toast('Question and at least 2 options required', 'info');
    const t = qType.value;
    if (t === 'fill' && !/_{2,}/.test(text)) return toast('Fill-in-the-blank questions need a ___ in the question text', 'info');
    const correct_index = Number(ov.querySelector('input[name="q-correct"]:checked')?.value || 0);
    if (correct_index >= options.length) return toast('The marked correct option is empty', 'info');
    const btn = ov.querySelector('#q-add'); btn.disabled = true;
    try {
      let img = null;
      const imgFile = ov.querySelector('#q-img')?.files?.[0];
      if (t === 'image') {
        if (!imgFile) { btn.disabled = false; return toast('Pick an image for the question', 'info'); }
        img = await uploadFile(imgFile);
      }
      const question = t === 'mcq' ? text : packQ({ t, text, img });
      const { id } = await api(`/training/courses/${courseId}/quiz`, { method: 'POST', headers: jsonH(), body: JSON.stringify({ question, options, correct_index, position: data.quiz.length }) });
      data.quiz.push({ id, question, options, correct_index });
      ov.querySelector('#q-text').value = ''; [0, 1, 2, 3].forEach(i => ov.querySelector(`#q-opt-${i}`).value = '');
      if (ov.querySelector('#q-img')) ov.querySelector('#q-img').value = '';
      renderQuiz(); toast('Question added', 'success');
    } catch (e) { toast(e.message, 'error'); }
    btn.disabled = false;
  };

  // Excel bulk upload + sample download.
  ov.querySelector('#qx-sample').onclick = async () => {
    try { await downloadQuizSample(); } catch (e) { toast('Could not build sample: ' + e.message, 'error'); }
  };
  const qxFile = ov.querySelector('#qx-file');
  ov.querySelector('#qx-upload').onclick = () => qxFile.click();
  qxFile.onchange = async () => {
    const file = qxFile.files?.[0];
    if (!file) return;
    const status = ov.querySelector('#qx-status');
    status.innerHTML = '<span class="qx-spin"></span> Reading workbook…';
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const { bodies, errors } = rowsToQuizBodies(rows);
      if (!bodies.length) {
        status.innerHTML = `<span style="color:var(--danger)">No valid questions found.${errors.length ? ' ' + esc(errors[0]) : ''}</span>`;
        qxFile.value = ''; return;
      }
      let added = 0;
      for (const body of bodies) {
        status.innerHTML = `<span class="qx-spin"></span> Uploading question ${added + 1}/${bodies.length}…`;
        const { id } = await api(`/training/courses/${courseId}/quiz`, {
          method: 'POST', headers: jsonH(),
          body: JSON.stringify({ ...body, position: data.quiz.length }),
        });
        data.quiz.push({ id, ...body });
        added++;
      }
      renderQuiz();
      status.innerHTML = `<span style="color:var(--success)">✓ ${added} question${added === 1 ? '' : 's'} added.</span>` +
        (errors.length ? ` <span style="color:var(--warning)">${errors.length} row${errors.length === 1 ? '' : 's'} skipped: ${esc(errors.join(' · '))}</span>` : '');
      toast(`${added} quiz questions uploaded`, 'success');
    } catch (e) {
      status.innerHTML = `<span style="color:var(--danger)">${esc(e.message)}</span>`;
      toast(e.message, 'error');
    }
    qxFile.value = '';
  };

  const asAll = ov.querySelector('#as-all');
  asAll.onchange = () => ov.querySelector('#as-list').classList.toggle('tr-disabled', asAll.checked);
  ov.querySelector('#as-save').onclick = async () => {
    const due_date = ov.querySelector('#as-due').value || null;
    const body = asAll.checked ? { all: true, due_date } : { employee_ids: [...ov.querySelectorAll('.as-emp:checked')].map(c => c.value), due_date };
    try { await api(`/training/courses/${courseId}/assign`, { method: 'POST', headers: jsonH(), body: JSON.stringify(body) }); toast('Assignment saved', 'success'); progressLoaded = false; } catch (e) { toast(e.message, 'error'); }
  };

  async function loadProgress() {
    const box = ov.querySelector('#ce-progress');
    let p;
    try { p = await api(`/training/courses/${courseId}/progress`, { headers: authH() }); }
    catch (e) { box.innerHTML = `<div class="tr-empty-mini" style="color:var(--danger)">${esc(e.message)}</div>`; return; }
    const total = p.lessons.length;
    const emps = p.employees;
    if (!emps.length) { box.innerHTML = '<div class="tr-empty-mini">No employees assigned yet. Use the Assign tab.</div>'; return; }

    const completedCount = emps.filter(e => e.completion?.passed).length;
    const startedCount = emps.filter(e => e.done_count > 0 || e.completion).length;

    box.innerHTML = `
      <div class="tr-prog-summary tr-in">
        <div class="tr-ps-item">${ring(Math.round((completedCount / emps.length) * 100), 64, 7, 'var(--success)')}<div><b>${completedCount}/${emps.length}</b><small>Completed course</small></div></div>
        <div class="tr-ps-divider"></div>
        <div class="tr-ps-mini"><b>${startedCount}</b><small>Started</small></div>
        <div class="tr-ps-mini"><b>${emps.length - startedCount}</b><small>Not started</small></div>
        <div class="tr-ps-mini"><b>${total}</b><small>Lessons</small></div>
        <div class="tr-ps-mini"><b>${p.quizCount}</b><small>Quiz Qs</small></div>
      </div>
      <div class="tr-people">
        ${emps.map((e, i) => {
          const pct = total ? Math.round((e.done_count / total) * 100) : (e.completion?.passed ? 100 : 0);
          const passed = !!e.completion?.passed;
          const status = passed ? ['Completed', 'var(--success)'] : (e.done_count > 0 ? ['In progress', 'var(--warning, #FBBF24)'] : ['Not started', 'var(--text-dim)']);
          const overdue = !passed && e.due_date && new Date(e.due_date) < new Date();
          return `
          <div class="tr-person tr-in" style="--d:${(i * 0.04).toFixed(2)}s" data-emp="${e.employee_id}">
            <div class="tr-person-head">
              <span class="tr-ava tr-ava-lg">${initials(e.name)}</span>
              <div class="tr-person-id">
                <b>${esc(e.name)}</b>
                <div class="tr-person-tags">
                  <span class="tr-dot" style="background:${status[1]}"></span><span>${status[0]}</span>
                  ${e.last_activity ? `· <span title="Last activity">${miniIcon(ICONS.clock)} ${esc(formatDateTime(e.last_activity))}</span>` : ''}
                  ${overdue ? `· <span style="color:var(--danger)">Overdue</span>` : (e.due_date ? `· Due ${esc(formatDate(e.due_date))}` : '')}
                </div>
              </div>
              ${ring(pct, 46, 5, passed ? 'var(--success)' : 'var(--primary)')}
              <button class="btn btn-icon btn-secondary btn-sm tr-person-toggle" title="Timeline">${ICONS.arrowRight}</button>
            </div>
            <div class="tr-timeline" hidden>
              ${total ? e.lessons.map((l, li) => `
                <div class="tr-tl-item ${l.completed_at ? 'done' : ''}">
                  <span class="tr-tl-dot">${l.completed_at ? '✓' : li + 1}</span>
                  <span class="tr-tl-title">${esc(l.title)}</span>
                  <span class="tr-tl-time">${l.completed_at ? esc(formatDateTime(l.completed_at)) : 'Not done'}</span>
                </div>`).join('') : '<div class="tr-tl-item"><span class="tr-tl-title" style="color:var(--text-dim)">No lessons in this course</span></div>'}
              ${p.quizCount ? `
                <div class="tr-tl-item ${passed ? 'done' : ''}">
                  <span class="tr-tl-dot">${passed ? '★' : '?'}</span>
                  <span class="tr-tl-title">Quiz ${passed ? `passed — ${e.completion.quiz_score}%` : 'not passed yet'}</span>
                  <span class="tr-tl-time">${e.completion?.completed_at ? esc(formatDateTime(e.completion.completed_at)) : '—'}</span>
                </div>` : ''}
              <div class="tr-tl-foot">${e.assigned_at ? `Assigned ${esc(formatDateTime(e.assigned_at))}` : ''}${e.first_activity ? ` · First activity ${esc(formatDateTime(e.first_activity))}` : ''}</div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    animateRings(box);
    box.querySelectorAll('.tr-person-toggle').forEach(btn => btn.onclick = () => {
      const person = btn.closest('.tr-person');
      const tl = person.querySelector('.tr-timeline');
      const open = tl.hasAttribute('hidden');
      if (open) { tl.removeAttribute('hidden'); person.classList.add('open'); } else { tl.setAttribute('hidden', ''); person.classList.remove('open'); }
    });
  }

  // initial tab (ink needs layout — defer one frame)
  requestAnimationFrame(() => selectTab(startTab));
}

/* ─────────────────────────── EMPLOYEE ─────────────────────────── */

export async function renderEmployeeCourses(container) {
  const load = async () => {
    container.innerHTML = `<div class="tr-skeleton-grid">${Array.from({ length: 3 }).map(() => '<div class="tr-skeleton-card"></div>').join('')}</div>`;
    let courses;
    try { courses = await api('/training/my', { headers: authH() }); }
    catch (e) { container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--danger)">${esc(e.message)}</div></div>`; return; }

    const totalDone = courses.filter(c => Number(c.completed) > 0).length;
    const avg = courses.length ? Math.round(courses.reduce((s, c) => { const t = c.lesson_count || 0; return s + (t ? (c.done_count / t) * 100 : (Number(c.completed) ? 100 : 0)); }, 0) / courses.length) : 0;

    container.innerHTML = `
      <div class="tr-head tr-in">
        <div>
          <h1 class="tr-title">${ICONS.shield}<span>My Training</span></h1>
          <p class="tr-sub">Your assigned courses, lessons and quizzes — learn at your own pace.</p>
        </div>
      </div>
      ${courses.length ? `<div class="tr-stats tr-in" style="--d:.05s">
        ${statCard(ICONS.shield, courses.length, 'Courses assigned', 'var(--primary)')}
        ${statCard(ICONS.star, totalDone, 'Completed', '#A78BFA')}
        ${statCard(ICONS.clock, avg + '%', 'Average progress', 'var(--amber, #f5a524)')}
      </div>` : ''}
      ${courses.length === 0 ? '<div class="tr-empty card"><div class="card-body" style="text-align:center;padding:40px;color:var(--text-dim)">No courses assigned to you yet. Check back soon!</div></div>'
        : `<div class="tr-grid">
        ${courses.map((co, i) => {
          const total = co.lesson_count || 0;
          const pct = total ? Math.round((co.done_count / total) * 100) : (Number(co.completed) ? 100 : 0);
          const done = Number(co.completed) > 0;
          const cat = (co.category || 'General');
          const cl = cat.toLowerCase();
          const theme = cl.includes('cctv') || cl.includes('camera') ? 't1'
            : cl.includes('network') || cl.includes('wifi') ? 't2'
            : cl.includes('biometric') || cl.includes('attendance') ? 't3'
            : cl.includes('gate') || cl.includes('automation') ? 't4'
            : ['t1', 't2', 't3', 't4', 't5'][i % 5];
          const bico = cl.includes('cctv') || cl.includes('camera') ? ICONS.shield
            : cl.includes('network') || cl.includes('wifi') ? ICONS.link
            : cl.includes('biometric') || cl.includes('attendance') ? ICONS.users
            : cl.includes('gate') || cl.includes('automation') ? ICONS.box
            : ICONS.clipboard;
          const ringC = 2 * Math.PI * 21;
          const ringOff = ringC * (1 - Math.min(pct, 100) / 100);
          return `
          <div class="tr-card tr-card-clickable tr-in" style="--d:${(0.08 + i * 0.05).toFixed(2)}s" data-id="${co.id}">
            <div class="tr-banner ${theme}">
              <div class="tr-pat"></div>
              <div class="tr-bico">${bico}</div>
              <span class="tr-cat">${esc(cat)}</span>
            </div>
            <div class="tr-card-body">
              <h3 class="tr-card-title">${esc(co.title)}</h3>
              <p class="tr-card-desc">${esc(co.description || '')}</p>
              <div class="tr-card-meta">
                <span>${miniIcon(ICONS.inbox)} ${total} lessons</span>
                ${co.quiz_count ? `<span>${miniIcon(ICONS.check)} ${co.quiz_count} quiz</span>` : ''}
                ${!done && co.due_date ? `<span style="color:var(--amber, #f5a524);font-weight:700;">${miniIcon(ICONS.clock)} Due ${formatDate(co.due_date)}</span>` : ''}
              </div>
            </div>
            <div class="tr-card-foot">
              <svg class="tr-ring" width="48" height="48" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="21" fill="none" stroke="var(--border)" stroke-width="5"/>
                <circle cx="24" cy="24" r="21" fill="none" stroke="${done ? 'var(--success)' : 'var(--primary)'}" stroke-width="5" stroke-linecap="round"
                  stroke-dasharray="${ringC.toFixed(2)}" stroke-dashoffset="${ringOff.toFixed(2)}" transform="rotate(-90 24 24)"/>
                <text x="24" y="28" text-anchor="middle" font-size="11" font-weight="800" fill="var(--text)">${pct}%</text>
              </svg>
              <div class="tr-prog-text">
                <div class="tr-prog-top"><span>${done ? 'Completed' : pct > 0 ? 'In progress' : 'Not started'}</span><b>${co.done_count || 0}/${total}</b></div>
                <div class="tr-bar"><div class="tr-bar-fill" data-w="${pct}" style="${done ? 'background:var(--success)' : ''}"></div></div>
              </div>
              <button class="tr-fab" title="${done ? 'Review course' : 'Start / continue'}">${done ? ICONS.eye : ICONS.play}</button>
            </div>
          </div>`;
        }).join('')}</div>`}`;

    animateBars(container);
    container.querySelectorAll('[data-id]').forEach(card => card.onclick = () => openCoursePlayer(card.dataset.id, load));
  };
  await load();
}

async function openCoursePlayer(courseId, onClose) {
  let d;
  try { d = await api(`/training/course/${courseId}`, { headers: authH() }); }
  catch (e) { return toast(e.message, 'error'); }
  const done = new Set(d.doneLessonIds);
  const doneTimes = new Map((d.doneLessons || []).map(x => [x.lesson_id, x.completed_at]));

  const ov = modal(`
    <div class="modal-header"><span class="modal-title">${ICONS.shield}&nbsp; ${esc(d.course.title)}</span><button class="modal-close" id="x">&times;</button></div>
    <div class="modal-body" id="cp-body"></div>
    <div class="modal-footer"><button class="btn btn-secondary" id="x2">Close</button></div>`, 780);
  const close = () => { ov.remove(); onClose && onClose(); };
  ov.querySelector('#x').onclick = ov.querySelector('#x2').onclick = close;
  const body = ov.querySelector('#cp-body');

  const draw = () => {
    const total = d.lessons.length;
    const doneCount = d.lessons.filter(l => done.has(l.id)).length;
    const pct = total ? Math.round((doneCount / total) * 100) : (d.completion ? 100 : 0);

    body.innerHTML = `
      <div class="tr-player-hero">
        ${ring(pct, 76, 8, d.completion ? 'var(--success)' : 'var(--primary)')}
        <div>
          <div class="tr-player-h">${esc(d.course.description || 'Work through each lesson, then take the quiz.')}</div>
          <div class="tr-player-meta">${doneCount}/${total} lessons done${d.quiz.length ? ` · ${d.quiz.length} quiz questions` : ''}</div>
        </div>
      </div>

      <h4 class="tr-section-h">${miniIcon(ICONS.inbox)} Lessons</h4>
      ${d.lessons.map((l, i) => {
        const isDone = done.has(l.id);
        const t = doneTimes.get(l.id);
        return `
        <div class="tr-lesson ${isDone ? 'done' : ''}">
          <div class="tr-lesson-head" data-toggle="${l.id}">
            <span class="tr-lesson-step ${isDone ? 'done' : ''}">${isDone ? '✓' : i + 1}</span>
            <div class="tr-lesson-titles"><b>${esc(l.title)}</b>${isDone && t ? `<small>${miniIcon(ICONS.clock)} Completed ${esc(formatDateTime(t))}</small>` : ''}</div>
            <span class="tr-lesson-caret">${ICONS.arrowRight}</span>
          </div>
          <div class="tr-lesson-body" ${i === 0 && !isDone ? '' : 'hidden'}>
            ${l.content ? `<div class="tr-lesson-text">${esc(l.content)}</div>` : ''}
            ${lessonMedia(l)}
            ${isDone ? '' : `<button class="btn btn-primary btn-sm le-done" data-id="${l.id}" style="margin-top:12px;">${miniIcon(ICONS.check)}<span>Mark complete</span></button>`}
          </div>
        </div>`;
      }).join('') || '<div class="tr-empty-mini">No lessons.</div>'}

      ${d.quiz.length ? (() => {
        // Group match rows (same group id) into one visual unit.
        const units = [];
        const groups = new Map();
        d.quiz.forEach(q => {
          const p = parseQ(q.question);
          if (p.t === 'match' && p.group) {
            if (!groups.has(p.group)) { const u = { t: 'match', gtitle: p.gtitle, rows: [] }; groups.set(p.group, u); units.push(u); }
            groups.get(p.group).rows.push({ q, p });
          } else units.push({ t: p.t, q, p });
        });
        const blank = (q) => {
          // Render fill-in-the-blank text with an inline dropdown at the ___.
          const p = parseQ(q.question);
          const parts = p.text.split(/_{2,}/);
          const sel = `<select class="qz-blank" data-q="${q.id}"><option value="">— choose —</option>${q.options.map((o, oi) => `<option value="${oi}">${esc(o)}</option>`).join('')}</select>`;
          return parts.map(esc).join(sel);
        };
        let n = 0;
        return `
        <h4 class="tr-section-h">${miniIcon(ICONS.check)} Quiz <small style="color:var(--text-dim);font-weight:400;">(pass ≥ 70%)</small></h4>
        ${d.completion ? `<div class="tr-pass-banner">${miniIcon(ICONS.check)} Passed — score ${d.completion.quiz_score}%${d.completion.completed_at ? ` on ${esc(formatDateTime(d.completion.completed_at))}` : ''}</div>` : ''}
        <div class="qz-progress"><span id="qz-done">0</span>/${d.quiz.length} answered<div class="qz-progress-bar"><i id="qz-progress-fill"></i></div></div>
        <div id="cp-quiz">
          ${units.map(u => {
            n++;
            const meta = QTYPE_META[u.t] || QTYPE_META.mcq;
            const chip = `<span class="qz-type" style="color:${meta.color}">${meta.chip}</span>`;
            if (u.t === 'match') return `
              <div class="qz-card">
                <div class="qz-q-head"><span class="qz-num">${n}</span><b>${esc(u.gtitle)}</b>${chip}</div>
                <div class="qz-match">
                  ${u.rows.map(({ q, p }) => `
                    <div class="qz-match-row">
                      <span class="qz-match-left">${esc(p.left)}</span>
                      <span class="qz-match-arrow">⟶</span>
                      <select class="qz-blank qz-match-sel" data-q="${q.id}">
                        <option value="">— select match —</option>
                        ${q.options.map((o, oi) => `<option value="${oi}">${esc(o)}</option>`).join('')}
                      </select>
                    </div>`).join('')}
                </div>
              </div>`;
            if (u.t === 'fill') return `
              <div class="qz-card">
                <div class="qz-q-head"><span class="qz-num">${n}</span><b class="qz-fill-text">${blank(u.q)}</b>${chip}</div>
              </div>`;
            return `
              <div class="qz-card" data-q="${u.q.id}">
                <div class="qz-q-head"><span class="qz-num">${n}</span><b>${esc(u.p.text)}</b>${chip}</div>
                ${u.p.img ? `<img class="qz-img" src="${esc(u.p.img)}" alt="Question image" loading="lazy">` : ''}
                <div class="qz-opts">
                  ${u.q.options.map((o, oi) => `
                    <label class="qz-opt">
                      <input type="radio" name="q-${u.q.id}" value="${oi}">
                      <span class="qz-letter">${'ABCD'[oi] || oi + 1}</span>
                      <span class="qz-opt-text">${esc(o)}</span>
                    </label>`).join('')}
                </div>
              </div>`;
          }).join('')}
        </div>
        <button class="btn btn-primary qz-submit" id="cp-submit">${miniIcon(ICONS.check)}<span>Submit quiz</span></button>
        <div id="cp-result" class="tr-quiz-result"></div>`;
      })() : (total && doneCount === total ? '<div class="tr-pass-banner" style="margin-top:14px;">🎉 All lessons completed!</div>' : '')}
    `;
    animateRings(body);

    body.querySelectorAll('.tr-lesson-head').forEach(h => h.onclick = (ev) => {
      if (ev.target.closest('.le-done')) return;
      const lb = h.nextElementSibling;
      const open = lb.hasAttribute('hidden');
      if (open) lb.removeAttribute('hidden'); else lb.setAttribute('hidden', '');
      h.parentElement.classList.toggle('open', open);
    });

    body.querySelectorAll('.le-done').forEach(b => b.onclick = async (ev) => {
      ev.stopPropagation();
      b.disabled = true;
      try {
        await api(`/training/lessons/${b.dataset.id}/complete`, { method: 'POST', headers: authH() });
        done.add(b.dataset.id);
        doneTimes.set(b.dataset.id, new Date().toISOString());
        toast('Lesson completed', 'success'); draw();
      } catch (e) { toast(e.message, 'error'); b.disabled = false; }
    });

    // Collect answers from radios (mcq/image) and dropdowns (fill/match).
    const collectAnswers = () => {
      const answers = {};
      d.quiz.forEach(q => {
        const radio = body.querySelector(`input[name="q-${q.id}"]:checked`);
        if (radio) { answers[q.id] = Number(radio.value); return; }
        const sel = body.querySelector(`.qz-blank[data-q="${q.id}"]`);
        if (sel && sel.value !== '') answers[q.id] = Number(sel.value);
      });
      return answers;
    };
    const updateProgress = () => {
      const doneEl = body.querySelector('#qz-done');
      const fill = body.querySelector('#qz-progress-fill');
      if (!doneEl) return;
      const count = Object.keys(collectAnswers()).length;
      doneEl.textContent = count;
      if (fill) fill.style.width = (d.quiz.length ? (count / d.quiz.length) * 100 : 0) + '%';
    };

    // visual selection + live progress
    body.querySelectorAll('.qz-opt input').forEach(inp => inp.onchange = () => {
      const card = inp.closest('.qz-card');
      card.querySelectorAll('.qz-opt').forEach(o => o.classList.toggle('sel', o.contains(inp)));
      clearResults();
      updateProgress();
    });
    body.querySelectorAll('.qz-blank').forEach(sel => sel.onchange = () => {
      sel.classList.toggle('filled', sel.value !== '');
      clearResults();
      updateProgress();
    });

    // Clear any previous correct/wrong highlights (used before a fresh grade or on retry).
    const clearResults = () => {
      body.querySelectorAll('.qz-opt').forEach(o => o.classList.remove('correct', 'wrong'));
      body.querySelectorAll('.qz-opt input').forEach(i => { i.disabled = false; });
      body.querySelectorAll('.qz-card').forEach(c => c.classList.remove('qz-correct', 'qz-wrong'));
      body.querySelectorAll('.qz-blank').forEach(s => { s.classList.remove('qz-correct', 'qz-wrong'); s.disabled = false; });
      body.querySelectorAll('.qz-feedback').forEach(el => el.remove());
    };
    // After grading, mark each question right/wrong and reveal the correct answer.
    const renderResults = (results) => {
      clearResults();
      const byId = new Map(d.quiz.map(q => [String(q.id), q]));
      (results || []).forEach(r => {
        const q = byId.get(String(r.id));
        if (!q) return;
        const correctText = q.options[r.correct_index];
        const card = body.querySelector(`.qz-card[data-q="${r.id}"]`);
        if (card) {
          card.classList.add(r.correct ? 'qz-correct' : 'qz-wrong');
          card.querySelectorAll('.qz-opt').forEach(lab => {
            const input = lab.querySelector('input');
            if (!input) return;
            const val = Number(input.value);
            input.disabled = true;
            if (val === r.correct_index) lab.classList.add('correct');
            else if (val === r.chosen && !r.correct) lab.classList.add('wrong');
          });
          if (!r.correct) {
            const fb = document.createElement('div');
            fb.className = 'qz-feedback';
            fb.innerHTML = `${miniIcon(ICONS.check)}<span>Correct answer: <b>${esc(correctText)}</b></span>`;
            card.appendChild(fb);
          }
          return;
        }
        // fill-in-the-blank / match questions use a dropdown instead of a card
        const sel = body.querySelector(`.qz-blank[data-q="${r.id}"]`);
        if (sel) {
          sel.classList.add(r.correct ? 'qz-correct' : 'qz-wrong');
          sel.disabled = true;
          if (!r.correct) {
            const host = sel.closest('.qz-match-row') || sel.closest('.qz-card');
            const fb = document.createElement('span');
            fb.className = 'qz-feedback';
            fb.innerHTML = `${miniIcon(ICONS.check)}<span>Correct: <b>${esc(correctText)}</b></span>`;
            (host || sel.parentElement).appendChild(fb);
          }
        }
      });
    };

    const sub = body.querySelector('#cp-submit');
    if (sub) sub.onclick = async () => {
      const answers = collectAnswers();
      if (Object.keys(answers).length < d.quiz.length) return toast('Please answer all questions', 'info');
      sub.disabled = true; sub.innerHTML = '<span>Submitting…</span>';
      try {
        const r = await api(`/training/course/${courseId}/quiz-submit`, { method: 'POST', headers: jsonH(), body: JSON.stringify({ answers }) });
        renderResults(r.results || []);
        const out = body.querySelector('#cp-result');
        out.className = 'tr-quiz-result ' + (r.passed ? 'pass' : 'fail');
        const wrong = (r.results || []).filter(x => x.correct === false).length;
        out.textContent = r.passed
          ? `✓ Passed! Score ${r.score}%`
          : `Score ${r.score}% — need 70% to pass. ${wrong} answer${wrong === 1 ? '' : 's'} to fix — wrong ones are marked below with the correct answer. Fix them and submit again.`;
        if (r.passed) {
          d.completion = { quiz_score: r.score, completed_at: new Date().toISOString() };
          burstConfetti(ov.querySelector('.modal'));
          toast('Course completed!', 'success');
        } else {
          const firstWrong = body.querySelector('.qz-card.qz-wrong, .qz-blank.qz-wrong');
          if (firstWrong) firstWrong.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } catch (e) { toast(e.message, 'error'); }
      sub.disabled = false; sub.innerHTML = `${miniIcon(ICONS.check)}<span>Submit quiz</span>`;
    };
  };
  draw();
}
