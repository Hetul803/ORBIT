# Operations runbook

## Health

- `GET /health` proves the API process is alive.
- `GET /ready` performs a database round trip.
- `GET /v1/admin/metrics` reports job duration, conversation/redaction counts, moderation depth, daily cost, signups, surfaced introductions, reveal rate, and day-14 retention.
- `GET /v1/admin/costs` breaks usage down by provider, model, task, and user.

## Routine commands

```bash
docker compose -f infra/docker-compose.yml ps
docker compose -f infra/docker-compose.yml logs -f api worker
pnpm worker:once
pnpm --filter @orbit/db migrate:deploy
```

The once command executes watchers, consolidation, due deletion, nightly matching, and brief generation sequentially, then exits nonzero on failure. In scheduled mode BullMQ registers stable scheduler IDs, so restarts do not create duplicate schedules.

## Model-cost incident

1. Set `GLOBAL_DAILY_COST_CAP_CENTS=0` and restart API/worker to stop new paid calls.
2. Inspect `/v1/admin/costs` and model-call rows by request, run, task, user, provider, and model.
3. Revoke the affected platform credential; user BYOK values can be replaced from Settings without a deployment.
4. Correct routing or retry configuration, restore a conservative cap, and run a stub-provider smoke test before enabling paid traffic.

## Privacy or safety incident

1. Stop workers and block access to affected introduction IDs.
2. Search activity metadata and content hashes; never copy secret fields into tickets or logs.
3. Resolve open reports through the admin moderation endpoint so the action is auditable.
4. Rotate access/refresh/export secrets when implicated; rotate the field encryption key only with a scripted decrypt-and-reencrypt migration.
5. Resume with the stub provider first and verify redaction-failed content remains absent from list, detail, transcript, and decision routes.

## Database restore

Restore into an isolated database, run `prisma migrate status`, validate append-only triggers, and execute the integration suite before changing the production connection string. Never seed a production database; `ALLOW_DEVELOPMENT_SEED` must be absent or false.

## Deploy checklist

Use managed PostgreSQL with pgvector, Redis with persistence, TLS at every public boundary, an S3-compatible private bucket, centralized OpenTelemetry collection, a Redis-backed realtime fanout, unique production secrets, verified OTP sender domains, tested backups, and separate staging credentials. Run migrations as a one-shot release job before rolling API and worker instances.
