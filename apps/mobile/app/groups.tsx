import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Button, Card, OrbitText, Pill, Screen } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, ErrorText, Field, Notice } from '@/components';

interface Group {
  id: string;
  kind: string;
  name: string;
  visibility: string;
  memberCount: number;
}

export default function Groups(): ReactNode {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['groups'], queryFn: () => api<Group[]>('/v1/groups') });
  const [code, setCode] = useState('ORBIT-DEMO');
  const [error, setError] = useState<string | null>(null);
  const join = async (): Promise<void> => {
    setError(null);
    try {
      await api('/v1/groups/join', jsonBody({ code }));
      await client.invalidateQueries({ queryKey: ['groups'] });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not join the group.');
    }
  };
  return (
    <Screen>
      <AppHeader
        title="Shared circles"
        subtitle="Campus, club, class, and lab spaces can share useful skills without exposing private memory."
      />
      <Notice
        title="Skills travel; private context does not"
        detail="Adopted group skills create a personal copy that stays inside your permissions and approval rules."
        tone="moss"
      />
      <Card>
        <Field label="Join code" value={code} onChangeText={setCode} autoCapitalize="characters" />
        <Button label="Join group" onPress={() => void join()} />
      </Card>
      {(query.data ?? []).map((group) => (
        <Card key={group.id}>
          <Pill tone="blue">
            {group.kind.toUpperCase()} · {group.visibility.toUpperCase()}
          </Pill>
          <OrbitText variant="title">{group.name}</OrbitText>
          <OrbitText>{group.memberCount} members</OrbitText>
          <Button
            label="Open skill shelf"
            onPress={() =>
              router.push({ pathname: '/group/[id]', params: { id: group.id, name: group.name } })
            }
            kind="secondary"
          />
        </Card>
      ))}
      {error === null ? null : <ErrorText message={error} />}
      <Button label="Back" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}
