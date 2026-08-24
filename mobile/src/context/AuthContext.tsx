import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getToken, setToken as persistToken, ApiError } from '../api/client';
import { signin as apiSignin, fetchMe, AuthUser } from '../api/auth';
import { registerPushToken } from '../api/push';
import { registerForPushNotificationsAsync } from '../notifications';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on cold start if a token is already stored.
  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const { user: me } = await fetchMe();
        setUser(me);
      } catch {
        // Stored token is stale/invalid — drop it and fall back to login.
        await persistToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: signedInUser } = await apiSignin(email, password);
    await persistToken(token);
    setUser(signedInUser);
  }, []);

  const logout = useCallback(async () => {
    await persistToken(null);
    setUser(null);
  }, []);

  // Register (or re-register) the device's push token whenever a user
  // becomes signed in — covers both cold-start session restore and a fresh
  // login in one place. Failures are non-fatal (permission denied, no
  // physical device, etc.) — push is a bonus, not a login requirement.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await registerForPushNotificationsAsync();
        if (token) await registerPushToken(token);
      } catch {
        // ignore — push registration is best-effort
      }
    })();
  }, [user]);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export type { ApiError };
