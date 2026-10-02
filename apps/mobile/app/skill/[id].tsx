import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, OrbitText, Pill, Ring, Screen, spacing } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, EmptyState, ErrorText, Field, Metric, Notice, QueryError } from '@/components';
import type { Skill } from '@/types';

interface DetailedSkill extends Skill {
  definition?: {
    trigger?: string;
    steps?: { id: string; title: string; instruction: string; requiresApproval: boolean }[];
    fallback?: string;
  };
}

export default function SkillDetail(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recipient, setRecipient] = useState('');
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const query = useQuery({
    queryKey: ['skills'],
    queryFn: () => api<DetailedSkill[]>('/v1/skills'),
  });
  const skill = useMemo(() => query.data?.find((item) => item.id === id), [id, query.data]);
  const share = async (): Promise<void> => {
    if (skill === undefined) return;
    setSharing(true);
    setShareError(null);
    try {
      const result = await api<{ recipient: { displayName: string } }>(
        `/v1/skills/${skill.id}/share`,
        jsonBody({ recipient }),
      );
      setShareMessage(
        `Shared with ${result.recipient.displayName}. Acceptance will appear in their approval inbox.`,
      );
      setRecipient('');
    } catch (caught: unknown) {
      setShareError(caught instanceof Error ? caught.message : 'Could not share this skill.');
    } finally {
      setSharing(false);
    }
  };
  return (
    <Screen>
      <AppHeader
        title={skill?.name ?? 'Skill'}
        subtitle="A versioned capability with evidence, permission boundaries, and a safe fallback."
      />
      {query.isError ? (
        <QueryError message={query.error.message} onRetry={() => void query.refetch()} />
      ) : skill === undefined ? (
        query.isPending ? (
          <Card>
            <OrbitText>Loading skill graph…</OrbitText>
          </Card>
        ) : (
          <EmptyState title="Skill not found." detail="It may have been retired or removed." />
        )
      ) : (
        <>
          <Card tone="moss">
            <View style={styles.top}>
              <Pill tone="moss">VERSION {String(skill.version)}</Pill>
              <Pill>{skill.status.toUpperCase()}</Pill>
            </View>
            <View style={styles.metrics}>
              <Metric value={`${String(skill.autonomyPct)}%`} label="autonomy" />
              <Metric value={`${String(Math.round(skill.confidence * 100))}%`} label="confidence" />
              <Metric value={String(skill.adoptionCount)} label="adoptions" />
            </View>
            <OrbitText>{skill.effect}</OrbitText>
          </Card>
          <Notice
            title="Confidence is not permission"
            detail="Even a highly reliable skill stops at externally visible writes unless an approval receipt exists."
            tone="blue"
          />
          <Card>
            <OrbitText variant="mono">VALIDATED PATH</OrbitText>
            <OrbitText variant="label">Trigger</OrbitText>
            <OrbitText>
              {skill.definition?.trigger ?? 'When its known conditions are present.'}
            </OrbitText>
            {(skill.definition?.steps ?? []).map((step, index) => (
              <View key={step.id} style={styles.step}>
                <Ring
                  value={(index + 1) / Math.max(1, skill.definition?.steps?.length ?? 1)}
                  tone="yours"
                  size={28}
                  seed={step.id}
                />
                <View style={styles.flex}>
                  <OrbitText variant="label">{step.title}</OrbitText>
                  <OrbitText>{step.instruction}</OrbitText>
                  {step.requiresApproval ? <Pill tone="ember">APPROVAL GATE</Pill> : null}
                </View>
              </View>
            ))}
            <OrbitText variant="label">Fallback</OrbitText>
            <OrbitText>
              {skill.definition?.fallback ??
                'Pause and use general reasoning for unfamiliar inputs.'}
            </OrbitText>
          </Card>
          <Button
            label="Correct and create next version"
            onPress={() => router.push({ pathname: '/skill/edit', params: { id: skill.id } })}
            kind="secondary"
          />
          <Card>
            <OrbitText variant="title">Share this skill</OrbitText>
            <OrbitText>
              Send a reviewable adoption request by ORBIT email or handle. No private memory is
              included.
            </OrbitText>
            <Field
              label="Recipient email or @handle"
              value={recipient}
              onChangeText={setRecipient}
              autoCapitalize="none"
            />
            <Button
              label="Send skill for review"
              onPress={() => void share()}
              loading={sharing}
              disabled={recipient.trim().length < 2}
            />
            {shareMessage === null ? null : (
              <Notice title="Shared" detail={shareMessage} tone="moss" />
            )}
            {shareError === null ? null : <ErrorText message={shareError} />}
          </Card>
        </>
      )}
      <Button label="Back" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between' },
  metrics: { flexDirection: 'row', gap: spacing.md },
  step: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xs },
});
