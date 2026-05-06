import './style.css';
import { supabase, getUserRole } from './supabase.js';
import { renderAuth } from './auth.js';
import { renderLayout } from './layout.js';
import { renderClientDashboard, renderClientTickets } from './pages/client.js';
import { renderAdminDashboard, renderAllTickets, renderClients, renderUsers, renderAttendance, renderInquiries, renderStocks, renderContacts } from './pages/admin.js';
import { renderEmployeeDashboard } from './pages/employee.js';
import { renderProfile } from './pages/profile.js';
import { renderLandingPage } from './pages/landing.js';
import { initTheme } from './utils.js';
import { ICONS } from './icons.js';

initTheme();

const app = document.getElementById('app');
let currentUser = null;
let currentRole = null;
let activePage = 'dashboard';

// ── NAV CONFIGS PER ROLE ──────────────────────────────
function getNavItems(role) {
  const common = [
    { type: 'section', label: 'Main' },
    { id: 'dashboard', icon: ICONS.dashboard, label: 'Dashboard' },
  ];
  if (role === 'client') {
    return [...common,
      { id: 'my-tickets', icon: ICONS.ticket, label: 'My Tickets' },
      { type: 'section', label: 'Account' },
      { id: 'profile', icon: ICONS.user, label: 'Profile' },
    ];
  }
  if (role === 'employee') {
    return [...common,
      { id: 'all-tickets', icon: ICONS.ticket, label: 'My Tasks' },
      { type: 'section', label: 'Account' },
      { id: 'profile', icon: ICONS.user, label: 'Profile' },
    ];
  }
  return [...common,
    { id: 'all-tickets', icon: ICONS.ticket, label: 'All Tickets' },
    { type: 'section', label: 'Operations' },
    { id: 'attendance', icon: ICONS.clock, label: 'Attendance' },
    { id: 'inquiries', icon: ICONS.inbox, label: 'Service Requests' },
    { id: 'stocks', icon: ICONS.box, label: 'Stocks' },
    { type: 'section', label: 'Management' },
    { id: 'clients', icon: ICONS.building, label: 'Clients' },
    { id: 'contacts', icon: ICONS.phone, label: 'Contacts' },
    { id: 'users', icon: ICONS.users, label: 'Users' },
    { type: 'section', label: 'Account' },
    { id: 'profile', icon: ICONS.user, label: 'Profile' },
  ];
}

// ── PAGE RENDERER ─────────────────────────────────────
function getPageRenderer(role, page) {
  const map = {
    client: { dashboard: renderClientDashboard, 'my-tickets': renderClientTickets, profile: renderProfile },
    employee: { dashboard: renderEmployeeDashboard, 'all-tickets': renderAllTickets, profile: renderProfile },
    admin: {
      dashboard: renderAdminDashboard, 'all-tickets': renderAllTickets, attendance: renderAttendance,
      inquiries: renderInquiries, stocks: renderStocks, clients: renderClients, contacts: renderContacts, users: renderUsers, profile: renderProfile
    }
  };
  return (map[role] || map.client)[page];
}

function navigate(page) {
  activePage = page;
  const navItems = getNavItems(currentRole);
  const renderer = getPageRenderer(currentRole, page);
  renderLayout({
    user: currentUser, role: currentRole, activePage, navItems,
    onNav: navigate, pageContent: renderer || (() => {})
  });
}

function showAuth() {
  renderAuth(
    (user, role) => { currentUser = user; currentRole = role; navigate('dashboard'); },
    () => renderLandingPage(app, showAuth)
  );
}

// ── BOOT ─────────────────────────────────────────────
async function boot() {
  app.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`;
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session?.user) {
    currentUser = session.user;
    currentRole = await getUserRole(currentUser.id) || 'client';
    navigate('dashboard');
  } else {
    // Show Landing Page if not logged in
    renderLandingPage(app, showAuth);
  }
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    currentUser = null; currentRole = null;
    renderLandingPage(app, showAuth);
  }
});

boot();
