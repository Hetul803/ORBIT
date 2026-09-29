import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Button, Card, Screen } from '@orbit/ui';

import { api, patchBody } from '@/api';
import { AppHeader, ErrorText, Field, Notice } from '@/components';

export default function EditSkill(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [correction, setCorrection] = useState('');
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api(
        `/v1/skills/${id}`,
        patchBody({
          correction,
          revisedDefinition: {
            trigger: 'When the known task conditions are present.',
            steps: [
              {
                id: 'step-1',
                title: 'Apply the correction',
                instruction,
                tool: null,
                requiresApproval: true,
                successCheck: 'The corrected outcome is confirmed.',
              },
            ],
            rules: ['Never make an external write without approval.', correction],
            checks: ['The corrected outcome is confirmed.'],
            permissions: [],
            fallback: 'Pause and use general reasoning for unfamiliar inputs.',
          },
        }),
      );
      router.back();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The revision could not be saved.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <AppHeader
        title="Teach the correction"
        subtitle="The old version remains auditable. This creates a new version that must earn confidence again."
      />
      <Notice
        title="Correction-driven learning"
        detail="ORBIT lowers autonomy after a correction, replays the revised path, and raises confidence only from evidence."
        tone="ember"
      />
      <Card>
        <Field label="What went wrong?" value={correction} onChangeText={setCorrection} multiline />
        <Field
          label="What should happen instead?"
          value={instruction}
          onChangeText={setInstruction}
          multiline
        />
        <Button
          label="Create revised version"
          onPress={() => void save()}
          loading={busy}
          disabled={!correction || !instruction}
        />
      </Card>
      {error === null ? null : <ErrorText message={error} />}
      <Button label="Cancel" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}
