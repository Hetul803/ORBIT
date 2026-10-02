import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Icon, OrbitText, Pill, Screen, spacing } from '@orbit/ui';

import { api } from '@/api';
import { AppHeader, Metric, Notice, QueryError } from '@/components';

interface RunDetail {
  id: string;
  kind: string;
  status: string;
  steps: { name: string; status: string; detail: string; durationMs: number }[];
  modelCalls: {
    id: string;
    task: string;
    provider: string;
    model: string;
    tokensIn: number;
    tokensOut: number;
    costCents: number;
    latencyMs: number;
  }[];
  costCents: number;
  durationMs: number;
  firstRunComparison: {
    actionsSaved: number;
    durationSavedMs: number;
    modelCallsSaved: number;
    costSavedCents: number;
  } | null;
}

export default function RunScreen(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({
    queryKey: ['run', id],
    queryFn: () => api<RunDetail>(`/v1/runs/${id}`),
  });
  const run = query.data;
  return (
    <Screen>
      <AppHeader
        title="Work receipt"
        subtitle="See exactly what happened, what it cost, and where autonomy stopped."
      />
      {query.isError ? (
        <QueryError message={query.error.message} onRetry={() => void query.refetch()} />
      ) : run === undefined ? (
        <Card>
          <OrbitText>Loading the signed execution record…</OrbitText>
        </Card>
      ) : (
        <>
          <Card tone="moss">
            <View style={styles.top}>
              <Pill tone="moss">{run.status.toUpperCase()}</Pill>
              <OrbitText variant="mono">{run.kind.replaceAll('_', ' ')}</OrbitText>
            </View>
            <View style={styles.metrics}>
              <Metric
                value={`${String(Math.round(run.durationMs / 100) / 10)}s`}
                label="duration"
              />
              <Metric value={String(run.modelCalls.length)} label="model calls" />
              <Metric value={`${run.costCents.toFixed(2)}¢`} label="cost" />
            </View>
          </Card>
          {run.firstRunComparison === null ? null : (
            <Notice
              title={`${String(run.firstRunComparison.actionsSaved)} actions avoided`}
              detail={`${String(run.firstRunComparison.modelCallsSaved)} fewer model calls and ${String(Math.round(run.firstRunComparison.durationSavedMs / 1000))} seconds saved versus the first run.`}
              tone="blue"
            />
          )}
          <Card>
            <OrbitText variant="mono">STEPS</OrbitText>
            {run.steps.map((step, index) => (
              <View key={`${step.name}-${String(index)}`} style={styles.step}>
                <Icon name={step.status === 'succeeded' ? 'check' : 'clock'} size={19} />
                <View style={styles.flex}>
                  <OrbitText variant="label">{step.name}</OrbitText>
                  <OrbitText variant="caption">{step.detail}</OrbitText>
                </View>
                <OrbitText variant="caption">{String(step.durationMs)}ms</OrbitText>
              </View>
            ))}
          </Card>
          <Card>
            <OrbitText variant="mono">MODEL CALL LEDGER</OrbitText>
            {run.modelCalls.length === 0 ? (
              <OrbitText>No model call was needed.</OrbitText>
            ) : (
              run.modelCalls.map((call) => (
                <View key={call.id} style={styles.call}>
                  <View style={styles.flex}>
                    <OrbitText variant="label">{call.task}</OrbitText>
                    <OrbitText variant="caption">
                      {call.provider} · {call.model}
                    </OrbitText>
                  </View>
                  <OrbitText variant="caption">
                    {String(call.tokensIn + call.tokensOut)} tok · {call.costCents.toFixed(3)}¢
                  </OrbitText>
                </View>
              ))
            )}
          </Card>
        </>
      )}
      <Button label="Back" onPress={() => router.back()} kind="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between' },
  metrics: { flexDirection: 'row', gap: spacing.md },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  call: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
});
