import { dataGet } from './client';

export interface Notice {
  id: string;
  title: string;
  body: string;
  priority: 'normal' | 'high' | 'urgent';
  active: boolean | number;
  expires_at: string | null;
  created_at: string;
}

// Server already filters to active=1 for every caller (case 'notices' in
// server/index.cjs's appendRoleScope) — expiry isn't server-filtered, so
// that check happens client-side below.
export async function fetchActiveNotices(): Promise<Notice[]> {
  const notices = await dataGet<Notice[]>('notices', { order: 'created_at:desc' });
  const now = Date.now();
  return notices.filter((n) => !n.expires_at || new Date(n.expires_at).getTime() > now);
}
