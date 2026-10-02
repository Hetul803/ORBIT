import { queuePush, type PrismaClient } from '@orbit/db';

interface ExpoTicket {
  status?: string;
  message?: string;
  details?: { error?: string };
}

export const queueDueSafetyCheckIns = async (db: PrismaClient): Promise<number> => {
  const plans = await db.safetyPlan.findMany({
    where: {
      deletedAt: null,
      checkedInAt: null,
      checkInNotifiedAt: null,
      checkInDueAt: { lte: new Date() },
    },
    take: 100,
  });
  let queued = 0;
  for (const plan of plans) {
    const count = await queuePush(db, {
      userId: plan.userId,
      eventType: 'safety',
      title: 'Safety check-in due',
      body: `Check in after your meeting at ${plan.placeName}.`,
      deepLink: `orbit://safety?introductionId=${encodeURIComponent(plan.introductionId)}`,
    });
    if (count > 0) {
      await db.safetyPlan.update({
        where: { id: plan.id },
        data: { checkInNotifiedAt: new Date() },
      });
      queued += count;
    }
  }
  return queued;
};

export const deliverPush = async (
  db: PrismaClient,
): Promise<{ sent: number; retried: number; failed: number }> => {
  await queueDueSafetyCheckIns(db);
  const deliveries = await db.pushDelivery.findMany({
    where: { status: { in: ['QUEUED', 'RETRY'] }, nextAttemptAt: { lte: new Date() } },
    include: { device: true },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  if (deliveries.length === 0) return { sent: 0, retried: 0, failed: 0 };
  let payload: { data?: ExpoTicket[] };
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(
        deliveries.map((delivery) => ({
          to: delivery.device.pushToken,
          sound: 'default',
          title: delivery.title,
          body: delivery.body,
          data: { deepLink: delivery.deepLink, eventType: delivery.eventType },
        })),
      ),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(`Expo push service returned HTTP ${String(response.status)}.`);
    payload = (await response.json()) as { data?: ExpoTicket[] };
  } catch (error: unknown) {
    let retried = 0;
    let failed = 0;
    for (const delivery of deliveries) {
      const attempts = delivery.attempts + 1;
      const terminal = attempts >= 5;
      await db.pushDelivery.update({
        where: { id: delivery.id },
        data: {
          status: terminal ? 'FAILED' : 'RETRY',
          attempts,
          nextAttemptAt: terminal
            ? new Date()
            : new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** attempts)),
          lastError: (error instanceof Error ? error.message : 'Expo push request failed').slice(
            0,
            500,
          ),
        },
      });
      if (terminal) failed += 1;
      else retried += 1;
    }
    return { sent: 0, retried, failed };
  }
  const tickets = payload.data ?? [];
  let sent = 0;
  let retried = 0;
  let failed = 0;
  for (const [index, delivery] of deliveries.entries()) {
    const ticket = tickets[index];
    if (ticket?.status === 'ok') {
      await db.pushDelivery.update({
        where: { id: delivery.id },
        data: { status: 'SENT', attempts: { increment: 1 }, sentAt: new Date(), lastError: null },
      });
      sent += 1;
      continue;
    }
    const attempts = delivery.attempts + 1;
    const permanentlyInvalid = ticket?.details?.error === 'DeviceNotRegistered';
    const terminal = permanentlyInvalid || attempts >= 5;
    await db.$transaction([
      db.pushDelivery.update({
        where: { id: delivery.id },
        data: {
          status: terminal ? 'FAILED' : 'RETRY',
          attempts,
          nextAttemptAt: terminal
            ? new Date()
            : new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** attempts)),
          lastError: (ticket?.message ?? ticket?.details?.error ?? 'Unknown Expo push error').slice(
            0,
            500,
          ),
        },
      }),
      ...(permanentlyInvalid
        ? [db.device.update({ where: { id: delivery.deviceId }, data: { deletedAt: new Date() } })]
        : []),
    ]);
    if (terminal) failed += 1;
    else retried += 1;
  }
  return { sent, retried, failed };
};
