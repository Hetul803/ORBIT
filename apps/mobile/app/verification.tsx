import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Button, Card, Pill, Screen } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, ErrorText, Field, Notice } from '@/components';

export default function Verification(): ReactNode {
  const [eduEmail, setEduEmail] = useState('');
  const [eduCode, setEduCode] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const perform = async (work: () => Promise<unknown>, success: string): Promise<void> => {
    setError(null);
    try {
      const result = (await work()) as { developmentCode?: string };
      setMessage(
        result.developmentCode === undefined
          ? success
          : `${success} Local code: ${result.developmentCode}`,
      );
      if (result.developmentCode !== undefined) {
        if (success.includes('campus')) setEduCode(result.developmentCode);
        else setPhoneCode(result.developmentCode);
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Verification failed.');
    }
  };
  return (
    <Screen>
      <AppHeader
        title="Optional verification"
        subtitle="Email starts an account. Campus email and phone unlock only the surfaces that need stronger trust."
      />
      <Notice
        title="Why this exists"
        detail="A .edu address unlocks campus introductions, campus exchange, and campus groups. A verified phone can be revealed only through two-sided field consent."
        tone="blue"
      />
      <Card>
        <Pill tone="moss">CAMPUS</Pill>
        <Field
          label=".edu email"
          value={eduEmail}
          onChangeText={setEduEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Button
          label="Send campus code"
          onPress={() =>
            void perform(
              () => api('/v1/auth/verify-edu/request', jsonBody({ email: eduEmail })),
              'Check your campus inbox.',
            )
          }
          kind="secondary"
          disabled={!eduEmail.endsWith('.edu')}
        />
        <Field
          label="Campus code"
          value={eduCode}
          onChangeText={setEduCode}
          keyboardType="number-pad"
          maxLength={6}
        />
        <Button
          label="Verify campus"
          onPress={() =>
            void perform(
              () => api('/v1/auth/verify-edu', jsonBody({ email: eduEmail, code: eduCode })),
              'Campus features unlocked.',
            )
          }
          disabled={eduCode.length !== 6}
        />
      </Card>
      <Card>
        <Pill tone="blue">PHONE</Pill>
        <Field
          label="Phone in E.164 format"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="+13125550199"
        />
        <Button
          label="Send phone code"
          onPress={() =>
            void perform(
              () => api('/v1/auth/verify-phone/request', jsonBody({ phone })),
              'Phone code sent.',
            )
          }
          kind="secondary"
          disabled={!phone.startsWith('+')}
        />
        <Field
          label="Phone code"
          value={phoneCode}
          onChangeText={setPhoneCode}
          keyboardType="number-pad"
          maxLength={6}
        />
        <Button
          label="Verify phone"
          onPress={() =>
            void perform(
              () => api('/v1/auth/verify-phone', jsonBody({ phone, code: phoneCode })),
              'Phone verified.',
            )
          }
          disabled={phoneCode.length !== 6}
        />
      </Card>
      {message === null ? null : <Notice title="Verification" detail={message} tone="moss" />}
      {error === null ? null : <ErrorText message={error} />}
      <Button label="Back" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}
