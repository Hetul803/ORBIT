import { createHash } from 'node:crypto';

import type { Completer, PiiKind, RedactionResult } from './types.js';

interface RedactionRule {
  readonly kind: PiiKind;
  readonly pattern: RegExp;
}

const rules: readonly RedactionRule[] = [
  {
    kind: 'email',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
  },
  {
    kind: 'phone',
    pattern: /(?<!\d)(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)/gu,
  },
  {
    kind: 'social_handle',
    pattern: /(?<!\w)@[A-Z0-9_][A-Z0-9_.]{1,29}\b/giu,
  },
  {
    kind: 'street_address',
    pattern:
      /\b\d{1,6}\s+[A-Z0-9][A-Z0-9 .'-]{1,50}\s(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|way)\b/giu,
  },
  {
    kind: 'full_name',
    pattern:
      /\b(?:my (?:full|last) name is|I(?:'m| am))\s+[A-Z][a-z]{1,30}(?:\s+[A-Z][a-z]{1,30})+\b/giu,
  },
  {
    kind: 'employer',
    pattern: /\b(?:I work (?:at|for)|my employer is)\s+[A-Z][A-Za-z0-9& .'-]{2,60}\b/gu,
  },
  {
    kind: 'class_section',
    pattern: /\b(?:section|class)\s+[A-Z]{0,4}[- ]?\d{2,5}[A-Z]?\b/giu,
  },
  {
    kind: 'exact_schedule',
    pattern: /\b(?:at|from)\s+(?:[01]?\d|2[0-3]):[0-5]\d\s*(?:am|pm)?\b/giu,
  },
];

const replacementFor = (kind: PiiKind): string =>
  `[${kind.replaceAll('_', ' ').toUpperCase()} REDACTED]`;

export const regexRedact = (input: string): RedactionResult => {
  let redacted = input;
  const detected = new Set<PiiKind>();
  for (const rule of rules) {
    redacted = redacted.replace(rule.pattern, () => {
      detected.add(rule.kind);
      return replacementFor(rule.kind);
    });
  }
  const hiddenContactLanguage =
    /(?:spell(?:ed)? out|contact me|find me on|look me up|same username|digits are|number is)/iu.test(
      input,
    );
  return {
    passed: !hiddenContactLanguage,
    redacted,
    detected: [...detected],
    uncertain: hiddenContactLanguage,
  };
};

interface ModelRedactionPayload {
  readonly safe: boolean;
  readonly redacted: string;
  readonly uncertain: boolean;
  readonly flags: readonly string[];
}

const parseModelRedaction = (text: string): ModelRedactionPayload | null => {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (
      typeof candidate.safe !== 'boolean' ||
      typeof candidate.redacted !== 'string' ||
      typeof candidate.uncertain !== 'boolean' ||
      !Array.isArray(candidate.flags)
    ) {
      return null;
    }
    return {
      safe: candidate.safe,
      redacted: candidate.redacted,
      uncertain: candidate.uncertain,
      flags: candidate.flags.filter((flag): flag is string => typeof flag === 'string'),
    };
  } catch {
    return null;
  }
};

export const redactMessage = async (
  input: string,
  completer: Completer,
  context: { userId: string; runId: string; conversationId: string },
): Promise<RedactionResult> => {
  const regexResult = regexRedact(input);
  if (!regexResult.passed) return regexResult;
  const response = await completer.complete({
    task: 'redaction',
    messages: [
      {
        role: 'system',
        content:
          'Fail closed. Return JSON with safe, redacted, uncertain, flags. Remove surnames, phone numbers, email addresses, street addresses, social handles, employer names, exact class sections, and exact schedules. Do not infer replacements.',
      },
      { role: 'user', content: regexResult.redacted },
    ],
    constraints: { maxOutputTokens: 600, temperature: 0, jsonMode: true },
    ...context,
  });
  const modelResult = parseModelRedaction(response.text);
  if (modelResult === null || modelResult.uncertain || !modelResult.safe) {
    return {
      passed: false,
      redacted: '',
      detected: regexResult.detected,
      uncertain: true,
    };
  }
  const secondRegexPass = regexRedact(modelResult.redacted);
  return {
    passed: secondRegexPass.passed && !secondRegexPass.uncertain,
    redacted: secondRegexPass.redacted,
    detected: [...new Set([...regexResult.detected, ...secondRegexPass.detected])],
    uncertain: secondRegexPass.uncertain,
  };
};

export const hashOriginalMessage = (message: string): string =>
  createHash('sha256').update(message).digest('hex');
