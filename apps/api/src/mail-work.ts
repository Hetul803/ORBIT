import { ConnectionStatus, ConnectionProvider, type Prisma } from '@orbit/db';
import type { Services } from './services.js';
import { asRecord } from './routes/helpers.js';
import { categoryForLabels } from './mail-categories.js';
import {
  activeAccountSources,
  accountSourceSelect,
  calendarKinds,
  emailKinds,
  scopedThreadKey,
  sourceAccountDto,
  sourceInboxKey,
} from './linked-accounts.js';

export const mailActions = ['needs_reply', 'reply_ready', 'receipts', 'subscriptions'] as const;
export const sensitiveMail = (title: string): boolean =>
  /verification code|one.?time|password reset|security code|authentication|sign.?in|login code|\bOTP\b|two.factor/iu.test(
    title,
  );
export const activeSources: (userId: string) => Prisma.SourceDocumentWhereInput =
  activeAccountSources;

export const mailWork = async (services: Services, userId: string, connectionId?: string) => {
  const accounts = await services.db.connection.findMany({
    where: {
      userId,
      status: ConnectionStatus.ACTIVE,
      deletedAt: null,
      provider: { in: [ConnectionProvider.GOOGLE, ConnectionProvider.MICROSOFT] },
      ...(connectionId ? { id: connectionId } : {}),
    },
    select: { id: true },
    take: 10,
  });
  const sources = (
    await Promise.all(
      [...accounts.map((a) => a.id), ...(connectionId ? [] : [null])].map((id) =>
        services.db.sourceDocument.findMany({
          where: { ...activeSources(userId), kind: { in: emailKinds }, connectionId: id },
          orderBy: [{ occurredAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
          take: 2500,
          select: {
            id: true,
            kind: true,
            externalId: true,
            threadId: true,
            connectionId: true,
            connection: { select: accountSourceSelect },
            title: true,
            sender: true,
            direction: true,
            occurredAt: true,
            sourceUrl: true,
            metadata: true,
          },
        }),
      ),
    )
  )
    .flat()
    .sort((a, b) => (b.occurredAt?.getTime() ?? 0) - (a.occurredAt?.getTime() ?? 0));
  const [drafts, inbox] = await Promise.all([
    services.db.lifeItem.findMany({
      where: { userId, deletedAt: null, draft: { not: null } },
      select: { stableKey: true, draft: true },
      take: 2500,
    }),
    services.db.inboxItem.findMany({
      where: {
        recipientUserId: userId,
        deletedAt: null,
        OR: [{ kind: { startsWith: 'gmail:' } }, { kind: { startsWith: 'outlook:' } }],
        agentReply: { not: null },
      },
      select: { id: true, kind: true, agentReply: true, approvedAt: true },
      take: 2500,
    }),
  ]);
  const draftBySource = new Map(
    drafts
      .filter((d) => d.draft?.trim())
      .map((d) => [d.stableKey.replace(/^waiting-reply:/u, ''), d.draft]),
  );
  const draftByMail = new Map(inbox.filter((d) => d.agentReply?.trim()).map((d) => [d.kind, d]));
  const newest = new Set<string>();
  return sources.map((source) => {
    const metadata = asRecord(source.metadata);
    const derived = asRecord(metadata.derived);
    const labels = Array.isArray(metadata.labels)
      ? metadata.labels.filter((x): x is string => typeof x === 'string')
      : [];
    const category = categoryForLabels(labels, source.direction === 'OUTBOUND');
    const thread = scopedThreadKey(source);
    const latest = !newest.has(thread);
    newest.add(thread);
    const reply = draftByMail.get(sourceInboxKey(source.kind, source.externalId));
    const draft = reply?.agentReply ?? draftBySource.get(source.id) ?? null;
    const needsReply =
      latest &&
      source.direction === 'INBOUND' &&
      derived.needsReply === true &&
      !/no.?reply|mailer-daemon|notifications?@/iu.test(source.sender ?? '') &&
      category !== 'spam' &&
      !sensitiveMail(source.title);
    const actions: string[] = [];
    if (category !== 'spam' && source.direction !== 'OUTBOUND') {
      if (needsReply) actions.push('needs_reply');
      if (draft?.trim()) actions.push('reply_ready');
      if (
        derived.receipt === true ||
        /receipt|invoice|order confirmation|purchase|payment received/iu.test(source.title)
      )
        actions.push('receipts');
      if (derived.renewal || /subscription|renewal|membership|trial ends/iu.test(source.title))
        actions.push('subscriptions');
    }
    return {
      id: source.id,
      externalId: source.externalId,
      ...sourceAccountDto(source),
      title: source.title,
      sender: source.sender,
      occurredAt: source.occurredAt?.toISOString() ?? null,
      sourceUrl: source.sourceUrl,
      category,
      actions,
      draft,
      inboxId: reply?.id ?? null,
      reviewedAt: reply?.approvedAt?.toISOString() ?? null,
    };
  });
};

export const agenda = async (services: Services, userId: string, connectionId?: string) => {
  const now = new Date();
  const end = new Date(now.getTime() + 14 * 86400000);
  const rows = await services.db.sourceDocument.findMany({
    where: {
      ...activeSources(userId),
      kind: { in: calendarKinds },
      ...(connectionId ? { connectionId } : {}),
      occurredAt: { gte: new Date(now.getTime() - 86400000), lt: end },
    },
    orderBy: { occurredAt: 'asc' },
    take: 250,
    select: {
      id: true,
      kind: true,
      connectionId: true,
      connection: { select: accountSourceSelect },
      title: true,
      occurredAt: true,
      sourceUrl: true,
      metadata: true,
      lastSyncedAt: true,
    },
  });
  return rows.flatMap((source) => {
    const m = asRecord(source.metadata);
    if (m.status === 'cancelled') return [];
    const start = typeof m.start === 'string' ? m.start : source.occurredAt?.toISOString();
    const finish = typeof m.end === 'string' ? m.end : null;
    if (
      !start ||
      !finish ||
      !Number.isFinite(Date.parse(start)) ||
      !Number.isFinite(Date.parse(finish)) ||
      Date.parse(finish) <= now.getTime()
    )
      return [];
    return [
      {
        id: source.id,
        ...sourceAccountDto(source),
        title: source.title,
        start,
        end: finish,
        allDay: m.allDay === true,
        remindable: m.allDay === false,
        startDate: typeof m.startDate === 'string' ? m.startDate : null,
        endDate: typeof m.endDate === 'string' ? m.endDate : null,
        sourceUrl: source.sourceUrl,
        lastSyncedAt: source.lastSyncedAt.toISOString(),
      },
    ];
  });
};

export const connectedChatContext = async (
  services: Services,
  userId: string,
  question: string,
) => {
  const [mail, events] = await Promise.all([mailWork(services, userId), agenda(services, userId)]);
  const terms = question
    .toLowerCase()
    .split(/\W+/u)
    .filter(
      (t) =>
        t.length > 3 &&
        ![
          'what',
          'this',
          'that',
          'with',
          'your',
          'about',
          'help',
          'today',
          'please',
          'could',
          'would',
        ].includes(t),
    );
  const ranked = mail
    .filter((m) => m.category !== 'spam' && !sensitiveMail(m.title))
    .map((m) => ({
      m,
      score:
        terms.reduce((n, t) => n + (m.title.toLowerCase().includes(t) ? 2 : 0), 0) +
        (m.actions.includes('needs_reply') ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ m }) => m);
  // Account identities stay attached; even a quiet mailbox can contribute evidence.
  const firstByAccount = new Map<string, (typeof ranked)[number]>();
  for (const item of ranked)
    if (!firstByAccount.has(item.provider + ':' + (item.connectionId ?? 'legacy')))
      firstByAccount.set(item.provider + ':' + (item.connectionId ?? 'legacy'), item);
  const picked = [...firstByAccount.values(), ...ranked]
    .filter((item, index, array) => array.findIndex((other) => other.id === item.id) === index)
    .slice(0, 10);
  const upcoming = events.slice(0, 6);
  return {
    summaries: {
      mail: picked.map((m) => ({
        title: m.title.slice(0, 240),
        provider: m.provider,
        accountEmail: m.accountEmail,
        connectionId: m.connectionId,
        sender: m.sender?.slice(0, 180),
        date: m.occurredAt,
        actions: m.actions,
      })),
      calendar: upcoming.map((e) => ({
        title: e.title.slice(0, 240),
        provider: e.provider,
        accountEmail: e.accountEmail,
        connectionId: e.connectionId,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
      })),
    },
    sources: [
      ...picked.map((m) => ({
        sourceId: m.id,
        provider: m.provider,
        accountEmail: m.accountEmail,
        connectionId: m.connectionId,
        kind: 'email' as const,
        title: m.title,
        url: m.sourceUrl,
        quote: 'Synced headers and follow-up signals; not the full message.',
        occurredAt: m.occurredAt,
      })),
      ...upcoming.map((e) => ({
        sourceId: e.id,
        provider: e.provider,
        accountEmail: e.accountEmail,
        connectionId: e.connectionId,
        kind: 'calendar' as const,
        title: e.title,
        url: e.sourceUrl,
        quote: `${e.start} – ${e.end}`,
        occurredAt: e.start,
      })),
    ],
  };
};
