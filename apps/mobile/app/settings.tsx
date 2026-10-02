import { useQuery, useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, Card, OrbitText, Pill, Screen } from '@orbit/ui';

import { api, download } from '@/api';
import { AppHeader, ErrorText, Field, Notice, QueryError, RowLink } from '@/components';
import { defaultPushPreferences, registerPushDevice } from '@/notifications';

interface DeletionStatus {
  pending: boolean;
  requestedAt: string | null;
  deleteAfter: string | null;
}

interface PushDevice {
  id: string;
  platform: string;
  preferences: Record<keyof typeof defaultPushPreferences, boolean>;
  lastSeenAt: string;
}

const countdown = (deleteAfter: string, now: number): string => {
  const remaining = Math.max(0, new Date(deleteAfter).getTime() - now);
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `${String(days)}d ${String(hours)}h ${String(minutes)}m`;
};

export default function Settings(): ReactNode {
  const client = useQueryClient();
  const deletion = useQuery({
    queryKey: ['deletion-status'],
    queryFn: () => api<DeletionStatus>('/v1/me/deletion'),
  });
  const devices = useQuery({
    queryKey: ['push-devices'],
    queryFn: () => api<PushDevice[]>('/v1/push/devices'),
  });
  const pushDevice = devices.data?.[0];
  const [provider, setProvider] = useState<'openai' | 'anthropic' | 'google'>('openai');
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const registerPush = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await registerPushDevice();
      setMessage(result.message);
      if (result.ok) await devices.refetch();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not register this device.');
    } finally {
      setBusy(false);
    }
  };
  const togglePushPreference = async (
    device: PushDevice,
    key: keyof typeof defaultPushPreferences,
  ): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/push/devices/${device.id}/preferences`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...defaultPushPreferences,
          ...device.preferences,
          [key]: !device.preferences[key],
        }),
      });
      await devices.refetch();
    } catch (caught: unknown) {
      setError(
        caught instanceof Error ? caught.message : 'Could not update notification preferences.',
      );
    } finally {
      setBusy(false);
    }
  };
  const saveKey = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ keyHint: string }>('/v1/settings/api-key', {
        method: 'PUT',
        body: JSON.stringify({ provider, apiKey }),
      });
      setMessage(`${provider} key saved with hint ••••${result.keyHint}.`);
      setApiKey('');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not save the key.');
    } finally {
      setBusy(false);
    }
  };
  const exportData = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const bytes = await download('/v1/me/export');
      const file = new File(Paths.cache, `orbit-export-${String(Date.now())}.zip`);
      file.create();
      file.write(bytes);
      await Sharing.shareAsync(file.uri);
      setMessage('Signed export created.');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not create the export.');
    } finally {
      setBusy(false);
    }
  };
  const deleteAccount = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ deleteAfter: string }>('/v1/me', { method: 'DELETE' });
      setMessage(`Deletion scheduled for ${new Date(result.deleteAfter).toLocaleString()}.`);
      setConfirmDelete(false);
      await client.invalidateQueries({ queryKey: ['deletion-status'] });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not schedule deletion.');
    } finally {
      setBusy(false);
    }
  };
  const cancelDeletion = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api('/v1/me/deletion/cancel', { method: 'POST' });
      setMessage('Account deletion cancelled. Your account remains active.');
      await client.invalidateQueries({ queryKey: ['deletion-status'] });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not cancel deletion.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <AppHeader
        title="Settings"
        subtitle="Your model choice, keys, data, and exit are under your control."
      />
      <Notice
        title="Keys are encrypted"
        detail="Bring-your-own provider keys are encrypted at rest, redacted from logs, and never returned by the API."
        tone="moss"
      />
      <Card>
        <RowLink
          title="Verification"
          detail="Campus and phone unlocks"
          onPress={() => router.push('/verification')}
        />
        <RowLink
          title="Trust dials"
          detail="Defaults by action class"
          onPress={() => router.push('/trust')}
        />
        <RowLink
          title="Connections"
          detail="Email, calendar, and file scopes"
          onPress={() => router.push('/connections')}
        />
      </Card>
      <Card>
        <OrbitText variant="title">Push notifications</OrbitText>
        {devices.isError ? (
          <QueryError message={devices.error.message} onRetry={() => void devices.refetch()} />
        ) : pushDevice === undefined ? (
          <>
            <OrbitText>
              Register a physical iOS or Android device for briefs, reveals, approvals, watcher
              hits, and safety receipts.
            </OrbitText>
            <Button
              label="Enable push on this device"
              onPress={() => void registerPush()}
              loading={busy}
            />
          </>
        ) : (
          <>
            <OrbitText variant="caption">
              {pushDevice.platform.toUpperCase()} · registered{' '}
              {new Date(pushDevice.lastSeenAt).toLocaleString()}
            </OrbitText>
            {(Object.keys(defaultPushPreferences) as (keyof typeof defaultPushPreferences)[]).map(
              (key) => (
                <Button
                  key={key}
                  label={`${key.replaceAll('_', ' ')}: ${pushDevice.preferences[key] ? 'on' : 'off'}`}
                  kind={pushDevice.preferences[key] ? 'primary' : 'secondary'}
                  onPress={() => void togglePushPreference(pushDevice, key)}
                  loading={busy}
                />
              ),
            )}
          </>
        )}
      </Card>
      <Card>
        <OrbitText variant="mono">MODEL PROVIDER</OrbitText>
        {(['openai', 'anthropic', 'google'] as const).map((value) => (
          <Button
            key={value}
            label={value.toUpperCase()}
            onPress={() => setProvider(value)}
            kind={provider === value ? 'primary' : 'secondary'}
          />
        ))}
        <Field
          label={`${provider} API key`}
          value={apiKey}
          onChangeText={setApiKey}
          secureTextEntry
          autoCapitalize="none"
        />
        <Button
          label="Encrypt and save key"
          onPress={() => void saveKey()}
          loading={busy}
          disabled={apiKey.length < 16}
        />
      </Card>
      <Card>
        <OrbitText variant="title">Your data</OrbitText>
        <Button label="Create signed export" onPress={() => void exportData()} kind="secondary" />
        <OrbitText variant="caption">
          Includes memory, skills, receipts, consent, introductions, settings, and activity in a
          signed ZIP.
        </OrbitText>
      </Card>
      <Card tone="ember">
        <Pill tone="ember">DANGER ZONE</Pill>
        {deletion.isError ? (
          <QueryError message={deletion.error.message} onRetry={() => void deletion.refetch()} />
        ) : deletion.data?.pending === true && deletion.data.deleteAfter !== null ? (
          <>
            <OrbitText variant="title">
              Deletion in {countdown(deletion.data.deleteAfter, now)}
            </OrbitText>
            <OrbitText>
              Permanent deletion is scheduled for{' '}
              {new Date(deletion.data.deleteAfter).toLocaleString()}. You can cancel at any time
              before the countdown reaches zero.
            </OrbitText>
            <Button
              label="Cancel account deletion"
              onPress={() => void cancelDeletion()}
              kind="secondary"
              loading={busy}
            />
          </>
        ) : confirmDelete ? (
          <>
            <OrbitText variant="title">Confirm permanent deletion</OrbitText>
            <OrbitText>
              A seven-day grace window starts immediately. After it ends, the deletion worker
              removes personal data and shared conversation content. You can cancel during the
              countdown.
            </OrbitText>
            <Button
              label="Yes, schedule deletion"
              onPress={() => void deleteAccount()}
              kind="danger"
              loading={busy}
            />
            <Button
              label="Keep my account"
              onPress={() => setConfirmDelete(false)}
              kind="secondary"
            />
          </>
        ) : (
          <>
            <OrbitText variant="title">Delete account</OrbitText>
            <OrbitText>A seven-day cancellation window begins after confirmation.</OrbitText>
            <Button
              label="Schedule permanent deletion"
              onPress={() => setConfirmDelete(true)}
              kind="danger"
            />
          </>
        )}
      </Card>
      {message === null ? null : <Notice title="Done" detail={message} tone="blue" />}
      {error === null ? null : <ErrorText message={error} />}
      <Button label="Back" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}
