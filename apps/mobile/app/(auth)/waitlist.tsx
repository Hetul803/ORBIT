import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Button, Card, OrbitText, Pill, Screen } from '@orbit/ui';
import { api, jsonBody } from '@/api';
import { AppHeader, ErrorText, Notice } from '@/components';
import { useWaitlistStore } from '@/waitlist';

export default function Waitlist(): ReactNode {
  const state = useWaitlistStore();
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const join = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api('/v1/waitlist', jsonBody({ verificationToken: state.verificationToken }));
      setJoined(true);
    } catch (caught: unknown) {
      setError(
        caught instanceof Error ? caught.message : 'Your waitlist entry was not saved. Try again.',
      );
    } finally {
      setBusy(false);
    }
  };
  const remove = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api('/v1/waitlist', {
        ...jsonBody({ verificationToken: state.verificationToken }),
        method: 'DELETE',
      });
      setJoined(false);
      setConfirmRemove(false);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Your entry was not removed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <AppHeader
        title={state.paused ? 'Admissions are paused' : 'A small alpha. At capacity.'}
        subtitle="An honest limit, not a countdown."
      />
      <Card tone="moss">
        <Pill tone="moss">UP TO {String(state.capacity)} ACCOUNTS</Pill>
        <OrbitText variant="title">
          {state.paused ? 'We are preparing safety coverage.' : 'The current cohort is full.'}
        </OrbitText>
        <OrbitText>
          {state.paused
            ? 'New accounts stay closed until operator alerts and moderation coverage are ready.'
            : 'ORBIT will not create another account beyond this cohort limit. Existing members can still sign in.'}
        </OrbitText>
        <OrbitText>
          Joining the waitlist does not create an account or reserve a place. There is no promised
          invitation date.
        </OrbitText>
        {joined ? (
          <>
            <Notice
              title="Your verified email is saved"
              detail="You are on the waitlist. No account or invitation has been created."
              tone="blue"
            />
            <Button
              label={confirmRemove ? 'Confirm removal from waitlist' : 'Remove my waitlist entry'}
              kind="quiet"
              loading={busy}
              onPress={() => {
                if (confirmRemove) void remove();
                else setConfirmRemove(true);
              }}
            />
            {confirmRemove ? (
              <Button label="Keep my entry" kind="quiet" onPress={() => setConfirmRemove(false)} />
            ) : null}
          </>
        ) : state.verificationToken === null ? (
          <Notice
            title="Verify your email first"
            detail="Return to sign-in and verify a new email code. We only save waitlist entries for verified email addresses."
            tone="ember"
          />
        ) : (
          <>
            <OrbitText variant="caption">
              By joining, you agree that ORBIT stores your verified email for this waitlist. No
              automatic invitation or marketing email is sent.
            </OrbitText>
            <Button label="Join the waitlist" loading={busy} onPress={() => void join()} />
          </>
        )}
        {error === null ? null : <ErrorText message={error} />}
      </Card>
      <Button
        label="Sign in to an existing account"
        kind="secondary"
        onPress={() => {
          state.clear();
          router.replace('/sign-in');
        }}
      />
      <Button
        label="Back to sign-in"
        kind="quiet"
        onPress={() => {
          state.clear();
          router.replace('/sign-in');
        }}
      />
    </Screen>
  );
}
