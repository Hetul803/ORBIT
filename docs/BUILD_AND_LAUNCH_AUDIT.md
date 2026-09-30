# ORBIT — Complete Build, Functionality, and Launch Readiness Audit

**Audit date:** September 30, 2026  
**Repository:** `https://github.com/Hetul803/ORBIT`  
**Audited baseline commit:** `03a7570` plus the completion fixes documented in section 2  
**Source specifications reviewed:** `ORBIT.docx` (16 pages) and `ORVIN_Vision_Research_and_Product_Bridge.docx` (9 pages)  
**Audit standard:** A feature is called **Complete** only if its UI, API, persistence, and meaningful behavior are connected. **Partial** means useful behavior exists but at least one promised layer or production dependency is absent. **Missing** means the promised user outcome cannot currently be completed.

## 1. Executive verdict

ORBIT is a **production-shaped functional alpha**, not yet a production-ready consumer launch.

It is substantially more than a mockup: the Expo application talks to a real Fastify API; authentication creates real JWT sessions; PostgreSQL stores the product state; Redis and BullMQ run scheduled work; the agent pipeline produces bounded, redacted conversations; consent controls actual identity release; watcher, skill, inbox, group, exchange, safety, export, BYOK, and deletion paths have real server behavior; and the local browser flow has been exercised against those services.

The strongest parts are the data model, the consent and redaction boundary, the agent pipeline, the ORVIN-inspired skill/version/receipt layer, and the breadth of working product surfaces. The largest launch gaps are external connector execution, production OTP/push setup, exact design-system compliance, the missing Ring identity system, native-device and accessibility validation, real vector retrieval, complete optimistic mutation handling, production infrastructure, and operational/legal preparation.

### Readiness by use case

| Use case                              | Readiness | Verdict                                                                                                                                                 |
| ------------------------------------- | --------: | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Founder/local product demo            |       90% | Ready now. The seeded app, API, worker, PostgreSQL, and Redis are live and usable locally.                                                              |
| Internal product testing              |       80% | Ready, with known UI/design and connector limitations documented below.                                                                                 |
| Small supervised design-partner alpha |       60% | Possible after deploying a private environment, configuring email delivery, adding monitoring, and completing native-device checks.                     |
| Unsupervised public beta              |       40% | Not recommended yet. Missing connector delivery, push delivery, native QA, compliance work, and stronger mobile tests create real user and safety risk. |
| Broad consumer/App Store launch       |       30% | Not ready. P0 launch blockers in section 14 must be completed first.                                                                                    |

These percentages are a product-readiness judgment, not automated coverage numbers.

## 2. What is live locally right now

The local environment is running with the following services:

| Service                  | Address                             | State                                                                                                                  |
| ------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Expo web app             | `http://localhost:8081`             | Live; visible browser session; signed-in demo flow tested                                                              |
| Fastify API              | `http://localhost:4100`             | Live; `/health` and `/ready` return success                                                                            |
| WebSocket                | `ws://localhost:4100/v1/stream`     | Registered; authenticated per-user channel                                                                             |
| PostgreSQL 16 + pgvector | `localhost:55432`, database `orbit` | Live; four migrations applied; development data seeded                                                                 |
| Redis                    | `localhost:6379`                    | Live; responds to `PING`                                                                                               |
| BullMQ worker            | Redis-backed                        | Live; nightly, watcher, consolidation, and deletion schedules registered                                               |
| MinIO                    | Compose configuration exists        | Not running in this ad-hoc local session because the current import path parses transiently and does not write objects |

### How to use the live app

1. Open `http://localhost:8081`.
2. Use `demo@orbit.local`.
3. Press **Send six-digit code**. In local-development mode, the generated OTP is displayed and filled into the form.
4. Press **Continue**.
5. If the onboarding route appears for the seeded account, press **I already have an agent**, then **Finish with this foundation**.

The seeded environment contains 40 clearly synthetic users, agents, intents, exchange items, conversations, a mutual-ready introduction, watcher data, runs, skills, groups, inbox entries, receipts, and a populated daily brief.

The currently running processes are development processes attached to this workspace session. If the machine or task runner is stopped, use the copy-paste setup in `README.md` and `docs/RUNBOOK.md` to restart them.

## 3. Completion fixes made during this audit

The following defects were found by running the real web UI against the live API and were fixed rather than merely documented:

1. **Web mutations were blocked by CORS.** Fastify's default CORS method list allowed GET/HEAD/POST but not the app's PUT/PATCH/DELETE operations. All required methods are now allowed, and an integration regression test covers PUT, PATCH, and DELETE preflights.
2. **Ask's Review proposed action button was a no-op.** It now persists intent changes or routes to a prefilled watcher, exchange, memory, or connections flow according to the interpretation.
3. **Ask did not return an intent kind.** Interpretation now identifies roommate, cofounder, study partner, gym partner, mentor, hiring, dating, or friendship and returns active/paused intent state.
4. **Watcher and exchange forms did not receive Ask context.** Both now accept route parameters and prefill the user's interpreted request.
5. **Record how it went was a no-op.** Mutual introductions now open a private outcome form for met/not-yet, a 1–5 usefulness rating, and private notes, then persist the result.
6. **Mutual reveal crashed on web.** The API returned nested participant objects while the screen expected strings. The API now orients the payload as `you` and `other`, the screen renders both profiles, and the flow is covered by integration tests.
7. **Watcher hits and lifecycle had no usable detail surface.** A watcher detail screen now displays schedule, last/next run, deduplicated hits, and working Pause, Resume, Delete, and Back controls.
8. **Worker-generated links were invalid.** Daily brief links now target `/introduction/:id`, `/watcher/:id`, and `/run/:id`, which correspond to real Expo routes.
9. **An SVG accessibility prop leaked to the web DOM.** It was replaced with a valid `aria-hidden` attribute, removing the React DOM warning.
10. **Integration tests were stateful across reruns.** API and nightly-worker fixtures now use unique users, agents, conversations, phone values, and introductions so the real-database suite is repeatable without resetting the database.

## 4. System architecture actually built

```text
Expo / React Native / Expo Router
  ├─ TanStack Query: API state and GET cache
  ├─ Zustand: session/local UI state
  ├─ SecureStore: mobile access + refresh tokens
  └─ React Native Web: local browser build
             │ HTTPS / WebSocket
             ▼
Fastify API (TypeScript strict)
  ├─ JWT access + rotated refresh tokens
  ├─ Zod request validation
  ├─ rate limiting, Helmet, structured logs, request ids
  ├─ AES-GCM encrypted BYOK/provider secrets
  ├─ signed ZIP export
  └─ role-protected moderation, cost, and metrics endpoints
             │
             ├──────────────┐
             ▼              ▼
PostgreSQL 16 + pgvector   Redis + BullMQ
  ├─ 34 domain models       ├─ nightly matching
  ├─ append-only activity   ├─ watcher evaluation
  ├─ consent/reveal         ├─ memory consolidation
  └─ ORVIN skill graph      └─ grace-period deletion
             │
             ▼
Provider-agnostic LLM router
  ├─ OpenAI / Anthropic / Google adapters
  ├─ deterministic zero-key stub
  ├─ per-task model selection
  ├─ per-call ledger and caps
  ├─ retry + circuit-breaker fallback
  └─ bounded agent conversation / redaction / judging
```

