import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Button, Card, OrbitText, Pill, Screen } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, ErrorText, Field, Notice } from '@/components';

export default function Safety(): ReactNode {
  const params = useLocalSearchParams<{
    introductionId?: string;
    conversationId?: string;
    subjectUserId?: string;
  }>();
  const [subjectUserId, setSubjectUserId] = useState(params.subjectUserId ?? '');
  const [detail, setDetail] = useState('');
  const [placeName, setPlaceName] = useState('Campus library cafe');
  const [meetAt, setMeetAt] = useState(new Date(Date.now() + 86_400_000).toISOString());
  const [plan, setPlan] = useState<{ id: string; shareUrl: string; checkInDueAt: string } | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = async (kind: 'block' | 'report'): Promise<void> => {
    setError(null);
    try {
      if (kind === 'block')
        await api(
          '/v1/blocks',
          jsonBody({ userId: subjectUserId, reason: detail || 'User safety choice' }),
        );
      else
        await api(
          '/v1/reports',
          jsonBody({
            subjectUserId,
            ...(params.conversationId === undefined
              ? {}
              : { conversationId: params.conversationId }),
            category: 'other',
            detail,
          }),
        );
      setMessage(
        kind === 'block'
          ? 'Blocked. New matching and contact are stopped.'
          : 'Report received by the moderation queue.',
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The safety action failed.');
    }
  };
  const createPlan = async (): Promise<void> => {
    if (params.introductionId === undefined) return;
    setError(null);
    try {
      setPlan(
        await api<{ id: string; shareUrl: string; checkInDueAt: string }>(
          '/v1/safety-plans',
          jsonBody({
            introductionId: params.introductionId,
            placeName,
            meetAt,
            shareWithContact: true,
          }),
        ),
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The safety plan could not be created.');
    }
  };
  return (
    <Screen>
      <AppHeader
        title="Safety center"
        subtitle="Fast controls for a bad feeling, a clear violation, or a real-world meeting."
      />
      <Notice
        title="In immediate danger?"
        detail="Contact local emergency services. ORBIT’s controls support safety but are not an emergency response service."
        tone="ember"
      />
      <Card>
        <Pill tone="ember">BLOCK OR REPORT</Pill>
        <Field
          label="User ID"
          value={subjectUserId}
          onChangeText={setSubjectUserId}
          hint="Available from the person-facing surface that brought you here."
        />
        <Field label="What happened?" value={detail} onChangeText={setDetail} multiline />
        <Button
          label="Block immediately"
          onPress={() => void act('block')}
          kind="danger"
          disabled={subjectUserId.length < 8}
        />
        <Button
          label="Send report"
          onPress={() => void act('report')}
          kind="secondary"
          disabled={subjectUserId.length < 8 || detail.length === 0}
        />
      </Card>
      <Card tone="moss">
        <OrbitText variant="title">Meeting safety plan</OrbitText>
        <OrbitText>
          Create a shareable plan with place, time, and check-in before an in-person exchange or
          introduction.
        </OrbitText>
        <Field label="Public place" value={placeName} onChangeText={setPlaceName} />
        <Field
          label="Meeting time"
          value={meetAt}
          onChangeText={setMeetAt}
          hint="ISO date and time"
        />
        <Button
          label="Create share-and-check-in plan"
          onPress={() => void createPlan()}
          kind="secondary"
          disabled={params.introductionId === undefined}
        />
        {plan === null ? null : (
          <>
            <Notice
              title="Plan created"
              detail={`Share: ${plan.shareUrl}\nCheck in by ${new Date(plan.checkInDueAt).toLocaleString()}`}
              tone="blue"
            />
            <Button
              label="I’m safe — check in"
              onPress={() =>
                void api(`/v1/safety-plans/${plan.id}/check-in`, jsonBody({})).then(() =>
                  setMessage('Checked in safely.'),
                )
              }
            />
          </>
        )}
      </Card>
      {message === null ? null : (
        <Notice title="Safety action recorded" detail={message} tone="blue" />
      )}
      {error === null ? null : <ErrorText message={error} />}
      <Button label="Back" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}
