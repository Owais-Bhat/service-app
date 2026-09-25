import './style.css';
import { supabase, getUserRole, signOut, onNotification } from './supabase.js';
import { renderAuth } from './auth.js';
import { renderLayout } from './layout.js';
// Page modules are loaded on demand (see PAGE_LOADERS below) so the initial
// bundle is just the shell + auth + landing instead of every admin/employee
// screen at once. Each role only downloads the code it actually opens.
import { renderLandingPage } from './pages/landing.js';
import { renderInstallPage } from './pages/install.js';
import { initTheme, toast, ensureNotifyPermission, showNotification } from './utils.js';
import { initPush } from './push.js';
import { startLiveLocationPing, stopLiveLocationPing } from './live-location-ping.js';
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
    // immediate:true already activates the new SW on next navigation —
    // forcing a reload here caused random page reloads mid-session.
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
// Tabs whose visibility comes from a permission flag, not the per-user
// tab-limit list: gig workers' Public Jobs (worker_type) and Assign Requests
// (can_assign_tickets). Neither is offered as a checkbox in the Users screen,
// so an employee with a restricted tab list must still see them once the
// matching flag is on.
const WORKER_TYPE_GOVERNED_TABS = new Set(['public-jobs', 'assign-requests']);
function filterTabs(items) {
  if (!allowedTabs) return items;
  const visible = (it) => ALWAYS_ON_TABS.has(it.id) || WORKER_TYPE_GOVERNED_TABS.has(it.id) || allowedTabs.has(String(it.id));
  // Groups keep only the children this employee may see, and a group left
  // with nothing inside it disappears entirely.
  const kept = items
    .map(it => it.type === 'group' ? { ...it, children: it.children.filter(visible) } : it)
    .filter(it => it.type === 'group' ? it.children.length : visible(it));
  return kept;
}

