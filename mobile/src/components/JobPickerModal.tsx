import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from './KeyboardAware';
import GlassSurface from './GlassSurface';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { fetchResolvedJobsForReview, ResolvedJob } from '../api/reviews';

interface Props {
  onDismiss: () => void;
  onSelect: (job: ResolvedJob) => void;
}

// Searchable list of the employee's own completed jobs, for picking which
// ticket a Service-type Bonus Review claim is against — same
// find-the-right-item task as ServicePickerModal, simpler data (flat, no
// category grouping).
export default function JobPickerModal({ onDismiss, onSelect }: Props) {
  const { theme } = useTheme();
  const [jobs, setJobs] = useState<ResolvedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchResolvedJobsForReview()
      .then(setJobs)
      .catch(() => setError('Could not load your completed jobs'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) => (j.ticket_no || '').toLowerCase().includes(q) || (j.full_name || '').toLowerCase().includes(q));
  }, [jobs, search]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <GlassSurface style={styles.card} borderRadius={radius.sheet}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Completed Job</Text>
            <Pressable onPress={onDismiss} style={styles.closeBtn} hitSlop={10}>
              <Icon name="close" size={16} color={theme.text} />
            </Pressable>
          </View>

          <View style={[styles.searchBox, { borderColor: theme.border, backgroundColor: theme.panel }]}>
            <Icon name="search" size={18} color={theme.text2} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search ticket or customer…"
              placeholderTextColor={theme.text3}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {loading ? (
            <ActivityIndicator color={theme.accent} style={{ marginVertical: spacing(6) }} />
          ) : error ? (
            <Text style={[styles.empty, { color: theme.text3 }]}>{error}</Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.list} showsVerticalScrollIndicator={false}>
              {filtered.length === 0 ? (
                <Text style={[styles.empty, { color: theme.text3 }]}>No completed jobs to claim yet.</Text>
              ) : (
                filtered.map((j) => (
                  <Pressable
                    key={j.id}
                    onPress={() => onSelect(j)}
                    style={({ pressed }) => [styles.row, { borderColor: theme.line }, pressed && styles.rowPressed]}
                  >
                    <View style={[styles.rowIconChip, { backgroundColor: theme.okS }]}>
                      <Icon name="receipt" size={18} color={theme.accent} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.rowTicket, { color: theme.text }]} numberOfLines={1}>{j.ticket_no || j.id.slice(0, 8)}</Text>
                      <Text style={[styles.rowName, { color: theme.text3 }]} numberOfLines={1}>{j.full_name || 'Customer'}</Text>
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>
          )}
        </GlassSurface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing(5) },
  card: { width: '100%', maxWidth: 440, maxHeight: '80%', padding: spacing(5) },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(3) },
  title: { ...typography.heading },
  closeBtn: { width: 44, height: 44, marginRight: -spacing(2), alignItems: 'center', justifyContent: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), height: 48, marginBottom: spacing(3) },
  searchInput: { flex: 1, ...typography.body, fontFamily: 'Manrope_500Medium' },
  list: { maxHeight: 380 },
  empty: { fontSize: 13, textAlign: 'center', marginVertical: spacing(6) },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), minHeight: 56, paddingVertical: spacing(2), borderBottomWidth: 1 },
  rowPressed: { opacity: 0.6 },
  rowIconChip: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowTicket: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 13, marginBottom: spacing(0.25) },
  rowName: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
});
