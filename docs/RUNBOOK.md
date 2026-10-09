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

## Railway founder deployment

This repository is prepared for a small Railway deployment with four services: `orbit-api`, `orbit-worker`, a **pgvector** PostgreSQL service, and Redis. The standard Railway PostgreSQL image does not include pgvector, so select Railway's pgvector template before creating the application services. The initial migration runs `CREATE EXTENSION IF NOT EXISTS vector`; it will fail against a database without that extension.

Do this in one Railway project, using a staging environment before production:

1. Create the pgvector PostgreSQL service and Redis service. Keep both private; neither needs a public domain.
2. Create `orbit-api` from this GitHub repository. In **Settings → Source**, leave Root Directory as `/`; in **Settings → Config as Code**, choose `/infra/railway/api.json`. Add public networking and generate a Railway domain. The API's deploy healthcheck is `/ready`.
3. Create `orbit-worker` from the same repository. Set Config as Code to `/infra/railway/worker.json`. It has no public domain and must have restart policy **Always**.
4. In Project Settings → Shared Variables, add variables common to API and worker. Reference the database and Redis service variables instead of copying connection strings. Add API-only values on `orbit-api` and worker-only schedule values on `orbit-worker`.
5. Deploy API first. Its configured pre-deploy step applies Prisma migrations. Wait for `/health` and `/ready` on the generated HTTPS domain. Deploy the worker only after the API migration succeeds.
6. Replace the generated Railway domain with `api.<your-domain>` after DNS/TLS is confirmed. Update `PUBLIC_API_URL`, the Google OAuth callback, and EAS `EXPO_PUBLIC_API_URL` together; a native build contains the chosen HTTPS API URL.

The committed service configuration files are [API](/Users/hetulpatel/Documents/ORBIT/infra/railway/api.json) and [worker](/Users/hetulpatel/Documents/ORBIT/infra/railway/worker.json). Railway's `PORT` is automatically honored by the API when `API_PORT` is not explicitly supplied.

### Railway variables and their source

Never paste a secret into source control, a mobile `EXPO_PUBLIC_*` value, a GitHub issue, or a chat transcript. Use Railway's Sensitive/Secret visibility for private values.

