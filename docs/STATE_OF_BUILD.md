# ORBIT state of build

Assessment date: 2026-10-04 (America/Chicago)  
Code assessed: `main` at `087c1a9`  
Decision: what, if anything, should be put in front of 25 students next week

## 1. The one-paragraph answer

If 25 students downloaded ORBIT tomorrow, most could not use it as a real phone app: there is no shared HTTPS deployment or signed build, email delivery is still in development mode, and the current Expo setup has no EAS project. On the local web build, a new student can sign up with an on-screen development code, complete a clear six-question interview, name an agent, create a direct-web watcher, list an exchange item, make a skill, and inspect an honest activity log. They then reach a mostly empty Today, Circle, Inbox, and Skills experience. With the credentials configured today, profile embeddings are never created, so the actual ten-user matching job produced zero introductions. If a returning student signs in again, the app sends them back into agent onboarding even when their agent already exists. Several visible “Forget,” “Delete,” export, and account-deletion actions fail. The right launch next week is therefore not a 25-student product pilot. It is a founder-led usability session with at most five people on the watcher and exchange paths, after fixing the returning-login and empty-request bugs. A 25-person pilot becomes responsible only after those fixes, real email delivery, one model/embedding provider, a public backend, native-device QA, and signed builds.

## 2. The capability table

The status is about the current build, not the intended design. “Works” means I personally ran the path in this assessment. Native iOS and Android remain unverified even where the web path works.

