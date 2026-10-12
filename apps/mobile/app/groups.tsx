import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Button, Card, OrbitText, Pill, Screen } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, EmptyState, ErrorText, Field, Notice, QueryError } from '@/components';

interface Group {
  id: string;
  kind: string;
  name: string;
  visibility: string;
  memberCount: number;
  role?: string;
  joinCode?: string;
}

export default function Groups(): ReactNode {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['groups'], queryFn: () => api<Group[]>('/v1/groups') });
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const join = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api('/v1/groups/join', jsonBody({ code }));
      await client.cancelQueries({ queryKey: ['groups'] });
      await client.invalidateQueries({ queryKey: ['groups'] });
      setMessage('You joined the group.');
      setCode('');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not join the group.');
    } finally {
      setBusy(false);
    }
  };
  const create = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const group = await api<Group>('/v1/groups', jsonBody({ name, kind: 'club' }));
      await client.cancelQueries({ queryKey: ['groups'] });
      client.setQueryData<Group[]>(['groups'], (current = []) => [
        ...current.filter((item) => item.id !== group.id),
        group,
      ]);
      await client.invalidateQueries({ queryKey: ['groups'] });
      setName('');
      setCreating(false);
      setMessage('Your private group is ready. Share its join code with people you choose.');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not create the group.');
    } finally {
      setBusy(false);
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
        <Button
          label="Join group"
          onPress={() => void join()}
          loading={busy}
          disabled={code.trim().length < 4}
        />
        <Button
          label="Create a group"
          kind="secondary"
          onPress={() => setCreating(!creating)}
          disabled={busy}
        />
        {creating ? (
          <>
            <Field
              label="Group name"
              value={name}
              onChangeText={setName}
              maxLength={80}
              placeholder="Weekend plans, your club, or a shared project"
            />
            <OrbitText variant="caption">
              Invite-only. Creating a group does not share your private memories.
            </OrbitText>
            <Button
              label="Create private group"
              onPress={() => void create()}
              loading={busy}
              disabled={name.trim().length < 2}
            />
          </>
        ) : null}
      </Card>
      {message === null ? null : <Notice title="Groups" detail={message} tone="moss" />}
      {query.isError ? (
        <QueryError message={query.error.message} onRetry={() => void query.refetch()} />
      ) : query.data?.length === 0 ? (
        <EmptyState
          title="No shared circles yet."
          detail="Create a private group or join one with an invite code."
        />
      ) : (
        (query.data ?? []).map((group) => (
          <Card key={group.id}>
            <Pill tone="blue">
              {group.kind.toUpperCase()} · {group.visibility.toUpperCase()}
            </Pill>
            <OrbitText variant="title">{group.name}</OrbitText>
            <OrbitText>{group.memberCount} members</OrbitText>
            {group.joinCode === undefined ? null : (
              <>
                <OrbitText variant="caption">Join code: {group.joinCode}</OrbitText>
                <Button
                  label="Copy join code"
                  kind="quiet"
                  onPress={() =>
                    void Clipboard.setStringAsync(group.joinCode ?? '')
                      .then(() => setMessage('Join code copied.'))
                      .catch(() => setError('Could not copy the code.'))
                  }
                />
              </>
            )}
            <Button
              label="Open skill shelf"
              onPress={() =>
                router.push({ pathname: '/group/[id]', params: { id: group.id, name: group.name } })
              }
              kind="secondary"
            />
          </Card>
        ))
      )}
      {error === null ? null : <ErrorText message={error} />}
      <Button label="Back" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}
