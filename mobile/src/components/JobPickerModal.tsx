import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import GlassSurface from './GlassSurface';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, typography } from '../theme';
import { brand } from '../theme/tokens';
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
        <GlassSurface style={styles.card} borderRadius={radius.lg}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Completed Job</Text>
            <Pressable onPress={onDismiss} style={styles.closeBtn} hitSlop={10}>
              <Icon name="close" size={16} color={theme.text} />
            </Pressable>
          </View>

          <View style={[styles.searchBox, { borderColor: theme.line, backgroundColor: theme.panel2 }]}>
            <Icon name="search" size={15} color={theme.text3} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search ticket or customer…"
              placeholderTextColor={theme.text3}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {loading ? (
            <ActivityIndicator color={brand.primary} style={{ marginVertical: spacing(6) }} />
          ) : error ? (
            <Text style={[styles.empty, { color: theme.text3 }]}>{error}</Text>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {filtered.length === 0 ? (
                <Text style={[styles.empty, { color: theme.text3 }]}>No completed jobs to claim yet.</Text>
              ) : (
                filtered.map((j) => (
                  <Pressable
                    key={j.id}
                    onPress={() => onSelect(j)}
                    style={({ pressed }) => [styles.row, { borderColor: theme.line }, pressed && styles.rowPressed]}
                  >
                    <View style={[styles.rowIconChip, { backgroundColor: `${brand.primary}1c` }]}>
                      <Icon name="receipt" size={13} color={brand.primary} />
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
  title: { ...typography.heading, fontSize: 17 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing(3), height: 42, marginBottom: spacing(3) },
  searchInput: { flex: 1, fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  list: { maxHeight: 380 },
  empty: { fontSize: 13, textAlign: 'center', marginVertical: spacing(6) },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5), paddingVertical: spacing(2.5), borderBottomWidth: 1 },
  rowPressed: { opacity: 0.6 },
  rowIconChip: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTicket: { fontFamily: 'Manrope_700Bold', fontSize: 13, marginBottom: spacing(0.25) },
  rowName: { fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
});
