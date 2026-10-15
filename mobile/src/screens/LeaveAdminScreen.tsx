import React, { useCallback, useEffect, useState } from 'react';
import AdminScreen from '../components/admin/AdminScreen';
import ListRow from '../components/admin/ListRow';
import ActionButton from '../components/admin/ActionButton';
import EmptyNote from '../components/admin/EmptyNote';
import { useTheme } from '../theme/ThemeContext';
import { humanize } from '../utils/format';
import { fetchAllLeaveRequests, updateLeaveStatus, LeaveRequestWithProfile } from '../api/attendance';

interface Props {
  onBack: () => void;
}

export default function LeaveAdminScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const [leaves, setLeaves] = useState<LeaveRequestWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchAllLeaveRequests();
      setLeaves(data);
      setError(null);
    } catch {
      setError('Could not load leave requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, status: 'approved' | 'rejected') => {
    setActing(id + status);
    try {
      await updateLeaveStatus(id, status);
      setLeaves((prev) => prev.map((l) => l.id === id ? { ...l, status } : l));
    } catch {
      // silently ignore — list will refresh on pull
    } finally {
      setActing(null);
    }
  };

  const statusColor = (status: string): string =>
    status === 'approved' ? theme.ok : status === 'rejected' ? theme.err : status === 'pending' ? theme.warn : theme.grey;

  const pending = leaves.filter((l) => l.status === 'pending').length;

  return (
    <AdminScreen
      title="Leave Requests"
      subtitle={pending ? `${pending} waiting for a decision` : 'Approve or reject'}
      onBack={onBack}
      onRefresh={load}
      loading={loading && leaves.length === 0}
      error={error}
    >
      {leaves.length === 0 && !loading && !error ? <EmptyNote text="No leave requests" icon="calendar" /> : null}
      {leaves.map((l) => (
        <ListRow
          key={l.id}
          icon="calendar"
          iconColor={statusColor(l.status)}
          title={l.employee_name ?? 'Unknown'}
          subtitle={l.reason || undefined}
          meta={`${l.start_date} → ${l.end_date}`}
          badge={{ label: humanize(l.status), color: statusColor(l.status) }}
          footer={
            l.status === 'pending' ? (
              <>
                <ActionButton label="Reject" tone="danger" busy={acting === l.id + 'rejected'} onPress={() => act(l.id, 'rejected')} />
                <ActionButton label="Approve" tone="success" busy={acting === l.id + 'approved'} onPress={() => act(l.id, 'approved')} />
              </>
            ) : undefined
          }
        />
      ))}
    </AdminScreen>
  );
}
