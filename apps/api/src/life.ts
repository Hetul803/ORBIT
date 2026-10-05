import {
  LifeItemKind,
  LifeItemStatus,
  SourceDocumentDirection,
  SourceDocumentKind,
  type Prisma,
} from '@orbit/db';

import type { Services } from './services.js';

export interface SourceCitation {
  readonly sourceId: string;
  readonly kind: 'email' | 'calendar';
  readonly title: string;
  readonly url: string;
  readonly quote: string;
  readonly occurredAt: string | null;
}

interface SourceDocumentView {
  readonly id: string;
  readonly kind: SourceDocumentKind;
  readonly direction: SourceDocumentDirection;
  readonly threadId: string | null;
  readonly sourceUrl: string;
  readonly title: string;
  readonly sender: string | null;
  readonly recipients: string | null;
  readonly occurredAt: Date | null;
  readonly body: string;
  readonly metadata: unknown;
}

interface ProposedLifeItem {
  readonly kind: LifeItemKind;
  readonly stableKey: string;
  readonly title: string;
  readonly detail: string;
  readonly confidence: number;
  readonly dueAt?: Date;
  readonly evidence: readonly SourceCitation[];
  readonly draftForSource?: SourceDocumentView;
}

const sourceToCitation = (source: SourceDocumentView, quote: string): SourceCitation => ({
  sourceId: source.id,
  kind: source.kind === SourceDocumentKind.GMAIL_MESSAGE ? 'email' : 'calendar',
  title: source.title,
  url: source.sourceUrl,
  quote: quote.slice(0, 360),
  occurredAt: source.occurredAt?.toISOString() ?? null,
});

const shortQuote = (text: string): string => text.replaceAll(/\s+/gu, ' ').trim().slice(0, 280);

const messageNeedsReply = (source: SourceDocumentView): boolean => {
  if (source.direction !== SourceDocumentDirection.INBOUND) return false;
  const value = `${source.title}\n${source.body}`.toLowerCase();
  return /\?|\b(?:could you|can you|please|let me know|would you|are you able)\b/u.test(value);
};

const automatedSender = (source: SourceDocumentView): boolean =>
  /(?:no-?reply|noreply|mailer-daemon|notifications?@)/iu.test(source.sender ?? '');

const ageInDays = (value: Date | null, now: Date): number =>
  value === null ? 0 : Math.floor((now.getTime() - value.getTime()) / 86_400_000);

const threadKey = (source: SourceDocumentView): string => source.threadId ?? source.id;