| What the user does | Works today? | Needs what | Works with 1 user? | Evidence |
| --- | --- | --- | --- | --- |
| Create a new account by email | Partly | A deployed API and Resend key/verified sender for real mail. The current local flow exposes the code on screen. Returning login also needs a routing fix. | 1 user | **Fresh-database browser run:** created `state-audit-student@orbit.local` from a database with zero users and reached onboarding. **Returning-login run:** the same account later landed on `/agent` instead of Today. |
| Complete the private interview | Works | Nothing for the fixed local sequence; a model key for adaptive follow-ups | 1 user | **Fresh-database browser run:** answered all six questions. The screen explicitly identified the bounded local sequence. Five `interview` ModelCall rows were written at zero cost. |
| Name the agent | Works | Working API | 1 user | **Fresh-database browser run:** named the agent Atlas; the `Agent` row and Today header reflected the name. |
| Import ChatGPT or Claude history | Unverified | A real export file and native/web file tests | 1 user | **Route sweep:** `/import` loaded in both themes. No archive was uploaded in this assessment, so parser claims remain unverified. |
| Read, correct, or forget memory | Partly | Fix bodyless DELETE requests; an OpenAI embedding key for usable vectors | 1 user | **Memory browser run:** corrected a fact; the database stored source `CORRECTION` and confidence `1`. Clicking **Forget** left the row in place and showed no useful error. All six onboarding facts had no embedding. |
| Read Today and the daily brief | Works | Worker schedule and data-producing features | 1 user | **Fresh-database browser run:** Today showed `0 done`, `0 need you`, `0m saved`, and “Nothing needs you.” **Current-config worker run:** wrote quiet briefs for the ten-user cohort. |
| Ask ORBIT to interpret a request | Partly | More action handlers if this is meant to be a general assistant | 1 user | **Ask browser run:** “Watch for a used bike” filled the input and produced a watcher interpretation requiring approval. Ask did not execute silently, but general task execution was not demonstrated. |
| Set and pause intentions | Partly | Embeddings and a useful population for matching; fix the inactive-date display | 10+ users | **Intent browser run:** paused Friendship and saw the activity receipt. Inactive items displayed “Updated 12/31/1969,” which is confusing. |
| Watch a specific public page | Partly | Public worker hosting; fix watcher deletion | 1 user | **Live direct-URL watcher run:** watched Books to Scrape, fetched “A Light in the Attic,” and recorded a GBP 51.77 hit under a GBP 60 ceiling. A second run deduplicated it. Delete failed and the watcher remained. |
| Search the public web with a watcher | Unverified | `SEARCH_API_KEY` and a real-provider run | 1 user | The key was absent. Only the direct-URL source was run. |
| Connect Gmail, triage mail, and approve drafts | Unverified | Google OAuth credentials, enabled connector, verified callback/consent setup, and a fix for bodyless start/sync/disconnect requests | 1 user | **Missing-credential browser run:** Connections showed `GMAIL UNAVAILABLE` and disabled Connect. No sample mail appeared. A credentialed OAuth and send/draft path was not run. |
| Receive agent-made introductions | Partly | OpenAI embeddings plus a configured conversation/rerank/judge provider; better output prompts and cap handling | 10+ users | **Current-config ten-user worker run:** `introductions: 0`. **Audit-vector diagnostic:** after inserting test-only vectors in the disposable database, the engine made 16 introductions, but this is not a user-achievable current path. |
| Read the two-agent transcript | Partly | Real model output that uses both profiles | 2 users | **Audit-vector diagnostic:** all 16 conversations had eight turns and passed redaction, but the turns repeated the same generic sentence. Three full examples appear below. |
| Mutually reveal identity | Works | A second person and a delivered introduction | 2 users | **Reveal run:** Maya revealed in the UI, Noah revealed through the authenticated API, and the UI then displayed both first names. |
| Record whether an introduction worked | Works | A delivered introduction | 2 users | **Outcome browser run:** saved `yes`, rating `4`, and a private note; the database stored the outcome. |
| Post an exchange have/want item | Partly | Fix item deletion | 2 users | **Exchange browser run:** Maya created a textbook want with condition, budget, trade, and urgency. Delete later failed and the item remained. |
| Receive and accept an exchange proposal | Works | A compatible second listing and the worker | 2 users | **Exchange mutual-acceptance run:** worker made one proposal; Maya accepted in the UI, Liam accepted through the authenticated API, and the UI unlocked a public-place handoff with a no-money warning. |
| Use the approval inbox | Partly | Real Gmail for mail approvals; more UI testing of every item type | 2 users | **Skill-share inbox run:** Liam received the shared skill, adopted it, and approved it. Maya’s new-account inbox was honestly empty. Mail draft approval was not run. |
| Create and preview screening rules | Partly | Gmail data and a fix for rule deletion | 1 user | **Screening browser run:** saved a priority-100 hold rule for `@campus.edu` study-group mail and previewed zero current matches. Delete returned a generic error and the rule remained. |
| Create and correct a skill | Partly | A user-triggered execution path and cache refresh after correction | 1 user | **Skill browser run:** created “Prepare for a chemistry quiz,” then corrected it to version 2. The saved page stayed on version 1 until a hard reload. No useful task was executed from the skill. |
| Share and adopt a skill | Works | A second person | 2 users | **Skill-share run:** Maya shared to Liam; Liam adopted and approved it; `SkillAdoption` recorded source version 1 and lineage. |
| Join a group and use its skill shelf | Partly | Clear role-aware controls and an exercised admin propagation path | 2 users | **Group browser run:** Maya joined Chemistry Club with `CHEM25`. A member was shown **Publish a group skill**; submission then failed with “Only a group admin or owner,” so the control promises more than the role allows. |
| Use safety tools | Partly | A second person; native notification test for due check-ins | 2 users | **Safety browser run:** created a public-place plan, generated a share URL, checked in, and muted the other user. Block and report were not personally run in this assessment. |
| Change trust/autonomy dials | Works | Working API | 1 user | **Trust browser run:** changed watcher behavior from “ask first” to “do and tell”; the saved value remained visible. |
| Read the activity log | Works | Working API | 1 user | **Activity browser run:** showed receipts for agent update, check-in, reveal, intent pause, memory correction, exchange acceptance, watcher work, and authentication. |
| Verify phone or campus identity | Partly | Twilio for real SMS and Resend for real campus email | 1 user | **Phone verification run:** local log-mode code for `+1 312-555-0199` was displayed and verified. Real SMS and campus-email delivery were not run. |
| Inspect a run and its model costs | Works | Runs that finish correctly | 1 user | **Run-detail browser run:** showed a succeeded nightly run, 17 model calls, steps, and `0.00¢`. The separate cap test exposed a stuck running record. |
| Download and verify an account export | Partly | Fix the web download implementation; native device test | 1 user | **Web export run:** failed with `this.validatePath is not a function`. **API/CLI export run:** downloaded a 12 KB ZIP and verified `{ "valid": true, "product": "ORBIT", "formatVersion": "1.0" }`. |
| Schedule or cancel account deletion | Broken | Fix the empty JSON request; then run the app path through the seven-day worker | 1 user | **Deletion browser run:** confirmation appeared, then **Yes, schedule deletion** failed with “ORBIT could not complete this request.” **Direct API diagnostic:** schedule, status, and cancel worked only when the empty JSON content type was omitted. |
| Receive push notifications | Unverified | EAS project ID, signed native build, APNs/FCM credentials, and a physical-device run | 1 user | **Web browser run:** Enable push said remote registration is available only in native iOS and Android apps. No native delivery was tested. |
| Store a personal model API key | Unverified | A real key and verification that a later worker call decrypts and uses it | 1 user | The settings control and encrypted-key code exist, but this path was not exercised. |
| Use staff moderation | Unverified | An admin account, reports, and action tests | 10+ users | **Role-gate browser run:** the normal student correctly saw “Staff access required.” No staff action was run. |

