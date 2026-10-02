# ORBIT

ORBIT is a private agent network: each person owns a persistent representative that learns from explicit answers and corrections, finds useful people and opportunities, and asks before anything leaves the user's private space. The defensible core is an ORVIN-inspired, user-owned graph of versioned memories, skills, validation evidence, outcome feedback, lineage, and receipts—not a feed or a generic chat wrapper.

This repository contains an Expo iOS/Android/web app, a Fastify API, PostgreSQL with pgvector, Redis/BullMQ workers, a provider-independent LLM router, public-web watchers, read-only Gmail OAuth, Expo push delivery, production email/SMS OTP adapters, export verification, and private-staging deployment assets.

The app never substitutes demo records for failed or empty API responses. External capabilities are visibly unavailable until their credentials and feature flags are configured.

## Current product

| Surface     | Working behavior                                                                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity    | Email OTP, hard 18+ account gate, rotating refresh tokens, optional `.edu` and phone verification, enumeration-resistant responses, abuse limits.                                            |
| Agent setup | Blank-account interview; bounded model-generated follow-ups when a provider is configured, explicit bounded local sequence otherwise; agent naming only after the interview.                 |
| Memory      | ChatGPT/Claude JSON or ZIP import without retaining the archive; inspect, correct, delete, and re-embed durable facts.                                                                       |
| Today       | Real brief data, runs, watcher hits, introductions, and approvals; honest loading, empty, and error behavior.                                                                                |
| Circle      | pgvector candidate retrieval, outcome-conditioned reranking, redacted transcripts, independent verdict, mutual field-intersection reveal, and outcomes.                                      |
| Ask         | Natural-language intent/watcher/task interpretation, functional example pills, and explicit autonomy selection.                                                                              |
| Intents     | Dedicated controls for all intent kinds, parameters, pause-until, and activity.                                                                                                              |
| Watchers    | Confirmed natural-language specs; public URL, HTML/JSON/JSON-LD, RSS/Atom, and configured search API sources; robots/SSRF/size/timeout/per-host protections; deduplicated change-aware hits. |
| Gmail       | Feature-gated, read-only OAuth using `gmail.readonly`, encrypted refresh tokens, revoke/disconnect, last-10-message sync, triage, editable drafts, and audit receipts.                       |
| Skills      | Versioned creation/correction, validation evidence, lineage, share/adopt flow, group shelves, and reviewable propagation updates.                                                            |
| Exchange    | Complete have/want form, edit/delete, condition/urgency/cash range/trade preference, agent negotiation transcript, mutual approval, and no-money handoff notice.                             |
| Safety      | Block, mute, report, moderation queue, role enforcement, safety plans, check-ins, due reminders, and append-only activity.                                                                   |
| Settings    | Push registration/preferences, encrypted BYOK credentials, signed export, seven-day deletion countdown/cancel, and destructive confirmations.                                                |

See [Pass 2 verification](docs/PASS2_VERIFICATION.md) for exact test evidence, limitations, and launch readiness. [Provider setup and 100-user costs](docs/PROVIDER_SETUP_AND_COSTS.md) lists every external credential, setup order, current official price reference, and the beta unit-economics model.

## Start locally

Prerequisites: Docker Desktop, Node.js 22.13 or newer, and pnpm 11.

```bash
git clone https://github.com/Hetul803/ORBIT.git
cd ORBIT
corepack enable
corepack prepare pnpm@11.25.0 --activate
cp .env.example .env
pnpm install --frozen-lockfile
docker compose -f infra/docker-compose.yml up --build
```

The local Compose stack starts PostgreSQL/pgvector on 5432, Redis, MinIO, the API on `http://localhost:4100`, and the worker. It applies migrations and may seed only when the explicit local seed configuration is enabled. Production and staging must never seed.

Start Expo separately:

```bash
pnpm mobile
```

Press `w` for web. Native development requires Xcode for iOS or Android Studio/ADB for Android.

Development OTP display is intentionally off by default. To show a local code in the app, start the API with the explicit flag:

```bash
ALLOW_DEVELOPMENT_OTP_DISPLAY=true OTP_DELIVERY_MODE=log pnpm api
```

Never set that flag in staging or production. In production, log-mode email or phone delivery fails closed.

## API URL on all four development targets

Every request uses the single `EXPO_PUBLIC_API_URL` resolver in `apps/mobile/src/api-url.ts`. An explicit value always wins; production builds fail closed when it is absent.

| Target                      | Configuration                                   | Notes                                                                                                                                                      |
| --------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web                         | `EXPO_PUBLIC_API_URL=http://localhost:4100`     | The development fallback also derives the browser host and port 4100.                                                                                      |
| iOS Simulator               | `EXPO_PUBLIC_API_URL=http://localhost:4100`     | The simulator can reach the Mac loopback address.                                                                                                          |
| Android Emulator            | `EXPO_PUBLIC_API_URL=http://10.0.2.2:4100`      | `10.0.2.2` maps to the development machine.                                                                                                                |
| Physical iOS/Android device | `EXPO_PUBLIC_API_URL=http://<YOUR-LAN-IP>:4100` | Phone and computer must share a network; allow port 4100 through the firewall. Expo can derive its development host, but an explicit value is recommended. |

