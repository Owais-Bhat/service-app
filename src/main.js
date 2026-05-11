import './style.css';
import { supabase, getUserRole, signOut } from './supabase.js';
import { renderAuth } from './auth.js';
import { renderLayout } from './layout.js';
import { renderAdminDashboard, renderAllTickets, renderClients, renderUsers, renderAttendance, renderInquiries, renderStocks, renderContacts } from './pages/admin.js';
import { renderEmployeeDashboard } from './pages/employee.js';
import { renderProfile } from './pages/profile.js';
import { renderLandingPage } from './pages/landing.js';
import { initTheme, toast } from './utils.js';
import { ICONS } from './icons.js';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker for PWA
registerSW({ immediate: true });

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
    employee: { dashboard: renderEmployeeDashboard, 'all-tickets': renderAllTickets, profile: renderProfile },
    admin: {
      dashboard: renderAdminDashboard, 'all-tickets': renderAllTickets, attendance: renderAttendance,
      inquiries: renderInquiries, stocks: renderStocks, clients: renderClients, contacts: renderContacts, users: renderUsers, profile: renderProfile
    }
  };
  return (map[role] || map.admin)[page];
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
    async (user, role) => {
      if (role !== 'admin' && role !== 'employee') {
        // Clients should not reach the dashboard — push them back to the public form.
        await signOut();
        toast('Client accounts cannot log in here. Please use the public service request form.', 'error');
        renderLandingPage(app, showAuth);
        return;
      }
      currentUser = user;
      currentRole = role;
      navigate('dashboard');
    },
    () => renderLandingPage(app, showAuth)
  );
}

// ── BOOT ─────────────────────────────────────────────
async function boot() {
  app.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`;
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) {
    currentUser = session.user;
    currentRole = session.user.role || await getUserRole(currentUser.id);

    // Stale client sessions get evicted — the dashboard is staff-only now.
    if (currentRole !== 'admin' && currentRole !== 'employee') {
      await signOut();
      currentUser = null;
      currentRole = null;
      renderLandingPage(app, showAuth);
      return;
    }

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
