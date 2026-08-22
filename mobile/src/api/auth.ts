import { api } from './client';

export type Role = 'admin' | 'employee';
export type WorkerType = 'fixed' | 'gig';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  full_name: string;
  can_add_service: boolean | number;
  allowed_tabs: string | null;
  worker_type: WorkerType;
  installations_enabled: boolean | number;
  salary: string | number;
}

interface SigninResponse {
  token: string;
  user: AuthUser;
}

// Mirrors server/index.cjs POST /api/auth/signin exactly — note that client
// accounts are rejected there ("Client accounts cannot log in"), which is
// why the app's Client flow (src/screens/Client*) never calls this and uses
// the public /data/inquiries endpoints instead.
export function signin(email: string, password: string) {
  return api.post<SigninResponse>('/auth/signin', { email, password });
}

export function fetchMe() {
  return api.get<{ user: AuthUser }>('/auth/me');
}
