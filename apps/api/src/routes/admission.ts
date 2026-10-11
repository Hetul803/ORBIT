import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { alphaOperationsReady } from '../alpha-operations.js';
import { ALPHA_HARD_ACCOUNT_CAP, verifiedWaitlistEmail } from '../admission.js';
import { parseWith } from '../errors.js';
import type { Services } from '../services.js';

export const registerAdmissionRoutes = (app: FastifyInstance, services: Services): void => {
  app.get('/v1/alpha/status', async () => {
    const capacity = Math.min(ALPHA_HARD_ACCOUNT_CAP, services.config.DEPLOYMENT_ACCOUNT_CAP);
    const count = await services.db.user.count({ where: { deletedAt: null } });
    const full = count >= capacity;
    const operational = await alphaOperationsReady(services.db, services.config);
    return {
      capacity,
      full,
      acceptingNewAccounts: !full && operational,
      waitlistAvailable: true,
      reason: full ? 'capacity' : operational ? null : 'safety_coverage',
    };
  });
  app.post('/v1/waitlist', async (request) => {
    const body = parseWith(
      z.object({ verificationToken: z.string().min(20).max(4000) }),
      request.body,
    );
    const email = await verifiedWaitlistEmail(body.verificationToken, services.config);
    const entry = await services.db.waitlistEntry.upsert({
      where: { email },
      create: { email },
      update: {},
    });
    return {
      ok: true,
      joinedAt: entry.createdAt.toISOString(),
      message:
        'Your verified email is on the waitlist. No account, invitation date, or place is promised.',
    };
  });
  app.delete('/v1/waitlist', async (request) => {
    const body = parseWith(
      z.object({ verificationToken: z.string().min(20).max(4000) }),
      request.body,
    );
    const email = await verifiedWaitlistEmail(body.verificationToken, services.config);
    await services.db.waitlistEntry.deleteMany({ where: { email } });
    return { ok: true };
  });
};
