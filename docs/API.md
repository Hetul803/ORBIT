# API guide

The API listens on port 4100 by default. All `/v1` routes except OTP request/verify and public safety-plan share require `Authorization: Bearer <accessToken>`; errors use `{ "error": { "code", "message", "requestId", "details?" } }`.

## Route groups

- Auth: OTP request/verify, refresh, `.edu` request/verify, and phone request/verify. Phone OTP is disabled unless a real delivery adapter is configured; log delivery cannot run in production.
- Identity: current user read/update/delete/export, agent create/read/update/interview/import, and memory read/correct/delete.
- Discovery: intents, daily brief, introductions, safe transcript, immutable decisions, outcomes, and authenticated WebSocket stream.
- Exchange: item CRUD, generated proposals, and mutual proposal decisions.
- Work: inbox approve/decline, screening rules, watchers and hits, runs, skills/share/adopt, groups/join/shelf, and Ask interpretation.
- Safety: blocks, mutes, reports, safety-plan share/check-in, and activity.
- Admin: moderation queue/actions, cost report, and product/worker metrics.
- Google: combined Gmail/Calendar read-only consent, OAuth callback, connection status, disconnect, and sync with persistent progress. The callback is public but requires a valid, single-use OAuth state.
- Life: Catch read, dismiss, snooze, copy receipt, and source-grounded Ask. `POST /v1/life/catch/:id/copied` records that a draft was copied; it does not send email.
- Public pages: `/privacy`, `/terms`, `/support`, `/health`, and `/ready`.

Shared request and response schemas live in `packages/shared/src/schemas.ts`. The Fastify routes deliberately parse again at the boundary even when a typed client is used, because mobile types are not an authorization mechanism.

## Development authentication

With `NODE_ENV=development` or `test`, `OTP_DELIVERY_MODE=log`, and the explicit `ALLOW_DEVELOPMENT_OTP_DISPLAY=true` flag, `POST /v1/auth/otp/request` may return `developmentCode` to a development client. The shipped mobile UI never displays or autofills that field. The flag defaults to false; production refuses both the flag and log delivery. Without configured delivery and without that explicit development flag, sign-in fails honestly.

There is no stable seed OTP. Migration `202610090013_remove_legacy_seed_otp` removes the old seeded challenge. Seeding requires the explicit development-only `ALLOW_DEVELOPMENT_SEED=true` and refuses production. A running API does not seed accounts.

OTP requests enforce email/IP limits and a 30-second resend cooldown. Verification atomically consumes the code, limits incorrect attempts, and checks the adult age gate. New-account admission enforces a per-IP daily cap and a deployment-wide account cap (50 by default). Production client-IP limits also depend on the verified trusted-ingress configuration described in `docs/LAUNCH_CHECKLIST.md`.

Every request gets a server-generated UUID, returned as `x-request-id`. Logs use route templates, not raw URLs or OAuth callback query strings. Model calls reserve their estimated cost under a database lock before primary, retry, or fallback execution. An ambiguous failure retains its reservation until the UTC day rolls over; reservations are allowances, not proof of billing.

## Realtime

Connect to `/v1/stream?access_token=<token>` or pass the bearer header. Events are advisory invalidations; the client should refetch the authoritative resource after an introduction decision or run update.
