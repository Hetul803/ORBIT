# ORBIT Pass 2 verification and implementation report

Date: 2026-10-02 (America/Chicago)
Repository: `Hetul803/ORBIT`
Baseline: `03a7570` audit, continued from `ef7a6d6`
Verification standard: observed behavior is reported separately from implemented-but-unvalidated external integrations.

## Executive result

ORBIT is a working local full-stack alpha. The web client, API, PostgreSQL/pgvector database, Redis worker schedules, public-web watcher, identity flow, interview, memory, intent, consent, exchange, skill, group, moderation, safety, deletion, export, and local verification paths run together. The production web bundle exports all 43 routes. No mobile query uses a hard-coded demo record or a persisted GET fallback after a network failure.

It is **not yet ready for an unrestricted public launch**. A private pilot still requires owner-supplied provider accounts, a deployed staging host, physical iOS/Android testing, store-signed builds, hosted CI recovery, and completion of the remaining UI consistency work listed below. The code correctly gates external capabilities rather than pretending they work.

Readiness by stage:

| Stage                            | Status        | Evidence / blocker                                                                                                                                                                             |
| -------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local web product evaluation     | Ready         | Fresh account, local OTP, interview, post-interview naming, Today, Ask examples, real public watcher fetch/hit, pause/resume, and delete confirmation were exercised through the rendered app. |
| Automated repository gate        | Ready locally | Formatting, lint, typecheck, all unit/integration/mobile tests, coverage command, production build, pgvector benchmark, reranker evaluation, and real-web smoke passed.                        |
| Internal native QA               | Not ready     | Xcode `simctl`, Android `adb`, and Maestro are not installed on this machine; neither native flow was executed.                                                                                |
| Ten-person private staging pilot | Not ready     | Deployment assets exist, but host, DNS, managed PostgreSQL/Redis, AWS secret, sender/OAuth/EAS accounts, and a live deploy are not provisioned.                                                |
| Public production launch         | Not ready     | Requires the pilot gates above plus store signing/review, privacy/legal review, abuse operations, real-provider load/cost validation, backup/restore drill, and reliability monitoring.        |

## Local app that was exercised

- Web UI: `http://localhost:8081`
- API health: `http://localhost:4100/health`
- API readiness: `http://localhost:4100/ready`
- API is currently started with `ALLOW_DEVELOPMENT_OTP_DISPLAY=true`; a brand-new email receives its code visibly in the local sign-in screen.
- API listens on the development machine's LAN address as well as loopback. Physical-device access still requires the phone to share the network and use the explicit LAN API URL.
- Worker schedules currently registered: nightly matching, watchers every 15 minutes, consolidation, deletion, and push delivery.

The browser walkthrough created `fresh-browser-check@orbit.local`, named its agent `Compass`, and left one active public product-price watcher with one genuine hit. That local account is a QA artifact, not fallback content and not part of application source.

## Automated evidence

