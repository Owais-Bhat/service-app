import { dataGet } from './client';

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
