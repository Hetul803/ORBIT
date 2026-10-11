import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import type { ApiConfig } from './config.js';
import { ApiError } from './errors.js';

export const ALPHA_HARD_ACCOUNT_CAP = 100;

export const waitlistToken = async (email: string, config: ApiConfig): Promise<string> =>
  new SignJWT({ kind: 'verified-waitlist', email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('orbit-api')
    .setAudience('orbit-waitlist')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(config.JWT_ACCESS_SECRET));

export const verifiedWaitlistEmail = async (token: string, config: ApiConfig): Promise<string> => {
  try {
    const result = await jwtVerify(token, new TextEncoder().encode(config.JWT_ACCESS_SECRET), {
      issuer: 'orbit-api',
      audience: 'orbit-waitlist',
    });
    if (result.payload.kind !== 'verified-waitlist') throw new Error('Wrong token kind');
    return z.email().parse(result.payload.email).toLowerCase();
  } catch {
    throw new ApiError(
      401,
      'WAITLIST_VERIFICATION_REQUIRED',
      'Verify your email again to join the waitlist.',
    );
  }
};
