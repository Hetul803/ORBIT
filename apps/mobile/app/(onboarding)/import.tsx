import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Button, Card, OrbitText, Screen } from '@orbit/ui';

import { api } from '@/api';
import { AppHeader, ErrorText, Notice } from '@/components';

export default function ImportHistory(): ReactNode {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [facts, setFacts] = useState<{ id: string; kind: string; content: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pick = async (): Promise<void> => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'application/zip'],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset === undefined) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType ?? 'application/octet-stream',
      } as unknown as Blob);
      const response = await api<{
        imported: number;
        facts: { id: string; kind: string; content: string }[];
      }>('/v1/agent/import', { method: 'POST', body: form });
      setFacts(response.facts);
      setSummary(`${String(response.imported)} durable facts found. Review every item below.`);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The archive could not be imported.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppHeader
        title="Bring your context"
        subtitle="Upload an official ChatGPT or Claude export. ORBIT extracts only durable facts and never trains on the archive."
      />
      <Notice
        title="You stay in control"
        detail="The original archive is processed transiently. Proposed memories can be edited or rejected before they become part of your agent."
        tone="moss"
      />
      <Card>
        <OrbitText variant="title">JSON or ZIP, up to 100 MB</OrbitText>
        <OrbitText>
          Passwords, API keys, raw transcripts, and transient small talk are excluded.
        </OrbitText>
        <Button label="Choose export file" onPress={() => void pick()} loading={busy} />
      </Card>
      {summary === null ? null : <Notice title="Import ready" detail={summary} tone="blue" />}
      {facts.map((fact) => (
        <Card key={fact.id}>
          <OrbitText variant="mono">{fact.kind}</OrbitText>
          <OrbitText>{fact.content}</OrbitText>
          <Button
            label="Remove this memory"
            kind="quiet"
            onPress={() =>
              void api(`/v1/agent/memory/${fact.id}`, { method: 'DELETE' }).then(() =>
                setFacts((current) => current.filter((item) => item.id !== fact.id)),
              )
            }
          />
        </Card>
      ))}
      {error === null ? null : <ErrorText message={error} />}
      <Button label="Back to interview" kind="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
