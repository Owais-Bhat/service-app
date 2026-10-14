import { useCallback, useEffect, useRef, useState } from 'react';

// Load-on-mount + manual reload with the three states every admin list needs.
// `reload` never throws and is safe to hand to a pull-to-refresh control.
export function useLoader<T>(fn: () => Promise<T>, errorText = 'Could not load this page') {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      setError(msg && !/network request failed|failed to fetch/i.test(msg) ? msg : errorText);
    } finally {
      setLoading(false);
    }
  }, [errorText]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, setData, loading, error, reload };
}

// Calendar helpers shared by the date-range chips.
export type RangeKey = 'today' | 'week' | 'month' | 'all';

export function rangeStart(key: RangeKey): string {
  const d = new Date();
  if (key === 'all') return '';
  if (key === 'week') d.setDate(d.getDate() - 6);
  if (key === 'month') d.setDate(1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const RANGE_CHIPS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All' },
];

// MySQL hands DATE columns back as ISO timestamps; keep only the day.
export function dayOf(value: string | null | undefined): string {
  return value ? String(value).slice(0, 10) : '';
}
