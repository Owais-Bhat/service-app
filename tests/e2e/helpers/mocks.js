// Central API mock library — intercepts all /api/* calls with realistic data.
// IMPORTANT: Playwright processes routes LIFO (last registered = highest priority).
// The catch-all is registered FIRST so specific routes registered after it take precedence.

export const ADMIN_USER = {
  id: 'admin-uuid-001',
  email: 'admin@test.com',
  role: 'admin',
  full_name: 'Test Admin',
  allowed_tabs: null,
  can_add_service: false,
};

export const EMPLOYEE_USER = {
  id: 'emp-uuid-001',
  email: 'emp@test.com',
  role: 'employee',
  full_name: 'Test Employee',
  allowed_tabs: null,
  can_add_service: false,
};

export const MOCK_TOKEN = 'mock-jwt-token-for-testing';

const MOCK_INQUIRIES = [
  { id: 1, ticket_no: 'NE-260617-0001', customer_name: 'John Doe', customer_phone: '9876543210', phone: '9876543210', device_type: 'Laptop', issue: 'Screen broken', status: 'open', bill: 0, payment: 0, created_at: new Date().toISOString(), assigned_to: null },
  { id: 2, ticket_no: 'NE-260617-0002', customer_name: 'Jane Smith', customer_phone: '9123456789', phone: '9123456789', device_type: 'Mobile', issue: 'Battery drain', status: 'in_progress', bill: 1500, payment: 500, created_at: new Date().toISOString(), assigned_to: 'emp-uuid-001' },
  { id: 3, ticket_no: 'NE-260617-0003', customer_name: 'Bob Wilson', customer_phone: '9988776655', phone: '9988776655', device_type: 'Printer', issue: 'Not printing', status: 'resolved', bill: 800, payment: 800, created_at: new Date().toISOString(), assigned_to: 'emp-uuid-001' },
];

// Ticket IDs must be UUID strings — admin.js does t.id.slice(0, 8).
// Embed flat inquiry fields so employee.js jobCard never crashes on inq.phone.
const MOCK_TICKETS = [
  {
    id: 'ticket-uuid-0001-mock-e2e',
    inquiry_id: 2,
    assigned_to: 'emp-uuid-001',
    status: 'in_progress',
    due_date: new Date(Date.now() + 86400000).toISOString(),
    created_at: new Date().toISOString(),
    // Embedded inquiry fields (backend join)
    ticket_no: 'NE-260617-0002',
    customer_name: 'Jane Smith',
    phone: '9123456789',
    customer_phone: '9123456789',
    device_type: 'Mobile',
    issue: 'Battery drain',
    bill: 1500,
    payment: 500,
  },
];

const MOCK_PROFILES = [
  { id: 'admin-uuid-001', full_name: 'Test Admin', email: 'admin@test.com', role: 'admin', allowed_tabs: null },
  { id: 'emp-uuid-001', full_name: 'Test Employee', email: 'emp@test.com', role: 'employee', allowed_tabs: null },
];

const MOCK_ATTENDANCE = [
  { id: 1, user_id: 'emp-uuid-001', clock_in: new Date().toISOString(), clock_out: null, date: new Date().toISOString().split('T')[0] },
];

