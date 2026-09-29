import { randomBytes } from 'node:crypto';

import type { PrismaClient } from '@orbit/db';
import type { FastifyRequest } from 'fastify';
import { jwtVerify, SignJWT } from 'jose';

import type { ApiConfig } from './config.js';
import { ApiError } from './errors.js';
import { sha256 } from './crypto.js';

export interface AuthenticatedUser {
  readonly id: string;
  readonly role: 'USER' | 'MODERATOR' | 'ADMIN';
}

const secret = (value: string): Uint8Array => new TextEncoder().encode(value);

export const issueTokens = async (
  db: PrismaClient,
  config: ApiConfig,
  user: AuthenticatedUser,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> => {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = await new SignJWT({ role: user.role, kind: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt(now)
    .setExpirationTime(now + config.JWT_ACCESS_TTL_SECONDS)
    .setIssuer('orbit-api')
    .setAudience('orbit-mobile')
    .sign(secret(config.JWT_ACCESS_SECRET));

  const tokenId = randomBytes(32).toString('base64url');
  const refreshToken = await new SignJWT({ kind: 'refresh', tokenId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt(now)
    .setExpirationTime(now + config.JWT_REFRESH_TTL_SECONDS)
    .setIssuer('orbit-api')
    .setAudience('orbit-mobile')
    .sign(secret(config.JWT_REFRESH_SECRET));
  await db.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date((now + config.JWT_REFRESH_TTL_SECONDS) * 1000),
    },
  });
  return { accessToken, refreshToken, expiresIn: config.JWT_ACCESS_TTL_SECONDS };
};

export const verifyRefreshToken = async (
  db: PrismaClient,
  config: ApiConfig,
  token: string,
): Promise<AuthenticatedUser> => {
  try {
    const result = await jwtVerify(token, secret(config.JWT_REFRESH_SECRET), {
      issuer: 'orbit-api',
      audience: 'orbit-mobile',
    });
    if (result.payload.kind !== 'refresh' || result.payload.sub === undefined) {
      throw new Error('Invalid token kind');
    }
    const record = await db.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (record?.revokedAt !== null || record.expiresAt <= new Date()) {
      throw new Error('Refresh token was revoked or expired');
    }
    const user = await db.user.findUnique({ where: { id: result.payload.sub } });
    if (user?.status !== 'ACTIVE') throw new Error('User is unavailable');
    await db.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
    return { id: user.id, role: user.role };
  } catch {
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'The refresh token is invalid or expired.');
  }
};

export const requireAuth = async (
  request: FastifyRequest,
  config: ApiConfig,
): Promise<AuthenticatedUser> => {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ') !== true) {
    throw new ApiError(401, 'AUTH_REQUIRED', 'A valid access token is required.');
  }
  return verifyAccessToken(header.slice('Bearer '.length), config);
};

export const verifyAccessToken = async (
  token: string,
  config: ApiConfig,
): Promise<AuthenticatedUser> => {
  try {
    const result = await jwtVerify(token, secret(config.JWT_ACCESS_SECRET), {
      issuer: 'orbit-api',
      audience: 'orbit-mobile',
    });
    if (
      result.payload.kind !== 'access' ||
      result.payload.sub === undefined ||
      (result.payload.role !== 'USER' &&
        result.payload.role !== 'MODERATOR' &&
        result.payload.role !== 'ADMIN')
    ) {
      throw new Error('Invalid access token claims');
    }
    return { id: result.payload.sub, role: result.payload.role };
  } catch {
    throw new ApiError(401, 'INVALID_ACCESS_TOKEN', 'The access token is invalid or expired.');
  }
};

export const requireAdmin = async (
  request: FastifyRequest,
  config: ApiConfig,
): Promise<AuthenticatedUser> => {
  const user = await requireAuth(request, config);
  if (user.role !== 'ADMIN' && user.role !== 'MODERATOR') {
    throw new ApiError(403, 'ADMIN_REQUIRED', 'This route is restricted to moderation staff.');
  }
  return user;
};