### Exact major technologies

- pnpm workspaces and Turborepo monorepo.
- Expo 57, React Native 0.86, React 19, Expo Router, iOS/Android/web from one codebase.
- TanStack Query, Zustand, AsyncStorage, SecureStore, FlashList.
- Node 22 target, Fastify, Zod, Prisma 7.
- PostgreSQL 16 with the `vector` extension.
- Redis and BullMQ.
- Native `ws`-compatible Fastify WebSocket route.
- Vitest unit and integration tests plus two Maestro mobile flow definitions.
- Docker Compose definitions for PostgreSQL, Redis, MinIO, API, and worker.

## 5. Original 31-feature requirement matrix

### A. The agent

|   # | Feature                           | Status                   | What works                                                                                                                                                                                                                                                               | Remaining gap                                                                                                                                                                  |
| --: | --------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|   1 | Conversational agent creation     | **Partial**              | The user names an agent and completes a six-turn, one-question-at-a-time interview. Each answer creates a typed memory fact and the completed interview builds a profile summary and voice profile. Follow-up sequence, progress, and profile preview are real.          | The questions are deterministic rather than LLM-adaptive, voice transcription is absent, and the flow names the agent before rather than after the interview.                  |
|   2 | Naming and deterministic identity | **Partial**              | Agent name and immutable unique `identitySeed` exist and are used throughout server state.                                                                                                                                                                               | The required reusable Ring component and deterministic secondary visual pattern are not implemented. The current UI uses letter avatars and pills.                             |
|   3 | ChatGPT/Claude history import     | **Complete with caveat** | Native file picker accepts JSON or ZIP up to 100 MB. The API locates conversation JSON, parses in memory, extracts durable facts and voice characteristics, stores memory, returns every learned item, and lets the user remove each one. Raw archives are not retained. | Extraction is deterministic heuristic analysis, not a production semantic/embedding pipeline. The screen offers removal but not inline editing; edits are available on Memory. |
|   4 | Memory page                       | **Complete with caveat** | Typed memory list, correction, deletion, provenance, confidence, immediate hash invalidation, and activity receipts work.                                                                                                                                                | The schema supports pgvector, but correction currently updates the embedding hash rather than calling a configured embedding provider to write a fresh vector.                 |
|   5 | Voice calibration                 | **Complete for text**    | Interview/import derive tone, sentence style, vocabulary, avoid-list, and examples; the profile is injected into agent personas.                                                                                                                                         | No microphone calibration or speech-to-text input.                                                                                                                             |
|   6 | Trust dial                        | **Complete**             | Per-capability Ask first / Do and tell / Just handle it controls persist to the agent. External human-visible writes remain hard approval-gated. Optimistic update and rollback are implemented here.                                                                    | No policy simulator explaining the exact effect of each change.                                                                                                                |
|   7 | Export everything                 | **Complete**             | One tap downloads and shares a signed ZIP containing profile, memory, skills, receipts, consent, introductions, settings, and activity. The API logs the export.                                                                                                         | A production key-management and verification UX for the signature is still required.                                                                                           |

### B. Introductions

|   # | Feature               | Status             | What works                                                                                                                                                                                                                                    | Remaining gap                                                                                                                                                                                                   |
| --: | --------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   8 | Intent controls       | **Partial**        | All required intent kinds exist in schema/API. Ask can activate or pause and parameterize them. The nightly worker reads active intents and pause dates.                                                                                      | There is no dedicated screen listing every intent with complete kind-specific controls and pause scheduling.                                                                                                    |
|   9 | Nightly matching      | **Partial/strong** | BullMQ runs selection, hard filters, reranking, bounded two-agent conversations, redaction, independent judging, introduction creation, caps, and daily brief construction. It runs with the zero-key stub and supports real providers later. | Candidate retrieval currently uses deterministic lexical scoring even though pgvector columns exist; it is not yet a true vector nearest-neighbor query. Outcome-labelled reranker retraining is not automated. |
|  10 | Redacted transcripts  | **Complete**       | Alternating transcript, independent verdict, reasons, suggested activity, and fail-closed surfacing work. Raw messages are never stored—only redacted content and a SHA-256 hash.                                                             | Transcript styling does not match the exact Ring-based design and currently uses rounded message surfaces similar to chat bubbles.                                                                              |
|  11 | Two-sided reveal      | **Complete**       | Decisions are independent and final; the other party's decline is hidden; only the intersection of per-field choices is released; consent, reveal, and activity rows are stored; failed-redaction conversations are unavailable.              | Remote push notification of the completed reveal is not delivered yet.                                                                                                                                          |
|  12 | Introduction outcomes | **Complete**       | After mutual reveal, the user records met/not-yet, rating, and private notes. The API stores a labelled `IntroductionOutcome`.                                                                                                                | The nightly reranker does not yet train or few-shot condition itself on these outcomes.                                                                                                                         |
|  13 | Daily brief           | **Complete**       | Seeded and worker-generated briefs show completed work, needs-user counts, time saved, introductions, watcher hits, tasks, live run state, and deep links. GET responses cache offline.                                                       | Only the Today screen has full skeleton treatment. Push delivery for the morning brief is absent.                                                                                                               |

### C. Exchange

|   # | Feature               | Status                              | What works                                                                                                                                               | Remaining gap                                                                                                                                                                     |
| --: | --------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  14 | Haves and wants       | **Partial**                         | Create and list Have/Want items; schema/API fully support condition, urgency, low/high cash range, trade preference, active status, edits, and deletion. | The create screen currently exposes title, category, description, and direction only; advanced terms are stored as defaults. Item edit/delete controls are not exposed in the UI. |
|  15 | Want-to-have matching | **Complete for seeded/worker path** | Matching creates structured proposals with terms, public-place guidance, decision state, expiry, and no-money notice.                                    | The negotiation UX is proposal-only; users cannot inspect a separate exchange-agent transcript.                                                                                   |
|  16 | Mutual handoff        | **Complete with caveat**            | Both parties independently accept; then first name/handle handoff appears. Every card states that ORBIT handles no money and takes no fee.               | A finalized time/place meet-up card is not separately editable; it tells users to choose a public place and relies on the Safety plan for scheduling.                             |

### D. Inbox

