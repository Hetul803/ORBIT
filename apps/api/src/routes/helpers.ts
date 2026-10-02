import { type Prisma, type PrismaClient } from '@orbit/db';

export const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const iso = (value: Date | null): string | null => value?.toISOString() ?? null;

export const logActivity = async (
  db: Pick<PrismaClient, 'activityLog'>,
  input: {
    userId: string;
    actorType: 'USER' | 'AGENT' | 'SYSTEM' | 'ADMIN';
    action: string;
    targetType: string;
    targetId?: string;
    payload?: Record<string, unknown>;
    requestId?: string;
  },
): Promise<void> => {
  await db.activityLog.create({
    data: {
      userId: input.userId,
      actorType: input.actorType,
      action: input.action,
      targetType: input.targetType,
      ...(input.targetId === undefined ? {} : { targetId: input.targetId }),
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    },
  });
};

export const publicUser = (user: {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  eduVerifiedAt: Date | null;
  phone: string | null;
  phoneVerifiedAt: Date | null;
  ageVerifiedAt: Date | null;
  displayName: string;
  handle: string | null;
  locale: string;
  timezone: string;
  status: 'ACTIVE' | 'PENDING_DELETION' | 'SUSPENDED';
  role: 'USER' | 'MODERATOR' | 'ADMIN';
  deletionRequestedAt: Date | null;
}): Record<string, unknown> => ({
  id: user.id,
  email: user.email,
  emailVerifiedAt: iso(user.emailVerifiedAt),
  eduVerifiedAt: iso(user.eduVerifiedAt),
  phone: user.phone,
  phoneVerifiedAt: iso(user.phoneVerifiedAt),
  ageVerifiedAt: iso(user.ageVerifiedAt),
  displayName: user.displayName,
  handle: user.handle,
  locale: user.locale,
  timezone: user.timezone,
  status:
    user.status === 'ACTIVE'
      ? 'active'
      : user.status === 'PENDING_DELETION'
        ? 'pending_deletion'
        : 'suspended',
  role: user.role.toLowerCase(),
  deletionRequestedAt: iso(user.deletionRequestedAt),
});
