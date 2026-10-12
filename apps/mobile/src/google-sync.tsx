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
  };
}
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
    refetchInterval: (query) =>
      googleSyncActive(query.state.data?.connection?.syncStatus) ? 2500 : 30_000,
  });

/** Mounted above screens: polling/population does not belong to the Connections page. */
export const GoogleSyncObserver = (): null => {
  const token = useAuthStore((state) => state.accessToken);
  const client = useQueryClient();
  const progress = useRef<string | null>(null);
  const status = useQuery({
    queryKey: ['gmail-status'],
    queryFn: () => api<GoogleStatus>('/v1/connections/gmail/status'),
    enabled: token !== null,
    refetchInterval: (query) =>
      googleSyncActive(query.state.data?.connection?.syncStatus) ? 2500 : 30_000,
  });
  useEffect(() => {
    const c = status.data?.connection;
    const next = c ? `${c.syncRunId ?? ''}:${String(c.syncProcessed)}:${c.syncStatus}` : null;
    if (progress.current === next) return;
    progress.current = next;
    for (const key of [['mail'], ['inbox'], ['life', 'catch'], ['brief', 'today']])
      void client.invalidateQueries({ queryKey: key });
  }, [client, status.data]);
  return null;
};