| Gate                        | Result          | Observed detail                                                                                                                                            |
| --------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`         | PASS            | All matched files use Prettier formatting.                                                                                                                 |
| `pnpm lint`                 | PASS            | 13 dependency-aware tasks, zero warnings/errors.                                                                                                           |
| `pnpm typecheck`            | PASS            | 13 tasks across UI, shared, DB, LLM, agent, API, worker, and mobile.                                                                                       |
| `pnpm test`                 | PASS            | Agent 16, LLM 5, worker 6, API 10, mobile 32; packages with no tests exit explicitly with `--passWithNoTests`.                                             |
| `pnpm test:coverage`        | PASS            | Agent statements 91.05%; LLM 58.27%; worker 58.87%; mobile 80.24%; API 37.01%; command completed successfully.                                             |
| `pnpm build`                | PASS            | API/worker/packages compiled and Expo exported 43 static web routes.                                                                                       |
| `pnpm smoke:web-watcher`    | PASS            | Fetched Books to Scrape over the internet; extracted title, URL, GBP 51.77, stable ID, and change summary; transaction rolled back.                        |
| Browser fresh-account flow  | PASS on web     | Real local OTP request/verify, blank onboarding, six bounded local questions, name after interview, and authenticated Today.                               |
| Browser public watcher flow | PASS on web     | Example → interpretation → explicit confirmation → worker run → genuine HTML hit → pause/resume → destructive confirmation.                                |
| Browser API-offline state   | PASS on web     | API was stopped mid-session; Memory showed “Failed to fetch” and a retry control with no record content.                                                   |
| `pnpm benchmark:retrieval`  | PASS            | 40 agents, 1,200 queries, top-k 5; results below.                                                                                                          |
| `pnpm eval:reranker`        | PASS            | Six offline fixtures; results below.                                                                                                                       |
| Signed export CLI           | PASS            | Downloaded the fresh browser account ZIP from the live API and independently verified product, format version, timestamp, and HMAC.                        |
| Maestro on iOS simulator    | FAIL / not run  | `xcrun simctl` is unavailable.                                                                                                                             |
| Maestro on Android emulator | FAIL / not run  | `adb` and `maestro` are unavailable.                                                                                                                       |
| Hosted GitHub Actions       | FAIL / external | Latest run failed before executing any step; repository actions are enabled, but the owner account restriction/billing state must be cleared and CI rerun. |

The mobile tests cover sign-in request/verify with blank identity, interview naming order, transcript rendering, reveal consent, watcher pause/delete confirmation, API URL resolution, shared empty/error components, and a static query-error contract for all 22 query-backed screens. React Native Web emits two harmless accessibility-prop warnings inside the test renderer; the browser DOM exposes the tested controls correctly.

## Retrieval and outcome-ranking comparison

`pnpm benchmark:retrieval` on the local 40-agent seeded dataset, 1,200 queries, top-k 5:

| Retriever           |      Median |         p95 | Intent precision@5 |
| ------------------- | ----------: | ----------: | -----------------: |
| Lexical baseline    | 0.062208 ms | 0.084083 ms |                1.0 |
| PostgreSQL pgvector | 0.205792 ms | 0.281375 ms |                1.0 |

At this tiny scale lexical lookup is faster. pgvector preserved fixture precision and is now the production candidate query, with active adult/scope/intent/activity/block/prior-introduction/deletion filters applied in SQL. The benchmark uses deterministic hashed vectors only in a temporary benchmark table. Production profile and memory vectors are stored only after a real embedding-provider response with exactly 1,536 finite dimensions.

`pnpm eval:reranker` on six deterministic pairwise fixtures:

| Reranker                                      |              Accuracy |
| --------------------------------------------- | --------------------: |
| Unconditioned baseline                        |                  0.50 |
| Up to five of the user's own accepts/declines |                  1.00 |
| Difference                                    | +50 percentage points |

This validates the conditioning path and expected direction on the fixture. It is not a claim of population-level ranking quality; that requires opt-in online outcomes.

## Demo and misleading fallback removal

| File                                     | Removed behavior                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/mobile/src/demo.ts`                | Deleted the complete client-side demo brief, introduction, compatibility score/verdict/reveal data, and skill records.                           |
| `apps/mobile/app/(tabs)/today.tsx`       | Removed demo brief fallback; renders real query loading/empty/error/data only.                                                                   |
| `apps/mobile/app/(tabs)/circle.tsx`      | Removed fabricated 91% introduction and reveal state; renders real introductions only.                                                           |
| `apps/mobile/app/(tabs)/skills.tsx`      | Removed sample skills fallback; renders real skills only.                                                                                        |
| `apps/mobile/src/api.ts`                 | Removed AsyncStorage successful-GET fallback. Failed requests now throw and remain visible to TanStack Query.                                    |
| `apps/mobile/app/(auth)/sign-in.tsx`     | Removed prefilled identity values; email, name, birth date, and code start blank. Development code appears only behind the explicit server flag. |
| `apps/mobile/app/(onboarding)/agent.tsx` | Starts with no profile or facts and states that no sample profile is loaded.                                                                     |
| Query-backed mobile routes               | Added a shared plain-language retry state; detail routes no longer display an endless loading state after failure.                               |
| Trust/settings surfaces                  | Removed hard-coded server-data fallbacks; unavailable data is an error, not a default record presented as saved state.                           |

Fixture data remains in tests, benchmark scripts, the explicit database seed, and the transactional watcher smoke script. None is imported into the runtime mobile UI as fallback content.

## Design system implementation

