import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, Card, OrbitText, Pill, Screen } from '@orbit/ui';

import { api, download } from '@/api';
import { AppHeader, ErrorText, Field, Notice, RowLink } from '@/components';
import { useAuthStore } from '@/store';

export default function Settings(): ReactNode {
  const signOut = useAuthStore((state) => state.signOut);
  const [provider, setProvider] = useState<'openai' | 'anthropic' | 'google'>('openai');
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notifications, setNotifications] = useState(true);
  useEffect(() => {
    void AsyncStorage.getItem('orbit.notifications').then((value) => {
      if (value !== null) setNotifications(value === 'true');
    });
  }, []);
  const toggleNotifications = (): void => {
    const next = !notifications;
    setNotifications(next);
    void AsyncStorage.setItem('orbit.notifications', String(next));
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
      await signOut();
      router.replace('/sign-in');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not schedule deletion.');
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
        <RowLink
          title="Notifications"
          detail={
            notifications
              ? 'Morning brief and approval alerts on'
              : 'Notifications off; the in-app brief remains available'
          }
          onPress={toggleNotifications}
        />
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
        <OrbitText variant="title">Delete account</OrbitText>
        <OrbitText>
          A seven-day grace window starts immediately. Tokens are revoked; the deletion worker then
          removes personal data and shared conversation content.
        </OrbitText>
        <Button
          label="Schedule permanent deletion"
          onPress={() => void deleteAccount()}
          kind="danger"
          loading={busy}
        />
      </Card>
      {message === null ? null : <Notice title="Done" detail={message} tone="blue" />}
      {error === null ? null : <ErrorText message={error} />}
      <Button label="Back" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}
