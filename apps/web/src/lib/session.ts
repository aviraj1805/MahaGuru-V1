import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from './api';
import type { Session } from './types';

export const SESSION_KEY = ['session'] as const;

export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: () => api<Session>('/api/auth/session'),
    staleTime: 30_000,
  });
}

/** Returns a function that guarantees a (guest) session exists before an action. */
export function useEnsureSession() {
  const qc = useQueryClient();
  return useCallback(async () => {
    const current = qc.getQueryData<Session>(SESSION_KEY);
    if (current?.user) return current;
    const fresh = await api<Session>('/api/auth/session');
    if (fresh.user) {
      qc.setQueryData(SESSION_KEY, fresh);
      return fresh;
    }
    const guest = await api<Session>('/api/auth/guest', { method: 'POST' });
    qc.setQueryData(SESSION_KEY, guest);
    return guest;
  }, [qc]);
}

export function useRefreshSession() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries({ queryKey: SESSION_KEY }), [qc]);
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () =>
      api<{ status: string; demo_mode: boolean; llm_provider: string }>('/api/health'),
    staleTime: 5 * 60_000,
    retry: false,
  });
}
