import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, OrbitText, Pill, Screen, spacing } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, ErrorText, Field, Notice } from '@/components';

interface AskResult {
  kind: string;
  confidence: number;
  summary: string;
  structured: Record<string, unknown>;
  requiresApproval: boolean;
}

export default function Ask(): ReactNode {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<AskResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api<AskResult>('/v1/ask/interpret', jsonBody({ input: prompt })));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Your agent could not answer.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <AppHeader
        title="Ask your context"
        subtitle="Search your approved memory and tools without sending a broad prompt into the world."
      />
      <Card tone="ember">
        <Field
          label="What do you need?"
          value={prompt}
          onChangeText={setPrompt}
          multiline
          placeholder="Find the promise I made about the prototype and draft a realistic plan."
        />
        <Button
          label="Ask ORBIT"
          onPress={() => void submit()}
          loading={busy}
          disabled={prompt.trim().length < 3}
        />
      </Card>
      <View style={styles.examples}>
        {['Repair my week', 'Who should I follow up with?', 'Watch for a used bike'].map(
          (example) => (
            <Pill key={example}>{example}</Pill>
          ),
        )}
      </View>
      <Notice
        title="Writes require approval"
        detail="Your agent can read approved sources and prepare work. Messages, calendar changes, and other external writes wait for you."
        tone="moss"
      />
      {result === null ? null : (
        <Card>
          <OrbitText variant="mono">
            {result.kind.replaceAll('_', ' ').toUpperCase()} · {Math.round(result.confidence * 100)}
            % CONFIDENCE
          </OrbitText>
          <OrbitText variant="title">{result.summary}</OrbitText>
          <OrbitText>{JSON.stringify(result.structured, null, 2)}</OrbitText>
          {result.requiresApproval ? (
            <Button label="Review proposed action" onPress={() => undefined} />
          ) : null}
        </Card>
      )}
      {error === null ? null : <ErrorText message={error} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  examples: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
