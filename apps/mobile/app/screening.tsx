import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Card, OrbitText, Pill, Screen, spacing } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, EmptyState, ErrorText, Field, Notice, QueryError } from '@/components';

type Action = 'allow' | 'hold' | 'decline';

interface Rule {
  id: string;
  matchOn: Record<string, unknown>;
  action: Action;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

interface Preview {
  id: string;
  subject: string;
  from: string;
  currentTriage: string;
  matches: boolean;
  result: Action | 'unchanged';
}

export default function Screening(): ReactNode {
  const client = useQueryClient();
  const rules = useQuery({
    queryKey: ['screening-rules'],
    queryFn: () => api<Rule[]>('/v1/screening-rules'),
  });
  const [id, setId] = useState(`rule-${String(Date.now())}`);
  const [from, setFrom] = useState('');
  const [subjectIncludes, setSubjectIncludes] = useState('');
  const [action, setAction] = useState<Action>('hold');
  const [priority, setPriority] = useState('100');
  const [preview, setPreview] = useState<Preview[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const body = (): { matchOn: Record<string, unknown>; action: Action; priority: number } => ({
    matchOn: {
      ...(from.trim().length === 0 ? {} : { from: from.trim() }),
      ...(subjectIncludes.trim().length === 0 ? {} : { subjectIncludes: subjectIncludes.trim() }),
    },
    action,
    priority: Math.max(0, Math.min(1_000, Number(priority) || 0)),
  });

  const save = useMutation({
    mutationFn: () =>
      api<Rule>(`/v1/screening-rules/${id}`, { method: 'PUT', body: JSON.stringify(body()) }),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: ['screening-rules'] });
      return { previous: client.getQueryData<Rule[]>(['screening-rules']) };
    },
    onError: (_error, _variables, context) =>
      client.setQueryData(['screening-rules'], context?.previous),
    onSuccess: (saved) =>
      client.setQueryData<Rule[]>(['screening-rules'], (current = []) =>
        [...current.filter((rule) => rule.id !== saved.id), saved].toSorted(
          (left, right) => left.priority - right.priority,
        ),
      ),
  });
  const remove = useMutation({
    mutationFn: () => api(`/v1/screening-rules/${id}`, { method: 'DELETE' }),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: ['screening-rules'] });
      const previous = client.getQueryData<Rule[]>(['screening-rules']);
      client.setQueryData<Rule[]>(['screening-rules'], (current = []) =>
        current.filter((rule) => rule.id !== id),
      );
      return { previous };
    },
    onError: (_error, _variables, context) =>
      client.setQueryData(['screening-rules'], context?.previous),
    onSuccess: () => {
      setConfirmDelete(false);
      setId(`rule-${String(Date.now())}`);
      setFrom('');
      setSubjectIncludes('');
      setAction('hold');
      setPriority('100');
    },
  });
  const runPreview = async (): Promise<void> => {
    setPreview(await api<Preview[]>('/v1/screening-rules/preview', jsonBody(body())));
  };
  const edit = (rule: Rule): void => {
    setId(rule.id);
    setFrom(typeof rule.matchOn.from === 'string' ? rule.matchOn.from : '');
    setSubjectIncludes(
      typeof rule.matchOn.subjectIncludes === 'string' ? rule.matchOn.subjectIncludes : '',
    );
    setAction(rule.action);
    setPriority(String(rule.priority));
    setPreview(null);
    setConfirmDelete(false);
  };

  return (
    <Screen>
      <AppHeader
        title="Screening rules"
        subtitle="Route real inbox items consistently, then preview the effect before saving."
      />
      <Notice
        title="Priority wins"
        detail="Lower numbers run first. A rule can escalate for review, hold quietly, or decline automatically."
        tone="moss"
      />
      {rules.isError ? (
        <QueryError message={rules.error.message} onRetry={() => void rules.refetch()} />
      ) : null}
      <Card>
        <OrbitText variant="title">
          {rules.data?.some((rule) => rule.id === id) === true ? 'Edit rule' : 'New rule'}
        </OrbitText>
        <Field
          label="Sender contains"
          value={from}
          onChangeText={setFrom}
          placeholder="@company.com or a sender"
        />
        <Field
          label="Subject contains"
          value={subjectIncludes}
          onChangeText={setSubjectIncludes}
          placeholder="invoice, interview, urgent…"
        />
        <Field
          label="Priority"
          value={priority}
          onChangeText={setPriority}
          keyboardType="number-pad"
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {(['allow', 'hold', 'decline'] as const).map((value) => (
            <Button
              key={value}
              label={value.toUpperCase()}
              kind={action === value ? 'primary' : 'secondary'}
              onPress={() => setAction(value)}
            />
          ))}
        </View>
        <Button
          label="Preview on last 10 items"
          onPress={() => void runPreview()}
          kind="secondary"
        />
        <Button
          label="Save rule"
          onPress={() => save.mutate()}
          loading={save.isPending}
          disabled={from.trim().length === 0 && subjectIncludes.trim().length === 0}
        />
        {rules.data?.some((rule) => rule.id === id) === true ? (
          confirmDelete ? (
            <>
              <OrbitText variant="label">Delete this rule?</OrbitText>
              <Button
                label="Yes, delete rule"
                onPress={() => remove.mutate()}
                kind="danger"
                loading={remove.isPending}
              />
              <Button label="Keep rule" onPress={() => setConfirmDelete(false)} kind="secondary" />
            </>
          ) : (
            <Button label="Delete rule" onPress={() => setConfirmDelete(true)} kind="danger" />
          )
        ) : null}
        {save.error === null ? null : <ErrorText message={save.error.message} />}
        {remove.error === null ? null : <ErrorText message={remove.error.message} />}
      </Card>
      {preview === null ? null : (
        <Card tone="rented">
          <OrbitText variant="title">Last 10 inbox items</OrbitText>
          {preview.length === 0 ? (
            <OrbitText>No inbox items exist yet.</OrbitText>
          ) : (
            preview.map((item) => (
              <View key={item.id}>
                <Pill tone={item.matches ? 'rented' : 'neutral'}>{item.result.toUpperCase()}</Pill>
                <OrbitText variant="label">{item.subject}</OrbitText>
                <OrbitText variant="caption">
                  {item.from || 'Unknown sender'} · currently {item.currentTriage}
                </OrbitText>
              </View>
            ))
          )}
        </Card>
      )}
      <OrbitText variant="title">Saved rules</OrbitText>
      {rules.isPending ? (
        <Card>
          <OrbitText>Loading rules…</OrbitText>
        </Card>
      ) : rules.data?.length === 0 ? (
        <EmptyState
          title="No screening rules."
          detail="New messages remain held for review until you add a rule."
        />
      ) : (
        (rules.data ?? []).map((rule) => (
          <Card key={rule.id}>
            <Pill
              tone={
                rule.action === 'allow' ? 'yours' : rule.action === 'decline' ? 'alert' : 'rented'
              }
            >
              {rule.action.toUpperCase()} · PRIORITY {String(rule.priority)}
            </Pill>
            <OrbitText>{JSON.stringify(rule.matchOn)}</OrbitText>
            <Button label="Edit rule" kind="secondary" onPress={() => edit(rule)} />
          </Card>
        ))
      )}
      <Button label="Back" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}