- Exact light/dark palette lives in `packages/ui/src/tokens.ts`: ground, surface, ink, inkMuted, inkFaint, hairline, hairlineStrong, yours, rented, and alert. No other product color is defined.
- Theme follows the platform color scheme.
- Radius tokens are 4 for controls and 6 for the single elevated surface treatment. The shadow token and shadows are removed.
- Spacing scale is 4, 8, 12, 16, 20, 26, 32, and 44; screen margin is 26.
- Instrument Serif is display-only, Instrument Sans is interface text, and Martian Mono is used for numeric/time/cost/percentage/uppercase metadata.
- `Ring` implements the partial SVG arc, numeric center when relevant, yours/rented tone, and deterministic identity pattern from `seed`.
- Rings replace the logo mark, agent/avatar marks, Ask control, autonomy/progress percentages, and compatibility score surfaces implemented in the app.
- Transcript rows use hairline-separated blocks and a Ring per speaker, not chat bubbles.
- Sparkle/star/wand glyphs, gradients, glass, neon, emoji decoration, and generic icon packages are absent. Icons in the navigation/header are local 1.5px SVG paths.

Visual caveat: the full every-route light/dark screenshot matrix was not completed. Four observed light-mode screenshots are committed as key evidence; dark mode and every route require the native/browser visual-QA issue before launch.

## Product feature report

### Identity, sessions, and verification

- Email OTP request uses the same response shape for existing and unknown accounts and has route-level abuse limits. Verification consumes a hashed, expiring code and creates/returns the account only after an 18+ birth-date check.
- Access and rotating refresh tokens are separate; revoked/invalid refresh sessions fail closed.
- `.edu` verification has its own request/consume path and receipt.
- Phone verification uses the same bounded verification model; Twilio is the real production provider. Both email and phone log modes fail closed in production.
- Resend delivery, verified sender domain, and Twilio delivery need owner credentials before they are externally validated.

### Agent interview, import, and memory

- A new account starts without an agent profile.
- With a configured non-stub model, each follow-up is generated from prior answers under existing user/global cost caps and bounded turn count. With no provider, the UI plainly says it is using the bounded local sequence.
- Agent naming happens only after the interview completes; this was observed in the browser.
- ChatGPT/Claude JSON or ZIP imports are parsed in memory, size-limited, converted into durable facts, and the raw archive is not retained.
- Memory facts can be inspected, corrected, or removed. Create/correct/import paths call the configured OpenAI embedding endpoint; exactly 1,536 finite values are required. Without a key, `embeddingReady` remains false and no fake vector/hash is written.

### Today, Ask, and intents

- Today aggregates only real server state. A new account shows no fabricated decisions or introductions. The onboarding receipt can truthfully increment completed activity.
- Ask examples populate the actual input. Interpretation returns an intent, watcher, or task proposal and never silently executes the write.
- The intent manager lists every intent kind with active state, parameters, pause-until date, and recent activity. Updates are cached optimistically with rollback.

### Public-web watchers

- Two-stage create flow: natural language is parsed into source/query/constraints/format, shown to the user, and persisted only after confirmation.
- Sources: direct public URL, RSS, Atom, JSON endpoint, structured/ordinary HTML, or configured search API.
- Extraction order: feed/JSON → JSON-LD → metadata/HTML → bounded model fallback only when structured candidates are absent.
- Network protections: DNS resolution, private/link-local/loopback rejection, redirect revalidation, no social domains, no auth/login targets, `robots.txt`, descriptive user agent, one request per host per second, 1 MB response cap, 10-second timeout, and three redirects maximum.
- Stable IDs and content-aware hashes prevent duplicate notifications while preserving changed results.
- Detail shows source, last/next fetch, change summary, extracted title/detail/candidate URL, timestamp, and hit history.
- Four one-tap examples: product price, listing ceiling, job/opportunity feed, and funding deadline page.
- Real observed result: Books to Scrape returned “A Light in the Attic,” GBP 51.77, and one hit for the under-£60 constraint.

### Inbox, screening, and Gmail

- Inbox exposes the real triage state, draft text, explicit approval/decline, immutable approval time, and skill-share adoption.
- Screening editor supports match conditions, allow/hold/decline action, priority, enable/disable, edit/delete, and a preview over the last ten inbox items.
- Gmail uses a hashed, expiring, one-time OAuth state, `gmail.readonly`, encrypted refresh tokens, visible status/connect/sync/disconnect, token revocation, last-ten-message sync, screening, draft creation only after approval, and audit logging.
- When Google OAuth is not configured, the UI states that the connector is unavailable and the start endpoint returns 503. No sample mail appears.