// Finance mock matches finance.js expected shape:
// d.totals.{billed,received,pending,billsCount,paidCount,avgTicket,gst,cashInHand}
// d.byCategory[].{category,revenue,items}
// d.byMethod.{online,cash,unknown}
// d.byTechnician[].{name,jobs,billed,received}
// d.aging.{'0-7','8-30','31+'}  (object)
// d.trend[].{month,billed,received}
// d.byMonth[].{month,billed,received}
// d.byCompany[].{company,billed,received}
const MOCK_FINANCE = {
  totals: {
    billed: 45000,
    received: 38000,
    pending: 7000,
    billsCount: 54,
    paidCount: 46,
    avgTicket: 833,
    gst: 0,
    cashInHand: 0,
  },
  previous: null,
  byCategory: [
    { category: 'Laptop', revenue: 18000, items: 12 },
    { category: 'Mobile', revenue: 12000, items: 9 },
    { category: 'Printer', revenue: 8000, items: 7 },
    { category: 'Network', revenue: 7000, items: 5 },
  ],
  byMethod: { online: 15000, cash: 20000, unknown: 3000 },
  byTechnician: [
    { name: 'Test Employee', jobs: 34, billed: 22000, received: 19000 },
  ],
  aging: { '0-7': 3500, '8-30': 2800, '31+': 700 },
  trend: [
    { month: '2026-01', billed: 38000, received: 31000 },
    { month: '2026-02', billed: 41000, received: 34000 },
    { month: '2026-03', billed: 45000, received: 38000 },
  ],
  byMonth: [
    { month: '2026-01', billed: 38000, received: 31000 },
    { month: '2026-02', billed: 41000, received: 34000 },
    { month: '2026-03', billed: 45000, received: 38000 },
  ],
  byCompany: [],
  insights: [],
};

const MOCK_NOTIFICATIONS = [
  { id: 1, user_id: 'admin-uuid-001', title: 'New ticket assigned', body: 'NE-260617-0001 needs review', read: false, created_at: new Date().toISOString() },
  { id: 2, user_id: 'admin-uuid-001', title: 'Payment received', body: '₹500 collected for NE-260617-0002', read: true, created_at: new Date().toISOString() },
];

const MOCK_DEVICE_LOGS = [
  { id: 1, ticket_id: 2, device_label: 'Laptop #12', taken_by: 'emp-uuid-001', taken_at: new Date().toISOString(), returned_at: null, status: 'with_employee' },
];

const MOCK_SERVICE_PRICING = [
  { id: 1, category: 'Laptop', item: 'Screen Replacement', price: 3500, active: true },
  { id: 2, category: 'Mobile', item: 'Battery Replacement', price: 800, active: true },
  { id: 3, category: 'Printer', item: 'Cartridge Refill', price: 400, active: true },
];

const MOCK_BOOTSTRAP = {
  ads: [{ id: 1, title: 'Summer Offer', description: '20% off on all repairs', image_url: null, active: true }],
  service_pricing: MOCK_SERVICE_PRICING,
  settings: { show_otp: true, company_name: 'Networking Experts' },
};

function json(data, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(data) };
}

