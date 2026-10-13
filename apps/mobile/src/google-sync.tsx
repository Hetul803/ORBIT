import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from './api';
import { useAuthStore } from './store';

export interface GoogleStatus {
  available: boolean;
  unavailableReason: string | null;
  connected: boolean;
  reconnectRequired: boolean;
  connection: null | {
    id: string;
    status: string;
    scopes: string[];
    lastSyncedAt: string | null;
    syncStatus: string;
    syncProcessed: number;
    syncTotal: number | null;
    syncStartedAt: string | null;
    syncRunId: string | null;
    syncNextAttemptAt: string | null;
    syncErrorCode: string | null;
    expiredAt: string | null;
    accountEmail?: string | null;
  };
  connections?: NonNullable<GoogleStatus['connection']>[];
}
export const googleAccounts = (status?: GoogleStatus): NonNullable<GoogleStatus['connection']>[] =>
  status?.connections ?? (status?.connection ? [status.connection] : []);
export const anyGoogleSyncActive = (status?: GoogleStatus): boolean =>
  googleAccounts(status).some((c) => googleSyncActive(c.syncStatus));
export const googleSyncActive = (status?: string): boolean =>
  status !== undefined &&
  [
    'queued',
    'authorizing',
    'reading_mail',
    'reading_calendar',
    'building_catch',
    'retrying',
  ].includes(status);
export const useGoogleStatus = () =>
  useQuery({
    queryKey: ['gmail-status'],
    queryFn: () => api<GoogleStatus>('/v1/connections/gmail/status'),
    refetchInterval: (query) => (anyGoogleSyncActive(query.state.data) ? 2500 : 30_000),
  });

/** Mounted above screens: polling/population does not belong to the Connections page. */
export const GoogleSyncObserver = (): null => {
  const token = useAuthStore((state) => state.accessToken);
  const client = useQueryClient();
  const progress = useRef<string | null>(null);
  const lastContentRefresh = useRef(0);
  const wasActive = useRef(false);
  const status = useQuery({
    queryKey: ['gmail-status'],
    queryFn: () => api<GoogleStatus>('/v1/connections/gmail/status'),
    enabled: token !== null,
    refetchInterval: (query) => (anyGoogleSyncActive(query.state.data) ? 2500 : 30_000),
  });
  useEffect(() => {
    const accounts = googleAccounts(status.data);
    const next = accounts
      .map((c) => `${c.id}:${c.syncRunId ?? ''}:${String(c.syncProcessed)}:${c.syncStatus}`)
      .join('|');
    if (progress.current === next) return;
    progress.current = next;
    const active = anyGoogleSyncActive(status.data);
    const finished = wasActive.current && !active;
    wasActive.current = active;
    if (!finished && Date.now() - lastContentRefresh.current < 10_000) return;
    lastContentRefresh.current = Date.now();
    for (const key of [['mail'], ['inbox'], ['life', 'catch'], ['agenda'], ['connections']])
      void client.invalidateQueries({ queryKey: key });
    if (finished) void client.invalidateQueries({ queryKey: ['brief', 'today'] });
  }, [client, status.data]);
  return null;
};
