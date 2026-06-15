import './style.css';
import { supabase, getUserRole, signOut, onNotification } from './supabase.js';
import { renderAuth } from './auth.js';
import { renderLayout } from './layout.js';
// Page modules are loaded on demand (see PAGE_LOADERS below) so the initial
// bundle is just the shell + auth + landing instead of every admin/employee
// screen at once. Each role only downloads the code it actually opens.
import { renderLandingPage } from './pages/landing.js';
import { initTheme, toast, ensureNotifyPermission, showNotification } from './utils.js';
import { initPush } from './push.js';
import { speak as speakNotification, openNotificationDetail, primeVoice } from './notify-center.js';
import { ICONS } from './icons.js';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker for PWA. Force activation of fresh bundles so public
// SMS links do not keep opening with an old cached landing-page script.
const updateServiceWorker = registerSW({
  immediate: true,
  // Already-installed apps may still be running an OLD service worker that
  // intercepts public links (e.g. the SMS feedback link) and serves the cached
  // app shell instead of the real page. Check for a fresh worker on launch,
  // hourly, and whenever the app regains focus so devices adopt the corrected
  // worker quickly rather than waiting for a full cold start.
  onRegisteredSW(swUrl, registration) {
    if (!registration) return;
    const checkForUpdate = () => { registration.update().catch(() => {}); };
    setInterval(checkForUpdate, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    });
  },
  onNeedRefresh() {
    updateServiceWorker(true);
  },
  onOfflineReady() {},
});

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
// Keep only tabs the admin granted this employee. Always-on tabs can never be
// hidden, and section headers with no visible items beneath them are dropped.
const ALWAYS_ON_TABS = new Set(['dashboard', 'notifications', 'profile']);
function filterTabs(items) {
  if (!allowedTabs) return items;
  const kept = items.filter(it => it.type === 'section' || ALWAYS_ON_TABS.has(it.id) || allowedTabs.has(String(it.id)));
  // Remove section headers that ended up with no items after them.
  return kept.filter((it, i) => {
    if (it.type !== 'section') return true;
    const next = kept[i + 1];
    return next && next.type !== 'section';
  });
}

function getNavItems(role) {
  const common = [
    { type: 'section', label: 'Main' },
    { id: 'dashboard', icon: ICONS.dashboard, label: 'Dashboard' },
  ];
  if (role === 'employee') {
    const items = [...common,
      { id: 'all-tickets', icon: ICONS.ticket, label: 'My Tasks' },
      { id: 'notifications', icon: ICONS.bell, label: 'Notifications' },
      { type: 'section', label: 'Work' },
      { id: 'my-attendance', icon: ICONS.clock, label: 'Attendance Records' },
      { id: 'my-leaves', icon: ICONS.hourglass, label: 'Leave Requests' },
      { id: 'my-eod', icon: ICONS.clipboard, label: 'EOD Reports' },
      { id: 'my-cash', icon: ICONS.rupee, label: 'My Cash' },
      { id: 'my-collections', icon: ICONS.card, label: 'Collections' },
      { id: 'my-salary', icon: ICONS.rupee, label: 'Salary' },
      { id: 'leaderboard', icon: ICONS.star, label: 'Leaderboard' },
      { id: 'employee-training', icon: ICONS.play, label: 'Tutorials' },
      { id: 'my-training-courses', icon: ICONS.shield, label: 'Training' },
    ];
    items.push({ id: 'device-followup', icon: ICONS.wrench, label: 'Device Follow-up' });
    items.push({ type: 'section', label: 'Services' });
    items.push({ id: 'estimator', icon: ICONS.receipt, label: 'Estimator' });
    if (canAddService) {
      items.push({ id: 'service-pricing', icon: ICONS.receipt, label: 'Service Pricing' });
    }
    items.push(
      { type: 'section', label: 'Account' },
      { id: 'profile', icon: ICONS.user, label: 'Profile' }
    );
    return filterTabs(items);
  }
  return [...common,
    { id: 'all-tickets', icon: ICONS.ticket, label: 'All Tickets' },
    { id: 'notifications', icon: ICONS.bell, label: 'Notifications' },
    { type: 'section', label: 'Operations' },
    { id: 'attendance', icon: ICONS.clock, label: 'Attendance' },
    { id: 'inquiries', icon: ICONS.inbox, label: 'Service Requests' },
    { id: 'auto-assignment', icon: ICONS.refresh, label: 'Auto Assignment' },
    { id: 'device-tracking', icon: ICONS.wrench, label: 'Device Follow-up' },
    { type: 'section', label: 'Management' },
    { id: 'contacts', icon: ICONS.phone, label: 'Contacts' },
    { id: 'users', icon: ICONS.users, label: 'Users' },
    { id: 'device-types', icon: ICONS.box, label: 'Device Types' },
    { id: 'training-admin', icon: ICONS.play, label: 'Employee Tutorials' },
    { id: 'training-courses', icon: ICONS.shield, label: 'Training Courses' },
    { type: 'section', label: 'Reports' },
    { id: 'finance', icon: ICONS.rupee, label: 'Finance Report' },
    { id: 'ai-report', icon: ICONS.star, label: 'AI Report' },
    { id: 'payments', icon: ICONS.rupee, label: 'Payments' },
    { id: 'bills', icon: ICONS.receipt, label: 'Bills' },
    { id: 'cash', icon: ICONS.rupee, label: 'Cash Collections' },
    { id: 'collections', icon: ICONS.card, label: 'Collection Reports' },
    { id: 'salary', icon: ICONS.rupee, label: 'Salary' },
    { id: 'leaves', icon: ICONS.hourglass, label: 'Leave Requests' },
    { id: 'eod', icon: ICONS.clipboard, label: 'EOD Summaries' },
    { id: 'feedback', icon: ICONS.star, label: 'Leaderboard' },
    { id: 'complaints', icon: ICONS.shield, label: 'Complaints' },
    { type: 'section', label: 'Marketing' },
    { id: 'ads', icon: ICONS.box, label: 'Landing Ads' },
    { id: 'popup-ads', icon: ICONS.box, label: 'Popup Ads' },
    { id: 'notices', icon: ICONS.clipboard, label: 'Notices' },
    { id: 'discounts', icon: ICONS.receipt, label: 'Add Discounts' },
    { id: 'discount-details', icon: ICONS.receipt, label: 'Discount Details' },
    { id: 'pricing', icon: ICONS.receipt, label: 'Service Pricing' },
    { type: 'section', label: 'Config' },
    { id: 'settings', icon: ICONS.settings || '⚙️', label: 'Settings' },
    { type: 'section', label: 'Account' },
    { id: 'profile', icon: ICONS.user, label: 'Profile' },
  ];
}

