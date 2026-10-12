import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { Button, Card, OrbitText, Screen } from '@orbit/ui';
import { api, patchBody } from '@/api';
import { AppHeader, ErrorText, Field, Notice, QueryError } from '@/components';
import { ownWritingExamples, parseWhatsAppText, type WritingMessage } from '@/voice-import';

interface Voice {
  tone: string[];
  sentenceStyle: string;
  vocabulary: string[];
  avoids: string[];
  examples: string[];
}

export default function TeachVoice(): ReactNode {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['agent'],
    queryFn: () => api<{ voiceProfile: Voice }>('/v1/agent'),
  });
  const [style, setStyle] = useState('');
  const [boundaries, setBoundaries] = useState('');
  const [examples, setExamples] = useState('');
  const [messages, setMessages] = useState<WritingMessage[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const loadedProfile = useRef(false);
  useEffect(() => {
    // A foreground refetch must not replace examples the owner is still reviewing.
    if (query.data === undefined || loadedProfile.current) return;
    loadedProfile.current = true;
    setStyle(query.data.voiceProfile.sentenceStyle);
    setBoundaries(query.data.voiceProfile.avoids.join('\n'));
    setExamples(query.data.voiceProfile.examples.join('\n\n'));
  }, [query.data]);
  const changed = (setter: (value: string) => void, value: string): void => {
    setter(value);
    setConfirmed(false);
    setSaved(false);
  };
  const pick = async (): Promise<void> => {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/plain',
        copyToCacheDirectory: true,
      });
      if (result.canceled || result.assets[0] === undefined) return;
      const asset = result.assets[0];
      let parsed: WritingMessage[];
      const validate = (): void => {
        if (!asset.name.toLowerCase().endsWith('.txt') || (asset.size ?? 0) > 100_000)
          throw new Error(
            'Choose a .txt file smaller than 100 KB. Unzip a WhatsApp export in Files first.',
          );
      };
      if (Platform.OS === 'web') {
        validate();
        if (asset.file === undefined || asset.file.size > 100_000)
          throw new Error('Choose a readable text export smaller than 100 KB.');
        parsed = parseWhatsAppText(await asset.file.text());
      } else {
        const file = new File(asset.uri);
        try {
          validate();
          if (file.size > 100_000) throw new Error('Choose a text export smaller than 100 KB.');
          parsed = parseWhatsAppText(await file.text());
        } finally {
          // Erase only the picker’s temporary copy, never the original selected file.
          if (file.exists && file.uri.startsWith(Paths.cache.uri)) file.delete();
        }
      }
      if (parsed.length === 0)
        throw new Error(
          'No chat messages were recognized. You can paste your own texts below instead.',
        );
      setMessages(parsed);
      setConfirmed(false);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not read this file.');
    }
  };
  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const samples = examples
        .split(/\n\s*\n/u)
        .map((value) => value.trim())
        .filter(Boolean);
      if (samples.length > 12 || samples.some((value) => value.length > 1000))
        throw new Error('Use at most 12 examples, each under 1,000 characters.');
      await api(
        '/v1/agent',
        patchBody({
          confirmVoiceProfile: confirmed,
          voiceProfile: {
            tone: query.data?.voiceProfile.tone ?? ['natural'],
            sentenceStyle: style.trim(),
            vocabulary: query.data?.voiceProfile.vocabulary ?? [],
            avoids: boundaries
              .split('\n')
              .map((value) => value.trim())
              .filter(Boolean),
            examples: samples,
          },
        }),
      );
      setMessages([]);
      setSaved(true);
      await client.invalidateQueries({ queryKey: ['agent'] });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Your voice could not be saved.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <AppHeader
        title="Make it sound like you"
        subtitle="Give your agent your voice—not access to everyone else’s conversations."
      />
      <Notice
        title="Only what you choose"
        detail="ORBIT cannot automatically read iPhone Messages or your personal WhatsApp inbox. Paste texts you wrote, or select a WhatsApp .txt export. Files are parsed on this device; only your selected, reviewed examples are saved. Remove private names and details before saving."
        tone="moss"
      />
      {query.isError ? (
        <QueryError message={query.error.message} onRetry={() => void query.refetch()} />
      ) : (
        <Card>
          <Field
            label="How should your agent sound?"
            value={style}
            maxLength={1000}
            onChangeText={(value) => changed(setStyle, value)}
            multiline
            placeholder="Short and warm. No corporate language. A little humor."
          />
          <Field
            label="Things it should never say or assume"
            value={boundaries}
            maxLength={3000}
            onChangeText={(value) => changed(setBoundaries, value)}
            multiline
          />
          <Button
            label="Choose WhatsApp text export"
            onPress={() => void pick()}
            kind="secondary"
            disabled={busy}
          />
          {messages.length === 0 ? null : (
            <>
              <OrbitText variant="label">Which participant is you?</OrbitText>
              {[...new Set(messages.map((message) => message.author))].map((author) => (
                <Button
                  key={author}
                  label={`Use only ${author}’s messages`}
                  kind="secondary"
                  onPress={() => {
                    changed(setExamples, ownWritingExamples(messages, author).join('\n\n'));
                    setMessages([]);
                  }}
                />
              ))}
            </>
          )}
          <Field
            label="Messages you wrote"
            value={examples}
            onChangeText={(value) => changed(setExamples, value)}
            multiline
            maxLength={12000}
            hint="Up to 12 examples, separated by blank lines. No passwords, secrets, or messages written by other people."
          />
          <Button
            label={
              confirmed
                ? 'Reviewed: these are my safe examples'
                : 'I reviewed these examples and they are mine'
            }
            kind={confirmed ? 'primary' : 'secondary'}
            onPress={() => setConfirmed(!confirmed)}
            disabled={busy}
          />
          <OrbitText variant="caption">
            Saving lets ORBIT use this profile in model-powered reasoning and drafts. It does not
            send messages for you, train a foundation model, or turn your agent into you.
          </OrbitText>
          <Button
            label="Save my voice"
            onPress={() => void save()}
            disabled={!confirmed || style.trim().length === 0 || query.isPending}
            loading={busy}
          />
        </Card>
      )}
      {saved ? (
        <Notice
          title="Your voice is saved"
          detail="You can revise or clear these examples here whenever you want."
          tone="moss"
        />
      ) : null}
      {error === null ? null : <ErrorText message={error} />}
    </Screen>
  );
}
