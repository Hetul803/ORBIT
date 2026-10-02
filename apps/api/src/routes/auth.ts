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
    if (services.config.NODE_ENV === 'production') {
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
  });
  if (!response.ok)
    throw new ApiError(502, 'OTP_DELIVERY_FAILED', 'The sign-in code could not be delivered.');
};

const deliverPhoneOtp = async (services: Services, phone: string, code: string): Promise<void> => {
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

export const registerAuthRoutes = (app: FastifyInstance, services: Services): void => {
  app.post('/v1/auth/otp/request', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    handler: async (request) => {
      const body = parseWith(otpRequestSchema, request.body);
      const email = body.email.toLowerCase();
      const code = createOtp();
      const user = await services.db.user.findUnique({ where: { email } });
      await services.db.otpChallenge.create({
        data: {
          ...(user === null ? {} : { userId: user.id }),
          email,
          codeHash: sha256(code),
          purpose: 'sign_in',
          expiresAt: new Date(Date.now() + services.config.OTP_TTL_SECONDS * 1_000),
          ipHash: sha256(request.ip),
        },
      });
      await deliverEmailOtp(services, email, code);
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

  app.post('/v1/auth/otp/verify', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    handler: async (request) => {
      const body = parseWith(otpVerifySchema, request.body);
      const email = body.email.toLowerCase();
      const birthDate = new Date(`${body.dateOfBirth}T00:00:00.000Z`);
      const allowed = isAdult(birthDate);
      await services.db.ageGateAttempt.create({
        data: {
          emailHash: sha256(email),
          birthDate,
          allowed,
          ipHash: sha256(request.ip),
          ...(request.headers['user-agent'] === undefined
            ? {}
            : { userAgent: request.headers['user-agent'].slice(0, 500) }),
        },
      });
      if (!allowed) {
        throw new ApiError(
          403,
          'AGE_RESTRICTED',
          'ORBIT is available only to people who are 18 or older.',
        );
      }

      const challenge = await services.db.otpChallenge.findFirst({
        where: {
          email,
          purpose: 'sign_in',
          consumedAt: null,
          expiresAt: { gt: new Date() },
          attempts: { lt: 6 },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (challenge === null) {
        throw new ApiError(401, 'OTP_INVALID', 'The code is invalid or expired.');
      }
      await services.db.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      if (!constantTimeEqual(challenge.codeHash, sha256(body.code))) {
        throw new ApiError(401, 'OTP_INVALID', 'The code is invalid or expired.');
      }
      const adminEmails = new Set(
        services.config.ADMIN_EMAILS.split(',').map((entry) => entry.trim().toLowerCase()),
      );
      const user = await services.db.user.upsert({
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
        },
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
      return { ...tokens, user: publicUser(user) };
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
      const code = createOtp();
      await services.db.otpChallenge.create({
        data: {
          userId: auth.id,
          email: body.email.toLowerCase(),
          codeHash: sha256(code),
          purpose: 'verify_edu',
          expiresAt: new Date(Date.now() + services.config.OTP_TTL_SECONDS * 1_000),
          ipHash: sha256(request.ip),
        },
      });
      await deliverEmailOtp(services, body.email.toLowerCase(), code);
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
