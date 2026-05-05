import { signOut } from './supabase.js';
import { initials } from './utils.js';

export function renderLayout({ user, role, activePage, navItems, onNav, pageContent }) {
  const app = document.getElementById('app');
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  app.innerHTML = `
    <div class="portal-layout">
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-logo"><h2>Networking Experts</h2></div>
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
          <div class="topbar-actions" id="topbar-actions"></div>
        </div>
        <div class="page-content" id="page-content"></div>
      </div>
    </div>`;

  buildNav(navItems, activePage, onNav);

  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await signOut();
    location.reload();
  });

  // Mobile Menu Toggle
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const toggle = document.getElementById('menu-toggle');

  const closeSidebar = () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  };

  toggle.onclick = () => {
    sidebar.classList.add('open');
    overlay.classList.add('active');
  };

  overlay.onclick = closeSidebar;

  // Intercept nav clicks to close sidebar on mobile
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', closeSidebar);
  });

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
