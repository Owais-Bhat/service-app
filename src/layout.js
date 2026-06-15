import { signOut, onNotification, supabase } from './supabase.js';
import { initials, toggleTheme } from './utils.js';
import { openNotificationDetail } from './notify-center.js';
import { ICONS } from './icons.js';
import { mountAIAssistant } from './pages/ai-assistant.js';

const LOGO = new URL('./assets/logo.png', import.meta.url).href;

const NOTIF_API = (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
  ? '/api' : 'http://localhost:5000/api';
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` });
let _bellUnsub = null;
let _bellDocBound = false;

export function renderLayout({ user, role, activePage, navItems, onNav, pageContent }) {
  const app = document.getElementById('app');
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const savedTheme = localStorage.getItem('theme') || 'light';

  // Fast path: the portal shell already exists for this role. Keep the shell
  // (so the sidebar keeps its scroll position instead of jumping back to the
  // top on every click) and only refresh the nav state + page content.
  const existing = app.querySelector('.portal-layout');
  if (existing && existing.dataset.role === role) {
    const navEl = document.getElementById('sidebar-nav');
    const keepScroll = navEl ? navEl.scrollTop : 0;
    buildNav(navItems, activePage, onNav);
    if (navEl) navEl.scrollTop = keepScroll;

    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const closeSidebar = () => { sidebar?.classList.remove('open'); overlay?.classList.remove('active'); };
    closeSidebar(); // mobile: close the drawer after choosing a page
    document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', closeSidebar));

    renderPage(pageContent, navItems, activePage);
    return;
  }

  app.innerHTML = `
    <div class="portal-layout" data-role="${role}">
      <div class="portal-mesh bg-mesh" aria-hidden="true">
        <span class="portal-mesh-1 m1"></span>
        <span class="portal-mesh-2 m2"></span>
        <span class="portal-mesh-3 m3"></span>
        <span class="portal-mesh-4 m4"></span>
      </div>
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-logo">
          <div class="sidebar-logo-mark">
            <img src="${LOGO}" alt="" onerror="this.style.display='none';this.parentElement.textContent='N'"/>
          </div>
          <span class="logo-text">
            <b>NEST Portal</b>
            <small>Networking Experts</small>
          </span>
        </div>
        <nav class="sidebar-nav" id="sidebar-nav"></nav>
        <div class="sidebar-footer">
          <div class="user-info">
            <div class="user-avatar">${initials(userName)}</div>
            <div class="user-details">
              <div class="user-name">${userName}</div>
              <div class="user-role">${role}</div>
            </div>
            <button class="logout-btn" id="logout-btn" title="Sign Out">${ICONS.logout}</button>
          </div>
        </div>
      </aside>

      <div class="main-content">
        <div class="topbar">
          <button class="menu-toggle icon-btn" id="menu-toggle" aria-label="Toggle navigation">${ICONS.menu}</button>
          <div class="topbar-title" id="topbar-title"></div>
          <div id="topbar-actions" class="topbar-actions">
            <div class="global-search-wrap">
              <label class="topbar-search" for="portal-nav-search">
                ${ICONS.search}
                <input id="portal-nav-search" type="search" placeholder="Search tickets, customers, pages…" autocomplete="off" />
                <kbd class="search-kbd">/</kbd>
              </label>
              <div class="global-search-results" id="global-search-results" style="display:none;"></div>
            </div>
            <div class="notif-bell-wrap">
              <button class="icon-btn" id="notif-bell" title="Notifications">
                ${ICONS.bell}
                <span class="notif-badge" id="notif-badge" style="display:none;"></span>
              </button>
              <div class="notif-dropdown" id="notif-dropdown" style="display:none;"></div>
            </div>
            <button class="icon-btn theme-toggle-btn" title="Toggle Theme">${savedTheme === 'dark' ? ICONS.sun : ICONS.moon}</button>
          </div>
        </div>
        <div class="page-content" id="page-content"></div>
      </div>
    </div>`;

  buildNav(navItems, activePage, onNav);
  setupGlobalSearch(onNav, role);
  setupBell(onNav);
  mountAIAssistant(); // floating AI assistant — appears once across all portal pages

  app.querySelector('.theme-toggle-btn').addEventListener('click', toggleTheme);

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await signOut();
    location.reload();
  });

  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const toggle = document.getElementById('menu-toggle');

  const closeSidebar = () => { sidebar.classList.remove('open'); overlay.classList.remove('active'); };
  toggle.onclick = () => { sidebar.classList.add('open'); overlay.classList.add('active'); };
  overlay.onclick = closeSidebar;
  document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', closeSidebar));

  renderPage(pageContent, navItems, activePage);
}

function buildNav(navItems, activePage, onNav) {
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = navItems.map(item => {
    if (item.type === 'section') return `<div class="nav-section">${item.label}</div>`;
    const active = item.id === activePage ? 'active' : '';
    const badge = item.badge ? `<span class="nav-badge">${item.badge}</span>` : '';
    return `<div class="nav-item ${active}" data-nav="${item.id}">
      <span class="nav-icon">${item.icon}</span>
      <span style="flex:1">${item.label}</span>
      ${badge}
    </div>`;
  }).join('');

  nav.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => onNav(el.dataset.nav));
  });
}

function renderPage(pageContent, navItems, activePage) {
  const item = navItems.find(n => n.id === activePage);
  const title = item?.label || '';
  const subtitle = activePage === 'dashboard'
    ? 'Live overview of your operations'
    : activePage === 'notifications'
      ? 'Alerts, assignments and updates'
      : activePage === 'profile'
        ? 'Account details and preferences'
        : 'NEST service portal';
  document.getElementById('topbar-title').innerHTML = `<h1>${title}</h1><p>${subtitle}</p>`;
  const container = document.getElementById('page-content');
  container.innerHTML = '';
  container.scrollTop = 0; // new page starts at the top (sidebar scroll is preserved separately)
  if (typeof pageContent === 'function') pageContent(container);
  else container.innerHTML = pageContent || '';
}

// Global search: searches portal pages (sidebar items) + live service requests
// (by ticket no, customer name or phone) and shows a premium results dropdown.
function setupGlobalSearch(onNav, role) {
  const input = document.getElementById('portal-nav-search');
  const results = document.getElementById('global-search-results');
  if (!input || !results) return;

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ticketsPage = 'all-tickets';

  // Pages come straight from the rendered sidebar (respects per-user tab access).
  const pageItems = () => [...document.querySelectorAll('#sidebar-nav .nav-item[data-nav]')].map(el => ({
    id: el.dataset.nav,
    label: (el.querySelector('span:nth-child(2)')?.textContent || el.textContent || '').trim(),
    icon: el.querySelector('.nav-icon')?.innerHTML || '',
  }));

  // Service requests are loaded once, then filtered client-side as you type.
  let inquiriesCache = null;
  let loadingInquiries = false;
  const loadInquiries = async () => {
    if (inquiriesCache || loadingInquiries) return;
    loadingInquiries = true;
    try {
      const { data } = await supabase.from('inquiries')
        .select('id,ticket_no,full_name,phone,service_item,status')
        .order('created_at', { ascending: false });
      inquiriesCache = Array.isArray(data) ? data : [];
    } catch { inquiriesCache = []; }
    loadingInquiries = false;
  };

  const open = () => { results.style.display = 'block'; };
  const close = () => { results.style.display = 'none'; };

  const draw = (q) => {
    const query = q.toLowerCase();
    const pages = pageItems().filter(p => p.label.toLowerCase().includes(query)).slice(0, 6);
    const reqs = (inquiriesCache || []).filter(r =>
      (r.ticket_no || '').toLowerCase().includes(query) ||
      (r.full_name || '').toLowerCase().includes(query) ||
      (r.phone || '').toLowerCase().includes(query) ||
      (r.service_item || '').toLowerCase().includes(query)
    ).slice(0, 6);

    if (!query) { close(); return; }
    if (!pages.length && !reqs.length) {
      results.innerHTML = `<div class="gs-empty">No results for "${esc(q)}"${inquiriesCache ? '' : ' — still loading…'}</div>`;
      open();
      return;
    }

    results.innerHTML = `
      ${pages.length ? `<div class="gs-group"><div class="gs-group-label">Pages</div>${pages.map(p => `
        <button class="gs-item" data-type="page" data-id="${esc(p.id)}">
          <span class="gs-ico">${p.icon}</span><span class="gs-text">${esc(p.label)}</span>
        </button>`).join('')}</div>` : ''}
      ${reqs.length ? `<div class="gs-group"><div class="gs-group-label">Service Requests</div>${reqs.map(r => `
        <button class="gs-item" data-type="req" data-id="${esc(r.id)}">
          <span class="gs-ico">${ICONS.ticket}</span>
          <span class="gs-text"><b>${esc(r.full_name || 'Client')}</b><small>${esc(r.ticket_no || '')}${r.service_item ? ' · ' + esc(r.service_item) : ''}</small></span>
          <span class="gs-badge">${esc(r.status || '')}</span>
        </button>`).join('')}</div>` : ''}
    `;
    open();

    results.querySelectorAll('.gs-item').forEach(btn => btn.onclick = () => {
      const type = btn.dataset.type;
      input.value = '';
      close();
      if (type === 'page') onNav(btn.dataset.id);
      else {
        // Hand the chosen ticket to the tickets page so it can focus it.
        try { localStorage.setItem('search_focus_ticket', btn.dataset.id); } catch {}
        onNav(ticketsPage);
      }
    });
  };

  let t = null;
  input.addEventListener('input', () => {
    const q = input.value.trim();
    loadInquiries().then(() => { if (input.value.trim() === q) draw(q); });
    clearTimeout(t);
    t = setTimeout(() => draw(q), 120);
  });
  input.addEventListener('focus', () => { loadInquiries(); if (input.value.trim()) draw(input.value.trim()); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; close(); input.blur(); } });

  // Close when clicking outside; "/" anywhere focuses the search.
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.global-search-wrap')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== input && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) {
      e.preventDefault(); input.focus();
    }
  });
}

// Notification bell: unread badge + dropdown of recent items, live-updated.
function setupBell(onNav) {
  const bell = document.getElementById('notif-bell');
  const badge = document.getElementById('notif-badge');
  const dd = document.getElementById('notif-dropdown');
  if (!bell || !badge || !dd) return;

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (s) => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };

  const setBadge = (n) => {
    if (n > 0) { badge.textContent = n > 99 ? '99+' : String(n); badge.style.display = 'flex'; }
    else badge.style.display = 'none';
  };

  const loadCount = async () => {
    try {
      const r = await fetch(`${NOTIF_API}/notifications/unread-count`, { headers: authH() });
      const d = await r.json();
      setBadge(d.unread || 0);
    } catch { /* ignore */ }
  };

  const renderList = (items) => {
    if (!items.length) { dd.innerHTML = '<div class="notif-empty">No notifications yet</div>'; return; }
    dd.innerHTML = `
      <div class="notif-head"><b>Notifications</b><button class="notif-link" id="notif-readall">Mark all read</button></div>
      <div class="notif-list">
        ${items.slice(0, 12).map(it => `
          <div class="notif-item ${it.read_at ? '' : 'unread'}" data-id="${it.id}">
            <div class="notif-item-title">${esc(it.title || 'Update')}</div>
            <div class="notif-item-body">${esc(it.body || '')}</div>
            <div class="notif-item-time">${fmt(it.created_at)}</div>
          </div>`).join('')}
      </div>
      <div class="notif-foot"><button class="notif-link" id="notif-viewall">View all notifications</button></div>`;
    dd.querySelector('#notif-readall').onclick = async (e) => {
      e.stopPropagation();
      try { await fetch(`${NOTIF_API}/notifications/read-all`, { method: 'POST', headers: authH() }); } catch {}
      open(); loadCount();
    };
    dd.querySelector('#notif-viewall').onclick = (e) => { e.stopPropagation(); dd.style.display = 'none'; onNav('notifications'); };
    dd.querySelectorAll('.notif-item').forEach(el => el.onclick = async () => {
      const it = items.find(i => String(i.id) === String(el.dataset.id));
      if (it) { dd.style.display = 'none'; openNotificationDetail(it); }
      if (el.classList.contains('unread')) {
        try { await fetch(`${NOTIF_API}/notifications/${el.dataset.id}/read`, { method: 'POST', headers: authH() }); } catch {}
        el.classList.remove('unread'); loadCount();
      }
    });
  };

  const open = async () => {
    dd.style.display = 'block';
    dd.innerHTML = '<div class="notif-empty">Loading…</div>';
    try {
      const r = await fetch(`${NOTIF_API}/notifications`, { headers: authH() });
      const d = await r.json();
      renderList(d.items || []);
      setBadge(d.unread || 0);
    } catch { dd.innerHTML = '<div class="notif-empty">Could not load</div>'; }
  };

  bell.onclick = (e) => {
    e.stopPropagation();
    dd.style.display === 'block' ? (dd.style.display = 'none') : open();
  };

  if (!_bellDocBound) {
    document.addEventListener('click', (e) => {
      const d = document.getElementById('notif-dropdown');
      const b = document.getElementById('notif-bell');
      if (d && b && !d.contains(e.target) && !b.contains(e.target)) d.style.display = 'none';
    });
    _bellDocBound = true;
  }

  // Live: bump the badge whenever any notification arrives.
  if (_bellUnsub) { try { _bellUnsub(); } catch {} _bellUnsub = null; }
  _bellUnsub = onNotification(null, () => {
    loadCount();
    if (document.getElementById('notif-dropdown')?.style.display === 'block') open();
  });

  loadCount();
}
