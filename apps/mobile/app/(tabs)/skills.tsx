import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Icon,
  OrbitText,
  Pill,
  Ring,
  Screen,
  spacing,
  useOrbitTheme,
} from '@orbit/ui';

import { api } from '@/api';
import { AppHeader, EmptyState, Metric, Notice, QueryError } from '@/components';
import type { Skill } from '@/types';

export default function Skills(): ReactNode {
  const { colors } = useOrbitTheme();
  const query = useQuery({ queryKey: ['skills'], queryFn: () => api<Skill[]>('/v1/skills') });
  const skills = query.isError ? [] : (query.data ?? []);
  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <FlashList
        data={skills}
        keyExtractor={(skill) => skill.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <AppHeader
              title="Skills that compound"
              subtitle="Every correction can become a versioned, testable capability—not another forgotten chat."
            />
            <Notice
              title="The ORVIN backbone"
              detail="ORBIT reuses validated steps, rents frontier reasoning only for unfamiliar branches, and shows the efficiency gain."
              tone="moss"
            />
          </View>
        }
        ListEmptyComponent={
          query.isPending ? (
            <Card>
              <OrbitText>Loading skills…</OrbitText>
            </Card>
          ) : query.isError ? (
            <QueryError message={query.error.message} onRetry={() => void query.refetch()} />
          ) : (
            <EmptyState
              title="No skills yet."
              detail="Teach one useful process once, then improve it with evidence."
            />
          )
        }
        renderItem={({ item: skill }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${skill.name}`}
            onPress={() => router.push({ pathname: '/skill/[id]', params: { id: skill.id } })}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Card>
              <View style={styles.top}>
                <Pill tone={skill.status === 'active' ? 'yours' : 'alert'}>
                  V{skill.version} · {skill.status.toUpperCase()}
                </Pill>
                <Icon name="arrow" size={18} />
              </View>
              <OrbitText variant="title">{skill.name}</OrbitText>
              <OrbitText>{skill.effect}</OrbitText>
              <View style={[styles.metrics, { borderTopColor: colors.hairline }]}>
                <View style={styles.ringMetric}>
                  <Ring
                    value={skill.autonomyPct}
                    tone="yours"
                    size={42}
                    seed={`${skill.id}-autonomy`}
                  />
                  <Metric value={`${String(skill.autonomyPct)}%`} label="autonomy" />
                </View>
                <View style={styles.ringMetric}>
                  <Ring
                    value={skill.confidence}
                    tone="rented"
                    size={42}
                    seed={`${skill.id}-confidence`}
                  />
                  <Metric
                    value={`${String(Math.round(skill.confidence * 100))}%`}
                    label="confidence"
                  />
                </View>
              </View>
              <OrbitText variant="caption">
                Reused by {skill.adoptionCount} people · {skill.runCount} runs ·{' '}
                {String(Math.round(skill.successRate * 100))}% success
              </OrbitText>
            </Card>
          </Pressable>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Button
              label="Create a skill"
              onPress={() => router.push('/skill/new')}
              kind="secondary"
            />
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 },
  list: { paddingBottom: spacing.xxl },
  header: { gap: spacing.lg, paddingBottom: spacing.lg },
  footer: { paddingTop: spacing.lg },
  separator: { height: spacing.md },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metrics: {
    flexDirection: 'row',
    gap: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  ringMetric: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pressed: { opacity: 0.72 },
});
