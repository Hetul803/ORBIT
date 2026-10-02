import { FlashList } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, OrbitText, Pill, Ring, Screen, spacing } from '@orbit/ui';

import { api } from '@/api';
import { AppHeader, EmptyState, ErrorText, Field, QueryError } from '@/components';

const intentKinds = [
  'dating',
  'friendship',
  'roommate',
  'cofounder',
  'study_partner',
  'gym_partner',
  'mentor',
  'hiring',
  'exchange',
] as const;

type IntentKind = (typeof intentKinds)[number];

interface Intent {
  id: string;
  kind: IntentKind;
  active: boolean;
  params: Record<string, unknown>;
  pausedUntil: string | null;
  updatedAt: string;
}

interface Activity {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  createdAt: string;
}

interface ActivityPage {
  items: Activity[];
}

const title = (kind: IntentKind): string => kind.replaceAll('_', ' ');

const IntentEditor = ({ intent }: { intent: Intent }): ReactNode => {
  const client = useQueryClient();
  const [goal, setGoal] = useState(
    typeof intent.params.goal === 'string' ? intent.params.goal : '',
  );
  const [constraints, setConstraints] = useState(
    typeof intent.params.constraints === 'string' ? intent.params.constraints : '',
  );
  const [pausedUntil, setPausedUntil] = useState(intent.pausedUntil?.slice(0, 10) ?? '');

  useEffect(() => {
    setGoal(typeof intent.params.goal === 'string' ? intent.params.goal : '');
    setConstraints(typeof intent.params.constraints === 'string' ? intent.params.constraints : '');
    setPausedUntil(intent.pausedUntil?.slice(0, 10) ?? '');
  }, [intent]);

  const mutation = useMutation({
    mutationFn: (next: Intent) =>
      api<Intent>(`/v1/intents/${intent.kind}`, {
        method: 'PUT',
        body: JSON.stringify({
          active: next.active,
          params: next.params,
          pausedUntil: next.pausedUntil,
        }),
      }),
    onMutate: async (next) => {
      await client.cancelQueries({ queryKey: ['intents'] });
      const previous = client.getQueryData<Intent[]>(['intents']);
      client.setQueryData<Intent[]>(['intents'], (current = []) =>
        current.map((item) => (item.kind === next.kind ? next : item)),
      );
      return { previous };
    },
    onError: (_error, _next, context) => client.setQueryData(['intents'], context?.previous),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['intents'] }),
        client.invalidateQueries({ queryKey: ['activity'] }),
      ]);
    },
  });

  const save = (active = intent.active): void => {
    const pause = pausedUntil.trim();
    mutation.mutate({
      ...intent,
      active,
      params: { ...intent.params, goal: goal.trim(), constraints: constraints.trim() },
      pausedUntil: pause.length === 0 ? null : new Date(`${pause}T23:59:59.000Z`).toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <Card tone={intent.active ? 'yours' : 'paper'}>
      <View style={styles.intentTop}>
        <View style={styles.intentTitle}>
          <Ring value={intent.active ? 1 : 0} tone="yours" size={42} seed={intent.kind} />
          <View>
            <OrbitText variant="title" style={styles.capitalize}>
              {title(intent.kind)}
            </OrbitText>
            <OrbitText variant="caption">
              Updated {new Date(intent.updatedAt).toLocaleString()}
            </OrbitText>
          </View>
        </View>
        <Pill tone={intent.active ? 'yours' : 'neutral'}>
          {intent.active ? 'ACTIVE' : 'PAUSED'}
        </Pill>
      </View>
      <Field
        label="What should your agent look for?"
        value={goal}
        onChangeText={setGoal}
        multiline
      />
      <Field
        label="Constraints or dealbreakers"
        value={constraints}
        onChangeText={setConstraints}
        multiline
      />
      <Field
        label="Pause until"
        value={pausedUntil}
        onChangeText={setPausedUntil}
        placeholder="YYYY-MM-DD or leave empty"
        hint="A date pauses matching through the end of that day."
      />
      <View style={styles.actions}>
        <Button label="Save details" onPress={() => save()} loading={mutation.isPending} />
        <Button
          label={intent.active ? 'Pause intent' : 'Activate intent'}
          kind="secondary"
          onPress={() => save(!intent.active)}
          loading={mutation.isPending}
        />
      </View>
      {mutation.error === null ? null : <ErrorText message={mutation.error.message} />}
    </Card>
  );
};

export default function Intents(): ReactNode {
  const intents = useQuery({ queryKey: ['intents'], queryFn: () => api<Intent[]>('/v1/intents') });
  const activity = useQuery({
    queryKey: ['activity'],
    queryFn: () => api<ActivityPage>('/v1/activity?limit=100'),
  });
  const records = intentKinds.map((kind) => {
    const existing = intents.data?.find((intent) => intent.kind === kind);
    return (
      existing ?? {
        id: `new-${kind}`,
        kind,
        active: false,
        params: {},
        pausedUntil: null,
        updatedAt: new Date(0).toISOString(),
      }
    );
  });
  const events = (activity.data?.items ?? [])
    .filter((event) => event.targetType === 'Intent')
    .slice(0, 10);

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <FlashList
        data={intents.isError ? [] : records}
        keyExtractor={(intent) => intent.kind}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <AppHeader
              title="Active intents"
              subtitle="Tell your agent what to look for, set boundaries, and pause matching without deleting context."
            />
            {intents.isError ? (
              <QueryError message={intents.error.message} onRetry={() => void intents.refetch()} />
            ) : null}
          </View>
        }
        renderItem={({ item }) => <IntentEditor intent={item} />}
        ListFooterComponent={
          <View style={styles.footer}>
            <OrbitText variant="title">Recent intent activity</OrbitText>
            {activity.isError ? (
              <QueryError
                message={activity.error.message}
                onRetry={() => void activity.refetch()}
              />
            ) : events.length === 0 ? (
              <EmptyState
                title="No intent changes yet."
                detail="Activations, pauses, and edits will appear here."
              />
            ) : (
              <Card>
                {events.map((event) => (
                  <View key={event.id} style={styles.activityRow}>
                    <OrbitText variant="label">{event.action.replaceAll('.', ' ')}</OrbitText>
                    <OrbitText variant="caption">
                      {new Date(event.createdAt).toLocaleString()}
                    </OrbitText>
                  </View>
                ))}
              </Card>
            )}
            <Button label="Back" kind="quiet" onPress={() => router.back()} />
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
  footer: { gap: spacing.lg, paddingTop: spacing.xl },
  separator: { height: spacing.md },
  intentTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  intentTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  activityRow: { paddingVertical: spacing.sm, gap: spacing.xs },
  capitalize: { textTransform: 'capitalize' },
});
