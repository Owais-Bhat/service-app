import React, { useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import SearchField from '../../components/admin/SearchField';
import StatGrid from '../../components/admin/StatGrid';
import SectionLabel from '../../components/admin/SectionLabel';
import ListRow from '../../components/admin/ListRow';
import EmptyNote from '../../components/admin/EmptyNote';
import ExportButton from '../../components/admin/ExportButton';
import { dataGet } from '../../api/client';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, typography } from '../../theme';
import { semantic } from '../../theme/tokens';
import { shortDate } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

interface Review {
  id: string;
  ticket_no: string | null;
  full_name: string | null;
  company_name: string | null;
  feedback_rating: number | string | null;
  employee_rating: number | string | null;
  feedback_comment: string | null;
  feedback_at: string | null;
  feedback_employee_id: string | null;
  assigned_employee_id: string | null;
}

type View_ = 'month' | 'all' | 'company' | 'reviews';

const stars = (n: number) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
const MEDAL = ['🥇', '🥈', '🥉'];

// Client Feedback: every rating customers left after a service, the monthly and
// all-time rankings of technicians, and how each company rates.
export default function ClientFeedbackScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const data = useLoader(async () => {
    const [rows, people] = await Promise.all([
      dataGet<Review[]>('inquiries', {
        select: 'id,ticket_no,full_name,company_name,feedback_rating,employee_rating,feedback_comment,feedback_at,feedback_employee_id,assigned_employee_id',
        order: 'feedback_at:desc',
        limit: '3000',
      }),
      dataGet<{ id: string; full_name: string | null; role: string }[]>('profiles', { select: 'id,full_name,role' }),
    ]);
    return { rows: rows.filter((r) => r.feedback_rating != null), people };
  }, 'Could not load feedback');
  const [view, setView] = useState<View_>('month');
  const [q, setQ] = useState('');

  const all = data.data?.rows ?? [];
  const people = data.data?.people ?? [];
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.full_name || '—';
  const monthKey = new Date().toLocaleDateString('en-CA').slice(0, 7);

  const board = (src: Review[]) => {
    const agg = new Map<string, { total: number; count: number; five: number }>();
    people.filter((p) => p.role === 'employee').forEach((p) => agg.set(p.id, { total: 0, count: 0, five: 0 }));
    src.forEach((r) => {
      const id = r.feedback_employee_id || r.assigned_employee_id;
      const score = Number(r.employee_rating || r.feedback_rating || 0);
      if (!id || !agg.has(id) || !score) return;
      const a = agg.get(id)!;
      a.total += score;
      a.count += 1;
      if (score >= 5) a.five += 1;
    });
    return [...agg.entries()]
      .map(([id, a]) => ({ id, name: nameOf(id), avg: a.count ? a.total / a.count : 0, count: a.count, five: a.five }))
      .sort((a, b) => b.count - a.count || b.avg - a.avg || b.five - a.five);
  };

  const monthRows = useMemo(() => board(all.filter((r) => String(r.feedback_at || '').startsWith(monthKey))), [all, people]); // eslint-disable-line react-hooks/exhaustive-deps
  const allRows = useMemo(() => board(all), [all, people]); // eslint-disable-line react-hooks/exhaustive-deps

  const companies = useMemo(() => {
    const m = new Map<string, { count: number; total: number; five: number }>();
    all.forEach((r) => {
      const k = r.company_name || 'Walk-in / Individual';
      const c = m.get(k) || { count: 0, total: 0, five: 0 };
      c.count += 1;
      c.total += Number(r.feedback_rating || 0);
      if (Number(r.feedback_rating) >= 5) c.five += 1;
      m.set(k, c);
    });
    return [...m.entries()].map(([name, c]) => ({ name, count: c.count, avg: c.total / c.count, five: c.five })).sort((a, b) => b.count - a.count || b.avg - a.avg);
  }, [all]);

  const overall = all.length ? all.reduce((s, r) => s + Number(r.feedback_rating || 0), 0) / all.length : 0;
  const five = all.filter((r) => Number(r.feedback_rating) >= 5).length;
  const top = monthRows.find((e) => e.count > 0);
  const needle = q.trim().toLowerCase();
  const shown = all.filter((r) => !needle || `${r.full_name || ''} ${r.ticket_no || ''} ${nameOf(r.feedback_employee_id || r.assigned_employee_id)}`.toLowerCase().includes(needle));

  const rankRows = (list: ReturnType<typeof board>) =>
    list.length === 0 ? (
      <EmptyNote text="No data" icon="star" />
    ) : (
      list.map((e, i) => (
        <ListRow
          key={e.id}
          icon="user"
          title={`${i < 3 ? `${MEDAL[i]} ` : ''}#${i + 1} ${e.name}`}
          subtitle={e.count ? `${stars(e.avg)}  ${e.avg.toFixed(2)}` : 'No reviews yet'}
          meta={e.count ? `${e.five} five-star` : undefined}
          value={`${e.count}`}
        />
      ))
    );

  return (
    <AdminScreen
      title="Client Feedback"
      subtitle="Ratings and comments after service"
      onBack={onBack}
      onRefresh={data.reload}
      loading={data.loading}
      error={data.error}
      toolbar={
        <>
          <FilterChips
            activeKey={view}
            onSelect={(k) => setView(k as View_)}
            items={[
              { key: 'month', label: 'This month' },
              { key: 'all', label: 'All-time' },
              { key: 'company', label: 'By company', count: companies.length },
              { key: 'reviews', label: 'All reviews', count: all.length },
            ]}
          />
          {view === 'reviews' ? <SearchField value={q} onChangeText={setQ} placeholder="Name, ticket or employee" /> : null}
        </>
      }
    >
      <StatGrid
        items={[
          { label: 'Total reviews', value: all.length },
          { label: 'Average rating', value: `${overall.toFixed(2)} / 5`, color: semantic.warning },
          { label: '5-star reviews', value: five, color: semantic.success },
          { label: 'Employee of the month', value: top ? top.name : '—' },
        ]}
      />

      {view === 'month' ? (
        <>
          <SectionLabel>Top technicians this month — most reviews</SectionLabel>
          {rankRows(monthRows)}
        </>
      ) : null}
      {view === 'all' ? (
        <>
          <SectionLabel>All-time rankings</SectionLabel>
          {rankRows(allRows)}
        </>
      ) : null}
      {view === 'company' ? (
        <>
          <SectionLabel>Reviews by company</SectionLabel>
          {companies.length === 0 ? <EmptyNote text="No company reviews yet" icon="star" /> : null}
          {companies.map((c) => (
            <ListRow key={c.name} icon="people" title={c.name} subtitle={`${stars(c.avg)}  ${c.avg.toFixed(2)}`} meta={`${c.five} five-star`} value={`${c.count}`} />
          ))}
        </>
      ) : null}
      {view === 'reviews' ? (
        <>
          <ExportButton
            name="client-feedback.csv"
            rows={shown.map((r) => ({
              Date: String(r.feedback_at || '').slice(0, 10),
              Ticket: r.ticket_no,
              Client: r.full_name,
              Employee: nameOf(r.feedback_employee_id || r.assigned_employee_id),
              Overall: r.feedback_rating,
              'Employee rating': r.employee_rating,
              Comment: r.feedback_comment,
            }))}
          />
          {shown.length === 0 ? <EmptyNote text="No feedback received yet" icon="star" /> : null}
          {shown.map((r) => (
            <ListRow
              key={r.id}
              icon="star"
              iconColor={Number(r.feedback_rating) >= 4 ? semantic.success : Number(r.feedback_rating) >= 3 ? semantic.warning : semantic.danger}
              title={`${r.full_name || '—'} · ${r.ticket_no || ''}`}
              subtitle={`${stars(Number(r.feedback_rating))}  ·  ${nameOf(r.feedback_employee_id || r.assigned_employee_id)}${r.employee_rating ? ` (${r.employee_rating}★)` : ''}`}
              meta={`${r.feedback_at ? shortDate(r.feedback_at) : ''}${r.feedback_comment ? ` · ${r.feedback_comment}` : ''}`}
              value={`${r.feedback_rating}`}
            />
          ))}
        </>
      ) : null}
      <Text style={[styles.note, { color: theme.text3 }]}>Ratings arrive when customers open their feedback link after payment.</Text>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  note: { ...typography.caption, marginTop: spacing(3) },
});
