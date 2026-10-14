/* eslint-env jest */
import React from 'react';
import { Text } from 'react-native';
import renderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/theme/ThemeContext';
import { AuthProvider } from '../src/context/AuthContext';
import FinReportsScreen from '../src/screens/admin/FinReportsScreen';

const iso = new Date().toISOString();
const today = iso.slice(0, 10);
const scope = { from: today, to: today, as_on: today, basis: 'Posted journals only' };
const acct = { id: 'a1', code: '1000', name: 'Cash in hand', type: 'asset', subtype: null, is_system: 1, active: 1, opening_balance_paise: 0 };
const led = { date: today, journal_no: 'JV-1', narration: 'Cash sale', party: 'Asha Traders', status: 'posted', debit_paise: 50000, credit_paise: 0, balance_paise: 50000 };

const FIXTURES: { match: RegExp; body: unknown }[] = [
  { match: /\/auth\/me/, body: { user: { id: 'admin-1', role: 'admin', full_name: 'Owais Bhat' } } },
  { match: /\/reports\/owner-summary/, body: {
    as_on: today, today: { sales_paise: 100000, collected_paise: 80000 },
    month: { from: today, sales_paise: 2000000, collected_paise: 1500000, expenses_paise: 700000, profit_paise: 1300000 },
    money: { cash_in_hand_paise: 300000, bank_paise: 900000, with_technicians_paise: 50000, technician_cash_tickets: 2 },
    receivable: { total_paise: 400000, overdue_paise: 100000, top: [] }, payable: { total_paise: 0, overdue_paise: 0 },
    gst: { month_payable_paise: 0, collected_paise: 0, claimable_paise: 0 }, stock: { value_paise: 0, low_items: 0 },
    attention: { unposted_tickets: 0, failing_checks: [] },
  } },
  { match: /\/reports\/reminders\?/, body: {
    scope, totals: { customers_paise: 250000, suppliers_paise: 0 },
    customers: [{ party_id: 'p1', party: 'Asha Traders', phone: '9876543210', overdue_paise: 250000, outstanding_paise: 300000, oldest_days: 45, times_reminded: 1, last_reminded_at: iso, whatsapp_url: 'https://wa.me/919876543210' }],
    suppliers: [],
  } },
  { match: /\/reports\/profit-loss/, body: {
    scope, income: [{ code: '4000', name: 'Service income', amount_paise: 900000 }], cogs: [{ code: '5000', name: 'Parts cost', amount_paise: 300000 }],
    expenses: [{ code: '6000', name: 'Fuel', amount_paise: 100000 }],
    totals: { income_paise: 900000, cogs_paise: 300000, gross_profit_paise: 600000, expenses_paise: 100000, net_profit_paise: 500000 },
  } },
  { match: /\/reports\/balance-sheet/, body: {
    scope, balanced: true, assets: [{ code: '1000', name: 'Cash in hand', balance_paise: 500000 }], liabilities: [{ code: '2000', name: 'Creditors', balance_paise: 100000 }],
    equity: [{ code: '3000', name: 'Capital', balance_paise: 400000 }],
    totals: { assets_paise: 500000, liabilities_and_equity_paise: 500000, profit_to_date_paise: 0, difference_paise: 0 },
  } },
  { match: /\/reports\/ageing/, body: {
    scope, parties: [{ party: 'Dar Mart', phone: '9855555555', d0_30: 10000, d31_60: 0, d61_90: 0, d90_plus: 20000, outstanding_paise: 30000, advance_paise: 0 }],
    totals: { d0_30: 10000, d31_60: 0, d61_90: 0, d90_plus: 20000, outstanding_paise: 30000, advance_paise: 0 },
  } },
  { match: /\/accounting\/accounts/, body: [acct] },
  { match: /\/reports\/account-ledger/, body: { scope, account: { code: '1000', name: 'Cash in hand' }, opening_paise: 0, rows: [led], totals: { debit_paise: 50000, credit_paise: 0 }, closing_paise: 50000 } },
  { match: /\/parties\?limit/, body: [{ id: 'p1', display_name: 'Asha Traders' }] },
  { match: /\/reports\/party-statement/, body: { scope, party: { display_name: 'Asha Traders' }, opening_paise: 0, rows: [led], totals: { debit_paise: 50000, credit_paise: 0 }, closing_paise: 50000 } },
  { match: /\/reports\/gst\/summary/, body: {
    scope, output: { taxable_paise: 1000000, cgst_paise: 90000, sgst_paise: 90000, igst_paise: 0, tax_paise: 180000, by_category: [{ category: 'B2B', documents: 3, taxable_paise: 1000000, cgst_paise: 90000, sgst_paise: 90000, igst_paise: 0, total_paise: 1180000 }] },
    input: { taxable_paise: 400000, cgst_paise: 36000, sgst_paise: 36000, igst_paise: 0, tax_paise: 72000, ineligible_tax_paise: 0 },
    payable: { cgst_paise: 54000, sgst_paise: 54000, igst_paise: 0, total_paise: 108000 },
    against_ledger: { cgst: { documents_paise: 54000, ledger_paise: 54000, difference_paise: 0 } },
  } },
  { match: /\/reports\/gst\/sales-register/, body: { rows: [{ date: today, doc_no: 'INV-7', doc_type: 'invoice', party: 'Dar Mart', gstin: null, category: 'B2C', taxable_paise: 10000, cgst_paise: 900, sgst_paise: 900, igst_paise: 0, total_paise: 11800 }] } },
  { match: /\/reports\/stock-valuation/, body: {
    scope: { basis: 'Moving average cost' }, total_value_paise: 1440000, ledger_inventory_paise: 1000000, difference_paise: 440000,
    items: [{ name: 'Dome Camera 2MP', sku: 'CAM-2', unit: 'pcs', quantity: 12, avg_cost_paise: 120000, value_paise: 1440000 }],
  } },
  { match: /\/jobs\/profitability/, body: {
    scope: { basis: 'Billed jobs' }, totals: { revenue_paise: 200000, cost_paise: 70000, margin_paise: 130000, unbilled_jobs: 0, unbilled_cost_paise: 0 },
    jobs: [{ job_date: iso, ticket_no: 'NE-6', customer: 'Gulshan Mart', unbilled: false, revenue_paise: 200000, total_cost_paise: 70000, margin_paise: 130000, margin_pct: 65 }],
  } },
  { match: /\/reports\/reconciliation/, body: {
    ok: false, checks: [{ label: 'Receivables vs ledger', note: 'Invoices set against 1100', ok: false, a_paise: 400000, b_paise: 390000, difference_paise: 10000 }],
  } },
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

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 780 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
};

