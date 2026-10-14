/* eslint-env jest */
import React from 'react';
import { Alert, Text } from 'react-native';
import renderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/theme/ThemeContext';
import { AuthProvider } from '../src/context/AuthContext';

import AdminHomeScreen from '../src/screens/admin/AdminHomeScreen';
import AdminMenuScreen from '../src/screens/admin/AdminMenuScreen';
import EmployeesScreen from '../src/screens/admin/EmployeesScreen';
import AttendanceLogsScreen from '../src/screens/admin/AttendanceLogsScreen';
import EodSummariesScreen from '../src/screens/admin/EodSummariesScreen';
import JobCardsAdminScreen from '../src/screens/admin/JobCardsAdminScreen';
import DeviceTrackingAdminScreen from '../src/screens/admin/DeviceTrackingAdminScreen';
import ResponseTimesScreen from '../src/screens/admin/ResponseTimesScreen';
import ServiceLogScreen from '../src/screens/admin/ServiceLogScreen';
import BonusReviewsAdminScreen from '../src/screens/admin/BonusReviewsAdminScreen';
import PaymentsScreen from '../src/screens/admin/PaymentsScreen';
import BillsScreen from '../src/screens/admin/BillsScreen';
import CashCollectionsScreen from '../src/screens/admin/CashCollectionsScreen';
import SalaryScreen from '../src/screens/admin/SalaryScreen';
import GigPayoutsScreen from '../src/screens/admin/GigPayoutsScreen';
import CouponsScreen from '../src/screens/admin/CouponsScreen';
import DiscountDetailsScreen from '../src/screens/admin/DiscountDetailsScreen';
import UsersScreen from '../src/screens/admin/UsersScreen';
import ComplaintsAdminScreen from '../src/screens/admin/ComplaintsAdminScreen';
import QueriesScreen from '../src/screens/admin/QueriesScreen';
import NoticesAdminScreen from '../src/screens/admin/NoticesAdminScreen';
import AdsAdminScreen from '../src/screens/admin/AdsAdminScreen';
import PartiesScreen from '../src/screens/admin/PartiesScreen';
import AmcScreen from '../src/screens/admin/AmcScreen';
import SalesScreen from '../src/screens/admin/SalesScreen';
import PurchasesScreen from '../src/screens/admin/PurchasesScreen';
import StockScreen from '../src/screens/admin/StockScreen';
import ItemsScreen from '../src/screens/admin/ItemsScreen';
import LedgerScreen from '../src/screens/admin/LedgerScreen';
import FinReportsScreen from '../src/screens/admin/FinReportsScreen';
import SettingsAdminScreen from '../src/screens/admin/SettingsAdminScreen';
import TrainingAdminScreen from '../src/screens/admin/TrainingAdminScreen';
import PerformanceScreen from '../src/screens/admin/PerformanceScreen';
import JobCostingScreen from '../src/screens/admin/JobCostingScreen';
import SitesDevicesScreen from '../src/screens/admin/SitesDevicesScreen';
import PastRecordsScreen from '../src/screens/admin/PastRecordsScreen';
import CampaignsScreen from '../src/screens/admin/CampaignsScreen';
import CollectionsScreen from '../src/screens/admin/CollectionsScreen';
import BusinessSettingsScreen from '../src/screens/admin/BusinessSettingsScreen';
import AccountScreen from '../src/screens/AccountScreen';
import TutorialsAdminScreen from '../src/screens/admin/TutorialsAdminScreen';
import AiReportScreen from '../src/screens/admin/AiReportScreen';
import MigrationScreen from '../src/screens/admin/MigrationScreen';
import AiAssistantScreen from '../src/screens/AiAssistantScreen';
import BusinessFinanceScreen from '../src/screens/admin/BusinessFinanceScreen';
import ServicePricingScreen from '../src/screens/ServicePricingScreen';
import AttendanceReportScreen from '../src/screens/admin/AttendanceReportScreen';
import ClientFeedbackScreen from '../src/screens/admin/ClientFeedbackScreen';
import RequestReportsScreen from '../src/screens/admin/RequestReportsScreen';
import { ADMIN_MENU } from '../src/navigation/adminMenu';

// ── fixtures, shaped like the server's real responses ─────────────────────
const now = new Date();
const iso = now.toISOString();
const today = iso.slice(0, 10);
const SQL_NOW = iso.slice(0, 19).replace('T', ' ');