Set `EXPO_PUBLIC_WS_URL` to the same host with `ws://` and `/v1/stream`, for example `ws://10.0.2.2:4100/v1/stream`. Production must use HTTPS/WSS.

## Configuration

Copy `.env.example`. Keys are never committed.

| Capability            | Required variables                                                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core                  | `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `FIELD_ENCRYPTION_KEY`, `EXPORT_SIGNING_SECRET`                                                                         |
| Email OTP             | `OTP_DELIVERY_MODE=resend`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` on a verified domain                                                                                                          |
| SMS OTP               | `PHONE_OTP_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_PHONE`                                                                                                     |
| Gmail                 | `GMAIL_INTEGRATION_ENABLED=true`, Google OAuth client ID/secret, callback URI, and mobile redirect URI                                                                                          |
| LLM and embeddings    | `LLM_DEFAULT_PROVIDER`, model IDs, explicit per-million-token cost metadata, and the selected provider key; real memory vectors currently require `OPENAI_API_KEY` and `OPENAI_EMBEDDING_MODEL` |
| Search-query watchers | `SEARCH_API_ENDPOINT` and `SEARCH_API_KEY`; direct URL/RSS/JSON watchers need no key                                                                                                            |
| Push                  | `EXPO_PUBLIC_EAS_PROJECT_ID`; worker delivery uses the Expo push service                                                                                                                        |
| Monitoring            | `SENTRY_DSN`, `SENTRY_ENVIRONMENT`                                                                                                                                                              |
| Mobile networking     | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WS_URL`                                                                                                                                                     |

Without provider keys:

- direct public URL/RSS/JSON watchers work;
- interview uses the visibly labelled bounded local sequence;
- Gmail and search-query watchers are visibly unavailable;
- no fake embeddings are written;
- remote push cannot register on web or a simulator;
- Resend and Twilio delivery are unavailable, while explicit development OTP display can be enabled locally.

## Verification commands

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm benchmark:retrieval
pnpm eval:reranker
pnpm smoke:web-watcher
pnpm verify:export -- ./orbit-export.zip
```

The test suite uses a real PostgreSQL/pgvector database for API and worker integration tests. `smoke:web-watcher` fetches a real public HTML product page inside a rollback transaction, so it leaves no fixture rows.

## Private staging

`infra/staging/deploy.sh` is the one-command release entry point for a pre-provisioned private host. It reads JSON secrets from AWS Secrets Manager, requires TLS PostgreSQL and Redis URLs, builds API/worker/migration images, runs migrations, starts Caddy with automatic TLS, and health-checks `/ready`.

```bash
ORBIT_STAGING_SECRET_ID=orbit/staging \
STAGING_DOMAIN=staging.example.com \
./infra/staging/deploy.sh
```

The host, DNS, managed PostgreSQL/pgvector, managed Redis, AWS permissions, provider accounts, and mobile builds must be provisioned by the owner before this command can produce a public staging URL. See [Operations runbook](docs/RUNBOOK.md).

## Architecture and safety

```text
Expo app (iOS / Android / web)
  ├─ secure tokens + TanStack Query
  ├─ REST ───────────────────────────┐
  └─ authenticated WebSocket events ┤
                                     ▼
Fastify API ── Zod contracts ── PostgreSQL 16 + pgvector
  ├─ identity, consent, safety, Gmail, export/deletion
  ├─ append-only activity + per-call cost ledger
  └─ provider router + encrypted user BYOK
                                     │
Redis/BullMQ workers                 │
  ├─ pgvector retrieval → rerank → bounded agent dialogue
  ├─ two-pass redaction → independent verdict → brief
  ├─ public-web watchers + exchange proposals + push
  └─ ORVIN backbone: versioned skills, evidence, lineage,
     corrections, confidence routing, outcomes, and receipts
```

Additional documentation: [Architecture](docs/ARCHITECTURE.md), [API](docs/API.md), [Safety](docs/SAFETY.md), [Export verification](docs/EXPORT_VERIFICATION.md), [provider setup and 100-user costs](docs/PROVIDER_SETUP_AND_COSTS.md), and [Pass 2 verification](docs/PASS2_VERIFICATION.md).

## Known external validation gates

The implementations exist, but these outcomes cannot be truthfully called production-validated until owner-supplied accounts or hardware are available:

- verified Resend sending domain and Twilio number;
- verified Google OAuth application and live Gmail account;
- Expo EAS project and physical iOS/Android devices;
- production LLM/embedding and search API keys;
- managed staging infrastructure, DNS, and secret-manager access;
- App Store/Play Store signing and distribution;
- hosted GitHub Actions after the repository account/billing restriction is cleared.

Each incomplete validation item is tracked in GitHub and detailed in `docs/PASS2_VERIFICATION.md`.

## License

Copyright © 2026 ORBIT. The source is publicly inspectable for evaluation, but no license to copy, modify, redistribute, or operate it is granted; see [LICENSE](LICENSE).
