# ORBIT Pass 3 verification

Date: 2026-10-05

## Result at a glance

The Pass 3 code changes are implemented and local automated checks passed. ORBIT is **not deployed**, no native binary was built, and no founder iPhone test was run in this workspace. Those statements are deliberate: there is no root `.env` file, no Railway/EAS project link, no Railway or EAS CLI login, no Docker installation, and no available iPhone/Xcode device toolchain here.

`.env` is protected by `.gitignore` (`.gitignore:6`). No credential was printed, added to a tracked file, or transmitted. The repository contains only variable names and non-secret examples.

## What changed in this pass

### Single-user Gmail and Calendar context

- Added database storage for source-backed Gmail messages and Google Calendar events (`SourceDocument`) plus user-facing Catch/Nudge/Draft items (`LifeItem`). Migration: `202610050009_single_user_life_data`.
- Extended Google OAuth from Gmail-only to the two read-only scopes `gmail.readonly` and `calendar.readonly`. The callback rejects a partial grant; ORBIT never asks for send-email or calendar-write access.
- The first sync queries Gmail for `newer_than:90d`, requests up to five pages of 500 message references, imports up to 2,500 mail records, and reads the next 14 days of primary-calendar events. Gmail is newest-first; the documented 2,500-record ceiling is an intentional bound for a first sync.
- Each imported source retains its original Gmail or Calendar URL. The Catch screen and Ask answers open that original source when tapped.
- Google refresh-token failure with `invalid_grant` marks the connection expired. The app then offers **Reconnect Google** instead of presenting stale data as current. Google testing-mode token expiry still needs a real-device verification.
- Catch derives only evidence-backed items: unanswered inbound requests, promises made by the user, promises made to the user, mentioned dates, subscriptions/renewals, and calendar overlaps. It does not claim to know a fact without a stored source.
- Catch lets a person dismiss an item, snooze it until tomorrow, open the source, copy a draft, or open the original email/calendar event. These actions do not send mail or change an event.
- Draft generation uses up to three sent-email excerpts only when a paid model provider is configured. The prompt requires facts to be limited to the cited incoming email. A draft is marked **NOT SENT** and can only be copied; ORBIT does not send it.
- Ask now queries source-backed life context. It returns a direct answer, confidence, and source citations; unsupported questions explicitly state that no connected evidence was found. It has deterministic paths for active Catch/Nudge items, Amazon receipt totals found in mail, last matching email, and general source search.
- Today contains an honest Catch card with the active count and a direct route to the full Catch screen.

### Reliability fixes from the prior audit

- Bodyless mobile POST/DELETE calls no longer advertise JSON content. This fixes Fastify rejections for dismiss, snooze, connection, and other bodyless mutations.
- OTP verification returns whether the account has an agent. Returning accounts route to Today; the onboarding "I already have an agent" branch also routes to Today.
- A nightly matching run that reaches a model-cost cap now closes as `PAUSED_COST_CAP` rather than leaving its run stuck as `RUNNING`.

### Model routing and cost receipts

- Added OpenRouter as a named model provider rather than treating it as OpenAI. It uses OpenRouter's OpenAI-compatible chat endpoint, records provider/model receipts as `openrouter`, and supports optional `HTTP-Referer` and `X-OpenRouter-Title` headers.
- Embeddings automatically use OpenRouter when `OPENROUTER_API_KEY` is present, with `openai/text-embedding-3-small` at the existing 1,536 dimensions. Direct OpenAI embeddings remain available when an OpenAI key is used instead.
- Paid routing still requires valid per-million-token cost settings, and existing per-user/global daily caps remain in place.

### Mobile build preparation

- Added the generated ORBIT Ring app icon and splash artwork at `apps/mobile/assets/orbit-ring-icon.png` and `apps/mobile/assets/orbit-ring-splash.png`.
- Added `expo-clipboard`, `expo-haptics`, `expo-updates`, and `@sentry/react-native`.
- Added iOS/Android identifiers (`com.orbit.companion`), build/version fields, Android microphone/notification permissions, iOS microphone usage text, the icon, and warm-bone splash configuration.
- Added `app.config.ts`. When an EAS project ID is supplied through the EAS environment, it enables Expo Updates with an app-version runtime policy. When Sentry org/project variables exist, it activates the Sentry Expo build plugin. It does not activate these integrations with blank values.
- Added `eas.json` with development, preview (installable Android APK/internal distribution), and production (App Store/TestFlight) profiles. No store submission profile or store submission command was run.
- The app initializes Sentry only when a public DSN is supplied, samples 10% of traces, and disables default PII sending.