### Agent-to-agent engine: exact ten-user run

I created ten varied users with one or two active intents each: six Friendship, six Study Partner, three Cofounder, two Exchange, and one each for Roommate, Gym Partner, and Mentor. The clean database snapshot had ten users, 20 active intent records, and **zero profile embeddings**. Running the real worker under today’s configuration returned:

```json
{
  "ok": true,
  "results": [
    { "jobName": "watchers", "result": { "hits": 0, "proposals": 0 } },
    { "jobName": "consolidation", "result": { "factsSuperseded": 0, "skillsRevalidated": 0 } },
    { "jobName": "deletion", "result": { "deleted": 0 } },
    { "jobName": "nightly", "result": { "introductions": 0 } },
    { "jobName": "push", "result": { "sent": 0, "retried": 0, "failed": 0 } }
  ]
}
```

The real answer for a typical user’s first week is therefore **zero introductions**. The candidate query requires a non-null profile vector. Re-running the job cannot change that while the embedding key is absent.

For diagnosis only, I inserted deterministic vectors directly into the disposable audit database. This was not an app action and is not evidence that onboarding currently produces vectors. The next worker run made 16 introductions. Counting both people in each introduction, users received 1, 1, 2, 3, 3, 3, 4, 5, 5, and 5 appearances: mean 3.2, median 3. That proves the dormant pipeline can connect records after its hard vector gate; it does not prove useful matching.

### Three full transcripts

The real current-config run produced no transcript because it produced no introductions. These are three transcripts from the clearly separated audit-vector diagnostic. Each conversation had eight turns.

**Transcript 1 — Friendship — Kepler and Patch**

1. Kepler: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
2. Patch: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
3. Kepler: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
4. Patch: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
5. Kepler: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
6. Patch: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
7. Kepler: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
8. Patch: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”

**Transcript 2 — Cofounder — Patch and Relay**

1. Patch: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
2. Relay: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
3. Patch: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
4. Relay: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
5. Patch: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
6. Relay: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
7. Patch: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
8. Relay: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”

**Transcript 3 — Study Partner — Kepler and Sol**

1. Kepler: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
2. Sol: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
3. Kepler: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
4. Sol: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
5. Kepler: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
6. Sol: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
7. Kepler: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”
8. Sol: “I care most about whether our users would genuinely work well together. What would a good first meeting look like for yours?”

The judge gave every diagnostic conversation score 86 with the same broad reasons and the same library-café suggestion. A human would read these as placeholders, not agents representing specific people.

### Where matching quality comes from today

Today it comes from nowhere usable. The embedding is a hard admission gate, and it is missing. pgvector only retrieves nearby vectors; it cannot repair a missing or poor representation. After test-only vectors were supplied, the deterministic re-ranker and judge produced generic output that did not distinguish the profiles. The weakest link in the exact current build is **embedding creation**, because its absence reduces the result to zero. The next weakest link is **profile-grounded conversation and judgment**, because the stub speaks and scores generically. No assessment in this pass establishes human match quality.