|   # | Feature                     | Status                            | What works                                                                                                                                  | Remaining gap                                                                                                                                |
| --: | --------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
|  17 | Agent-to-agent inbound      | **Complete for internal network** | Inbox items carry sender, kind, subject, body, triage result, and draft. They can be held, escalated, auto-declined, answered, or declined. | No external email provider receives inbound mail yet.                                                                                        |
|  18 | Screening rules             | **Partial**                       | Ordered match conditions and actions are fully modeled and have authenticated GET/PUT APIs.                                                 | No dedicated rule editor screen; behavior is backend/API-only.                                                                               |
|  19 | Reply drafting and approval | **Partial/strong**                | The user edits the proposed reply and explicitly approves or declines. Approval is timestamped in append-only activity state.               | Approval marks an internal inbox action; there is no Gmail/Microsoft/IMAP send adapter, so it must not be described as externally delivered. |

### E. Watchers and tasks

|   # | Feature                  | Status                         | What works                                                                                                                                                                                                 | Remaining gap                                                                                                                                               |
| --: | ------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  20 | Scheduled watchers       | **Complete for ORBIT sources** | Natural-language interpretation, structured confirmation, cron schedule, BullMQ polling, deduped hits, next/last run, hit history, pause/resume, and soft-delete work. Ask can create a prefilled watcher. | External email/file/calendar/price sources require connector adapters. Current built-in evaluator primarily covers ORBIT exchange-style data.               |
|  21 | Connector tasks          | **Partial/scaffold**           | Connection model, encrypted token field, permission/scopes UI, task routing, approval rules, and activity model exist.                                                                                     | Google, Microsoft, and IMAP OAuth, sync, read, calendar repair, file summary, and external write execution are not implemented. This is a major launch gap. |
|  22 | Run history and receipts | **Complete**                   | Runs show steps, status, model calls, provider/model, tokens, duration, cost, autonomy, and improvement against baseline. Learning and efficiency receipts are stored separately for skills.               | No trace waterfall UI or downloadable per-run diagnostic bundle.                                                                                            |

### F. Groups

|   # | Feature                      | Status                   | What works                                                                                                                                                     | Remaining gap                                                                                                                                         |
| --: | ---------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
|  23 | Campus/club/lab/class groups | **Complete with caveat** | Groups, member roles, join code, verified domains, visibility, member counts, shared shelf, and adoption exist. `ORBIT-DEMO` works locally.                    | The UI joins by code only; automatic verified-domain discovery/join is not exposed. Shared watcher management is not exposed in the group UI.         |
|  24 | Shared skills                | **Partial/strong**       | Group-owned skills, dependencies, version history, adoption, adapted personal copies, and correction evidence are modeled. Users can adopt from a group shelf. | A correction does not automatically propagate a tested new version to every member's adopted copy; members need an explicit update/adoption workflow. |

### G. Skills

|   # | Feature                              | Status             | What works                                                                                                                                                                                                  | Remaining gap                                                                                                      |
| --: | ------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
|  25 | Versioned, inspectable skill objects | **Complete**       | Trigger, steps, rules, checks, permissions, fallback, confidence, status, autonomy, evidence, success rate, versions, dependencies, receipts, and correction history are first-class schema and UI objects. | The user-authored creation screen starts with one step; richer visual procedure editing is limited.                |
|  26 | Skill handoff                        | **Partial/strong** | API can share to another user through an inbox item, adopt into a personal copy, retain parent/dependency lineage, and increment public adoption. Group adoption has UI.                                    | Direct recipient sharing is not exposed in the skill detail UI, and no acceptance notification is pushed remotely. |

### H. Account, safety, and control

|   # | Feature                         | Status                                   | What works                                                                                                                                                                         | Remaining gap                                                                                                                                  |
| --: | ------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
|  27 | OTP, .edu, phone, and 18+       | **Complete locally; partial production** | Email OTP, refresh rotation, hard age gate, age-gate audit, .edu request/verify, phone request/verify, and verification UI work. Under-18 attempts receive a 403 and are recorded. | Resend needs a real key/domain; phone OTP currently uses development delivery because no production SMS adapter is installed.                  |
|  28 | Block, report, mute, moderation | **Complete at API level**                | Block, mute, report, suppression, admin moderation queue, admin action log, and role checks exist. Block/report are reachable from introduction safety controls.                   | Mute has no mobile control; moderation has no admin console UI; production support staffing/process is not in place.                           |
|  29 | Meet-up safety                  | **Complete**                             | Public-place plan, meeting time, share token/URL, unauthenticated shared plan, due check-in, and safe check-in work.                                                               | Scheduled remote check-in push is not sent by Expo Notifications yet.                                                                          |
|  30 | Append-only activity log        | **Complete**                             | User, agent, system, consent, approval, export, safety, reveal, and admin actions are queryable and exported. Application routes do not update/delete activity records.            | Database-level immutability trigger or separate write-only audit store would further harden it.                                                |
|  31 | Seven-day account deletion      | **Complete**                             | DELETE schedules a grace window, revokes tokens, signs out, and the deletion worker removes/soft-deletes personal state after the cutoff.                                          | Cancellation during the grace window has no user-facing restore flow, and shared-conversation retention deserves a final legal/privacy review. |

### Feature count summary

- Complete or complete-with-caveat: 19 of 31.
- Partial but meaningfully functional: 12 of 31.
- Entirely missing: 0 of 31 at the schema/API concept level.
- Critical production dependencies still missing: connectors, production phone delivery, push delivery, vector retrieval, native/App Store readiness, exact design compliance.

The count is intentionally conservative: a modeled API without the promised user outcome is marked Partial, not Complete.

## 6. Every application screen and control

### Global navigation

| Control              | Action                                                 | State                                                                          |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **Today** tab        | Opens daily brief                                      | Working                                                                        |
| **Circle** tab       | Opens introductions, Exchange, and Groups entry points | Working                                                                        |
| **Ask** center tab   | Opens natural-language router                          | Working; styled as a tab rather than the exact specified circular Ring control |
| **Skills** tab       | Opens capability list                                  | Working                                                                        |
| **You** tab          | Opens identity and account control center              | Working                                                                        |
| Back/Cancel controls | Native/router back navigation                          | Working on all detail/form screens                                             |

### Authentication and onboarding

| Screen      | Buttons and controls                 | What each does                                                               | State                                                                 |
| ----------- | ------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Sign in     | **Send six-digit code**              | Creates an expiring OTP challenge, rate-limited by IP                        | Working; development code displayed locally                           |
| Sign in     | **Continue**                         | Verifies OTP, enforces 18+, creates/loads user, issues access/refresh tokens | Working and live-tested                                               |
| Sign in     | **Use another email**                | Returns to email entry                                                       | Working                                                               |
| Agent birth | **Create [agent name]**              | Creates the single agent and immutable identity seed                         | Working; handles existing-agent 409 by allowing the continuation flow |
| Agent birth | **I already have an agent**          | Skips creation and opens the interview foundation                            | Working                                                               |
| Interview   | **Save and continue**                | Persists one typed answer/memory and advances the interview                  | Working                                                               |
| Interview   | **Import ChatGPT or Claude history** | Opens native document import                                                 | Working                                                               |
| Interview   | **Finish with this foundation**      | Completes onboarding and opens Today                                         | Working                                                               |
| Import      | **Choose export file**               | Opens file picker for JSON/ZIP and uploads transiently                       | Working on supported native/web picker surfaces                       |
| Import      | **Remove this memory**               | Soft-deletes one imported fact immediately                                   | Working                                                               |
| Import      | **Back to interview**                | Returns to interview                                                         | Working                                                               |

