import { dataGet } from './client';

export interface ServicePricingItem {
  id: string;
  name: string;
  category: string | null;
  sub_category: string | null;
  sub_sub_category: string | null;
  cost: string; // DECIMAL column — MySQL returns this as a string, coerce with Number() at use sites
  description: string | null;
}

export async function fetchServicePricing(): Promise<ServicePricingItem[]> {
  return dataGet<ServicePricingItem[]>('service_pricing', {
    select: 'id,name,category,sub_category,sub_sub_category,cost,description',
    order: 'category:asc',
  });
}