| Variable                                                                                           | Service      | Source / how to obtain it                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV=production`                                                                              | API + worker | Set directly.                                                                                                                                                                |
| `DATABASE_URL`                                                                                     | API + worker | Reference the pgvector service's `DATABASE_URL`. Do not use standard PostgreSQL without the vector extension.                                                                |
| `REDIS_URL`                                                                                        | API + worker | Reference the Redis service's `REDIS_URL`. Use the Railway private network URL.                                                                                              |
| `PUBLIC_API_URL`                                                                                   | API          | The final public HTTPS API domain, e.g. `https://api.example.com`.                                                                                                           |
| `ALLOWED_ORIGINS`                                                                                  | API          | Comma-separated web origins only; native iOS/Android uses the HTTPS API directly.                                                                                            |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`                                                          | API          | Independently generated 32+ character random values from the company password manager.                                                                                       |
| `FIELD_ENCRYPTION_KEY`                                                                             | API + worker | One base64 value that decodes to exactly 32 random bytes. It encrypts Google refresh tokens and user-supplied provider keys. Keep it stable while encrypted data exists.     |
| `EXPORT_SIGNING_SECRET`                                                                            | API          | Independently generated 32+ character random value, distinct from development and JWT keys.                                                                                  |
| `OTP_DELIVERY_MODE`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                                         | API          | Resend verified sending domain and API key. Use `resend` outside local development.                                                                                          |
| `PHONE_OTP_PROVIDER`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_PHONE`               | API          | Twilio account plus a verified SMS-capable number. Use `twilio` only after testing; do not retain `log` for a shared environment.                                            |
| `GMAIL_INTEGRATION_ENABLED=true`                                                                   | API          | Set only once the Google OAuth client and exact HTTPS callback below are configured.                                                                                         |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`                                             | API          | Google Cloud OAuth **Web application** client. Enable Gmail API and Google Calendar API in the same project.                                                                 |
| `GOOGLE_OAUTH_REDIRECT_URI`                                                                        | API          | Exact value `https://api.<your-domain>/v1/connections/gmail/callback`, registered verbatim in Google Cloud.                                                                  |
| `ORBIT_MOBILE_REDIRECT_URL=orbit://connections`                                                    | API          | Keep this deep-link target for the current Expo scheme.                                                                                                                      |
| `OPENROUTER_API_KEY`                                                                               | API + worker | The company OpenRouter key. Keep it server-side.                                                                                                                             |
| `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`                                                 | API + worker | Set directly.                                                                                                                                                                |
| `OPENROUTER_HTTP_REFERER`                                                                          | API + worker | Public company site URL, optional but recommended by OpenRouter.                                                                                                             |
| `OPENROUTER_APP_TITLE=ORBIT`                                                                       | API + worker | Set directly.                                                                                                                                                                |
| `OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small`                                         | API          | Set directly for the existing 1,536-dimensional pgvector columns.                                                                                                            |
| `LLM_DEFAULT_PROVIDER=openrouter`, all `LLM_MODEL_*`, `LLM_*_COST_CENTS_PER_MILLION_TOKENS`        | API + worker | Select approved OpenRouter model slugs and copy the model's current input/output prices as cents per million tokens. The service refuses paid routing without cost metadata. |
| `USER_DAILY_COST_CAP_CENTS`, `GLOBAL_DAILY_COST_CAP_CENTS`                                         | API + worker | Founder-selected guardrails; begin conservatively and watch `/v1/admin/costs`.                                                                                               |
| `SEARCH_API_KEY`, `SEARCH_API_ENDPOINT`                                                            | API + worker | Brave Search key for query-based watchers. Leave query watchers off until a key is set.                                                                                      |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT=production`                                                      | API + worker | Server Sentry project DSN and environment name.                                                                                                                              |
| `NIGHTLY_MATCH_CRON`, `WATCHER_TICK_CRON`, `CONSOLIDATION_CRON`, `DELETION_CRON`, `PUSH_TICK_CRON` | Worker       | Use the safe defaults in `.env.example` initially.                                                                                                                           |
| `ADMIN_EMAILS`                                                                                     | API          | Founder/admin email allow-list.                                                                                                                                              |

Do not set `API_PORT` on Railway. Railway supplies `PORT`, and ORBIT maps it automatically. `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WS_URL`, `EXPO_PUBLIC_EAS_PROJECT_ID`, and `EXPO_PUBLIC_SENTRY_DSN` belong in EAS environments, not Railway; they are embedded in mobile builds and are not secret.

Production API/worker start commands also require `SENTRY_ORG`, the service-specific `SENTRY_PROJECT`, private `SENTRY_AUTH_TOKEN`, and `SENTRY_RELEASE`. They inject debug IDs and upload source maps before boot; a missing value or upload failure stops startup. Configure and prove the release using the Sentry steps in `docs/LAUNCH_CHECKLIST.md`.

`TRUSTED_PROXY_CIDRS` is blank by default so callers cannot spoof forwarding headers. Set only verified ingress addresses/CIDRs after confirming the hosting contract. Validate distinct client-IP limits from two networks before inviting the cohort.

Model caps use atomic PostgreSQL budget reservations shared by API and worker, including embeddings, retries, and fallback attempts. Input allowance is conservatively estimated from UTF-8 bytes and message/tool overhead. Successful calls settle to measured usage; failed/ambiguous calls keep their allowance until the UTC day changes, so the dashboard can include reserved allowance as well as recorded cost. Verify `EMBEDDING_INPUT_COST_CENTS_PER_MILLION_TOKENS` is at least the selected model's current price. No software cap can bound provider charges if operator-supplied pricing is wrong.

### Google OAuth device callback

The mobile flow is: ORBIT opens Google in the system browser → Google calls the HTTPS API callback → the API stores encrypted tokens → the API redirects to `orbit://connections?gmail=connected` → the app refreshes status and starts its first sync. ORBIT requests only `gmail.readonly` and `calendar.readonly`; it does not request send or calendar-write scopes.

For Google OAuth testing mode, refresh tokens can expire after seven days. ORBIT marks an `invalid_grant` connection as expired and the Connections screen shows **Reconnect Google** rather than silently reporting a successful sync. Before adding anyone beyond approved test users, publish the OAuth consent screen, verify the company domain, and complete the required Google verification/security review for these restricted scopes.

## EAS, TestFlight, Android APK, updates, and Sentry

The tracked [EAS profiles](/Users/hetulpatel/Documents/ORBIT/apps/mobile/eas.json) are intentionally split by purpose:

- `development`: a development-client build for local Metro work; use this when testing native modules during development.
- `preview`: an installable internal Android **APK** and iOS ad-hoc build. It is not TestFlight.
- `production`: an App Store distribution build for TestFlight internal testing. It is not an App Store submission.

