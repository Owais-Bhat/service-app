// Floating "AI Solution Assistant" available on every admin & employee page.
// Tap the button -> chat panel. Claude (via the backend) answers the service
// problem and recommends solution videos for the matched service topic.

const API_BASE = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api' : 'http://localhost:5000/api';

const authH = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
});

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Inline SVGs so the assistant looks right regardless of the shared icon set.
const SVG_SPARK = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.7 4.6L18.3 8 13.7 9.7 12 14l-1.7-4.3L5.7 8l4.6-1.4L12 2zm6.5 9l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4zM6 13l.8 2 2 .8-2 .8L6 19l-.8-2-2-.8 2-.8L6 13z"/></svg>';
const SVG_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';
const SVG_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
const SVG_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7L8 5z"/></svg>';

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
  // A specific video link was set for this topic → embed the player inline.
  if (v.embed) {
    return `<div class="ai-video">
      <div class="ai-video-frame"><iframe src="${esc(v.embed)}" title="${esc(v.title)}" frameborder="0" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>
      <div class="ai-video-title"><span class="ai-yt">${SVG_PLAY}</span>${esc(v.title)}</div>
    </div>`;
  }
  // Otherwise open real YouTube results for this exact service topic.
  if (v.search) {
    return `<a class="ai-video ai-video--link" href="${esc(v.search)}" target="_blank" rel="noopener">
      <span class="ai-yt ai-yt--lg">${SVG_PLAY}</span>
      <span class="ai-video-link-text"><b>${esc(v.title)}</b><span>Watch solution videos on YouTube ↗</span></span>
    </a>`;
  }
  return `<div class="ai-video ai-video--empty">
    <div class="ai-video-title"><span class="ai-yt">${SVG_PLAY}</span>${esc(v.title)}</div>
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
    <button id="ai-assistant-fab" class="ai-fab" type="button" title="AI Solution Assistant" aria-label="Open AI Solution Assistant">
      <span class="ai-fab-icon">${SVG_SPARK}</span>
      <span class="ai-fab-label">AI Assistant</span>
    </button>
    <div id="ai-assistant-panel" class="ai-panel" role="dialog" aria-modal="true" aria-label="AI Solution Assistant">
      <div class="ai-panel-head">
        <div class="ai-panel-id">
          <span class="ai-panel-avatar">${SVG_SPARK}</span>
          <div class="ai-panel-meta">
            <span class="ai-panel-title">AI Solution Assistant</span>
            <span class="ai-panel-status"><span class="ai-panel-dot"></span>Online · powered by AI</span>
          </div>
        </div>
        <button class="ai-panel-close" type="button" aria-label="Close assistant">${SVG_CLOSE}</button>
      </div>
      <div class="ai-panel-body" id="ai-panel-body"></div>
      <form class="ai-panel-input" id="ai-panel-form">
        <input id="ai-panel-text" type="text" autocomplete="off"
          placeholder="Describe the problem, e.g. CCTV shows no signal…" />
        <button type="submit" class="ai-send-btn" aria-label="Send message">${SVG_SEND}</button>
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
    addBubble('assistant', `<p>Hi 👋 I'm your service assistant. Describe the problem you're facing on site and I'll walk you through the fix and point you to a solution video.</p>
      <div class="ai-suggests">
        ${['CCTV shows no signal', 'View CCTV on mobile', 'Weak WiFi at site', 'Door lock not opening']
          .map(s => `<button type="button" class="ai-suggest" data-q="${esc(s)}">${esc(s)}</button>`).join('')}
      </div>`);
  };

  const isOpen = () => panel.classList.contains('ai-panel--open');
  const openPanel = () => {
    panel.classList.add('ai-panel--open');
    fab.classList.add('ai-fab--hidden');
    greet();
    setTimeout(() => input.focus(), 60);
  };
  const closePanel = () => {
    panel.classList.remove('ai-panel--open');
    fab.classList.remove('ai-fab--hidden');
  };

  fab.addEventListener('click', () => (isOpen() ? closePanel() : openPanel()));
  root.querySelector('.ai-panel-close').addEventListener('click', closePanel);
  // Close on Escape for keyboard users.
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) closePanel(); });

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
      thinking.innerHTML = `<p class="ai-error">${esc(err.message || 'Something went wrong. Please try again.')}</p>`;
    }
    scrollDown();
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); ask(); });
}
