import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from '../Icon';
import { IconName } from '../../theme/icons';
import { radius, spacing, typography } from '../../theme';

interface Props {
  label: string;
  color: string;
  /** Overrides the glyph picked from the label. */
  icon?: IconName;
}

// Design: status is always icon + text, never colour alone. The glyph is
// picked from the label's wording, first match wins.
const GLYPHS: [RegExp, IconName][] = [
  [/overdue|late|breach/i, 'timer'],
  [/not resolved|issue|fail|reject|declin|cancel|restrict|error|unpaid|due|disput/i, 'alert'],
  [/awaiting|pending|hold|wait/i, 'hourglass'],
  [/paid|collected|received|settled|complete|done/i, 'check-done'],
  [/resolved|approved|accept|active|success|present|verified/i, 'check-circle'],
  [/progress|working|started|processing/i, 'construct'],
  [/assigned|scheduled|claimed/i, 'person-circle'],
  [/closed|inactive|hidden|foc|archiv|expired|no access|absent/i, 'remove-circle'],
  [/open|new|draft/i, 'dot'],
];

function glyphFor(label: string): IconName {
  return GLYPHS.find(([re]) => re.test(label))?.[1] ?? 'dot';
}

export default function StatusBadge({ label, color, icon }: Props) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '24' }]}>
      <Icon name={icon ?? glyphFor(label)} size={12} color={color} filled />
      <Text style={[styles.text, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, borderRadius: radius.full, paddingHorizontal: spacing(2.5), alignSelf: 'flex-start' },
  text: { ...typography.caption, fontFamily: 'Manrope_700Bold', fontSize: 12, lineHeight: 16, flexShrink: 1 },
});