const inquiry = (over: Record<string, unknown> = {}) => ({
  id: 'inq-1', ticket_no: 'NE-261013-1001', full_name: 'Asha Traders', phone: '9876543210',
  service_item: 'CCTV no signal', status: 'open', assignment_status: 'none', assigned_employee_id: null,
  payment_status: 'unpaid', bill_amount: 1500, bill_total: 1770, bill_no: 'B-1', bill_pdf_url: '/uploads/b1.pdf',
  bill_generated_at: SQL_NOW, created_at: iso, ...over,
});

const FIXTURES: { match: RegExp; body: unknown }[] = [
  { match: /\/auth\/me/, body: { user: { id: 'admin-1', role: 'admin', full_name: 'Owais Bhat', email: 'o@x.in' } } },
  { match: /\/dashboard\/admin-data/, body: {
    inquiries: [inquiry(), inquiry({ id: 'inq-2', ticket_no: 'NE-261013-1002', full_name: 'Bilal Stores', status: 'resolved', assigned_employee_id: 'e1', assignment_status: 'accepted' })],
    completed_total: 41, installations: [{ id: 'in1', status: 'pending', preferred_date: today }],
    complaints: [{ id: 'c1', status: 'open', created_at: iso }],
    attendance: [{ id: 'a1', user_id: 'e1', clock_in: iso, clock_out: null, location: 'Lal Chowk', profiles: { full_name: 'Imran Khan' } }],
    profiles: [{ id: 'e1', full_name: 'Imran Khan', role: 'employee', phone: '9000000001' }],
  } },
  { match: /\/notifications\/unread-count/, body: { unread: 3 } },
  { match: /\/data\/profiles/, body: [
    { id: 'e1', full_name: 'Imran Khan', role: 'employee', phone: '9000000001', worker_type: 'fixed', salary: 24000 },
    { id: 'e2', full_name: 'Sajad Ahmad', role: 'team_lead', phone: '9000000002', worker_type: 'gig', salary: 0 },
  ] },
  { match: /\/data\/attendance/, body: [{ id: 'a1', user_id: 'e1', date: today, clock_in: `${today}T09:05:00`, clock_out: `${today}T18:10:00`, location: 'Lal Chowk', latitude: '34.08', longitude: '74.79', profiles: { full_name: 'Imran Khan' } }] },
  { match: /\/data\/leave_requests/, body: [{ employee_id: 'e1', status: 'approved', start_date: today, end_date: today }] },
  { match: /\/data\/eod_reports/, body: [{ id: 'r1', employee_id: 'e1', date: today, content: 'Fixed 3 DVR faults and replaced a camera.', profiles: { full_name: 'Imran Khan' } }] },
  { match: /\/data\/inquiries/, body: [
    inquiry({ payment_status: 'paid', payment_method: 'cash', cash_collected_at: SQL_NOW, assigned_employee_id: 'e1', is_gig_job: 1, gig_payout_amount: 900, gig_payout_status: 'unpaid', claimed_by_gig_worker_id: 'e2', discount_amount: 100, discount_label: 'Festival', discount_reason: 'Loyal customer' }),
    inquiry({ id: 'inq-3', full_name: 'Carpet House', payment_status: 'unpaid', status: 'resolved' }),
  ] },
  { match: /\/data\/coupons/, body: [{ id: 'cp1', code: 'DIWALI100', type: 'fixed', value: 100, max_discount: null, min_amount: 500, usage_limit: 10, used_count: 2, expires_at: null, description: null, active: 1 }] },
  { match: /\/data\/complaints/, body: [{ id: 'cm1', ticket_no: 'NE-261013-1001', phone: '9876543210', complaint_text: 'Technician did not turn up on time', status: 'open', admin_response: null, resolved_at: null, created_at: iso }] },
  { match: /\/data\/queries/, body: [{ id: 'q1', full_name: 'Zahid Mir', phone: '9811111111', address: 'Rajbagh', query_details: 'Need 8 camera quote', estimate_sent: 0, created_at: iso }] },
  { match: /\/data\/notices/, body: [{ id: 'n1', title: 'Office closed Friday', body: 'Eid holiday', priority: 'high', active: 1, expires_at: null, created_at: iso }] },
  { match: /\/data\/ads/, body: [{ id: 'ad1', kind: 'image', url: '/uploads/ad.jpg', caption: 'Winter CCTV offer', duration_ms: 6000, active: 1, placement: 'landing', device_target: 'both', position: 1, starts_at: null, expires_at: null }] },
  { match: /\/admin\/users$/, body: [{ id: 'u1', full_name: 'Imran Khan', email: 'imran@x.in', phone: '9000000001', role: 'employee', salary: 24000, worker_type: 'fixed', can_add_service: 1, can_assign_tickets: 0, can_update_profile: 0, always_assign: 0, eod_exempt: 0, photo_clockin_exempt: 0, geofence_clockin_exempt: 0, installations_enabled: 1, allow_foc: 1 }] },
  { match: /\/job-cards\?status=pending/, body: [{ id: 'j1', ticket_no: 'NE-1', full_name: 'Asha Traders', service_item: 'DVR repair', assigned_name: 'Imran Khan', secondary_name: null, created_at: iso }] },
  { match: /\/job-cards\?status=awaiting-verification/, body: [{ id: 'j2', ticket_no: 'NE-2', full_name: 'Bilal Stores', phone: '9822222222', verification_call_status: null, verification_attempts: 0, verification_due_at: iso }] },
  { match: /\/admin\/leaderboard\?month=/, body: { leaderboard: [{ employeeId: 'e1', name: 'Imran Khan', avgRating: 4.6, avgTimeEfficiency: 0.9, jobsCount: 8, bonusPoints: 30, totalScore: 88 }], awarded: null } },
  { match: /\/device-tracking\/all/, body: [{ id: 'd1', ticket_no: 'NE-9', full_name: 'Carpet House', phone: '9833333333', service_item: 'DVR', status: 'resolved', device_status: 'taken', follow_up_status: 'repair_progress', device_taken_logs: [{ taken_at: iso, profiles: { full_name: 'Imran Khan' } }], device_return_logs: [] }] },
  { match: /\/response-times$/, body: [{ id: 'rt1', kind: 'assignment', ticket_no: 'NE-1', full_name: 'Asha Traders', service_item: 'CCTV', employee_name: null, started_at: iso, due_at: iso, responded_at: null, response_minutes: null }] },
  { match: /\/service-logs/, body: [{ id: 'sl1', log_date: today, ticket_no: 'NE-3', technician_name: 'Imran Khan', customer_name: 'Gulshan Mart', customer_phone: '9844444444', service_type: 'CCTV', problem: 'No video', items_used: 'BNC x4', amount: 1200, payment_status: 'paid' }] },
  { match: /\/review-submissions/, body: [{ id: 'rs1', employee_name: 'Imran Khan', ticket_no: 'NE-4', customer_name: 'Dar Mart', review_type: 'google', photo_url: '/uploads/r.jpg', star_rating: null, status: 'pending', points: null }] },
  { match: /\/parties\/summary/, body: { count: 12, owing_count: 3, owing_paise: 4500000, credit_count: 1, credit_paise: 120000, net_paise: 4380000 } },
  { match: /\/parties\?/, body: [{ id: 'p1', display_name: 'Asha Traders', kind: 'customer', phone: '9876543210', email: null, gstin: '01ABCDE1234F1Z5', gst_treatment: 'registered', balance_paise: 250000, active: 1 }] },
  { match: /\/amc\/contracts/, body: { contracts: [{ id: 'am1', contract_no: 'AMC-001', title: 'Annual CCTV', party_name: 'Asha Traders', party_phone: '9876543210', start_date: today, end_date: today, amount_paise: 1200000, state: 'active', days_left: 20, days_overdue: null, visits_included: 4, visits_used: 1, visits_left: 3, has_invoice: true, invoice_due_paise: 0 }], summary: { running: 1, running_value_paise: 1200000, lapsing_30: 1, lapsed: 0, not_invoiced: 0, unpaid_paise: 0 } } },
  { match: /\/sales\/receivables/, body: { total_paise: 500000, buckets: {}, invoices: [{ id: 'si1', doc_no: 'INV-7', doc_date: today, due_date: today, party_name: 'Asha Traders', party_phone: '9876543210', total_paise: 500000, outstanding_paise: 500000, days_overdue: 12 }] } },
  { match: /\/sales\/documents/, body: [{ id: 'sd1', doc_type: 'invoice', doc_no: 'INV-8', doc_date: today, due_date: null, status: 'issued', party_name: 'Bilal Stores', party_phone: '9822222222', total_paise: 236000, paid_paise: 100000 }] },
  { match: /\/purchases\/payables/, body: { total_paise: 90000, buckets: {}, bills: [{ id: 'pb1', doc_no: 'PB-1', supplier_ref: 'S-55', doc_date: today, due_date: today, party_name: 'Hikvision Dist', total_paise: 90000, outstanding_paise: 90000, days_overdue: 0, bucket: 'current' }] } },
  { match: /\/purchases\/documents/, body: [{ id: 'pd1', doc_type: 'purchase_order', doc_no: 'PO-1', supplier_ref: null, doc_date: today, due_date: null, status: 'issued', party_name: 'Hikvision Dist', location_name: 'Main store', total_paise: 90000, paid_paise: 0 }] },
  { match: /\/stock\/valuation/, body: { method: 'moving average cost', items: [{ id: 'it1', name: 'Dome Camera 2MP', sku: 'CAM-2', unit: 'pcs', active: true, quantity: 12, quantity_matches: true, avg_cost_paise: 120000, value_paise: 1440000 }], total_value_paise: 1440000, discrepancies: [] } },
  { match: /\/stock\/locations/, body: [{ id: 'l1', name: 'Main store', employee_name: null, is_default: 1 }, { id: 'l2', name: 'Van — Imran', employee_name: 'Imran Khan', is_default: 0 }] },
  { match: /\/inventory\/items/, body: [{ id: 'it1', sku: 'CAM-2', name: 'Dome Camera 2MP', category: 'Camera', unit: 'pcs', brand: 'Hikvision', model: 'DS-2CE', selling_rate: 1800, purchase_rate: 1200, gst_rate: 18, quantity: 2, min_stock: 5, active: 1 }] },
  { match: /\/accounting\/journals\?/, body: [{ id: 'j1', journal_no: 'JV-1', journal_date: today, narration: 'Opening stock entry', source_type: 'manual', status: 'posted', reversal_of_id: null, reversed_by_id: null, reversal_reason: null, total_paise: 500000, posted_by_name: 'Owais Bhat', posted_at: iso }] },
  { match: /\/accounting\/accounts/, body: [{ id: 'ac1', code: '1000', name: 'Cash in hand', type: 'asset', subtype: null, is_system: 1, active: 1, opening_balance_paise: 0 }] },
  { match: /\/finance\/summary/, body: {
    range: { from: today, to: today },
    totals: { billed: 100000, received: 70000, pending: 30000, billsCount: 10, paidCount: 7, avgTicket: 10000, gst: 9000, discounts: 2000, platform: 1000, transport: 500, cashInHand: 4000 },
    gig: { count: 2, billed: 5000, payout: 3000, companyKeeps: 2000, unpaidPayout: 1000 },
    jobCards: { logged: 5, awaitingVerification: 2, verified: 3, award: null },
    byMethod: { cash: 30000, online: 40000, unknown: 0 }, aging: { '0-7': 10000, '8-30': 10000, '31+': 10000 },
    previous: { billed: 80000, received: 60000, billsCount: 8, paidCount: 6, from: today, to: today },
    trend: [{ month: '2026-09', billed: 80000, received: 60000, bills: 8 }, { month: '2026-10', billed: 100000, received: 70000, bills: 10 }],
    byTechnician: [{ name: 'Imran Khan', billed: 60000, received: 50000, jobs: 6 }],
    byCompany: [{ company: 'Asha Traders', billed: 20000, received: 15000 }],
    byCategory: [{ category: 'CCTV', revenue: 70000, items: 12 }],
  } },
  { match: /\/data\/service_pricing/, body: [{ id: 'sp1', category: 'CCTV', sub_category: 'DVR', sub_sub_category: 'No signal', name: 'No signal', cost: '500' }] },
  { match: /\/data\/training_items/, body: [{ id: 't1', title: 'How to bill a service', description: 'Billing basics', category: 'Billing', kind: 'video', url: '/uploads/t1.mp4', position: 0, required: 1, active: 1 }] },
  { match: /\/data\/training_completions/, body: [{ id: 'tc1', item_id: 't1', employee_id: 'e1' }] },
  { match: /\/training\/watch-progress/, body: [{ item_id: 't1', employee_id: 'e2', full_name: 'Sajad Ahmad', percent: 60, updated_at: iso }] },
  { match: /\/accounting\/business/, body: { fy_label: '2026-27', setup_pending: ['Confirm the legal details'], business: { legal_name: 'NEST Security Systems', trade_name: 'NEST', registration_type: 'regular', gstin: '01ABCDE1234F1Z5', pan: null, state_code: '01', address_line1: 'Lal Chowk', city: 'Srinagar', pincode: '190001', phone: '9000000000', email: 'a@x.in', fy_start_month: 4, setup_complete: 0 } } },
  { match: /\/accounting\/trial-balance/, body: { accounts: [{ id: 'ac1', code: '1000', name: 'Cash in hand', type: 'asset', debit_paise: 500000, credit_paise: 100000, balance_paise: 400000 }], totals: { debit_paise: 500000, credit_paise: 500000 }, scope: { from: 'the beginning', to: 'today', basis: 'posted journals' } } },
  { match: /\/reports\/owner-summary/, body: {
    as_on: today, today: { sales_paise: 100000, collected_paise: 80000 },
    month: { from: today, sales_paise: 2000000, collected_paise: 1500000, expenses_paise: 700000, profit_paise: 1300000 },
    money: { cash_in_hand_paise: 300000, bank_paise: 900000, with_technicians_paise: 50000, technician_cash_tickets: 2 },
    receivable: { total_paise: 400000, overdue_paise: 100000, top: [{ party: 'Asha Traders', phone: '9876543210', outstanding_paise: 250000, oldest_days: 30 }] },
    payable: { total_paise: 90000, overdue_paise: 0 }, gst: { month_payable_paise: 50000, collected_paise: 120000, claimable_paise: 70000 },
    stock: { value_paise: 1440000, low_items: 1 }, attention: { unposted_tickets: 0, failing_checks: [] },
  } },
  { match: /\/settings\/clockin-requirements/, body: { photoRequired: true, geofenceRequired: false } },
  { match: /\/settings\/popup/, body: { enabled: true } },
  { match: /\/settings\/device-tracking/, body: { enabled: true } },
  { match: /\/settings\/reopen/, body: { limit: 2, button_enabled: true } },
  { match: /\/settings\/pool-timeout/, body: { minutes: 20 } },
  { match: /\/settings\/attendance/, body: { autoClockOutTime: '19:00' } },
  { match: /\/training\/courses\/c1\/progress/, body: { course: { id: 'c1', title: 'CCTV Basics' }, lessons: [{ id: 'l1', title: 'Intro' }], quizCount: 5, employees: [{ employee_id: 'e1', name: 'Imran Khan', due_date: null, done_count: 1, completion: null, last_activity: iso }] } },
  { match: /\/training\/courses/, body: [{ id: 'c1', title: 'CCTV Basics', category: 'CCTV', description: null, active: 1, lesson_count: 4, quiz_count: 5, assign_count: 2 }] },
  { match: /\/training\/compliance/, body: [{ course_id: 'c1', completed: 1, assigned: 2 }] },
  { match: /\/leaderboard\?month=/, body: { monthly: [{ id: 'e1', name: 'Imran Khan', count: 6, avg: 4.8, fiveStars: 5 }], allTime: [{ id: 'e1', name: 'Imran Khan', count: 40, avg: 4.7, fiveStars: 30 }] } },
  { match: /\/jobs\/materials\/pending/, body: [{ id: 'mm1', job_type: 'inquiry', employee_name: 'Imran Khan', location_name: 'Van — Imran', line_count: 3, kind: 'used', submitted_at: iso, job: { ticket_no: 'NE-5', full_name: 'Dar Mart', phone: '9855555555' } }] },
  { match: /\/jobs\/profitability/, body: { scope: { from: today, to: today, basis: 'x' }, jobs: [{ job_type: 'inquiry', job_id: 'j9', ticket_no: 'NE-6', customer: 'Gulshan Mart', job_status: 'resolved', job_date: iso, invoice_no: 'INV-9', material_cost_paise: 50000, other_cost_paise: 20000, total_cost_paise: 70000, revenue_paise: 200000, margin_paise: 130000, margin_pct: 65, unbilled: false }], totals: { revenue_paise: 200000, cost_paise: 70000, margin_paise: 130000, unbilled_jobs: 0, unbilled_cost_paise: 0 } } },
  { match: /\/devices/, body: { devices: [{ id: 'dv1', party_name: 'Asha Traders', party_phone: '9876543210', site_name: 'Shop', category: 'dvr', category_label: 'DVR', brand: 'Hikvision', model: 'DS-7208', serial_no: 'SN123', location_note: null, quantity: 1, status: 'working', installed_on: today, warranty_until: today, warranty_state: 'ending', warranty_days: 12, amc_contract_no: null, amc_status: null }], summary: { devices: 1, units: 1, customers: 1, faulty: 0, in_warranty: 1, warranty_ending: 1, under_amc: 0 } } },
  { match: /\/vyapar\/history/, body: { rows: [{ id: 'v1', doc_type: 'sale', doc_no: 'V-100', doc_date: today, party_name: 'Old Customer', party_phone: null, total_paise: 345000, payment_state: 'paid', payment_mode: 'cash' }], total: 1, total_paise: 345000 } },
  { match: /\/campaigns\/meta/, body: { rate_per_minute: 20, daily_cap: 500, hours: { from: 9, until: 20, zone: 'IST' }, segments: { all: 'Everyone', amc_none: 'No AMC yet' } } },
  { match: /\/campaigns\/optouts/, body: [{ phone: '9800000000', reason: 'Asked to stop', created_at: iso }] },
  { match: /\/campaigns/, body: [{ id: 'cg1', name: 'Diwali offer', status: 'completed', scheduled_at: iso, recurrence: null, is_standing: false, progress: { queued: 0, sent: 90, failed: 2, skipped: 1, total: 93 } }] },
];