export async function setupMocks(page, overrides = {}) {
  const user = overrides.user ?? ADMIN_USER;

  // ── CATCH-ALL FIRST (lowest priority in LIFO, acts as fallback) ───────────
  // Return bare array — the QueryBuilder expects the server to return raw data,
  // NOT a Supabase-style {data, error} wrapper.
  await page.route('**/api/**', async (route) => {
    await route.fulfill(json([]));
  });

  // ── SPECIFIC ROUTES (higher priority — override catch-all) ────────────────
  await page.route('**/api/events/**', async (route) => route.abort());
  await page.route('**/api/events/poll**', async (route) => route.fulfill(json({ events: [], cursor: 0 })));

  await page.route('**/api/auth/signin', async (route) => {
    const body = route.request().postDataJSON();
    if (body.email === ADMIN_USER.email) {
      await route.fulfill(json({ user: ADMIN_USER, token: MOCK_TOKEN }));
    } else if (body.email === EMPLOYEE_USER.email || body.email === 'new@test.com') {
      // Accept new@test.com so signup auto-login succeeds in tests
      const u = body.email === EMPLOYEE_USER.email ? EMPLOYEE_USER : { ...EMPLOYEE_USER, email: 'new@test.com' };
      await route.fulfill(json({ user: u, token: MOCK_TOKEN }));
    } else {
      // signIn() checks result.error as a string: `result.error || 'Sign in failed'`
      await route.fulfill(json({ error: 'Invalid email or password' }, 401));
    }
  });

  await page.route('**/api/auth/signup', async (route) => {
    await route.fulfill(json({ user: { ...EMPLOYEE_USER, email: 'new@test.com' }, token: MOCK_TOKEN }));
  });

  await page.route('**/api/auth/me', async (route) => {
    const authHeader = route.request().headers()['authorization'] || '';
    if (authHeader.includes(MOCK_TOKEN)) {
      await route.fulfill(json({ user }));
    } else {
      await route.fulfill(json({ error: 'Unauthorized' }, 401));
    }
  });

  await page.route('**/api/landing/bootstrap**', async (route) => {
    await route.fulfill(json(MOCK_BOOTSTRAP));
  });

  await page.route('**/api/data/inquiries**', async (route) => {
    const method = route.request().method();
    if (method === 'POST') await route.fulfill(json([{ ...MOCK_INQUIRIES[0], id: 99, ticket_no: 'NE-260617-0099' }]));
    else if (method !== 'GET') await route.fulfill(json({ success: true }));
    else await route.fulfill(json(MOCK_INQUIRIES));
  });

  await page.route('**/api/data/tickets**', async (route) => {
    if (route.request().method() === 'GET') await route.fulfill(json(MOCK_TICKETS));
    else await route.fulfill(json({ success: true }));
  });

  await page.route('**/api/data/profiles**', async (route) => {
    await route.fulfill(json(MOCK_PROFILES));
  });

  await page.route('**/api/data/attendance**', async (route) => {
    if (route.request().method() === 'GET') await route.fulfill(json(MOCK_ATTENDANCE));
    else await route.fulfill(json([{ ...MOCK_ATTENDANCE[0], id: 99 }]));
  });

  await page.route('**/api/data/service_pricing**', async (route) => {
    await route.fulfill(json(MOCK_SERVICE_PRICING));
  });

  await page.route('**/api/data/device_types**', async (route) => {
    await route.fulfill(json([{ id: 1, name: 'Laptop' }, { id: 2, name: 'Mobile' }]));
  });

  // Use regex to reliably match cross-origin absolute URLs (http://localhost:5000/api/finance/summary?...)
  await page.route(/\/finance\/summary/, async (route) => {
    await route.fulfill(json(MOCK_FINANCE));
  });

  await page.route(/\/api\/ai\/finance/, async (route) => {
    await route.fulfill(json({ insight: 'Revenue is trending up by 12% MoM. Collection rate is healthy at 84.4%. Follow up on 30+ day aging items.' }));
  });

  await page.route(/\/api\/ai\//, async (route) => {
    const body = await route.request().postDataJSON().catch(() => ({}));
    await route.fulfill(json({ answer: `AI response for: ${body.question || 'your query'}`, tokens_used: 150 }));
  });

  await page.route('**/api/notifications/unread-count**', async (route) => {
    await route.fulfill(json({ count: 1 }));
  });

  await page.route('**/api/notifications**', async (route) => {
    if (route.request().method() === 'PATCH') await route.fulfill(json({ success: true }));
    else await route.fulfill(json(MOCK_NOTIFICATIONS));
  });

  await page.route('**/api/device-tracking**', async (route) => {
    if (route.request().method() === 'GET') await route.fulfill(json(MOCK_DEVICE_LOGS));
    else await route.fulfill(json({ id: 99, status: 'success' }));
  });

  await page.route('**/api/settings/device-tracking**', async (route) => {
    await route.fulfill(json({ enabled: true }));
  });

  await page.route('**/api/service_pricing**', async (route) => {
    await route.fulfill(json(MOCK_SERVICE_PRICING));
  });
}

// Set auth token BEFORE page loads so boot() reads it immediately.
export async function loginAs(page, user = ADMIN_USER) {
  const today = new Date().toLocaleDateString('en-CA');
  await page.addInitScript(({ token, today: sessionDay }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('nest-session-day', sessionDay);
  }, { token: MOCK_TOKEN, today });
}

// Navigate within the SPA after boot. Boot always lands on #dashboard;
// use popstate dispatch to go to any other page without a full reload.
export async function navigateTo(page, hash) {
  await page.evaluate((h) => {
    history.pushState({ page: h, app: true }, '', `#${h}`);
    window.dispatchEvent(new PopStateEvent('popstate', { state: { page: h, app: true } }));
  }, hash);
  await page.waitForTimeout(700);
}
