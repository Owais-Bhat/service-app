import React, { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import AdminScreen from '../../components/admin/AdminScreen';
import FilterChips from '../../components/admin/FilterChips';
import ListRow from '../../components/admin/ListRow';
import ActionButton from '../../components/admin/ActionButton';
import EmptyNote from '../../components/admin/EmptyNote';
import FormSheet from '../../components/admin/FormSheet';
import Field from '../../components/admin/Field';
import { resolveUploadUrl } from '../../api/client';
import { fetchReviewSubmissions, ReviewSubmission, verifyReview } from '../../api/adminOps';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';
import { humanize } from '../../utils/format';
import { useLoader } from '../../utils/useLoader';

interface Props {
  onBack: () => void;
}

type Status = 'pending' | 'approved' | 'rejected';

const STATUS_COLOR: Record<Status, string> = { pending: semantic.warning, approved: semantic.success, rejected: semantic.danger };

// Review-bonus claims. SMS-type claims arrive on their own from the server;
// Google and job-card claims are checked against their screenshot here.
export default function BonusReviewsAdminScreen({ onBack }: Props) {
  const { theme } = useTheme();
  const [status, setStatus] = useState<Status>('pending');
  const fetcher = useCallback(() => fetchReviewSubmissions(status), [status]);
  const list = useLoader(fetcher, 'Could not load review claims');
  const [target, setTarget] = useState<ReviewSubmission | null>(null);
  const [stars, setStars] = useState('5');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const needsStars = target?.review_type === 'google';

  const approve = async () => {
    if (!target) return;
    const n = Number(stars);
    if (needsStars && !(n >= 1 && n <= 5)) {
      Alert.alert('Star rating', 'Enter the rating shown on the screenshot (1–5)');
      return;
    }
    setBusy(true);
    try {
      await verifyReview(target.id, { status: 'approved', star_rating: needsStars ? n : null, admin_note: note.trim() || null });
      setTarget(null);
      setNote('');
      list.reload();
    } catch (e) {
      Alert.alert('Could not approve', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const reject = (r: ReviewSubmission) =>
    Alert.alert('Reject this claim?', 'The employee will not receive points for it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          try {
            await verifyReview(r.id, { status: 'rejected' });
            list.reload();
          } catch (e) {
            Alert.alert('Could not reject', e instanceof Error ? e.message : 'Try again');
          }
        },
      },
    ]);

  return (
    <AdminScreen
      title="Bonus Reviews"
      subtitle="Verify review-bonus claims"
      onBack={onBack}
      onRefresh={list.reload}
      loading={list.loading}
      error={list.error}
      toolbar={
        <FilterChips
          activeKey={status}
          onSelect={(k) => setStatus(k as Status)}
          items={[
            { key: 'pending', label: 'Pending' },
            { key: 'approved', label: 'Approved' },
            { key: 'rejected', label: 'Rejected' },
          ]}
        />
      }
    >
      {(list.data ?? []).length === 0 ? <EmptyNote text={`No ${status} claims`} icon="star" /> : null}
      {(list.data ?? []).map((r) => (
        <ListRow
          key={r.id}
          icon="star"
          iconColor={STATUS_COLOR[status]}
          title={r.employee_name || 'Employee'}
          subtitle={`${humanize(r.review_type)} · ${r.customer_name || r.claimed_customer_name || r.full_name || 'Customer'}`}
          meta={`${r.ticket_no || 'No ticket'}${r.star_rating != null ? ` · ${'★'.repeat(r.star_rating)}` : ''}`}
          value={r.points != null ? `${r.points} pts` : undefined}
          badge={{ label: status, color: STATUS_COLOR[status] }}
          footer={
            status === 'pending' || r.photo_url ? (
              <>
                {r.photo_url ? (
                  <ActionButton label="Proof" tone="neutral" onPress={() => Linking.openURL(resolveUploadUrl(r.photo_url as string))} />
                ) : null}
                {status === 'pending' ? (
                  <>
                    <ActionButton label="Reject" tone="danger" onPress={() => reject(r)} />
                    <ActionButton label="Approve" tone="success" onPress={() => { setStars('5'); setNote(''); setTarget(r); }} />
                  </>
                ) : null}
              </>
            ) : undefined
          }
        />
      ))}

      <FormSheet
        visible={!!target}
        title="Approve claim"
        subtitle={target ? `${target.employee_name || ''} · ${humanize(target.review_type)}` : undefined}
        onClose={() => setTarget(null)}
        footer={
          <>
            <ActionButton label="Cancel" tone="neutral" onPress={() => setTarget(null)} />
            <ActionButton label="Approve" tone="success" onPress={approve} busy={busy} />
          </>
        }
      >
        {needsStars ? (
          <>
            <Text style={[styles.label, { color: theme.text3 }]}>Stars on the screenshot</Text>
            <View style={styles.row}>
              {['1', '2', '3', '4', '5'].map((n) => {
                const on = n === stars;
                return (
                  <Pressable
                    key={n}
                    onPress={() => setStars(n)}
                    style={[styles.star, { borderColor: on ? brand.primary : theme.line, backgroundColor: on ? brand.primary + '22' : theme.panel2 }]}
                  >
                    <Text style={[styles.starText, { color: on ? brand.primary : theme.text2 }]}>{n} ★</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.hint, { color: theme.text3 }]}>Only 5★ earns the 30-point bonus; 1–4★ saves as approved with 0 points.</Text>
          </>
        ) : null}
        <Field label="Note (optional)" value={note} onChangeText={setNote} multiline />
      </FormSheet>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.caption, fontSize: 12 },
  row: { flexDirection: 'row', gap: spacing(2) },
  star: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing(2.5), alignItems: 'center' },
  starText: { ...typography.caption, fontFamily: 'Manrope_700Bold' },
  hint: { ...typography.caption, fontSize: 11 },
});
