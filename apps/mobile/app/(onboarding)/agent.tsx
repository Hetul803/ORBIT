import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, OrbitText, Pill, Screen } from '@orbit/ui';

import { api, ApiRequestError, jsonBody } from '@/api';
import { AppHeader, ErrorText, Field, Notice } from '@/components';
import { useAuthStore } from '@/store';

interface InterviewResponse {
  sessionId: string;
  question: string;
  progress: number;
  complete: boolean;
  learnedFacts: { kind: string; content: string }[];
}

export default function AgentOnboarding(): ReactNode {
  const setOnboarded = useAuthStore((state) => state.setOnboarded);
  const [agentName, setAgentName] = useState('Morrow');
  const [created, setCreated] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [question, setQuestion] = useState(
    'When a week goes well for you, what usually made the difference?',
  );
  const [answer, setAnswer] = useState('');
  const [progress, setProgress] = useState(0);
  const [facts, setFacts] = useState<{ kind: string; content: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progressWidth = `${String(Math.max(8, progress * 100))}%` as `${number}%`;

  const createAgent = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api('/v1/agent', jsonBody({ name: agentName }));
      setCreated(true);
    } catch (caught: unknown) {
      if (caught instanceof ApiRequestError && caught.status === 409) setCreated(true);
      else setError(caught instanceof Error ? caught.message : 'Could not create your agent.');
    } finally {
      setBusy(false);
    }
  };

  const sendAnswer = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<InterviewResponse>(
        '/v1/agent/interview/turn',
        jsonBody({ ...(sessionId === undefined ? {} : { sessionId }), answer, inputMode: 'text' }),
      );
      setSessionId(result.sessionId);
      setQuestion(result.question);
      setProgress(result.progress);
      setFacts((current) => [...current, ...result.learnedFacts]);
      setAnswer('');
      if (result.complete) {
        setOnboarded(true);
        router.replace('/today');
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Your answer could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppHeader
        title={created ? `Teach ${agentName}` : 'Name your agent'}
        subtitle={
          created
            ? 'Six honest answers are more useful than a hundred profile fields.'
            : 'This is the private representative that works, learns, and negotiates on your behalf.'
        }
      />
      {!created ? (
        <Card>
          <Field label="Agent name" value={agentName} onChangeText={setAgentName} maxLength={48} />
          <Notice
            title="Identity seed"
            detail="Names can change. The cryptographic identity beneath the name cannot be quietly swapped."
            tone="blue"
          />
          <Button
            label={`Create ${agentName}`}
            onPress={() => void createAgent()}
            loading={busy}
            disabled={agentName.trim().length === 0}
          />
          <Button label="I already have an agent" onPress={() => setCreated(true)} kind="quiet" />
        </Card>
      ) : (
        <>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
          <Card tone="moss">
            <Pill tone="moss">INTERVIEW · {Math.round(progress * 100)}%</Pill>
            <OrbitText variant="title">{question}</OrbitText>
            <Field
              label="Your answer"
              value={answer}
              onChangeText={setAnswer}
              multiline
              placeholder="Tell the truth, not the polished version."
            />
            <Button
              label="Save and continue"
              onPress={() => void sendAnswer()}
              loading={busy}
              disabled={answer.trim().length === 0}
            />
          </Card>
          {facts.length === 0 ? null : (
            <Card>
              <OrbitText variant="mono">WHAT {agentName.toUpperCase()} LEARNED</OrbitText>
              {facts.slice(-3).map((fact, index) => (
                <OrbitText key={`${fact.kind}-${String(index)}`}>· {fact.content}</OrbitText>
              ))}
            </Card>
          )}
          <Button
            label="Import ChatGPT or Claude history"
            onPress={() => router.push('/import')}
            kind="secondary"
          />
          <Button
            label="Finish with this foundation"
            onPress={() => {
              setOnboarded(true);
              router.replace('/today');
            }}
            kind="quiet"
          />
        </>
      )}
      {error === null ? null : <ErrorText message={error} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressTrack: { height: 5, borderRadius: 4, backgroundColor: '#D9D1C3', overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 4, backgroundColor: '#48624E' },
});
