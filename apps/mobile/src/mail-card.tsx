import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Linking, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button, Card, OrbitText, Pill, spacing } from '@orbit/ui';
import { api, jsonBody } from './api';
import { ErrorText, Field } from './components';
import { AccountBadge, type AccountReference } from './account-reference';
export interface ActionMail extends AccountReference {
  id: string;
  title: string;
  sender: string | null;
  occurredAt: string | null;
  sourceUrl: string;
  category: string;
  actions: string[];
  draft: string | null;
  inboxId?: string | null;
  reviewedAt?: string | null;
}
export const actionLabels: Record<string, string> = {
  needs_reply: 'Needs reply',
  reply_ready: 'Reply ready',
  receipts: 'Receipts & purchases',
  subscriptions: 'Subscriptions',
};
export const MailCard = ({
  item,
  draftingAvailable = false,
}: {
  item: ActionMail;
  draftingAvailable?: boolean;
}) => {
  const client = useQueryClient();
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [inboxId, setInboxId] = useState(item.inboxId ?? null);
  const [reviewed, setReviewed] = useState(!!item.reviewedAt);
  const current = draft ?? item.draft;
  const prepare = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ draft: string; sent: false; inboxId: string }>(
        '/v1/mail/' + item.id + '/draft',
        jsonBody({ contextConsent: true }),
      );
      setDraft(result.draft);
      setInboxId(result.inboxId);
      setReview(false);
      for (const key of [['mail'], ['inbox'], ['life', 'catch']])
        void client.invalidateQueries({ queryKey: key });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare this draft.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <AccountBadge account={item} />
        <Pill>
          {item.actions
            .map((a) => actionLabels[a])
            .filter(Boolean)
            .join(' · ') || item.category.toUpperCase()}
        </Pill>
        <OrbitText variant="title">{item.title}</OrbitText>
        <OrbitText>{item.sender ?? 'Unknown sender'}</OrbitText>
        <OrbitText variant="caption">
          {item.occurredAt ? new Date(item.occurredAt).toLocaleDateString() : 'Date unavailable'}
        </OrbitText>
        <Button
          label="Open original email"
          kind="quiet"
          onPress={() =>
            void Linking.openURL(item.sourceUrl).catch(() =>
              setError('Could not open the original email.'),
            )
          }
        />
        {current ? (
          <>
            <Field
              label="Your reply draft"
              value={current}
              onChangeText={(value) => {
                setDraft(value);
                setCopied(false);
              }}
              editable={!reviewed}
              multiline
            />
            <OrbitText variant="caption">
              Review the facts and wording. Nothing has been sent.
            </OrbitText>
            <Button
              label={copied ? 'Draft copied' : 'Copy reviewed draft'}
              onPress={() =>
                void Clipboard.setStringAsync(current)
                  .then(() => setCopied(true))
                  .catch(() => setError('Could not copy the draft.'))
              }
            />
            {inboxId && !reviewed ? (
              <Button
                label="Mark this draft reviewed"
                disabled={busy}
                loading={busy}
                onPress={() =>
                  void (async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      await api(
                        '/v1/inbox/' + inboxId + '/approve',
                        jsonBody({ editedReply: current }),
                      );
                      setReviewed(true);
                      void client.invalidateQueries({ queryKey: ['mail'] });
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Could not save your review.');
                    } finally {
                      setBusy(false);
                    }
                  })()
                }
              />
            ) : reviewed ? (
              <OrbitText variant="caption">Review saved for this account. Not sent.</OrbitText>
            ) : null}
          </>
        ) : item.actions.includes('needs_reply') ? (
          draftingAvailable ? (
            <Button label="Draft a reply" disabled={busy} onPress={() => setReview(true)} />
          ) : (
            <OrbitText variant="caption">
              Reply drafting is not available yet. You can still open the original email.
            </OrbitText>
          )
        ) : null}
        {review && !current ? (
          <>
            <OrbitText>
              The original email text (up to 8,000 characters) and your reviewed writing style will
              go to ORBIT’s reasoning provider to prepare this draft. The original body is not saved
              by ORBIT. Review the result yourself; sending is disabled.
            </OrbitText>
            <Button
              label="Allow email context and prepare draft"
              disabled={busy}
              loading={busy}
              onPress={() => void prepare()}
            />
            <Button label="Not now" disabled={busy} kind="quiet" onPress={() => setReview(false)} />
          </>
        ) : null}
        {error ? <ErrorText message={error} /> : null}
      </View>
    </Card>
  );
};
