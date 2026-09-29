import { createHash } from 'node:crypto';

import { type PrismaClient } from '@orbit/db';

import type { WorkerConfig } from '../config.js';

export const runDeletion = async (
  db: PrismaClient,
  config: WorkerConfig,
): Promise<{ deleted: number }> => {
  const cutoff = new Date(Date.now() - config.DELETION_GRACE_DAYS * 86_400_000);
  const users = await db.user.findMany({
    where: {
      status: 'PENDING_DELETION',
      deletionRequestedAt: { lte: cutoff },
    },
    select: { id: true, email: true },
  });
  for (const user of users) {
    const tombstone = `deleted-${createHash('sha256').update(user.id).digest('hex').slice(0, 20)}@deleted.invalid`;
    await db.$transaction(async (tx) => {
      const agents = await tx.agent.findMany({ where: { userId: user.id }, select: { id: true } });
      const agentIds = agents.map((agent) => agent.id);
      const conversations =
        agentIds.length === 0
          ? []
          : await tx.agentConversation.findMany({
              where: { OR: [{ agentAId: { in: agentIds } }, { agentBId: { in: agentIds } }] },
              select: { id: true },
            });
      const conversationIds = conversations.map((conversation) => conversation.id);

      await tx.reveal.deleteMany({ where: { userId: user.id } });
      await tx.consent.deleteMany({ where: { userId: user.id } });
      await tx.introductionOutcome.deleteMany({ where: { userId: user.id } });
      await tx.safetyPlan.deleteMany({ where: { userId: user.id } });
      await tx.introduction.deleteMany({
        where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
      });
      await tx.report.deleteMany({
        where: { OR: [{ reporterUserId: user.id }, { subjectUserId: user.id }] },
      });
      await tx.moderationAction.deleteMany({ where: { moderatorId: user.id } });
      if (conversationIds.length > 0) {
        await tx.agentConversation.deleteMany({ where: { id: { in: conversationIds } } });
      }
      const exchangeItems = await tx.exchangeItem.findMany({
        where: { userId: user.id },
        select: { id: true },
      });
      const exchangeItemIds = exchangeItems.map((item) => item.id);
      if (exchangeItemIds.length > 0) {
        await tx.exchangeProposal.deleteMany({
          where: {
            OR: [{ haveItemId: { in: exchangeItemIds } }, { wantItemId: { in: exchangeItemIds } }],
          },
        });
      }
      await tx.exchangeItem.deleteMany({ where: { userId: user.id } });
      await tx.inboxItem.deleteMany({
        where: {
          OR: [
            { recipientUserId: user.id },
            { senderUserId: user.id },
            ...(agentIds.length === 0 ? [] : [{ senderAgentId: { in: agentIds } }]),
          ],
        },
      });
      await tx.skillAdoption.deleteMany({ where: { userId: user.id } });
      await tx.skill.deleteMany({ where: { ownerUserId: user.id } });
      await tx.groupMember.deleteMany({ where: { userId: user.id } });
      await tx.watcher.deleteMany({ where: { userId: user.id } });
      await tx.run.deleteMany({ where: { userId: user.id } });
      await tx.intent.deleteMany({ where: { userId: user.id } });
      await tx.screeningRule.deleteMany({ where: { userId: user.id } });
      await tx.dailyBrief.deleteMany({ where: { userId: user.id } });
      await tx.modelCall.deleteMany({ where: { userId: user.id } });
      await tx.block.deleteMany({
        where: { OR: [{ blockerUserId: user.id }, { blockedUserId: user.id }] },
      });
      await tx.mute.deleteMany({
        where: { OR: [{ muterUserId: user.id }, { mutedUserId: user.id }] },
      });
      await tx.refreshToken.deleteMany({ where: { userId: user.id } });
      await tx.otpChallenge.deleteMany({
        where: { OR: [{ userId: user.id }, { email: user.email }] },
      });
      await tx.ageGateAttempt.deleteMany({
        where: { emailHash: createHash('sha256').update(user.email).digest('hex') },
      });
      await tx.encryptedApiKey.deleteMany({ where: { userId: user.id } });
      await tx.connection.deleteMany({ where: { userId: user.id } });
      await tx.device.deleteMany({ where: { userId: user.id } });
      await tx.agent.deleteMany({ where: { userId: user.id } });
      await tx.user.update({
        where: { id: user.id },
        data: {
          email: tombstone,
          phone: null,
          handle: null,
          displayName: 'Deleted account',
          dateOfBirth: new Date('1900-01-01T00:00:00.000Z'),
          emailVerifiedAt: null,
          eduVerifiedAt: null,
          phoneVerifiedAt: null,
          ageVerifiedAt: null,
          campusId: null,
          locale: 'en',
          timezone: 'UTC',
          deletedAt: new Date(),
        },
      });
    });
  }
  return { deleted: users.length };
};
