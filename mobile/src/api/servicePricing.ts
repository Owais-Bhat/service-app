import { dataDelete, dataGet, dataPatch, dataPost } from './client';

export interface ServicePricingItem {
  id: string;
  name: string;
  category: string | null;
  sub_category: string | null;
  sub_sub_category: string | null;
  cost: number;
}

// mysql2 returns DECIMAL columns as strings by default (no decimalNumbers
// option set on the pool) — coerce cost here so every caller gets a real number.
export async function fetchServicePricing(): Promise<ServicePricingItem[]> {
  const rows = await dataGet<ServicePricingItem[]>('service_pricing', { order: 'category:asc' });
  return rows.map((r) => ({ ...r, cost: Number(r.cost) || 0 }));
}

export interface ServiceInput {
  category: string;
  sub_category: string;
  sub_sub_category: string;
  cost: number;
}

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

const rowOf = (s: ServiceInput) => ({
  category: s.category.trim() || 'Uncategorized',
  sub_category: s.sub_category.trim() || null,
  sub_sub_category: s.sub_sub_category.trim(),
  name: s.sub_sub_category.trim(),
  cost: s.cost,
});

export const createService = (s: ServiceInput) => dataPost('service_pricing', { id: uuid(), ...rowOf(s) });
export const updateService = (id: string, s: ServiceInput) => dataPatch('service_pricing', `id:${id}`, rowOf(s));
export const deleteService = (id: string) => dataDelete('service_pricing', `id:${id}`);

// Same rule as the web: the first row of a category / sub / issue is kept and
// the later copies are removed.
export function duplicateIds(rows: ServicePricingItem[]): string[] {
  const seen = new Set<string>();
  const drop: string[] = [];
  rows.forEach((r) => {
    const key = `${r.category}||${r.sub_category}||${r.sub_sub_category || r.name}`;
    if (seen.has(key)) drop.push(r.id);
    else seen.add(key);
  });
  return drop;
}

// ── CSV import: the web's header detection and layout guessing ──────────────
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n') {
      row.push(cur);
      rows.push(row);
      cur = '';
      row = [];
    } else if (c !== '\r') cur += c;
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => String(cell ?? '').trim() !== ''));
}

const parsePrice = (v: unknown) => Number(String(v ?? '').replace(/[₹$,\s]/g, '') || NaN);

interface Layout {
  mainIdx: number;
  subIdx: number;
  subSubIdx: number;
  priceIdx: number;
}

function detectHeader(row: string[]): Layout | null {
  const labels = row.map((c) => String(c ?? '').trim().toLowerCase());
  const map: Layout = { mainIdx: -1, subIdx: -1, subSubIdx: -1, priceIdx: -1 };
  let matched = 0;
  labels.forEach((label, i) => {
    if (!label) return;
    if (/(price|rate|cost|amount|charge)/.test(label)) {
      map.priceIdx = i;
      matched++;
    } else if (/sub[\s\-_]*sub/.test(label) || /level\s*3/.test(label) || /issue|defect|problem/.test(label)) {
      map.subSubIdx = i;
      matched++;
    } else if (/sub/.test(label) || /level\s*2/.test(label) || /group/.test(label)) {
      map.subIdx = i;
      matched++;
    } else if (/(main|category|type|service)/.test(label)) {
      map.mainIdx = i;
      matched++;
    }
  });
  return matched >= 2 ? map : null;
}

function inferLayout(row: string[]): Layout {
  let priceIdx = -1;
  for (let i = row.length - 1; i >= 0; i--) {
    if (Number.isFinite(parsePrice(row[i]))) {
      priceIdx = i;
      break;
    }
  }
  if (priceIdx <= 0) return { mainIdx: -1, subIdx: -1, subSubIdx: 0, priceIdx: priceIdx >= 0 ? priceIdx : 1 };
  if (priceIdx === 1) return { mainIdx: -1, subIdx: -1, subSubIdx: 0, priceIdx };
  if (priceIdx === 2) return { mainIdx: 0, subIdx: -1, subSubIdx: 1, priceIdx };
  return { mainIdx: 0, subIdx: 1, subSubIdx: 2, priceIdx };
}

export interface ImportResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

export async function importServiceRows(rows: string[][]): Promise<ImportResult> {
  const out: ImportResult = { inserted: 0, skipped: 0, errors: [] };
  if (!rows.length) return out;
  let layout = detectHeader(rows[0]);
  const start = layout ? 1 : 0;
  if (!layout) layout = inferLayout(rows[0]);
  let { mainIdx, subIdx, subSubIdx } = layout;
  const { priceIdx } = layout;
  if (subSubIdx === -1 && subIdx !== -1 && mainIdx !== -1) {
    subSubIdx = subIdx;
    subIdx = -1;
  }
  const get = (r: string[], idx: number) => (idx >= 0 ? String(r[idx] ?? '').trim() : '');
  const batch: { row: ReturnType<typeof rowOf> & { id: string }; at: number }[] = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const category = get(r, mainIdx);
    const sub = get(r, subIdx);
    const leaf = get(r, subSubIdx);
    const cost = parsePrice(priceIdx >= 0 ? r[priceIdx] : null);
    if (!category && !sub && !leaf && !Number.isFinite(cost)) {
      out.skipped++;
      continue;
    }
    if (!leaf) {
      out.errors.push(`Row ${i + 1}: missing service name`);
      out.skipped++;
      continue;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      out.errors.push(`Row ${i + 1}: invalid price`);
      out.skipped++;
      continue;
    }
    batch.push({ row: { id: uuid(), ...rowOf({ category, sub_category: sub, sub_sub_category: leaf, cost }) }, at: i });
  }
  // The server rate-limits writes, so rows go up ten at a time and back off on 429.
  for (let j = 0; j < batch.length; j += 10) {
    const chunk = batch.slice(j, j + 10);
    let attempt = 0;
    for (;;) {
      try {
        await dataPost('service_pricing', chunk.map((c) => c.row));
        out.inserted += chunk.length;
        break;
      } catch (e: unknown) {
        const status = (e as { status?: number })?.status;
        if (status === 429 && attempt < 3) {
          attempt++;
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
          continue;
        }
        const msg = e instanceof Error ? e.message : 'could not save';
        chunk.forEach((c) => out.errors.push(`Row ${c.at + 1}: ${msg}`));
        out.skipped += chunk.length;
        break;
      }
    }
  }
  return out;
}
