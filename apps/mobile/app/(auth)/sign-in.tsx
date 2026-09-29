import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Button, Card, colors, OrbitText, Screen, spacing } from '@orbit/ui';

import { api, ApiRequestError, jsonBody } from '@/api';
import { ErrorText, Field, Notice, Wordmark } from '@/components';
import { useAuthStore } from '@/store';

interface OtpRequestResponse {
  ok: boolean;
  expiresIn: number;
  developmentCode?: string;
}
interface OtpVerifyResponse {
  accessToken: string;
  refreshToken: string;
}

export default function SignIn(): ReactNode {
  const setTokens = useAuthStore((state) => state.setTokens);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('demo@orbit.local');
  const [displayName, setDisplayName] = useState('Demo Founder');
  const [dateOfBirth, setDateOfBirth] = useState('2000-01-01');
  const [code, setCode] = useState('424242');
  const [developmentCode, setDevelopmentCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestCode = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<OtpRequestResponse>('/v1/auth/otp/request', jsonBody({ email }));
      setDevelopmentCode(result.developmentCode ?? null);
      if (result.developmentCode !== undefined) setCode(result.developmentCode);
      setStep('code');
    } catch (caught: unknown) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'Could not reach ORBIT. Check your connection and try again.',
      );
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
      router.replace('/agent');
    } catch (caught: unknown) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Could not verify the code.');
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
              {developmentCode === null ? null : (
                <Notice
                  title="Local development"
                  detail={`Your code is ${developmentCode}. Production sends this by email.`}
                  tone="moss"
                />
              )}
              <Button
                label="Continue"
                onPress={() => void verify()}
                loading={busy}
                disabled={code.length !== 6 || displayName.length === 0}
                testID="verify-code"
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
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { minHeight: '100%', justifyContent: 'space-between', paddingTop: spacing.xl },
  hero: { gap: spacing.lg, paddingVertical: spacing.xl },
  privacy: { textAlign: 'center', color: colors.inkSoft },
});
