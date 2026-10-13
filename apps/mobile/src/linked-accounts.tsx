import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from './api';
import { useAuthStore } from './store';
import { googleAccounts, anyGoogleSyncActive, type GoogleStatus } from './google-sync';
import type { AccountReference } from './account-reference';
import { invalidateDisconnectedAccountChat } from './chat-session';
import {
  removeAccountCalendarReminders,
  restoreAccountReminderEligibility,
} from './calendar-reminders';
import { offlineScope } from './offline-scope';
export interface LinkedAccount extends AccountReference {
  id: string;
  provider: 'google' | 'microsoft';
  status: string;
}
export const useLinkedAccounts = () =>
  useQuery({
    queryKey: ['connections'],
    queryFn: async (): Promise<LinkedAccount[]> => {
      const rows =
        await api<(Omit<LinkedAccount, 'provider'> & { provider: string })[]>('/v1/connections');
      return rows.flatMap((row) => {
        const provider = row.provider.toLowerCase();
        return provider === 'google' || provider === 'microsoft'
          ? [{ ...row, provider, status: row.status.toLowerCase() }]
          : [];
      });
    },
    refetchInterval: 30_000,
  });
export const useMicrosoftStatus = () =>
  useQuery({
    queryKey: ['outlook-status'],
    queryFn: () => api<GoogleStatus>('/v1/connections/outlook/status'),
    refetchInterval: (query) => (anyGoogleSyncActive(query.state.data) ? 2500 : 30_000),
  });
export const MicrosoftSyncObserver = () => {
  const token = useAuthStore((s) => s.accessToken),
    client = useQueryClient();
  const progress = useRef<string | null>(null),
    lastRefresh = useRef(0),
    wasActive = useRef(false);
  const status = useQuery({
    queryKey: ['outlook-status'],
    queryFn: () => api<GoogleStatus>('/v1/connections/outlook/status'),
    enabled: token !== null,
    refetchInterval: (query) => (anyGoogleSyncActive(query.state.data) ? 2500 : 30_000),
  });
  useEffect(() => {
    const next = googleAccounts(status.data)
      .map((c) => `${c.id}:${c.syncRunId ?? ''}:${String(c.syncProcessed)}:${c.syncStatus}`)
      .join('|');
    if (progress.current === next) return;
    progress.current = next;
    const active = anyGoogleSyncActive(status.data),
      finished = wasActive.current && !active;
    wasActive.current = active;
    if (!finished && Date.now() - lastRefresh.current < 10_000) return;
    lastRefresh.current = Date.now();
    for (const key of [['mail'], ['inbox'], ['life', 'catch'], ['agenda'], ['connections']])
      void client.invalidateQueries({ queryKey: key });
    if (finished) void client.invalidateQueries({ queryKey: ['brief', 'today'] });
  }, [client, status.data]);
  return null;
};
export const AccountContextObserver = () => {
  const query = useLinkedAccounts(),
    previous = useRef<Set<string> | null>(null);
  const token = useAuthStore((s) => s.accessToken);
  const owner = offlineScope(token);
  useEffect(() => {
    if (!query.data) return;
    const active = new Set(query.data.filter((a) => a.status === 'active').map((a) => a.id));
    if (previous.current)
      for (const id of previous.current)
        if (!active.has(id)) {
          invalidateDisconnectedAccountChat(id);
          if (owner) void removeAccountCalendarReminders(owner, id).catch(() => undefined);
        }
    if (owner) for (const id of active) restoreAccountReminderEligibility(owner, id);
    previous.current = active;
  }, [query.data, owner]);
  return null;
};
