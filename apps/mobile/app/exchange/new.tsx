import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Card, Screen, spacing } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, ErrorText, Field, Notice } from '@/components';

export default function NewExchangeItem(): ReactNode {
  const params = useLocalSearchParams<{ description?: string; direction?: string }>();
  const [direction, setDirection] = useState<'have' | 'want'>(
    params.direction === 'have' ? 'have' : 'want',
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState(params.description ?? '');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState('');
  const [priceLow, setPriceLow] = useState('');
  const [priceHigh, setPriceHigh] = useState('');
  const [willTradeFor, setWillTradeFor] = useState('');
  const [urgency, setUrgency] = useState<'low' | 'normal' | 'high'>('normal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cents = (value: string): number | null => {
    const parsed = Number(value.replaceAll(',', ''));
    return value.trim().length === 0 || !Number.isFinite(parsed) ? null : Math.round(parsed * 100);
  };
  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api(
        '/v1/exchange/items',
        jsonBody({
          direction,
          title: title.trim(),
          category: category.trim(),
          condition: condition.trim() || null,
          description: description.trim(),
          priceLowCents: cents(priceLow),
          priceHighCents: cents(priceHigh),
          willTradeFor: willTradeFor.trim() || null,
          urgency,
          active: true,
        }),
      );
      router.replace('/exchange');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not save the item.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <AppHeader
        title="Add to your exchange"
        subtitle="Set enough structure for agents to negotiate fit without touching payment."
      />
      <Notice
        title="No payments"
        detail="ORBIT does not process money, hold funds, or charge transaction fees."
        tone="moss"
      />
      <Card>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button
            label="I need this"
            onPress={() => setDirection('want')}
            kind={direction === 'want' ? 'primary' : 'secondary'}
          />
          <Button
            label="I have this"
            onPress={() => setDirection('have')}
            kind={direction === 'have' ? 'primary' : 'secondary'}
          />
        </View>
        <Field label="Title" value={title} onChangeText={setTitle} />
        <Field label="Category" value={category} onChangeText={setCategory} />
        <Field
          label="Condition"
          value={condition}
          onChangeText={setCondition}
          placeholder="New, good, fair, not applicable…"
        />
        <Field label="Useful details" value={description} onChangeText={setDescription} multiline />
        <Field
          label="Minimum price / budget ($)"
          value={priceLow}
          onChangeText={setPriceLow}
          keyboardType="decimal-pad"
        />
        <Field
          label="Maximum price / budget ($)"
          value={priceHigh}
          onChangeText={setPriceHigh}
          keyboardType="decimal-pad"
        />
        <Field
          label="Open to trade for"
          value={willTradeFor}
          onChangeText={setWillTradeFor}
          multiline
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {(['low', 'normal', 'high'] as const).map((value) => (
            <Button
              key={value}
              label={`${value.toUpperCase()} URGENCY`}
              onPress={() => setUrgency(value)}
              kind={urgency === value ? 'primary' : 'secondary'}
            />
          ))}
        </View>
        <Button
          label="Save exchange intent"
          onPress={() => void save()}
          loading={busy}
          disabled={!title.trim() || !description.trim() || !category.trim()}
        />
      </Card>
      {error === null ? null : <ErrorText message={error} />}
      <Button label="Cancel" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}
