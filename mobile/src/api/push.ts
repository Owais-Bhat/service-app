import { api } from './client';

export async function registerPushToken(token: string): Promise<void> {
  await api.post('/push/register-token', { token });
}

export async function unregisterPushToken(token: string): Promise<void> {
  await api.post('/push/unregister-token', { token });
}
