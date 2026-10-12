import { useState, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Button, Card, OrbitText, Pill, Ring, Screen, spacing } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, ErrorText, Field, Notice } from '@/components';
import type { LifeAnswer, SourceCitation } from '@/types';

const PersonalChat = (): ReactNode => {
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const input = message.trim();
    try {
      const result = await api<{ answer: string }>(
        '/v1/agent/chat',
        jsonBody({
          message: input,
          contextConsent: consent,
          history: history
            .slice(-8)
            .map((turn) => ({ ...turn, content: turn.content.slice(0, 2000) })),
        }),
      );
      setHistory(
        (current) =>
          [
            ...current,
            { role: 'user', content: input },
            { role: 'assistant', content: result.answer },
          ].slice(-16) as typeof history,
      );
      setMessage('');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Your agent could not reply.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Card tone="yours">
        <OrbitText variant="title">Think it through with your agent</OrbitText>
        <OrbitText>
          Plan your week, talk through a decision, or draft a message in your own voice. No
          connected inbox is required.
        </OrbitText>
        {history.map((turn, index) => (
          <View key={index} style={styles.turn}>
            <OrbitText variant="label">{turn.role === 'user' ? 'You' : 'Your agent'}</OrbitText>
            <OrbitText selectable>{turn.content}</OrbitText>
          </View>
        ))}
        <Field
          label="Message your agent"
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={2000}
          placeholder="Help me plan a week that feels like me."
        />
        {!consent ? (
          <>
            <OrbitText variant="caption">
              To reply, ORBIT sends your saved memories, reviewed voice, this message, and recent
              chat turns to its configured reasoning-model provider. Nothing is sent to another
              person; the chat is not automatically saved as memory.
            </OrbitText>
            <Button
              label="Allow my context for this chat"
              kind="secondary"
              onPress={() => setConsent(true)}
            />
          </>
        ) : null}
        <Button
          label="Send to my agent"
          onPress={() => void send()}
          disabled={!consent || message.trim().length < 3}
          loading={busy}
        />
        {history.length > 0 ? (
          <Button
            label="Clear this chat"
            kind="quiet"
            onPress={() => {
              setHistory([]);
              setConsent(false);
            }}
            disabled={busy}
          />
        ) : null}
        {error === null ? null : <ErrorText message={error} />}
      </Card>
    </>
  );
};

export default function Ask(): ReactNode {
  const [mode, setMode] = useState<'personal' | 'accounts'>('personal');
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
        title="Your agent, with you"
        subtitle="Think, plan, and draft with the context you choose to share."
      />
      <View style={styles.examples}>
        <Button
          label="My agent"
          kind={mode === 'personal' ? 'primary' : 'secondary'}
          onPress={() => setMode('personal')}
        />
        <Button
          label="Mail & Calendar"
          kind={mode === 'accounts' ? 'primary' : 'secondary'}
          onPress={() => setMode('accounts')}
        />
      </View>
      {mode === 'personal' ? (
        <PersonalChat />
      ) : (
        <>
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
          {actionMessage === null ? null : (
            <Notice title="Update" detail={actionMessage} tone="moss" />
          )}
          {error === null ? null : <ErrorText message={error} />}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  turn: { gap: spacing.xs, paddingVertical: spacing.sm },
  examples: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  askIdentity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sources: { gap: spacing.sm, marginTop: spacing.md },
});
