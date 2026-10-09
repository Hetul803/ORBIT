import type { FastifyInstance } from 'fastify';

import {
  otpRequestSchema,
  otpVerifySchema,
  refreshTokenSchema,
  verifyEduRequestSchema,
  verifyEduSchema,
  verifyPhoneRequestSchema,
  verifyPhoneSchema,
} from '@orbit/shared';

import { issueTokens, requireAuth, verifyRefreshToken } from '../auth.js';
import { constantTimeEqual, createOtp, sha256 } from '../crypto.js';
import { ApiError, parseWith } from '../errors.js';
import type { Services } from '../services.js';
import { logActivity, publicUser } from './helpers.js';

const isAdult = (birthDate: Date, now = new Date()): boolean => {
  const eighteenthBirthday = new Date(
    Date.UTC(birthDate.getUTCFullYear() + 18, birthDate.getUTCMonth(), birthDate.getUTCDate()),
  );
  return eighteenthBirthday <= now;
};

const deliverEmailOtp = async (services: Services, email: string, code: string): Promise<void> => {
  if (services.config.OTP_DELIVERY_MODE === 'log') {
    if (
      services.config.NODE_ENV === 'production' ||
      services.config.ALLOW_DEVELOPMENT_OTP_DISPLAY !== 'true'
    ) {
      throw new ApiError(503, 'OTP_PROVIDER_UNAVAILABLE', 'Email delivery is not configured.');
    }
    return;
  }
  if (services.config.RESEND_API_KEY === undefined) {
    throw new ApiError(503, 'OTP_PROVIDER_UNAVAILABLE', 'Email delivery is not configured.');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${services.config.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: services.config.RESEND_FROM_EMAIL,
      to: [email],
      subject: 'Your ORBIT sign-in code',
      text: `Your ORBIT code is ${code}. It expires in ${String(Math.ceil(services.config.OTP_TTL_SECONDS / 60))} minutes.`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new ApiError(502, 'OTP_DELIVERY_FAILED', 'The sign-in code could not be delivered.');
};

const deliverPhoneOtp = async (services: Services, phone: string, code: string): Promise<void> => {
  if (services.config.PHONE_OTP_PROVIDER === 'disabled') {
    throw new ApiError(503, 'SMS_PROVIDER_UNAVAILABLE', 'Phone verification is not enabled.');
  }
  if (services.config.PHONE_OTP_PROVIDER === 'log') {
    if (services.config.NODE_ENV === 'production') {
      throw new ApiError(503, 'SMS_PROVIDER_UNAVAILABLE', 'SMS delivery is not configured.');
    }
    return;
  }
  const accountSid = services.config.TWILIO_ACCOUNT_SID;
  const authToken = services.config.TWILIO_AUTH_TOKEN;
  const from = services.config.TWILIO_FROM_PHONE;
  if (accountSid === undefined || authToken === undefined || from === undefined) {
    throw new ApiError(503, 'SMS_PROVIDER_UNAVAILABLE', 'Twilio SMS delivery is not configured.');
  }
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: phone,
        From: from,
        Body: `Your ORBIT verification code is ${code}. It expires in ${String(Math.ceil(services.config.OTP_TTL_SECONDS / 60))} minutes.`,
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok)
    throw new ApiError(502, 'SMS_DELIVERY_FAILED', 'The SMS code could not be delivered.');
};

const otpWindowStart = (): Date => new Date(Date.now() - 15 * 60_000);

const assertOtpRequestAllowed = async (
  services: Services,
  email: string,
  ipHash: string,
  purpose: string,
): Promise<void> => {
  const since = otpWindowStart();
  const [latest, emailCount, ipCount] = await Promise.all([
    services.db.otpChallenge.findFirst({
      where: { email, purpose, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    services.db.otpChallenge.count({
      where: { email, purpose, deletedAt: null, createdAt: { gte: since } },
    }),
    services.db.otpChallenge.count({
      where: { ipHash, purpose, deletedAt: null, createdAt: { gte: since } },
    }),
  ]);
  if (latest !== null) {
    const retryAfterSeconds = Math.ceil(
      services.config.OTP_RESEND_COOLDOWN_SECONDS -
        (Date.now() - latest.createdAt.getTime()) / 1_000,
    );
    if (retryAfterSeconds > 0) {
      throw new ApiError(429, 'OTP_RESEND_WAIT', 'Wait before requesting another code.', {
        retryAfterSeconds,
      });
    }
  }
  if (emailCount >= services.config.OTP_EMAIL_REQUESTS_PER_15_MINUTES) {
    throw new ApiError(
      429,
      'OTP_EMAIL_RATE_LIMITED',
      'Too many codes were requested for this email.',
    );
  }
  if (ipCount >= services.config.OTP_IP_REQUESTS_PER_15_MINUTES) {
    throw new ApiError(
      429,
      'OTP_IP_RATE_LIMITED',
      'Too many codes were requested from this network.',
    );
  }
};

const createAndDeliverEmailOtp = async (
  services: Services,
  input: { email: string; purpose: string; userId?: string; ipHash: string },
): Promise<string> => {
  await assertOtpRequestAllowed(services, input.email, input.ipHash, input.purpose);
  const code = createOtp();
  const challenge = await services.db.otpChallenge.create({
    data: {
      ...(input.userId === undefined ? {} : { userId: input.userId }),
      email: input.email,
      codeHash: sha256(code),
      purpose: input.purpose,
      expiresAt: new Date(Date.now() + services.config.OTP_TTL_SECONDS * 1_000),
      ipHash: input.ipHash,
    },
  });
  try {
    await deliverEmailOtp(services, input.email, code);
    return code;
  } catch (error: unknown) {
    await services.db.otpChallenge.delete({ where: { id: challenge.id } });
    throw error;
  }
};

export const registerAuthRoutes = (app: FastifyInstance, services: Services): void => {
  app.post('/v1/auth/otp/request', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    handler: async (request) => {
      const body = parseWith(otpRequestSchema, request.body);
      const email = body.email.toLowerCase();
      const user = await services.db.user.findUnique({ where: { email } });
      const code = await createAndDeliverEmailOtp(services, {
        email,
        purpose: 'sign_in',
        ...(user === null ? {} : { userId: user.id }),
        ipHash: sha256(request.ip),
      });
      return {
        ok: true,
        expiresIn: services.config.OTP_TTL_SECONDS,
        resendAfterSeconds: services.config.OTP_RESEND_COOLDOWN_SECONDS,
        ...(services.config.NODE_ENV !== 'production' &&
        services.config.OTP_DELIVERY_MODE === 'log' &&
        services.config.ALLOW_DEVELOPMENT_OTP_DISPLAY === 'true'
          ? { developmentCode: code }
          : {}),
      };
    },
  });

  app.post('/v1/auth/otp/verify', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    handler: async (request) => {
      const body = parseWith(otpVerifySchema, request.body);
      const email = body.email.toLowerCase();
      const ipHash = sha256(request.ip);
      const challenge = await services.db.otpChallenge.findFirst({
        where: {
          email,
          purpose: 'sign_in',
          consumedAt: null,
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (challenge === null) {
        throw new ApiError(401, 'OTP_INVALID', 'No active sign-in code was found.');
      }
      if (challenge.expiresAt <= new Date()) {
        throw new ApiError(401, 'OTP_EXPIRED', 'The code expired. Request a new one.');
      }
      const [emailFailures, ipFailures] = await Promise.all([
        services.db.otpChallenge.aggregate({
          where: { email, purpose: 'sign_in', createdAt: { gte: otpWindowStart() } },
          _sum: { attempts: true },
        }),
        services.db.otpChallenge.aggregate({
          where: { ipHash, purpose: 'sign_in', createdAt: { gte: otpWindowStart() } },
          _sum: { attempts: true },
        }),
      ]);
      if (
        challenge.attempts >= 6 ||
        (emailFailures._sum.attempts ?? 0) >= services.config.OTP_FAILED_ATTEMPTS_PER_15_MINUTES ||
        (ipFailures._sum.attempts ?? 0) >= services.config.OTP_FAILED_ATTEMPTS_PER_15_MINUTES
      ) {
        throw new ApiError(
          429,
          'OTP_LOCKED',
          'Too many incorrect codes. Wait and request a new code.',
        );
      }
      if (!constantTimeEqual(challenge.codeHash, sha256(body.code))) {
        const updated = await services.db.otpChallenge.update({
          where: { id: challenge.id },
          data: { attempts: { increment: 1 } },
          select: { attempts: true },
        });
        throw new ApiError(401, 'OTP_INCORRECT', 'That code is incorrect.', {
          remainingAttempts: Math.max(0, 6 - updated.attempts),
        });
      }
      const claimed = await services.db.otpChallenge.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
          attempts: { lt: 6 },
        },
        data: { consumedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new ApiError(401, 'OTP_INVALID', 'This code was already used. Request a new one.');
      }
      const existingUser = await services.db.user.findUnique({ where: { email } });
      const emailHash = sha256(email);
      if (existingUser === null) {
        const priorRejection = await services.db.ageGateAttempt.findFirst({
          where: { emailHash, allowed: false },
          select: { id: true },
        });
        if (priorRejection !== null) {
          await services.db.otpChallenge.update({
            where: { id: challenge.id },
            data: { consumedAt: new Date() },
          });
          throw new ApiError(
            403,
            'AGE_RESTRICTED',
            'This verified email is not eligible for an ORBIT account.',
          );
        }
      }
      const birthDate = existingUser?.dateOfBirth ?? new Date(`${body.dateOfBirth}T00:00:00.000Z`);
      const allowed = isAdult(birthDate);
      if (existingUser === null) {
        await services.db.ageGateAttempt.create({
          data: {
            emailHash,
            birthDate,
            allowed,
            ipHash,
            ...(request.headers['user-agent'] === undefined
              ? {}
              : { userAgent: request.headers['user-agent'].slice(0, 500) }),
          },
        });
      }
      if (!allowed) {
        await services.db.otpChallenge.update({
          where: { id: challenge.id },
          data: { consumedAt: new Date() },
        });
        throw new ApiError(
          403,
          'AGE_RESTRICTED',
          'ORBIT is available only to people who are 18 or older.',
        );
      }
      const adminEmails = new Set(
        services.config.ADMIN_EMAILS.split(',').map((entry) => entry.trim().toLowerCase()),
      );
      const user = await services.db.$transaction(async (tx) => {
        // One database-wide lock keeps simultaneous signups from passing the last slot.
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(805001)`;
        const current = await tx.user.findUnique({ where: { email } });
        if (current === null) {
          const startOfDay = new Date();
          startOfDay.setUTCHours(0, 0, 0, 0);
          const [accountCount, accountsFromIp] = await Promise.all([
            tx.user.count({ where: { deletedAt: null } }),
            tx.user.count({ where: { signupIpHash: ipHash, createdAt: { gte: startOfDay } } }),
          ]);
          if (accountCount >= services.config.DEPLOYMENT_ACCOUNT_CAP) {
            throw new ApiError(
              503,
              'EARLY_ACCESS_FULL',
              'The current ORBIT testing cohort is full.',
            );
          }
          if (accountsFromIp >= services.config.ACCOUNT_CREATION_PER_IP_PER_DAY) {
            throw new ApiError(
              429,
              'ACCOUNT_CREATION_RATE_LIMITED',
              'Too many accounts were created from this network today.',
            );
          }
        }
        return tx.user.upsert({
          where: { email },
          update: {
            emailVerifiedAt: new Date(),
            ageVerifiedAt: new Date(),
            dateOfBirth: birthDate,
            lastActiveAt: new Date(),
          },
          create: {
            email,
            emailVerifiedAt: new Date(),
            dateOfBirth: birthDate,
            ageVerifiedAt: new Date(),
            displayName: body.displayName,
            role: adminEmails.has(email) ? 'ADMIN' : 'USER',
            signupIpHash: ipHash,
          },
        });
      });
      await services.db.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date(), userId: user.id },
      });
      const tokens = await issueTokens(services.db, services.config, {
        id: user.id,
        role: user.role,
      });
      await logActivity(services.db, {
        userId: user.id,
        actorType: 'USER',
        action: 'auth.signed_in',
        targetType: 'User',
        targetId: user.id,
        requestId: request.id,
      });
      const agent = await services.db.agent.findUnique({
        where: { userId: user.id },
        select: { id: true, onboardingCompletedAt: true },
      });
      return {
        ...tokens,
        user: publicUser(user),
        hasAgent:
          agent?.onboardingCompletedAt !== null && agent?.onboardingCompletedAt !== undefined,
      };
    },
  });

  app.post('/v1/auth/refresh', async (request) => {
    const body = parseWith(refreshTokenSchema, request.body);
    const user = await verifyRefreshToken(services.db, services.config, body.refreshToken);
    return issueTokens(services.db, services.config, user);
  });

  app.post('/v1/auth/verify-edu/request', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    handler: async (request) => {
      const auth = await requireAuth(request, services.config);
      const body = parseWith(verifyEduRequestSchema, request.body);
      const email = body.email.toLowerCase();
      const code = await createAndDeliverEmailOtp(services, {
        userId: auth.id,
        email,
        purpose: 'verify_edu',
        ipHash: sha256(request.ip),
      });
      return {
        ok: true,
        expiresIn: services.config.OTP_TTL_SECONDS,
        ...(services.config.NODE_ENV !== 'production' &&
        services.config.OTP_DELIVERY_MODE === 'log' &&
        services.config.ALLOW_DEVELOPMENT_OTP_DISPLAY === 'true'
          ? { developmentCode: code }
          : {}),
      };
    },
  });

  app.post('/v1/auth/verify-edu', async (request) => {
    const auth = await requireAuth(request, services.config);
    const body = parseWith(verifyEduSchema, request.body);
    const challenge = await services.db.otpChallenge.findFirst({
      where: {
        email: body.email.toLowerCase(),
        purpose: 'verify_edu',
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (challenge === null || !constantTimeEqual(challenge.codeHash, sha256(body.code))) {
      throw new ApiError(401, 'OTP_INVALID', 'The verification code is invalid or expired.');
    }
    await services.db.$transaction([
      services.db.user.update({ where: { id: auth.id }, data: { eduVerifiedAt: new Date() } }),
      services.db.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      }),
    ]);
    return { ok: true, unlocked: ['campus_introductions', 'campus_exchange', 'campus_groups'] };
  });

  app.post('/v1/auth/verify-phone/request', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    handler: async (request) => {
      const auth = await requireAuth(request, services.config);
      const body = parseWith(verifyPhoneRequestSchema, request.body);
      const code = createOtp();
      await services.db.otpChallenge.create({
        data: {
          userId: auth.id,
          email: `phone:${body.phone}`,
          codeHash: sha256(code),
          purpose: 'verify_phone',
          expiresAt: new Date(Date.now() + services.config.OTP_TTL_SECONDS * 1_000),
          ipHash: sha256(request.ip),
        },
      });
      await deliverPhoneOtp(services, body.phone, code);
      return {
        ok: true,
        expiresIn: services.config.OTP_TTL_SECONDS,
        ...(services.config.NODE_ENV !== 'production' &&
        services.config.PHONE_OTP_PROVIDER === 'log' &&
        services.config.ALLOW_DEVELOPMENT_OTP_DISPLAY === 'true'
          ? { developmentCode: code }
          : {}),
      };
    },
  });

  app.post('/v1/auth/verify-phone', async (request) => {
    const auth = await requireAuth(request, services.config);
    const body = parseWith(verifyPhoneSchema, request.body);
    const challenge = await services.db.otpChallenge.findFirst({
      where: {
        userId: auth.id,
        email: `phone:${body.phone}`,
        purpose: 'verify_phone',
        consumedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: 6 },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (challenge === null) {
      throw new ApiError(401, 'PHONE_OTP_INVALID', 'The phone verification code is invalid.');
    }
    await services.db.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    if (!constantTimeEqual(challenge.codeHash, sha256(body.code))) {
      throw new ApiError(401, 'PHONE_OTP_INVALID', 'The phone verification code is invalid.');
    }
    const verifiedAt = new Date();
    await services.db.$transaction([
      services.db.user.update({
        where: { id: auth.id },
        data: { phone: body.phone, phoneVerifiedAt: verifiedAt },
      }),
      services.db.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: verifiedAt },
      }),
    ]);
    return { ok: true, phone: body.phone, verifiedAt: verifiedAt.toISOString() };
  });
};