function getNavItems(role) {
  if (role === 'employee') {
    return filterTabs([
      { id: 'dashboard', icon: ICONS.dashboard, label: 'Dashboard' },
      {
        type: 'group', key: 'work', icon: ICONS.clipboard, label: 'Work',
        children: [
          { id: 'all-tickets', label: 'My Tasks' },
          ...(installationsEnabled ? [{ id: 'my-installations', label: 'Installations' }] : []),
          ...(isGigWorker ? [{ id: 'public-jobs', label: 'Public Jobs' }] : []),
          ...(canAssignTickets ? [{ id: 'assign-requests', label: 'Assign Requests' }] : []),
          { id: 'device-followup', label: 'Device Follow-up' },
        ],
      },
      {
        type: 'group', key: 'records', icon: ICONS.clock, label: 'My Records',
        children: [
          { id: 'my-stats', label: 'My Stats' },
          { id: 'my-attendance', label: 'Attendance Records' },
          { id: 'my-leaves', label: 'Leave Requests' },
          { id: 'my-eod', label: 'EOD Reports' },
          { id: 'my-cash', label: 'My Cash' },
          { id: 'my-collections', label: 'Collections' },
        ],
      },
      {
        type: 'group', key: 'services', icon: ICONS.receipt, label: 'Services',
        children: [
          { id: 'estimator', label: 'Estimator' },
          ...(canAddService ? [{ id: 'service-pricing', label: 'Service Pricing' }] : []),
        ],
      },
      {
        type: 'group', key: 'growth', icon: ICONS.star, label: 'Growth',
        children: [
          { id: 'leaderboard', label: 'Leaderboard' },
          { id: 'my-reviews', label: 'Bonus Reviews' },
          { id: 'employee-training', label: 'Tutorials' },
          { id: 'my-training-courses', label: 'Training' },
        ],
      },
      { id: 'notifications', icon: ICONS.bell, label: 'Notifications' },
      { id: 'profile', icon: ICONS.user, label: 'Profile' },
    ]);
  }

  return [
    { id: 'dashboard', icon: ICONS.dashboard, label: 'Dashboard' },
    {
      type: 'group', key: 'work', icon: ICONS.clipboard, label: 'Work',
      children: [
        { id: 'inquiries', label: 'Service Requests' },
        { id: 'queries', label: 'Queries & Follow-ups' },
        { id: 'installations', label: 'Installations' },
        { id: 'device-tracking', label: 'Device Tracking' },
      ],
    },
    {
      type: 'group', key: 'customers', icon: ICONS.users, label: 'Customers',
      children: [
        { id: 'contacts', label: 'Contacts' },
        { id: 'complaints', label: 'Complaints' },
      ],
    },
    { id: 'calendar', icon: ICONS.calendar, label: 'Calendar' },
    {
      type: 'group', key: 'operations', icon: ICONS.settings || ICONS.refresh, label: 'Operations',
      children: [
        { id: 'attendance', label: 'Attendance' },
        { id: 'job-cards', label: 'Job Cards' },
        { id: 'service-log', label: 'Service Log' },
        { id: 'reviews', label: 'Bonus Reviews' },
        { id: 'auto-assignment', label: 'Auto Assignment' },
        { id: 'live-locations', label: 'Live Locations' },
      ],
    },
    {
      type: 'group', key: 'reports', icon: ICONS.chart || ICONS.clipboard, label: 'Reports',
      children: [
        { id: 'stats', label: 'Stats' },
        { id: 'response-times', label: 'Response Time' },
        { id: 'feedback', label: 'Employee Performance' },
        { id: 'finance', label: 'Finance' },
        { id: 'ai-report', label: 'AI Reports' },
        { id: 'payments', label: 'Payments' },
        { id: 'bills', label: 'Bills' },
        { id: 'cash', label: 'Cash Collections' },
        { id: 'collections', label: 'Collection Reports' },
        { id: 'salary', label: 'Salary' },
        { id: 'gig-payouts', label: 'Gig Payouts' },
        { id: 'leaves', label: 'Leave Requests' },
        { id: 'eod', label: 'EOD Summaries' },
      ],
    },
    {
      type: 'group', key: 'management', icon: ICONS.user, label: 'Management',
      children: [
        { id: 'employee-panel', label: 'Employees' },
        { id: 'users', label: 'Users' },
        { id: 'device-types', label: 'Device Types' },
        { id: 'pricing', label: 'Pricing' },
        { id: 'training-admin', label: 'Employee Tutorials' },
        { id: 'training-courses', label: 'Training Courses' },
        { id: 'settings', label: 'Settings' },
      ],
    },
    {
      type: 'group', key: 'marketing', icon: ICONS.box, label: 'Marketing',
      children: [
        { id: 'ads', label: 'Landing Ads' },
        { id: 'popup-ads', label: 'Popup Ads' },
        { id: 'notices', label: 'Notices' },
        { id: 'discounts', label: 'Coupons' },
        { id: 'discount-details', label: 'Discount Details' },
      ],
    },
    { id: 'notifications', icon: ICONS.bell, label: 'Notifications' },
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
    'my-stats': () => import('./pages/stats.js').then(m => m.renderEmployeeStats),
    'all-tickets': () => import('./pages/employee.js').then(m => m.renderEmployeeTasks),
    'my-installations': () => import('./pages/employee.js').then(m => m.renderEmployeeInstallations),
    'public-jobs': () => import('./pages/employee.js').then(m => m.renderEmployeeGigPool),
    'my-attendance': () => import('./pages/employee.js').then(m => m.renderEmployeeAttendanceRecords),
    'my-leaves': () => import('./pages/employee.js').then(m => m.renderEmployeeLeaveRequests),
    'my-eod': () => import('./pages/employee.js').then(m => m.renderEmployeeEODReports),
    'my-cash': () => import('./pages/employee.js').then(m => m.renderEmployeeCash),
    'my-collections': () => import('./pages/collections.js').then(m => m.renderEmployeeCollections),
    leaderboard: () => import('./pages/employee.js').then(m => m.renderEmployeeLeaderboard),
    'my-reviews': () => import('./pages/reviews.js').then(m => m.renderEmployeeReviewsTab),
    'employee-training': () => import('./pages/media-training.js').then(m => m.renderEmployeeTrainingTab),
    estimator: () => import('./pages/employee.js').then(m => m.renderEmployeeEstimatorTab),
    'service-pricing': () => import('./pages/employee.js').then(m => m.renderEmployeePricingTab),
    'device-followup': () => import('./pages/employee.js').then(m => m.renderEmployeeFollowUp),
    'assign-requests': () => import('./pages/assign-requests.js').then(m => m.renderAssignRequestsTab),
    notifications: () => import('./pages/notifications.js').then(m => m.renderNotificationsTab),
    'my-training-courses': () => import('./pages/training.js').then(m => m.renderEmployeeCourses),
    calendar: () => import('./pages/calendar.js').then(m => m.renderCalendarTab),
    profile: () => import('./pages/profile.js').then(m => m.renderProfile),
  },
  admin: {
    dashboard: () => import('./pages/admin-dashboard.js').then(m => m.renderAdminDashboard),
    stats: () => import('./pages/stats-admin.js').then(m => m.renderAdminStats),
    attendance: () => import('./pages/attendance-admin.js').then(m => m.renderAttendanceTab),
    inquiries: () => import('./pages/service-requests-admin.js').then(m => m.renderServiceRequestsTab),
    queries: () => import('./pages/queries.js').then(m => m.renderQueriesTab),
    installations: () => import('./pages/admin.js').then(m => m.renderInstallationsTab),
    'job-cards': () => import('./pages/job-cards.js').then(m => m.renderJobCardsTab),
    'service-log': () => import('./pages/service-log.js').then(m => m.renderServiceLogTab),
    'response-times': () => import('./pages/response-times.js').then(m => m.renderResponseTimesTab),
    reviews: () => import('./pages/reviews.js').then(m => m.renderAdminReviewsTab),
    contacts: () => import('./pages/admin.js').then(m => m.renderContacts),
    users: () => import('./pages/admin.js').then(m => m.renderUsers),
    'employee-panel': () => import('./pages/admin.js').then(m => m.renderEmployeePanel),
    profile: () => import('./pages/profile.js').then(m => m.renderProfile),
    payments: () => import('./pages/admin.js').then(m => m.renderPaymentsTab),
    bills: () => import('./pages/admin.js').then(m => m.renderBillsTab),
    cash: () => import('./pages/admin.js').then(m => m.renderCashCollectionsTab),
    salary: () => import('./pages/admin.js').then(m => m.renderSalaryOverview),
    'gig-payouts': () => import('./pages/admin.js').then(m => m.renderGigPayoutsTab),
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
    'live-locations': () => import('./pages/live-locations-admin.js').then(m => m.renderLiveLocationsTab),
    finance: () => import('./pages/finance.js').then(m => m.renderFinanceReportTab),
    notifications: () => import('./pages/notifications.js').then(m => m.renderNotificationsTab),
    'training-courses': () => import('./pages/training.js').then(m => m.renderTrainingCoursesAdmin),
    calendar: () => import('./pages/calendar.js').then(m => m.renderCalendarTab),
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
  // Expose for the global refresh FAB and notification navigation
  window.__softRefresh = () => navigate(activePage, { push: false });
  window.__appNav  = (page) => navigate(page);
  window.__appRole = currentRole;
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
  stopLiveLocationPing();
  renderLandingPage(app, showAuth);
  showPWAInstallBtn();
}

function goToInstall() {
  hidePWAInstallBtn();
  renderInstallPage(app, (installType) => {
    if (installType) {
      // User chose an installation type — go to landing with ?tab=install&type=...
      window.history.replaceState({}, '', `/?tab=install&type=${encodeURIComponent(installType)}`);
    } else {
      window.history.replaceState({}, '', '/');
    }
    goToLanding();
  });
}

// Expose for landing page to navigate to install page
window.__goToInstall = goToInstall;

function isInstallRoute() {
  const params = new URLSearchParams(window.location.search);
  return params.get('tab') === 'install' && !params.has('type');
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

// Admin-granted: this employee may see every service request and assign it to
// a technician (server enforces it via profiles.can_assign_tickets).
let canAssignTickets = false;
const readCanAssignTickets = (u) => (u?.can_assign_tickets === 1 || u?.can_assign_tickets === true);

// Gig workers get an extra "Public Jobs" tab fixed employees never see.
let isGigWorker = false;
const readIsGigWorker = (u) => u?.worker_type === 'gig';

// Admin-controlled: hides the Installations tab for this employee regardless
// of worker type. Defaults to true (visible) when the field is absent.
let installationsEnabled = true;
const readInstallationsEnabled = (u) => u?.installations_enabled === undefined || u?.installations_enabled === null || Number(u.installations_enabled) === 1;

// Per-user tab access. null = all tabs allowed; otherwise a Set of permitted
// tab ids (admin-controlled in the Users screen). Tabs that must never be
// locked out (dashboard/notifications/profile) are always kept in getNavItems.
let allowedTabs = null;
const readAllowedTabs = (u) => {
  let v = u?.allowed_tabs;
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
  return Array.isArray(v) ? new Set(v.map(String)) : null;
};

let _profileChannel = null;
function watchMyProfile(userId) {
  if (_profileChannel) { supabase.removeChannel(_profileChannel); _profileChannel = null; }
  _profileChannel = supabase.channel('my-profile')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, (payload) => {
      const fresh = payload.new;
      if (!fresh) return;
      if (currentRole === 'employee') {
        canAddService = readCanAddService(fresh); canAssignTickets = readCanAssignTickets(fresh);
        allowedTabs = readAllowedTabs(fresh);
        isGigWorker = readIsGigWorker(fresh);
        installationsEnabled = readInstallationsEnabled(fresh);
        // Re-render nav so hidden/shown tabs take effect immediately.
        navigate(activePage, { push: false });
      }
    })
    .subscribe();
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
      localStorage.setItem(SESSION_DAY_KEY, todayKey());
      if (role === 'employee') { canAddService = readCanAddService(user); canAssignTickets = readCanAssignTickets(user); allowedTabs = readAllowedTabs(user); isGigWorker = readIsGigWorker(user); installationsEnabled = readInstallationsEnabled(user); startLiveLocationPing(user.id); }
      watchMyProfile(user.id);
      navigate('dashboard');
    },
    () => goToLanding()
  );
}

// ── 30-DAY SESSION EXPIRY (employees + admin) ─────────
// Sessions stay valid for 30 days from login, matching the 30-day JWT issued
// by the server. The forced clock-in popup doesn't depend on this — it's
// driven by whether today's attendance row has a clock_in, so a long-lived
// session still shows it fresh every new day.
const SESSION_DAY_KEY = 'nest-session-day';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const todayKey = () => new Date().toLocaleDateString('en-CA');

function isEmployeeSessionExpired() {
  const saved = localStorage.getItem(SESSION_DAY_KEY);
  if (!saved) return false;
  const savedMs = Date.parse(saved);
  if (Number.isNaN(savedMs)) return false;
  return (Date.now() - savedMs) >= SESSION_MAX_AGE_MS;
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

  // Direct link to install page (e.g. /?tab=install)
  if (isInstallRoute()) {
    goToInstall();
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

      if (currentRole === 'employee') { canAddService = readCanAddService(currentUser); canAssignTickets = readCanAssignTickets(currentUser); allowedTabs = readAllowedTabs(currentUser); isGigWorker = readIsGigWorker(currentUser); installationsEnabled = readInstallationsEnabled(currentUser); startLiveLocationPing(currentUser.id); }
      watchMyProfile(currentUser.id);
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
