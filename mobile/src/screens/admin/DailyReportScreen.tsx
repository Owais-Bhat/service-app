import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import StatGrid from '../../components/admin/StatGrid';
import ActionButton from '../../components/admin/ActionButton';
import SectionLabel from '../../components/admin/SectionLabel';
import Field from '../../components/admin/Field';
import { RowPanel, SwitchRow } from '../../components/admin/FinanceKit';
import {
  buildAttendanceText,
  buildPendingText,
  DailyReport,
  fetchDailyReport,
  localToday,
} from '../../api/adminDailyReport';
import {
  loadReminderPrefs,
  markReportSent,
  parseTime,
  ReminderPrefs,
  saveReminderPrefs,
  syncDailyReportReminder,
  timeText,
} from '../../notifications/dailyReport';
import { sendToWhatsapp } from '../../utils/whatsapp';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { semantic } from '../../theme/tokens';

interface Props {
  onBack: () => void;
}

type Pick = 'today' | 'yesterday' | 'custom';
const CHIPS: { key: Pick; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'custom', label: 'Pick a date' },
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA');
}

// The end-of-day WhatsApp report as two messages: attendance (employee and
// clock-in time) and pending jobs (per employee: ticket, customer, SLA). Each
// opens in WhatsApp; the admin picks the group and presses send. Nothing is
// sent automatically. A daily reminder (5:30 PM by default) brings the admin
// here.
export default function DailyReportScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const [pick, setPick] = useState<Pick>('today');
  const [custom, setCustom] = useState(localToday());
  const date = pick === 'today' ? localToday() : pick === 'yesterday' ? yesterday() : custom;

  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const [prefs, setPrefs] = useState<ReminderPrefs | null>(null);
  const [timeInput, setTimeInput] = useState('17:30');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!DATE_RE.test(date)) return;
    const mine = ++seq.current;
    setLoading(true);
    try {
      const r = await fetchDailyReport(date);
      if (mine !== seq.current) return;
      setReport(r);
      setError(null);
    } catch (e: unknown) {
      if (mine === seq.current) setError(e instanceof Error && e.message ? e.message : 'Could not build the report');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadReminderPrefs().then((p) => {
      setPrefs(p);
      setTimeInput(timeText(p));
    });
  }, []);

  const attText = report ? buildAttendanceText(report) : '';
  const pendText = report ? buildPendingText(report) : '';

  const send = async (text: string) => {
    try {
      await sendToWhatsapp(text);
      await markReportSent(localToday());
    } catch (e) {
      Alert.alert('Could not open WhatsApp', e instanceof Error ? e.message : 'Try Copy instead');
    }
  };

  const copy = async (text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert('Copied', 'Paste it into the WhatsApp group.');
    } catch {
      Alert.alert('Could not copy', 'Use Share instead.');
    }
  };

  const share = async (text: string) => {
    try {
      await Share.share({ message: text });
    } catch {
      // Dismissed.
    }
  };

  const saveReminder = async (next: ReminderPrefs) => {
    setSaving(true);
    try {
      await saveReminderPrefs(next);
      setPrefs(next);
      const ok = await syncDailyReportReminder(next);
      if (next.enabled && !ok) {
        Alert.alert('Reminder not set', 'Allow notifications for this app in the phone settings, then try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const saveTime = () => {
    const t = parseTime(timeInput);
    if (!t) return Alert.alert('Check the time', 'Use 24-hour time like 17:30.');
    saveReminder({ enabled: prefs?.enabled ?? true, hour: t.hour, minute: t.minute });
  };

  const message = (title: string, note: string, text: string) => (
    <>
      <SectionLabel>{title}</SectionLabel>
      <View style={[styles.preview, { backgroundColor: theme.panel, borderColor: theme.border }]}>
        <Text selectable style={[styles.previewText, { color: theme.text }]}>{text}</Text>
      </View>
      <Text style={[styles.hint, { color: theme.text3 }]}>{note}</Text>
      <ActionButton label="Send on WhatsApp" onPress={() => send(text)} />
      <View style={styles.pair}>
        <ActionButton label="Copy text" tone="neutral" onPress={() => copy(text)} />
        <ActionButton label="Share…" tone="neutral" onPress={() => share(text)} />
      </View>
    </>
  );

  return (
    <AdminScreen
      title="Daily Report"
      subtitle={`WhatsApp messages · ${date}`}
      onBack={onBack}
      onRefresh={load}
      loading={loading && !report}
      error={!report ? error : null}
      toolbar={
        <View>
          <FilterChips items={CHIPS} activeKey={pick} onSelect={(k) => setPick(k as Pick)} />
          {pick === 'custom' ? (
            <View style={styles.dateRow}>
              <Field label="Attendance date" value={custom} onChangeText={setCustom} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
            </View>
          ) : null}
        </View>
      }
    >
      {report ? (
        <>
          <StatGrid
            items={[
              { label: 'Clocked in', value: `${report.present} / ${report.attendance.length}`, color: semantic.success },
              { label: 'Late', value: report.late, color: report.late ? semantic.warning : undefined },
              { label: 'Pending jobs', value: report.pendingKnown ? report.pendingTotal : '—' },
              { label: 'Past SLA', value: report.pendingKnown ? report.overdueTotal : '—', color: report.overdueTotal ? semantic.danger : undefined },
            ]}
          />

          {message('Message 1 — Attendance', 'Everyone who is not clocked in shows as "Not in".', attText)}
          {message(
            'Message 2 — Pending jobs',
            'Open jobs per employee with the SLA time, as of right now. "!" means the time has passed; "V" is an installation visit (installations have no SLA clock).',
            pendText,
          )}

          <SectionLabel>Daily reminder</SectionLabel>
          <RowPanel>
            <SwitchRow
              label="Remind me every day"
              value={prefs?.enabled ?? true}
              onValueChange={(v) => saveReminder({ enabled: v, hour: prefs?.hour ?? 17, minute: prefs?.minute ?? 30 })}
              last
            />
          </RowPanel>
          <Field label="Reminder time (24-hour)" value={timeInput} onChangeText={setTimeInput} placeholder="17:30" keyboardType="numbers-and-punctuation" />
          <ActionButton label="Save time" tone="neutral" busy={saving} onPress={saveTime} />
          <Text style={[styles.hint, { color: theme.text3 }]}>
            At this time every day the phone shows a notification. Tap it, check both messages, and send them to the group yourself.
          </Text>
        </>
      ) : null}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  dateRow: { paddingHorizontal: spacing(4) },
  pair: { flexDirection: 'row', gap: spacing(2.5), marginTop: spacing(2.5), marginBottom: spacing(2) },
  preview: { borderWidth: 1, borderRadius: radius.lg, padding: spacing(3.5) },
  previewText: { ...typography.caption, fontFamily: 'JetBrainsMono_500Medium', lineHeight: 19 },
  hint: { ...typography.caption, marginTop: spacing(2), marginBottom: spacing(2) },
});
