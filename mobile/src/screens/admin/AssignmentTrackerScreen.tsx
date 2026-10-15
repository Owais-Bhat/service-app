import React, { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import { fetchTracker, resendAssignment } from '../../api/adminManage';
import { semantic, brand } from '../../theme/tokens';
import { dateTime } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Filter = 'not_seen' | 'not_accepted' | 'all';

const WA: Record<string, { label: string; color: string }> = {
  not_sent: { label: 'Not sent', color: brand.grey },
  sent: { label: 'Sent', color: semantic.warning },
  delivered: { label: 'Delivered', color: semantic.warning },
  read: { label: 'Read', color: semantic.success },
  failed: { label: 'Failed', color: semantic.danger },
};

function waiting(min: number | null): string {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${min % 60 ? `${min % 60} min` : ''}`.trim();
  return `${Math.floor(h / 24)} days`;
}

// Who has noticed the job they were given? A job is "seen" once the technician
// read the WhatsApp, opened it in the app, or accepted it.
export default function AssignmentTrackerScreen({ onBack }: Props) {
  const [filter, setFilter] = useState<Filter>('not_seen');
  const fetcher = useCallback(() => fetchTracker(filter), [filter]);
  const data = useLoader(fetcher, 'Could not load the tracker');
  const [busy, setBusy] = useState<string | null>(null);

  const resend = async (kind: string, id: string) => {
    setBusy(id);
    try {
      await resendAssignment(kind, id);
      Alert.alert('Sent', 'The WhatsApp was sent again.');
      await data.reload();
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(null);
    }
  };

  const counts = data.data?.counts;
  const rows = data.data?.rows ?? [];

  return (
    <AdminScreen
      title="Assignment Tracker"
      subtitle="Who has noticed the job they were given"
      onBack={onBack}
      onRefresh={data.reload}
      loading={data.loading}
      error={data.error}
      toolbar={
        <FilterChips
          activeKey={filter}
          onSelect={(k) => setFilter(k as Filter)}
          items={[
            { key: 'not_seen', label: 'Not seen', count: counts?.not_seen },
            { key: 'not_accepted', label: 'Not accepted', count: counts?.not_accepted },
            { key: 'all', label: 'All open jobs', count: counts?.all },
          ]}
        />
      }
    >
      {rows.length === 0 ? <EmptyNote text={filter === 'not_seen' ? 'Everyone has seen the jobs they were given' : 'Nothing here'} icon="check-circle" /> : null}
      {rows.map((r) => {
        const wa = WA[r.whatsapp.state] ?? { label: r.whatsapp.state, color: brand.grey };
        return (
          <ListRow
            key={r.id}
            icon={r.seen ? 'check-circle' : 'alert'}
            iconColor={r.seen ? semantic.success : semantic.warning}
            title={`${r.ticket_no || '—'} · ${r.customer_name}`}
            subtitle={`${r.employee_name || 'Unassigned'}${r.service ? ` · ${r.service}` : ''}`}
            meta={`Waiting ${waiting(r.minutes_waiting)} · app ${r.app_opened_at ? `opened ${dateTime(r.app_opened_at)}` : 'not opened'} · ${r.accepted ? 'accepted' : 'not accepted'}`}
            badge={{ label: `WhatsApp ${wa.label}`, color: wa.color }}
            footer={
              <>
                <ActionButton label="Share to group" tone="neutral" onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(r.group_text)}`)} />
                <ActionButton label="Send again" busy={busy === r.id} onPress={() => resend(r.kind, r.id)} />
              </>
            }
          />
        );
      })}
    </AdminScreen>
  );
}
