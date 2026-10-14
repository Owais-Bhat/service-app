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
}

export interface AdminMenuGroup {
  key: string;
  label: string;
  icon: IconName;
  items: AdminMenuItem[];
}

export const ADMIN_MENU: AdminMenuGroup[] = [
  {
    key: 'work',
    label: 'Work',
    icon: 'tasks',
    items: [
      { label: 'Service Requests', hint: 'Assign, track and bill requests', icon: 'tasks', route: 'ServiceRequests' },
      { label: 'Queries & Follow-ups', hint: 'Customer queries to chase', icon: 'chat', route: 'Queries' },
      { label: 'Installations', hint: 'Install jobs and technicians', icon: 'construct', route: 'Installations' },
      { label: 'Job Costing', hint: 'Materials, labour and margin', icon: 'calculator', route: 'JobCosting' },
      { label: 'Device Tracking', hint: 'Devices taken for repair', icon: 'device', route: 'DeviceTracking' },
    ],
  },
  {
    key: 'customers',
    label: 'Customers',
    icon: 'people',
    items: [
      { label: 'Customers & Suppliers', hint: 'Address book and balances', icon: 'people', route: 'Parties' },
      { label: 'Sites & Devices', hint: 'Equipment and warranty', icon: 'layers', route: 'SitesDevices' },
      { label: 'AMC Contracts', hint: 'Annual maintenance contracts', icon: 'shield', route: 'Amc' },
      { label: 'Contacts', hint: 'Customer directory', icon: 'phone', route: 'Contacts' },
      { label: 'Complaints', hint: 'Respond and resolve', icon: 'alert', route: 'Complaints' },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    icon: 'receipt',
    items: [
      { label: 'Invoices & Quotations', hint: 'Sales documents', icon: 'receipt', route: 'Sales' },
      { label: 'Past Records', hint: 'Imported history', icon: 'book', route: 'PastRecords' },
    ],
  },
  {
    key: 'stock',
    label: 'Purchases & Stock',
    icon: 'box',
    items: [
      { label: 'Purchases', hint: 'Orders, bills and payables', icon: 'cart', route: 'Purchases' },
      { label: 'Stock', hint: 'Shelf, vans and valuation', icon: 'cube', route: 'Stock' },
      { label: 'Items', hint: 'Item master and rates', icon: 'box', route: 'Items' },
    ],
  },
  {
    key: 'accounts',
    label: 'Accounts',
    icon: 'book',
    items: [
      { label: 'Ledger & Journals', hint: 'Trial balance and accounts', icon: 'book', route: 'Ledger' },
      { label: 'Financial Reports', hint: 'Books-based reports', icon: 'chart', route: 'FinReports' },
      { label: 'Data Migration', hint: 'Backup, Vyapar, older tickets, stock', icon: 'swap', route: 'Migration' },
    ],
  },
  {
    key: 'operations',
    label: 'Operations',
    icon: 'clock',
    items: [
      { label: 'Attendance', hint: 'Logs, hours and restrictions', icon: 'clock', route: 'Attendance' },
      { label: 'Job Cards', hint: 'Pending entry and verification', icon: 'ticket', route: 'JobCards' },
      { label: 'Service Log', hint: 'Daily service register', icon: 'list', route: 'ServiceLog' },
      { label: 'Bonus Reviews', hint: 'Verify review claims', icon: 'star', route: 'BonusReviewsAdmin' },
      { label: 'Auto Assignment', hint: 'Round-robin queue and switch', icon: 'swap', route: 'AutoAssignment' },
      { label: 'Assignment Queue', hint: 'Requests and who holds them', icon: 'list', route: 'AssignmentQueue' },
      { label: 'Assignment Tracker', hint: 'Who has not seen their job', icon: 'eye', route: 'AssignmentTracker' },
      { label: 'Live Locations', hint: 'Field staff on the map', icon: 'location', route: 'LiveLocations' },
      { label: 'Calendar', hint: 'Dated installations', icon: 'calendar', route: 'Calendar' },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: 'chart',
    items: [
      { label: 'Stats', hint: 'Live operations overview', icon: 'chart', route: 'Stats' },
      { label: 'Response Time', hint: 'Who was late and by how much', icon: 'clock', route: 'ResponseTimes' },
      { label: 'Employee Performance', hint: 'Leaderboard', icon: 'leaderboard', route: 'Performance' },
      { label: 'AI Reports', hint: 'Finance and employee progress summary', icon: 'chart', route: 'AiReport' },
      { label: 'AI Assistant', hint: 'Fix steps and solution videos', icon: 'chat', route: 'AiAssistant' },
      { label: 'Finance', hint: 'Billed, received, pending', icon: 'wallet', route: 'Finance' },
      { label: 'Collection Reports', hint: 'Collected by employee and period', icon: 'wallet', route: 'Collections' },
      { label: 'Payments', hint: 'Billed jobs and payment status', icon: 'cash', route: 'Payments' },
      { label: 'Bills', hint: 'Generated invoices', icon: 'document', route: 'Bills' },
      { label: 'Cash Collections', hint: 'Cash held by technicians', icon: 'cash', route: 'CashCollections' },
      { label: 'Salary', hint: 'Attendance-based estimate', icon: 'wallet', route: 'Salary' },
      { label: 'Gig Payouts', hint: 'Public-pool worker payouts', icon: 'wallet', route: 'GigPayouts' },
      { label: 'Leave Requests', hint: 'Approve or reject', icon: 'calendar', route: 'LeaveRequests' },
      { label: 'EOD Summaries', hint: 'End-of-day reports', icon: 'report', route: 'EodSummaries' },
    ],
  },
  {
    key: 'management',
    label: 'Management',
    icon: 'user',
    items: [
      { label: 'Employees', hint: 'Per-employee overview', icon: 'people', route: 'Employees' },
      { label: 'Users', hint: 'Accounts, roles and access', icon: 'user', route: 'Users' },
      { label: 'Device Types', hint: 'Device types and companies', icon: 'device', route: 'DeviceTypes' },
      { label: 'Service Pricing', hint: 'Price list', icon: 'pricetag', route: 'ServicePricing' },
      { label: 'Employee Tutorials', hint: 'Upload media, track completion', icon: 'tutorial', route: 'TutorialsAdmin' },
      { label: 'Training Courses', hint: 'Courses and progress', icon: 'training', route: 'TrainingAdmin' },
      { label: 'Business & Tax Setup', hint: 'Legal details, numbering, tax rates', icon: 'receipt', route: 'BusinessSettings' },
      { label: 'My Profile', hint: 'Your details and password', icon: 'user', route: 'Profile' },
      { label: 'Settings', hint: 'Clock-in rules, keys, policies', icon: 'settings', route: 'Settings' },
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    icon: 'megaphone',
    items: [
      { label: 'Notices', hint: 'Post to the employee dashboard', icon: 'notification', route: 'Notices' },
      { label: 'Coupons', hint: 'Discount codes', icon: 'ticket', route: 'Coupons' },
      { label: 'Discount Details', hint: 'Discounts given by staff', icon: 'pricetag', route: 'DiscountDetails' },
      { label: 'Landing & Popup Ads', hint: 'Carousel and popups, with upload', icon: 'megaphone', route: 'Ads' },
      { label: 'WhatsApp Campaigns', hint: 'Broadcasts to customers', icon: 'whatsapp', route: 'Campaigns' },
    ],
  },
];
