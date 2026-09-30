import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Button, Card, OrbitText, Screen } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, ErrorText, Field, Notice } from '@/components';

interface Interpretation {
  needsConfirmation: true;
  interpretation: {
    query: string;
    source: string;
    constraints: Record<string, unknown>;
    notifyOn: string;
  };
  title: string;
  schedule: string;
}

export default function NewWatcher(): ReactNode {
  const params = useLocalSearchParams<{ input?: string }>();
  const [input, setInput] = useState(
    params.input ?? 'Let me know when a quiet sublet under $900 appears in ORBIT.',
  );
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      if (interpretation === null)
        setInterpretation(
          await api<Interpretation>('/v1/watchers', jsonBody({ naturalLanguage: input })),
        );
      else {
        await api(
          '/v1/watchers',
          jsonBody({
            naturalLanguage: input,
            title: interpretation.title,
            schedule: interpretation.schedule,
            confirmedSpec: interpretation.interpretation,
          }),
        );
        router.replace('/watchers');
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The watcher could not be saved.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <AppHeader
        title="Create a watcher"
        subtitle="Describe the condition naturally. ORBIT shows the machine-readable interpretation before it starts."
      />
      <Card tone="blue">
        <Field
          label="Watch for…"
          value={input}
          onChangeText={(value) => {
            setInput(value);
            setInterpretation(null);
          }}
          multiline
        />
        <Button
          label={interpretation === null ? 'Interpret watcher' : 'Confirm and activate'}
          onPress={() => void submit()}
          loading={busy}
          disabled={input.length < 3}
        />
      </Card>
      {interpretation === null ? null : (
        <Card>
          <OrbitText variant="mono">CONFIRM THE INTERPRETATION</OrbitText>
          <OrbitText variant="title">{interpretation.title}</OrbitText>
          <OrbitText>Source: {interpretation.interpretation.source}</OrbitText>
          <OrbitText>Query: {interpretation.interpretation.query}</OrbitText>
          <OrbitText>
            Constraints: {JSON.stringify(interpretation.interpretation.constraints)}
          </OrbitText>
          <OrbitText>Schedule: {interpretation.schedule}</OrbitText>
        </Card>
      )}
      <Notice
        title="No hidden scraping"
        detail="Built-in ORBIT exchange can be monitored immediately. Email, calendar, and file watchers use only explicit connector scopes."
        tone="moss"
      />
      {error === null ? null : <ErrorText message={error} />}
      <Button label="Cancel" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}
