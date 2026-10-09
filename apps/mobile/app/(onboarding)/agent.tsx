import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Card, OrbitText, Pill, Ring, Screen, spacing } from '@orbit/ui';

import { api, ApiRequestError, jsonBody, patchBody } from '@/api';
import { AppHeader, ErrorText, Field, Notice } from '@/components';
import {
  clearOnboardingProgress,
  loadOnboardingProgress,
  saveOnboardingProgress,
  useAuthStore,
} from '@/store';

interface InterviewResponse {
  sessionId: string;
  question: string;
  progress: number;
  complete: boolean;
  adaptive: boolean;
  learnedFacts: { kind: string; content: string }[];
  modelNotice?: string | null;
}

export default function AgentOnboarding(): ReactNode {
  const setOnboarded = useAuthStore((state) => state.setOnboarded);
  const [started, setStarted] = useState(false);
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [question, setQuestion] = useState(
    'When a week goes well for you, what usually made the difference?',
  );
  const [answer, setAnswer] = useState('');
  const [progress, setProgress] = useState(0);
  const [adaptive, setAdaptive] = useState(false);
  const [facts, setFacts] = useState<{ kind: string; content: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelNotice, setModelNotice] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let active = true;
    void loadOnboardingProgress()
      .then((saved) => {
        if (!active || saved === null) return;
        setStarted(saved.started);
        setInterviewComplete(saved.interviewComplete);
        setSessionId(saved.sessionId);
        setQuestion(saved.question);
        setProgress(saved.progress);
        setAdaptive(saved.adaptive);
        setFacts(saved.facts);
        setAnswer(saved.answer ?? '');
        setAgentName(saved.agentName ?? '');
      })
      .finally(() => {
        if (active) setRestored(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!restored) return;
    void saveOnboardingProgress({
      started,
      interviewComplete,
      ...(sessionId === undefined ? {} : { sessionId }),
      question,
      progress,
      adaptive,
      facts,
      answer,
      agentName,
    });
  }, [
    adaptive,
    agentName,
    answer,
    facts,
    interviewComplete,
    progress,
    question,
    restored,
    sessionId,
    started,
  ]);

  const startInterview = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api('/v1/agent', jsonBody({ name: 'Unnamed private agent' }));
      setStarted(true);
    } catch (caught: unknown) {
      if (caught instanceof ApiRequestError && caught.status === 409) setStarted(true);
      else setError(caught instanceof Error ? caught.message : 'Could not start your agent.');
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
      setAdaptive(result.adaptive);
      setModelNotice(result.modelNotice ?? null);
      setFacts((current) => [...current, ...result.learnedFacts]);
      setAnswer('');
      if (result.complete) setInterviewComplete(true);
    } catch (caught: unknown) {
      if (caught instanceof ApiRequestError && caught.code === 'INTERVIEW_NOT_FOUND') {
        await clearOnboardingProgress();
        setStarted(false);
        setSessionId(undefined);
        setProgress(0);
        setFacts([]);
        setError('That saved interview expired. Start again; no partial profile was fabricated.');
      } else {
        setError(caught instanceof Error ? caught.message : 'Your answer could not be saved.');
      }
    } finally {
      setBusy(false);
    }
  };

  const nameAgent = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api('/v1/agent', patchBody({ name: agentName.trim() }));
      await clearOnboardingProgress();
      setOnboarded(true);
      router.replace('/today');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not name your agent.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppHeader
        title={
          interviewComplete
            ? 'Name the self you taught'
            : started
              ? 'Build the foundation'
              : 'Meet your private agent'
        }
        subtitle={
          interviewComplete
            ? 'The name comes after the substance.'
            : started
              ? 'Six honest answers create the first bounded working model of you.'
              : 'Your agent starts blank. It earns context from your answers and corrections.'
        }
      />
      {!started ? (
        <Card>
          <OrbitText variant="title">Start with how you work</OrbitText>
          <OrbitText>
            No sample profile is loaded. Your answers create the first durable facts.
          </OrbitText>
          <Button
            label="Start private interview"
            onPress={() => void startInterview()}
            loading={busy}
          />
          <Button
            label="I already have an agent"
            onPress={() => router.replace('/today')}
            kind="quiet"
          />
        </Card>
      ) : interviewComplete ? (
        <Card tone="yours">
          <Ring value={1} tone="yours" size={64} seed={sessionId ?? 'interview-complete'} />
          <OrbitText variant="title">What should your agent be called?</OrbitText>
          <Field
            label="Agent name"
            value={agentName}
            onChangeText={setAgentName}
            maxLength={48}
            autoFocus
          />
          <Button
            label="Name and enter ORBIT"
            onPress={() => void nameAgent()}
            loading={busy}
            disabled={agentName.trim().length === 0}
          />
        </Card>
      ) : (
        <>
          <Card tone="yours">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Ring value={progress} tone="yours" size={52} seed={sessionId ?? 'interview'} />
              <Pill tone="yours">INTERVIEW · {Math.round(progress * 100)}%</Pill>
            </View>
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
            <OrbitText variant="caption">
              {adaptive
                ? 'This follow-up adapted to your prior answers.'
                : 'Using the fixed interview sequence. Your answers—not a sample profile—are saved.'}
            </OrbitText>
          </Card>
          {facts.length === 0 ? null : (
            <Card>
              <OrbitText variant="mono">WHAT YOUR AGENT LEARNED</OrbitText>
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
        </>
      )}
      <Notice
        title="Cost bounded"
        detail="Every adaptive follow-up uses the same per-user and global model-call caps as other ORBIT reasoning."
        tone="blue"
      />
      {error === null ? null : <ErrorText message={error} />}
      {modelNotice === null ? null : (
        <Notice title="Answer saved" detail={modelNotice} tone="blue" />
      )}
    </Screen>
  );
}
