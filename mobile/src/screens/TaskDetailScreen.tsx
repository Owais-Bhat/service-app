import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import MeshBackground from '../components/MeshBackground';
import GlassCard from '../components/GlassCard';
import Panel from '../components/Panel';
import BackLink from '../components/BackLink';
import Icon from '../components/Icon';
import PressScale from '../components/PressScale';
import TaskStatusModal from '../components/TaskStatusModal';
import LocationMapModal from '../components/LocationMapModal';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic, statusColors, DEFAULT_STATUS_STYLE } from '../theme/tokens';
import { fetchTaskByTicketId, TaskItem } from '../api/tasks';

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
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <Text style={[styles.body, { color: theme.text }]}>{error || 'Ticket not found'}</Text>
          <BackLink onPress={onBack} />
        </View>
      </View>
    );
  }

  const statusStyle = statusColors[displayStatus(item.status)] || DEFAULT_STATUS_STYLE;
  const locked = isLocked(item.status);

  return (
    <View style={styles.root}>
      <MeshBackground />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing(4), padding: spacing(5), paddingBottom: spacing(10) }}>
        <BackLink onPress={onBack} />

        <Animated.View entering={FadeInUp.duration(450).springify()}>
          <GlassCard shadow>
            {item.reopened ? (
              <View style={styles.reopenedTag}>
                <Text style={styles.reopenedTagText}>🔁 Reopened — free rework</Text>
              </View>
            ) : null}
            <View style={styles.headerRow}>
              <Text style={styles.ticketId}>{item.ticketNo || 'No ticket'}</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                <Text style={[styles.statusBadgeText, { color: statusStyle.color }]}>{statusStyle.label}</Text>
              </View>
            </View>
            <Text style={[styles.title, { color: theme.text }]}>{item.serviceItem || item.fullName}</Text>
            {item.companyName ? (
              <View style={styles.categoryChip}>
                <Text style={styles.categoryChipText}>{item.companyName}</Text>
              </View>
            ) : null}
          </GlassCard>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(80).duration(450).springify()}>
          <Panel style={styles.section}>
            <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Customer</Text>
            <Text style={[styles.contactName, { color: theme.text }]}>{item.fullName}</Text>
            {item.phone ? <Text style={[styles.contactLine, { color: theme.text2 }]}>{item.phone}</Text> : null}
            {item.location ? <Text style={[styles.contactLine, { color: theme.text3 }]}>{item.location}</Text> : null}
            {item.preferredTime ? (
              <Text style={[styles.contactLine, { color: brand.primary, marginTop: spacing(1) }]}>Preferred: {item.preferredTime}</Text>
            ) : null}

            <View style={styles.actionRow}>
              {item.phone ? (
                <>
                  <Pressable onPress={() => call(item.phone!)} style={[styles.iconAction, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
                    <Icon name="phone" size={16} color={theme.text} />
                  </Pressable>
                  <Pressable onPress={() => whatsapp(item.phone!)} style={[styles.iconAction, { backgroundColor: '#25D366' }]}>
                    <Icon name="whatsapp" size={16} color="#fff" />
                  </Pressable>
                </>
              ) : null}
              {item.location ? (
                <Pressable onPress={() => setShowMap(true)} style={[styles.iconAction, { backgroundColor: brand.primary }]}>
                  <Icon name="pin" size={16} color="#fff" />
                </Pressable>
              ) : null}
            </View>
          </Panel>
        </Animated.View>

        {item.employeeUpdateDetail ? (
          <Animated.View entering={FadeInUp.delay(140).duration(450).springify()}>
            <Panel style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.text3 }]}>Employee Update</Text>
              <Text style={[styles.body, { color: theme.text2 }]}>{item.employeeUpdateDetail}</Text>
            </Panel>
          </Animated.View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Animated.View entering={FadeInUp.delay(200).duration(450).springify()} style={styles.section}>
          {locked ? (
            <View style={[styles.doneBanner, { borderColor: theme.line }]}>
              <Icon name="check" size={16} color={semantic.success} />
              <Text style={[styles.doneBannerText, { color: theme.text2 }]}>This service is completed and locked.</Text>
            </View>
          ) : (
            <PressScale onPress={() => setShowStatus(true)}>
              <View style={styles.updateBtn}>
                <Icon name="edit" size={16} color="#fff" />
                <Text style={styles.updateBtnText}>Update Status</Text>
              </View>
            </PressScale>
          )}
        </Animated.View>
      </ScrollView>

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
  body: { ...typography.body, textAlign: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing(2) },
  ticketId: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 13, color: brand.primary },
  statusBadge: { paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.sm },
  statusBadgeText: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  title: { ...typography.heading, marginBottom: spacing(2) },
  categoryChip: { paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.sm, alignSelf: 'flex-start', backgroundColor: 'rgba(21,160,90,0.14)' },
  categoryChipText: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: brand.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  reopenedTag: { alignSelf: 'flex-start', backgroundColor: 'rgba(224,138,20,0.16)', borderRadius: radius.sm, paddingHorizontal: spacing(2), paddingVertical: spacing(0.75), marginBottom: spacing(2.5) },
  reopenedTagText: { fontFamily: 'Manrope_700Bold', fontSize: 10, color: semantic.warning },
  section: { marginTop: spacing(4) },
  sectionLabel: { ...typography.caption, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing(2.5) },
  contactName: { ...typography.body, fontFamily: 'Manrope_700Bold', marginBottom: spacing(0.5) },
  contactLine: { ...typography.caption, marginBottom: spacing(0.5) },
  actionRow: { flexDirection: 'row', gap: spacing(2.5), marginTop: spacing(3) },
  iconAction: { width: 40, height: 40, borderRadius: radius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  error: { ...typography.caption, color: brand.danger, marginTop: spacing(3), textAlign: 'center' },
  doneBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.md, padding: spacing(3.5) },
  doneBannerText: { ...typography.body, fontSize: 13 },
  updateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2), backgroundColor: brand.primary, height: 52, borderRadius: radius.md },
  updateBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#fff' },
});
