# ORBIT

## What ORBIT is

ORBIT is a private agent network where a persistent representative learns how you think, finds useful people and opportunities, and brings you only decisions that deserve your attention. It combines consent-gated introductions, exchange matching, an agent inbox, watchers, auditable task runs, and teach-once reusable skills in one calm mobile product. Its defensibility comes from a user-owned, versioned skill-and-memory graph whose validated procedures improve with corrections while unfamiliar steps still fall back to stronger general reasoning.

The repository is a production-shaped TypeScript monorepo: an Expo iOS/Android/web client, Fastify API, BullMQ workers, PostgreSQL with pgvector, Redis, MinIO-compatible storage, and provider-independent LLM routing. It runs without paid keys through deterministic local providers; add provider credentials later without changing application code.

## Product surfaces

| Surface                | What the user can do                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in                | Request and verify an email OTP, pass the hard 18+ gate, refresh a session, and optionally verify phone or `.edu` identity.                               |
| Agent setup            | Name a persistent agent, complete the six-turn interview by text, calibrate its voice, and choose trust defaults.                                         |
| History import         | Import a ChatGPT or Claude JSON/ZIP, review extracted durable facts, retain no raw archive, and delete or correct memory later.                           |
| Today                  | Read a cached daily brief of completed work, live runs, watcher hits, introductions, receipts, and decisions needing attention.                           |
| Circle                 | Browse consent-safe introductions using a virtualized list, open verdicts and redacted transcripts, then reveal or decline.                               |
| Ask                    | Describe a goal in natural language, inspect the interpreted action, select autonomy, and create an intent, watcher, or task.                             |
| Skills                 | Inspect, create, edit, share, and adopt versioned reusable procedures with confidence, validation evidence, permissions, fallback, and learning receipts. |
| You                    | Manage identity, memory, trust, verification, activity, connections, groups, exchange, safety, export, deletion, notifications, and BYOK keys.            |
| Introduction detail    | Read the independent verdict and redacted agent transcript; mutual field-level consent is required before either identity is exposed.                     |
| Inbox                  | Review requests triaged by screening rules, edit an agent-drafted reply, and explicitly approve or decline sending.                                       |
| Watchers               | Create scheduled monitors, pause them, inspect deduplicated hits, and see the next run.                                                                   |
| Runs                   | Inspect each step, duration, cost, approval boundary, result, and first-run-versus-current learning receipt.                                              |
| Exchange               | Post wants/haves, receive agent-negotiated proposal cards, mutually accept, and arrange a public handoff; ORBIT handles no money and charges no fee.      |
| Groups and skill shelf | Join a campus, club, lab, or class by code and adopt shared skills into a private, editable copy.                                                         |
| Safety                 | Block or mute another user, report content, create a shareable check-in plan, and review the append-only activity trail.                                  |

The Expo router also supplies focused screens for new/edit skill, new watcher, new exchange item, connection status, verification, memory, trust controls, activity, and settings. Every network GET can return cached data when offline; mutation screens show explicit pending/error states and do not pretend that server work succeeded.

## Start locally

Prerequisites: Docker Desktop, Node.js 22.13 or newer, pnpm 11, and Xcode or Android Studio for a native simulator.

```bash
git clone https://github.com/Hetul803/ORBIT.git
cd ORBIT
corepack enable
corepack prepare pnpm@11.25.0 --activate
cp .env.example .env
pnpm install --frozen-lockfile
docker compose -f infra/docker-compose.yml up --build
```

That one Compose command migrates and seeds PostgreSQL, then starts Postgres, Redis, MinIO, the API on `http://localhost:4100`, and the recurring worker. The demo account is `demo@orbit.local`; development OTP codes are returned by the request endpoint, and the seed also contains 40 clearly fictional users.

In another terminal, start the app:

```bash
pnpm mobile
```

Press `i` for iOS, `a` for Android, or `w` for web. For Android Emulator networking, set `EXPO_PUBLIC_API_URL=http://10.0.2.2:4100` and `EXPO_PUBLIC_WS_URL=ws://10.0.2.2:4100/v1/stream`; an iOS simulator can use `localhost`.

Useful operations:

```bash
# Trigger watchers, consolidation, deletion processing, nightly matching, and brief generation once.
pnpm worker:once

# Run the same static gates used by CI.
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:coverage

# Verify the production web bundle and native project generation.
pnpm --filter @orbit/mobile build
pnpm --filter @orbit/mobile exec expo prebuild --no-install --platform android
pnpm --filter @orbit/mobile exec expo prebuild --no-install --platform ios
```

To run services outside Docker, start only the dependencies, then migrate, seed, and launch processes:

