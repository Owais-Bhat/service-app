// Comprehensive Training — Courses → Lessons + Quiz, progress, assignments.
import { supabase } from '../supabase.js';
import { toast, formatDate } from '../utils.js';
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

const modal = (inner, maxW = 720) => {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal" style="max-width:${maxW}px">${inner}</div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  return ov;
};

const lessonMedia = (l) => {
  if (!l.media_url) return '';
  const url = esc(l.media_url);
  if (l.type === 'video') return `<video src="${url}" controls style="width:100%;max-height:340px;border-radius:10px;margin-top:8px;"></video>`;
  if (l.type === 'image') return `<img src="${url}" style="width:100%;max-height:340px;object-fit:contain;border-radius:10px;margin-top:8px;">`;
  return `<a href="${url}" target="_blank" class="btn btn-secondary btn-sm" style="margin-top:8px;">${ICONS.download || ''}<span>Open file</span></a>`;
};

/* ───────────────────────────── ADMIN ───────────────────────────── */

export async function renderTrainingCoursesAdmin(container) {
  const load = async () => {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim)">Loading…</div>';
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

    container.innerHTML = `
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div><h1>Training Courses</h1><p>Build courses with lessons & quizzes, assign them, track completion</p></div>
        <button class="btn btn-primary" id="tc-new">${ICONS.upload}<span>New Course</span></button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-bottom:24px;">
        ${courses.length === 0 ? '<div style="color:var(--text-dim);padding:20px;">No courses yet. Create your first course.</div>'
          : courses.map(co => `
          <div class="card" style="display:flex;flex-direction:column;">
            <div class="card-body" style="flex:1;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                <span class="badge" style="background:var(--bg-soft);">${esc(co.category || 'General')}</span>
                <span class="badge badge-${co.active ? 'resolved' : 'closed'}">${co.active ? 'Active' : 'Hidden'}</span>
              </div>
              <h3 style="margin:10px 0 6px;font-size:1rem;">${esc(co.title)}</h3>
              <p style="font-size:0.84rem;color:var(--text-soft);margin:0 0 12px;min-height:34px;">${esc(co.description || '')}</p>
              <div style="font-size:0.78rem;color:var(--text-dim);">📚 ${co.lesson_count} lessons · ❓ ${co.quiz_count} quiz · 👥 ${co.assign_count} assigned</div>
            </div>
            <div style="display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--border);">
              <button class="btn btn-secondary btn-sm tc-manage" data-id="${co.id}" style="flex:1;">Manage</button>
              <button class="btn btn-danger btn-sm tc-del" data-id="${co.id}" data-title="${esc(co.title)}">Delete</button>
            </div>
          </div>`).join('')}
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">Completion Overview</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Course</th><th>Category</th><th>Lessons</th><th style="text-align:right">Completed by</th></tr></thead>
          <tbody>${compliance.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-dim)">No data</td></tr>'
            : compliance.map(r => `<tr><td>${esc(r.title)}</td><td>${esc(r.category || '')}</td><td>${r.lessons}</td><td style="text-align:right"><b style="color:var(--success)">${r.completed}</b> employee(s)</td></tr>`).join('')}
          </tbody>
        </table></div>
      </div>`;

    container.querySelector('#tc-new').onclick = () => openCourseForm(null, load);
    container.querySelectorAll('.tc-manage').forEach(b => b.onclick = () => openCourseEditor(b.dataset.id, load));
    container.querySelectorAll('.tc-del').forEach(b => b.onclick = async () => {
      if (!confirm(`Delete course "${b.dataset.title}" and all its lessons/quiz?`)) return;
      try { await api(`/training/courses/${b.dataset.id}`, { method: 'DELETE', headers: authH() }); toast('Course deleted', 'success'); load(); }
      catch (e) { toast(e.message, 'error'); }
    });
  };
  await load();
}

