import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import Icon from '../Icon';
import { IconName } from '../../theme/icons';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing, typography } from '../../theme';
import { brand } from '../../theme/tokens';

// Small layout pieces for the books / finance / settings screens, taken from
// the NEST Admin Books design. Everything reads useTheme() so light and dark
// follow the mode; nothing here changes behaviour — they are presentation only.

/** Header action: 44 x 44, transparent, 22 dp outline icon (design header). */
export function HeaderAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4} style={styles.headerAction}>
      <Icon name={icon} size={22} color={theme.text2} />
    </Pressable>
  );
}

/** Overline above a grouped panel: 11/700 uppercase, 0.8 tracking, text3. */
export function Overline({ children, style }: { children: string; style?: ViewStyle }) {
  const { theme } = useTheme();
  return <Text style={[styles.overline, { color: theme.text3 }, style]}>{children.toUpperCase()}</Text>;
}

/** Solid r18 panel that clips its rows, with hairline dividers between them. */
export function RowPanel({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { theme } = useTheme();
  return <View style={[styles.rowPanel, { backgroundColor: theme.panel, borderColor: theme.border }, style]}>{children}</View>;
}

/** One panel row: label (+ hint) left, value or control right, min 56 dp. */
export function PanelRow({
  label,
  hint,
  value,
  mono,
  last,
  children,
  valueColor,
}: {
  label: string;
  hint?: string;
  value?: string;
  mono?: boolean;
  last?: boolean;
  valueColor?: string;
  children?: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.panelRow, { borderBottomColor: theme.line }, last && styles.noRule]}>
      <View style={styles.flex}>
        <Text style={[styles.panelLabel, { color: theme.text }]}>{label}</Text>
        {hint ? <Text style={[styles.panelHint, { color: theme.text3 }]}>{hint}</Text> : null}
      </View>
      {value ? (
        <Text style={[mono ? styles.panelMono : styles.panelValue, { color: valueColor || (mono ? theme.text : theme.text2) }]} numberOfLines={2}>
          {value}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/** The design's 52 x 32 switch: filled Primary 600 when on, border tone when off. */
export function ToggleSwitch({ value, onValueChange, label, disabled }: { value: boolean; onValueChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={label}
      hitSlop={8}
      style={[styles.switchTrack, { backgroundColor: value ? brand.fill : theme.border, justifyContent: value ? 'flex-end' : 'flex-start', opacity: disabled ? 0.5 : 1 }]}
    >
      <View style={styles.switchKnob} />
    </Pressable>
  );
}

/** Switch with its label, as a panel row. */
export function SwitchRow({
  label,
  hint,
  value,
  onValueChange,
  last,
  labelColor,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  last?: boolean;
  labelColor?: string;
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.panelRow, { borderBottomColor: theme.line }, last && styles.noRule]}>
      <View style={styles.flex}>
        <Text style={[styles.panelLabel, { color: labelColor || theme.text }]}>{label}</Text>
        {hint ? <Text style={[styles.panelHint, { color: theme.text3 }]}>{hint}</Text> : null}
      </View>
      <ToggleSwitch value={value} onValueChange={onValueChange} label={label} disabled={disabled} />
    </View>
  );
}

/** Wrapping single-choice chips: 36 dp, r999, selected = Primary 600 + white. */
export function ChoiceChips({ items, value, onChange }: { items: [string, string][]; value: string; onChange: (v: string) => void }) {
  const { theme } = useTheme();
  return (
    <View style={styles.chips}>
      {items.map(([k, l]) => {
        const on = k === value;
        return (
          <Pressable
            key={k || 'none'}
            onPress={() => onChange(k)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.chip, on ? { backgroundColor: brand.fill, borderColor: brand.fill } : { backgroundColor: theme.panel, borderColor: theme.border }]}
          >
            {on ? <Icon name="check" size={14} color="#ffffff" /> : null}
            <Text style={[styles.chipText, { color: on ? '#ffffff' : theme.text }]} numberOfLines={1}>{l}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Segmented control: p2 track r16, selected = solid panel tile r12. */
export function Segmented({ items, value, onChange }: { items: [string, string][]; value: string; onChange: (v: string) => void }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.segTrack, { backgroundColor: theme.panel2 }]}>
      {items.map(([k, l]) => {
        const on = k === value;
        return (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.segItem, on && { backgroundColor: theme.panel, borderWidth: 1, borderColor: theme.border }]}
          >
            <Text style={[on ? styles.segOn : styles.segOff, { color: on ? theme.text : theme.text2 }]} numberOfLines={1}>{l}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 4 dp step bar with 11/700 labels; steps up to `current` are accent. */
export function StepBar({ steps, current }: { steps: string[]; current: number }) {
  const { theme } = useTheme();
  return (
    <View style={styles.steps}>
      {steps.map((l, i) => (
        <View key={l} style={styles.step}>
          <View style={[styles.stepBar, { backgroundColor: i <= current ? theme.accent : theme.line }]} />
          <Text style={[styles.stepLabel, { color: i === current ? theme.text : i < current ? theme.accent : theme.text3 }]} numberOfLines={1}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

/** Soft information strip: icon + one short paragraph on the secondary panel. */
export function Notice({ icon, children, tone = 'neutral' }: { icon: IconName; children: React.ReactNode; tone?: 'neutral' | 'warn' | 'err' | 'ok' }) {
  const { theme } = useTheme();
  const palette = {
    neutral: { bg: theme.panel2, border: 'transparent', fg: theme.text3 },
    ok: { bg: theme.okS, border: theme.ok, fg: theme.ok },
    warn: { bg: theme.warnS, border: theme.warn, fg: theme.warn },
    err: { bg: theme.errS, border: theme.err, fg: theme.err },
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Icon name={icon} size={18} color={palette.fg} />
      <Text style={[styles.noticeText, { color: theme.text2 }]}>{children}</Text>
    </View>
  );
}

/** Avatar tile: 52 dp r16, initials in Space Grotesk on a tinted square. */
export function InitialsTile({ name, tint, tintBg }: { name: string; tint: string; tintBg: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <View style={[styles.initials, { backgroundColor: tintBg }]}>
      <Text style={[styles.initialsText, { color: tint }]}>{initials || '·'}</Text>
    </View>
  );
}

/** Two-up mini metric on the secondary panel (label 11/600, value mono 18). */
export function MiniStat({ label, value, color, mono = true }: { label: string; value: string; color?: string; mono?: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.mini, { backgroundColor: theme.panel2 }]}>
      <Text style={[styles.miniLabel, { color: theme.text3 }]}>{label}</Text>
      <Text style={[mono ? styles.miniMono : styles.miniText, { color: color || theme.text }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

/** Bordered 44 dp contact / secondary action button (design contact row). */
export function ContactButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.contact, { backgroundColor: theme.panel, borderColor: theme.border }, pressed && { opacity: 0.75 }]}>
      <Icon name={icon} size={16} color={theme.text} />
      <Text style={[styles.contactText, { color: theme.text }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/** Icon tile for a quick action: min 68 dp, r16, accent icon over an 11/700 label. */
export function ActionTile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.tile, { backgroundColor: theme.panel, borderColor: theme.border }, pressed && { opacity: 0.75 }]}
    >
      <Icon name={icon} size={20} color={theme.accent} />
      <Text style={[styles.tileText, { color: theme.text }]} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

/** Glass summary card heading a document: party, total (mono), status line, dates. */
export function DocHero({ party, total, note, noteColor, meta }: { party: string; total: string; note?: string; noteColor?: string; meta?: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.hero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.heroParty, { color: theme.text2 }]} numberOfLines={1}>{party}</Text>
      <Text style={[styles.heroTotal, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit>{total}</Text>
      {note ? <Text style={[styles.heroNote, { color: noteColor || theme.text2 }]}>{note}</Text> : null}
      {meta ? <Text style={[styles.heroMeta, { color: theme.text3 }]}>{meta}</Text> : null}
    </View>
  );
}

/** Document lines on a solid panel: name, mono qty × rate line, mono amount. */
export function LinesPanel({ rows }: { rows: { key: string; name: string; meta: string; amount: string }[] }) {
  const { theme } = useTheme();
  return (
    <RowPanel>
      {rows.map((r, i) => (
        <View key={r.key} style={[styles.docLine, { borderBottomColor: theme.line }, i === rows.length - 1 && styles.noRule]}>
          <View style={styles.flex}>
            <Text style={[styles.docLineName, { color: theme.text }]} numberOfLines={2}>{r.name}</Text>
            <Text style={[styles.docLineMeta, { color: theme.text3 }]}>{r.meta}</Text>
          </View>
          <Text style={[styles.docLineAmount, { color: theme.text }]}>{r.amount}</Text>
        </View>
      ))}
    </RowPanel>
  );
}

/** Taxable / tax rows over a ruled grand total, on the secondary panel. */
export function TotalsBox({ rows, grand }: { rows: [string, string][]; grand: [string, string] }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.totalsBox, { backgroundColor: theme.panel2 }]}>
      {rows.map(([l, v]) => (
        <View key={l} style={styles.totalsRow}>
          <Text style={[styles.totalsLabel, { color: theme.text2 }]}>{l}</Text>
          <Text style={[styles.totalsMono, { color: theme.text }]}>{v}</Text>
        </View>
      ))}
      <View style={[styles.totalsRow, styles.totalsGrand, { borderTopColor: theme.line }]}>
        <Text style={[styles.grandLabel, { color: theme.text }]}>{grand[0]}</Text>
        <Text style={[styles.grandValue, { color: theme.text }]}>{grand[1]}</Text>
      </View>
    </View>
  );
}

/** Quantity stepper: 44 dp, r12 — minus, typed value in mono, plus. */
export function Stepper({ value, onChange, min = 0 }: { value: string; onChange: (v: string) => void; min?: number }) {
  const { theme } = useTheme();
  const step = (d: number) => onChange(String(Math.max(min, (Number(value) || 0) + d)));
  return (
    <View style={[styles.stepper, { borderColor: theme.border }]}>
      <Pressable onPress={() => step(-1)} accessibilityLabel="Less" hitSlop={4} style={styles.stepBtn}>
        <Text style={[styles.stepGlyph, { color: theme.text }]}>−</Text>
      </Pressable>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        selectTextOnFocus
        style={[styles.stepValue, { color: theme.text }]}
      />
      <Pressable onPress={() => step(1)} accessibilityLabel="More" hitSlop={4} style={styles.stepBtn}>
        <Text style={[styles.stepGlyph, { color: theme.text }]}>+</Text>
      </Pressable>
    </View>
  );
}

/** Report headline: glass card, small label, 30 dp mono figure, one written insight. */
export function ReportHero({ label, value, valueColor, insight }: { label: string; value: string; valueColor?: string; insight?: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.reportHero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.heroParty, { color: theme.text2 }]}>{label}</Text>
      <Text style={[styles.heroTotal, { color: valueColor || theme.text }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {insight ? <Text style={[styles.insight, { color: theme.text2 }]}>{insight}</Text> : null}
    </View>
  );
}

export interface ReportRow {
  label: string;
  value: string;
  /** Sub-total or result row: bold; with `tone` it gets the soft status fill. */
  strong?: boolean;
  tone?: 'ok' | 'err' | 'warn';
  sub?: string;
}

/** Report table: label left, mono figure right, 14 dp rows on a solid panel. */
export function ReportTable({ rows }: { rows: ReportRow[] }) {
  const { theme } = useTheme();
  return (
    <RowPanel>
      {rows.map((r, i) => {
        const fg = r.tone ? theme[r.tone] : theme.text;
        const bg = r.tone && r.strong ? theme[`${r.tone}S` as 'okS' | 'errS' | 'warnS'] : 'transparent';
        return (
          <View key={`${r.label}-${i}`} style={[styles.tableRow, { borderBottomColor: theme.line, backgroundColor: bg }, i === rows.length - 1 && styles.noRule]}>
            <View style={styles.flex}>
              <Text style={[r.strong ? styles.tableStrong : styles.tableLabel, { color: theme.text }]} numberOfLines={2}>{r.label}</Text>
              {r.sub ? <Text style={[styles.panelHint, { color: theme.text3 }]}>{r.sub}</Text> : null}
            </View>
            <Text style={[styles.tableValue, { color: fg }]} numberOfLines={1}>{r.value}</Text>
          </View>
        );
      })}
    </RowPanel>
  );
}

/** Glass result card: icon + heading, then label / mono value rows (dry-run summary). */
export function SummaryCard({ icon = 'document', title, rows }: { icon?: IconName; title: string; rows: { label: string; value: string | number; color?: string }[] }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.summaryHead}>
        <Icon name={icon} size={18} color={theme.accent} />
        <Text style={[styles.summaryTitle, { color: theme.text }]}>{title}</Text>
      </View>
      {rows.map((r) => (
        <View key={r.label} style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: theme.text2 }]}>{r.label}</Text>
          <Text style={[styles.summaryValue, { color: r.color || theme.text }]}>{String(r.value)}</Text>
        </View>
      ))}
    </View>
  );
}

/** Attention card with a 1.5 dp tone border: heading, one explanation. */
export function AlertCard({ tone = 'warn', title, children }: { tone?: 'warn' | 'err'; title: string; children?: React.ReactNode }) {
  const { theme } = useTheme();
  const color = tone === 'err' ? theme.err : theme.warn;
  return (
    <View style={[styles.alertCard, { backgroundColor: tone === 'err' ? theme.errS : theme.panel, borderColor: color }]}>
      <View style={styles.summaryHead}>
        <Icon name="alert" size={18} color={color} />
        <Text style={[styles.alertTitle, { color: theme.text }]}>{title}</Text>
      </View>
      {children ? <Text style={[styles.noticeText, { color: theme.text2 }]}>{children}</Text> : null}
    </View>
  );
}

/** Uploaded-file chip: 44 dp tinted tile with the format, name and detail. */
export function FileCard({ tag, name, detail }: { tag: string; name: string; detail?: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.fileCard, { backgroundColor: theme.panel, borderColor: theme.border }]}>
      <View style={[styles.fileTile, { backgroundColor: theme.vioS }]}>
        <Text style={[styles.fileTag, { color: theme.vio }]}>{tag}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={[styles.panelLabel, { color: theme.text }]} numberOfLines={1}>{name}</Text>
        {detail ? <Text style={[styles.panelHint, { color: theme.text3 }]} numberOfLines={2}>{detail}</Text> : null}
      </View>
    </View>
  );
}

/** Destructive outline button: 52 dp, r14, err border on the soft err fill. */
export function DangerButton({ icon, label, onPress }: { icon?: IconName; label: string; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.danger, { backgroundColor: theme.errS, borderColor: theme.err }, pressed && { opacity: 0.75 }]}
    >
      {icon ? <Icon name={icon} size={18} color={theme.err} /> : null}
      <Text style={[styles.dangerText, { color: theme.err }]}>{label}</Text>
    </Pressable>
  );
}