### Measured model cost per user per day

The exact paid-provider charge recorded by `ModelCall` was **$0.00**, because every call used the deterministic stub. The audit-vector diagnostic created the following ledger. Per-user numbers are arithmetic means across the ten users, not a promise that spend is evenly distributed.

| Task | Calls | Input tokens | Output tokens | Calls per user | Tokens per user | Recorded cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Conversation | 128 | 57,707 | 3,968 | 12.8 | 5,770.7 in / 396.8 out | $0.00 |
| Judge | 16 | 5,500 | 1,488 | 1.6 | 550.0 in / 148.8 out | $0.00 |
| Redaction | 128 | 11,904 | 5,760 | 12.8 | 1,190.4 in / 576.0 out | $0.00 |
| Re-rank | 58 | 8,980 | 928 | 5.8 | 898.0 in / 92.8 out | $0.00 |
| Interview, from onboarding | 5 | 702 | 135 | 0.5 | 70.2 in / 13.5 out | $0.00 |

At the measured rate, **25 students for 30 days cost $0.00 in model charges**. That figure is true but not useful for planning a real provider. Applying the repository’s current example Luna prices to the same matching tokens gives a counterfactual $0.031391 for the ten-user night, or $0.0031391 per user-night and about **$2.35 for 25 users over 30 nights**. The one-time measured interview tokens would add less than one cent for 25 people at those example rates. This does not include hosting, PostgreSQL, Redis, SMS, email, search, EAS, retries, or the possibility that real model outputs use more tokens. There is not enough measured evidence to quote an all-in monthly bill.

### Missing credentials and what stays dead

| Missing setting/account | User-facing effect now |
| --- | --- |
| `OPENAI_API_KEY` | No profile or memory embeddings. The matching job has no candidates and introductions stay at zero. |
| One selected conversation provider: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_GENERATIVE_AI_API_KEY` plus its price settings | Interview, conversation, re-rank, judge, drafting, redaction, and skill reasoning stay on generic zero-cost stubs. OpenAI is still separately needed for the current embedding implementation. |
| `RESEND_API_KEY` and verified `RESEND_FROM_EMAIL` | Real students receive no email sign-in or campus-verification code. Development mode can display the code locally. |
| Twilio account SID, auth token, and sending number | Real SMS verification is unavailable; only local log mode was run. |
| Google OAuth client ID, secret, allowed callback, consent-screen setup, and enabled Gmail flag | Gmail connect, sync, triage, and draft work are unavailable. Even after credentials, the bodyless-request bug must be fixed and the flow retested. |
| `SEARCH_API_KEY` | Search-backed watchers are unavailable. Direct public URLs still work. |
| `EXPO_PUBLIC_EAS_PROJECT_ID`, Apple push key, and Android FCM credentials | Native push registration and delivery cannot be tested or used. |
| Public `DATABASE_URL`, `REDIS_URL`, HTTPS API/WSS host, object-storage credentials, and rotated JWT/encryption/export secrets | The app cannot work away from the development laptop as a shared service. |
| Apple Developer and Google Play developer accounts | No signed iOS distribution and no Play-based Android distribution. |
| `SENTRY_DSN` or another monitoring destination | Failures are not reported to an operator; this does not directly block a button, but it makes a pilot harder to support. |

## 3. The first ten minutes

This is the exact clean-database web walkthrough, with no provider credentials beyond local development settings.

**Minute 0–2: Sign in.** The opening screen says “A second self that gets better at being useful.” The student enters an email and requests a six-digit code. The code is displayed and prefilled because the local server has development-code display enabled. That is useful for testing but is not email delivery. A new student then enters a name and date of birth.

**Minute 2–7: Meet the agent.** The student lands on “Meet your private agent.” The app says no sample profile is loaded and identifies the bounded local interview. It asks six fixed questions about goals, working style, social preferences, schedule, boundaries, and what the student wants help with. Answers save correctly. The final step asks for the agent’s name; Maya named hers Atlas.

**Minute 7–8: Today.** The first real home screen is clean but empty. It showed `0 done`, `0 need you`, and `0m saved this week`, followed by “Nothing needs you.” The useful action is **Create watcher**. There is no fabricated introduction, task, skill, or message.

**Minute 8–9: Circle, Ask, and Skills.** Circle says the agent is looking carefully and points to intent management. It has no people. Ask offers examples, and the watcher example turns into a reviewable proposal. Skills says “No skills yet” and offers creation. A student who explores can make configuration, but the agent has not independently done anything useful yet.

**Minute 9–10: You and settings.** You shows the student and agent names and links to Memory, Intents, Inbox, Watchers, Trust, Verification, Activity, Connections, Screening, Groups, Exchange, Safety, Admin, and Settings. Connections plainly says Gmail is unavailable. Enable push plainly says native only. Export and deletion look available but fail on web when pressed. A curious student finds a lot of surface area; a normal student is likely to put the phone down after seeing that the main tabs are empty.

### Screen and theme evidence

The **light-mode route sweep** opened 31 distinct authenticated user routes plus the sign-in screen. The **dark-mode route sweep** opened the same 31 routes with `prefers-color-scheme: dark` true; none was empty and none contained an application-error signature. These included Today, Circle, Ask, Skills, You, agent onboarding, import, activity, admin gate, connections, exchange list/new/detail, groups list/detail, inbox, intents, introduction detail, memory, run detail, safety, screening, settings, skill list/new/edit/detail, trust, verification, watcher list/new/detail, and their real dynamic records. The production web export also generated 43 routes; that larger number includes aliases, layout-group forms, the sitemap, and the not-found route. This evidence establishes that the web screens render in both themes. It does not establish native layout, accessibility, or every action on each screen.

Repository gates run after the walkthrough: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` passed. The test run had 59 passing tests and 10 skipped database-dependent tests. The build exported 43 web routes. `pnpm format:check` failed on the tracked generated file `apps/mobile/expo-env.d.ts`, so the full `pnpm run ci` gate is currently red.