// ── PAGE RENDERER (lazy) ──────────────────────────────
// Each entry dynamically imports its module the first time the page is opened,
// so Vite splits admin/employee/secondary screens into separate chunks. The
// shell renders instantly; only the chunk for the active page is downloaded.
const PAGE_LOADERS = {
  employee: {
    dashboard: () => import('./pages/employee.js').then(m => m.renderEmployeeDashboard),
    'all-tickets': () => import('./pages/employee.js').then(m => m.renderEmployeeTasks),
    'my-attendance': () => import('./pages/employee.js').then(m => m.renderEmployeeAttendanceRecords),
    'my-leaves': () => import('./pages/employee.js').then(m => m.renderEmployeeLeaveRequests),
    'my-eod': () => import('./pages/employee.js').then(m => m.renderEmployeeEODReports),
    'my-cash': () => import('./pages/employee.js').then(m => m.renderEmployeeCash),
    'my-collections': () => import('./pages/collections.js').then(m => m.renderEmployeeCollections),
    'my-salary': () => import('./pages/employee.js').then(m => m.renderEmployeeSalary),
    leaderboard: () => import('./pages/employee.js').then(m => m.renderEmployeeLeaderboard),
    'employee-training': () => import('./pages/media-training.js').then(m => m.renderEmployeeTrainingTab),
    estimator: () => import('./pages/employee.js').then(m => m.renderEmployeeEstimatorTab),
    'service-pricing': () => import('./pages/employee.js').then(m => m.renderEmployeePricingTab),
    'device-followup': () => import('./pages/employee.js').then(m => m.renderEmployeeFollowUp),
    notifications: () => import('./pages/notifications.js').then(m => m.renderNotificationsTab),
    'my-training-courses': () => import('./pages/training.js').then(m => m.renderEmployeeCourses),
    profile: () => import('./pages/profile.js').then(m => m.renderProfile),
  },
  admin: {
    dashboard: () => import('./pages/admin.js').then(m => m.renderAdminDashboard),
    'all-tickets': () => import('./pages/admin.js').then(m => m.renderAllTickets),
    attendance: () => import('./pages/admin.js').then(m => m.renderAttendance),
    inquiries: () => import('./pages/admin.js').then(m => m.renderInquiries),
    contacts: () => import('./pages/admin.js').then(m => m.renderContacts),
    users: () => import('./pages/admin.js').then(m => m.renderUsers),
    profile: () => import('./pages/profile.js').then(m => m.renderProfile),
    payments: () => import('./pages/admin.js').then(m => m.renderPaymentsTab),
    bills: () => import('./pages/admin.js').then(m => m.renderBillsTab),
    cash: () => import('./pages/admin.js').then(m => m.renderCashCollectionsTab),
    salary: () => import('./pages/admin.js').then(m => m.renderSalaryOverview),
    leaves: () => import('./pages/admin.js').then(m => m.renderLeaveRequests),
    eod: () => import('./pages/admin.js').then(m => m.renderEODReports),
    pricing: () => import('./pages/admin.js').then(m => m.renderPricingTab),
    collections: () => import('./pages/collections.js').then(m => m.renderAdminCollections),
    discounts: () => import('./pages/discounts.js').then(m => m.renderDiscountsTab),
    'discount-details': () => import('./pages/discounts.js').then(m => m.renderDiscountRequestsTab),
    'popup-ads': () => import('./pages/media-training.js').then(m => m.renderPopupAdsTab),
    'training-admin': () => import('./pages/media-training.js').then(m => m.renderTrainingAdminTab),
    'ai-report': () => import('./pages/media-training.js').then(m => m.renderAIReportTab),
    'device-types': () => import('./pages/admin.js').then(m => m.renderDeviceTypesTab),
    feedback: () => import('./pages/admin.js').then(m => m.renderFeedbackTab),
    complaints: () => import('./pages/admin.js').then(m => m.renderComplaintsTab),
    ads: () => import('./pages/admin.js').then(m => m.renderAdsTab),
    notices: () => import('./pages/admin-notices.js').then(m => m.renderNoticesTab),
    settings: () => import('./pages/admin.js').then(m => m.renderSettingsTab),
    'auto-assignment': () => import('./pages/admin.js').then(m => m.renderAutoAssignmentTab),
    'device-tracking': () => import('./pages/device-tracking-admin.js').then(m => m.renderDeviceTrackingTab),
    finance: () => import('./pages/finance.js').then(m => m.renderFinanceReportTab),
    notifications: () => import('./pages/notifications.js').then(m => m.renderNotificationsTab),
    'training-courses': () => import('./pages/training.js').then(m => m.renderTrainingCoursesAdmin),
  },
};