### Introductions and matching

- PostgreSQL pgvector nearest-neighbour lookup replaces runtime lexical candidate retrieval.
- Hard filters stay in SQL before model calls: active adults, compatible scope and intent, 14-day activity, no block, no deleted record, and no prior introduction.
- Reranking includes up to five of this user's own accepted/declined outcomes.
- Bounded agent dialogue persists only redacted turns. Two-pass redaction fails closed; the independent judge sees only the redacted transcript.
- Reveal requires separate decisions from both users and releases only the intersection of selected fields. Outcomes become future ranking evidence.

### Exchange

- Have/want creation includes title, description, category, condition, urgency, cash low/high range, and trade preference.
- A user's item can be edited or deleted with confirmation.
- Matching proposals contain a separate, hairline transcript of the two agents' negotiation.
- Both people must accept before contact handoff appears. Every handoff states that ORBIT handles no money and recommends a public location.

### Skills and ORVIN backbone

- Skills are versioned procedures with definition, effect, evidence, permissions, confidence, source, and correction history.
- Correction creates a new version and learning receipt instead of mutating history.
- A skill can be shared to a named recipient; the recipient sees it in the inbox and explicitly adopts a versioned copy with source lineage.
- Group admins/owners can publish to a group shelf. Correcting a group-owned source creates a reviewable pending update for every member. Review either creates the new adopted version with lineage or keeps the member's existing copy.
- Runtime confidence/failure evidence decides when a validated procedure can be reused and when the frontier model must handle unfamiliar work.

### Safety, moderation, trust, and deletion

- Block, mute, and report are available from the relationship/safety surfaces; actions create append-only receipts.
- Safety plans create a share token, due check-in, check-in action, and one-time due push event.
- Admin console is role-gated by `ADMIN_EMAILS`; it exposes reports, flagged conversations, dismiss/warn/suspend/restore actions, and the audit trail.
- Trust controls are scoped and server-owned.
- Account deletion requires a confirmation, shows the seven-day countdown, supports cancellation, and is processed by the deletion worker after cutoff.

### Push, export, and operations

- Native Expo registration rejects web and simulators honestly, requires a real device and EAS project ID, and stores per-category preferences.
- Durable push queue covers morning brief, mutual reveal, waiting approval, watcher hit, and due safety check-in. Delivery records attempts, Expo response, retry/backoff, and deep-link data.
- Signed export includes an HMAC signature. `pnpm verify:export -- <file>` independently recomputes the canonical payload and checks the signature; `docs/EXPORT_VERIFICATION.md` documents the process.
- Sentry hooks cover API unhandled errors and worker job failures when configured.
- Admin metrics cover job durations, moderation depth, signups, costs, introduction/reveal rates, and retention.
- Private staging assets use Caddy TLS, API/worker containers, one-shot migrations, managed-service URLs, AWS Secrets Manager, and public readiness polling.

## Screen and button/action inventory