### Today and work surfaces

| Screen           | Buttons and controls                   | What each does                                                                              | State                                                     |
| ---------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Today            | Header mail icon                       | Opens Inbox                                                                                 | Working; icon needs an explicit accessibility-label audit |
| Today            | Brief item row                         | Deep-links to introduction, watcher, or run detail                                          | Working; worker link defects fixed in this audit          |
| Today            | **Add watcher**                        | Opens watcher creation                                                                      | Working                                                   |
| Ask              | Text input + **Ask ORBIT**             | Sends input to the interpreter and shows type, confidence, and structured payload           | Working and live-tested                                   |
| Ask              | **Review proposed action**             | Activates/pauses an intent or routes to prefilled Watcher, Exchange, Memory, or Connections | Working and live-tested                                   |
| Ask              | Example pills                          | Display example prompts                                                                     | Display-only; they do not populate the input              |
| Watchers         | **Add watcher**                        | Opens natural-language creation                                                             | Working                                                   |
| Watchers         | **Open watcher**                       | Opens schedule/hit/lifecycle detail                                                         | Working and live-tested                                   |
| Watcher creation | **Interpret watcher**                  | Returns structured source/query/constraints/notify condition without creating               | Working and live-tested                                   |
| Watcher creation | **Confirm and activate**               | Persists the confirmed watcher and schedules its next run                                   | Working and live-tested                                   |
| Watcher detail   | **Pause watcher** / **Resume watcher** | PATCHes active state with optimistic UI and rollback                                        | Working and live-tested                                   |
| Watcher detail   | **Delete watcher**                     | Soft-deletes and removes it from the list                                                   | Working; no confirmation dialog yet                       |
| Watcher detail   | Hit cards                              | Show deduplicated result summary and timestamp                                              | Working                                                   |
| Run detail       | Back                                   | Returns to prior surface                                                                    | Working; all run/model/receipt data is display-only       |

### Introductions and Exchange

| Screen            | Buttons and controls                | What each does                                                           | State                                                               |
| ----------------- | ----------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Circle            | **Exchange**                        | Opens Have/Want items and proposals                                      | Working                                                             |
| Circle            | **Groups**                          | Opens shared circles                                                     | Working                                                             |
| Circle            | Introduction row                    | Opens verdict and redacted transcript                                    | Working and live-tested                                             |
| Introduction      | First name / Handle / Phone choices | Select exact fields offered for mutual reveal                            | Working; choices should receive stronger accessibility roles/labels |
| Introduction      | **Reveal if they reveal**           | Records final independent reveal consent                                 | Working and live-tested                                             |
| Introduction      | **Decline privately**               | Records decline without identifying the declining side to the other user | Working                                                             |
| Introduction      | **Record how it went**              | Opens private outcome form after mutual reveal                           | Working and live-tested                                             |
| Outcome           | **Yes** / **Not yet**               | Records whether the users met                                            | Working                                                             |
| Outcome           | 1–5 choices                         | Records usefulness rating                                                | Working                                                             |
| Outcome           | **Save outcome**                    | Persists labelled outcome and private notes                              | Working and live-tested                                             |
| Outcome           | **Cancel**                          | Closes the form without persistence                                      | Working                                                             |
| Introduction      | **Safety controls**                 | Opens prefilled block/report/meeting-plan screen                         | Working                                                             |
| Exchange          | **Accept proposal**                 | Records one side's final decision; handoff unlocks only after both       | Working                                                             |
| Exchange          | **Reject**                          | Records a rejection                                                      | Working                                                             |
| Exchange          | **Add have / want item**            | Opens item creation                                                      | Working                                                             |
| New exchange item | **I need this** / **I have this**   | Sets direction                                                           | Working                                                             |
| New exchange item | **Save exchange intent**            | Creates active item with entered title/category/details                  | Working                                                             |

### Inbox, groups, and skills

| Screen       | Buttons and controls                | What each does                                                   | State                                                              |
| ------------ | ----------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| Inbox        | Editable Agent's draft              | Lets user change the reply before approval                       | Working                                                            |
| Inbox        | **Approve and send**                | Records approval and approved reply                              | Working internally; does not send through an external provider yet |
| Inbox        | **Decline**                         | Records private decline                                          | Working                                                            |
| Groups       | **Join group**                      | Joins by code and refreshes membership                           | Working                                                            |
| Groups       | **Open skill shelf**                | Opens group-owned skills                                         | Working                                                            |
| Group shelf  | **Adopt a personal copy**           | Creates an adapted user-owned adoption and increments count      | Working; minimal success/error feedback                            |
| Skills       | Skill row                           | Opens definition, versions, dependencies, receipts, and evidence | Working                                                            |
| Skills       | **Create a skill**                  | Opens draft skill creation                                       | Working                                                            |
| New skill    | **Create draft skill**              | Persists version 1 with trigger and first proven step            | Working                                                            |
| Skill detail | **Correct and create next version** | Opens correction workflow                                        | Working                                                            |
| Skill edit   | **Create revised version**          | Creates a new immutable version and correction/learning receipt  | Working                                                            |

### You, privacy, and safety

| Screen       | Buttons and controls                               | What each does                                                    | State                                                              |
| ------------ | -------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| You          | **Memory**                                         | Opens readable/editable memory                                    | Working                                                            |
| You          | **Activity log**                                   | Opens append-only receipts                                        | Working                                                            |
| You          | **Inbox & approvals**                              | Opens Inbox                                                       | Working                                                            |
| You          | **Safety center**                                  | Opens generic safety tools                                        | Working                                                            |
| You          | **Settings & model keys**                          | Opens verification, trust, connections, BYOK, export, deletion    | Working                                                            |
| You          | **Sign out**                                       | Clears local tokens and returns to sign-in                        | Working                                                            |
| Memory       | **Correct**                                        | Opens inline edit                                                 | Working                                                            |
| Memory       | **Save correction**                                | Updates fact, marks correction source, invalidates embedding hash | Working                                                            |
| Memory       | **Forget**                                         | Soft-deletes fact and removes embedding hash                      | Working                                                            |
| Trust        | Three mode buttons per capability                  | Optimistically changes default; rolls back on error               | Working                                                            |
| Verification | **Send campus code** / **Verify campus**           | Development or Resend-backed .edu OTP flow                        | Working locally                                                    |
| Verification | **Send phone code** / **Verify phone**             | Pluggable-development phone OTP flow                              | Working locally                                                    |
| Connections  | Connection cards                                   | Show provider, scope, status, and last sync                       | Read-only; no OAuth connect/disconnect buttons                     |
| Settings     | **Verification**, **Trust dials**, **Connections** | Navigate to those control screens                                 | Working                                                            |
| Settings     | **Notifications**                                  | Toggles locally stored preference                                 | Working locally; not wired to Expo push registration/delivery      |
| Settings     | **OPENAI / ANTHROPIC / GOOGLE**                    | Selects provider for BYOK storage                                 | Working                                                            |
| Settings     | **Encrypt and save key**                           | AES-GCM encrypts key and stores only a hint for display           | Working                                                            |
| Settings     | **Create signed export**                           | Downloads ZIP to cache and invokes native share sheet             | Working; browser download behavior depends on Expo Sharing support |
| Settings     | **Schedule permanent deletion**                    | Starts grace window, revokes session, signs out                   | Working                                                            |
| Safety       | **Block immediately**                              | Prevents future matching/contact and records action               | Working                                                            |
| Safety       | **Send report**                                    | Places report in admin moderation queue                           | Working                                                            |
| Safety       | **Create share-and-check-in plan**                 | Creates public-place plan and opaque share URL                    | Working                                                            |
| Safety       | **I'm safe — check in**                            | Marks the plan checked in                                         | Working                                                            |
| Activity     | Back                                               | Returns to You                                                    | Working                                                            |

