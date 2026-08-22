import { dataGet, dataPost } from './client';

export interface EodReport {
  id: string;
  employee_id: string;
  content: string;
  date: string;
}

export async function fetchEodReports(employeeId: string): Promise<EodReport[]> {
  return dataGet<EodReport[]>('eod_reports', {
    select: '*',
    eq: [`employee_id:${employeeId}`],
    order: 'date:desc',
  });
}

export async function submitEodReport(employeeId: string, content: string): Promise<EodReport> {
  return dataPost<EodReport>('eod_reports', {
    employee_id: employeeId,
    content,
    date: new Date().toLocaleDateString('en-CA'),
  });
}
