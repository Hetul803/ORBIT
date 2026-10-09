import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Linking, Platform, StyleSheet, View } from 'react-native';
import { Button, Card, OrbitText, Screen, spacing } from '@orbit/ui';

import { api, ApiRequestError, configuredApiUrl, jsonBody } from '@/api';
import { ErrorText, Field, Notice, Wordmark } from '@/components';
import { useAuthStore } from '@/store';

interface OtpRequestResponse {
  ok: boolean;
  expiresIn: number;
  resendAfterSeconds: number;
}
interface OtpVerifyResponse {
  accessToken: string;
  refreshToken: string;
  hasAgent: boolean;
}

export default function SignIn(): ReactNode {
  const setTokens = useAuthStore((state) => state.setTokens);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [code, setCode] = useState('');
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resendSeconds = Math.max(0, Math.ceil((resendAvailableAt - now) / 1_000));

  useEffect(() => {
    if (resendSeconds === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [resendSeconds]);

  const authError = (caught: unknown): string => {
    if (!(caught instanceof ApiRequestError)) {
      return 'Could not reach ORBIT. Check your connection and try again.';
    }
    if (caught.code === 'NETWORK_UNAVAILABLE') {
      return 'You are offline. Reconnect, then request or verify the code again.';
    }
    if (caught.code === 'OTP_INCORRECT') {
      return 'That code is incorrect. Check all six digits in the newest email and try again.';
    }
    if (caught.code === 'OTP_EXPIRED') {
      return 'That code expired. Request a new code below, then use only the newest email.';
    }
    if (caught.code === 'OTP_RESEND_WAIT') {
      return 'A code was just sent. Wait for the resend timer instead of requesting repeatedly.';
    }
    if (caught.code.includes('RATE_LIMITED') || caught.code === 'OTP_LOCKED') {
      return `${caught.message} Pause for 15 minutes before trying again.`;
    }
    return caught.message;
  };

  const requestCode = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<OtpRequestResponse>('/v1/auth/otp/request', jsonBody({ email }));
      setResendAvailableAt(Date.now() + result.resendAfterSeconds * 1_000);
      setNow(Date.now());
      setStep('code');
    } catch (caught: unknown) {
      setError(authError(caught));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<OtpVerifyResponse>(
        '/v1/auth/otp/verify',
        jsonBody({ email, code, dateOfBirth, displayName }),
      );
      await setTokens(result.accessToken, result.refreshToken);
      router.replace(result.hasAgent ? '/today' : '/agent');
    } catch (caught: unknown) {
      setError(authError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen contentStyle={styles.content}>
        <Wordmark />
        <View style={styles.hero}>
          <OrbitText variant="display">A second self that gets better at being useful.</OrbitText>
          <OrbitText>
            ORBIT works quietly, shows its reasoning, and asks before anything leaves your private
            space.
          </OrbitText>
        </View>
        <Card>
          {step === 'email' ? (
            <>
              <OrbitText variant="title">Enter your private orbit</OrbitText>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                testID="email-input"
              />
              <Button
                label="Send six-digit code"
                onPress={() => void requestCode()}
                loading={busy}
                disabled={!email.includes('@')}
                testID="request-code"
              />
            </>
          ) : (
            <>
              <OrbitText variant="title">Verify it’s you</OrbitText>
              <Field
                label="Code"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={6}
                testID="otp-input"
              />
              <Field
                label="What should we call you?"
                value={displayName}
                onChangeText={setDisplayName}
              />
              <Field
                label="Date of birth"
                value={dateOfBirth}
                onChangeText={setDateOfBirth}
                hint="YYYY-MM-DD · ORBIT is strictly 18+."
              />
              <Notice
                title="Check your email"
                detail="Use the newest six-digit code. ORBIT never displays sign-in codes inside the app."
                tone="moss"
              />
              <Button
                label="Continue"
                onPress={() => void verify()}
                loading={busy}
                disabled={code.length !== 6 || displayName.length === 0}
                testID="verify-code"
              />
              <Button
                label={resendSeconds > 0 ? `Resend in ${String(resendSeconds)}s` : 'Resend code'}
                onPress={() => void requestCode()}
                disabled={busy || resendSeconds > 0}
                kind="secondary"
              />
              <Button label="Use another email" onPress={() => setStep('email')} kind="quiet" />
            </>
          )}
          {error === null ? null : <ErrorText message={error} />}
        </Card>
        <OrbitText variant="caption" style={styles.privacy}>
          No social scraping. No ads. No sale of personal data. Your agent reveals nothing until
          both people explicitly agree.
        </OrbitText>
        {configuredApiUrl.length === 0 ? null : (
          <View style={styles.legal}>
            <Button
              label="Privacy"
              onPress={() => void Linking.openURL(`${configuredApiUrl}/privacy`)}
              kind="quiet"
            />
            <Button
              label="Terms"
              onPress={() => void Linking.openURL(`${configuredApiUrl}/terms`)}
              kind="quiet"
            />
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { minHeight: '100%', justifyContent: 'space-between', paddingTop: spacing.xl },
  hero: { gap: spacing.lg, paddingVertical: spacing.xl },
  privacy: { textAlign: 'center' },
  legal: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
});
