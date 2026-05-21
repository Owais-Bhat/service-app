import './style.css';
import { supabase, getUserRole, signOut, onNotification } from './supabase.js';
import { renderAuth } from './auth.js';
import { renderLayout } from './layout.js';
import { renderAdminDashboard, renderAllTickets, renderClients, renderUsers, renderAttendance, renderInquiries, renderStocks, renderContacts, renderPaymentsTab, renderBillsTab, renderCashCollectionsTab, renderDeviceTypesTab, renderLeaveRequests, renderEODReports, renderPricingTab, renderSalaryOverview, renderFeedbackTab, renderComplaintsTab, renderAdsTab } from './pages/admin.js';
import { renderEmployeeDashboard, renderEmployeeAttendanceRecords, renderEmployeeLeaveRequests, renderEmployeeEODReports, renderEmployeeSalary, renderEmployeeCash, renderEmployeeTasks, renderEmployeeLeaderboard } from './pages/employee.js';
import { renderProfile } from './pages/profile.js';
import { renderLandingPage } from './pages/landing.js';
import { initTheme, toast, ensureNotifyPermission, showNotification } from './utils.js';
import { ICONS } from './icons.js';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker for PWA
registerSW({ immediate: true });

// PWA Install Prompt Logic — button only shown on the landing page
let deferredPrompt;
let pwaInstallBtn = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Don't show the button here — landing page calls showPWAInstallBtn()
});

export function showPWAInstallBtn() {
  if (!deferredPrompt || pwaInstallBtn) return;
  pwaInstallBtn = document.createElement('button');
  pwaInstallBtn.className = 'pwa-install-btn';
  pwaInstallBtn.innerHTML = `${ICONS.download || '📥'} Install App`;
  document.body.appendChild(pwaInstallBtn);
  pwaInstallBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') deferredPrompt = null;
    hidePWAInstallBtn();
  });
}

export function hidePWAInstallBtn() {
  if (pwaInstallBtn) { pwaInstallBtn.remove(); pwaInstallBtn = null; }
}

initTheme();

const app = document.getElementById('app');
let currentUser = null;
let currentRole = null;
let canAddService = false;
let activePage = 'dashboard';

// ── NAV CONFIGS PER ROLE ──────────────────────────────
function getNavItems(role) {
  const common = [
    { type: 'section', label: 'Main' },
    { id: 'dashboard', icon: ICONS.dashboard, label: 'Dashboard' },
  ];
  if (role === 'employee') {
    const items = [...common,
      { id: 'all-tickets', icon: ICONS.ticket, label: 'My Tasks' },
      { type: 'section', label: 'Work' },
      { id: 'my-attendance', icon: ICONS.clock, label: 'Attendance Records' },
      { id: 'my-leaves', icon: ICONS.hourglass, label: 'Leave Requests' },
      { id: 'my-eod', icon: ICONS.clipboard, label: 'EOD Reports' },
      { id: 'my-cash', icon: ICONS.rupee, label: 'My Cash' },
      { id: 'my-salary', icon: ICONS.rupee, label: 'Salary' },
      { id: 'leaderboard', icon: ICONS.star, label: 'Leaderboard' },
    ];
    if (canAddService) {
      items.push({ id: 'service-pricing', icon: ICONS.receipt, label: 'Service Pricing' });
    }
    items.push(
      { type: 'section', label: 'Account' },
      { id: 'profile', icon: ICONS.user, label: 'Profile' }
    );
    return items;
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
    { type: 'section', label: 'Reports' },
    { id: 'payments', icon: ICONS.rupee, label: 'Payments' },
    { id: 'bills', icon: ICONS.receipt, label: 'Bills' },
    { id: 'cash', icon: ICONS.rupee, label: 'Cash Collections' },
    { id: 'salary', icon: ICONS.rupee, label: 'Salary' },
    { id: 'leaves', icon: ICONS.hourglass, label: 'Leave Requests' },
    { id: 'eod', icon: ICONS.clipboard, label: 'EOD Summaries' },
    { id: 'pricing', icon: ICONS.receipt, label: 'Service Pricing' },
    { id: 'device-types', icon: ICONS.box, label: 'Device Types' },
    { id: 'feedback', icon: ICONS.star, label: 'Leaderboard' },
    { id: 'complaints', icon: ICONS.shield, label: 'Complaints' },
    { id: 'ads', icon: ICONS.box, label: 'Landing Ads' },
    { type: 'section', label: 'Account' },
    { id: 'profile', icon: ICONS.user, label: 'Profile' },
  ];
}