const lifeItemCandidate = (
  source: SourceDocumentView,
  sourceByThread: ReadonlyMap<string, readonly SourceDocumentView[]>,
  now: Date,
): ProposedLifeItem | null => {
  const thread = sourceByThread.get(threadKey(source)) ?? [source];
  const ordered = [...thread].sort(
    (left, right) => (left.occurredAt?.getTime() ?? 0) - (right.occurredAt?.getTime() ?? 0),
  );
  const latest = ordered.at(-1);
  const days = ageInDays(source.occurredAt, now);

  if (
    latest?.id === source.id &&
    messageNeedsReply(source) &&
    !automatedSender(source) &&
    days >= 2
  ) {
    const person = (source.sender ?? 'Someone').replace(/<[^>]+>/u, '').trim() || 'Someone';
    return {
      kind: LifeItemKind.CATCH,
      stableKey: `waiting-reply:${source.id}`,
      title: `Reply to ${person}`,
      detail: `Their message is the newest one in this thread, from ${String(days)} days ago.`,
      confidence: 0.96,
      evidence: [sourceToCitation(source, shortQuote(source.body))],
      draftForSource: source,
    };
  }

  if (source.direction === SourceDocumentDirection.OUTBOUND && days >= 1) {
    const commitment = /\b(?:i['’]ll|i will|we['’]ll|we will)\s+([^.!?\n]{5,220})/iu.exec(
      source.body,
    );
    if (commitment !== null && latest?.id === source.id) {
      return {
        kind: LifeItemKind.NUDGE,
        stableKey: `your-commitment:${source.id}`,
        title: 'Check a promise you made',
        detail: `You wrote: “${shortQuote(commitment[0])}” No later message appears in this thread.`,
        confidence: 0.88,
        evidence: [sourceToCitation(source, shortQuote(commitment[0]))],
      };
    }
  }

  if (source.direction === SourceDocumentDirection.INBOUND && days >= 2) {
    const commitment = /\b(?:i['’]ll|i will|we['’]ll|we will)\s+([^.!?\n]{5,220})/iu.exec(
      source.body,
    );
    if (commitment !== null && latest?.id === source.id && !automatedSender(source)) {
      const person = (source.sender ?? 'Someone').replace(/<[^>]+>/u, '').trim() || 'Someone';
      return {
        kind: LifeItemKind.NUDGE,
        stableKey: `their-commitment:${source.id}`,
        title: `${person} said they would follow up`,
        detail: `They wrote: “${shortQuote(commitment[0])}” No later message appears in this thread.`,
        confidence: 0.86,
        evidence: [sourceToCitation(source, shortQuote(commitment[0]))],
      };
    }
  }

  const dateMention =
    /\b(?:due|deadline|by|on|before)\s+((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{4})?|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/iu.exec(
      `${source.title}\n${source.body}`,
    );
  if (source.direction === SourceDocumentDirection.INBOUND && dateMention !== null) {
    return {
      kind: LifeItemKind.CATCH,
      stableKey: `date-mentioned:${source.id}`,
      title: `Date mentioned: ${dateMention[1] ?? 'review message'}`,
      detail: `This email mentions “${shortQuote(dateMention[0])}.” Open the original before treating it as a deadline.`,
      confidence: 0.76,
      evidence: [sourceToCitation(source, shortQuote(source.body))],
    };
  }

  const renewal = /\b(?:subscription|renewal|renews?|membership|trial ends?)\b/iu.exec(
    `${source.title}\n${source.body}`,
  );
  if (source.direction === SourceDocumentDirection.INBOUND && renewal !== null) {
    return {
      kind: LifeItemKind.CATCH,
      stableKey: `renewal:${source.id}`,
      title: `Renewal mentioned: ${source.title}`,
      detail: `This message mentions “${shortQuote(renewal[0])}.” Review it before acting.`,
      confidence: 0.82,
      evidence: [sourceToCitation(source, shortQuote(source.body))],
    };
  }
  return null;
};

const calendarConflicts = (sources: readonly SourceDocumentView[]): readonly ProposedLifeItem[] => {
  const events = sources
    .filter((source) => source.kind === SourceDocumentKind.GOOGLE_CALENDAR_EVENT)
    .map((source) => {
      const metadata =
        typeof source.metadata === 'object' && source.metadata !== null
          ? (source.metadata as Record<string, unknown>)
          : {};
      const start = typeof metadata.start === 'string' ? new Date(metadata.start) : null;
      const end = typeof metadata.end === 'string' ? new Date(metadata.end) : null;
      return { source, start, end };
    })
    .filter(
      (event): event is { source: SourceDocumentView; start: Date; end: Date } =>
        event.start !== null && event.end !== null && event.end > event.start,
    )
    .sort((left, right) => left.start.getTime() - right.start.getTime());
  const result: ProposedLifeItem[] = [];
  for (let index = 0; index < events.length - 1; index += 1) {
    const first = events[index];
    const second = events[index + 1];
    if (first === undefined || second === undefined) continue;
    if (second.start >= first.end) continue;
    result.push({
      kind: LifeItemKind.CATCH,
      stableKey: `calendar-conflict:${first.source.id}:${second.source.id}`,
      title: 'Calendar conflict',
      detail: `${first.source.title} overlaps ${second.source.title}.`,
      confidence: 1,
      dueAt: first.start,
      evidence: [
        sourceToCitation(first.source, first.source.title),
        sourceToCitation(second.source, second.source.title),
      ],
    });
  }
  return result;
};

const draftFor = async (
  services: Services,
  userId: string,
  source: SourceDocumentView,
  sourceDocuments: readonly SourceDocumentView[],
): Promise<string | null> => {
  if (services.config.LLM_DEFAULT_PROVIDER === 'stub') return null;
  const examples = sourceDocuments
    .filter((entry) => entry.direction === SourceDocumentDirection.OUTBOUND)
    .slice(0, 3)
    .map((entry) => entry.body.slice(0, 800))
    .join('\n---\n');
  try {
    const completion = await services.llm.complete({
      task: 'draft',
      userId,
      messages: [
        {
          role: 'system',
          content:
            'Write a concise reply in the style suggested by the supplied sent-email excerpts. Use only facts in the incoming email. Do not promise a date, action, attachment, or outcome that is not in the evidence. Return only the draft body.',
        },
        {
          role: 'user',
          content: `Sent-email style excerpts:\n${examples || '(none)'}\n\nIncoming email:\nFrom: ${source.sender ?? 'unknown'}\nSubject: ${source.title}\nBody:\n${source.body.slice(0, 5_000)}`,
        },
      ],
      constraints: { maxOutputTokens: 260, temperature: 0.2 },
    });
    const draft = completion.text.trim();
    return draft.length === 0 ? null : draft.slice(0, 3_000);
  } catch {
    return null;
  }
};

export const refreshLifeItems = async (services: Services, userId: string): Promise<number> => {
  const sources = (await services.db.sourceDocument.findMany({
    where: { userId, deletedAt: null },
    orderBy: { occurredAt: 'desc' },
    take: 2_500,
  })) as SourceDocumentView[];
  const byThread = new Map<string, SourceDocumentView[]>();
  for (const source of sources) {
    const key = threadKey(source);
    const entries = byThread.get(key) ?? [];
    entries.push(source);
    byThread.set(key, entries);
  }
  const now = new Date();
  const proposed = [
    ...sources
      .filter((source) => source.kind === SourceDocumentKind.GMAIL_MESSAGE)
      .map((source) => lifeItemCandidate(source, byThread, now))
      .filter((item): item is ProposedLifeItem => item !== null),
    ...calendarConflicts(sources),
  ].slice(0, 40);
  const activeKeys = new Set(proposed.map((item) => item.stableKey));
  const current = await services.db.lifeItem.findMany({
    where: { userId, status: LifeItemStatus.ACTIVE, deletedAt: null },
    select: { id: true, stableKey: true },
  });
  await services.db.$transaction(
    current
      .filter((item) => !activeKeys.has(item.stableKey))
      .map((item) =>
        services.db.lifeItem.update({
          where: { id: item.id },
          data: { status: LifeItemStatus.COMPLETED },
        }),
      ),
  );
  for (const item of proposed) {
    const draft =
      item.draftForSource === undefined
        ? null
        : await draftFor(services, userId, item.draftForSource, sources);
    await services.db.lifeItem.upsert({
      where: { userId_stableKey: { userId, stableKey: item.stableKey } },
      update: {
        title: item.title,
        detail: item.detail,
        evidence: item.evidence as unknown as Prisma.InputJsonValue,
        confidence: item.confidence,
        ...(item.dueAt === undefined ? {} : { dueAt: item.dueAt }),
        ...(draft === null ? {} : { draft }),
      },
      create: {
        userId,
        kind: draft === null ? item.kind : LifeItemKind.DRAFT,
        stableKey: item.stableKey,
        title: item.title,
        detail: item.detail,
        evidence: item.evidence as unknown as Prisma.InputJsonValue,
        confidence: item.confidence,
        ...(item.dueAt === undefined ? {} : { dueAt: item.dueAt }),
        ...(draft === null ? {} : { draft }),
      },
    });
  }
  return proposed.length;
};

export const lifeItemDto = (item: {
  id: string;
  kind: LifeItemKind;
  status: LifeItemStatus;
  title: string;
  detail: string;
  evidence: unknown;
  confidence: number;
  dueAt: Date | null;
  snoozedUntil: Date | null;
  draft: string | null;
  createdAt: Date;
}): Record<string, unknown> => ({
  id: item.id,
  kind: item.kind.toLowerCase(),
  status: item.status.toLowerCase(),
  title: item.title,
  detail: item.detail,
  evidence: item.evidence,
  confidence: item.confidence,
  dueAt: item.dueAt?.toISOString() ?? null,
  snoozedUntil: item.snoozedUntil?.toISOString() ?? null,
  draft: item.draft,
  createdAt: item.createdAt.toISOString(),
});

const searchable = (source: SourceDocumentView): string =>
  [source.title, source.sender, source.recipients, source.body]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

const termsFor = (question: string): readonly string[] =>
  question
    .toLowerCase()
    .replaceAll(/[^a-z0-9@._-]+/gu, ' ')
    .split(' ')
    .filter((term) => term.length >= 3)
    .filter(
      (term) =>
        !new Set([
          'what',
          'when',
          'with',
          'that',
          'this',
          'have',
          'been',
          'about',
          'from',
          'your',
          'email',
          'tell',
        ]).has(term),
    );

const citationAnswer = (source: SourceDocumentView, lead: string): Record<string, unknown> => ({
  answer: `${lead} ${source.title}. ${shortQuote(source.body)}`.trim(),
  sources: [sourceToCitation(source, shortQuote(source.body))],
  confidence: 0.84,
});

export const answerLifeQuestion = async (
  services: Services,
  userId: string,
  question: string,
): Promise<Record<string, unknown>> => {
  const sources = (await services.db.sourceDocument.findMany({
    where: { userId, deletedAt: null },
    orderBy: { occurredAt: 'desc' },
    take: 2_500,
  })) as SourceDocumentView[];
  const lower = question.toLowerCase();
  const activeItems = await services.db.lifeItem.findMany({
    where: {
      userId,
      deletedAt: null,
      OR: [
        { status: LifeItemStatus.ACTIVE },
        { status: LifeItemStatus.SNOOZED, snoozedUntil: { lte: new Date() } },
      ],
    },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    take: 12,
  });
  if (/forgetting|owe today|this week|ignoring/u.test(lower)) {
    const related = lower.includes('ignoring')
      ? activeItems.filter((item) => item.stableKey.startsWith('waiting-reply:'))
      : activeItems;
    if (related.length === 0) {
      return {
        answer:
          'I could not find an active, source-backed item in your connected Gmail or calendar.',
        sources: [],
        confidence: 0,
      };
    }
    return {
      answer: related.map((item) => `${item.title}: ${item.detail}`).join('\n'),
      sources: related.flatMap((item) =>
        Array.isArray(item.evidence) ? (item.evidence as unknown as SourceCitation[]) : [],
      ),
      confidence: Math.min(...related.map((item) => item.confidence)),
    };
  }
  const terms = termsFor(question);
  const ranked = sources
    .map((source) => ({
      source,
      score: terms.reduce((total, term) => total + (searchable(source).includes(term) ? 1 : 0), 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.source.occurredAt?.getTime() ?? 0) - (left.source.occurredAt?.getTime() ?? 0),
    );
  const first = ranked[0]?.source;
  if (first === undefined) {
    return {
      answer: 'I could not find evidence for that in your connected Gmail or calendar.',
      sources: [],
      confidence: 0,
    };
  }
  if (/how much|spent|spend/u.test(lower) && lower.includes('amazon')) {
    const receipts = ranked
      .filter((entry) => searchable(entry.source).includes('amazon'))
      .slice(0, 20)
      .map((entry) => entry.source);
    const amounts = receipts.flatMap((source) =>
      [...source.body.matchAll(/(?:\$|USD\s?)(\d{1,5}(?:\.\d{2})?)/giu)].map((match) =>
        Number(match[1]),
      ),
    );
    if (amounts.length > 0) {
      const total = amounts.reduce((sum, amount) => sum + amount, 0);
      return {
        answer: `I found ${String(amounts.length)} dollar amounts in Amazon-related messages, totaling $${total.toFixed(2)}. This is only the receipts in your connected mail, not a bank statement.`,
        sources: receipts
          .slice(0, 8)
          .map((source) => sourceToCitation(source, shortQuote(source.body))),
        confidence: 0.76,
      };
    }
  }
  const lead = lower.includes('when did i last email')
    ? `The newest matching sent email was ${first.occurredAt?.toLocaleDateString() ?? 'at an unknown time'}:`
    : 'Here is the closest matching source I found:';
  return citationAnswer(first, lead);
};