### Railway preparation

- Added separate Railway deployment files for API and worker at `infra/railway/api.json` and `infra/railway/worker.json`.
- The API configuration runs migrations before deployment, starts the API, checks `/ready`, and watches the API/shared-package paths. The worker starts as an always-restarting private service.
- The API now honors Railway's injected `PORT` when `API_PORT` is not set.
- `docs/RUNBOOK.md` now contains the Railway topology, every variable name, its source, the pgvector requirement, Google callback setup, EAS profiles, TestFlight click path, Android APK path, Expo Go limitation, update channels, and Sentry source-map setup.

## Automated evidence

The following commands completed successfully on 2026-10-05 with the repository's Node 24 runtime:

| Check                                                        | Result                                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @orbit/api typecheck`                         | PASS                                                                                                            |
| `pnpm --filter @orbit/api lint`                              | PASS                                                                                                            |
| `pnpm --filter @orbit/api test`                              | PASS — 2 tests passed; 8 database integration tests skipped because an `orbit_test` database was not configured |
| `pnpm --filter @orbit/worker typecheck`                      | PASS                                                                                                            |
| `pnpm --filter @orbit/mobile typecheck`                      | PASS                                                                                                            |
| `pnpm --filter @orbit/mobile lint`                           | PASS                                                                                                            |
| `pnpm --filter @orbit/mobile test`                           | PASS — 32 tests across 3 files                                                                                  |
| `pnpm --filter @orbit/llm test`                              | PASS — 5 tests                                                                                                  |
| `pnpm --filter @orbit/mobile build`                          | PASS — Expo static web export completed                                                                         |
| Expo config with temporary non-secret EAS/Sentry identifiers | PASS — updates URL, EAS project ID, and Sentry plugin appeared in resolved config                               |
| `pnpm run ci`                                                | PASS — format check, lint, typecheck, and test suites all completed                                             |
| `git diff --check`                                           | PASS at the last check before reporting                                                                         |

Database-backed API integration tests remain skipped because an `orbit_test` database was not configured. Docker is not installed in this environment, so a fresh local PostgreSQL/Redis integration run could not be performed.

## Required founder iPhone matrix

No result below is represented as a pass. `BLOCKED` means it was not executed because the needed external account, build, or physical device is unavailable; it is not a substitute for a failed test.

| #   | Required check                                   | Result  | Actual evidence / blocker                                                                                                                          |
| --- | ------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Install the TestFlight build                     | BLOCKED | No EAS project, Apple Developer/App Store Connect access, or submitted TestFlight binary in this workspace.                                        |
| 2   | Connect Gmail and inspect Catch                  | BLOCKED | No production Google OAuth client/callback and no real Gmail authorization was available. **Verbatim Catch output:** none; no real inbox was read. |
| 3   | Ask the five founder life questions              | BLOCKED | No synced Gmail/Calendar sources exist. **Verbatim answers:** none; no synthetic answers were substituted.                                         |
| 4   | Verify commitment Nudge behavior                 | BLOCKED | Requires a real sent/received email thread and source sync.                                                                                        |
| 5   | Verify voice and Live Activity/Dynamic Island    | BLOCKED | Voice capture and Live Activity are not implemented; see issue #19 and #17.                                                                        |
| 6   | Invoke Siri                                      | BLOCKED | Siri App Intents are not implemented; see issue #18.                                                                                               |
| 7   | Use Share sheet                                  | BLOCKED | iOS share extension is not implemented; see issue #20.                                                                                             |
| 8   | Tap a push notification into the intended screen | BLOCKED | No EAS/APNs/FCM credentials or user notification-rule implementation; see issue #21.                                                               |
| 9   | Use cellular with laptop turned off              | BLOCKED | No public Railway API domain has been deployed.                                                                                                    |
| 10  | Observe API-loss state and recovery              | BLOCKED | No public TestFlight/preview build and no deployed API exists.                                                                                     |

The five questions to run after first sync are:

1. `What am I forgetting today?`
2. `Who am I ignoring?`
3. `When did I last email Alex?`
4. `How much did I spend on Amazon this month?`
5. `What conflicts are on my calendar?`

Expected safety property, not a claimed answer: each answer either shows one or more tappable sources or says it could not find evidence. For the Amazon question, the answer must state that it is based only on amounts found in connected mail, not a bank statement.

## Screenshots

No iPhone light-mode or dark-mode screenshots were captured because no native build/device was available. The web export was built, but it is not evidence of iOS rendering. Capture both appearances from the same TestFlight build during the founder matrix and attach them to issue #23.

## Costs observed in this pass

Observed external spend: **$0.00**. No paid provider request, EAS build, Railway service, Gmail/Calendar call, SMS, email, or Sentry event was made from this workspace.

The existing 100-user planning estimate is in `docs/PROVIDER_SETUP_AND_COSTS.md`: about **$65–$150/month** under its stated assumptions. That document predates the OpenRouter route, so do not carry its OpenAI model price example into OpenRouter unchanged. Before enabling `LLM_DEFAULT_PROVIDER=openrouter`, copy the selected OpenRouter model's current input/output prices into the `LLM_*_COST_CENTS_PER_MILLION_TOKENS` variables and set provider-side billing alerts. The application will record actual model calls and enforce its daily caps after deployment.

## Exact founder handoff

1. Create or restore a root `.env` from the approved company password manager. Keep it only on the founder/deployment machine; do not send it in chat. Confirm `git check-ignore -v .env` reports the root `.gitignore` rule.
2. In Railway, create a project with pgvector PostgreSQL and Redis. Follow `docs/RUNBOOK.md` → **Railway founder deployment**. Set the API custom config path to `/infra/railway/api.json` and worker path to `/infra/railway/worker.json`.
3. Add the variables from the runbook. Use Railway references for database/Redis, unique generated server secrets, the real Gmail/Calendar OAuth values, and the server-side OpenRouter key. Do not add any secret under `EXPO_PUBLIC_*`.
4. Deploy API, verify `https://<api-domain>/health` and `/ready`, then deploy worker. Copy the exact HTTPS API domain into the Google callback and EAS `EXPO_PUBLIC_API_URL`; set `EXPO_PUBLIC_WS_URL` to `wss://<api-domain>/v1/stream`.
5. In Google Cloud, enable Gmail API and Google Calendar API; create a Web OAuth client; register exactly `https://<api-domain>/v1/connections/gmail/callback`; add the founder as a test user until the consent/verification process is complete.
6. In `apps/mobile`, run `pnpm dlx eas-cli@latest init` while signed into the company Expo account. Put the returned project UUID into EAS environments as `EXPO_PUBLIC_EAS_PROJECT_ID`, not the repository.
7. In EAS, set public mobile values (`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WS_URL`, EAS project ID, Sentry DSN) and separate Sentry build values (`SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`). Build `preview` for the Android APK and `production` for iOS TestFlight.
8. In App Store Connect, follow **Apps → ORBIT → TestFlight → Internal Testing**. Add the founder to an internal group and install through Apple's TestFlight app. Do not proceed to App Store review in this pass.
9. On the founder phone, sign in, connect Google, return to ORBIT, wait for or tap the initial sync, inspect each Catch item/source, run the five questions above, and save the real outputs/screenshots in issue #23.
10. If the consent screen remains in Google testing mode, repeat the reconnect test after its short-lived authorization expires. The expected UI is **Reconnect Google**, followed by a fresh explicit consent flow.

