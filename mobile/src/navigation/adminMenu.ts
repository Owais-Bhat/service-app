import { IconName } from '../theme/icons';

// The admin portal's menu, grouped exactly like the web sidebar
// (src/main.js getNavItems). An item with no `route` is on the web but not
// built on mobile yet — the menu shows it dimmed with a "Soon" tag so nothing
// is silently missing. Adding a screen = add it to AdminNavigator's registry
// and put its route name here.
export interface AdminMenuItem {
  label: string;
  hint: string;
  icon: IconName;
  route?: string;
  /** The web portal module that owns this page (see server/modules/admin-access.cjs). */
  module?: string | string[];
}

// Colour family of a group's icon tiles (design: each menu group has its own
// hue so the long list scans by colour). Resolved to theme tokens at render.
export type AdminMenuTone = 'ok' | 'info' | 'accent' | 'teal' | 'vio' | 'warn' | 'grey' | 'err';

export interface AdminMenuGroup {
  key: string;
  label: string;
  icon: IconName;
  tone: AdminMenuTone;
  items: AdminMenuItem[];
}

export const ADMIN_MENU: AdminMenuGroup[] = [
  {
    key: 'work',
    label: 'Work',
    icon: 'tasks',
    tone: 'ok',
    items: [
      { label: 'Service Requests', hint: 'Assign, track and bill requests', icon: 'tasks', route: 'ServiceRequests', module: 'inquiries' },
      { label: 'Queries & Follow-ups', hint: 'Customer queries to chase', icon: 'chat', route: 'Queries', module: 'queries' },
      { label: 'Installations', hint: 'Install jobs and technicians', icon: 'construct', route: 'Installations', module: 'installations' },
      { label: 'Record Materials', hint: 'Stock used or returned on a job', icon: 'box', route: 'JobMaterials', module: 'job-costing' },
      { label: 'Job Costing', hint: 'Materials, labour and margin', icon: 'calculator', route: 'JobCosting', module: 'job-costing' },
      { label: 'Device Tracking', hint: 'Devices taken for repair', icon: 'device', route: 'DeviceTracking', module: 'device-tracking' },
    ],
  },
  {
    key: 'customers',
    label: 'Customers',
    icon: 'people',
    tone: 'info',
    items: [
      { label: 'Customers & Suppliers', hint: 'Address book and balances', icon: 'people', route: 'Parties', module: 'parties' },
      { label: 'Sites & Devices', hint: 'Equipment and warranty', icon: 'layers', route: 'SitesDevices', module: 'devices' },
      { label: 'AMC Contracts', hint: 'Annual maintenance contracts', icon: 'shield', route: 'Amc', module: 'amc' },
      { label: 'Contacts', hint: 'Customer directory', icon: 'phone', route: 'Contacts', module: 'contacts' },
      { label: 'Complaints', hint: 'Respond and resolve', icon: 'alert', route: 'Complaints', module: 'complaints' },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    icon: 'receipt',
    tone: 'accent',
    items: [
      { label: 'Invoices & Quotations', hint: 'Sales documents', icon: 'receipt', route: 'Sales', module: 'sales' },
      { label: 'Past Records', hint: 'Imported Vyapar history', icon: 'book', route: 'PastRecords', module: 'past-records' },
    ],
  },
  {
    key: 'stock',
    label: 'Purchases & Stock',
    icon: 'box',
    tone: 'teal',
    items: [
      { label: 'Purchases', hint: 'Orders, bills and payables', icon: 'cart', route: 'Purchases', module: 'purchases' },
      { label: 'Stock', hint: 'Shelf, vans and valuation', icon: 'cube', route: 'Stock', module: 'stock' },
      { label: 'Items', hint: 'Item master and rates', icon: 'box', route: 'Items', module: 'inventory' },
    ],
  },
  {
    key: 'accounts',
    label: 'Accounts',
    icon: 'book',
    tone: 'vio',
    items: [
      { label: 'Ledger & Journals', hint: 'Trial balance and accounts', icon: 'book', route: 'Ledger', module: 'ledger' },
      { label: 'Financial Reports', hint: 'Books-based reports', icon: 'chart', route: 'FinReports', module: 'fin-reports' },
      { label: 'Data Migration', hint: 'Backup, Vyapar, older tickets, stock', icon: 'swap', route: 'Migration', module: 'migration' },
    ],
  },
  {
    key: 'operations',
    label: 'Operations',
    icon: 'clock',
    tone: 'warn',
    items: [
      { label: 'Attendance', hint: 'Logs, hours and restrictions', icon: 'clock', route: 'Attendance', module: 'attendance' },
      { label: 'Job Cards', hint: 'Pending entry and verification', icon: 'ticket', route: 'JobCards', module: 'job-cards' },
      { label: 'Service Log', hint: 'Daily service register', icon: 'list', route: 'ServiceLog', module: 'service-log' },
      { label: 'Bonus Reviews', hint: 'Verify review claims', icon: 'star', route: 'BonusReviewsAdmin', module: 'reviews' },
      { label: 'Auto Assignment', hint: 'Round-robin queue and switch', icon: 'swap', route: 'AutoAssignment', module: 'auto-assignment' },
      { label: 'Assignment Queue', hint: 'Requests and who holds them', icon: 'list', route: 'AssignmentQueue', module: 'inquiries' },
      { label: 'Assignment Tracker', hint: 'Who has not seen their job', icon: 'eye', route: 'AssignmentTracker', module: 'assignment-tracker' },
      { label: 'Live Locations', hint: 'Field staff on the map', icon: 'location', route: 'LiveLocations', module: 'live-locations' },
      { label: 'Calendar', hint: 'Dated installations', icon: 'calendar', route: 'Calendar', module: 'calendar' },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: 'chart',
    tone: 'info',
    items: [
      { label: 'Daily Report', hint: 'Attendance and pending jobs for WhatsApp', icon: 'whatsapp', route: 'DailyReport', module: 'daily-report' },
      { label: 'Attendance Report', hint: 'Present, absent, late, hours', icon: 'clock', route: 'AttendanceReport', module: 'attendance' },
      { label: 'Request Reports', hint: 'Technician report, top services', icon: 'report', route: 'RequestReports', module: 'stats' },
      { label: 'Stats', hint: 'Live operations overview', icon: 'chart', route: 'Stats', module: 'stats' },
      { label: 'Response Time', hint: 'Who was late and by how much', icon: 'clock', route: 'ResponseTimes', module: 'response-times' },
      { label: 'Client Feedback', hint: 'Ratings, rankings, by company', icon: 'star', route: 'ClientFeedback', module: 'feedback' },
      { label: 'Employee Performance', hint: 'Leaderboard and detail', icon: 'leaderboard', route: 'Performance', module: 'feedback' },
      { label: 'AI Reports', hint: 'Finance and employee progress summary', icon: 'chart', route: 'AiReport', module: 'ai-report' },
      { label: 'AI Assistant', hint: 'Fix steps and solution videos', icon: 'chat', route: 'AiAssistant', module: 'ai-report' },
      { label: 'Finance', hint: 'Billed, received, pending', icon: 'wallet', route: 'Finance', module: 'finance' },
      { label: 'Collection Reports', hint: 'Collected by employee and period', icon: 'wallet', route: 'Collections', module: 'collections' },
      { label: 'Payments', hint: 'Billed jobs and payment status', icon: 'cash', route: 'Payments', module: 'payments' },
      { label: 'Bills', hint: 'Generated invoices', icon: 'document', route: 'Bills', module: 'bills' },
      { label: 'Cash Collections', hint: 'Cash held by technicians', icon: 'cash', route: 'CashCollections', module: 'cash' },
      { label: 'Salary', hint: 'Attendance-based estimate', icon: 'wallet', route: 'Salary', module: 'salary' },
      { label: 'Gig Payouts', hint: 'Public-pool worker payouts', icon: 'wallet', route: 'GigPayouts', module: 'gig-payouts' },
      { label: 'Leave Requests', hint: 'Approve or reject', icon: 'calendar', route: 'LeaveRequests', module: 'leaves' },
      { label: 'EOD Summaries', hint: 'End-of-day reports', icon: 'report', route: 'EodSummaries', module: 'eod' },
    ],
  },
  {
    key: 'management',
    label: 'Management',
    icon: 'user',
    tone: 'grey',
    items: [
      { label: 'Employees', hint: 'Per-employee overview', icon: 'people', route: 'Employees', module: 'employee-panel' },
      { label: 'Users', hint: 'Accounts, roles and access', icon: 'user', route: 'Users', module: 'users' },
      { label: 'Device Types & Companies', hint: 'Lists used in requests', icon: 'device', route: 'DeviceTypes', module: 'device-types' },
      { label: 'Service Pricing', hint: 'Price list', icon: 'pricetag', route: 'ServicePricing', module: 'pricing' },
      { label: 'Employee Tutorials', hint: 'Upload media, track completion', icon: 'tutorial', route: 'TutorialsAdmin', module: 'training-admin' },
      { label: 'Training Courses', hint: 'Courses and progress', icon: 'training', route: 'TrainingAdmin', module: 'training-courses' },
      { label: 'Business & Tax Setup', hint: 'Legal details, numbering, tax rates', icon: 'receipt', route: 'BusinessSettings', module: 'business-settings' },
      { label: 'My Profile', hint: 'Your details and password', icon: 'user', route: 'Profile' },
      { label: 'Settings', hint: 'Clock-in rules, keys, policies', icon: 'settings', route: 'Settings', module: 'settings' },
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    icon: 'megaphone',
    tone: 'err',
    items: [
      { label: 'Notices', hint: 'Post to the employee dashboard', icon: 'notification', route: 'Notices', module: 'notices' },
      { label: 'Coupons', hint: 'Discount codes', icon: 'ticket', route: 'Coupons', module: 'discounts' },
      { label: 'Discount Details', hint: 'Discounts given by staff', icon: 'pricetag', route: 'DiscountDetails', module: 'discount-details' },
      { label: 'Landing & Popup Ads', hint: 'Carousel and popups', icon: 'megaphone', route: 'Ads', module: ['ads', 'popup-ads'] },
      { label: 'WhatsApp Campaigns', hint: 'Broadcasts to customers', icon: 'whatsapp', route: 'Campaigns', module: 'campaigns' },
    ],
  },
];
