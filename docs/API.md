# API guide

The API listens on port 4100 by default. All `/v1` routes except OTP request/verify and public safety-plan share require `Authorization: Bearer <accessToken>`; errors use `{ "error": { "code", "message", "requestId", "details?" } }`.

## Route groups

- Auth: OTP request/verify, refresh, `.edu` request/verify, and phone request/verify.
- Identity: current user read/update/delete/export, agent create/read/update/interview/import, and memory read/correct/delete.
- Discovery: intents, daily brief, introductions, safe transcript, immutable decisions, outcomes, and authenticated WebSocket stream.
- Exchange: item CRUD, generated proposals, and mutual proposal decisions.
- Work: inbox approve/decline, screening rules, watchers and hits, runs, skills/share/adopt, groups/join/shelf, and Ask interpretation.
- Safety: blocks, mutes, reports, safety-plan share/check-in, and activity.
- Admin: moderation queue/actions, cost report, and product/worker metrics.

Shared request and response schemas live in `packages/shared/src/schemas.ts`. The Fastify routes deliberately parse again at the boundary even when a typed client is used, because mobile types are not an authorization mechanism.

## Development authentication

With `NODE_ENV=development` or `test` and `OTP_DELIVERY_MODE=log`, `POST /v1/auth/otp/request` returns `developmentCode`; production never does. The seeded demo user's stable seed challenge is `424242`, while requesting a fresh OTP is the recommended flow.

## Realtime

Connect to `/v1/stream?access_token=<token>` or pass the bearer header. Events are advisory invalidations; the client should refetch the authoritative resource after an introduction decision or run update.