## Work deliberately left open

- [#13 Railway deployment and public health evidence](https://github.com/Hetul803/ORBIT/issues/13)
- [#14 EAS/TestFlight/Android APK distribution](https://github.com/Hetul803/ORBIT/issues/14)
- [#15 Real Gmail/Calendar OAuth verification](https://github.com/Hetul803/ORBIT/issues/15)
- [#16 Scheduled incremental Google sync and reconnect notification](https://github.com/Hetul803/ORBIT/issues/16)
- [#17 Live Activity and Dynamic Island](https://github.com/Hetul803/ORBIT/issues/17)
- [#18 Siri App Intents](https://github.com/Hetul803/ORBIT/issues/18)
- [#19 Push-to-talk capture/transcription](https://github.com/Hetul803/ORBIT/issues/19)
- [#20 Share extension and home-screen widget](https://github.com/Hetul803/ORBIT/issues/20)
- [#21 Notification rules and deep-link device checks](https://github.com/Hetul803/ORBIT/issues/21)
- [#22 Sentry release/source-map validation](https://github.com/Hetul803/ORBIT/issues/22)
- [#23 Full founder iPhone verification matrix](https://github.com/Hetul803/ORBIT/issues/23)

## Launch status

Code readiness for the implemented read-only context path is meaningful: migrations, APIs, UI, model routing, deployment configuration, and automated checks are present. Operational readiness is not yet established because no server, OAuth app, EAS project, native binary, physical device, or external-provider path has been verified. Do not invite real users or describe Gmail/Calendar, push, voice, Siri, widgets, or Live Activities as available until the linked issues are closed with real-device evidence.
