import { api } from './client';

export interface ItemInput {
  name: string;
  sku: string;
  category: string;
  unit: string;
  purchase_rate: number;
  selling_rate: number;
  gst_rate: number;
  min_stock: number;
  active: boolean;
  opening_stock?: number;
}

export function createItem(body: ItemInput): Promise<unknown> {
  return api.post('/inventory/items', body);
}

export function updateItem(id: string, body: ItemInput): Promise<unknown> {
  return api.put(`/inventory/items/${encodeURIComponent(id)}`, body);
}

export type MovementType = 'purchase' | 'return' | 'adjust_in' | 'adjust_out' | 'damage';

export const MOVEMENT_LABEL: Record<string, string> = {
  purchase: 'Purchase',
  return: 'Return',
  adjust_in: 'Adjust in',
  adjust_out: 'Adjust out',
  damage: 'Damage',
  sale: 'Sale',
  job_use: 'Used on job',
  opening: 'Opening',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
};

export function recordMovement(body: { item_id: string; type: MovementType; quantity: number; rate?: number | null; note?: string }): Promise<unknown> {
  return api.post('/inventory/movements', body);
}

export interface Movement {
  id: string;
  item_name: string;
  unit: string | null;
  type: string;
  quantity: number | string;
  rate: number | string | null;
  note: string | null;
  employee_name: string | null;
  created_at: string;
}

export function fetchMovements(itemId?: string): Promise<Movement[]> {
  return api.get<Movement[]>(`/inventory/movements${itemId ? `?item_id=${encodeURIComponent(itemId)}` : ''}`);
}

export function bulkActive(ids: string[], active: boolean): Promise<{ changed: number }> {
  return api.post('/inventory/items/bulk-active', { ids, active });
}

export interface DeletePlan {
  will_delete: number;
  will_keep: number;
  reverse_value_paise?: number;
  keep: { id?: string; name: string; reason: string }[];
}

export function planBulkDelete(ids: string[]): Promise<DeletePlan> {
  return api.post('/inventory/items/bulk-delete', { ids, dry_run: true });
}

export function runBulkDelete(ids: string[]): Promise<{ deleted: number; hidden: number }> {
  return api.post('/inventory/items/bulk-delete', { ids, dry_run: false, confirm: 'DELETE' });
}