## 4. Day two

If the student stays signed in and opens ORBIT the next morning, token refresh should preserve the session. With today’s credentials, the matching worker still has no profile embeddings and creates no introductions. The daily brief says, in effect, “Quiet night. Nothing needs you.” A direct-page watcher can produce value if the source changed; in the audit, the first check created one real hit and the second unchanged check correctly produced no duplicate. Exchange requires someone else to post the opposite side. Skills do not wake up and execute a student’s work. Gmail and push are still unavailable. The honest default Day Two is therefore **nothing new**.

If the student signed out, reinstalled, or otherwise has to sign in again, the problem is worse: the successful sign-in always routes to `/agent`. The “I already have an agent” control starts the interview instead of taking the student to Today. The existing account is effectively stuck in repeat onboarding unless the student knows a direct route.

### What happens when a cost cap is hit mid-run

I inserted a 35-cent same-day ledger charge for test users, which equals `USER_DAILY_COST_CAP_CENTS`, then ran the real worker with two new vector-bearing users and a shared Friendship intent. The worker exited with code 1 and `CostCapError: The daily model budget for this user has been reached.` The latest `nightly_rerank` Run row was left `RUNNING` with no `endedAt`. No introduction or new daily brief was created after the failure. The app did not show a “budget reached” state; the student would see stale or empty content, and an operator would see a job failure. The schema’s `PAUSED_COST_CAP` state is not used by this path. One capped user can therefore abort the rest of the nightly loop.

## 5. What is half-built

