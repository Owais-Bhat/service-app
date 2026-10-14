import { api } from './client';

// The Finance page's own numbers are in whole rupees (unlike the books, which
// are in paise): they come from the billed tickets, not from the ledger.
export interface FinanceSummary {
  range: { from: string | null; to: string | null };
  totals: {
    billed: number;
    received: number;
    pending: number;
    billsCount: number;
    paidCount: number;
    avgTicket: number;
    gst: number;
    discounts: number;
    platform: number;
    transport: number;
    cashInHand: number;
  };
  gig: { count: number; billed: number; payout: number; companyKeeps: number; unpaidPayout: number };
  jobCards: { logged: number; awaitingVerification: number; verified: number; award: { name: string; amount: number } | null };
  byMethod: { cash: number; online: number; unknown: number };
  aging: { '0-7': number; '8-30': number; '31+': number };
  previous: { billed: number; received: number; billsCount: number; paidCount: number; from: string; to: string } | null;
  trend: { month: string; billed: number; received: number; bills: number }[];
  byTechnician: { name: string; billed: number; received: number; jobs: number }[];
  byCompany: { company: string; billed: number; received: number }[];
  byCategory: { category: string; revenue: number; items: number }[];
}

export function fetchFinanceSummary(from?: string, to?: string) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  return api.get<FinanceSummary>(`/finance/summary${qs.toString() ? `?${qs.toString()}` : ''}`);
}

export const askFinanceAi = (from: string | null, to: string | null, question: string | null) =>
  api.post<{ answer: string }>('/ai/finance', { from, to, question });

export interface Insight {
  tone: 'good' | 'warn' | 'bad';
  title: string;
  text: string;
}

// The same local "Growth Advisor" rules as the web page.
export function buildInsights(d: FinanceSummary): Insight[] {
  const t = d.totals;
  const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const out: Insight[] = [];
  const rate = t.billed > 0 ? (t.received / t.billed) * 100 : 0;
  out.push({
    tone: rate >= 80 ? 'good' : rate >= 60 ? 'warn' : 'bad',
    title: `Collection rate ${rate.toFixed(0)}%`,
    text: rate >= 80 ? 'Healthy — most billed work is getting paid on time.' : `${inr(t.pending)} billed is still uncollected. Prioritise chasing the oldest invoices.`,
  });
  if (d.aging['31+'] > 0) {
    out.push({ tone: 'bad', title: `${inr(d.aging['31+'])} overdue 31+ days`, text: 'This is your highest-risk money. Call or message these customers this week before it ages further.' });
  }
  if (d.trend.length >= 2) {
    const a = d.trend[d.trend.length - 2].billed;
    const b = d.trend[d.trend.length - 1].billed;
    if (a > 0) {
      const g = ((b - a) / a) * 100;
      out.push({
        tone: g >= 0 ? 'good' : 'warn',
        title: `Revenue ${g >= 0 ? 'up' : 'down'} ${Math.abs(g).toFixed(0)}% vs last month`,
        text: g >= 0 ? 'Momentum is positive — keep lead flow and follow-ups consistent to compound it.' : 'Revenue dipped month-on-month. Review where leads dropped and re-engage past customers.',
      });
    }
  }
  if (d.byCategory.length) {
    const total = d.byCategory.reduce((s, x) => s + x.revenue, 0) || 1;
    const c = d.byCategory[0];
    out.push({ tone: 'good', title: `${c.category} is your top earner`, text: `${inr(c.revenue)} (${((c.revenue / total) * 100).toFixed(0)}% of service revenue). Build packages and upsells around it to grow margin.` });
  }
  const techs = d.byTechnician.filter((x) => x.name !== 'Unassigned');
  if (techs.length) {
    const top = [...techs].sort((a, b) => b.received - a.received)[0];
    out.push({ tone: 'good', title: `${top.name} collected the most`, text: `${inr(top.received)} across ${top.jobs} jobs. Recognise top performers and share their approach with the team.` });
  }
  if (t.cashInHand > 0) {
    out.push({ tone: 'warn', title: `${inr(t.cashInHand)} cash not deposited`, text: 'Staff are still holding collected cash. Ask them to submit it to cut leakage and reconcile faster.' });
  }
  out.push({ tone: 'good', title: `Average ticket ${inr(t.avgTicket)}`, text: 'Lift this with service bundles, annual maintenance contracts (AMC) and premium installs.' });
  return out;
}
