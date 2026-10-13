import { create } from 'zustand';
import type { SourceCitation } from './types';

export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  context: 'personal' | 'accounts';
  sources?: SourceCitation[];
  failed?: boolean;
}
interface ChatSession {
  owner: string | null;
  epoch: number;
  turns: ChatTurn[];
  draft: string;
  consent: boolean;
  includeConnected: boolean;
  busy: boolean;
  error: string | null;
  context: 'personal' | 'accounts';
}
export const useChatSession = create<ChatSession>(() => ({
  owner: null,
  epoch: 0,
  turns: [],
  draft: '',
  consent: false,
  includeConnected: false,
  busy: false,
  error: null,
  context: 'personal',
}));
export const clearChatSession = (): void =>
  useChatSession.setState((state) => ({
    owner: state.owner,
    epoch: state.epoch + 1,
    turns: [],
    draft: '',
    consent: false,
    includeConnected: false,
    busy: false,
    error: null,
  }));
export const resetChatOwner = (owner: string | null): void => {
  if (useChatSession.getState().owner === owner) return;
  clearChatSession();
  useChatSession.setState({ owner, context: 'personal' });
};
/** Remove the affected context and its paired question; unrelated personal/account turns survive. */
export const invalidateDisconnectedAccountChat = (connectionId: string): void => {
  const state = useChatSession.getState();
  const affected = new Set(
    state.turns
      .filter(
        (t) =>
          t.context === 'accounts' &&
          t.role === 'assistant' &&
          (!t.sources?.length ||
            t.sources.some((s) => s.connectionId === connectionId || s.connectionId == null)),
      )
      .map((t) => t.id.replace(/-reply$/u, '')),
  );
  if (state.busy)
    for (const turn of state.turns)
      if (
        turn.context === 'accounts' &&
        turn.role === 'user' &&
        !state.turns.some((t) => t.id === turn.id + '-reply')
      )
        affected.add(turn.id);
  if (!affected.size) return;
  useChatSession.setState({
    turns: state.turns.filter((t) => !affected.has(t.id.replace(/-reply$/u, ''))),
    epoch: state.epoch + 1,
    busy: false,
    error: null,
  });
};
