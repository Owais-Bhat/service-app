// Floating "AI Solution Assistant" available on every admin & employee page.
// Tap the button -> chat panel. Claude (via the backend) answers the service
// problem and recommends solution videos from the YouTube catalog.
import { ICONS } from '../icons.js';

const API_BASE = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api' : 'http://localhost:5000/api';

const authH = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
});

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Very light markdown -> HTML: paragraphs, bullets and **bold**. Input is
// escaped first so model output can never inject HTML.
function renderAnswer(text) {
  const safe = esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const lines = safe.split('\n');
  let html = '', inList = false;
  for (const line of lines) {
    const t = line.trim();
    if (/^[-*•]\s+/.test(t)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${t.replace(/^[-*•]\s+/, '')}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      if (t) html += `<p>${t}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html || `<p>${safe}</p>`;
}

function videoCard(v) {
  // A specific video was pasted into the catalog → embed it.
  if (v.embed) {
    return `<div class="ai-video">
      <div class="ai-video-frame"><iframe src="${esc(v.embed)}" title="${esc(v.title)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>
      <div class="ai-video-title">${ICONS.play || '▶'} ${esc(v.title)}</div>
    </div>`;
  }
  // No specific video yet → open real YouTube results for this service topic.
  if (v.search) {
    return `<a class="ai-video ai-video--link" href="${esc(v.search)}" target="_blank" rel="noopener">
      <span class="ai-video-play">${ICONS.play || '▶'}</span>
      <span class="ai-video-link-text"><b>${esc(v.title)}</b><span>Watch solution videos on YouTube</span></span>
    </a>`;
  }
  return `<div class="ai-video ai-video--empty">
    <div class="ai-video-title">${ICONS.play || '▶'} ${esc(v.title)}</div>
    <div class="ai-video-note">Video coming soon.</div>
  </div>`;
}

let mounted = false;
let conversation = []; // {role, content}

export function mountAIAssistant() {
  if (mounted || document.getElementById('ai-assistant-fab')) return;
  mounted = true;

  const root = document.createElement('div');
  root.id = 'ai-assistant-root';
  root.innerHTML = `
    <button id="ai-assistant-fab" class="ai-fab" title="AI Solution Assistant" aria-label="Open AI Solution Assistant">
      <span class="ai-fab-icon">${ICONS.sparkles || ICONS.star || '✨'}</span>
      <span class="ai-fab-label">AI Assistant</span>
    </button>
    <div id="ai-assistant-panel" class="ai-panel" role="dialog" aria-label="AI Solution Assistant" hidden>
      <div class="ai-panel-head">
        <div class="ai-panel-title"><span class="ai-panel-dot"></span> AI Solution Assistant</div>
        <button class="ai-panel-close icon-btn" aria-label="Close">${ICONS.close || '✕'}</button>
      </div>
      <div class="ai-panel-body" id="ai-panel-body"></div>
      <form class="ai-panel-input" id="ai-panel-form">
        <input id="ai-panel-text" type="text" autocomplete="off"
          placeholder="Describe the problem, e.g. CCTV shows no signal…" />
        <button type="submit" class="ai-send-btn" aria-label="Send">${ICONS.send || '➤'}</button>
      </form>
    </div>`;
  document.body.appendChild(root);

  const fab = root.querySelector('#ai-assistant-fab');
  const panel = root.querySelector('#ai-assistant-panel');
  const body = root.querySelector('#ai-panel-body');
  const form = root.querySelector('#ai-panel-form');
  const input = root.querySelector('#ai-panel-text');

  const scrollDown = () => { body.scrollTop = body.scrollHeight; };

  const addBubble = (role, html) => {
    const el = document.createElement('div');
    el.className = `ai-msg ai-msg--${role}`;
    el.innerHTML = html;
    body.appendChild(el);
    scrollDown();
    return el;
  };

  const greet = () => {
    if (body.childElementCount) return;
    addBubble('assistant', `<p>Hi! I'm your service assistant. Tell me the problem you're facing on site and I'll walk you through the fix and show a solution video.</p>
      <div class="ai-suggests">
        ${['CCTV shows no signal', 'Set up CCTV on mobile', 'Weak WiFi at site', 'Crimp an RJ45 cable']
          .map(s => `<button type="button" class="ai-suggest" data-q="${esc(s)}">${esc(s)}</button>`).join('')}
      </div>`);
  };

  const openPanel = () => {
    panel.hidden = false;
    fab.classList.add('ai-fab--open');
    greet();
    setTimeout(() => input.focus(), 50);
  };
  const closePanel = () => { panel.hidden = true; fab.classList.remove('ai-fab--open'); };

  fab.addEventListener('click', () => (panel.hidden ? openPanel() : closePanel()));
  root.querySelector('.ai-panel-close').addEventListener('click', closePanel);

  // Suggestion chips (event-delegated).
  body.addEventListener('click', (e) => {
    const chip = e.target.closest('.ai-suggest');
    if (chip) { input.value = chip.dataset.q; ask(); }
  });

  async function ask() {
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    addBubble('user', `<p>${esc(q)}</p>`);
    conversation.push({ role: 'user', content: q });

    const thinking = addBubble('assistant', `<div class="ai-typing"><span></span><span></span><span></span></div>`);

    try {
      const r = await fetch(`${API_BASE}/ai/assistant`, {
        method: 'POST',
        headers: authH(),
        body: JSON.stringify({ messages: conversation }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Request failed');

      conversation.push({ role: 'assistant', content: d.answer || '' });
      const videosHtml = (d.videos || []).map(videoCard).join('');
      thinking.innerHTML = renderAnswer(d.answer || 'No answer.') + videosHtml;
    } catch (err) {
      thinking.innerHTML = `<p class="ai-error">${esc(err.message || 'Something went wrong.')}</p>`;
    }
    scrollDown();
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); ask(); });
}
