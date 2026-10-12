import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Linking } from 'react-native';
import { Button, Card, OrbitText, Pill, Ring, Screen } from '@orbit/ui';

import { api } from '@/api';
import { useGoogleReconnectPrompt } from '@/google-reconnect';
import { googleSyncActive, useGoogleStatus } from '@/google-sync';
import { AppHeader, ErrorText, Notice, QueryError, RowLink } from '@/components';

interface Connection {
  id: string;
  provider: string;
  scopes: string[];
  status: string;
  lastSyncedAt: string | null;
  syncStatus: string;
  syncProcessed: number;
  syncTotal: number | null;
  syncStartedAt: string | null;
  expiredAt: string | null;
}

export default function Connections(): ReactNode {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['connections'],
    queryFn: () => api<Connection[]>('/v1/connections'),
  });
  const gmail = useGoogleStatus();
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handledCallback = useRef<string | null>(null);
  useGoogleReconnectPrompt(
    'connections',
    gmail.data?.reconnectRequired === true,
    gmail.data?.connection?.expiredAt,
    gmail.dataUpdatedAt,
  );

  const refresh = useCallback(async (): Promise<void> => {
    await Promise.all([query.refetch(), gmail.refetch()]);
  }, [gmail, query]);

  const sync = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setMessage('Starting background sync…');
    try {
      await api('/v1/connections/gmail/sync', { method: 'POST' });
      setMessage(
        'Sync is running on ORBIT’s server. You can change screens or close the app. Your inbox and Catch will populate as batches finish.',
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: ['inbox'] }),
        client.invalidateQueries({ queryKey: ['life', 'catch'] }),
        refresh(),
      ]);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not sync Gmail.');
    } finally {
      setBusy(false);
    }
  }, [client, gmail, refresh]);

  const handleGoogleCallback = useCallback(
    (eventUrl: string): void => {
      if (handledCallback.current === eventUrl) return;
      handledCallback.current = eventUrl;
      let url: URL;
      try {
        url = new URL(eventUrl);
      } catch {
        return;
      }
      if (url.protocol !== 'orbit:') return;
      const outcome = url.searchParams.get('gmail');
      if (outcome === 'connected') {
        setMessage('Google connected. Starting the first source-backed sync…');
        void refresh().then(() => void sync());
      } else if (outcome === 'denied') {
        setMessage('Google access was denied. ORBIT still works; connect later if you want Catch.');
      } else if (outcome === 'incomplete') {
        setError('Google authorization was cancelled before it finished. Nothing was connected.');
      } else if (outcome === 'failed') {
        setError('Google could not finish authorization. Check your network and try again.');
      }
    },
    [refresh, sync],
  );

  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (url !== null) handleGoogleCallback(url);
    });
    const subscription = Linking.addEventListener('url', (event) =>
      handleGoogleCallback(event.url),
    );
    return () => subscription.remove();
  }, [handleGoogleCallback]);
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
        subtitle="Choose what your agent can read. You can disconnect at any time."
      />
      <Notice
        title="Your accounts, your choice"
        detail="Google access is read-only: follow-ups and drafts, without sending mail or changing events."
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
          <OrbitText variant="title">Read-only Gmail + Calendar</OrbitText>
          {gmail.data.available ? (
            <OrbitText>
              Read email and upcoming events to find follow-ups and scheduling conflicts. Disconnect
              here whenever you want.
            </OrbitText>
          ) : (
            <OrbitText>
              Google connection is not available in this release yet. We’re completing Google’s
              verification before enabling it. You can still teach your agent and manage your
              preferences.
            </OrbitText>
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
              {gmail.data.connection?.syncStatus === 'error' ? (
                <Notice
                  title="Last sync stopped"
                  detail={`Completed batches are saved. ${gmail.data.connection.syncErrorCode === 'GOOGLE_PERMISSION_REQUIRED' ? 'Google refused a read. Check your granted permissions and reconnect.' : 'Tap Sync to resume from the saved checkpoint. Reconnect first if Google access expired.'}`}
                  tone="ember"
                />
              ) : gmail.data.connection === null ||
                gmail.data.connection.syncStatus === 'idle' ? null : (
                <Card tone="blue">
                  <Pill tone="blue">FIRST SYNC IN PROGRESS</Pill>
                  <Ring
                    value={
                      gmail.data.connection.syncTotal === null ||
                      gmail.data.connection.syncTotal === 0
                        ? 0.08
                        : gmail.data.connection.syncProcessed / gmail.data.connection.syncTotal
                    }
                    tone="yours"
                    size={46}
                    seed="google-sync"
                  />
                  <OrbitText variant="label">
                    {gmail.data.connection.syncStatus === 'authorizing'
                      ? 'Checking encrypted Google access…'
                      : gmail.data.connection.syncStatus === 'queued'
                        ? 'Queued securely on ORBIT’s server…'
                        : gmail.data.connection.syncStatus === 'retrying'
                          ? 'Google temporarily refused a read. Retrying the saved batch…'
                          : gmail.data.connection.syncStatus === 'reading_mail'
                            ? `Reading message metadata ${String(gmail.data.connection.syncProcessed)}/${String(gmail.data.connection.syncTotal ?? '?')}…`
                            : gmail.data.connection.syncStatus === 'reading_calendar'
                              ? 'Reading the next 14 days of Calendar…'
                              : 'Building source-backed Catch items…'}
                  </OrbitText>
                  <OrbitText variant="caption">
                    You can leave this screen or close ORBIT. Reads continue on the server: up to
                    2,500 messages from the last 90 days, plus the next 14 days of Calendar. Partial
                    results appear as they are ready.
                  </OrbitText>
                </Card>
              )}
              <Button
                label="Sync Gmail + Calendar"
                onPress={() => void sync()}
                loading={busy}
                disabled={googleSyncActive(gmail.data.connection?.syncStatus)}
              />
              <Button
                label="Open categorized inbox"
                kind="secondary"
                onPress={() => router.push('/mail')}
              />
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
              label={gmail.data.reconnectRequired ? 'Reconnect Google' : 'Connect Google read-only'}
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
