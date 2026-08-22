import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import GlassSurface from './GlassSurface';
import Icon from './Icon';
import PressScale from './PressScale';
import { IconName } from '../theme/icons';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand, semantic } from '../theme/tokens';
import { updateTaskStatus, TaskItem, StatusOption } from '../api/tasks';
import { ApiError } from '../api/client';

interface Props {
  item: TaskItem;
  onDismiss: () => void;
  onSaved: () => void;
}

// Shared between ManageTasksScreen (list) and TaskDetailScreen (single-item
// deep link from Today's Route) so both reach the same real status workflow
// instead of each screen growing its own copy.
export default function TaskStatusModal({ item, onDismiss, onSaved }: Props) {
  const { theme } = useTheme();
  const options: { key: StatusOption; label: string; icon: IconName }[] = item.reopened
    ? [{ key: 'foc', label: 'FOC — Free of Cost (rework)', icon: 'check' }]
    : [
        { key: 'in_progress', label: 'In Progress', icon: 'clock' },
        { key: 'reschedule', label: 'Reschedule visit', icon: 'calendar' },
        { key: 'issue_not_resolved', label: 'Issue Not Resolved', icon: 'alert' },
        { key: 'case_closed', label: 'Case Closed (final)', icon: 'close' },
      ];
  const [status, setStatus] = useState<StatusOption>(options[0].key);
  const [detail, setDetail] = useState(item.employeeUpdateDetail || '');
  const [scheduledAt, setScheduledAt] = useState('');
  const [billNo, setBillNo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (status === 'reschedule') {
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(scheduledAt.trim())) {
        setError('Enter the new visit time as YYYY-MM-DD HH:MM');
        return;
      }
    } else if (!detail.trim()) {
      setError('Describe the work done — this is required');
      return;
    }
    if (status === 'foc' && !billNo.trim()) {
      setError("Enter the client's existing bill number");
      return;
    }
    setSaving(true);
    try {
      await updateTaskStatus(item, {
        status,
        detail: detail.trim(),
        scheduledAt: status === 'reschedule' ? `${scheduledAt.trim()}:00` : undefined,
        billNo: status === 'foc' ? billNo.trim() : undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save — check your connection');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <GlassSurface style={styles.modalCard} borderRadius={radius.lg}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Update Status</Text>
            <Text style={[styles.modalSub, { color: theme.text3 }]}>{item.fullName} · {item.ticketNo || 'No ticket'}</Text>

            {item.reopened ? (
              <View style={styles.reopenedBanner}>
                <Icon name="alert" size={14} color={semantic.warning} />
                <Text style={styles.reopenedBannerText}>Reopened — complete as free rework (FOC), no new bill.</Text>
              </View>
            ) : null}

            <Text style={[styles.fieldLabel, { color: theme.text3, marginTop: spacing(3) }]}>New Status</Text>
            <View style={styles.optionList}>
              {options.map((opt) => {
                const active = status === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setStatus(opt.key)}
                    style={[styles.optionRow, { borderColor: active ? brand.primary : theme.line, backgroundColor: active ? `${brand.primary}1a` : theme.panel2 }]}
                  >
                    <Icon name={opt.icon} size={16} color={active ? brand.primary : theme.text3} />
                    <Text style={[styles.optionText, { color: active ? brand.primary : theme.text }]}>{opt.label}</Text>
                    {active ? <Icon name="check" size={15} color={brand.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>

            {status === 'reschedule' ? (
              <>
                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>New visit date &amp; time</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.line }]}
                  placeholder="YYYY-MM-DD HH:MM"
                  placeholderTextColor={theme.text3}
                  value={scheduledAt}
                  onChangeText={setScheduledAt}
                />
              </>
            ) : (
              <>
                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Work Details / Progress Update</Text>
                <TextInput
                  style={[styles.input, styles.textArea, { color: theme.text, borderColor: theme.line }]}
                  placeholder="Describe what you did… (mandatory)"
                  placeholderTextColor={theme.text3}
                  value={detail}
                  onChangeText={setDetail}
                  multiline
                />
              </>
            )}

            {status === 'foc' ? (
              <>
                <Text style={[styles.fieldLabel, { color: theme.text3 }]}>Client Bill Number</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.line }]}
                  placeholder="Enter the customer's existing bill number"
                  placeholderTextColor={theme.text3}
                  value={billNo}
                  onChangeText={setBillNo}
                />
              </>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.modalActions}>
              <Pressable onPress={onDismiss} style={[styles.cancelBtn, { borderColor: theme.line }]}>
                <Text style={[styles.cancelBtnText, { color: theme.text }]}>Cancel</Text>
              </Pressable>
              <PressScale onPress={handleSave} disabled={saving} style={{ flex: 1 }}>
                <View style={[styles.saveBtn, { backgroundColor: brand.primary, opacity: saving ? 0.7 : 1 }]}>
                  <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
                </View>
              </PressScale>
            </View>
          </ScrollView>
        </GlassSurface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing(5) },
  modalCard: { width: '100%', maxWidth: 440, maxHeight: '86%', padding: spacing(5) },
  modalTitle: { ...typography.heading, fontSize: 18 },
  modalSub: { ...typography.caption, marginTop: spacing(0.5) },
  reopenedBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing(2), backgroundColor: 'rgba(224,138,20,0.14)', borderRadius: radius.md, padding: spacing(2.5), marginTop: spacing(3) },
  reopenedBannerText: { flex: 1, fontSize: 12, color: semantic.warning, lineHeight: 17 },
  fieldLabel: { fontFamily: 'Manrope_700Bold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing(3), marginBottom: spacing(1) },
  optionList: { gap: spacing(2) },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: spacing(3), paddingVertical: spacing(2.75) },
  optionText: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 13 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), paddingVertical: spacing(2.5), fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  textArea: { minHeight: 90, textAlignVertical: 'top' },
  error: { fontSize: 12, color: semantic.danger, marginTop: spacing(2.5) },
  modalActions: { flexDirection: 'row', gap: spacing(2.5), marginTop: spacing(4) },
  cancelBtn: { paddingHorizontal: spacing(4), height: 46, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  saveBtn: { height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#fff' },
});
