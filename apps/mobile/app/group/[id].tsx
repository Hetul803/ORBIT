import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { Button, Card, OrbitText, Pill, Screen } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, Notice } from '@/components';
import type { Skill } from '@/types';

export default function GroupShelf(): ReactNode {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const query = useQuery({
    queryKey: ['group-skills', id],
    queryFn: () => api<Skill[]>(`/v1/groups/${id}/skills`),
  });
  return (
    <Screen>
      <AppHeader
        title={name ?? 'Skill shelf'}
        subtitle="Reusable group capabilities, ranked by evidence and adoption—not hype."
      />
      <Notice
        title="No skill marketplace payments"
        detail="Group sharing is free. Skills carry definitions and evidence, never a stranger’s private memory."
        tone="blue"
      />
      {(query.data ?? []).map((skill) => (
        <Card key={skill.id}>
          <Pill tone="moss">
            V{String(skill.version)} · {String(Math.round(skill.confidence * 100))}%
          </Pill>
          <OrbitText variant="title">{skill.name}</OrbitText>
          <OrbitText>{skill.effect}</OrbitText>
          <Button
            label="Adopt a personal copy"
            onPress={() => void api(`/v1/skills/${skill.id}/adopt`, jsonBody({}))}
            kind="secondary"
          />
        </Card>
      ))}
      <Button label="Back" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}
