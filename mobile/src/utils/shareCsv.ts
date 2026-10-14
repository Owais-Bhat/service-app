import { Share } from 'react-native';

const cell = (v: unknown) => {
  const s = v == null || typeof v === 'object' ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Turns rows into CSV text.
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const heads = Object.keys(rows[0]);
  return [heads.map(cell).join(','), ...rows.map((r) => heads.map((h) => cell(r[h])).join(','))].join('\n');
}

// Hands the CSV to the phone's share sheet (mail, WhatsApp, Drive, Files…).
// The text itself is the payload, so no file permission is needed.
export async function shareCsv(title: string, rows: Record<string, unknown>[]): Promise<boolean> {
  if (rows.length === 0) return false;
  const res = await Share.share({ title, message: toCsv(rows) });
  return res.action !== Share.dismissedAction;
}
