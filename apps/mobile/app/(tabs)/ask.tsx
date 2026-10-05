import { useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Button, Card, OrbitText, Pill, Ring, Screen, spacing } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, ErrorText, Field, Notice } from '@/components';
import type { LifeAnswer, SourceCitation } from '@/types';

export default function Ask(): ReactNode {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<LifeAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setActionMessage(null);
    try {
      setResult(await api<LifeAnswer>('/v1/life/ask', jsonBody({ question: prompt })));
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
        subtitle="Answers only from the Gmail and Calendar you approved. Every claim includes its source."
      />
      <Card tone="ember">
        <View style={styles.askIdentity}>
          <Ring
            value={busy ? 0.35 : result === null ? 0 : result.confidence}
            tone="rented"
            size={52}
            seed={prompt || 'ask'}
          />
          <OrbitText variant="mono">ASK / PRIVATE CONTEXT</OrbitText>
        </View>
        <Field
          label="What do you need?"
          value={prompt}
          onChangeText={setPrompt}
          multiline
          placeholder="What am I forgetting today?"
        />
        <Button
          label="Ask ORBIT"
          onPress={() => void submit()}
          loading={busy}
          disabled={prompt.trim().length < 3}
        />
      </Card>
      <View style={styles.examples}>
        {[
          'What am I forgetting today?',
          'Who am I ignoring?',
          'When did I last email Alex?',
          'How much did I spend on Amazon this month?',
        ].map((example) => (
          <Pressable
            key={example}
            accessibilityRole="button"
            accessibilityLabel={`Use example: ${example}`}
            onPress={() => setPrompt(example)}
          >
            <Pill>{example}</Pill>
          </Pressable>
        ))}
      </View>
      <Notice
        title="Grounded, read-only answers"
        detail="If ORBIT cannot find source evidence, it says so. It never sends mail or edits your calendar from this screen."
        tone="moss"
      />
      {result === null ? null : (
        <Card>
          <OrbitText variant="mono">
            {Math.round(result.confidence * 100)}% EVIDENCE CONFIDENCE
          </OrbitText>
          <OrbitText variant="title">{result.answer}</OrbitText>
          <View style={styles.sources}>
            {result.sources.length === 0 ? (
              <OrbitText variant="caption">No source was found for this answer.</OrbitText>
            ) : (
              result.sources.map((source: SourceCitation) => (
                <Pressable
                  key={source.sourceId}
                  accessibilityRole="link"
                  accessibilityLabel={`Open source: ${source.title}`}
                  onPress={() => void Linking.openURL(source.url)}
                >
                  <OrbitText variant="label">
                    {source.kind === 'calendar' ? 'Calendar' : 'Email'} · {source.title} ↗
                  </OrbitText>
                  <OrbitText variant="caption">“{source.quote}”</OrbitText>
                </Pressable>
              ))
            )}
          </View>
        </Card>
      )}
      {actionMessage === null ? null : <Notice title="Update" detail={actionMessage} tone="moss" />}
      {error === null ? null : <ErrorText message={error} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  examples: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  askIdentity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sources: { gap: spacing.sm, marginTop: spacing.md },
});