## 7. Complete API inventory

There are **70 Fastify route registrations**: 67 versioned JSON endpoints, one authenticated WebSocket upgrade route, and two health probes. All versioned private routes require JWT authentication unless explicitly noted.

### Health and realtime

| Method | Path         | Purpose                                                         | State                                                 |
| ------ | ------------ | --------------------------------------------------------------- | ----------------------------------------------------- |
| GET    | `/health`    | Process liveness and timestamp                                  | Working                                               |
| GET    | `/ready`     | Database readiness check                                        | Working                                               |
| WS/GET | `/v1/stream` | Authenticated per-user realtime channel for run/progress events | Working at server/hub level; limited client event use |

### Authentication and verification

| Method | Path                            | Purpose                                                           | State                                          |
| ------ | ------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| POST   | `/v1/auth/otp/request`          | Create rate-limited email OTP challenge; deliver by log or Resend | Working                                        |
| POST   | `/v1/auth/otp/verify`           | Verify OTP and 18+ gate; create/load user; issue JWT pair         | Working                                        |
| POST   | `/v1/auth/refresh`              | Rotate a valid refresh token and issue a new token pair           | Working                                        |
| POST   | `/v1/auth/verify-edu/request`   | Send/request campus email verification code                       | Working                                        |
| POST   | `/v1/auth/verify-edu`           | Verify campus code and timestamp account                          | Working                                        |
| POST   | `/v1/auth/verify-phone/request` | Create phone verification challenge                               | Working locally; production SMS adapter absent |
| POST   | `/v1/auth/verify-phone`         | Verify phone challenge and bind unique number                     | Working locally                                |

### User, agent, memory, intents, connections

| Method | Path                       | Purpose                                                              | State                                       |
| ------ | -------------------------- | -------------------------------------------------------------------- | ------------------------------------------- |
| GET    | `/v1/me`                   | Return safe current-user profile                                     | Working                                     |
| PATCH  | `/v1/me`                   | Update allowed account/profile fields                                | Working                                     |
| DELETE | `/v1/me`                   | Request seven-day deletion and revoke refresh state                  | Working                                     |
| GET    | `/v1/me/export`            | Build signed ZIP of all held user data                               | Working                                     |
| POST   | `/v1/agent`                | Create the account's one agent                                       | Working                                     |
| GET    | `/v1/agent`                | Return agent identity/profile/autonomy state                         | Working                                     |
| PATCH  | `/v1/agent`                | Rename agent or update autonomy defaults                             | Working                                     |
| POST   | `/v1/agent/interview/turn` | Persist an interview answer and return next question/profile preview | Working                                     |
| POST   | `/v1/agent/import`         | Parse ChatGPT/Claude JSON/ZIP and store extracted facts/voice        | Working                                     |
| GET    | `/v1/agent/memory`         | List current non-superseded memory facts                             | Working                                     |
| PATCH  | `/v1/agent/memory/:id`     | Correct owned memory and invalidate embedding hash                   | Working                                     |
| DELETE | `/v1/agent/memory/:id`     | Soft-delete owned memory and vector reference                        | Working                                     |
| GET    | `/v1/intents`              | List all current user's intents                                      | Working                                     |
| PUT    | `/v1/intents/:kind`        | Upsert kind-specific active state, params, and pause date            | Working; browser CORS fixed and live-tested |
| GET    | `/v1/connections`          | List connector states and scopes without returning tokens            | Working                                     |
| PUT    | `/v1/settings/api-key`     | Encrypt and upsert a BYOK provider key                               | Working                                     |

### Exchange and introductions

| Method | Path                                  | Purpose                                                       | State                          |
| ------ | ------------------------------------- | ------------------------------------------------------------- | ------------------------------ |
| GET    | `/v1/exchange/items`                  | List owned active Have/Want items                             | Working                        |
| POST   | `/v1/exchange/items`                  | Create item with terms, range, urgency, and direction         | Working                        |
| PATCH  | `/v1/exchange/items/:id`              | Edit an owned item                                            | Working; no current UI         |
| DELETE | `/v1/exchange/items/:id`              | Soft-delete an owned item                                     | Working; no current UI         |
| GET    | `/v1/exchange/proposals`              | Return proposals with user-oriented decisions and handoff     | Working                        |
| POST   | `/v1/exchange/proposals/:id/decision` | Independently accept/reject and unlock mutual handoff         | Working                        |
| GET    | `/v1/introductions`                   | List safe, unexpired, redaction-passed introductions          | Working                        |
| GET    | `/v1/introductions/:id`               | Return verdict, identity-sealed peer agent, and consent state | Working                        |
| GET    | `/v1/introductions/:id/transcript`    | Return redacted messages only                                 | Working                        |
| POST   | `/v1/introductions/:id/decision`      | Record final reveal/decline and intersect allowed fields      | Working and integration-tested |
| POST   | `/v1/introductions/:id/outcome`       | Store private met/rating/notes label                          | Working and live-tested        |

### Brief, inbox, screening, Ask

| Method | Path                      | Purpose                                                                           | State                                            |
| ------ | ------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------ |
| GET    | `/v1/brief/today`         | Return persisted daily brief or safe empty brief                                  | Working                                          |
| GET    | `/v1/inbox`               | List triaged inbound items                                                        | Working                                          |
| POST   | `/v1/inbox/:id/approve`   | Persist edited approved reply and approval receipt                                | Working internally; no external delivery adapter |
| POST   | `/v1/inbox/:id/decline`   | Decline an inbox item                                                             | Working                                          |
| GET    | `/v1/screening-rules`     | List priority-ordered screening policies                                          | Working; no UI editor                            |
| PUT    | `/v1/screening-rules/:id` | Create/update one rule by owned id                                                | Working; no UI editor                            |
| POST   | `/v1/ask/interpret`       | Classify text as watcher/exchange/intent/agent-question/task and return structure | Working; deterministic parser, not an LLM call   |

