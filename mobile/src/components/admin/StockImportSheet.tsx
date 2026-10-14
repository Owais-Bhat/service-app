import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import FormSheet from './FormSheet';
import ActionButton from './ActionButton';
import ListRow from './ListRow';
import Field from './Field';
import SectionLabel from './SectionLabel';
import StatGrid from './StatGrid';
import { api } from '../../api/client';
import { parseCsv } from '../../api/servicePricing';
import { shareCsv } from '../../utils/shareCsv';
import { useTheme } from '../../theme/ThemeContext';
import { spacing, typography } from '../../theme';
import { brand, semantic } from '../../theme/tokens';
import { todayIso } from '../../utils/format';

interface Props {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}

interface Check {
  ok: boolean;
  errors: string[];
  ignored_columns: string[];
  summary: { rows: number; create: number; update: number; with_stock: number; restock: number; restock_up: number; restock_down: number; total_value_paise: number };
  rows: { row: number; name: string; sku: string | null; action: string; problems: string[]; stock_mode?: string; opening_qty?: number; stock_before?: number; stock_delta?: number }[];
}

const errText = (e: unknown, f: string) => (e instanceof Error && e.message ? e.message : f);

// Bring items (and the stock on the shelf) in from a CSV: the sheet is checked
// first and nothing is saved until every row is correct — same rules as the
// web's Import Excel. Save an Excel sheet as CSV to use it here.
export default function StockImportSheet({ visible, onClose, onDone }: Props) {
  const { theme } = useTheme();
  const [file, setFile] = useState<{ name: string; rows: string[][] } | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [updateStock, setUpdateStock] = useState(true);
  const [date, setDate] = useState(todayIso());
  const [busy, setBusy] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setCheck(null);
    setUpdateStock(true);
    setBusy(null);
  };

  const run = async (key: string, fn: () => Promise<void>, title: string) => {
    setBusy(key);
    try {
      await fn();
    } catch (e: unknown) {
      Alert.alert(title, errText(e, 'Try again'));
    } finally {
      setBusy(null);
    }
  };

  const validate = (rows: string[][], name: string, upd: boolean) =>
    api.post<Check>('/stock/import', { rows, dry_run: true, file_name: name, update_stock: upd });

  const template = () =>
    run(
      'tpl',
      async () => {
        const t = await api.get<{ columns: string[]; sample_rows: unknown[][] }>('/stock/import/template');
        await shareCsv(
          'stock-import-template.csv',
          t.sample_rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i] ?? '']))),
        );
      },
      'Could not get the template',
    );

  const pick = () =>
    run(
      'pick',
      async () => {
        const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'], copyToCacheDirectory: true });
        if (res.canceled || !res.assets?.[0]) return;
        const f = res.assets[0];
        if (!/\.csv$/i.test(f.name)) throw new Error('Choose a .csv file. In Excel use Save As → CSV.');
        const text = (await (await fetch(f.uri)).text()).replace(/^﻿/, '');
        const rows = parseCsv(text);
        if (rows.length < 2) throw new Error('The file has no item rows');
        setFile({ name: f.name, rows });
        setCheck(await validate(rows, f.name, updateStock));
      },
      'Could not read that file',
    );

  const recheck = (upd: boolean) => {
    setUpdateStock(upd);
    if (!file) return;
    run('recheck', async () => setCheck(await validate(file.rows, file.name, upd)), 'Could not check the file');
  };

  const go = () => {
    if (!file || !check?.ok) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Alert.alert('Date', 'Enter the stock date as YYYY-MM-DD.');
    run(
      'go',
      async () => {
        const out = await api.post<{ done: { created: number; updated: number; stocked: number; restocked?: number } }>('/stock/import', {
          rows: file.rows,
          dry_run: false,
          opening_date: date,
          file_name: file.name,
          update_stock: updateStock,
        });
        const d = out.done;
        Alert.alert('Done', `${d.created} added, ${d.updated} updated, ${d.stocked} with opening stock${d.restocked ? `, ${d.restocked} stock counts changed` : ''}.`);
        reset();
        onDone();
        onClose();
      },
      'Import failed',
    );
  };

  const sm = check?.summary;

  return (
    <FormSheet
      visible={visible}
      title="Import stock from CSV"
      subtitle={file?.name}
      onClose={() => {
        reset();
        onClose();
      }}
      footer={check?.ok ? <ActionButton label={`Import ${sm?.rows} item${sm?.rows === 1 ? '' : 's'}`} busy={busy === 'go'} onPress={go} grow /> : undefined}
    >
      <Text style={[styles.note, { color: theme.text3 }]}>
        One row is one item. Nothing is saved until every row is correct. Uploading a sheet again is safe: items already there are updated.
      </Text>
      <View style={styles.actions}>
        <ActionButton label="Get the template" tone="neutral" busy={busy === 'tpl'} onPress={template} />
        <ActionButton label={file ? 'Choose another file' : 'Choose CSV file'} busy={busy === 'pick'} onPress={pick} />
      </View>

      {check && sm ? (
        <View>
          <StatGrid
            items={[
              { label: 'Rows', value: sm.rows },
              { label: 'New', value: sm.create, color: semantic.success },
              { label: 'Already there — updated', value: sm.update, color: semantic.warning },
              { label: 'With opening stock', value: sm.with_stock },
              ...(sm.restock ? [{ label: `Stock counts changed (${sm.restock_up} up, ${sm.restock_down} down)`, value: sm.restock, color: semantic.warning }] : []),
            ]}
          />
          <View style={styles.switchRow}>
            <Switch value={updateStock} disabled={busy === 'recheck'} onValueChange={recheck} trackColor={{ true: brand.primary }} />
            <Text style={[styles.switchText, { color: theme.text }]}>Items already in stock: set their quantity to the Opening Qty in this file</Text>
          </View>
          {check.errors.length ? (
            <>
              <SectionLabel>Nothing will be imported until these are fixed</SectionLabel>
              {check.errors.slice(0, 30).map((e, i) => (
                <ListRow key={i} icon="alert" iconColor={semantic.danger} title={e} />
              ))}
              {check.errors.length > 30 ? <Text style={[styles.note, { color: theme.text3 }]}>…and {check.errors.length - 30} more</Text> : null}
              <Text style={[styles.note, { color: theme.text3 }]}>Fix the sheet, then choose it again.</Text>
            </>
          ) : null}
          {check.ignored_columns.length ? <Text style={[styles.note, { color: theme.text3 }]}>Columns not recognised and ignored: {check.ignored_columns.join(', ')}</Text> : null}
          {check.rows.slice(0, 40).map((r) => (
            <ListRow
              key={r.row}
              icon={r.problems.length ? 'alert' : 'box'}
              iconColor={r.problems.length ? semantic.danger : undefined}
              title={r.name}
              subtitle={r.problems.length ? r.problems.join('; ') : `${r.action === 'create' ? 'New' : 'Update'}${r.sku ? ` · ${r.sku}` : ''}`}
              meta={`Row ${r.row}`}
              value={r.stock_mode === 'opening' ? `${r.opening_qty}` : r.stock_mode === 'set' ? `${r.stock_before} → ${Math.round(((r.stock_before || 0) + (r.stock_delta || 0)) * 1000) / 1000}` : undefined}
            />
          ))}
          {check.rows.length > 40 ? <Text style={[styles.note, { color: theme.text3 }]}>Showing the first 40 of {check.rows.length}. All are checked.</Text> : null}
          {check.ok ? <Field label="Stock counts from" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" /> : null}
        </View>
      ) : null}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  note: { ...typography.caption, marginVertical: spacing(2) },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(3) },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), marginVertical: spacing(2) },
  switchText: { ...typography.body, flex: 1 },
});
