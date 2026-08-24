import { dataGet } from './client';

export interface Company {
  id: string;
  name: string;
}

export async function fetchCompanies(): Promise<Company[]> {
  return dataGet<Company[]>('companies', { select: 'id,name', order: 'name:asc' });
}