const flat = (t: { props: { children?: unknown } }) =>
  Array.isArray(t.props.children) ? (t.props.children as unknown[]).flat(3).join('') : String(t.props.children ?? '');

const textOf = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map(flat).join(' | ');

async function openTab(tree: ReactTestRenderer, label: string) {
  const hit = tree.root.findAllByType(Text).find((t) => flat(t).trim().startsWith(label));
  if (!hit) throw new Error(`no tab "${label}"`);
  let node: typeof hit | null = hit;
  while (node && typeof node.props.onPress !== 'function') node = node.parent as typeof hit | null;
  if (!node) throw new Error(`tab "${label}" is not pressable`);
  await act(async () => {
    node!.props.onPress();
  });
  await settle();
}

describe('Financial Reports tabs', () => {
  let tree: ReactTestRenderer;

  beforeAll(async () => {
    await act(async () => {
      tree = renderer.create(
        <SafeAreaProvider initialMetrics={METRICS}>
          <ThemeProvider>
            <AuthProvider>
              <FinReportsScreen onBack={() => {}} />
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>,
      );
    });
    await settle();
  });
  afterAll(() => act(() => tree.unmount()));

  const CASES: { tab: string; expects: string[]; calls?: RegExp }[] = [
    { tab: 'Summary', expects: ['Cash in hand', 'THIS MONTH'] },
    { tab: 'Reminders', expects: ['Asha Traders', 'Send now', 'Open chat', 'Mark reminded'], calls: /reports\/reminders\?as_on=/ },
    { tab: 'Profit & Loss', expects: ['Service income', 'Parts cost', 'Fuel', 'Net profit'], calls: /reports\/profit-loss\?from=.*&to=/ },
    { tab: 'Balance Sheet', expects: ['Assets', 'Creditors', 'Capital'], calls: /reports\/balance-sheet\?as_on=/ },
    { tab: 'Who Owes', expects: ['Dar Mart', '90+ days', 'Customers owe us'], calls: /reports\/ageing\?kind=receivable/ },
    { tab: 'Account Ledger', expects: ['1000 · Cash in hand', 'Cash sale', 'JV-1'], calls: /account-ledger\?account=1000/ },
    { tab: 'Party Statement', expects: ['Asha Traders', 'Cash sale'], calls: /party-statement\?party_id=p1/ },
    { tab: 'GST', expects: ['Net payable', 'B2B'], calls: /gst\/summary/ },
    { tab: 'Stock Value', expects: ['Dome Camera 2MP', '₹4,400', 'gap'], calls: /stock-valuation/ },
    { tab: 'Job Margins', expects: ['NE-6', 'Gulshan Mart', '65%'], calls: /jobs\/profitability/ },
    { tab: 'Health Check', expects: ['Receivables vs ledger', 'Something does not agree'], calls: /reports\/reconciliation/ },
  ];

  test.each(CASES)('$tab', async ({ tab, expects, calls }) => {
    await openTab(tree, tab);
    const text = textOf(tree);
    for (const needle of expects) expect(text).toContain(needle);
    expect(text).not.toMatch(/Could not load/);
    if (calls) expect(requested.some((u) => calls.test(u))).toBe(true);
  });

  test('GST sub-tab switches to the sales register', async () => {
    await openTab(tree, 'GST');
    // The GST sub-chips and the main chip both read "Sales"/"Summary"; the register chip is unique.
    const sales = tree.root.findAllByType(Text).filter((t) => flat(t).trim() === 'Sales');
    expect(sales.length).toBeGreaterThan(0);
    let node: typeof sales[number] | null = sales[sales.length - 1];
    while (node && typeof node.props.onPress !== 'function') node = node.parent as typeof node | null;
    await act(async () => {
      node!.props.onPress();
    });
    await settle();
    expect(textOf(tree)).toContain('INV-7');
    expect(requested.some((u) => /gst\/sales-register/.test(u))).toBe(true);
  });
});
