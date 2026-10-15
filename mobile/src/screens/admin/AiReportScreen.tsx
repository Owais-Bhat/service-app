import React from 'react';
import { Overline } from '../../components/admin/FinanceKit';
import { StyleSheet, Text } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import StatGrid from '../../components/admin/StatGrid';
import ListRow from '../../components/admin/ListRow';
import EmptyNote from '../../components/admin/EmptyNote';
import { fetchAiReport } from '../../api/ai';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, typography } from '../../theme';
import { inr } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

// Business finance and employee progress in one reading, with plain-language
// notes on what needs chasing.
export default function AiReportScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const data = useLoader(fetchAiReport, 'Could not build the report');
  const r = data.data;

  return (
    <AdminScreen title="AI Report" subtitle="Finance and employee progress" onBack={onBack} onRefresh={data.reload} loading={data.loading} error={data.error}>
      {r ? (
        <>
          <StatGrid
            items={[
              { label: 'Paid revenue', value: inr(r.paidRevenue), color: theme.ok },
              { label: 'Awaiting payment', value: inr(r.unpaid), color: r.unpaid ? theme.err : undefined },
              { label: 'Cash pending', value: inr(r.cashPending), color: r.cashPending ? theme.warn : undefined },
              { label: 'Resolved services', value: r.resolved },
              { label: 'Issue not resolved', value: r.issues, color: r.issues ? theme.err : undefined },
              { label: 'Active services', value: r.active, color: theme.warn },
              ...(r.gigJobs
                ? [
                    { label: `Gig pool revenue · ${r.gigJobs} job${r.gigJobs === 1 ? '' : 's'}`, value: inr(r.gigRevenue) },
                    { label: 'Gig worker payouts', value: inr(r.gigPayout) },
                  ]
                : []),
            ]}
          />

          <Overline>Business notes</Overline>
          <Text style={[styles.note, { color: theme.text2 }]}>
            <Text style={styles.bold}>Finance: </Text>
            {r.unpaid > 0 ? `Collect ${inr(r.unpaid)} from unpaid bills. ` : 'No unpaid bill amount is pending. '}
            {r.cashPending > 0 ? `Cash handover pending is ${inr(r.cashPending)}.` : 'No cash is waiting to be handed in.'}
          </Text>
          <Text style={[styles.note, { color: theme.text2 }]}>
            <Text style={styles.bold}>Service quality: </Text>
            {r.issues ? `${r.issues} service(s) are marked Issue Not Resolved and need follow-up.` : 'No unresolved issue services are currently marked.'}
          </Text>
          <Text style={[styles.note, { color: theme.text2 }]}>
            <Text style={styles.bold}>Employee progress: </Text>
            {r.eodCount} EOD reports are recorded. {r.online} employee(s) are currently clocked in.
          </Text>

          <Overline>Employee progress</Overline>
          {r.employees.length === 0 ? <EmptyNote text="No employees found" icon="people" /> : null}
          {r.employees.map((e) => (
            <ListRow
              key={e.id}
              icon="user"
              iconColor={e.online ? theme.ok : undefined}
              title={e.name}
              subtitle={`${e.gig ? 'Gig' : 'Fixed'} · ${e.assigned} assigned · ${e.resolved} resolved`}
              meta={e.issues ? `${e.issues} issue${e.issues === 1 ? '' : 's'} not resolved` : undefined}
              badge={e.online ? { label: 'Online', color: theme.ok } : { label: 'Offline', color: theme.grey }}
            />
          ))}
        </>
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  note: { ...typography.body, marginBottom: spacing(2), lineHeight: 21 },
  bold: { fontFamily: 'Manrope_700Bold' },
});