```bash
docker compose -f infra/docker-compose.yml up -d postgres redis minio
pnpm db:generate
pnpm --filter @orbit/db migrate:deploy
pnpm db:seed
pnpm api
pnpm worker
```

## Environment

Copy `.env.example`; the stub model provider and log-mode OTP require no external keys.

| Variable                                                                         | Purpose and source                                                                                                                             |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`, `REDIS_URL`                                                      | Created by local Compose; use managed PostgreSQL/pgvector and Redis URLs in production.                                                        |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `EXPORT_SIGNING_SECRET`               | Generate independent random secrets, for example with `openssl rand -base64 48`.                                                               |
| `FIELD_ENCRYPTION_KEY`                                                           | Exactly 32 random bytes encoded as base64: `openssl rand -base64 32`; encrypts BYOK credentials.                                               |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                                            | Optional production email OTP delivery from a verified [Resend](https://resend.com/) account.                                                  |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`            | Optional platform keys from the respective provider; user BYOK values can instead be stored in Settings.                                       |
| `LLM_DEFAULT_PROVIDER`, `LLM_MODEL_*`, `LLM_CHEAP_FALLBACK_MODEL`                | Choose the provider and model independently for interview, conversation, rerank, judge, draft, redaction, embeddings, skills, and Ask routing. |
| `USER_DAILY_COST_CAP_CENTS`, `GLOBAL_DAILY_COST_CAP_CENTS`                       | Hard pre-call spending stops, recorded against the real model-call ledger.                                                                     |
| `S3_*`                                                                           | Local values point to MinIO; replace with an S3-compatible object-store endpoint and credentials.                                              |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WS_URL`                                      | API and authenticated realtime stream URLs compiled into the mobile client.                                                                    |
| `NIGHTLY_MATCH_CRON`, `WATCHER_TICK_CRON`, `CONSOLIDATION_CRON`, `DELETION_CRON` | BullMQ schedules using standard cron expressions.                                                                                              |
| `ADMIN_EMAILS`, `INTRODUCTIONS_PER_USER_PER_DAY`, `DELETION_GRACE_DAYS`          | Operational policy controls.                                                                                                                   |

Never commit `.env`; production must replace every development secret and disable development seeding.

## Architecture

```text
Expo Router app (iOS / Android / web)
  ├─ secure token storage + offline GET cache
  ├─ REST ──────────────────────────────┐
  └─ authenticated WebSocket events ────┤
                                        ▼
Fastify API ── shared Zod contracts ── PostgreSQL 16 + pgvector
  │   ├─ OTP/JWT, age gate, consent, safety, export/deletion
  │   └─ append-only activity and per-call cost ledger
  │
  └─ provider-independent ModelRouter
      ├─ per-task models + encrypted user BYOK
      └─ retry → circuit breaker → deterministic safe fallback

Redis/BullMQ scheduler
  └─ workers: candidate filtering → rerank → bounded agent dialogue
       → two-pass redaction → independent judge → introduction/brief
       ├─ watchers + exchange proposal matching
       ├─ memory consolidation
       └─ ORVIN backbone: validated skill versions, correction evidence,
          confidence routing, fallback, and learning receipts
```

See [Architecture](docs/ARCHITECTURE.md), [Safety](docs/SAFETY.md), [API](docs/API.md), and the [Runbook](docs/RUNBOOK.md).

## Testing and safety guarantees

Vitest covers the agent pipeline above the required 80% threshold, adversarial PII redaction, malformed model outputs, provider fallback, and BYOK isolation. GitHub Actions uses real PostgreSQL/pgvector and Redis service containers to prove age gating, authenticated export, nightly matching, mutually independent reveal decisions, hidden redaction failures, watcher deduplication, and database-backed cost caps; Maestro describes the mobile signup-to-reveal journey in `apps/mobile/.maestro`.

## Deliberately not built yet

These need external accounts, legal/product decisions, or distribution authority and therefore have working local boundaries but not fabricated integrations:

- Native speech-to-text for the optional voice interview; text interview and the `inputMode` contract work today.
- Production SMS delivery; development phone OTP and the verification state machine work today.
- Google/Microsoft/IMAP connection authorization and write adapters; encrypted connection records, scopes, status, and the connection UI exist.
- Remote push delivery; in-app realtime events and local notification preferences exist.
- App Store and Play Store signing, compliance forms, and release submission; iOS/Android projects generate successfully.
- Production object uploads; MinIO/S3 infrastructure is present, while history imports are intentionally parsed in memory and never retained.

Each item is represented by a GitHub issue in the public backlog.

## License

Copyright © 2026 ORBIT. The source is publicly inspectable for evaluation, but no license to copy, modify, redistribute, or operate it is granted; see [LICENSE](LICENSE).
