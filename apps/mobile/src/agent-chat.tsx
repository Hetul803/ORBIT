import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';
import { router } from 'expo-router';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Button, Icon, OrbitText, Pill, Screen, spacing, useOrbitTheme } from '@orbit/ui';
import { api, jsonBody } from './api';
import { ErrorText } from './components';
import { clearChatSession, resetChatOwner, useChatSession, type ChatTurn } from './chat-session';
import { offlineScope } from './offline-scope';
import { useAuthStore } from './store';
import type { SourceCitation } from './types';
import { accountCaption } from './account-reference';

export const AgentChat = (): ReactNode => {
  const { colors } = useOrbitTheme();
  const token = useAuthStore((state) => state.accessToken);
  const owner = offlineScope(token) ?? token;
  useEffect(() => resetChatOwner(owner), [owner]);
  const session = useChatSession();
  const scroll = useRef<ScrollView>(null);
  const agent = useQuery({
    queryKey: ['agent'],
    queryFn: () => api<{ name: string; connectedContextAvailable?: boolean }>('/v1/agent'),
  });
  const accountContextAvailable = agent.data?.connectedContextAvailable === true;
  useEffect(() => {
    if (
      agent.data?.connectedContextAvailable === false &&
      useChatSession.getState().includeConnected
    )
      clearChatSession();
  }, [agent.data?.connectedContextAvailable]);
  const name = agent.data?.name ?? 'Your agent';
  const send = async (): Promise<void> => {
    const current = useChatSession.getState();
    const input = current.draft.trim();
    if (current.busy || input.length < 3 || !current.consent) return;
    const epoch = current.epoch;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const turn: ChatTurn = {
      id,
      role: 'user',
      content: input,
      context: current.includeConnected ? 'accounts' : 'personal',
    };
    useChatSession.setState({
      turns: [...current.turns, turn].slice(-24),
      draft: '',
      busy: true,
      error: null,
    });
    try {
      const history = current.turns
        .filter((t) => !t.failed && (current.includeConnected || t.context === 'personal'))
        .slice(-8)
        .map((t) => {
          const sources =
            t.sources ??
            current.turns.find((answer) => answer.id === t.id + '-reply')?.sources ??
            [];
          return {
            role: t.role,
            content: t.content.slice(0, 2000),
            context: t.context,
            connectionIds: [
              ...new Set(
                sources
                  .map((s) => s.connectionId)
                  .filter((id): id is string => typeof id === 'string'),
              ),
            ],
          };
        });
      const result = await api<{ answer: string; sources?: SourceCitation[] }>(
        '/v1/agent/chat',
        jsonBody({
          message: input,
          contextConsent: true,
          history,
          includeConnectedContext: current.includeConnected,
          connectedContextConsent: current.includeConnected,
        }),
      );
      const answer: ChatTurn = {
        id: id + '-reply',
        role: 'assistant',
        content: result.answer,
        context: current.includeConnected ? 'accounts' : 'personal',
        ...(result.sources ? { sources: result.sources } : {}),
      };
      if (
        useChatSession.getState().epoch !== epoch ||
        useChatSession.getState().owner !== current.owner
      )
        return;
      useChatSession.setState((state) => ({ turns: [...state.turns, answer].slice(-24) }));
    } catch (caught: unknown) {
      if (useChatSession.getState().epoch !== epoch) return;
      useChatSession.setState((state) => ({
        turns: state.turns.map((t) => (t.id === id ? { ...t, failed: true } : t)),
        draft: input,
        error: caught instanceof Error ? caught.message : 'Your agent could not reply. Try again.',
      }));
    } finally {
      if (useChatSession.getState().epoch === epoch) useChatSession.setState({ busy: false });
    }
  };
  if (session.owner !== owner) return null;
  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { borderBottomColor: colors.hairline }]}>
          <Icon name="person" size={30} color={colors.yours} />
          <View style={styles.flex}>
            <OrbitText variant="title">{name}</OrbitText>
            <OrbitText variant="caption">Here with you. Your context, your voice.</OrbitText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear this chat"
            onPress={clearChatSession}
            disabled={session.busy}
            style={styles.target}
          >
            <Icon name="trash" />
          </Pressable>
        </View>
        <ScrollView
          ref={scroll}
          style={styles.flex}
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        >
          {session.turns.length === 0 ? (
            <View style={styles.welcome}>
              <OrbitText variant="display">What’s on your mind?</OrbitText>
              <OrbitText>
                Talk naturally. Start with your day, a decision, or a message you want to get right.
              </OrbitText>
              {['Help me plan my week.', 'Draft a message in my voice.'].map((prompt) => (
                <Pressable
                  key={prompt}
                  accessibilityRole="button"
                  accessibilityLabel={`Use prompt: ${prompt}`}
                  onPress={() => useChatSession.setState({ draft: prompt })}
                  style={styles.suggestion}
                >
                  <Pill>{prompt}</Pill>
                </Pressable>
              ))}
            </View>
          ) : null}
          {session.turns.map((turn) => (
            <View
              key={turn.id}
              style={[
                styles.turn,
                turn.role === 'user'
                  ? [styles.user, { backgroundColor: colors.ink }]
                  : styles.agent,
              ]}
            >
              <OrbitText
                variant="caption"
                style={turn.role === 'user' ? { color: colors.surface } : { color: colors.yours }}
              >
                {turn.role === 'user' ? 'You' : name}

                {turn.failed ? ' · Not delivered' : ''}
              </OrbitText>
              <OrbitText
                selectable
                style={turn.role === 'user' ? { color: colors.surface } : undefined}
              >
                {turn.content}
              </OrbitText>
              {turn.sources?.map((source) => (
                <Pressable
                  key={source.sourceId}
                  accessibilityRole="link"
                  accessibilityLabel={`Open source: ${source.title}`}
                  onPress={() =>
                    void Linking.openURL(source.url).catch(() =>
                      useChatSession.setState({ error: 'Could not open this source.' }),
                    )
                  }
                  style={styles.source}
                >
                  <OrbitText variant="label">{source.title} ↗</OrbitText>
                  <OrbitText variant="caption">{accountCaption(source)}</OrbitText>
                  <OrbitText variant="caption">{source.quote}</OrbitText>
                </Pressable>
              ))}
            </View>
          ))}
          {session.busy ? (
            <View accessibilityLiveRegion="polite" style={styles.agent}>
              <OrbitText variant="label">{name} is thinking…</OrbitText>
            </View>
          ) : null}
        </ScrollView>
        <View
          style={[
            styles.composer,
            { borderTopColor: colors.hairline, backgroundColor: colors.ground },
          ]}
        >
          {!session.consent ? (
            <View style={{ gap: spacing.sm }}>
              <OrbitText variant="caption">
                Your saved memories, reviewed writing style and recent chat go to ORBIT’s reasoning
                provider.{' '}
                {accountContextAvailable
                  ? 'Connected summaries are optional.'
                  : 'Account-aware chat is not available yet.'}{' '}
                Clear the chat to change this choice.
              </OrbitText>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel="Include synced mail and calendar summaries"
                accessibilityState={{
                  checked: session.includeConnected,
                  disabled: !accountContextAvailable,
                }}
                disabled={!accountContextAvailable}
                onPress={() =>
                  useChatSession.setState({ includeConnected: !session.includeConnected })
                }
                style={styles.target}
              >
                <OrbitText variant="label">
                  {session.includeConnected ? '☑' : '☐'} Include my synced mail & calendar summaries
                </OrbitText>
              </Pressable>
              <Button
                label="Allow reviewed context for this chat"
                kind="quiet"
                onPress={() => useChatSession.setState({ consent: true })}
              />
            </View>
          ) : null}
          {session.error ? <ErrorText message={session.error} /> : null}
          <View
            style={[
              styles.inputRow,
              { borderColor: colors.hairlineStrong, backgroundColor: colors.surface },
            ]}
          >
            <TextInput
              accessibilityLabel="Message your agent"
              placeholder={`Message ${name}…`}
              placeholderTextColor={colors.inkFaint}
              value={session.draft}
              onChangeText={(draft) => useChatSession.setState({ draft })}
              multiline
              maxLength={2000}
              style={[styles.input, { color: colors.ink }]}
              editable={!session.busy}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send to my agent"
              accessibilityState={{
                disabled: session.busy || session.draft.trim().length < 3 || !session.consent,
              }}
              disabled={session.busy || session.draft.trim().length < 3 || !session.consent}
              onPress={() => void send()}
              style={[
                styles.send,
                {
                  backgroundColor: colors.ink,
                  opacity:
                    session.busy || session.draft.trim().length < 3 || !session.consent ? 0.35 : 1,
                },
              ]}
            >
              <Icon name="arrow" color={colors.surface} />
            </Pressable>
          </View>
          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open categorized inbox"
              onPress={() => router.push('/mail')}
              style={styles.target}
            >
              <OrbitText variant="caption">Your inbox ↗</OrbitText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Teach your agent"
              onPress={() => router.push('/voice')}
              style={styles.target}
            >
              <OrbitText variant="caption">Teach my voice ↗</OrbitText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
};
const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { paddingVertical: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  messages: { gap: spacing.md, paddingVertical: spacing.lg },
  welcome: { gap: spacing.md, paddingTop: spacing.xl },
  suggestion: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  turn: { gap: spacing.sm, maxWidth: '92%', padding: spacing.md },
  user: { alignSelf: 'flex-end', borderRadius: 18, borderBottomRightRadius: 4 },
  agent: { alignSelf: 'flex-start', paddingLeft: 0 },
  source: { minHeight: 44, paddingVertical: spacing.sm },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.sm, paddingTop: spacing.sm },
  inputRow: {
    borderWidth: 1,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.sm,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 130,
    fontSize: 16,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  send: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  target: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'space-between' },
});