### Watchers, runs, skills, and groups

| Method | Path                    | Purpose                                                              | State                            |
| ------ | ----------------------- | -------------------------------------------------------------------- | -------------------------------- |
| GET    | `/v1/watchers`          | List owned watchers with hit counts and schedule state               | Working                          |
| POST   | `/v1/watchers`          | Interpret first, then create only after confirmed spec               | Working and live-tested          |
| PATCH  | `/v1/watchers/:id`      | Edit title/active/schedule/spec                                      | Working and live-tested          |
| DELETE | `/v1/watchers/:id`      | Pause and soft-delete owned watcher                                  | Working                          |
| GET    | `/v1/watchers/:id/hits` | Return deduplicated result history                                   | Working                          |
| GET    | `/v1/runs`              | List execution history                                               | Working                          |
| GET    | `/v1/runs/:id`          | Return steps, model calls, costs, durations, and baseline comparison | Working                          |
| GET    | `/v1/skills`            | List owned/adopted/group-visible skills with metrics                 | Working                          |
| POST   | `/v1/skills`            | Create versioned draft skill and initial version                     | Working                          |
| PATCH  | `/v1/skills/:id`        | Revise definition/status/confidence and create next version/receipt  | Working                          |
| POST   | `/v1/skills/:id/share`  | Send share invitation to another user                                | Working; no direct mobile button |
| POST   | `/v1/skills/:id/adopt`  | Create adapted personal adoption and increment count                 | Working                          |
| GET    | `/v1/groups`            | List accessible groups and member counts                             | Working                          |
| POST   | `/v1/groups/join`       | Join by valid code                                                   | Working                          |
| GET    | `/v1/groups/:id/skills` | Return shared shelf to members                                       | Working                          |

### Safety, moderation, activity, and admin

| Method | Path                            | Purpose                                                         | State                      |
| ------ | ------------------------------- | --------------------------------------------------------------- | -------------------------- |
| POST   | `/v1/blocks`                    | Upsert a directional block and suppress future contact/matching | Working                    |
| POST   | `/v1/mutes`                     | Upsert a directional mute                                       | Working; no mobile control |
| POST   | `/v1/reports`                   | Create moderation report tied to user/conversation              | Working                    |
| POST   | `/v1/safety-plans`              | Create public-place plan, share token, and check-in deadline    | Working                    |
| GET    | `/v1/safety-plans/share/:token` | Public read-only safety plan by opaque token                    | Working                    |
| POST   | `/v1/safety-plans/:id/check-in` | Mark owned plan checked in                                      | Working                    |
| GET    | `/v1/activity`                  | List append-only user receipts                                  | Working                    |
| GET    | `/v1/admin/moderation`          | Role-protected moderation queue                                 | Working                    |
| POST   | `/v1/admin/reports/:id/action`  | Resolve/dismiss/escalate with immutable admin action            | Working                    |
| GET    | `/v1/admin/costs`               | Aggregate provider/model/user/day spend                         | Working                    |
| GET    | `/v1/admin/metrics`             | Product, cost, worker, redaction, and queue metrics             | Working                    |

### API-wide properties

- JSON request bodies are validated with Zod before handler logic.
- JWT access tokens protect user routes; refresh tokens are rotated and stored hashed.
- Route and global rate limits exist.
- Request IDs are generated or accepted from `x-request-id` and included in logs/activity.
- Authorization, API keys, refresh tokens, and cookies are redacted from structured logs.
- Errors use stable codes and safe public messages.
- GET requests can fall back to AsyncStorage cache in the app.
- Web CORS now explicitly supports GET, HEAD, POST, PUT, PATCH, DELETE, and OPTIONS.

## 8. Data model coverage

The Prisma schema contains 34 domain/security models and 16 enums. Every model carries timestamps; referential entities use soft deletion where shared history requires it.

| Area                   | Models                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Identity/auth          | `User`, `Agent`, `OtpChallenge`, `RefreshToken`, `EncryptedApiKey`, `AgeGateAttempt`, `Device`                                 |
| Memory and matching    | `MemoryFact`, `Intent`, `MatchCandidate`, `AgentConversation`, `AgentMessage`, `Introduction`, `IntroductionOutcome`, `Reveal` |
| Exchange               | `ExchangeItem`, `ExchangeProposal`                                                                                             |
| Work                   | `InboxItem`, `ScreeningRule`, `Watcher`, `WatcherHit`, `Run`, `ModelCall`, `DailyBrief`                                        |
| ORVIN capability layer | `Skill`, `SkillVersion`, `SkillDependency`, `LearningReceipt`, `SkillAdoption`                                                 |
| Groups/connectors      | `Group`, `GroupMember`, `Connection`                                                                                           |
| Safety/audit           | `ActivityLog`, `Block`, `Mute`, `Report`, `ModerationAction`, `SafetyPlan`, `Consent`                                          |

Important implementation choices:

- `AgentMessage` intentionally stores `contentHash` plus `redactedContent`, not raw content. This is stronger privacy behavior than the original table description.
- `MemoryFact.embedding` and `Agent.profileEmbedding` are true `vector(1536)` columns; `embeddingHash` prevents redundant work.
- Skills have immutable versions, dependency edges, confidence, evidence, fallback, correction source, validation status, and adoption lineage.
- Activity logs are append-only by application design.
- OAuth tokens and BYOK keys use encrypted-at-rest fields, not plaintext.

## 9. Agent, LLM, and worker behavior

### Provider layer

- One typed `complete()` contract accepts task, messages, tools, constraints, and attribution.
- OpenAI, Anthropic, Google, and deterministic stub providers are present.
- Interview, rerank, conversation, judge, draft, redaction, embedding, skill, and Ask model names can be configured independently.
- BYOK keys are resolved at call time and replace platform keys for that user/provider.
- Every model call records tokens, latency, cost cents, task, provider, model, user, run, and conversation.
- User and global daily caps are checked before provider execution.
- Retry/backoff and a circuit breaker can fall back to a cheaper configured model.
- The stub makes the entire product useful and testable before API keys are added.

### Agent-to-agent pipeline

1. Loads active agents/intents and filters blocks, prior introductions, scope, compatibility, and recent activity.
2. Selects up to the configured retrieval set.
3. Reranks with a cheap model and records rationale.
4. Runs a bounded, honest, non-selling two-agent conversation with a hard token/turn budget.
5. Applies adversarial regex redaction and model redaction; uncertain content fails closed.
6. Runs an independent judge over redacted content only.
7. Creates an introduction only if redaction passed and score meets threshold.
8. Builds user briefs and stores run/model receipts.

Current limitation: stage 1 uses lexical profile overlap rather than a pgvector nearest-neighbor query. The vector schema is ready, but the retrieval implementation is not.

### Scheduled jobs