function getPageRenderer(role, page) {
  const loader = (PAGE_LOADERS[role] || PAGE_LOADERS.admin)[page];
  if (!loader) return null;
  // Returns a sync render fn (so renderLayout stays sync): it paints a spinner,
  // lazy-loads the page module, then renders — unless the user already navigated
  // elsewhere while the chunk was downloading.
  return (container) => {
    const wanted = page;
    container.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`;
    loader()
      .then((fn) => {
        if (activePage !== wanted) return;
        if (typeof fn === 'function') fn(container);
        else container.innerHTML = '';
      })
      .catch((err) => {
        console.error('[page] failed to load', page, err);
        if (activePage !== wanted) return;
        container.innerHTML = `<div class="card" style="padding:28px;text-align:center;"><p style="color:var(--danger);font-weight:600;margin:0 0 10px;">Couldn't load this page.</p><button class="btn btn-secondary" id="page-reload">Reload</button></div>`;
        const btn = container.querySelector('#page-reload');
        if (btn) btn.onclick = () => location.reload();
      });
  };
}

// When a push notification is tapped (app in background or freshly opened),
// the push service worker postMessages the payload here so we can show the
// full-screen detail card.
let _swMsgBound = false;
function bindServiceWorkerMessages() {
  if (_swMsgBound || !('serviceWorker' in navigator)) return;
  _swMsgBound = true;
  navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e.data;
    if (d && d.type === 'notification-click') openNotificationDetail(d);
  });
}

let _notifyUnsub = null;
function startGlobalNotifications() {
  bindServiceWorkerMessages();
  if (_notifyUnsub) return;
  ensureNotifyPermission();
  initPush();
  primeVoice();
  _notifyUnsub = onNotification(null, (msg) => {
    // Human-voice announcement for every live notification.
    speakNotification(msg);
    // Don't double-toast if the active page already handles its own UI feedback.
    showNotification({
      title: msg.title || 'Update',
      body: msg.body || '',
      tag: msg.subject || 'app-notify',
      // Tapping the OS/in-app notification opens the full-screen detail card.
      onclick: () => openNotificationDetail(msg),
      type: msg.subject === 'payment_received' ? 'payment'
          : msg.subject === 'new_assignment' ? 'alert'
          : msg.subject === 'new_service_request' ? 'alert'
          : msg.subject === 'new_complaint' ? 'alert'
          : msg.subject === 'employee_clock_in' ? 'alert'
          : msg.subject === 'employee_clock_out' ? 'alert'
          : msg.subject === 'device_followup_reminder' ? 'alert'
          : msg.subject === 'sla_breach' ? 'alert'
          : 'info',
    });
  });
}

