'use strict';

// Which parts of the admin portal a limited admin may use.
//
// An admin account can be limited to a list of modules (profiles.admin_modules,
// a JSON array of module ids; NULL = the whole portal). The ids are the sidebar
// page ids of the web portal, so the web sidebar, the mobile admin menu and this
// file all speak the same names.
//
// The server enforces it: every API call that belongs to a module is refused
// for a limited admin who does not have that module. A hidden button is not a
// permission. Calls that belong to no module (login, notifications, the
// dashboard feed, the user's own profile) are open to every admin.
//
// Some pages share data: Customers feed invoices, items feed purchase orders.
// Those calls list every module that may use them, and any one is enough.

const MODULES = [
    // Work
    { id: 'inquiries', label: 'Service Requests', group: 'Work' },
    { id: 'queries', label: 'Queries & Follow-ups', group: 'Work' },
    { id: 'installations', label: 'Installations', group: 'Work' },
    { id: 'job-costing', label: 'Job Costing', group: 'Work' },
    { id: 'device-tracking', label: 'Device Tracking', group: 'Work' },
    // Customers
    { id: 'parties', label: 'Customers & Suppliers', group: 'Customers' },
    { id: 'devices', label: 'Sites & Devices', group: 'Customers' },
    { id: 'amc', label: 'AMC Contracts', group: 'Customers' },
    { id: 'contacts', label: 'Contacts', group: 'Customers' },
    { id: 'complaints', label: 'Complaints', group: 'Customers' },
    // Sales
    { id: 'sales', label: 'Invoices & Quotations', group: 'Sales' },
    { id: 'past-records', label: 'Past Records (Vyapar)', group: 'Sales' },
    // Purchases & stock
    { id: 'purchases', label: 'Purchases', group: 'Purchases & Stock' },
    { id: 'stock', label: 'Stock', group: 'Purchases & Stock' },
    { id: 'inventory', label: 'Items', group: 'Purchases & Stock' },
    // Accounts
    { id: 'ledger', label: 'Ledger & Journals', group: 'Accounts' },
    { id: 'fin-reports', label: 'Financial Reports', group: 'Accounts' },
    { id: 'migration', label: 'Data Migration', group: 'Accounts' },
    // Operations
    { id: 'calendar', label: 'Calendar', group: 'Operations' },
    { id: 'attendance', label: 'Attendance', group: 'Operations' },
    { id: 'job-cards', label: 'Job Cards', group: 'Operations' },
    { id: 'service-log', label: 'Service Log', group: 'Operations' },
    { id: 'reviews', label: 'Bonus Reviews', group: 'Operations' },
    { id: 'auto-assignment', label: 'Auto Assignment', group: 'Operations' },
    { id: 'assignment-tracker', label: 'Assignment Tracker', group: 'Operations' },
    { id: 'live-locations', label: 'Live Locations', group: 'Operations' },
    // Reports
    { id: 'daily-report', label: 'Daily Report', group: 'Reports' },
    { id: 'stats', label: 'Stats', group: 'Reports' },
    { id: 'response-times', label: 'Response Time', group: 'Reports' },
    { id: 'feedback', label: 'Employee Performance', group: 'Reports' },
    { id: 'finance', label: 'Finance', group: 'Reports' },
    { id: 'ai-report', label: 'AI Reports', group: 'Reports' },
    { id: 'payments', label: 'Payments', group: 'Reports' },
    { id: 'bills', label: 'Bills', group: 'Reports' },
    { id: 'cash', label: 'Cash Collections', group: 'Reports' },
    { id: 'collections', label: 'Collection Reports', group: 'Reports' },
    { id: 'salary', label: 'Salary', group: 'Reports' },
    { id: 'gig-payouts', label: 'Gig Payouts', group: 'Reports' },
    { id: 'leaves', label: 'Leave Requests', group: 'Reports' },
    { id: 'eod', label: 'EOD Summaries', group: 'Reports' },
    // Management
    { id: 'employee-panel', label: 'Employees', group: 'Management' },
    { id: 'users', label: 'Users', group: 'Management' },
    { id: 'device-types', label: 'Device Types', group: 'Management' },
    { id: 'pricing', label: 'Pricing', group: 'Management' },
    { id: 'business-settings', label: 'Business & Tax Setup', group: 'Management' },
    { id: 'training-admin', label: 'Employee Tutorials', group: 'Management' },
    { id: 'training-courses', label: 'Training Courses', group: 'Management' },
    { id: 'settings', label: 'Settings', group: 'Management' },
    // Marketing
    { id: 'ads', label: 'Landing Ads', group: 'Marketing' },
    { id: 'popup-ads', label: 'Popup Ads', group: 'Marketing' },
    { id: 'campaigns', label: 'WhatsApp Campaigns', group: 'Marketing' },
    { id: 'notices', label: 'Notices', group: 'Marketing' },
    { id: 'discounts', label: 'Coupons', group: 'Marketing' },
    { id: 'discount-details', label: 'Discount Details', group: 'Marketing' },
];