| Screen           | User-visible controls and outcome                                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in          | Send six-digit code; enter code/name/birth date; Continue; Use another email. No field is prefilled.                                                                                  |
| Agent onboarding | Start private interview; import instead; answer/save each turn; name and enter ORBIT only after completion.                                                                           |
| Import           | Choose ChatGPT/Claude archive; import approved facts; return.                                                                                                                         |
| Today            | Open inbox; add/create watcher; open brief cards/run/introduction when real records exist; bottom tabs.                                                                               |
| Circle           | Virtualized introduction list; open a real introduction; empty action routes to intents.                                                                                              |
| Ask              | Three working example pills; edit prompt; Ask ORBIT; review interpreted action/autonomy before saving.                                                                                |
| Skills           | Virtualized skills list; create; open detail.                                                                                                                                         |
| You              | Identity summary and links to intents, inbox, watchers, memory, trust, verification, activity, connections, screening, groups, exchange, safety, admin when authorized, and settings. |
| Intents          | Enable/pause each kind, edit parameters/pause date, save, inspect per-intent activity.                                                                                                |
| Introduction     | Read verdict and transcript, choose reveal fields, reveal/decline, record outcome/rating, block, mute, or report.                                                                     |
| Watchers         | Add watcher; open watcher. Detail: pause/resume, inspect hits, delete → explicit yes/keep confirmation. New: four examples, edit cron, interpret, confirm and activate.               |
| Inbox            | Edit draft, approve/decline; accept shared skill. Approval records a receipt and does not claim external send unless Gmail is connected.                                              |
| Screening        | Create/edit condition, action and priority; preview last ten; save; delete with confirmation.                                                                                         |
| Memory           | Correct → save/cancel; forget.                                                                                                                                                        |
| Trust            | Change each scope's autonomy mode and persist.                                                                                                                                        |
| Verification     | Request/verify campus email and phone codes.                                                                                                                                          |
| Connections      | Gmail connect when available, sync, disconnect with confirmation; unavailable reason otherwise.                                                                                       |
| Exchange         | Add have/want; open edit/delete; accept/reject proposals; inspect negotiation and handoff.                                                                                            |
| Groups           | Enter join code; open shelf; publish for authorized role; adopt; adopt/decline propagation update.                                                                                    |
| Skill detail     | Inspect steps/evidence/lineage; correct; share to named recipient; adopt where applicable.                                                                                            |
| Safety           | Block, mute, report; create plan; check in; copy/share plan URL.                                                                                                                      |
| Settings         | Register push, toggle five categories, save encrypted BYOK key, export, schedule deletion with confirmation, cancel countdown.                                                        |
| Admin            | View queue/audit; dismiss, warn, suspend, restore. API rejects non-admin users.                                                                                                       |
| Activity         | Read append-only receipts and timestamps.                                                                                                                                             |
| Run detail       | Inspect steps, model calls, duration, cost, approvals, result, and learning receipt.                                                                                                  |

Every destructive path added in this pass has a confirmation where requested: watcher deletion, account deletion, Gmail disconnect, screening-rule deletion, and exchange-item deletion.

## API inventory

All `/v1/*` routes except public health/readiness, Gmail callback, and shared safety-plan token routes require an authenticated boundary appropriate to the operation.

### Platform and identity

- `GET /health` — process liveness.
- `GET /ready` — database round trip.
- `GET /v1/stream` — authenticated WebSocket event stream.
- `POST /v1/auth/otp/request`, `POST /v1/auth/otp/verify` — email OTP and account gate.
- `POST /v1/auth/refresh` — rotate session tokens.
- `POST /v1/auth/verify-edu/request`, `POST /v1/auth/verify-edu` — campus verification.
- `POST /v1/auth/verify-phone/request`, `POST /v1/auth/verify-phone` — phone verification.
- `GET/PATCH /v1/me` — profile read/update.
- `DELETE /v1/me`, `GET /v1/me/deletion`, `POST /v1/me/deletion/cancel` — schedule, inspect, or cancel deletion.
- `GET /v1/me/export` — download signed export.

### Agent, memory, intents, and settings

- `POST/GET/PATCH /v1/agent` — create, read, and name/update the agent.
- `POST /v1/agent/interview/turn` — bounded adaptive/local interview turn.
- `POST /v1/agent/import` — streamed archive import.
- `GET /v1/agent/memory`, `PATCH/DELETE /v1/agent/memory/:id` — inspect/correct/remove facts.
- `GET /v1/intents`, `PUT /v1/intents/:kind` — complete intent management.
- `GET /v1/connections` — connection summary.
- `PUT /v1/settings/api-key` — encrypt and store a user provider key.

### Work, inbox, watchers, skills, and groups

- `GET /v1/brief/today` — real daily brief.
- `GET /v1/inbox`, `POST /v1/inbox/:id/approve|decline` — approval inbox.
- `GET /v1/screening-rules`, `POST /v1/screening-rules/preview`, `PUT/DELETE /v1/screening-rules/:id` — ordered screening editor.
- `GET/POST /v1/watchers`, `PATCH/DELETE /v1/watchers/:id`, `GET /v1/watchers/:id/hits` — watcher lifecycle and evidence.
- `GET /v1/runs`, `GET /v1/runs/:id` — run list/detail and learning receipt.
- `GET/POST /v1/skills`, `PATCH /v1/skills/:id`, `POST /v1/skills/:id/share|adopt` — version/share/adopt skill flows.
- `GET /v1/skill-adoptions/updates`, `POST /v1/skill-adoptions/:id/review` — propagation review.
- `GET /v1/groups`, `POST /v1/groups/join`, `GET /v1/groups/:id/skills` — membership and shelf.
- `POST /v1/ask/interpret` — bounded natural-language action interpretation.

