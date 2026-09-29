import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Card, colors, Icon, OrbitText, Pill, Screen, spacing } from '@orbit/ui';

import { api } from '@/api';
import { AppHeader, Metric, Notice } from '@/components';
import { demoSkills } from '@/demo';
import type { Skill } from '@/types';

export default function Skills(): ReactNode {
  const query = useQuery({ queryKey: ['skills'], queryFn: () => api<Skill[]>('/v1/skills') });
  const skills = query.data ?? demoSkills;
  return (
    <Screen>
      <AppHeader
        title="Skills that compound"
        subtitle="Every correction can become a versioned, testable capability—not another forgotten chat."
      />
      <Notice
        title="The ORVIN backbone"
        detail="ORBIT reuses validated steps, rents frontier reasoning only for unfamiliar branches, and shows the efficiency gain."
        tone="moss"
      />
      {skills.map((skill) => (
        <Pressable
          key={skill.id}
          onPress={() => router.push({ pathname: '/skill/[id]', params: { id: skill.id } })}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Card>
            <View style={styles.top}>
              <Pill tone={skill.status === 'active' ? 'moss' : 'ember'}>
                V{skill.version} · {skill.status.toUpperCase()}
              </Pill>
              <Icon name="arrow" size={18} />
            </View>
            <OrbitText variant="title">{skill.name}</OrbitText>
            <OrbitText>{skill.effect}</OrbitText>
            <View style={styles.metrics}>
              <Metric value={`${String(skill.autonomyPct)}%`} label="autonomy" />
              <Metric value={`${String(Math.round(skill.confidence * 100))}%`} label="confidence" />
              <Metric value={`${String(Math.round(skill.successRate * 100))}%`} label="success" />
            </View>
            <OrbitText variant="caption">
              Reused by {skill.adoptionCount} people · {skill.runCount} runs
            </OrbitText>
          </Card>
        </Pressable>
      ))}
      <Button label="Create a skill" onPress={() => router.push('/skill/new')} kind="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metrics: {
    flexDirection: 'row',
    gap: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
  },
  pressed: { opacity: 0.72 },
});
