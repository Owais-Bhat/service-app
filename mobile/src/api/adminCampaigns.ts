import { api } from './client';

export interface CampaignMeta {
  rate_per_minute: number;
  daily_cap: number;
  hours: { from: number; until: number; zone: string };
  segments: Record<string, string>;
}
export const fetchCampaignMeta = () => api.get<CampaignMeta>('/campaigns/meta');

export interface CampaignVariable {
  type: 'name' | 'business' | 'text';
  value?: string;
}
export interface Audience {
  customers: boolean;
  contacts: boolean;
  segment: string;
}
export interface Progress {
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
  total: number;
}

export interface CampaignFull {
  id: string;
  name: string;
  status: string;
  message_id: string;
  variables: CampaignVariable[];
  media_path: string | null;
  audience: Audience;
  progress: Progress;
  pause_reason?: string | null;
  scheduled_at: string | null;
  finished_at?: string | null;
  is_standing: boolean;
  parent_id?: string | null;
  auto_enabled?: boolean;
  offer_is_fresh?: boolean;
  fresh_offer_required?: number;
  run_day?: number;
  run_time?: string;
  next_run_at?: string | null;
  last_run_at?: string | null;
  runs?: { id: string; name: string; status: string; progress: Progress }[];
  recipients?: { name: string | null; phone: string; status: string; error: string | null }[];
}
export const loadCampaign = (id: string) => api.get<CampaignFull>(`/campaigns/${encodeURIComponent(id)}`);

export interface CampaignPayload {
  name: string;
  message_id: string;
  variables: CampaignVariable[];
  media_path: string | null;
  audience: Audience;
  recurrence?: { type: 'monthly'; day: number; time: string; fresh_offer_required: boolean };
}
export const createCampaign = (b: CampaignPayload) => api.post<{ id: string }>('/campaigns', b);
export const updateCampaign = (id: string, b: Partial<CampaignPayload>) => api.patch<{ id: string }>(`/campaigns/${encodeURIComponent(id)}`, b);
export const deleteCampaign = (id: string) => api.del(`/campaigns/${encodeURIComponent(id)}`);
export const campaignAction = (id: string, action: 'pause' | 'resume' | 'cancel') => api.post(`/campaigns/${encodeURIComponent(id)}/${action}`);
export const testCampaign = (id: string, phone: string) => api.post(`/campaigns/${encodeURIComponent(id)}/test`, { phone });
export const scheduleCampaign = (id: string, at: string | null) =>
  api.post<{ recipients: number }>(`/campaigns/${encodeURIComponent(id)}/schedule`, { scheduled_at: at });
export const publishCampaign = (id: string) => api.post<{ recipients: number }>(`/campaigns/${encodeURIComponent(id)}/publish-now`);
export const setCampaignAuto = (id: string, enabled: boolean) =>
  api.post<{ next_run_at: string | null }>(`/campaigns/${encodeURIComponent(id)}/auto`, { enabled });

export interface Reach {
  will_send: number;
  invalid?: number;
  duplicates?: number;
  opted_out?: number;
}
export const checkAudience = (a: Audience) => api.post<Reach>('/campaigns/audience', a);

export interface OptOut {
  phone: string;
  reason: string | null;
  created_at: string;
}
export const fetchOptouts = () => api.get<OptOut[]>('/campaigns/optouts');
export const addOptouts = (numbers: string, reason: string) =>
  api.post<{ added: number; unreadable?: number }>('/campaigns/optouts', { numbers, reason });
export const removeOptout = (phone: string) => api.del(`/campaigns/optouts/${encodeURIComponent(phone)}`);
