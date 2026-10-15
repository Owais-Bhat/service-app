import React, { useMemo, useState } from 'react';
import { Linking } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import SearchField from '../../components/admin/SearchField';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import { resolveUploadUrl } from '../../api/client';
import { BilledJob, fetchBilledJobs } from '../../api/adminMoney';
import { useTheme } from '../../theme/ThemeContext';
import { dateTime, inr } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Filter = 'all' | 'paid' | 'unpaid';

function whatsappLink(job: BilledJob): string | null {
  const digits = (job.phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const to = digits.length === 10 ? `91${digits}` : digits;
  const text = `Hello ${job.full_name || ''}, your bill${job.bill_no ? ` ${job.bill_no}` : ''} for ${inr(job.bill_total)} is ready.${
    job.bill_pdf_url ? ` ${resolveUploadUrl(job.bill_pdf_url)}` : ''
  }`;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

// Generated invoices. The PDF opens in the phone's viewer; the WhatsApp action
// pre-writes the same message the web "Share" sends.
export default function BillsScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const jobs = useLoader(fetchBilledJobs, 'Could not load bills');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => (jobs.data ?? []).filter((r) => Number(r.bill_total) > 0), [jobs.data]);
  const billed = rows.reduce((s, r) => s + Number(r.bill_total), 0);
  const received = rows.filter((r) => r.payment_status === 'paid').reduce((s, r) => s + Number(r.bill_total), 0);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => (filter === 'all' ? true : filter === 'paid' ? r.payment_status === 'paid' : r.payment_status !== 'paid'))
      .filter((r) => !q || `${r.full_name || ''} ${r.ticket_no || ''} ${r.bill_no || ''}`.toLowerCase().includes(q));
  }, [rows, filter, query]);

  return (
    <AdminScreen
      title="Bills"
      subtitle={`${rows.length} invoices`}
      onBack={onBack}
      onRefresh={jobs.reload}
      loading={jobs.loading}
      error={jobs.error}
      toolbar={
        <>
          <SearchField value={query} onChangeText={setQuery} placeholder="Customer, ticket or bill no." />
          <FilterChips
            activeKey={filter}
            onSelect={(k) => setFilter(k as Filter)}
            items={[
              { key: 'all', label: 'All', count: rows.length },
              { key: 'paid', label: 'Paid', count: rows.filter((r) => r.payment_status === 'paid').length },
              { key: 'unpaid', label: 'Unpaid', count: rows.filter((r) => r.payment_status !== 'paid').length },
            ]}
          />
        </>
      }
    >
      <StatGrid
        items={[
          { label: 'Billed', value: inr(billed) },
          { label: 'Received', value: inr(received), color: theme.ok },
          { label: 'Pending', value: inr(billed - received), color: theme.warn },
        ]}
      />
      {visible.length === 0 ? <EmptyNote text="No bills match" icon="document" /> : null}
      {visible.map((r) => {
        const wa = whatsappLink(r);
        const isPaid = r.payment_status === 'paid';
        return (
          <ListRow
            key={r.id}
            icon="document"
            iconColor={isPaid ? theme.ok : theme.warn}
            title={r.full_name || 'Customer'}
            subtitle={r.service_item || undefined}
            meta={`${r.bill_no || r.ticket_no || ''} · ${dateTime(r.bill_generated_at || r.created_at)}`}
            value={inr(r.bill_total)}
            badge={{ label: isPaid ? 'Paid' : 'Unpaid', color: isPaid ? theme.ok : theme.warn }}
            footer={
              r.bill_pdf_url || wa ? (
                <>
                  {r.bill_pdf_url ? (
                    <ActionButton label="View PDF" tone="neutral" onPress={() => Linking.openURL(resolveUploadUrl(r.bill_pdf_url as string))} />
                  ) : null}
                  {wa ? <ActionButton label="WhatsApp" tone="success" onPress={() => Linking.openURL(wa)} /> : null}
                </>
              ) : undefined
            }
          />
        );
      })}
    </AdminScreen>
  );
}
