import { api } from './client';

export interface NotificationItem {
  id: string;
  subject: string | null;
  title: string | null;
  body: string | null;
  data: unknown;
  read_at: string | null;
  created_at: string;
}

export interface NotificationsResponse {
  items: NotificationItem[];
  unread: number;
}

export async function fetchNotifications(): Promise<NotificationsResponse> {
  return api.get<NotificationsResponse>('/notifications');
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.post(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post('/notifications/read-all');
}
