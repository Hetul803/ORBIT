import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Button, Card, OrbitText, Pill, Screen } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, ErrorText, Field, Notice } from '@/components';
import { refreshSafetySurfaces } from '@/safety-updates';

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
  const [busy, setBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const act = async (kind: 'mute' | 'block' | 'report'): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      let reportReceipt:
        { conversationSuppressed: boolean; operatorAlerts: { configured: boolean } } | undefined;
      if (kind === 'block')
        await api(
          '/v1/blocks',
          jsonBody({ userId: subjectUserId, reason: detail || 'User safety choice' }),
        );
      else if (kind === 'mute')
        await api(
          '/v1/mutes',
          jsonBody({ userId: subjectUserId, reason: detail || 'User safety choice' }),
        );
      else
        reportReceipt = await api<{
          conversationSuppressed: boolean;
          operatorAlerts: { configured: boolean };
        }>(
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
          ? 'Blocked immediately in both directions. Existing introductions, transcripts and new contact are stopped. This block has no expiry or unblock option. It cannot erase contact details already copied outside ORBIT.'
          : kind === 'mute'
            ? 'Muted. Their activity is hidden without notifying them.'
            : `Report recorded. ${reportReceipt?.conversationSuppressed ? 'The reported conversation is hidden pending review.' : 'No conversation was attached to this report.'} ${reportReceipt?.operatorAlerts.configured ? 'Operator email and push alerts are attempted immediately and retried if their providers are unavailable.' : 'Operator alerts are not configured in this local environment; this is not a staffed public alpha.'}`,
      );
      setConfirmBlock(false);
      if (kind !== 'mute') await refreshSafetySurfaces().catch(() => undefined);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The safety action failed.');
    } finally {
      setBusy(false);
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
  const checkIn = async (): Promise<void> => {
    if (plan === null) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/safety-plans/${plan.id}/check-in`, jsonBody({}));
      setMessage('Checked in safely.');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Check-in was not saved. Try again.');
    } finally {
      setBusy(false);
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
          onChangeText={(value) => {
            setSubjectUserId(value);
            setConfirmBlock(false);
          }}
          hint="Available from the person-facing surface that brought you here."
        />
        <Field label="What happened?" value={detail} onChangeText={setDetail} multiline />
        <Button
          label="Mute quietly"
          onPress={() => void act('mute')}
          kind="secondary"
          disabled={subjectUserId.length < 8 || busy}
        />
        <Button
          label={confirmBlock ? 'Confirm permanent block' : 'Block this person'}
          onPress={() => {
            if (confirmBlock) void act('block');
            else setConfirmBlock(true);
          }}
          kind="danger"
          disabled={subjectUserId.length < 8 || busy}
        />
        <Button
          label="Send report"
          onPress={() => void act('report')}
          kind="secondary"
          disabled={subjectUserId.length < 8 || detail.length === 0 || busy}
        />
        {confirmBlock ? (
          <>
            <Notice
              title="No expiry or unblock option"
              detail="Confirming stops contact in both directions immediately. You cannot undo this block for these accounts. Previously copied contact details cannot be erased."
              tone="ember"
            />
            <Button label="Cancel block" kind="quiet" onPress={() => setConfirmBlock(false)} />
          </>
        ) : null}
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
            <Button label="I’m safe — check in" loading={busy} onPress={() => void checkIn()} />
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
