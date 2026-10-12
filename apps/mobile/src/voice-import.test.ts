import { describe, expect, it } from 'vitest';
import { ownWritingExamples, parseWhatsAppText } from './voice-import';

describe('local writing-example import', () => {
  it('selects only the named author from iPhone WhatsApp exports, including multiline text', () => {
    const messages = parseWhatsAppText(
      '[10/12/26, 5:00:00 PM] Me: Hey, a quiet coffee sounds good.\nMaybe Saturday?\n[10/12/26, 5:01:00 PM] Other: My private message\n[10/12/26, 5:02:00 PM] Messages are end-to-end encrypted.\n[10/12/26, 5:03:00 PM] Me: <Media omitted>',
    );
    expect(ownWritingExamples(messages, 'Me')).toEqual([
      'Hey, a quiet coffee sounds good.\nMaybe Saturday?',
    ]);
    expect(ownWritingExamples(messages, 'Not a participant')).toEqual([]);
  });
  it('parses Android exports and removes common contact/link details from selected text', () => {
    const messages = parseWhatsAppText(
      '12/10/2026, 17:00 - Me: Email person@example.com or https://example.com. Call +1 312 555 0199\n12/10/2026, 17:01 - Other: do not upload me',
    );
    expect(ownWritingExamples(messages, 'Me')).toEqual(['Email [email] or [link] Call [number]']);
  });
  it('bounds files, selected message count and individual examples', () => {
    expect(() => parseWhatsAppText('x'.repeat(100001))).toThrow(/100 KB/u);
    expect(
      ownWritingExamples(
        Array.from({ length: 20 }, () => ({ author: 'Me', text: 'x'.repeat(1200) })),
        'Me',
      ),
    ).toHaveLength(12);
    expect(ownWritingExamples([{ author: 'Me', text: 'x'.repeat(1200) }], 'Me')[0]).toHaveLength(
      1000,
    );
  });
});