| Job              | Default schedule | Function                                                                 |
| ---------------- | ---------------- | ------------------------------------------------------------------------ |
| Nightly matching | `0 3 * * *`      | Select, rerank, converse, redact, judge, create introductions and briefs |
| Watchers         | `*/15 * * * *`   | Run due watcher specs, dedupe hits, schedule next run                    |
| Consolidation    | `30 4 * * *`     | Consolidate memory and skill learning state                              |
| Deletion         | `0 4 * * *`      | Permanently process accounts past the seven-day cutoff                   |

`RUN_WORKER_ONCE=true` executes all four for manual acceptance testing.

## 10. ORVIN research used as product backbone

The implementation uses the honest hybrid thesis from the ORVIN bridge: rent broad reasoning from frontier models today, but make persistent personal capability accumulation the owned product layer.

### Implemented ORVIN mechanisms

| ORVIN idea             | Implementation in ORBIT                                                                         | Quality                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Persistent abstraction | `Skill` definitions store trigger, steps, rules, checks, permissions, fallback, and evidence    | Strong schema and readable UI                                             |
| Version history        | Every correction creates a `SkillVersion`; prior versions remain inspectable                    | Working                                                                   |
| Learning receipt       | `LearningReceipt` stores learned steps/effect and origin                                        | Working                                                                   |
| Efficiency receipt     | Runs compare actions, duration, and model use against a baseline                                | Working                                                                   |
| Confidence + fallback  | Skill confidence/status/evidence determine deterministic path versus general reasoning fallback | Implemented in skill runtime; product execution coverage is still limited |
| Revision               | User correction creates next version instead of silently rewriting history                      | Working                                                                   |
| Skill graph            | `SkillDependency` supports reusable sub-capabilities                                            | Working in schema/API and detail display                                  |
| Cross-user handoff     | Share/adopt retains parent lineage and adapted definition                                       | Working API; partial UI                                                   |
| User control           | Memory/skills are inspectable, correctable, deletable, exportable                               | Strong                                                                    |
| Cost compounding       | Model ledger and efficiency receipts expose whether repeated work becomes cheaper               | Working measurements; limited real connector execution                    |
| Adaptive compute       | Model router chooses task-specific/cheaper models and fallbacks                                 | Working                                                                   |

### ORVIN features not yet complete

- Teach-by-doing from actual desktop/browser action traces.
- Replay of a learned skill against a changed real-world workflow.
- Automatic extraction of repeated subroutines across unrelated skills.
- Local-first on-device skill vault and local executor.
- Automatic causal validation/rejection of proposed procedures.
- A searchable visual personal capability graph with disable/export/combine controls.
- Any claim that ORVIN replaces frontier models. The product correctly makes no such claim.

## 11. Safety, privacy, cost, and observability

### Safety strengths

- Hard age gate with recorded denied attempts.
- Block/report available from a person-facing introduction in two taps.
- Moderation queue and immutable moderator action records behind an admin role.
- Failed redaction suppresses the introduction from list and detail APIs.
- Conversation guardrails include PII, coercion, sexual/minor, hostility, and binding-agreement constraints.
- Public-place safety plan and check-in flow.
- Per-user introduction cap limits network farming.

### Privacy strengths

- No social scraping code.
- No payments, wallet, escrow, Stripe, or fee flow.
- No raw agent message content stored.
- Per-field, two-sided reveal with consent and activity receipts.
- OAuth/BYOK encrypted at rest with an environment key.
- Complete signed export.
- Grace-period deletion worker.
- API/log redaction of high-risk secrets.

### Cost controls

- Default user daily ceiling: 35 cents.
- Default global daily ceiling: 2,500 cents.
- Caps enforced before calls.
- Per-task model choice and cheap fallback.
- Hard conversation turn/token ceilings.
- Embedding hashes prevent unchanged facts from being re-embedded.
- Admin cost aggregation by provider/model/user/day.

### Observability

- JSON logs with request IDs.
- Health and readiness probes.
- Model and run ledgers.
- Worker completed/failed event logs.
- Admin metrics for cost, redaction, moderation depth, signups, surfaced introductions, reveal rate, and retention proxy.

Remaining observability gap: OpenTelemetry hooks/scaffolding exist in architecture documentation, but production collector/exporter deployment and dashboards/alerts have not been verified end to end.

## 12. Tests and verification evidence

### Automated suites

| Suite                                     | Tests | Latest result                 |                                        Coverage |
| ----------------------------------------- | ----: | ----------------------------- | ----------------------------------------------: |
| `packages/agent`                          |    16 | Pass                          |                 91.05% statements, 92.85% lines |
| `packages/llm`                            |     3 | Pass                          |                               49.60% statements |
| `apps/api` real PostgreSQL integration    |     6 | Pass                          |  41.05% statements overall; auth modules ~87.5% |
| `apps/worker` real PostgreSQL integration |     2 | Pass                          |                 80.42% statements, 83.81% lines |
| Total executable tests                    |    27 | Pass in focused/latest suites | Mobile/UI packages currently have no unit tests |

The automated tests cover:

- Adversarial phone/email/surname redaction.
- Bounded conversation behavior and judge structure.
- Candidate hard filters and selection.
- Skill correction/version/fallback behavior.
- Provider routing, retries, caps, and circuit breaker.
- Hard under-18 denial and audit.
- Valid/invalid auth, refresh rotation, admin denial, .edu, phone.
- Signed export.
- Mutual-only field intersection.
- Failed-redaction introduction suppression.
- Cost cap blocking before provider execution.
- Web CORS mutation preflights.
- Watcher dedupe/rescheduling.
- Real nightly reranking, conversation, hashes, and safe introduction.

### Local quality gates previously and currently verified

- Prettier format checks.
- ESLint with zero warnings.
- TypeScript strict typecheck across packages.
- Turborepo build.
- A successful 39-route Expo web static export, including the new watcher detail route.
- Expo dependency check.
- Android and iOS prebuild generation.
- Dependency audit reported zero known issues at the prior full run.

### Defined but not executed here

- Maestro `sign-in-and-brief.yaml`.
- Maestro `consent-reveal.yaml`.
- Actual iOS Simulator execution.
- Actual Android Emulator execution.
- VoiceOver and TalkBack manual passes.

### Live browser paths verified in this audit

1. Email OTP request and verification.
2. Existing agent/onboarding continuation.
3. Populated Today brief from the real API.
4. Ask `Turn on roommate matching` → structured intent → approval → persisted PUT.
5. Ask `Watch for a used bike under $400` → structured watcher → prefilled creation → confirmed POST → persisted watcher list.
6. Watcher detail → Pause PATCH → visible paused state → Resume PATCH → visible active state.
7. Circle → introduction → redacted transcript → mutual reveal → oriented profile display.
8. Record how it went → met/rating/private notes → persisted outcome acknowledgement.

The live pass is what exposed the CORS and mutual-reveal defects fixed in section 2.

## 13. Explicit misses and specification deviations

### Product/function gaps

