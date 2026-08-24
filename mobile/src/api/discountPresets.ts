import { dataGet } from './client';

// Flat fixed-amount presets used only by the Estimator tool — distinct from
// the coupons system used by the real Bill tab (see api/coupons.ts).
export interface DiscountPreset {
  id: string;
  name: string;
  amount: number;
  active: number;
}

export async function fetchDiscountPresets(): Promise<DiscountPreset[]> {
  return dataGet<DiscountPreset[]>('discount_presets', {
    select: '*',
    eq: ['active:1'],
    order: 'created_at:desc',
  });
}
