import { createHash } from 'node:crypto';

import type { PrismaClient } from '@orbit/db';
import { watcherSpecSchema } from '@orbit/shared';
import { CronExpressionParser } from 'cron-parser';

const nextDate = (expression: string): Date => {
  try {
    return CronExpressionParser.parse(expression).next().toDate();
  } catch {
    return new Date(Date.now() + 6 * 3_600_000);
  }
};

const dedupe = (watcherId: string, targetId: string): string =>
  createHash('sha256').update(`${watcherId}:${targetId}`).digest('hex');

const matchExchange = async (db: PrismaClient): Promise<number> => {
  const [haves, wants, blocks] = await Promise.all([
    db.exchangeItem.findMany({ where: { direction: 'HAVE', active: true, deletedAt: null } }),
    db.exchangeItem.findMany({ where: { direction: 'WANT', active: true, deletedAt: null } }),
    db.block.findMany({ where: { deletedAt: null } }),
  ]);
  const blocked = new Set(
    blocks.flatMap((block) => [
      `${block.blockerUserId}:${block.blockedUserId}`,
      `${block.blockedUserId}:${block.blockerUserId}`,
    ]),
  );
  let proposals = 0;
  for (const want of wants) {
    const queryWords = new Set(
      `${want.title} ${want.description} ${want.category}`.toLowerCase().match(/[a-z0-9]{3,}/gu) ??
        [],
    );
    const ranked = haves
      .filter(
        (have) => have.userId !== want.userId && !blocked.has(`${have.userId}:${want.userId}`),
      )
      .map((have) => ({
        have,
        score:
          (have.category.toLowerCase() === want.category.toLowerCase() ? 4 : 0) +
          (`${have.title} ${have.description}`.toLowerCase().match(/[a-z0-9]{3,}/gu) ?? []).filter(
            (word) => queryWords.has(word),
          ).length,
      }))
      .filter(({ score }) => score > 0)
      .toSorted((left, right) => right.score - left.score);
    const top = ranked[0]?.have;
    if (top === undefined) continue;
    const existing = await db.exchangeProposal.findUnique({
      where: { haveItemId_wantItemId: { haveItemId: top.id, wantItemId: want.id } },
    });
    if (existing !== null) continue;
    await db.exchangeProposal.create({
      data: {
        haveItemId: top.id,
        wantItemId: want.id,
        terms: {
          summary: `Proposed direct handoff: ${top.title} for ${want.title}.`,
          itemCondition: top.condition,
          suggestedPlace: 'A staffed public campus location',
          suggestedWindow: 'Agree on a broad time window after mutual acceptance',
          payment: false,
        },
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    proposals += 1;
  }
  return proposals;
};

export const runWatchers = async (
  db: PrismaClient,
): Promise<{ hits: number; proposals: number }> => {
  const proposals = await matchExchange(db);
  const due = await db.watcher.findMany({
    where: {
      active: true,
      deletedAt: null,
      OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }],
    },
  });
  let hits = 0;
  for (const watcher of due) {
    const parsed = watcherSpecSchema.safeParse(watcher.spec);
    if (!parsed.success) {
      await db.watcher.update({
        where: { id: watcher.id },
        data: { active: false, lastRunAt: new Date() },
      });
      continue;
    }
    if (parsed.data.source === 'orbit') {
      const words = parsed.data.query.toLowerCase().match(/[a-z0-9]{3,}/gu) ?? [];
      const items = await db.exchangeItem.findMany({
        where: { active: true, deletedAt: null, userId: { not: watcher.userId } },
        take: 100,
      });
      const ranked = items
        .map((item) => ({
          item,
          score: words.filter((word) =>
            `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(word),
          ).length,
        }))
        .filter(({ score }) => score > 0)
        .toSorted((left, right) => right.score - left.score)
        .slice(0, 10);
      for (const { item } of ranked) {
        const result = await db.watcherHit.upsert({
          where: {
            watcherId_dedupeKey: { watcherId: watcher.id, dedupeKey: dedupe(watcher.id, item.id) },
          },
          update: {},
          create: {
            watcherId: watcher.id,
            dedupeKey: dedupe(watcher.id, item.id),
            payload: {
              title: item.title,
              detail: item.description,
              href: `/exchange/${item.id}`,
              matchedQuery: parsed.data.query,
            },
          },
        });
        if (result.createdAt.getTime() >= Date.now() - 5_000) hits += 1;
      }
    }
    await db.watcher.update({
      where: { id: watcher.id },
      data: { lastRunAt: new Date(), nextRunAt: nextDate(watcher.schedule) },
    });
    await db.activityLog.create({
      data: {
        userId: watcher.userId,
        actorType: 'AGENT',
        action: 'watcher.checked',
        targetType: 'Watcher',
        targetId: watcher.id,
        payload: { source: parsed.data.source },
      },
    });
  }
  return { hits, proposals };
};