| Reachable area | What disappoints the user | Evidence |
| --- | --- | --- |
| Returning sign-in | A valid existing account is sent back to onboarding and cannot choose “go to Today.” | Returning-login browser run and the unconditional `/agent` route after verification. |
| Memory, watchers, exchange, screening, deletion | Confirmations exist, but bodyless POST/DELETE calls are sent with `Content-Type: application/json`. Fastify rejects the empty body. Memory fails silently; the others show a generic error. | Browser failures plus API log: `Body cannot be empty when content-type is set to 'application/json'`. |
| Account export | The API creates a valid signed archive, but the web button calls a file-path method that is not available there. | Web error `this.validatePath is not a function`; separate API/CLI verification passed. |
| Matching | The core engine is gated on vectors that onboarding cannot create without OpenAI. | Ten users, zero vector-bearing profiles, zero introductions. |
| Agent conversation and judge | Stub output satisfies shape and redaction checks but repeats one generic sentence and one generic score. | The three transcripts above; all diagnostic verdicts scored 86. |
| Skills | Creation, sharing, adoption, and versions exist. A student cannot press a skill and watch it accomplish the named work. The edit screen can also show the old version until reload. | Chemistry skill browser run. |
| Groups | Join and shelf screens exist, but a normal member sees a publishing control that only fails after submission. Admin propagation was not run. | Chemistry Club browser run. |
| Gmail | The unavailable state is honest. The credentialed flow is untested and its bodyless start/sync/disconnect calls share the confirmed client bug. | Connections missing-credential run and request-helper inspection. |
| Notifications | Web declines registration correctly. The native queue, credentials, deep links, and physical delivery have not been exercised. | Settings browser run; no device evidence. |
| Import | A polished upload screen exists, but no real export was processed in this assessment. | Route sweep only. |
| Screening | Rule creation and preview work, but there is no real mailbox to screen and delete fails. | Screening browser run. |
| Admin | Normal-user denial works; actual staff review and action do not have current run evidence. | Admin browser role-gate run only. |

### Club-work coordination: what it would take

There is **no GitHub product integration today**. A repository search found no GitHub OAuth, App installation, webhook, issue, pull-request, commit, or Projects ingestion code. Existing pieces that can be reused are accounts, agents, groups and membership, encrypted OAuth-token storage patterns, worker schedules, model routing and ledgers, inbox approvals, activity receipts, push queue, screening concepts, and versioned shared skills.

The new work is substantial:

1. Create a GitHub App or OAuth flow with least-privilege read scopes and installation management.
2. Verify webhook signatures; handle replay, deduplication, backfill, rate limits, and sync cursors.
3. Add repository, club-project, work-item, pull-request, commit, member mapping, provenance, and freshness records.
4. Define who may connect a club, which repositories are visible, what one member’s agent may reveal to another, and how removed members lose access.
5. Build grounded summaries that cite issue/PR/commit links, state when data is stale, and refuse unsupported answers.
6. Add group project screens, connection health, “ask where things stand,” member visibility controls, receipts, and notification preferences.
7. Test deleted/private repositories, renamed accounts, fork activity, webhook loss, rate limiting, prompt injection in GitHub text, and cross-club isolation.

For one experienced full-time engineer who knows this codebase, a narrow invite-only pilot for one GitHub organization is roughly **3–5 engineering weeks**. A version I would put in front of unrelated clubs is **6–10 weeks**, including permission review, failure recovery, security tests, native QA, and operational tools. GitHub App review or organization approval can add calendar time. This estimate is not a commitment and assumes the current login, request-body, deployment, and matching blockers are handled separately.

### Pass 2 claims I would soften or withdraw

