import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { Button, Card, OrbitText, Pill, Ring, Screen } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, EmptyState, ErrorText, Notice, QueryError } from '@/components';
import type { Skill } from '@/types';

interface AdoptionUpdate {
  id: string;
  sourceSkillId: string;
  sourceName: string;
  adoptedVersion: number;
  pendingVersion: number;
  currentDefinition: Record<string, unknown>;
  pendingDefinition: Record<string, unknown>;
  lineage: { sourceSkillId: string; ownerUserId: string };
}

export default function GroupShelf(): ReactNode {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['group-skills', id],
    queryFn: () => api<Skill[]>(`/v1/groups/${id}/skills`),
  });
  const updates = useQuery({
    queryKey: ['skill-adoption-updates', id],
    queryFn: () =>
      api<AdoptionUpdate[]>(`/v1/skill-adoptions/updates?groupId=${encodeURIComponent(id)}`),
  });
  const adopt = useMutation({
    mutationFn: (skillId: string) => api(`/v1/skills/${skillId}/adopt`, jsonBody({})),
    onSettled: () =>
      void Promise.all([
        client.invalidateQueries({ queryKey: ['skills'] }),
        client.invalidateQueries({ queryKey: ['skill-adoption-updates', id] }),
      ]),
  });
  const review = useMutation({
    mutationFn: ({ adoptionId, decision }: { adoptionId: string; decision: 'adopt' | 'dismiss' }) =>
      api(`/v1/skill-adoptions/${adoptionId}/review`, jsonBody({ decision })),
    onMutate: async ({ adoptionId }) => {
      await client.cancelQueries({ queryKey: ['skill-adoption-updates', id] });
      const previous = client.getQueryData<AdoptionUpdate[]>(['skill-adoption-updates', id]);
      client.setQueryData<AdoptionUpdate[]>(['skill-adoption-updates', id], (current = []) =>
        current.filter((update) => update.id !== adoptionId),
      );
      return { previous };
    },
    onError: (_error, _variables, context) =>
      client.setQueryData(['skill-adoption-updates', id], context?.previous),
    onSettled: () => void client.invalidateQueries({ queryKey: ['skill-adoption-updates', id] }),
  });
  return (
    <Screen>
      <AppHeader
        title={name ?? 'Skill shelf'}
        subtitle="Reusable group capabilities, ranked by evidence and adoption—not hype."
      />
      <Notice
        title="Review before propagation"
        detail="A source update never overwrites your adopted definition. You see its lineage and choose whether to adopt the new version."
        tone="blue"
      />
      <Button
        label="Publish a group skill"
        onPress={() => router.push({ pathname: '/skill/new', params: { groupId: id } })}
        kind="secondary"
      />
      {updates.isError ? (
        <QueryError message={updates.error.message} onRetry={() => void updates.refetch()} />
      ) : null}
      {(updates.data ?? []).map((update) => (
        <Card key={update.id} tone="rented">
          <Ring
            value={update.pendingVersion / Math.max(update.pendingVersion, update.adoptedVersion)}
            tone="rented"
            size={48}
            seed={update.sourceSkillId}
          />
          <Pill tone="rented">
            UPDATE · V{String(update.adoptedVersion)} → V{String(update.pendingVersion)}
          </Pill>
          <OrbitText variant="title">{update.sourceName}</OrbitText>
          <OrbitText variant="caption">Lineage: source {update.lineage.sourceSkillId}</OrbitText>
          <OrbitText>Proposed definition: {JSON.stringify(update.pendingDefinition)}</OrbitText>
          <Button
            label="Adopt this update"
            onPress={() => review.mutate({ adoptionId: update.id, decision: 'adopt' })}
            loading={review.isPending}
          />
          <Button
            label="Keep my current version"
            onPress={() => review.mutate({ adoptionId: update.id, decision: 'dismiss' })}
            kind="secondary"
          />
        </Card>
      ))}
      {query.isError ? (
        <QueryError message={query.error.message} onRetry={() => void query.refetch()} />
      ) : null}
      {!query.isPending && !query.isError && query.data.length === 0 ? (
        <EmptyState
          title="No shared skills yet."
          detail="Group admins can publish skills to this shelf."
        />
      ) : null}
      {(query.isError ? [] : (query.data ?? [])).map((skill) => (
        <Card key={skill.id}>
          <Pill tone="yours">
            V{String(skill.version)} · {String(Math.round(skill.confidence * 100))}%
          </Pill>
          <OrbitText variant="title">{skill.name}</OrbitText>
          <OrbitText>{skill.effect}</OrbitText>
          <Button
            label="Adopt with source lineage"
            onPress={() => adopt.mutate(skill.id)}
            loading={adopt.isPending}
            kind="secondary"
          />
        </Card>
      ))}
      {adopt.error === null ? null : <ErrorText message={adopt.error.message} />}
      {review.error === null ? null : <ErrorText message={review.error.message} />}
      <Button label="Back" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}