/** Key / value line used in read-only detail panels. */
export function KvLine({ label, value, mono, last, valueColor }: { label: string; value: string; mono?: boolean; last?: boolean; valueColor?: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.kv, { borderBottomColor: theme.line }, last && styles.noRule]}>
      <Text style={[styles.kvLabel, { color: theme.text3 }]}>{label}</Text>
      <Text style={[mono ? styles.kvMono : styles.kvValue, { color: valueColor || theme.text }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  noRule: { borderBottomWidth: 0 },
  headerAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  overline: { ...typography.overline, paddingLeft: spacing(1), marginTop: spacing(2), marginBottom: spacing(2) },
  rowPanel: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing(3) },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingHorizontal: spacing(3.5), paddingVertical: spacing(3), minHeight: 56, borderBottomWidth: 1 },
  panelLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, lineHeight: 20 },
  panelHint: { ...typography.supporting, fontSize: 12, lineHeight: 16 },
  panelValue: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, textAlign: 'right', flexShrink: 1 },
  panelMono: { ...typography.monoId, fontSize: 14, textAlign: 'right', flexShrink: 1 },
  switchTrack: { width: 52, height: 32, borderRadius: 16, padding: 3, flexDirection: 'row', alignItems: 'center' },
  switchKnob: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#ffffff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), height: 36, borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing(3), maxWidth: '100%' },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 13, flexShrink: 1 },
  segTrack: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.md + 2 },
  segItem: { flex: 1, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing(1) },
  segOn: { fontFamily: 'Manrope_700Bold', fontSize: 13 },
  segOff: { fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  steps: { flexDirection: 'row', gap: 4, marginBottom: spacing(3) },
  step: { flex: 1, gap: spacing(1.5) },
  stepBar: { height: 4, borderRadius: 2 },
  stepLabel: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  notice: { flexDirection: 'row', gap: spacing(2.5), padding: spacing(3), borderRadius: radius.md + 2, borderWidth: 1, alignItems: 'flex-start' },
  noticeText: { ...typography.supporting, fontSize: 12, lineHeight: 18, flex: 1 },
  initials: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18 },
  mini: { flex: 1, paddingVertical: spacing(2.5), paddingHorizontal: spacing(3), borderRadius: radius.md },
  miniLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 11 },
  miniMono: { ...typography.monoId, fontSize: 18, lineHeight: 24 },
  miniText: { fontFamily: 'Manrope_700Bold', fontSize: 15, marginTop: 2 },
  contact: { flex: 1, height: 44, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1.5) },
  contactText: { fontFamily: 'Manrope_700Bold', fontSize: 13, flexShrink: 1 },
  tile: { flexGrow: 1, flexBasis: '30%', minHeight: 68, borderRadius: radius.lg - 2, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: spacing(1), paddingHorizontal: spacing(2) },
  tileText: { fontFamily: 'Manrope_700Bold', fontSize: 11, textAlign: 'center' },
  hero: { borderWidth: 1, borderRadius: radius.xl, padding: spacing(4), gap: spacing(1), marginBottom: spacing(2) },
  heroParty: { ...typography.caption, fontSize: 12 },
  heroTotal: { ...typography.kpi, fontSize: 30, lineHeight: 38 },
  heroNote: { ...typography.caption, fontFamily: 'Manrope_700Bold' },
  heroMeta: { ...typography.caption, fontSize: 12 },
  docLine: { flexDirection: 'row', alignItems: 'center', gap: spacing(2.5), paddingHorizontal: spacing(3.5), paddingVertical: spacing(3), borderBottomWidth: 1 },
  docLineName: { fontFamily: 'Manrope_700Bold', fontSize: 14, lineHeight: 20 },
  docLineMeta: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 12, marginTop: 2 },
  docLineAmount: { ...typography.monoId, fontSize: 14 },
  totalsBox: { borderRadius: radius.lg, padding: spacing(3.5), gap: spacing(1.5), marginBottom: spacing(3) },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing(3) },
  totalsLabel: { ...typography.supporting },
  totalsMono: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 13 },
  totalsGrand: { borderTopWidth: 1, paddingTop: spacing(2), marginTop: spacing(1) },
  grandLabel: { fontFamily: 'Manrope_700Bold', fontSize: 16 },
  grandValue: { ...typography.kpi, fontSize: 18, lineHeight: 24 },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 44, borderWidth: 1, borderRadius: radius.sm },
  stepBtn: { width: 36, height: 42, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { fontFamily: 'Manrope_700Bold', fontSize: 20, lineHeight: 24 },
  stepValue: { width: 44, textAlign: 'center', fontFamily: 'JetBrainsMono_700Bold', fontSize: 15, paddingVertical: 0 },
  reportHero: { borderWidth: 1, borderRadius: radius.xl, padding: spacing(4), gap: spacing(1), marginBottom: spacing(3) },
  insight: { ...typography.supporting, marginTop: spacing(1) },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), paddingHorizontal: spacing(3.5), paddingVertical: spacing(3), borderBottomWidth: 1 },
  tableLabel: { fontFamily: 'Manrope_500Medium', fontSize: 14, lineHeight: 20 },
  tableStrong: { fontFamily: 'Manrope_700Bold', fontSize: 14, lineHeight: 20 },
  tableValue: { ...typography.monoId, fontSize: 14 },
  summaryCard: { borderWidth: 1, borderRadius: radius.xl, padding: spacing(4), gap: spacing(2.5), marginBottom: spacing(3) },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  summaryTitle: { fontFamily: 'Manrope_700Bold', fontSize: 15 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing(3) },
  summaryLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, flex: 1 },
  summaryValue: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 13 },
  alertCard: { borderWidth: 1.5, borderRadius: radius.lg, padding: spacing(3.5), gap: spacing(1.5), marginBottom: spacing(3) },
  alertTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, flex: 1 },
  fileCard: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), padding: spacing(3), borderWidth: 1, borderRadius: radius.lg, marginBottom: spacing(3) },
  fileTile: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  fileTag: { fontFamily: 'Manrope_800ExtraBold', fontSize: 10 },
  danger: { height: 52, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(2) },
  dangerText: { ...typography.button },
  kv: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing(3), paddingVertical: spacing(2.5), paddingHorizontal: spacing(3.5), borderBottomWidth: 1 },
  kvLabel: { ...typography.caption, fontSize: 12 },
  kvValue: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, textAlign: 'right', flexShrink: 1 },
  kvMono: { ...typography.monoId, fontSize: 14, textAlign: 'right', flexShrink: 1 },
});