`Expo Go` does not validate this app's final native Sentry, updates, or notification integration. Use a development build, preview build, or TestFlight build. Push-to-talk, widgets, Siri, Live Activities, and share extensions remain unfinished; they are not features of this release.

1. In `apps/mobile`, authenticate with the company Expo account, then run `pnpm dlx eas-cli@latest init`. Copy the returned EAS project UUID only into EAS environment variables as `EXPO_PUBLIC_EAS_PROJECT_ID`.
2. Create EAS environments named `development`, `preview`, and `production`. Set `EXPO_PUBLIC_API_URL` to the matching HTTPS API domain, `EXPO_PUBLIC_WS_URL` to the matching `wss://` endpoint, `EXPO_PUBLIC_EAS_PROJECT_ID`, and `EXPO_PUBLIC_SENTRY_DSN` (public DSN). Do not set private server keys as `EXPO_PUBLIC_*` values.
3. For source maps, add `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` to EAS build environments. The token needs Sentry's CI release-upload permission. The dynamic Expo config activates the Sentry Expo plugin only when org and project are supplied; it does not write a token to the repository.
4. Build an Android APK: `pnpm dlx eas-cli@latest build --platform android --profile preview`. Download the signed APK from the EAS build page and install it on the founder's Android device. This is direct installation, not Google Play.
5. Build the iOS TestFlight artifact: `pnpm dlx eas-cli@latest build --platform ios --profile production`, then `pnpm dlx eas-cli@latest submit --platform ios --profile production`. The Apple Developer account must own `com.orbit.companion`.
6. In App Store Connect: **Apps → ORBIT → TestFlight → iOS Builds**, wait for Processing; then click the **+** next to **Internal Testing**, create/select a group, add the founder's App Store Connect user, and add the processed build. The founder installs Apple’s TestFlight app, opens the invitation, and installs ORBIT. Do not select **App Store → Add for Review** in this pass.
7. After `EXPO_PUBLIC_EAS_PROJECT_ID` exists, `app.config.ts` activates Expo Updates and uses the app-version runtime policy. Publish only a backward-compatible update with the matching environment: `pnpm dlx eas-cli@latest update --channel production --environment production --message "..."`.

The app declares `com.orbit.companion`, version `0.1.0`/build `1`, the ORBIT Ring icon, warm-bone splash screen, and Android notification permission. The unused microphone permission was removed in Pass 5. It uses system color scheme, has accessible source links, and uses light haptics for Catch actions. A new native build is required after any permission, icon, plugin, or native-module change.

## Private staging deployment

The repository ships a one-command deployment entry point for a pre-provisioned Linux host:

```bash
ORBIT_STAGING_SECRET_ID=orbit/staging \
STAGING_DOMAIN=staging.example.com \
./infra/staging/deploy.sh
```

The script requires `aws`, `docker`, `jq`, and `curl`. It reads one JSON object from AWS Secrets Manager into the deployment process, validates required values, rejects PostgreSQL URLs without `sslmode=require`, rejects Redis URLs that are not `rediss://`, builds the API/worker/migration images, runs `prisma migrate deploy`, starts API/worker/Caddy, and waits for the public TLS `/ready` endpoint. It never writes the secret JSON to disk.

Provision these resources before running it:

1. A private host with Docker Compose, ports 80/443 open, and an IAM role allowed to read only the staging secret.
2. DNS for `STAGING_DOMAIN` pointing to that host. Caddy obtains and renews its TLS certificate.
3. Managed PostgreSQL 16 with pgvector enabled and encrypted transit.
4. Managed Redis with TLS and persistence.
5. A Secrets Manager JSON object containing `DATABASE_URL`, `REDIS_URL`, `ALLOWED_ORIGINS`, independent JWT secrets, field-encryption/export secrets, Resend/Twilio credentials, and `SENTRY_DSN`. Optional Google/LLM/search credentials can live in the same object.
6. Mobile development or preview builds compiled with `EXPO_PUBLIC_API_URL=https://<STAGING_DOMAIN>` and `EXPO_PUBLIC_WS_URL=wss://<STAGING_DOMAIN>/v1/stream`.

After deployment:

```bash
curl --fail https://$STAGING_DOMAIN/health
curl --fail https://$STAGING_DOMAIN/ready
docker compose -f infra/staging/docker-compose.yml ps
docker compose -f infra/staging/docker-compose.yml logs --tail=200 api worker caddy
```

The deployment assets are tested syntactically in-repository. Provisioning the host, managed services, DNS, OAuth/sender accounts, and physical-device preview builds remains an owner operation; no staging environment is claimed live until those resources exist and the fresh-account matrix passes.