function openCourseForm(course, onSaved) {
  const ov = modal(`
    <div class="modal-header"><span class="modal-title">${course ? 'Edit' : 'New'} Course</span><button class="modal-close" id="x">&times;</button></div>
    <div class="modal-body">
      <div class="form-group"><label>Title</label><input id="cf-title" value="${esc(course?.title || '')}"></div>
      <div class="form-group"><label>Category</label><input id="cf-cat" list="cf-cats" value="${esc(course?.category || 'General')}">
        <datalist id="cf-cats"><option>General</option><option>CCTV</option><option>Video Door Phone</option><option>Networking</option><option>Biometric</option><option>Customer Handling</option><option>App & Billing</option><option>Safety</option></datalist>
      </div>
      <div class="form-group"><label>Description</label><textarea id="cf-desc" rows="3">${esc(course?.description || '')}</textarea></div>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" id="x2">Cancel</button><button class="btn btn-primary" id="cf-save">Save</button></div>`, 520);
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

async function openCourseEditor(courseId, onClose) {
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
    <div class="modal-header"><span class="modal-title">Manage: ${esc(data.course.title)}</span><button class="modal-close" id="x">&times;</button></div>
    <div class="modal-body">
      <div class="mst-tabs" role="tablist" style="margin-bottom:14px;">
        <button class="mst-tab active" data-t="lessons">Lessons</button>
        <button class="mst-tab" data-t="quiz">Quiz</button>
        <button class="mst-tab" data-t="assign">Assign</button>
      </div>

      <div class="ce-pane" data-p="lessons">
        <div id="ce-lessons"></div>
        <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">
        <div class="form-group"><label>New lesson title</label><input id="le-title" placeholder="e.g. How to install a DVR"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="form-group"><label>Type</label><select id="le-type"><option value="video">Video</option><option value="image">Image</option><option value="pdf">PDF/File</option><option value="text">Text only</option></select></div>
          <div class="form-group"><label>Media file (optional)</label><input type="file" id="le-file"></div>
        </div>
        <div class="form-group"><label>Notes / content</label><textarea id="le-content" rows="2" placeholder="What the employee should learn"></textarea></div>
        <button class="btn btn-secondary btn-sm" id="le-add">Add lesson</button>
      </div>

      <div class="ce-pane" data-p="quiz" style="display:none;">
        <div id="ce-quiz"></div>
        <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">
        <div class="form-group"><label>Question</label><input id="q-text" placeholder="Type the question"></div>
        ${[0, 1, 2, 3].map(i => `<div class="form-group" style="margin-bottom:6px;"><label style="display:flex;align-items:center;gap:8px;font-weight:600;"><input type="radio" name="q-correct" value="${i}" ${i === 0 ? 'checked' : ''}> Option ${i + 1} ${i < 2 ? '(required)' : '(optional)'}</label><input id="q-opt-${i}" placeholder="Option ${i + 1}"></div>`).join('')}
        <button class="btn btn-secondary btn-sm" id="q-add">Add question</button>
      </div>

      <div class="ce-pane" data-p="assign" style="display:none;">
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-weight:700;"><input type="checkbox" id="as-all" ${assignedAll ? 'checked' : ''}> Assign to all employees</label>
        <div id="as-list" style="max-height:220px;overflow:auto;border:1px solid var(--border);border-radius:10px;padding:8px;margin-bottom:12px;${assignedAll ? 'opacity:.5;pointer-events:none;' : ''}">
          ${employees.map(e => `<label style="display:flex;align-items:center;gap:8px;padding:5px 4px;"><input type="checkbox" class="as-emp" value="${e.id}" ${assignedIds.has(e.id) ? 'checked' : ''}> ${esc(e.full_name)}</label>`).join('') || '<div style="color:var(--text-dim);padding:8px;">No employees</div>'}
        </div>
        <div class="form-group"><label>Due date (optional)</label><input type="date" id="as-due" value="${dueDate}"></div>
        <button class="btn btn-primary btn-sm" id="as-save">Save assignment</button>
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" id="x2">Close</button></div>`, 720);

  const close = () => { ov.remove(); onClose && onClose(); };
  ov.querySelector('#x').onclick = ov.querySelector('#x2').onclick = close;
  ov.querySelectorAll('.mst-tab').forEach(t => t.onclick = () => {
    ov.querySelectorAll('.mst-tab').forEach(x => x.classList.toggle('active', x === t));
    ov.querySelectorAll('.ce-pane').forEach(p => p.style.display = p.dataset.p === t.dataset.t ? 'block' : 'none');
  });

  const renderLessons = () => {
    const box = ov.querySelector('#ce-lessons');
    box.innerHTML = data.lessons.length ? data.lessons.map((l, i) => `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;">
        <div><b style="font-size:0.88rem;">${i + 1}. ${esc(l.title)}</b> <span class="badge" style="background:var(--bg-soft);">${esc(l.type)}</span></div>
        <button class="btn btn-danger btn-sm le-del" data-id="${l.id}">✕</button>
      </div>`).join('') : '<div style="color:var(--text-dim);font-size:0.85rem;">No lessons yet.</div>';
    box.querySelectorAll('.le-del').forEach(b => b.onclick = async () => {
      try { await api(`/training/lessons/${b.dataset.id}`, { method: 'DELETE', headers: authH() }); data.lessons = data.lessons.filter(x => x.id !== b.dataset.id); renderLessons(); } catch (e) { toast(e.message, 'error'); }
    });
  };
  const renderQuiz = () => {
    const box = ov.querySelector('#ce-quiz');
    box.innerHTML = data.quiz.length ? data.quiz.map((q, i) => `
      <div style="padding:8px 10px;border:1px solid var(--border);border-radius:10px;margin-bottom:6px;">
        <div style="display:flex;justify-content:space-between;gap:8px;"><b style="font-size:0.86rem;">${i + 1}. ${esc(q.question)}</b><button class="btn btn-danger btn-sm q-del" data-id="${q.id}">✕</button></div>
        <div style="font-size:0.78rem;color:var(--text-dim);margin-top:4px;">${q.options.map((o, oi) => `${oi === q.correct_index ? '✅' : '•'} ${esc(o)}`).join(' &nbsp; ')}</div>
      </div>`).join('') : '<div style="color:var(--text-dim);font-size:0.85rem;">No quiz questions yet.</div>';
    box.querySelectorAll('.q-del').forEach(b => b.onclick = async () => {
      try { await api(`/training/quiz/${b.dataset.id}`, { method: 'DELETE', headers: authH() }); data.quiz = data.quiz.filter(x => x.id !== b.dataset.id); renderQuiz(); } catch (e) { toast(e.message, 'error'); }
    });
  };
  renderLessons(); renderQuiz();

  ov.querySelector('#le-add').onclick = async () => {
    const title = ov.querySelector('#le-title').value.trim();
    if (!title) return toast('Lesson title required', 'info');
    const btn = ov.querySelector('#le-add'); btn.disabled = true; btn.textContent = 'Saving…';
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
    btn.disabled = false; btn.textContent = 'Add lesson';
  };

  ov.querySelector('#q-add').onclick = async () => {
    const question = ov.querySelector('#q-text').value.trim();
    const options = [0, 1, 2, 3].map(i => ov.querySelector(`#q-opt-${i}`).value.trim()).filter(Boolean);
    if (!question || options.length < 2) return toast('Question and at least 2 options required', 'info');
    const correct_index = Number(ov.querySelector('input[name="q-correct"]:checked')?.value || 0);
    try {
      const { id } = await api(`/training/courses/${courseId}/quiz`, { method: 'POST', headers: jsonH(), body: JSON.stringify({ question, options, correct_index, position: data.quiz.length }) });
      data.quiz.push({ id, question, options, correct_index });
      ov.querySelector('#q-text').value = ''; [0, 1, 2, 3].forEach(i => ov.querySelector(`#q-opt-${i}`).value = '');
      renderQuiz(); toast('Question added', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  const asAll = ov.querySelector('#as-all');
  asAll.onchange = () => { const l = ov.querySelector('#as-list'); l.style.opacity = asAll.checked ? '.5' : '1'; l.style.pointerEvents = asAll.checked ? 'none' : 'auto'; };
  ov.querySelector('#as-save').onclick = async () => {
    const due_date = ov.querySelector('#as-due').value || null;
    const body = asAll.checked ? { all: true, due_date } : { employee_ids: [...ov.querySelectorAll('.as-emp:checked')].map(c => c.value), due_date };
    try { await api(`/training/courses/${courseId}/assign`, { method: 'POST', headers: jsonH(), body: JSON.stringify(body) }); toast('Assignment saved', 'success'); } catch (e) { toast(e.message, 'error'); }
  };
}

/* ─────────────────────────── EMPLOYEE ─────────────────────────── */

export async function renderEmployeeCourses(container) {
  const load = async () => {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim)">Loading…</div>';
    let courses;
    try { courses = await api('/training/my', { headers: authH() }); }
    catch (e) { container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--danger)">${esc(e.message)}</div></div>`; return; }

    container.innerHTML = `
      <div class="page-header"><div><h1>Training</h1><p>Your assigned courses and progress</p></div></div>
      ${courses.length === 0 ? '<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:var(--text-dim)">No courses assigned to you yet.</div></div>'
        : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">
        ${courses.map(co => {
          const total = co.lesson_count || 0;
          const pct = total ? Math.round((co.done_count / total) * 100) : (Number(co.completed) ? 100 : 0);
          const done = Number(co.completed) > 0;
          return `
          <div class="card" style="display:flex;flex-direction:column;cursor:pointer;" data-id="${co.id}">
            <div class="card-body" style="flex:1;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                <span class="badge" style="background:var(--bg-soft);">${esc(co.category || 'General')}</span>
                ${done ? '<span class="badge badge-resolved">✓ Completed</span>' : (co.due_date ? `<span class="badge badge-medium">Due ${formatDate(co.due_date)}</span>` : '')}
              </div>
              <h3 style="margin:10px 0 6px;font-size:1rem;">${esc(co.title)}</h3>
              <p style="font-size:0.84rem;color:var(--text-soft);margin:0 0 12px;min-height:34px;">${esc(co.description || '')}</p>
              <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:6px;">📚 ${total} lessons${co.quiz_count ? ` · ❓ ${co.quiz_count} quiz` : ''}</div>
              <div style="height:8px;background:var(--bg-soft);border-radius:6px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:${done ? 'var(--success)' : 'var(--primary)'};"></div></div>
              <div style="font-size:0.74rem;color:var(--text-dim);margin-top:4px;">${pct}% complete</div>
            </div>
            <div style="padding:12px 16px;border-top:1px solid var(--border);"><button class="btn btn-primary btn-sm" style="width:100%;">${done ? 'Review' : 'Start / Continue'}</button></div>
          </div>`;
        }).join('')}</div>`}`;

    container.querySelectorAll('[data-id]').forEach(card => card.onclick = () => openCoursePlayer(card.dataset.id, load));
  };
  await load();
}

async function openCoursePlayer(courseId, onClose) {
  let d;
  try { d = await api(`/training/course/${courseId}`, { headers: authH() }); }
  catch (e) { return toast(e.message, 'error'); }
  const done = new Set(d.doneLessonIds);

  const ov = modal(`
    <div class="modal-header"><span class="modal-title">${esc(d.course.title)}</span><button class="modal-close" id="x">&times;</button></div>
    <div class="modal-body" id="cp-body"></div>
    <div class="modal-footer"><button class="btn btn-secondary" id="x2">Close</button></div>`, 760);
  const close = () => { ov.remove(); onClose && onClose(); };
  ov.querySelector('#x').onclick = ov.querySelector('#x2').onclick = close;
  const body = ov.querySelector('#cp-body');

  const draw = () => {
    body.innerHTML = `
      ${d.course.description ? `<p style="color:var(--text-soft);margin-bottom:16px;">${esc(d.course.description)}</p>` : ''}
      <h4 style="margin:0 0 10px;">Lessons</h4>
      ${d.lessons.map((l, i) => `
        <div style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <b>${i + 1}. ${esc(l.title)}</b>
            ${done.has(l.id) ? '<span class="badge badge-resolved">✓ Done</span>' : `<button class="btn btn-secondary btn-sm le-done" data-id="${l.id}">Mark complete</button>`}
          </div>
          ${l.content ? `<div style="font-size:0.86rem;color:var(--text-soft);margin-top:6px;white-space:pre-wrap;">${esc(l.content)}</div>` : ''}
          ${lessonMedia(l)}
        </div>`).join('') || '<div style="color:var(--text-dim);">No lessons.</div>'}

      ${d.quiz.length ? `
        <h4 style="margin:18px 0 10px;">Quiz <small style="color:var(--text-dim);font-weight:400;">(pass ≥ 70%)</small></h4>
        ${d.completion ? `<div class="badge badge-resolved" style="margin-bottom:10px;">Passed — score ${d.completion.quiz_score}%</div>` : ''}
        <div id="cp-quiz">
          ${d.quiz.map((q, qi) => `
            <div style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;">
              <b style="font-size:0.9rem;">${qi + 1}. ${esc(q.question)}</b>
              <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">
                ${q.options.map((o, oi) => `<label style="display:flex;align-items:center;gap:8px;font-size:0.86rem;"><input type="radio" name="q-${q.id}" value="${oi}"> ${esc(o)}</label>`).join('')}
              </div>
            </div>`).join('')}
        </div>
        <button class="btn btn-primary" id="cp-submit">Submit quiz</button>
        <div id="cp-result" style="margin-top:10px;font-weight:700;"></div>
      ` : (d.lessons.length && d.lessons.every(l => done.has(l.id)) ? '<div class="badge badge-resolved" style="margin-top:14px;">All lessons completed ✓</div>' : '')}
    `;

    body.querySelectorAll('.le-done').forEach(b => b.onclick = async () => {
      try { await api(`/training/lessons/${b.dataset.id}/complete`, { method: 'POST', headers: authH() }); done.add(b.dataset.id); draw(); }
      catch (e) { toast(e.message, 'error'); }
    });
    const sub = body.querySelector('#cp-submit');
    if (sub) sub.onclick = async () => {
      const answers = {};
      d.quiz.forEach(q => { const sel = body.querySelector(`input[name="q-${q.id}"]:checked`); if (sel) answers[q.id] = Number(sel.value); });
      if (Object.keys(answers).length < d.quiz.length) return toast('Please answer all questions', 'info');
      sub.disabled = true; sub.textContent = 'Submitting…';
      try {
        const r = await api(`/training/course/${courseId}/quiz-submit`, { method: 'POST', headers: jsonH(), body: JSON.stringify({ answers }) });
        const out = body.querySelector('#cp-result');
        out.style.color = r.passed ? 'var(--success)' : 'var(--danger)';
        out.textContent = r.passed ? `✓ Passed! Score ${r.score}%` : `Score ${r.score}% — need 70% to pass. Review and retry.`;
        if (r.passed) { d.completion = { quiz_score: r.score }; toast('Course completed!', 'success'); }
      } catch (e) { toast(e.message, 'error'); }
      sub.disabled = false; sub.textContent = 'Submit quiz';
    };
  };
  draw();
}