// ── PAGE RENDERER ─────────────────────────────────────
function getPageRenderer(role, page) {
  const map = {
    employee: {
      dashboard: renderEmployeeDashboard,
      'all-tickets': renderEmployeeTasks,
      'my-attendance': renderEmployeeAttendanceRecords,
      'my-leaves': renderEmployeeLeaveRequests,
      'my-eod': renderEmployeeEODReports,
      'my-cash': renderEmployeeCash,
      'my-salary': renderEmployeeSalary,
      leaderboard: renderEmployeeLeaderboard,
      'service-pricing': renderPricingTab,
      profile: renderProfile
    },
    admin: {
      dashboard: renderAdminDashboard, 'all-tickets': renderAllTickets, attendance: renderAttendance,
      inquiries: renderInquiries, stocks: renderStocks, clients: renderClients, contacts: renderContacts, users: renderUsers, profile: renderProfile,
      payments: renderPaymentsTab, bills: renderBillsTab, cash: renderCashCollectionsTab, salary: renderSalaryOverview, leaves: renderLeaveRequests, eod: renderEODReports, pricing: renderPricingTab,
      'device-types': renderDeviceTypesTab, feedback: renderFeedbackTab, complaints: renderComplaintsTab,
      ads: renderAdsTab,
    }
  };
  return (map[role] || map.admin)[page];
}

let _notifyUnsub = null;
function startGlobalNotifications() {
  if (_notifyUnsub) return;
  ensureNotifyPermission();
  _notifyUnsub = onNotification(null, (msg) => {
    // Don't double-toast if the active page already handles its own UI feedback.
    showNotification({
      title: msg.title || 'Update',
      body: msg.body || '',
      tag: msg.subject || 'app-notify',
      type: msg.subject === 'payment_received' ? 'payment'
          : msg.subject === 'new_assignment' ? 'alert'
          : msg.subject === 'new_service_request' ? 'alert'
          : msg.subject === 'new_complaint' ? 'alert'
          : msg.subject === 'employee_clock_in' ? 'alert'
          : msg.subject === 'employee_clock_out' ? 'alert'
          : 'info',
    });
  });
}

function navigate(page) {
  hidePWAInstallBtn();
  activePage = page;
  const navItems = getNavItems(currentRole);
  const renderer = getPageRenderer(currentRole, page);
  renderLayout({
    user: currentUser, role: currentRole, activePage, navItems,
    onNav: navigate, pageContent: renderer || (() => {})
  });
  startGlobalNotifications();
}

function goToLanding() {
  renderLandingPage(app, showAuth);
  showPWAInstallBtn();
}

async function loadCanAddService(userId) {
  try {
    const { data } = await supabase.from('profiles').select('can_add_service').eq('id', userId).single();
    canAddService = data?.can_add_service === 1 || data?.can_add_service === true;
  } catch {
    canAddService = false;
  }
}

function showAuth() {
  renderAuth(
    async (user, role) => {
      if (role !== 'admin' && role !== 'employee') {
        // Clients should not reach the dashboard — push them back to the public form.
        await signOut();
        toast('Client accounts cannot log in here. Please use the public service request form.', 'error');
        goToLanding();
        return;
      }
      currentUser = user;
      currentRole = role;
      if (role === 'employee') await loadCanAddService(user.id);
      navigate('dashboard');
    },
    () => goToLanding()
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
      goToLanding();
      return;
    }

    if (currentRole === 'employee') await loadCanAddService(currentUser.id);
    navigate('dashboard');
  } else {
    // Show Landing Page if not logged in
    goToLanding();
  }
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    currentUser = null; currentRole = null;
    goToLanding();
  }
});

boot();