let _navHistoryStarted = false;
function navigate(page, opts = {}) {
  hidePWAInstallBtn();
  activePage = page;
  // Push to browser history so the phone's back button navigates within the app
  // (in an installed PWA, without this the back button just backgrounds the app).
  if (opts.push !== false) {
    try {
      if (!_navHistoryStarted) { history.replaceState({ page, app: true }, '', `#${page}`); _navHistoryStarted = true; }
      else history.pushState({ page, app: true }, '', `#${page}`);
    } catch { /* history unavailable */ }
  }
  const navItems = getNavItems(currentRole);
  const renderer = getPageRenderer(currentRole, page);
  renderLayout({
    user: currentUser, role: currentRole, activePage, navItems,
    onNav: navigate, pageContent: renderer || (() => {})
  });
  startGlobalNotifications();
  if (currentRole === 'employee') {
    import('./pages/media-training.js').then(m => m.mountEmployeePopupAds()).catch(() => {});
  }
}

// Phone/browser back button: close an open popup first, otherwise go to the
// previous in-app page instead of leaving/backgrounding the app.
window.addEventListener('popstate', (e) => {
  const overlays = document.querySelectorAll('.modal-overlay');
  if (overlays.length) {
    const top = overlays[overlays.length - 1];
    const closeBtn = top.querySelector('.modal-close');
    if (closeBtn) closeBtn.click(); else top.remove();
    // Stay on the current page (replace the entry we just consumed).
    try { history.pushState({ page: activePage, app: true }, '', `#${activePage}`); } catch {}
    return;
  }
  if (e.state && e.state.app && e.state.page && currentRole) {
    navigate(e.state.page, { push: false });
  }
});

function goToLanding() {
  renderLandingPage(app, showAuth);
  showPWAInstallBtn();
}

function isFeedbackRoute() {
  const params = new URLSearchParams(window.location.search);
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  return pathname === '/feedback'
    || pathname.startsWith('/f/')
    || params.has('feedback')
    || params.has('f')
    || params.has('token');
}

// Read the "can add service" flag straight off the authenticated user object —
// both /auth/signin and /auth/me already return it, so no extra round-trip is
// needed on the login / boot critical path.
const readCanAddService = (u) => (u?.can_add_service === 1 || u?.can_add_service === true);

// Per-user tab access. null = all tabs allowed; otherwise a Set of permitted
// tab ids (admin-controlled in the Users screen). Tabs that must never be
// locked out (dashboard/notifications/profile) are always kept in getNavItems.
let allowedTabs = null;
const readAllowedTabs = (u) => {
  let v = u?.allowed_tabs;
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
  return (Array.isArray(v) && v.length) ? new Set(v.map(String)) : null;
};

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
      localStorage.setItem(SESSION_DAY_KEY, todayKey());
      if (role === 'employee') { canAddService = readCanAddService(user); allowedTabs = readAllowedTabs(user); }
      navigate('dashboard');
    },
    () => goToLanding()
  );
}

// ── DAILY SESSION EXPIRY (employees) ─────────────────
// Employee sessions end at midnight: next time the app is opened (or while it
// stays open past midnight) the employee is signed out and must log in again,
// which re-triggers the forced clock-in popup for the new day.
const SESSION_DAY_KEY = 'nest-session-day';
const todayKey = () => new Date().toLocaleDateString('en-CA');

function isEmployeeSessionExpired() {
  const saved = localStorage.getItem(SESSION_DAY_KEY);
  return !!saved && saved !== todayKey();
}

async function expireEmployeeSession() {
  localStorage.setItem(SESSION_DAY_KEY, todayKey());
  try { await signOut(); } catch (_) {}
  currentUser = null;
  currentRole = null;
  toast('Your daily session has ended. Please log in and clock in again.', 'info');
  goToLanding();
}

// While the app stays open, check every minute whether the day has rolled over.
setInterval(() => {
  if (currentRole === 'employee' && isEmployeeSessionExpired()) expireEmployeeSession();
}, 60 * 1000);

// ── BOOT ─────────────────────────────────────────────
async function boot() {
  app.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`;

  if (isFeedbackRoute()) {
    renderLandingPage(app, showAuth);
    hidePWAInstallBtn();
    return;
  }

  // Any unexpected failure (or a slow/unreachable backend that times out) must
  // never leave the splash spinner hanging — fall back to the landing/login.
  let session = null;
  try {
    ({ data: { session } } = await supabase.auth.getSession());
  } catch (err) {
    console.warn('[boot] session check failed', err);
    goToLanding();
    return;
  }

  if (session?.user) {
    try {
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

      // Employee sessions are valid for one day only — force re-login (and a
      // fresh clock-in) when the saved session belongs to a previous day.
      if (currentRole === 'employee' && isEmployeeSessionExpired()) {
        await expireEmployeeSession();
        return;
      }
      localStorage.setItem(SESSION_DAY_KEY, todayKey());

      if (currentRole === 'employee') { canAddService = readCanAddService(currentUser); allowedTabs = readAllowedTabs(currentUser); }
      navigate('dashboard');
    } catch (err) {
      console.warn('[boot] dashboard load failed', err);
      goToLanding();
    }
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
