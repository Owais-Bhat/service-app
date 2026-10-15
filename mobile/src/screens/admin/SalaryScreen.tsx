import React, { useMemo } from 'react';
import AdminScreen from '../../components/admin/AdminScreen';
import StatGrid from '../../components/admin/StatGrid';
import ListRow from '../../components/admin/ListRow';
import EmptyNote from '../../components/admin/EmptyNote';
import { fetchLeaves, fetchMonthAttendance, fetchPeople, SalaryLeave } from '../../api/adminMoney';
import { useTheme } from '../../theme/ThemeContext';
import { inr } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

function daysInclusive(from: string, to: string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

// Attendance-based estimate for the current month, the same formula as the web
// Salary page: monthly salary ÷ days in month × (days present + approved leave).
export default function SalaryScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const data = useLoader(async () => {
    const [people, attendance, leaves] = await Promise.all([fetchPeople('employee'), fetchMonthAttendance(), fetchLeaves()]);
    return { people, attendance, leaves };
  }, 'Could not load salary data');

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const rows = useMemo(() => {
    if (!data.data) return [];
    const { people, attendance, leaves } = data.data;
    return people.map((emp) => {
      const present = new Set(
        attendance.filter((a) => a.user_id === emp.id && String(a.date || '').startsWith(monthKey)).map((a) => String(a.date).slice(0, 10)),
      ).size;
      const leave = leaves
        .filter((l: SalaryLeave) => l.employee_id === emp.id && l.status === 'approved' && String(l.start_date || '').startsWith(monthKey))
        .reduce((s, l) => s + daysInclusive(l.start_date, l.end_date), 0);
      const monthly = Number(emp.salary) || 0;
      return { emp, present, leave, monthly, earned: (monthly / daysInMonth) * (present + leave) };
    });
  }, [data.data, monthKey, daysInMonth]);

  const payroll = rows.reduce((s, r) => s + r.monthly, 0);
  const earned = rows.reduce((s, r) => s + r.earned, 0);

  return (
    <AdminScreen
      title="Salary"
      subtitle={now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
      onBack={onBack}
      onRefresh={data.reload}
      loading={data.loading}
      error={data.error}
    >
      <StatGrid
        items={[
          { label: 'Employees', value: rows.length },
          { label: 'Monthly payroll', value: inr(payroll) },
          { label: 'Earned so far', value: inr(earned), color: theme.ok },
        ]}
      />
      {rows.length === 0 ? <EmptyNote text="No employees found" icon="people" /> : null}
      {rows.map((r) => (
        <ListRow
          key={r.emp.id}
          icon="user"
          title={r.emp.full_name || 'Employee'}
          subtitle={`${r.present} days present${r.leave ? ` + ${r.leave} leave` : ''} · salary ${inr(r.monthly)}`}
          value={inr(r.earned)}
          valueColor={theme.ok}
          badge={r.monthly ? undefined : { label: 'No salary set', color: theme.warn }}
        />
      ))}
    </AdminScreen>
  );
}
