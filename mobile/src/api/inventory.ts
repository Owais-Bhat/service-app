import { api } from './client';

// Goods the technician can put on a bill. The catalogue comes from the admin's
// Inventory screen — the selling rate is theirs to set, ours to use. Purchase
// cost never reaches this app.
export interface InventoryItem {
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  unit: string | null;
  selling_rate: number | string;
  gst_rate: number | string;
  quantity: number | string;
  min_stock: number | string;
}

export interface BillItemLine {
  item_id: string | null;
  name: string;
  quantity: number;
  rate: number;
}

export function fetchInventoryItems(): Promise<InventoryItem[]> {
  return api.get<InventoryItem[]>('/inventory/items');
}

export function fetchBillItems(refType: 'inquiry' | 'installation', refId: string): Promise<(BillItemLine & { id: string })[]> {
  return api.get(`/bill-items?ref_type=${refType}&ref_id=${encodeURIComponent(refId)}`);
}

// Saving replaces the whole set for that job — the server returns whatever the
// previous version consumed to stock before consuming these lines, so editing
// a bill can't drift the stock count.
export function saveBillItems(refType: 'inquiry' | 'installation', refId: string, items: BillItemLine[]): Promise<unknown> {
  return api.post('/bill-items', { ref_type: refType, ref_id: refId, items });
}
