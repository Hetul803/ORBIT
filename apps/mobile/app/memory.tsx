import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Button, Card, OrbitText, Pill, Screen } from '@orbit/ui';

import { api, patchBody } from '@/api';
import { AppHeader, Field, Notice } from '@/components';

interface MemoryFact {
  id: string;
  kind: string;
  content: string;
  confidence: number;
  source: string;
  userEditedAt: string | null;
  createdAt: string;
}

const Fact = ({ fact }: { fact: MemoryFact }): ReactNode => {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(fact.content);
  const update = useMutation({
    mutationFn: () => api(`/v1/agent/memory/${fact.id}`, patchBody({ content })),
    onSuccess: () => {
      setEditing(false);
      void client.invalidateQueries({ queryKey: ['memory'] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/v1/agent/memory/${fact.id}`, { method: 'DELETE' }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['memory'] }),
  });
  return (
    <Card>
      <Pill tone={fact.userEditedAt === null ? 'blue' : 'moss'}>
        {fact.kind.toUpperCase()} · {Math.round(fact.confidence * 100)}%
      </Pill>
      {editing ? (
        <Field label="Correct the memory" value={content} onChangeText={setContent} multiline />
      ) : (
        <OrbitText variant="title">{fact.content}</OrbitText>
      )}
      <OrbitText variant="caption">
        Learned from {fact.source}.{' '}
        {fact.userEditedAt === null ? 'Agent-proposed.' : 'You corrected this.'}
      </OrbitText>
      {editing ? (
        <>
          <Button
            label="Save correction"
            onPress={() => update.mutate()}
            loading={update.isPending}
          />
          <Button label="Cancel" onPress={() => setEditing(false)} kind="quiet" />
        </>
      ) : (
        <>
          <Button label="Correct" onPress={() => setEditing(true)} kind="secondary" />
          <Button label="Forget" onPress={() => remove.mutate()} kind="quiet" />
        </>
      )}
    </Card>
  );
};

export default function Memory(): ReactNode {
  const query = useQuery({
    queryKey: ['memory'],
    queryFn: () => api<MemoryFact[]>('/v1/agent/memory'),
  });
  return (
    <Screen>
      <AppHeader
        title="Agent memory"
        subtitle="Nothing is buried. Inspect, correct, or remove every durable fact."
      />
      <Notice
        title="Corrections outrank inference"
        detail="A fact you edit is marked as user-authored and consolidation will not silently replace it."
        tone="moss"
      />
      {(query.data ?? []).map((fact) => (
        <Fact key={fact.id} fact={fact} />
      ))}
      <Button label="Back" onPress={() => router.back()} kind="secondary" />
    </Screen>
  );
}