1. No voice recording/transcription for onboarding or Ask.
2. No real Google, Microsoft, or IMAP OAuth/connectors; connection state is scaffolded only.
3. No external email/calendar/file execution or delivery.
4. No Expo push token registration/delivery for briefs, reveals, approvals, watcher hits, or check-ins.
5. No production SMS provider adapter.
6. No true pgvector candidate retrieval despite vector storage fields.
7. No automatic reranker learning from `IntroductionOutcome` labels.
8. No complete intent-management screen.
9. No screening-rule editor UI.
10. No Exchange item edit/delete UI or advanced condition/range/urgency fields.
11. No direct skill-share recipient UI.
12. No mobile mute control or admin moderation console.
13. No automatic propagation of corrected group skills to all member copies.
14. No teach-by-doing desktop/browser trace capture or replay.
15. No public production deployment, domain, CDN, managed database, secrets manager, backups, or disaster-recovery test.

### UI/design-system deviations

1. The required universal `Ring` component is absent. This is the clearest visual identity miss.
2. App tokens do not match the specified colors exactly.
3. App radii are 10/16/24/999 rather than the required 4/6/30 system.
4. Buttons and many cards are much rounder than specified.
5. The spacing scale uses 24/48 where the requested system specified 20/26/44.
6. Many screens use floating cards and a card shadow token; the brief asked for hairlines/whitespace and at most one elevated surface.
7. Transcript messages use rounded, tail-like bubbles, explicitly discouraged by the brief.
8. Dark color tokens exist in shared planning but the app has no real dark theme.
9. Ask is not the exact central dark circular Ring control.
10. Agent visual identity is a letter/avatar, not Ring plus deterministic seed pattern.

### Client engineering deviations

1. Optimistic update with rollback is implemented for reveal and trust/watcher lifecycle, not every mutation.
2. Circle uses FlashList, but many other lists map inside a ScrollView and are not virtualized.
3. Today has real skeletons; several other screens show text/card loading placeholders rather than layout-matched skeletons.
4. Accessibility is partial: shared buttons/fields have labels and minimum target intent, but custom choices, rows, and icon-only controls need a systematic label/role audit.
5. VoiceOver/TalkBack and dynamic-type stress passes have not been run.
6. Some Today/Circle/Skills queries fall back to demo objects before real data arrives, which is helpful for a reel/demo but can mask network failures.
7. The mobile/UI packages have no component or interaction unit tests.

### Delivery and CI deviations

1. The public GitHub repository exists and is pushed, but GitHub Actions cannot start because the account is billing-locked. CI configuration is present; a green hosted run is not.
2. The initial history is not the multi-commit, build-order history requested; the main implementation landed as a large commit.
3. Android/iOS prebuilds passed, but the app has not been run and signed on both simulators/devices in this environment.
4. App Store/Play Store signing, privacy manifests, store metadata, review accounts, and submission are not complete.
5. Original “not built” items were documented, but individual GitHub backlog issues have not all been verified as created.

## 14. Launch blockers and recommended order

### P0 — required before any real-user public beta

1. Implement the Ring and bring the complete UI onto the exact warm-paper token/radius/hairline system.
2. Run iOS and Android on real simulators/devices; execute Maestro; fix every platform-specific issue.
3. Complete accessibility labels, roles, focus order, dynamic type, reduced motion, VoiceOver, and TalkBack passes.
4. Configure Resend production domain and a real phone OTP provider; abuse-test OTP/account enumeration.
5. Implement Expo push registration, preferences, delivery, retry, and deep links.
6. Choose the first connector wedge and fully implement OAuth, encrypted refresh, read scope, approval-gated write, revocation, and audit. Do not market broad cross-app work before this exists.
7. Replace lexical matching with pgvector nearest-neighbor retrieval and benchmark relevance/safety.
8. Add mobile component tests and automated UI tests to the required flows; remove demo fallbacks from error paths.
9. Complete penetration testing, rate-limit review, secret rotation, database backups/restore drill, dependency/SBOM scanning, and load testing.
10. Deploy a private staging environment with managed PostgreSQL/Redis/object storage, TLS, secrets manager, error monitoring, tracing, metrics dashboards, and paging.
11. Finalize Privacy Policy, Terms, Community Guidelines, deletion/retention policy, law-enforcement process, moderation staffing/SLA, and app-review documentation with counsel.
12. Resolve GitHub billing so hosted CI is actually green and branch protection can require it.

### P1 — required for a credible closed alpha

1. Dedicated intent-management and screening-rule screens.
2. Advanced Exchange fields and item edit/delete.
3. Direct skill share UX and group-version update flow.
4. Admin moderation web console.
5. Full loading/empty/error/offline design for every screen.
6. True notification history and device registration controls.
7. Outcome-conditioned ranking experiment with explicit offline evaluation.
8. User-facing grace-period deletion cancellation and status.
9. Production-ready signature verification instructions for exports.

### P2 — differentiation after reliability

1. Teach-once browser/desktop workflow capture.
2. Verified replay with changed inputs and approval gates.
3. Automatic abstraction mining and cross-task dependency suggestions.
4. Visual searchable capability graph.
5. Local/on-device skill vault and deterministic execution for trusted steps.
6. Longitudinal efficiency dashboard proving fewer actions, model calls, cost, and time.

## 15. What was added beyond the original ORBIT build

1. ORVIN-style immutable skill versions.
2. Skill dependency graph for cross-task reuse.
3. Learning and efficiency receipts.
4. Confidence, evidence, validation status, corrections, and adaptive fallback fields.
5. AES-GCM BYOK storage for three model providers.
6. Deterministic zero-key LLM provider for a fully usable local product.
7. Mute API and model in addition to block/report.
8. Public opaque-token safety-plan view.
9. Raw-message elimination in favor of redacted content plus hashes.
10. Offline GET response cache.
11. Signed ZIP export.
12. Natural-language Ask action router.
13. Real cost ledger, daily caps, retries, and circuit breaker.
14. Realtime per-user event hub.
15. Product/cost/safety admin metrics.
16. Watcher lifecycle and hit-history detail screen added during this audit.

## 16. Final assessment

The app is ready to demonstrate, use locally, and put in front of a small number of supervised design partners after a private deployment. Its backend is unusually complete for an alpha, and the consent/redaction/receipt model is a credible foundation for a trust-sensitive agent product. The ORVIN layer also gives ORBIT a more defensible thesis than a generic memory-and-tools assistant: capabilities are explicit, versioned, correctable, measurable, shareable, and user-owned.

It is **not ready for an unrestricted real-user launch today**. The reason is not that the concept is missing; it is that several promises users will interpret as operational—cross-app execution, push alerts, exact native behavior, production verification, strong visual identity, and app-store-grade safety/accessibility—remain incomplete. Shipping those as if they worked would damage trust at the exact moment ORBIT needs trust most.

The correct next milestone is a **closed alpha with one excellent connector and the Ring-led design system**, not a broad launch with shallow integrations. Once one repeated workflow can be connected, approved, executed, crystallized into a versioned skill, replayed, and shown to become cheaper and more reliable, ORBIT will demonstrate the ORVIN advantage in a way a short reel can communicate and a single user can feel on day one.
