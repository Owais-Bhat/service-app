import { signOut } from './supabase.js';
import { initials, toggleTheme } from './utils.js';

const LOGO = new URL('./assets/logo.png', import.meta.url).href;

export function renderLayout({ user, role, activePage, navItems, onNav, pageContent }) {
  const app = document.getElementById('app');
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const savedTheme = localStorage.getItem('theme') || 'light';

  app.innerHTML = `
    <div class="portal-layout">
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-logo">
          <img src="${LOGO}" alt="Networking Experts" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"/>
          <span class="logo-text" style="display:none">Networking Experts</span>
        </div>
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
          <button class="menu-toggle" id="menu-toggle">☰</button>
          <div class="topbar-title" id="topbar-title"></div>
          <div id="topbar-actions">
            <button class="btn btn-secondary theme-toggle-btn" style="padding: 8px 12px; border-radius: 50%; font-size: 1.2rem; min-width: 42px; min-height: 42px;" title="Toggle Theme">${savedTheme === 'dark' ? '☀️' : '🌙'}</button>
          </div>
        </div>
        <div class="page-content" id="page-content"></div>
      </div>
    </div>`;

  buildNav(navItems, activePage, onNav);

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
    return `<div class="nav-item ${active}" data-nav="${item.id}">
      <span class="nav-icon">${item.icon}</span>
      <span>${item.label}</span>
    </div>`;
  }).join('');

  nav.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => onNav(el.dataset.nav));
  });
}

function renderPage(pageContent, navItems, activePage) {
  const item = navItems.find(n => n.id === activePage);
  document.getElementById('topbar-title').textContent = item?.label || '';
  const container = document.getElementById('page-content');
  container.innerHTML = '';
  if (typeof pageContent === 'function') pageContent(container);
  else container.innerHTML = pageContent || '';
}