| Earlier claim | Current wording | Evidence from this assessment |
| --- | --- | --- |
| “Working local full-stack alpha” | **Soften:** important happy paths run locally, but returning login, several visible mutations, and web export fail. | Fresh and returning browser runs. |
| “Local web product evaluation: Ready” | **Withdraw as a general statement:** it is ready for a guided watcher/exchange demo, not unsupervised evaluation of the whole app. | Empty first day plus reachable failures. |
| “Automated repository gate: Ready locally” | **Soften:** lint, typecheck, 59 tests, and build pass; the full gate fails formatting on `apps/mobile/expo-env.d.ts`, and 10 integration tests skip without the test database flag. | Commands run on 2026-10-04. |
| Memory facts “can be … removed” | **Withdraw for the app:** correction works; Forget does not remove the row. | Memory browser run and database check. |
| Watcher lifecycle includes deletion | **Soften:** create, real fetch, hit, pause, resume, and dedupe work; delete confirmation renders, but deletion fails. | Live watcher run. |
| Screening supports edit/delete | **Soften:** creation and preview work; delete fails; Gmail-backed usefulness is untested. | Screening browser run. |
| Exchange items can be edited or deleted | **Soften:** creation and proposal handoff work; delete fails. | Exchange browser run. |
| Account deletion schedules, shows countdown, and cancels | **Withdraw for the app:** the API works with a correctly formed empty request, but the visible web action fails before scheduling. | Browser and direct-API diagnostics. |
| Signed export is a passed user capability | **Narrow to API/CLI:** signature and archive verification work; the web user cannot currently download it. | Web failure and CLI verifier output. |
| Gmail has a complete connect/sync/disconnect path | **Soften to unverified:** no credentials were present, and the client’s bodyless requests are likely to fail even after credentials. | Missing-credential UI plus confirmed request-helper behavior. |
| The agent-to-agent differentiator is operational | **Soften sharply:** the current configuration yields zero introductions; test-only vectors unlock generic transcripts and scores. | Ten-user runs and transcripts. |
| Re-ranker evaluation implies useful matching | **Keep only as an offline fixture result:** it does not establish student-level match quality. | Real cohort had no vectors; diagnostic output was generic. |
| Skills decide when to reuse learned procedures | **Soften to stored/versioned procedure infrastructure:** create, correct, share, and adopt work; useful end-user execution was not demonstrated. | Skill browser run. |
| Group corrections propagate through review | **Mark unverified in this assessment:** join works; member publishing UX misleads; propagation was not run. | Group browser run. |
| Push is an available product capability | **Mark unverified:** queue code exists, but registration and delivery were not tested on a signed physical-device build. | Settings browser run. |
| Destructive paths are safely covered by confirmation | **Soften:** confirmations are present, but several confirmed actions fail. A warning dialog is not evidence that the action completes. | Four failed browser actions. |

## 6. What breaks first

1. **Students cannot get into a shared app.** There is no public API, real email OTP, or signed build. Expo Go can show the local UI, but that is a developer session tied to a bundler and laptop. To a student, the invitation either does not exist or sign-in mail never arrives.
2. **Returning students are sent back to onboarding.** This is nearly certain after a sign-out or fresh install because the route is unconditional. The user sees “Meet your private agent” despite already having one and has no normal path home.
3. **The core promise produces nothing.** Without embeddings, ten thoughtful profiles still create zero introductions. The user sees an empty Circle and another quiet brief, with no explanation that a provider is missing.
4. **Visible maintenance and privacy controls fail.** Forget, watcher delete, exchange delete, screening delete, account deletion, and web export either error or do nothing. These failures damage trust because they occur exactly when the user asks ORBIT to remove or return personal data.
5. **One capped user can stop the nightly job.** The worker exits, leaves a run stuck, and does not build the remaining briefs. The student gets silence rather than a budget message; the founder has to diagnose logs.

### The single biggest two-day deletion reason

**There is no recurring payoff after the interview.** The interview creates anticipation, but Today and Circle stay empty, skills do not execute, Gmail and push are absent, and no embedding means no introductions. The returning-login bug is severe, but many students will delete ORBIT before encountering it because Day Two looks the same as Day One.

## 7. Launch mechanics

### Work that must happen before either platform

1. Fix returning-account routing and all bodyless request failures. Fix web export. Catch cost-cap errors per user, mark runs correctly, continue the batch, and show a plain-language state.
2. Provision a public HTTPS API and WebSocket endpoint, PostgreSQL with pgvector, Redis, backups, log/alert collection, and rotated JWT, field-encryption, and export-signing secrets. Point the app at that host; `localhost` on a phone means the phone itself.
3. Add Resend and a verified sender. Add OpenAI for embeddings and one chosen paid model provider with explicit task prices and caps. Add Brave only if search watchers are in the pilot. Gmail, Twilio, and push can be omitted from the first pilot only if the UI clearly labels those features unavailable.
4. Run the ten-user cohort again with provider-made vectors and real model output. Read the transcripts before inviting students. Run deletion/export/privacy controls again.
5. Create an Expo project and `eas.json`. The source already has iOS and Android identifiers `com.orbit.companion`, but it has no checked-in EAS build profiles and `EXPO_PUBLIC_EAS_PROJECT_ID` is blank.
6. Build on physical iOS and Android devices. Repeat signup, refresh/relogin, watcher, exchange, introduction, reveal, safety, export, deletion, deep links, background/resume, poor-network behavior, and push.

