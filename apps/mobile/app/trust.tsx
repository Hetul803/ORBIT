import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Button, Card, OrbitText, Pill, Screen } from '@orbit/ui';

import { api, patchBody } from '@/api';
import { AppHeader, Notice } from '@/components';

type TrustMode = 'ask_first' | 'do_and_tell' | 'just_handle_it';
interface Agent {
  autonomyDefaults: Record<string, TrustMode>;
}

const modes: TrustMode[] = ['ask_first', 'do_and_tell', 'just_handle_it'];

export default function Trust(): ReactNode {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['agent'], queryFn: () => api<Agent>('/v1/agent') });
  const defaults = query.data?.autonomyDefaults ?? {
    introductions: 'ask_first',
    external_messages: 'ask_first',
    watchers: 'do_and_tell',
    private_analysis: 'just_handle_it',
  };
  const setMode = async (scope: string, mode: TrustMode): Promise<void> => {
    const previous = client.getQueryData<Agent>(['agent']);
    const next = { ...(previous?.autonomyDefaults ?? defaults), [scope]: mode };
    client.setQueryData<Agent>(['agent'], { autonomyDefaults: next });
    try {
      await api('/v1/agent', patchBody({ autonomyDefaults: next }));
    } catch {
      if (previous !== undefined) client.setQueryData(['agent'], previous);
    }
  };
  return (
    <Screen>
      <AppHeader
        title="Trust dials"
        subtitle="Set defaults by action class. Hard safety and approval rules always override these preferences."
      />
      <Notice
        title="External writes are special"
        detail="Messages, calendar edits, public posts, and commitments always require explicit approval, even if another dial is permissive."
        tone="ember"
      />
      {Object.entries(defaults).map(([scope, current]) => (
        <Card key={scope}>
          <Pill>{scope.replaceAll('_', ' ').toUpperCase()}</Pill>
          <OrbitText variant="title">{current.replaceAll('_', ' ')}</OrbitText>
          {modes.map((mode) => (
            <Button
              key={mode}
              label={mode.replaceAll('_', ' ')}
              onPress={() => void setMode(scope, mode)}
              kind={current === mode ? 'primary' : 'secondary'}
            />
          ))}
        </Card>
      ))}
      <Button label="Back" onPress={() => router.back()} kind="quiet" />
    </Screen>
  );
}