const MODULE_IDS = new Set(MODULES.map((m) => m.id));
const LABELS = new Map(MODULES.map((m) => [m.id, m.label]));

// Always available to every admin; never part of the list.
const ALWAYS_ON = ['dashboard', 'notifications', 'profile'];

const READ = new Set(['GET', 'HEAD', 'OPTIONS']);

// [path pattern, modules (any one is enough), { write: true } = only for changes]
// The first matching rule wins, so the specific ones come first.
const RULES = [
    // The accounting set-up is read by every page that prices or numbers a
    // document, but only Business & Tax Setup may change it.
    [/^\/accounting\/(business|tax-rates|series)(\/|$)/, ['business-settings'], { write: true }],
    [/^\/accounting\/(business|tax-rates|series)(\/|$)/, ['business-settings', 'sales', 'purchases', 'ledger', 'fin-reports', 'inventory', 'stock', 'amc', 'parties']],
    [/^\/accounting\/(journals|accounts|trial-balance|opening-balances|period-locks|audit)(\/|$)/, ['ledger', 'fin-reports']],

    [/^\/sales(\/|$)/, ['sales', 'fin-reports', 'collections', 'amc']],
    [/^\/payments(\/|$)/, ['sales', 'fin-reports']],
    [/^\/purchases(\/|$)/, ['purchases', 'stock', 'fin-reports']],
    [/^\/stock(\/|$)/, ['stock', 'inventory', 'purchases']],
    [/^\/inventory(\/|$)/, ['inventory', 'stock', 'sales', 'purchases', 'job-costing', 'installations']],
    [/^\/parties(\/|$)/, ['parties', 'sales', 'purchases', 'amc', 'devices', 'ledger', 'fin-reports']],

    [/^\/reports(\/|$)/, ['fin-reports', 'finance', 'stats', 'daily-report', 'collections']],
    [/^\/finance(\/|$)/, ['finance', 'fin-reports', 'daily-report']],
    [/^\/ai(\/|$)/, ['ai-report', 'finance']],

    [/^\/amc(\/|$)/, ['amc', 'devices', 'sales', 'inquiries']],
    [/^\/(devices|device-sites)(\/|$)/, ['devices', 'amc', 'sales', 'inquiries']],
    [/^\/device-tracking(\/|$)/, ['device-tracking', 'inquiries']],

    [/^\/campaigns(\/|$)/, ['campaigns']],
    [/^\/whatsapp(\/|$)/, ['campaigns', 'business-settings', 'sales', 'amc', 'assignment-tracker', 'inquiries', 'fin-reports']],
    [/^\/migration(\/|$)/, ['migration']],
    [/^\/vyapar(\/|$)/, ['past-records', 'migration']],
    [/^\/backup(\/|$)/, ['migration', 'settings']],

    [/^\/jobs(\/|$)/, ['job-costing', 'installations', 'inquiries']],
    [/^\/job-cards(\/|$)/, ['job-cards']],
    [/^\/service-logs?(\/|$)/, ['service-log']],
    [/^\/response-times(\/|$)/, ['response-times']],
    [/^\/review-submissions(\/|$)/, ['reviews']],
    [/^\/assignments(\/|$)/, ['assignment-tracker', 'inquiries']],
    [/^\/auto-assignment(\/|$)/, ['auto-assignment'], { write: true }],
    [/^\/live-location(\/|$)/, ['live-locations', 'attendance']],
    [/^\/training(\/|$)/, ['training-admin', 'training-courses']],

    [/^\/admin\/users(\/|$)/, ['users', 'employee-panel']],
    [/^\/admin\/leaderboard(\/|$)/, ['feedback']],
    [/^\/admin\/(pending-jobs|daily-jobs)(\/|$)/, ['daily-report']],
    [/^\/admin\/inquiries(\/|$)/, ['inquiries']],
    [/^\/settings(\/|$)/, ['settings'], { write: true }],

    // The generic data endpoint: only tables that belong to one page (or a few).
    [/^\/data\/coupons(\/|$)/, ['discounts', 'discount-details', 'inquiries']],
    [/^\/data\/discount_presets(\/|$)/, ['discounts', 'discount-details', 'inquiries']],
    [/^\/data\/ads(\/|$)/, ['ads', 'popup-ads']],
    [/^\/data\/notices(\/|$)/, ['notices']],
    [/^\/data\/training_(items|completions)(\/|$)/, ['training-admin', 'training-courses']],
    [/^\/data\/service_pricing(\/|$)/, ['pricing', 'inquiries', 'installations']],
    [/^\/data\/device_types(\/|$)/, ['device-types', 'inquiries', 'devices']],
    [/^\/data\/complaints(\/|$)/, ['complaints']],
    [/^\/data\/queries(\/|$)/, ['queries']],
    [/^\/data\/contacts(\/|$)/, ['contacts', 'inquiries']],
    [/^\/data\/cash_collections(\/|$)/, ['cash', 'payments', 'collections']],
    [/^\/data\/bills(\/|$)/, ['bills', 'payments']],
    [/^\/data\/payments(\/|$)/, ['payments', 'sales']],
    [/^\/data\/leave_requests(\/|$)/, ['leaves', 'attendance']],
    [/^\/data\/eod_reports(\/|$)/, ['eod', 'attendance', 'daily-report']],
    [/^\/data\/profiles(\/|$)/, ['users', 'employee-panel', 'salary'], { write: true }],
];