const originalFetch = global.fetch;
const requested: string[] = [];

beforeAll(() => {
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string) => {
    requested.push(url);
    const hit = FIXTURES.find((f) => f.match.test(url));
    if (!hit) return { ok: false, status: 404, json: async () => ({ error: `no fixture for ${url}` }) };
    return { ok: true, status: 200, json: async () => hit.body };
  });
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterAll(() => {
  (global as unknown as { fetch: unknown }).fetch = originalFetch;
});

const INITIAL_METRICS = { frame: { x: 0, y: 0, width: 360, height: 780 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

async function mount(node: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
        <ThemeProvider>
          <AuthProvider>{node}</AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  // let the screen's fetches resolve and re-render
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  return tree;
}

function textOf(tree: ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((t) => (Array.isArray(t.props.children) ? t.props.children.flat(3).join('') : String(t.props.children ?? '')))
    .join(' | ');
}

const noop = () => {};

// Each admin screen: what it must show given the fixtures above.
const CASES: { name: string; el: () => React.ReactElement; expects: string[] }[] = [
  { name: 'Admin dashboard', el: () => <AdminHomeScreen onTab={noop} onOpen={noop} onOpenNotifications={noop} />, expects: ['Dashboard', 'Open requests', 'NEEDS ATTENTION', 'Asha Traders', 'Online now', 'Imran Khan'] },
  { name: 'Employees', el: () => <EmployeesScreen onBack={noop} onOpen={noop} />, expects: ['Employees', 'Imran Khan', 'Sajad Ahmad', 'Team lead'] },
  { name: 'Attendance', el: () => <AttendanceLogsScreen onBack={noop} />, expects: ['Attendance', 'Imran Khan', 'Lal Chowk', 'Missing EOD'] },
  { name: 'EOD summaries', el: () => <EodSummariesScreen onBack={noop} />, expects: ['EOD Summaries', 'Fixed 3 DVR faults', 'Imran Khan'] },
  { name: 'Job cards', el: () => <JobCardsAdminScreen onBack={noop} />, expects: ['Job Cards', 'Asha Traders', 'Enter job card'] },
  { name: 'Device tracking', el: () => <DeviceTrackingAdminScreen onBack={noop} onOpenDevice={noop} />, expects: ['Device Tracking', 'Carpet House', 'Closed, not returned'] },
  { name: 'Response time', el: () => <ResponseTimesScreen onBack={noop} />, expects: ['Response Time', 'Asha Traders', 'Still waiting'] },
  { name: 'Service log', el: () => <ServiceLogScreen onBack={noop} />, expects: ['Service Log', 'Gulshan Mart', '₹1,200'] },
  { name: 'Bonus reviews', el: () => <BonusReviewsAdminScreen onBack={noop} />, expects: ['Bonus Reviews', 'Imran Khan', 'Approve', 'Reject'] },
  { name: 'Payments', el: () => <PaymentsScreen onBack={noop} />, expects: ['Payments', 'Carpet House', 'Mark paid', 'Pending'] },
  { name: 'Bills', el: () => <BillsScreen onBack={noop} />, expects: ['Bills', 'Asha Traders', 'View PDF'] },
  { name: 'Cash collections', el: () => <CashCollectionsScreen onBack={noop} />, expects: ['Cash Collections', 'Imran Khan', 'Record'] },
  { name: 'Salary', el: () => <SalaryScreen onBack={noop} />, expects: ['Salary', 'Imran Khan', 'Monthly payroll'] },
  { name: 'Gig payouts', el: () => <GigPayoutsScreen onBack={noop} />, expects: ['Gig Payouts', 'Sajad Ahmad', '₹900'] },
  { name: 'Coupons', el: () => <CouponsScreen onBack={noop} />, expects: ['Coupons', 'DIWALI100', '₹100 off'] },
  { name: 'Discount details', el: () => <DiscountDetailsScreen onBack={noop} />, expects: ['Discount Details', 'Loyal customer', '₹100'] },
  { name: 'Users', el: () => <UsersScreen onBack={noop} />, expects: ['Users', 'Imran Khan', 'Employee'] },
  { name: 'Complaints', el: () => <ComplaintsAdminScreen onBack={noop} />, expects: ['Complaints', 'Technician did not turn up', 'Respond'] },
  { name: 'Queries', el: () => <QueriesScreen onBack={noop} />, expects: ['Queries & Follow-ups', 'Zahid Mir', 'Mark sent'] },
  { name: 'Notices', el: () => <NoticesAdminScreen onBack={noop} />, expects: ['Notices', 'Office closed Friday', 'Hide'] },
  { name: 'Ads', el: () => <AdsAdminScreen onBack={noop} />, expects: ['Landing & Popup Ads', 'Winter CCTV offer', 'Live'] },
  { name: 'Customers & suppliers', el: () => <PartiesScreen onBack={noop} />, expects: ['Customers & Suppliers', 'Asha Traders', 'Owes us'] },
  { name: 'AMC', el: () => <AmcScreen onBack={noop} />, expects: ['AMC Contracts', 'AMC-001', 'Active'] },
  { name: 'Sales', el: () => <SalesScreen onBack={noop} />, expects: ['Invoices & Quotations', 'Bilal Stores', 'INV-8'] },
  { name: 'Purchases', el: () => <PurchasesScreen onBack={noop} />, expects: ['Purchases', 'Hikvision Dist', 'PO-1'] },
  { name: 'Stock', el: () => <StockScreen onBack={noop} />, expects: ['Stock', 'Dome Camera 2MP', '₹14,400'] },
  { name: 'Items', el: () => <ItemsScreen onBack={noop} />, expects: ['Items', 'Dome Camera 2MP', 'low'] },
  { name: 'Ledger', el: () => <LedgerScreen onBack={noop} />, expects: ['Ledger & Journals', 'Opening stock entry', 'JV-1'] },
  { name: 'Financial reports', el: () => <FinReportsScreen onBack={noop} />, expects: ['Financial Reports', 'Cash in hand', 'Asha Traders'] },
  { name: 'Settings', el: () => <SettingsAdminScreen onBack={noop} />, expects: ['Settings', 'Selfie required', 'Auto clock-out time'] },
  { name: 'Training', el: () => <TrainingAdminScreen onBack={noop} />, expects: ['Training Courses', 'CCTV Basics', 'Progress'] },
  { name: 'Performance', el: () => <PerformanceScreen onBack={noop} />, expects: ['Employee Performance', 'Imran Khan', '4.80'] },
  { name: 'Job costing', el: () => <JobCostingScreen onBack={noop} />, expects: ['Job Costing', 'Imran Khan', 'Approve'] },
  { name: 'Sites & devices', el: () => <SitesDevicesScreen onBack={noop} />, expects: ['Sites & Devices', 'Asha Traders', 'Ending soon'] },
  { name: 'Past records', el: () => <PastRecordsScreen onBack={noop} />, expects: ['Past Records', 'Old Customer', 'V-100'] },
  { name: 'Collection reports', el: () => <CollectionsScreen onBack={noop} />, expects: ['Collection Reports', 'Net collected', 'BY EMPLOYEE', 'NE-261013-1001'] },
  { name: 'Business & tax setup', el: () => <BusinessSettingsScreen onBack={noop} />, expects: ['Business & Tax Setup', 'Confirm the legal details', 'State: Jammu and Kashmir', 'Save business details'] },
  { name: 'My profile', el: () => <AccountScreen onBack={noop} />, expects: ['My Profile', 'ACCOUNT INFORMATION', 'CHANGE PASSWORD'] },
  { name: 'Employee tutorials', el: () => <TutorialsAdminScreen onBack={noop} />, expects: ['Employee Tutorials', 'How to bill a service', 'Live watch tracking'.toUpperCase(), 'Sajad Ahmad'] },
  { name: 'AI report', el: () => <AiReportScreen onBack={noop} />, expects: ['AI Report', 'Paid revenue', 'BUSINESS NOTES', 'EMPLOYEE PROGRESS'] },
  { name: 'Data migration', el: () => <MigrationScreen onBack={noop} />, expects: ['Data Migration', 'From Vyapar', 'Email it to me'] },
  { name: 'AI assistant', el: () => <AiAssistantScreen onBack={noop} />, expects: ['AI Assistant', 'Describe the problem'] },
  { name: 'Finance', el: () => <BusinessFinanceScreen onBack={noop} />, expects: ['Finance', 'BUSINESS HEALTH', 'Collection rate 70%', 'Imran Khan', 'GROWTH ADVISOR', 'Generate report'] },
  { name: 'Service pricing', el: () => <ServicePricingScreen onBack={noop} />, expects: ['Service Pricing', 'No signal', '₹500', 'Import CSV'] },
  { name: 'Attendance report', el: () => <AttendanceReportScreen onBack={noop} />, expects: ['Attendance Report', 'Export report', 'Imran Khan', 'Present (days)'] },
  { name: 'Request reports', el: () => <RequestReportsScreen onBack={noop} />, expects: ['Request Reports', 'TECHNICIAN REPORT', 'Export report', 'Most requested services'.toUpperCase()] },
  { name: 'Client feedback', el: () => <ClientFeedbackScreen onBack={noop} />, expects: ['Client Feedback', 'Total reviews', 'Average rating'] },
  { name: 'Campaigns', el: () => <CampaignsScreen onBack={noop} />, expects: ['WhatsApp Campaigns', 'Diwali offer', '90 sent', 'Do-not-message list', 'IST'] },
];

describe('admin screens render real data', () => {
  test.each(CASES)('$name', async ({ el, expects }) => {
    const tree = await mount(el());
    const text = textOf(tree);
    for (const needle of expects) {
      expect(text).toContain(needle);
    }
    expect(text).not.toMatch(/Could not load|Loading…/);
    act(() => tree.unmount());
  });
});

describe('admin menu', () => {
  test('lists every web portal group and marks only unbuilt pages as Soon', async () => {
    const all = ADMIN_MENU.flatMap((g) => g.items.filter((i) => i.route).map((i) => i.route as string));
    const tree = await mount(<AdminMenuScreen available={new Set(all)} onOpen={noop} onTab={noop} />);
    const text = textOf(tree);
    for (const g of ADMIN_MENU) expect(text.toUpperCase()).toContain(g.label.toUpperCase());
    expect(text).not.toContain('Soon');
    expect(text).toContain(`${all.length} of ${ADMIN_MENU.reduce((n, g) => n + g.items.length, 0)}`);
    act(() => tree.unmount());
  });

  test('a page with no registered screen is shown as Soon', async () => {
    const tree = await mount(<AdminMenuScreen available={new Set<string>()} onOpen={noop} onTab={noop} />);
    expect(textOf(tree)).toContain('Soon');
    act(() => tree.unmount());
  });
});

describe('interactions', () => {
  test('Payments: Mark paid asks for confirmation before writing', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await mount(<PaymentsScreen onBack={noop} />);
    const label = tree.root.findAll((n) => n.type === Text && n.props.children === 'Mark paid')[0];
    expect(label).toBeDefined();
    let node: typeof label | null = label;
    while (node && typeof node.props.onPress !== 'function') node = node.parent;
    expect(node).not.toBeNull();
    await act(async () => {
      node!.props.onPress();
    });
    expect(alert).toHaveBeenCalledWith('Mark as paid?', expect.any(String), expect.any(Array));
    expect(requested.some((u) => /PATCH/.test(u))).toBe(false);
    alert.mockRestore();
    act(() => tree.unmount());
  });

  test('every screen file is free of KeyboardAvoidingView', () => {
    const fs = require('fs');
    const path = require('path');
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e: { name: string; isDirectory: () => boolean }) =>
        e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
      );
    const offenders = walk(path.join(__dirname, '..', 'src'))
      .filter((f: string) => /\.(tsx|ts)$/.test(f))
      .filter((f: string) => /KeyboardAvoidingView/.test(fs.readFileSync(f, 'utf8')))
      // The admin frame mentions it in a comment explaining why it is absent.
      .filter((f: string) => !/AdminScreen\.tsx$|FormSheet\.tsx$/.test(f));
    expect(offenders).toEqual([]);
  });
});
