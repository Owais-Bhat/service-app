import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from '../components/KeyboardAware';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import ToolHeader from '../components/ToolHeader';
import StatusBadge from '../components/admin/StatusBadge';
import Icon from '../components/Icon';
import TaskStatusModal from '../components/TaskStatusModal';
import LocationMapModal from '../components/LocationMapModal';
import RequestPhotos from '../components/RequestPhotos';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, statusColors, DEFAULT_STATUS_STYLE } from '../theme/tokens';
import { fetchTaskByTicketId, TaskItem, acceptAssignment, declineAssignment } from '../api/tasks';
import { useAttendanceStatus } from '../context/AttendanceContext';

interface Props {
  ticketId: string;
  onBack: () => void;
}

function displayStatus(status: string): string {
  return status === 'closed' ? 'resolved' : status || 'open';
}

function isLocked(status: string): boolean {
  return ['resolved', 'case_closed', 'foc'].includes(displayStatus(status));
}

export default function TaskDetailScreen({ ticketId, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [item, setItem] = useState<TaskItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStatus, setShowStatus] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const { clockedIn, attendance, showGate } = useAttendanceStatus();

  const load = useCallback(async () => {
    try {
      const t = await fetchTaskByTicketId(ticketId);
      setItem(t);
      setError(t ? null : 'Ticket not found');
    } catch {
      setError('Could not load this task — check your connection');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  const call = (phone: string) => Linking.openURL(`tel:${phone}`);
  const whatsapp = (phone: string) => Linking.openURL(`https://wa.me/${phone.replace(/\D/g, '')}`);

  if (loading) {
    return (
      <View style={styles.root}>
        <MeshBackground />
        <View style={styles.centered}>
          <ActivityIndicator color={brand.primary} size="large" />
        </View>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.root}>
        <MeshBackground />
        <ToolHeader title="Task" onBack={onBack} />
        <View style={styles.centered}>
          <Text style={[styles.body, { color: theme.text }]}>{error || 'Ticket not found'}</Text>
        </View>
      </View>
    );
  }

  if (item.assignmentStatus === 'pending') {
    const blocked = !clockedIn;
    const guard = () => {
      if (!attendance?.clock_in) showGate();
    };
    return (
      <View style={styles.root}>
        <MeshBackground />
        <ToolHeader title="New assignment" subtitle={item.ticketNo || undefined} onBack={onBack} />
        <ScrollView contentContainerStyle={styles.content}>
          <Panel style={styles.pendingPanel}>
            <Text style={[styles.overline, { color: theme.text3 }]}>Customer</Text>
            <Text style={[styles.rowTitle, { color: theme.text }]}>{item.fullName}</Text>
            {item.serviceItem ? (
              <>
                <Text style={[styles.overline, { color: theme.text3, marginTop: spacing(3) }]}>Service</Text>
                <Text style={[styles.supporting, { color: theme.text }]}>{item.serviceItem}</Text>
              </>
            ) : null}
            {item.location ? (
              <>
                <Text style={[styles.overline, { color: theme.text3, marginTop: spacing(3) }]}>Location</Text>
                <Text style={[styles.supporting, { color: theme.text }]}>{item.location}</Text>
              </>
            ) : null}
          </Panel>
          {blocked ? (
            <Text style={[styles.clockHint, { color: theme.text3 }]}>
              {attendance?.clock_in ? 'You have clocked out for today.' : 'Clock in to accept or decline.'}
            </Text>
          ) : null}
        </ScrollView>
        <View style={[styles.sticky, { backgroundColor: theme.surfaceStrong, borderTopColor: theme.line, paddingBottom: insets.bottom + 22 }]}>
          <Pressable
            onPress={async () => {
              if (blocked) return guard();
              if (item.inquiryId) await declineAssignment(item.inquiryId, 'declined by employee');
              onBack();
            }}
            accessibilityRole="button"
            style={[styles.stickyBtn, { flex: 1, borderColor: theme.border, borderWidth: 1 }, blocked && styles.dim]}
          >
            <Text style={[styles.stickyBtnText, { color: theme.text }]}>Decline</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              if (blocked) return guard();
              await acceptAssignment(item);
              load();
            }}
            accessibilityRole="button"
            style={[styles.stickyBtn, { flex: 1.4, backgroundColor: brand.fill }, blocked && styles.dim]}
          >
            <Icon name={blocked ? 'lock' : 'check'} size={18} color="#ffffff" />
            <Text style={[styles.stickyBtnText, { color: '#ffffff' }]}>Accept</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const statusStyle = statusColors[displayStatus(item.status)] || DEFAULT_STATUS_STYLE;
  const locked = isLocked(item.status);

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ToolHeader title={item.ticketNo || 'No ticket'} subtitle={item.serviceItem || undefined} onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.content, !locked && { paddingBottom: spacing(6) }]}>
        <GlassCard>
          {item.reopened ? (
            <View style={[styles.reopenedTag, { backgroundColor: theme.warnS }]}>
              <Icon name="refresh" size={12} color={theme.warn} />
              <Text style={[styles.reopenedTagText, { color: theme.warn }]}>Reopened — free rework</Text>
            </View>
          ) : null}
          <View style={styles.heroTop}>
            <StatusBadge label={statusStyle.label} color={statusStyle.color} />
            <Text style={[styles.ticketId, { color: theme.accent }]}>{item.ticketNo || ''}</Text>
          </View>
          <Text style={[styles.customer, { color: theme.text }]}>{item.fullName}</Text>
          {item.phone ? <Text style={[styles.supporting, { color: theme.text2, marginTop: 2 }]}>{item.phone}</Text> : null}
          {item.location ? <Text style={[styles.supporting, { color: theme.text2, marginTop: spacing(1) }]}>{item.location}</Text> : null}

          {item.phone || item.location ? (
            <View style={styles.contactRow}>
              {item.phone ? (
                <Pressable onPress={() => call(item.phone!)} accessibilityRole="button" style={[styles.contactBtn, { borderColor: theme.border, backgroundColor: theme.panel }]}>
                  <Icon name="phone" size={16} color={theme.text} />
                  <Text style={[styles.contactText, { color: theme.text }]}>Call</Text>
                </Pressable>
              ) : null}
              {item.phone ? (
                <Pressable onPress={() => whatsapp(item.phone!)} accessibilityRole="button" style={[styles.contactBtn, { borderColor: theme.border, backgroundColor: theme.panel }]}>
                  <Icon name="whatsapp" size={16} color={theme.text} />
                  <Text style={[styles.contactText, { color: theme.text }]}>WhatsApp</Text>
                </Pressable>
              ) : null}
              {item.location ? (
                <Pressable onPress={() => setShowMap(true)} accessibilityRole="button" style={[styles.contactBtn, { borderColor: theme.border, backgroundColor: theme.panel }]}>
                  <Icon name="pin" size={16} color={theme.text} />
                  <Text style={[styles.contactText, { color: theme.text }]}>Directions</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </GlassCard>

        {item.serviceItem || item.photoUrls ? (
          <View style={styles.section}>
            <Text style={[styles.heading, { color: theme.text }]}>Issue</Text>
            {item.serviceItem ? <Text style={[styles.body, { color: theme.text2 }]}>{item.serviceItem}</Text> : null}
            <RequestPhotos raw={item.photoUrls} />
          </View>
        ) : null}

        {item.employeeUpdateDetail ? (
          <View style={styles.section}>
            <Text style={[styles.heading, { color: theme.text }]}>Employee update</Text>
            <Text style={[styles.body, { color: theme.text2 }]}>{item.employeeUpdateDetail}</Text>
          </View>
        ) : null}

        {error ? <Text style={[styles.error, { color: theme.err }]}>{error}</Text> : null}

        {locked ? (
          <View style={[styles.doneBanner, { borderColor: theme.border, backgroundColor: theme.okS }]}>
            <Icon name="check-circle" size={18} color={theme.ok} />
            <Text style={[styles.doneBannerText, { color: theme.text }]}>This service is completed and locked.</Text>
          </View>
        ) : null}
      </ScrollView>

      {!locked ? (
        <View style={[styles.sticky, { backgroundColor: theme.surfaceStrong, borderTopColor: theme.line, paddingBottom: insets.bottom + 22 }]}>
          <View style={{ flex: 1 }}>
            <Pressable
              onPress={() => (clockedIn ? setShowStatus(true) : !attendance?.clock_in && showGate())}
              accessibilityRole="button"
              style={[styles.stickyBtn, { backgroundColor: brand.fill }, !clockedIn && styles.dim]}
            >
              <Icon name={clockedIn ? 'swap' : 'lock'} size={18} color="#ffffff" />
              <Text style={[styles.stickyBtnText, { color: '#ffffff' }]}>Update status</Text>
            </Pressable>
            {!clockedIn ? (
              <Text style={[styles.clockHint, { color: theme.text3 }]}>
                {attendance?.clock_in ? 'You have clocked out for today.' : 'Clock in to update this task.'}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {showStatus && (
        <TaskStatusModal
          item={item}
          onDismiss={() => setShowStatus(false)}
          onSaved={() => {
            setShowStatus(false);
            setLoading(true);
            load();
          }}
        />
      )}

      {showMap && (
        <LocationMapModal
          location={item.location}
          lat={item.customerLat}
          lng={item.customerLng}
          onDismiss={() => setShowMap(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing(6), gap: spacing(3) },
  content: { padding: spacing(4), paddingBottom: spacing(10), gap: spacing(5) },
  body: { ...typography.body, fontSize: 14, lineHeight: 20 },
  supporting: { ...typography.supporting },
  rowTitle: { ...typography.rowTitle },
  heading: { ...typography.heading, fontSize: 16, lineHeight: 22 },
  overline: { ...typography.overline, marginBottom: spacing(1) },
  pendingPanel: { gap: 2 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing(3) },
  ticketId: { ...typography.monoId },
  customer: { ...typography.heading, fontSize: 20, lineHeight: 26 },
  contactRow: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(3) },
  contactBtn: { flex: 1, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5), borderRadius: radius.md, borderWidth: 1 },
  contactText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  section: { gap: spacing(2) },
  error: { ...typography.caption, textAlign: 'center' },
  reopenedTag: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), alignSelf: 'flex-start', borderRadius: radius.full, paddingHorizontal: spacing(2.5), height: 24, marginBottom: spacing(2.5) },
  reopenedTagText: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  doneBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.md, padding: spacing(3.5) },
  doneBannerText: { ...typography.supporting, flex: 1 },
  sticky: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingTop: spacing(1), paddingHorizontal: spacing(4), borderTopWidth: 1 },
  stickyBtn: { height: 52, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2) },
  stickyBtnText: { ...typography.button },
  dim: { opacity: 0.5 },
  clockHint: { ...typography.supporting, fontSize: 12, textAlign: 'center', marginTop: spacing(1) },
});
