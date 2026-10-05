import { randomUUID } from 'node:crypto';

import { trace, type Span } from '@opentelemetry/api';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import websocket from '@fastify/websocket';
import type { PrismaClient } from '@orbit/db';
import * as Sentry from '@sentry/node';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { z } from 'zod';

import { verifyAccessToken } from './auth.js';
import type { ApiConfig } from './config.js';
import { ApiError } from './errors.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCoreRoutes } from './routes/core.js';
import { registerGmailRoutes } from './routes/gmail.js';
import { registerLifeRoutes } from './routes/life.js';
import { registerPushRoutes } from './routes/push.js';
import { registerProfileRoutes } from './routes/profile.js';
import { registerProactiveRoutes } from './routes/proactive.js';
import { registerSafetyRoutes } from './routes/safety.js';
import { registerSocialRoutes } from './routes/social.js';
import { registerWorkRoutes } from './routes/work.js';
import { createServices, type Services } from './services.js';

const tracer = trace.getTracer('orbit-api');

const registerObservability = (app: FastifyInstance): void => {
  const spans = new WeakMap<FastifyRequest, Span>();
  app.addHook('onRequest', (request, _reply, done) => {
    const span = tracer.startSpan(`${request.method} ${request.routeOptions.url ?? request.url}`, {
      attributes: {
        'http.request.method': request.method,
        'url.path': request.url,
        'orbit.request_id': request.id,
      },
    });
    spans.set(request, span);
    done();
  });
  app.addHook('onResponse', async (request, reply) => {
    const span = spans.get(request);
    span?.setAttribute('http.response.status_code', reply.statusCode);
    span?.end();
  });
  app.addHook('onError', async (request, _reply, error) => {
    spans.get(request)?.recordException(error);
  });
};

const registerRealtime = async (app: FastifyInstance, services: Services): Promise<void> => {
  await app.register(websocket);
  app.get('/v1/stream', { websocket: true }, async (socket, request) => {
    const query = z.object({ access_token: z.string().optional() }).parse(request.query);
    const header = request.headers.authorization;
    const token =
      query.access_token ?? (header?.startsWith('Bearer ') === true ? header.slice(7) : undefined);
    if (token === undefined) {
      socket.close(1008, 'Authentication required');
      return;
    }
    try {
      const auth = await verifyAccessToken(token, services.config);
      services.realtime.add(auth.id, socket);
      socket.send(
        JSON.stringify({
          type: 'stream.ready',
          at: new Date().toISOString(),
          payload: { requestId: request.id },
        }),
      );
      socket.on('close', () => services.realtime.remove(auth.id, socket));
    } catch {
      socket.close(1008, 'Invalid access token');
    }
  });
};

export const buildApp = async (db: PrismaClient, config: ApiConfig): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: [
        'req.headers.authorization',
        'req.body.apiKey',
        'req.body.refreshToken',
        'res.headers.set-cookie',
      ],
    },
    requestIdHeader: 'x-request-id',
    genReqId: (request) =>
      typeof request.headers['x-request-id'] === 'string'
        ? request.headers['x-request-id']
        : randomUUID(),
  });
  const services = createServices(db, config);
  registerObservability(app);
  await app.register(sensible);
  await app.register(helmet, { contentSecurityPolicy: false });
  const allowedOrigins = new Set(config.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()));
  await app.register(cors, {
    origin: (origin, callback) => {
      const allowed = origin === undefined || allowedOrigins.has(origin);
      callback(allowed ? null : new Error('Origin is not allowed'), allowed);
    },
    credentials: false,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(rateLimit, {
    max: 180,
    timeWindow: '1 minute',
    keyGenerator: (request) =>
      `${request.ip}:${request.headers.authorization?.slice(-16) ?? 'anonymous'}`,
  });
  await app.register(multipart, {
    limits: { files: 1, fileSize: 100 * 1024 * 1024, fields: 8 },
  });
  await registerRealtime(app, services);

  app.get('/health', () => ({ ok: true, service: 'orbit-api', at: new Date().toISOString() }));
  app.get('/ready', async () => {
    await db.$queryRaw`SELECT 1`;
    return { ok: true, database: 'ready', at: new Date().toISOString() };
  });

  registerAuthRoutes(app, services);
  registerCoreRoutes(app, services);
  registerProfileRoutes(app, services);
  registerProactiveRoutes(app, services);
  registerGmailRoutes(app, services);
  registerLifeRoutes(app, services);
  registerPushRoutes(app, services);
  registerSocialRoutes(app, services);
  registerWorkRoutes(app, services);
  registerSafetyRoutes(app, services);

  app.setNotFoundHandler((request) => {
    throw new ApiError(
      404,
      'ROUTE_NOT_FOUND',
      `No route matches ${request.method} ${request.url}.`,
    );
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      });
    }
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request did not match the contract.',
          requestId: request.id,
          details: error.issues,
        },
      });
    }
    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : undefined;
    if (statusCode === 429) {
      return reply.code(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Wait before trying again.',
          requestId: request.id,
        },
      });
    }
    request.log.error({ err: error, requestId: request.id }, 'unhandled request error');
    if (config.SENTRY_DSN !== undefined) {
      Sentry.captureException(error, { tags: { requestId: request.id } });
    }
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'ORBIT could not complete this request.',
        requestId: request.id,
      },
    });
  });
  return app;
};
