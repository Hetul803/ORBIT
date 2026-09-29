import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, OrbitText, Pill, Screen, spacing } from '@orbit/ui';

import { api } from '@/api';
import { AppHeader, Metric, Notice } from '@/components';
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
  const query = useQuery({
    queryKey: ['skills'],
    queryFn: () => api<DetailedSkill[]>('/v1/skills'),
  });
  const skill = useMemo(() => query.data?.find((item) => item.id === id), [id, query.data]);
  return (
    <Screen>
      <AppHeader
        title={skill?.name ?? 'Skill'}
        subtitle="A versioned capability with evidence, permission boundaries, and a safe fallback."
      />
      {skill === undefined ? (
        <Card>
          <OrbitText>Loading skill graph…</OrbitText>
        </Card>
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
                <View style={styles.number}>
                  <OrbitText variant="caption">{index + 1}</OrbitText>
                </View>
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
  number: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DDE7DA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, gap: spacing.xs },
});
