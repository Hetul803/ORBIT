import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Button, Card, Screen } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, ErrorText, Field, Notice } from '@/components';

export default function NewExchangeItem(): ReactNode {
  const params = useLocalSearchParams<{ description?: string; direction?: string }>();
  const [direction, setDirection] = useState<'have' | 'want'>(
    params.direction === 'have' ? 'have' : 'want',
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState(params.description ?? '');
  const [category, setCategory] = useState('other');
  const [error, setError] = useState<string | null>(null);
  const save = async (): Promise<void> => {
    setError(null);
    try {
      await api(
        '/v1/exchange/items',
        jsonBody({
          direction,
          title,
          category,
          condition: null,
          description,
          priceLowCents: null,
          priceHighCents: null,
          willTradeFor: null,
          urgency: 'normal',
          active: true,
        }),
      );
      router.back();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not save the item.');
    }
  };
  return (
    <Screen>
      <AppHeader
        title="Add to your exchange"
        subtitle="Say what you have or need. Agents can negotiate fit and terms, never payment."
      />
      <Notice
        title="No payments"
        detail="ORBIT does not process money, hold funds, or charge transaction fees."
        tone="moss"
      />
      <Card>
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
        <Field label="Title" value={title} onChangeText={setTitle} />
        <Field label="Category" value={category} onChangeText={setCategory} />
        <Field label="Useful details" value={description} onChangeText={setDescription} multiline />
        <Button
          label="Save exchange intent"
          onPress={() => void save()}
          disabled={!title || !description}
        />
      </Card>
      {error === null ? null : <ErrorText message={error} />}
      <Button label="Cancel" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}
