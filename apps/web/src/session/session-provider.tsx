'use client';

import type { AuthUser, LoginRequest } from '@stocklens/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { ApiClient } from '@/lib/api-client';

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface SessionContextValue {
  apiClient: ApiClient;
  login(input: LoginRequest): Promise<void>;
  logout(): Promise<void>;
  status: SessionStatus;
  user: AuthUser | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  apiClient,
  children,
}: {
  apiClient: ApiClient;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const unsubscribe = apiClient.subscribe((auth) => {
      setUser(auth?.user ?? null);
      setStatus(auth ? 'authenticated' : 'unauthenticated');
      if (!auth) queryClient.clear();
    });

    void apiClient.refreshSession().catch(() => {
      // ApiClient emits the sanitized unauthenticated state.
    });
    return unsubscribe;
  }, [apiClient, queryClient]);

  const login = useCallback(
    async (input: LoginRequest) => {
      await apiClient.login(input);
    },
    [apiClient],
  );

  const logout = useCallback(async () => {
    await apiClient.logout();
  }, [apiClient]);

  const value = useMemo<SessionContextValue>(
    () => ({ apiClient, login, logout, status, user }),
    [apiClient, login, logout, status, user],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value)
    throw new Error('useSession must be used within SessionProvider.');
  return value;
}
