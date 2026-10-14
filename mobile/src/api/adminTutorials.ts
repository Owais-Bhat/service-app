import { api, dataDelete, dataGet, dataPatch, dataPost } from './client';

export interface TutorialItem {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  kind: string;
  url: string;
  position: number | null;
  required: number | null;
  active: number | null;
}

export interface TutorialCompletion {
  id: string;
  item_id: string;
  employee_id: string;
}

export interface TutorialEmployee {
  id: string;
  full_name: string | null;
}

export interface WatchRow {
  item_id: string;
  employee_id?: string;
  full_name: string | null;
  percent: number | null;
  updated_at: string | null;
}

export interface TutorialsData {
  items: TutorialItem[];
  completions: TutorialCompletion[];
  employees: TutorialEmployee[];
  watch: WatchRow[];
}

export async function fetchTutorials(): Promise<TutorialsData> {
  const [items, completions, employees, watch] = await Promise.all([
    dataGet<TutorialItem[]>('training_items', { select: '*', order: 'position:asc', limit: '500' }),
    dataGet<TutorialCompletion[]>('training_completions', { select: 'id,item_id,employee_id', limit: '5000' }),
    dataGet<TutorialEmployee[]>('profiles', { select: 'id,full_name', eq: 'role:employee' }),
    api.get<WatchRow[]>('/training/watch-progress').catch(() => [] as WatchRow[]),
  ]);
  return { items, completions, employees, watch };
}

export const fetchWatchProgress = () => api.get<WatchRow[]>('/training/watch-progress');

export interface TutorialInput {
  title: string;
  description: string;
  category: string;
  required: number;
  kind: string;
  url: string;
  position: number;
  active: number;
}

export const createTutorial = (b: TutorialInput) => dataPost('training_items', b);
export const saveTutorial = (id: string, b: Partial<TutorialInput>) => dataPatch('training_items', `id:${id}`, b);

// Completion records go first so nothing points at a removed tutorial.
export async function deleteTutorial(id: string): Promise<void> {
  await dataDelete('training_completions', `item_id:${id}`);
  await dataDelete('training_items', `id:${id}`);
}
