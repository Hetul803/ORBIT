import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Button, Card, Screen } from '@orbit/ui';

import { api, jsonBody } from '@/api';
import { AppHeader, ErrorText, Field, Notice } from '@/components';

export default function NewSkill(): ReactNode {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('');
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api(
        '/v1/skills',
        jsonBody({
          name,
          ...(groupId === undefined ? {} : { groupId }),
          autonomyPct: 0,
          definition: {
            trigger,
            steps: [
              {
                id: 'step-1',
                title: name,
                instruction,
                tool: null,
                requiresApproval: true,
                successCheck: 'The user confirms the expected result.',
              },
            ],
            rules: ['Never make an external write without approval.'],
            checks: ['The expected outcome is confirmed.'],
            permissions: [],
            fallback: 'Pause and ask when an input is unfamiliar.',
          },
        }),
      );
      router.back();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The skill could not be created.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <AppHeader
        title={groupId === undefined ? 'Create a teachable skill' : 'Publish a group skill'}
        subtitle={
          groupId === undefined
            ? 'Start narrow. ORBIT expands autonomy only after validated runs.'
            : 'Every member can adopt it. Future corrections arrive as reviewable versioned updates.'
        }
      />
      <Notice
        title="Draft first"
        detail="New skills begin at zero autonomy and cannot silently write to external tools."
        tone="moss"
      />
      <Card>
        <Field label="Skill name" value={name} onChangeText={setName} />
        <Field label="When should it run?" value={trigger} onChangeText={setTrigger} multiline />
        <Field
          label="What is the first proven step?"
          value={instruction}
          onChangeText={setInstruction}
          multiline
        />
        <Button
          label="Create draft skill"
          onPress={() => void create()}
          loading={busy}
          disabled={!name || !trigger || !instruction}
        />
      </Card>
      {error === null ? null : <ErrorText message={error} />}
      <Button label="Cancel" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}
