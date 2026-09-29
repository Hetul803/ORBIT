import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Card, colors, OrbitText, Pill, Screen, spacing } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, ErrorText, Notice } from '@/components';

interface IntroductionDetail {
  id: string;
  conversationId: string;
  otherUserId: string;
  intentKind: string;
  otherAgent: { name: string };
  verdict: {
    score: number;
    reasons: string[];
    suggestedFirstActivity: string;
    oneLineReason: string;
    flags: string[];
  };
  myDecision: 'pending' | 'reveal' | 'decline';
  otherDecision: 'pending' | 'reveal';
  revealedAt: string | null;
  revealedFields: Record<string, string>;
  expiresAt: string;
}

interface Transcript {
  messages: { id: string; speakerAgentId: string; redactedContent: string; turnIndex: number }[];
}

const Choice = ({
  selected,
  label,
  onPress,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
}): ReactNode => (
  <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}>
    <OrbitText variant="label">{label}</OrbitText>
  </Pressable>
);

export default function IntroductionScreen(): ReactNode {
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id;
  const client = useQueryClient();
  const [fields, setFields] = useState<('first_name' | 'handle' | 'phone')[]>(['first_name']);
  const detail = useQuery({
    queryKey: ['introduction', id],
    queryFn: () => api<IntroductionDetail>(`/v1/introductions/${id}`),
  });
  const transcript = useQuery({
    queryKey: ['transcript', id],
    queryFn: () => api<Transcript>(`/v1/introductions/${id}/transcript`),
  });
  const decision = useMutation({
    mutationFn: (value: 'reveal' | 'decline') =>
      api<IntroductionDetail>(
        `/v1/introductions/${id}/decision`,
        jsonBody({ decision: value, fields: value === 'reveal' ? fields : [] }),
      ),
    onMutate: async (value) => {
      await client.cancelQueries({ queryKey: ['introduction', id] });
      const previous = client.getQueryData<IntroductionDetail>(['introduction', id]);
      if (previous !== undefined)
        client.setQueryData(['introduction', id], { ...previous, myDecision: value });
      return { previous };
    },
    onError: (_error, _value, context) => {
      if (context?.previous !== undefined)
        client.setQueryData(['introduction', id], context.previous);
    },
    onSuccess: (value) => {
      client.setQueryData(['introduction', id], value);
      void client.invalidateQueries({ queryKey: ['introductions'] });
    },
  });
  const intro = detail.data;
  if (intro === undefined)
    return (
      <Screen>
        <AppHeader title="Opening the sealed conversation" />
        <Card>
          <OrbitText>Your agent is retrieving the redacted transcript.</OrbitText>
        </Card>
      </Screen>
    );
  return (
    <Screen>
      <AppHeader
        title={`${String(intro.verdict.score)} / 100`}
        subtitle={intro.verdict.oneLineReason}
      />
      <View style={styles.pills}>
        <Pill tone="moss">{intro.intentKind.toUpperCase()}</Pill>
        <Pill>{intro.otherAgent.name} · IDENTITY SEALED</Pill>
      </View>
      <Card tone="moss">
        <OrbitText variant="mono">INDEPENDENT VERDICT</OrbitText>
        {intro.verdict.reasons.map((reason, index) => (
          <OrbitText key={reason}>
            {String(index + 1)}. {reason}
          </OrbitText>
        ))}
        <OrbitText variant="label">First idea</OrbitText>
        <OrbitText>{intro.verdict.suggestedFirstActivity}</OrbitText>
      </Card>
      <Card>
        <OrbitText variant="mono">REDACTED AGENT TRANSCRIPT</OrbitText>
        {(transcript.data?.messages ?? []).map((message) => (
          <View
            key={message.id}
            style={[styles.message, message.turnIndex % 2 === 1 && styles.messageOther]}
          >
            <OrbitText variant="caption">AGENT {message.turnIndex % 2 === 0 ? 'A' : 'B'}</OrbitText>
            <OrbitText>{message.redactedContent}</OrbitText>
          </View>
        ))}
        <OrbitText variant="caption">
          Names, contact information, addresses, employers, class sections, and exact schedules are
          removed before storage.
        </OrbitText>
      </Card>
      {intro.myDecision === 'pending' ? (
        <Card tone="ember">
          <OrbitText variant="title">Reveal only what you choose</OrbitText>
          <OrbitText>Nothing appears unless the other person also chose reveal.</OrbitText>
          <View style={styles.choices}>
            {(
              [
                ['first_name', 'First name'],
                ['handle', 'Handle'],
                ['phone', 'Phone'],
              ] as const
            ).map(([field, label]) => (
              <Choice
                key={field}
                label={label}
                selected={fields.includes(field)}
                onPress={() =>
                  setFields((current) =>
                    current.includes(field)
                      ? current.filter((value) => value !== field)
                      : [...current, field],
                  )
                }
              />
            ))}
          </View>
          <Button
            label="Reveal if they reveal"
            onPress={() => decision.mutate('reveal')}
            loading={decision.isPending}
            disabled={fields.length === 0}
          />
          <Button
            label="Decline privately"
            onPress={() => decision.mutate('decline')}
            kind="quiet"
          />
        </Card>
      ) : intro.revealedAt === null ? (
        <Notice
          title={intro.myDecision === 'reveal' ? 'Your choice is sealed' : 'Declined privately'}
          detail={
            intro.myDecision === 'reveal'
              ? 'We will reveal only the intersecting fields if the other person independently agrees.'
              : 'No identifying details were shared.'
          }
          tone="blue"
        />
      ) : (
        <Card tone="moss">
          <OrbitText variant="title">Mutual reveal</OrbitText>
          {Object.entries(intro.revealedFields).map(([field, value]) => (
            <OrbitText key={field}>
              {field.replaceAll('_', ' ')}: {value}
            </OrbitText>
          ))}
          <Button label="Record how it went" onPress={() => undefined} kind="secondary" />
        </Card>
      )}
      {decision.error === null ? null : <ErrorText message={decision.error.message} />}
      <Button
        label="Safety controls"
        onPress={() =>
          router.push({
            pathname: '/safety',
            params: {
              introductionId: id,
              conversationId: intro.conversationId,
              subjectUserId: intro.otherUserId,
            },
          })
        }
        kind="quiet"
      />
      <Button label="Back" onPress={() => router.back()} kind="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  message: {
    alignSelf: 'flex-start',
    maxWidth: '90%',
    backgroundColor: colors.blueLight,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: spacing.md,
    gap: spacing.xs,
  },
  messageOther: {
    alignSelf: 'flex-end',
    backgroundColor: colors.mossLight,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 4,
  },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  choiceSelected: { borderColor: colors.ember, backgroundColor: colors.emberLight },
});
