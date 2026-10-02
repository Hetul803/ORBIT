import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Linking } from 'react-native';
import { Button, Card, OrbitText, Pill, Ring, Screen } from '@orbit/ui';

import { api } from '@/api';
import { AppHeader, ErrorText, Notice, QueryError, RowLink } from '@/components';

interface Connection {
  id: string;
  provider: string;
  scopes: string[];
  status: string;
  lastSyncedAt: string | null;
}

interface GmailStatus {
  available: boolean;
  unavailableReason: string | null;
  connected: boolean;
  connection: Connection | null;
}

export default function Connections(): ReactNode {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['connections'],
    queryFn: () => api<Connection[]>('/v1/connections'),
  });
  const gmail = useQuery({
    queryKey: ['gmail-status'],
    queryFn: () => api<GmailStatus>('/v1/connections/gmail/status'),
  });
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    await Promise.all([query.refetch(), gmail.refetch()]);
  };
  const connect = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ authorizationUrl: string }>('/v1/connections/gmail/start', {
        method: 'POST',
      });
      await Linking.openURL(result.authorizationUrl);
      setMessage('Finish authorization in Google, then return and tap Refresh status.');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not start Google authorization.');
    } finally {
      setBusy(false);
    }
  };
  const sync = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ imported: number; examined: number }>(
        '/v1/connections/gmail/sync',
        { method: 'POST' },
      );
      setMessage(
        `Examined ${String(result.examined)} recent messages and imported ${String(result.imported)} new items.`,
      );
      await Promise.all([client.invalidateQueries({ queryKey: ['inbox'] }), refresh()]);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not sync Gmail.');
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api('/v1/connections/gmail', { method: 'DELETE' });
      setConfirmDisconnect(false);
      setMessage('Google access was revoked and the stored token was erased.');
      await refresh();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not revoke Gmail access.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppHeader
        title="Connections"
        subtitle="Explicit, narrow permissions. No social scraping—ever."
      />
      <Notice
        title="Read narrowly; delivery stays off"
        detail="Gmail requests read-only access. ORBIT can triage and draft, but this build never sends email or expands scope silently."
        tone="moss"
      />
      {gmail.isError ? (
        <QueryError message={gmail.error.message} onRetry={() => void gmail.refetch()} />
      ) : gmail.isPending ? (
        <Card>
          <OrbitText>Checking Gmail availability…</OrbitText>
        </Card>
      ) : (
        <Card tone={gmail.data.connected ? 'yours' : 'paper'}>
          <Ring value={gmail.data.connected ? 1 : 0} tone="yours" size={52} seed="gmail" />
          <Pill tone={gmail.data.connected ? 'yours' : gmail.data.available ? 'neutral' : 'alert'}>
            GMAIL ·{' '}
            {gmail.data.connected ? 'CONNECTED' : gmail.data.available ? 'READY' : 'UNAVAILABLE'}
          </Pill>
          <OrbitText variant="title">Read-only Gmail triage</OrbitText>
          {gmail.data.available ? (
            <OrbitText>
              Scope: gmail.readonly. Refresh tokens are encrypted and can be revoked here.
            </OrbitText>
          ) : (
            <OrbitText>{gmail.data.unavailableReason}</OrbitText>
          )}
          {gmail.data.connected ? (
            <>
              <OrbitText variant="caption">
                Last sync:{' '}
                {gmail.data.connection?.lastSyncedAt === null ||
                gmail.data.connection?.lastSyncedAt === undefined
                  ? 'Never'
                  : new Date(gmail.data.connection.lastSyncedAt).toLocaleString()}
              </OrbitText>
              <Button label="Sync 10 recent messages" onPress={() => void sync()} loading={busy} />
              {confirmDisconnect ? (
                <>
                  <OrbitText variant="label">
                    Revoke Google access and erase the stored token?
                  </OrbitText>
                  <Button
                    label="Yes, disconnect Gmail"
                    onPress={() => void disconnect()}
                    kind="danger"
                    loading={busy}
                  />
                  <Button
                    label="Keep connected"
                    onPress={() => setConfirmDisconnect(false)}
                    kind="secondary"
                  />
                </>
              ) : (
                <Button
                  label="Disconnect Gmail"
                  onPress={() => setConfirmDisconnect(true)}
                  kind="secondary"
                />
              )}
            </>
          ) : (
            <Button
              label="Connect Gmail read-only"
              onPress={() => void connect()}
              disabled={!gmail.data.available}
              loading={busy}
            />
          )}
          <Button label="Refresh status" onPress={() => void refresh()} kind="quiet" />
        </Card>
      )}
      <Card>
        <RowLink
          title="Screening rules"
          detail="Edit rules and preview their effect on recent inbox items"
          onPress={() => router.push('/screening')}
        />
        <RowLink
          title="Connection audit"
          detail="Review connect, sync, revoke, and approval receipts"
          onPress={() => router.push('/activity')}
          icon="eye"
        />
      </Card>
      {query.isError ? (
        <QueryError message={query.error.message} onRetry={() => void query.refetch()} />
      ) : null}
      {(query.data ?? [])
        .filter((connection) => connection.provider !== 'GOOGLE')
        .map((connection) => (
          <Card key={connection.id}>
            <Pill tone={connection.status === 'ACTIVE' ? 'yours' : 'alert'}>
              {connection.provider} · {connection.status}
            </Pill>
            <OrbitText variant="title">{connection.scopes.join(', ')}</OrbitText>
          </Card>
        ))}
      {message === null ? null : <Notice title="Connection update" detail={message} tone="blue" />}
      {error === null ? null : <ErrorText message={error} />}
      <Button label="Back" onPress={() => router.back()} kind="secondary" />
    </Screen>
  );
}
