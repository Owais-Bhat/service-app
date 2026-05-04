import { signOut } from './supabase.js';
import { initials } from './utils.js';

const LOGO_SVG = `<svg width="130" height="36" viewBox="0 0 130 36" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="18" cy="18" r="14" fill="#1B4FD8" opacity=".15"/>
  <circle cx="18" cy="18" r="8" fill="#1B4FD8" opacity=".35"/>
  <circle cx="18" cy="18" r="4" fill="#1B4FD8"/>
  <circle cx="18" cy="18" r="1.5" fill="#fff"/>
  <line x1="18" y1="4" x2="18" y2="8" stroke="#1B4FD8" stroke-width="1.5"/>
  <line x1="18" y1="28" x2="18" y2="32" stroke="#1B4FD8" stroke-width="1.5"/>
  <line x1="4" y1="18" x2="8" y2="18" stroke="#1B4FD8" stroke-width="1.5"/>
  <line x1="28" y1="18" x2="32" y2="18" stroke="#1B4FD8" stroke-width="1.5"/>
  <text x="38" y="22" font-family="Inter,sans-serif" font-size="11" font-weight="800" fill="#fff">NETWORKING</text>
  <text x="38" y="33" font-family="Inter,sans-serif" font-size="7.5" font-weight="500" fill="#8892BB" letter-spacing="2">EXPERTS</text>
</svg>`;

export function renderLayout({ user, role, activePage, navItems, onNav, pageContent }) {
  const app = document.getElementById('app');
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  app.innerHTML = `
    <div class="portal-layout">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-logo">${LOGO_SVG}</div>
        <nav class="sidebar-nav" id="sidebar-nav"></nav>
        <div class="sidebar-footer">
          <div class="user-info">
            <div class="user-avatar">${initials(userName)}</div>
            <div class="user-details">
              <div class="user-name">${userName}</div>
              <div class="user-role">${role}</div>
            </div>
            <button class="logout-btn" id="logout-btn" title="Sign Out">⏻</button>
          </div>
        </div>
      </aside>
      <div class="main-content">
        <div class="topbar">
          <div class="topbar-title" id="topbar-title"></div>
          <div class="topbar-actions" id="topbar-actions"></div>
        </div>
        <div class="page-content" id="page-content"></div>
      </div>
    </div>`;

  buildNav(navItems, activePage, onNav);

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await signOut();
    location.reload();
  });

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
      <span>${item.label}</span>${badge}
    </div>`;
  }).join('');
  nav.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => onNav(el.dataset.nav));
  });
}

function renderPage(pageContent, navItems, activePage) {
  const item = navItems.find(n => n.id === activePage);
  document.getElementById('topbar-title').textContent = item?.label || '';
  document.getElementById('page-content').innerHTML = '';
  if (typeof pageContent === 'function') pageContent(document.getElementById('page-content'));
  else document.getElementById('page-content').innerHTML = pageContent || '';
}
