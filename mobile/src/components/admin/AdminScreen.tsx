import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView as ScrollView } from '../KeyboardAware';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MeshBackground from '../MeshBackground';
import AdminHeader from './AdminHeader';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';

interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Pull-to-refresh handler. Omit for screens with nothing to reload. */
  onRefresh?: () => Promise<void> | void;
  loading?: boolean;
  error?: string | null;
  /** Header right slot (e.g. an add button). */
  headerRight?: React.ReactNode;
  /** Pinned under the header and outside the scroll area: search, filter chips. */
  toolbar?: React.ReactNode;
  children?: React.ReactNode;
}

// The one frame every admin screen sits in: mesh background, header, optional
// pinned toolbar, then a scroll area with pull-to-refresh and the shared
// loading / error states. There is deliberately no KeyboardAvoidingView — the
// scroll area keeps taps working while the keyboard is up, KeyboardInsetRoot
// lifts the screen above the keyboard, and the scroll area brings the focused
// input into view.
export default function AdminScreen({ title, subtitle, onBack, onRefresh, loading, error, headerRight, toolbar, children }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const pull = useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  return (
    <View style={styles.root}>
      <MeshBackground />
      <AdminHeader title={title} subtitle={subtitle} onBack={onBack} right={headerRight} />
      {toolbar ? <View style={[styles.toolbar, { borderBottomColor: theme.line }]}>{toolbar}</View> : null}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(10) }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={brand.primary} /> : undefined}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={brand.primary} />
            <Text style={[styles.hint, { color: theme.text3 }]}>Loading…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={[styles.hint, { color: semantic.danger }]}>{error}</Text>
            {onRefresh ? <Text style={[styles.hint, { color: theme.text3 }]}>Pull down to try again</Text> : null}
          </View>
        ) : (
          children
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  toolbar: { paddingHorizontal: spacing(4), paddingVertical: spacing(3), gap: spacing(3), borderBottomWidth: 1 },
  center: { alignItems: 'center', gap: spacing(2), paddingVertical: spacing(12) },
  hint: { ...typography.body, textAlign: 'center' },
});
