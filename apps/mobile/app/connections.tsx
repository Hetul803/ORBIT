import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { Linking } from 'react-native';
import { Button, Card, OrbitText, Screen } from '@orbit/ui';
import { api, jsonBody } from '@/api';
import {
  googleAccounts,
  googleSyncActive,
  useGoogleStatus,
  type GoogleStatus,
} from '@/google-sync';
import { useMicrosoftStatus } from '@/linked-accounts';
import { invalidateDisconnectedAccountChat } from '@/chat-session';
import { AccountBadge } from '@/account-reference';
import { useGoogleReconnectPrompt } from '@/google-reconnect';
import { removeAccountCalendarReminders } from '@/calendar-reminders';
import { offlineScope } from '@/offline-scope';
import { useAuthStore } from '@/store';
import { AppHeader, ErrorText, Notice, QueryError, RowLink } from '@/components';

type Provider = 'google' | 'microsoft';
const endpoint = (provider: Provider) =>
  '/v1/connections/' + (provider === 'google' ? 'gmail' : 'outlook');
export default function Connections(): ReactNode {
  const client = useQueryClient(),
    google = useGoogleStatus(),
    microsoft = useMicrosoftStatus();
  const [busy, setBusy] = useState(false),
    [remove, setRemove] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null);
  const expired = googleAccounts(google.data).find((c) => c.status === 'expired');
  useGoogleReconnectPrompt('connections', !!expired, expired?.expiredAt, google.dataUpdatedAt);
  const refresh = async () => {
    await Promise.all([
      google.refetch(),
      microsoft.refetch(),
      client.invalidateQueries({ queryKey: ['connections'] }),
    ]);
  };
  useEffect(() => {
    const receive = (url: string) => {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'orbit:' || parsed.hostname !== 'connections') return;
        for (const provider of ['gmail', 'outlook']) {
          const result = parsed.searchParams.get(provider);
          if (result === 'connected') {
            setMessage('Authorization returned. Your account status is being refreshed.');
            void client.invalidateQueries({
              queryKey: [provider === 'gmail' ? 'gmail-status' : 'outlook-status'],
            });
            void client.invalidateQueries({ queryKey: ['connections'] });
          } else if (['denied', 'failed', 'incomplete'].includes(result ?? ''))
            setError('Account connection did not finish. You can retry; nothing was sent.');
        }
      } catch {
        /* no raw OAuth callback logging */
      }
    };
    void Linking.getInitialURL().then((url) => {
      if (url) receive(url);
    });
    const subscription = Linking.addEventListener('url', (e) => receive(e.url));
    return () => subscription.remove();
  }, [client]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const connect = (provider: Provider, connectionId?: string) =>
    run(async () => {
      const status = provider === 'google' ? google.data : microsoft.data;
      const result = await api<{ authorizationUrl: string }>(
        endpoint(provider) + '/start',
        jsonBody(
          connectionId ? { connectionId } : { addAccount: googleAccounts(status).length > 0 },
        ),
      );
      await Linking.openURL(result.authorizationUrl);
      setMessage(
        'Review ' +
          (provider === 'google' ? 'Google' : 'Microsoft') +
          '’s read-only consent, then return here.',
      );
    });
  const section = (provider: Provider, status: GoogleStatus | undefined) => {
    const accounts = googleAccounts(status),
      name = provider === 'google' ? 'Google' : 'Microsoft';
    return (
      <>
        <OrbitText variant="title">{name}</OrbitText>
        {accounts.map((c) => (
          <Card key={c.id} tone="yours">
            <AccountBadge
              account={{ provider, connectionId: c.id, accountEmail: c.accountEmail ?? null }}
            />
            <OrbitText variant="title">
              {c.accountEmail ?? 'Account identity is being checked'}
            </OrbitText>
            <OrbitText variant="caption">
              {c.status === 'expired'
                ? 'Reconnect this account to keep it up to date.'
                : googleSyncActive(c.syncStatus)
                  ? 'Syncing quietly: ' +
                    String(c.syncProcessed) +
                    (c.syncTotal === null ? '' : ' / ' + String(c.syncTotal)) +
                    ' messages checked.'
                  : c.syncStatus === 'error'
                    ? 'Import paused. Retry from this account’s saved checkpoint.'
                    : c.lastSyncedAt
                      ? 'Updated ' + new Date(c.lastSyncedAt).toLocaleString()
                      : 'First import is getting ready.'}
            </OrbitText>
            {c.status === 'expired' ? (
              <Button
                label={'Reconnect this ' + name + ' account'}
                disabled={busy || !status?.available}
                onPress={() => void connect(provider, c.id)}
              />
            ) : (
              <Button
                label={'Sync this ' + name + ' account'}
                disabled={busy || !status?.available || googleSyncActive(c.syncStatus)}
                onPress={() =>
                  void run(async () => {
                    await api(endpoint(provider) + '/sync', jsonBody({ connectionId: c.id }));
                    setMessage('This account’s sync continues after you leave this screen.');
                  })
                }
              />
            )}
            {remove === c.id ? (
              <>
                <OrbitText>
                  Disconnect only this {name} account? Its sources and related follow-ups will stop
                  appearing. Other accounts stay connected. This does not delete email or events in{' '}
                  {name}.
                </OrbitText>
                <Button
                  label="Confirm disconnect this account"
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      await api(endpoint(provider) + '?connectionId=' + encodeURIComponent(c.id), {
                        method: 'DELETE',
                      });
                      invalidateDisconnectedAccountChat(c.id);
                      const owner = offlineScope(useAuthStore.getState().accessToken);
                      if (owner) await removeAccountCalendarReminders(owner, c.id);
                      setRemove(null);
                      setMessage('This account is disconnected. Other accounts were not changed.');
                      for (const key of [
                        ['mail'],
                        ['inbox'],
                        ['agenda'],
                        ['life', 'catch'],
                        ['connections'],
                      ])
                        void client.invalidateQueries({ queryKey: key });
                    })
                  }
                />
                <Button
                  label="Keep this account"
                  kind="quiet"
                  disabled={busy}
                  onPress={() => setRemove(null)}
                />
              </>
            ) : (
              <Button
                label={'Disconnect this ' + name + ' account'}
                kind="quiet"
                disabled={busy}
                onPress={() => setRemove(c.id)}
              />
            )}
          </Card>
        ))}
        <Card>
          <OrbitText variant="title">
            {accounts.length ? 'Add another ' + name + ' account' : 'Connect ' + name}
          </OrbitText>
          <OrbitText>
            Up to five {name} accounts, each with its own identity, consent, sync progress and
            disconnect control.
          </OrbitText>
          <Button
            label={
              accounts.length
                ? 'Add another ' + name + ' account'
                : provider === 'google'
                  ? 'Connect Gmail & Calendar'
                  : 'Connect Outlook & Calendar'
            }
            disabled={busy || !status?.available || accounts.length >= 5}
            onPress={() => void connect(provider)}
          />
          {status && !status.available ? (
            <OrbitText variant="caption">
              {status.unavailableReason ?? name + ' connection is not available here yet.'}
            </OrbitText>
          ) : null}
        </Card>
      </>
    );
  };
  return (
    <Screen>
      <AppHeader title="Connected accounts" subtitle="One agent. Clearly separate accounts." />
      <Notice
        title="Read-only, under your control"
        detail="Your agent can use both providers with consent. Emails, events, drafts and account controls always keep their original account identity. Nothing is sent or changed in your mailbox."
        tone="moss"
      />
      {google.isError ? (
        <QueryError message={google.error.message} onRetry={() => void google.refetch()} />
      ) : null}
      {section('google', google.data)}
      {microsoft.isError ? (
        <QueryError message={microsoft.error.message} onRetry={() => void microsoft.refetch()} />
      ) : null}
      {section('microsoft', microsoft.data)}
      <RowLink
        title="Inbox, organized around you"
        detail="Filter by account, then needs reply, ready drafts, purchases or subscriptions."
        onPress={() => router.push('/mail')}
      />
      <RowLink
        title="Teach your writing style"
        detail="Choose and review messages you wrote. No automatic phone-message access."
        onPress={() => router.push('/voice')}
      />
      <Button
        label="Refresh account status"
        kind="quiet"
        disabled={busy}
        onPress={() => void run(refresh)}
      />
      {message ? <Notice title="Account update" detail={message} tone="moss" /> : null}
      {error ? <ErrorText message={error} /> : null}
    </Screen>
  );
}
