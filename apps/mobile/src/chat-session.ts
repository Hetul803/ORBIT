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
    busy: false,
    error: null,
  }));
export const resetChatOwner = (owner: string | null): void => {
  if (useChatSession.getState().owner === owner) return;
  clearChatSession();
  useChatSession.setState({ owner, context: 'personal' });
};