### Gmail and push

- `GET /v1/connections/gmail/status` — honest availability/connection state.
- `POST /v1/connections/gmail/start`, `GET /v1/connections/gmail/callback` — OAuth initiation/callback.
- `POST /v1/connections/gmail/sync`, `DELETE /v1/connections/gmail` — audited sync and revoke/disconnect.
- `GET /v1/push/devices`, `POST /v1/push/register`, `PATCH /v1/push/devices/:id/preferences`, `DELETE /v1/push/devices/:id` — device lifecycle/preferences.

### Social, exchange, safety, and administration

- `GET /v1/introductions`, `GET /v1/introductions/:id`, `GET /v1/introductions/:id/transcript` — consent-safe records.
- `POST /v1/introductions/:id/decision`, `POST /v1/introductions/:id/outcome` — reveal/decline and feedback.
- `GET/POST /v1/exchange/items`, `PATCH/DELETE /v1/exchange/items/:id` — have/want CRUD.
- `GET /v1/exchange/proposals`, `POST /v1/exchange/proposals/:id/decision` — mutual proposal/handoff.
- `POST /v1/blocks`, `POST /v1/mutes`, `POST /v1/reports` — relationship safety.
- `POST /v1/safety-plans`, `GET /v1/safety-plans/share/:token`, `POST /v1/safety-plans/:id/check-in` — safety plans.
- `GET /v1/activity` — append-only user receipts.
- `GET /v1/admin/moderation`, `GET /v1/admin/audit`, `POST /v1/admin/reports/:id/action` — role-gated moderation.
- `GET /v1/admin/costs`, `GET /v1/admin/metrics` — role-gated cost/operations metrics.

## Fresh-account real-device walkthrough

The required standard says a step passes only when completed on a real iOS device and a real Android device against the real API with seed data absent. This machine has no iOS simulator tooling, Android ADB, Maestro, physical-device binding, or external provider credentials. Therefore every platform cell is deliberately marked fail/unverified even where web/backend evidence exists.

|   # | Outcome                                     | iOS  | Android | Accurate note                                                                                                                        |
| --: | ------------------------------------------- | ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
|   1 | Email OTP, age gate, campus email, phone    | FAIL | FAIL    | Email OTP/age gate passed on web locally; `.edu`/phone API tests pass. Resend/Twilio and devices not exercised.                      |
|   2 | Interview, then agent name/profile          | FAIL | FAIL    | Passed in web browser with explicit local-sequence label; adaptive provider path and native devices unverified.                      |
|   3 | Import history and delete fact              | FAIL | FAIL    | Implemented and unit/API-shaped; not executed on native fresh account.                                                               |
|   4 | Truthful empty Today                        | FAIL | FAIL    | Passed on web; no fabricated activity. Native devices unverified.                                                                    |
|   5 | Real public watcher and extracted hit       | FAIL | FAIL    | Passed end-to-end on web against Books to Scrape; native notification/device path unverified.                                        |
|   6 | Gmail triage, edit/approve, audit           | FAIL | FAIL    | Complete behind feature flag; blocked on verified Google OAuth credentials/live mailbox.                                             |
|   7 | Two intents, manual nightly, real intro     | FAIL | FAIL    | pgvector integration tests and worker run pass; strict no-seed two-user native run not executed.                                     |
|   8 | Two-sided reveal/intersection/outcome       | FAIL | FAIL    | API integration and mobile component tests pass; two real devices not executed.                                                      |
|   9 | Exchange match/mutual accept/handoff        | FAIL | FAIL    | Full API/UI implemented; fresh native two-account run not executed.                                                                  |
|  10 | Skill correct/receipt/share/adopt           | FAIL | FAIL    | Full API/UI implemented; fresh native two-account run not executed.                                                                  |
|  11 | Group join/adopt/correct/update             | FAIL | FAIL    | Propagation code/migration/UI implemented; fresh native two-account run not executed.                                                |
|  12 | Block/report/safety/check-in                | FAIL | FAIL    | API/UI and due push queue implemented; real-device walkthrough not executed.                                                         |
|  13 | Export and verify signature                 | FAIL | FAIL    | Verifier unit tests pass; fresh native download/share flow not executed.                                                             |
|  14 | Schedule/cancel/reschedule/deletion worker  | FAIL | FAIL    | Countdown/cancel/worker implemented; destructive fresh-device timing run not executed.                                               |
|  15 | API offline; errors and no invented content | FAIL | FAIL    | All 22 query screens have an error-path contract and demo/cache fallbacks are gone; native all-screen interruption run not executed. |

