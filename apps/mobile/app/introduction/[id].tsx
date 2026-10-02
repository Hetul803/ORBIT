import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  OrbitText,
  Pill,
  radii,
  Ring,
  Screen,
  spacing,
  useOrbitTheme,
} from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, ErrorText, Field, Notice, QueryError } from '@/components';

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
  revealedFields: Record<'you' | 'other', Record<string, string>> | Record<string, never>;
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
}): ReactNode => {
  const { colors } = useOrbitTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, { borderColor: selected ? colors.yours : colors.hairlineStrong }]}
    >
      <OrbitText variant="label">{label}</OrbitText>
    </Pressable>
  );
};

export default function IntroductionScreen(): ReactNode {
  const { colors } = useOrbitTheme();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id;
  const client = useQueryClient();
  const [fields, setFields] = useState<('first_name' | 'handle' | 'phone')[]>(['first_name']);
  const [showOutcome, setShowOutcome] = useState(false);
  const [met, setMet] = useState<boolean | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [outcomeSaved, setOutcomeSaved] = useState(false);
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
  const outcome = useMutation({
    mutationFn: () =>
      api(
        `/v1/introductions/${id}/outcome`,
        jsonBody({
          met: met === true,
          ...(rating === null ? {} : { rating }),
          ...(notes.trim().length === 0 ? {} : { notes: notes.trim() }),
        }),
      ),
    onSuccess: () => {
      setOutcomeSaved(true);
      setShowOutcome(false);
    },
  });
  const intro = detail.data;
  if (detail.isError)
    return (
      <Screen>
        <AppHeader title="Compatibility" />
        <QueryError message={detail.error.message} onRetry={() => void detail.refetch()} />
      </Screen>
    );
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
      <AppHeader title="Compatibility" subtitle={intro.verdict.oneLineReason} />
      <Ring value={intro.verdict.score} tone="yours" size={72} seed={intro.id} />
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
        {transcript.isError ? (
          <QueryError
            message={transcript.error.message}
            onRetry={() => void transcript.refetch()}
          />
        ) : (
          (transcript.data?.messages ?? []).map((message) => (
            <View key={message.id} style={[styles.message, { borderTopColor: colors.hairline }]}>
              <Ring
                value={(message.turnIndex + 1) / Math.max(1, transcript.data?.messages.length ?? 1)}
                tone={message.turnIndex % 2 === 0 ? 'yours' : 'rented'}
                size={30}
                seed={message.speakerAgentId}
              />
              <OrbitText variant="caption">
                AGENT {message.turnIndex % 2 === 0 ? 'A' : 'B'} · TURN{' '}
                {String(message.turnIndex + 1)}
              </OrbitText>
              <OrbitText>{message.redactedContent}</OrbitText>
            </View>
          ))
        )}
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
          {Object.entries(intro.revealedFields).map(([owner, revealed]) => (
            <View key={owner} style={styles.revealedProfile}>
              <OrbitText variant="label">
                {owner === 'you' ? 'Your profile' : intro.otherAgent.name}
              </OrbitText>
              {Object.entries(revealed).map(([field, value]) => (
                <OrbitText key={field}>
                  {field.replaceAll('_', ' ')}: {value}
                </OrbitText>
              ))}
            </View>
          ))}
          {outcomeSaved ? (
            <Notice
              title="Outcome recorded"
              detail="Your private feedback will improve future ranking without exposing it to the other person."
              tone="moss"
            />
          ) : showOutcome ? (
            <View style={styles.outcome}>
              <OrbitText variant="label">Did you meet?</OrbitText>
              <View style={styles.choices}>
                <Choice selected={met === true} label="Yes" onPress={() => setMet(true)} />
                <Choice selected={met === false} label="Not yet" onPress={() => setMet(false)} />
              </View>
              <OrbitText variant="label">How useful was the introduction?</OrbitText>
              <View style={styles.choices}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Choice
                    key={value}
                    selected={rating === value}
                    label={String(value)}
                    onPress={() => setRating(value)}
                  />
                ))}
              </View>
              <Field label="Private notes" value={notes} onChangeText={setNotes} multiline />
              <Button
                label="Save outcome"
                onPress={() => outcome.mutate()}
                loading={outcome.isPending}
                disabled={met === null}
              />
              <Button label="Cancel" onPress={() => setShowOutcome(false)} kind="quiet" />
            </View>
          ) : (
            <Button
              label="Record how it went"
              onPress={() => setShowOutcome(true)}
              kind="secondary"
            />
          )}
        </Card>
      )}
      {decision.error === null ? null : <ErrorText message={decision.error.message} />}
      {outcome.error === null ? null : <ErrorText message={outcome.error.message} />}
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
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: {
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  outcome: { gap: spacing.md },
  revealedProfile: { gap: spacing.xs },
});