// '/api/sales/documents?x=1' -> '/sales/documents'
function normalizePath(path) {
    let p = String(path || '').split('?')[0];
    p = p.replace(/^\/api(?=\/|$)/, '');
    if (p.length > 1) p = p.replace(/\/+$/, '');
    return p || '/';
}

// Modules (any one) a call needs, or null when it belongs to no module.
function requiredModules(method, path) {
    const m = String(method || 'GET').toUpperCase();
    const p = normalizePath(path);
    for (const [re, modules, opts] of RULES) {
        if (!re.test(p)) continue;
        if (opts && opts.write && READ.has(m)) continue;
        return modules;
    }
    return null;
}

// Checks a limited admin's module list against one call.
// `modules` is the stored list; null means the account is not limited.
function verdict(modules, method, path) {
    const need = requiredModules(method, path);
    if (!need || modules === null || modules === undefined) return { allowed: true, needs: need };
    return need.some((id) => modules.includes(id))
        ? { allowed: true, needs: need }
        : { allowed: false, needs: need };
}

// What the Users form posts -> what is stored. null = not limited.
function normalizeModules(input) {
    if (input === null || input === undefined) return null;
    if (!Array.isArray(input)) throw new Error('admin_modules must be a list of module ids');
    const clean = [...new Set(input.map(String))].filter((id) => MODULE_IDS.has(id));
    return clean;
}

// A stored column value -> a list or null.
function parseStored(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    try {
        const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(v) ? v.map(String) : null;
    } catch {
        // An unreadable limit must not turn into full access.
        return [];
    }
}

function message(needs) {
    const names = (needs || []).slice(0, 3).map((id) => LABELS.get(id) || id);
    return `Your account does not have access to ${names.join(' / ') || 'this part of the portal'}.`;
}

module.exports = { MODULES, MODULE_IDS, ALWAYS_ON, RULES, normalizePath, requiredModules, verdict, normalizeModules, parseStored, message };
