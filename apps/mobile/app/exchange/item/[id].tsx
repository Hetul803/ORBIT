import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Card, OrbitText, Pill, Screen, spacing } from '@orbit/ui';

import { api, patchBody } from '@/api';
import { AppHeader, ErrorText, Field, QueryError } from '@/components';

interface ExchangeItem {
  id: string;
  title: string;
  description: string;
  category: string;
  direction: 'have' | 'want';
  condition: string | null;
  priceLowCents: number | null;
  priceHighCents: number | null;
  willTradeFor: string | null;
  urgency: 'low' | 'normal' | 'high';
  active: boolean;
}

export default function ExchangeItemEditor(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['exchange', 'items'],
    queryFn: () => api<ExchangeItem[]>('/v1/exchange/items'),
  });
  const item = query.data?.find((entry) => entry.id === id);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState('');
  const [priceLow, setPriceLow] = useState('');
  const [priceHigh, setPriceHigh] = useState('');
  const [willTradeFor, setWillTradeFor] = useState('');
  const [urgency, setUrgency] = useState<'low' | 'normal' | 'high'>('normal');
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (item === undefined) return;
    setTitle(item.title);
    setDescription(item.description);
    setCategory(item.category);
    setCondition(item.condition ?? '');
    setPriceLow(item.priceLowCents === null ? '' : String(item.priceLowCents / 100));
    setPriceHigh(item.priceHighCents === null ? '' : String(item.priceHighCents / 100));
    setWillTradeFor(item.willTradeFor ?? '');
    setUrgency(item.urgency);
  }, [item]);
  const cents = (value: string): number | null =>
    value.trim() === '' ? null : Math.round(Number(value) * 100);
  const update = useMutation({
    mutationFn: () =>
      api<ExchangeItem>(
        `/v1/exchange/items/${id}`,
        patchBody({
          title,
          description,
          category,
          condition: condition || null,
          priceLowCents: cents(priceLow),
          priceHighCents: cents(priceHigh),
          willTradeFor: willTradeFor || null,
          urgency,
        }),
      ),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: ['exchange', 'items'] });
      return { previous: client.getQueryData<ExchangeItem[]>(['exchange', 'items']) };
    },
    onError: (_error, _variables, context) =>
      client.setQueryData(['exchange', 'items'], context?.previous),
    onSuccess: (saved) =>
      client.setQueryData<ExchangeItem[]>(['exchange', 'items'], (current = []) =>
        current.map((entry) => (entry.id === saved.id ? saved : entry)),
      ),
  });
  const remove = useMutation({
    mutationFn: () => api(`/v1/exchange/items/${id}`, { method: 'DELETE' }),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: ['exchange', 'items'] });
      const previous = client.getQueryData<ExchangeItem[]>(['exchange', 'items']);
      client.setQueryData<ExchangeItem[]>(['exchange', 'items'], (current = []) =>
        current.filter((entry) => entry.id !== id),
      );
      return { previous };
    },
    onError: (_error, _variables, context) =>
      client.setQueryData(['exchange', 'items'], context?.previous),
    onSuccess: () => router.replace('/exchange'),
  });
  if (query.isError)
    return (
      <Screen>
        <AppHeader title="Exchange item" />
        <QueryError message={query.error.message} onRetry={() => void query.refetch()} />
      </Screen>
    );
  if (item === undefined)
    return (
      <Screen>
        <AppHeader title="Exchange item" />
        <Card>
          <OrbitText>{query.isPending ? 'Loading item…' : 'This item no longer exists.'}</OrbitText>
        </Card>
      </Screen>
    );
  return (
    <Screen>
      <AppHeader title={item.title} subtitle="Edit every matching boundary or remove the item." />
      <Card>
        <Pill>{item.direction.toUpperCase()}</Pill>
        <Field label="Title" value={title} onChangeText={setTitle} />
        <Field label="Category" value={category} onChangeText={setCategory} />
        <Field label="Condition" value={condition} onChangeText={setCondition} />
        <Field label="Details" value={description} onChangeText={setDescription} multiline />
        <Field
          label="Minimum ($)"
          value={priceLow}
          onChangeText={setPriceLow}
          keyboardType="decimal-pad"
        />
        <Field
          label="Maximum ($)"
          value={priceHigh}
          onChangeText={setPriceHigh}
          keyboardType="decimal-pad"
        />
        <Field label="Open to trade for" value={willTradeFor} onChangeText={setWillTradeFor} />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {(['low', 'normal', 'high'] as const).map((value) => (
            <Button
              key={value}
              label={value.toUpperCase()}
              kind={urgency === value ? 'primary' : 'secondary'}
              onPress={() => setUrgency(value)}
            />
          ))}
        </View>
        <Button label="Save changes" onPress={() => update.mutate()} loading={update.isPending} />
      </Card>
      {confirmDelete ? (
        <Card tone="alert">
          <OrbitText variant="title">Delete this exchange item?</OrbitText>
          <Button
            label="Yes, delete item"
            onPress={() => remove.mutate()}
            loading={remove.isPending}
            kind="danger"
          />
          <Button label="Keep item" onPress={() => setConfirmDelete(false)} kind="secondary" />
        </Card>
      ) : (
        <Button label="Delete item" onPress={() => setConfirmDelete(true)} kind="danger" />
      )}
      {update.error === null ? null : <ErrorText message={update.error.message} />}
      {remove.error === null ? null : <ErrorText message={remove.error.message} />}
      <Button label="Back" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}
