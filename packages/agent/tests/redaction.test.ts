import { describe, expect, it } from 'vitest';

import { redactMessage, regexRedact } from '../src/redaction.js';
import type { Completer } from '../src/types.js';

const passThroughModel: Completer = {
  complete: async (request) =>
    Promise.resolve({
      text: JSON.stringify({
        safe: true,
        redacted: request.messages.at(-1)?.content ?? '',
        uncertain: false,
        flags: [],
      }),
      provider: 'stub',
      model: 'stub-redaction-v1',
      tokensIn: 10,
      tokensOut: 10,
      latencyMs: 1,
      costCents: 0,
      usedFallback: false,
    }),
};

describe('privacy firewall', () => {
  it('removes direct contact information and identifying details', async () => {
    const result = await redactMessage(
      'My full name is Ada Lovelace, email ada@example.com, phone +1 312-555-0199. I work at Analytical Engines and live at 12 Oak Street.',
      passThroughModel,
      { userId: 'user-12345', runId: 'run-12345', conversationId: 'conversation-12345' },
    );
    expect(result.passed).toBe(true);
    expect(result.redacted).not.toContain('Ada Lovelace');
    expect(result.redacted).not.toContain('ada@example.com');
    expect(result.redacted).not.toContain('312-555-0199');
    expect(result.redacted).not.toContain('Analytical Engines');
    expect(result.redacted).not.toContain('12 Oak Street');
    expect(result.detected).toEqual(
      expect.arrayContaining(['full_name', 'email', 'phone', 'employer', 'street_address']),
    );
  });

  it('fails closed on evasive contact language', () => {
    const result = regexRedact('Find me on the photo app; it is the same username everywhere.');
    expect(result.passed).toBe(false);
    expect(result.uncertain).toBe(true);
    expect(result.failure).toEqual({
      category: 'evasive_contact_language',
      pattern: 'platform_lookup',
      source: 'regex',
    });
  });

  it('does not flag ordinary compatibility language', () => {
    const result = regexRedact(
      'I prefer quiet mornings, direct plans, and people who follow through.',
    );
    expect(result).toMatchObject({ passed: true, uncertain: false, detected: [] });
  });
});