## Screenshot evidence

Observed light-mode screenshots:

| Screen/state                 | File                                             |
| ---------------------------- | ------------------------------------------------ |
| Blank sign-in                | `docs/screenshots/pass2/sign-in-light.png`       |
| Blank-account onboarding     | `docs/screenshots/pass2/onboarding-light.png`    |
| Authenticated truthful Today | `docs/screenshots/pass2/today-light.png`         |
| Real public watcher hit      | `docs/screenshots/pass2/watcher-hit-light.png`   |
| API-offline honest error     | `docs/screenshots/pass2/offline-error-light.png` |

The requested every-screen × light/dark matrix is **not complete** and is tracked as an owner-visible issue. No screenshot is represented as dark mode or native-device evidence when it is not.

## Incomplete items and exact owner actions

1. **Native walkthrough and Maestro ([#8](https://github.com/Hetul803/ORBIT/issues/8)):** install full Xcode command-line developer tools, Android Studio/SDK/ADB, and Maestro; create clean iOS and Android targets; run both flows and the 15-step matrix against a no-seed staging database.
2. **Every-screen visual matrix and remaining UI consistency ([#9](https://github.com/Hetul803/ORBIT/issues/9)):** capture all routes in light/dark on both platforms; replace remaining unbounded `Screen` + `.map` record lists with FlashList; give every query screen layout-matching skeletons; finish optimistic rollback for every remaining mutation.
3. **Hosted CI ([#7](https://github.com/Hetul803/ORBIT/issues/7)):** clear the GitHub account/repository Actions billing or spending restriction, rerun the workflow, and require the green check on `main`.
4. **Provider verification ([#11](https://github.com/Hetul803/ORBIT/issues/11)):** supply a verified Resend domain, Twilio number, Google OAuth app, Expo EAS project, OpenAI/selected LLM key, search API key, and Sentry project. Execute live delivery/OAuth/push/embedding/adaptive/search tests and record provider receipts without committing secrets.
5. **Private staging ([#10](https://github.com/Hetul803/ORBIT/issues/10)):** provision the host, DNS, managed PostgreSQL/pgvector, managed Redis, IAM role and Secrets Manager JSON; run `infra/staging/deploy.sh`; run backup/restore and ten-user load/reliability checks.
6. **Store/release/legal operations ([#12](https://github.com/Hetul803/ORBIT/issues/12)):** configure bundle identifiers/signing, privacy manifests, App Store/Play Store listings, terms/privacy policy, abuse escalation owner, deletion SLA, and incident on-call before a public release.

The exact provider credential checklist, setup sequence, current pricing references, model-cost configuration, and a transparent 100-user estimate are in [Provider setup and costs](PROVIDER_SETUP_AND_COSTS.md). The estimate is about $65–$150/month for the defined private-beta workload, excluding Gmail's potentially material restricted-scope assessment and production high availability.

Each engineering/validation gap above is tracked in GitHub. External credentials are intentionally absent from the repository.

## Final launch assessment

The strongest current launch is a **founder-led local/web alpha**. It is useful to one user immediately through interview/memory, Ask/intents, public URL/feed watchers, skills, receipts, export, and safety—even before network effects. It becomes substantially stronger with two to five users through introductions, mutual reveal, exchange, skill sharing, and group propagation.

The technical moat is coherent: private memory and outcomes feed pgvector retrieval and reranking; validated skills accumulate corrections, versions, lineage and evidence; agent-to-agent work is bounded by consent/redaction; real-world watcher evidence and audit receipts return to the same graph. That compounding dataset is user-specific and operational, not a static prompt that a competitor can copy.

Do not invite unrestricted real users yet. First close the six owner-action groups above, then run a small invite-only staging cohort, inspect failure/retention/abuse/cost data, and only then make a public launch decision.
