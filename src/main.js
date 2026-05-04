import './style.css';
import { supabase, getUserRole } from './supabase.js';
import { renderAuth } from './auth.js';
import { renderLayout } from './layout.js';
import { renderClientDashboard, renderClientTickets } from './pages/client.js';
import { renderAdminDashboard, renderAllTickets, renderClients, renderUsers } from './pages/admin.js';
import { renderProfile } from './pages/profile.js';

const app = document.getElementById('app');
let currentUser = null;
let currentRole = null;
let activePage = 'dashboard';

// ── NAV CONFIGS PER ROLE ──────────────────────────────
function getNavItems(role) {
  const common = [
    { type: 'section', label: 'Main' },
    { id: 'dashboard', icon: '⬡', label: 'Dashboard' },
  ];
  if (role === 'client') {
    return [...common,
      { id: 'my-tickets', icon: '🎫', label: 'My Tickets' },
      { type: 'section', label: 'Account' },
      { id: 'profile', icon: '👤', label: 'Profile' },
    ];
  }
  if (role === 'employee') {
    return [...common,
      { id: 'all-tickets', icon: '🎫', label: 'All Tickets' },
      { type: 'section', label: 'Account' },
      { id: 'profile', icon: '👤', label: 'Profile' },
    ];
  }
  // admin
  return [...common,
    { id: 'all-tickets', icon: '🎫', label: 'All Tickets' },
    { type: 'section', label: 'Management' },
    { id: 'clients', icon: '🏢', label: 'Clients' },
    { id: 'users', icon: '👥', label: 'Users' },
    { type: 'section', label: 'Account' },
    { id: 'profile', icon: '👤', label: 'Profile' },
  ];
}

// ── PAGE RENDERER ─────────────────────────────────────
function getPageRenderer(role, page) {
  const map = {
    client: {
      dashboard: renderClientDashboard,
      'my-tickets': renderClientTickets,
      profile: renderProfile,
    },
    employee: {
      dashboard: renderAdminDashboard,
      'all-tickets': renderAllTickets,
      profile: renderProfile,
    },
    admin: {
      dashboard: renderAdminDashboard,
      'all-tickets': renderAllTickets,
      clients: renderClients,
      users: renderUsers,
      profile: renderProfile,
    },
  };
  return (map[role] || map.client)[page];
}

function navigate(page) {
  activePage = page;
  const navItems = getNavItems(currentRole);
  const renderer = getPageRenderer(currentRole, page);
  renderLayout({
    user: currentUser,
    role: currentRole,
    activePage,
    navItems,
    onNav: navigate,
    pageContent: renderer || (() => {}),
  });
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
    renderAuth((user, role) => {
      currentUser = user;
      currentRole = role;
      navigate('dashboard');
    });
  }
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    currentUser = null;
    currentRole = null;
    renderAuth((user, role) => {
      currentUser = user;
      currentRole = role;
      navigate('dashboard');
    });
  }
});

boot();
