import { api } from './client';

export interface StockLocationRow {
  id: string;
  name: string;
  kind: string | null;
  employee_id: string | null;
  employee_name: string | null;
  is_default: number;
  owned?: boolean | number;
}

export interface LocationItem {
  id: string;
  name: string;
  sku?: string | null;
  unit?: string | null;
  base_unit?: string | null;
  held_qty: number | string;
}

export const fetchLocations = () => api.get<StockLocationRow[]>('/stock/locations');
export const fetchLocationItems = (id: string) => api.get<LocationItem[]>(`/stock/locations/${encodeURIComponent(id)}/items`);

export function createLocation(body: { name: string; kind: string; employee_id: string | null }): Promise<StockLocationRow> {
  return api.post('/stock/locations', body);
}

export interface TransferInput {
  from_location_id: string;
  to_location_id: string;
  employee_id: string | null;
  note: string;
  lines: { item_id: string; quantity: number }[];
}

export const transferStock = (body: TransferInput) => api.post('/stock/transfers', body);

export type AdjustType = 'adjust_in' | 'adjust_out' | 'damage';

export interface AdjustInput {
  item_id: string;
  type: AdjustType;
  quantity: number;
  location_id: string;
  reason: string;
}

export const adjustStock = (body: AdjustInput) => api.post<{ balance_qty: number; quantity: number }>('/stock/adjustments', body);

export interface SerialRow {
  id: string;
  serial_no: string;
  item_name: string;
  status: string;
  location_name: string | null;
  supplier_name: string | null;
  customer_name: string | null;
}

export const fetchSerials = (q: string) => api.get<SerialRow[]>(`/stock/serials?q=${encodeURIComponent(q)}&limit=300`);

export interface CountResult {
  count: { id: string };
  lines: { item_id: string; difference_qty: number | string }[];
}

export const saveCount = (body: { count_date: string; location_id: string; note: string; lines: { item_id: string; counted_qty: number }[] }) =>
  api.post<CountResult>('/stock/counts', body);

export const approveCount = (id: string) => api.post(`/stock/counts/${encodeURIComponent(id)}/approve`);
