import React from 'react';
import { Alert } from 'react-native';
import ActionButton from './ActionButton';
import { shareCsv } from '../../utils/shareCsv';

interface Props {
  /** File name, shown as the share title. */
  name: string;
  rows: Record<string, unknown>[];
  label?: string;
}

// "Export CSV": hands the rows currently on screen to the phone's share sheet.
export default function ExportButton({ name, rows, label = 'Export CSV' }: Props) {
  return (
    <ActionButton
      label={label}
      tone="neutral"
      onPress={async () => {
        if (rows.length === 0) return Alert.alert('Nothing to export', 'There are no rows on screen.');
        try {
          await shareCsv(name, rows);
        } catch (e) {
          Alert.alert('Could not export', e instanceof Error ? e.message : 'Try again');
        }
      }}
    />
  );
}