Expo Go is sufficient for local UI work and calling a reachable development API. It is not the right package for 25 students: remote push is unavailable in current Expo Go, its native modules are fixed, and it depends on a development server. Expo recommends a development or internal build for these capabilities. The Expo Push Service itself has no send fee, but app credentials and a native build are still required ([Expo push FAQ](https://docs.expo.dev/push-notifications/faq/), [Expo development-build FAQ](https://docs.expo.dev/develop/development-builds/faq/)).

### iOS: fastest path for 25 students

1. Enroll in the Apple Developer Program: **$99 per year** in the US. Organization enrollment needs the legal entity and D-U-N-S details; Apple does not promise instant approval ([Apple membership comparison](https://developer.apple.com/support/compare-memberships/)). Budget one to several days if the account is not already active.
2. Configure the Expo project, signing, APNs, environment variables, and an iOS preview/store build. Once configuration is correct, budget roughly 30–90 minutes for a first cloud-build attempt plus time for signing mistakes; this is a planning range, not an Expo guarantee.
3. Choose one distribution route:
   - **Fastest without Apple review: EAS internal/ad hoc.** Collect all 25 device UDIDs, register them, and build an IPA containing those devices. Apple permits up to 100 devices per product family per membership year. New devices require a rebuild or re-sign. Expo warns that a newly registered device on a new/recently renewed membership can take 24–72 hours to become usable ([Apple device limits](https://developer.apple.com/help/account/devices/devices-overview), [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/)). Allow 1–3 days to collect devices and absorb that risk.
   - **Easier for students: external TestFlight.** Upload a store-signed build. Apple usually processes it in 5–10 minutes but gives no guarantee. The first external build goes through beta review; budget several days because review time is not promised. External TestFlight supports up to 10,000 testers. Do not make 25 students App Store Connect team members merely to call them “internal” testers ([Expo TestFlight guide](https://docs.expo.dev/submit/testflight/), [Apple TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)).
4. For this pilot, skip the public App Store listing and public App Review. Use ad hoc if speed matters more than enrollment friction; use external TestFlight if installation simplicity matters more than review risk.

### Android: fastest path for 25 students

1. The quickest route is an EAS internal APK link. Android users install the signed APK after accepting the unknown-source warning. It needs no Play review and can be done the same day after a successful build. This is less polished and may worry students.
2. The cleaner route is Google Play internal testing. A full-distribution developer account has a **$25 one-time fee** and identity verification. Upload an Android App Bundle, add the 25 tester emails, and share the opt-in link. Google permits up to 100 internal testers and says a new internal-test bundle is normally available within minutes; standard public-store review can be skipped for this track ([Google account fee](https://support.google.com/android-developer-console/answer/16604405?hl=en), [Play internal testing](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en-en)). Account verification can add days, so open the account before the pilot week.
3. Skip closed testing, open testing, and production release for the 25-person pilot. Keep a direct feedback channel because test users cannot leave public reviews.

### Build-service cost and schedule

Expo’s current Free plan lists 15 Android and 15 iOS builds per month, which is enough for a careful first pilot if rebuilds are controlled. Starter is optional at **$19/month** and adds priority/build credit; it is not required to distribute 25 copies ([Expo pricing](https://expo.dev/pricing), [Expo billing guide](https://docs.expo.dev/billing/plans/)). The store-account minimum is therefore $99/year for iOS and $25 once for Google Play if both store channels are used. Provider usage, hosting, SMS, email, monitoring, and engineering time are additional.

The calendar-critical path is not store review. It is fixing the known user-blocking bugs, deploying a real backend, supplying embeddings and email, and completing physical-device QA. If those are not complete, distributing faster only exposes the failures to more students.
