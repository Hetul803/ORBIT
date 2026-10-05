# ORBIT Pass 4 verification

**Date:** 2026-10-05
**Scope:** local PostgreSQL 16/pgvector + Redis, API, worker, Expo web, real OpenRouter calls, and a synthetic ten-person cohort.
**Secret handling:** no credential value is reproduced in this file. `.env` remains ignored by Git.

## Decision summary

Pass 4 establishes that real-provider interview, embedding, matching, redaction, judging, profile portability, and proactive-policy paths execute locally. The implementation is suitable for a tightly supervised founder alpha, not a broad public launch. The main reason is evidence: synthetic tests demonstrate plumbing and privacy boundaries, but they do not establish relationship outcomes with real people.

| Area                        | Status                          | What was observed                                                                                                                                         |
| --------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real ten-person cohort      | Verified                        | 10 synthetic adults, 60 interview facts, 10 non-null profile vectors before later profile-portability fixtures were added.                                |
| Real-model matching         | Verified with failures recorded | 19 real-provider conversations in the bounded evaluation window; 11 completed, 7 failed closed in redaction, 1 moderation-flagged.                        |
| Introductions               | Verified                        | 8 introductions were created from completed real runs; low-score and failed runs did not become introductions.                                            |
| Price ledger                | Verified for ledgered calls     | Exact tracked cohort spend through the evaluation cutoff: **18.578441 cents** ($0.18578441). See the ledger table below.                                  |
| Runtime model tiers         | Verified                        | Live catalog resolver, configuration-only tier selection, fallback routes, and explicit price fallback are implemented and unit tested.                   |
| Founder profile portability | Verified                        | Export → fresh account import preserved all five layers, state expiry, and one skill.                                                                     |
| Proactive controls          | Verified                        | Five distinct accepts offer Act; a separate approval is required; two dismissals lower a policy to Propose. Scheduled worker created no external action.  |
| Offline boundary            | Partially verified              | Read-cache and reversible-action queue contracts are unit tested; browser showed the truthful offline state. Native device interruption remains untested. |
| Real-user launch claim      | Not established                 | No real opted-in outcome cohort, credentialed connector exercise, native device matrix, or public deployment was performed.                               |

---

## Part 1 — real-model cohort and matching quality

### Cohort setup

The test database was migrated through migration 10. The initial cohort contained exactly these ten synthetic profiles: Mara, Owen, Diego, Priya, Aisha, Ben, Leila, Noah, Sofia, and Cal. They were created through the actual OTP, agent, and interview HTTP routes rather than inserted as finished profiles.

Before the later profile-portability fixtures, SQL inspection returned:

| Measurement                              | Result |
| ---------------------------------------- | -----: |
| Cohort users                             |     10 |
| Interview-derived memory facts           |     60 |
| Non-null `Agent.profileEmbedding` values |     10 |
| Facts without an embedding in the cohort |      0 |

The ten profiles were intentionally diverse in pace, work style, activities, social energy, and boundaries. They include an urban planner who sketches transit maps, a library/museum worker, a spontaneous climber, a climate-data researcher, a musician/volunteer, a runner/woodworker, a neighborhood photographer/zine maker, a game-prototype designer, a cook/yoga teacher, and a robotics/cycling hobbyist.

### Real route and model evidence

The live evaluation used OpenRouter-backed calls. Interview and the first runs used Gemini Flash; the final mid-tier configuration moved conversations and reranking to GPT-4.1 mini after Gemini was observed to be less consistent at structured redaction and fact discipline. The judge used Claude Sonnet 5.5. Redaction used GPT-4o mini. Embeddings used OpenRouter's `openai/text-embedding-3-small` at 1,536 dimensions.

The privacy gate did its job visibly: seven candidate conversations were stored as `REDACTION_FAILED` and never judged or introduced. That is a desired failure mode, not a success metric. One run was moderation-flagged. The completed transcripts below contain no contact details or internal database identifiers.

### Five complete stored transcripts

Names below are synthetic cohort labels. `A` and `B` are the two private agents; the stored text itself no longer includes agent record IDs.

#### 1. Expected mismatch — Diego / Priya, judge score 30/100

**Judge outcome:** no introduction. The judge identified incompatible spontaneity, pressure, and recovery patterns. A short scheduled coffee or walk was the only plausible low-pressure test, not a recommendation to force a connection.

```text
0 A: How do you usually balance your week between climbing, pickup games, and spontaneous food runs?
1 B: I focus on protected deep-work blocks and clear lab plans, so spontaneous activities like food runs or pickup games are less frequent for me. How do you usually structure your week to balance social and focused time?
2 A: I aim for a good week with three bouldering sessions, a pickup game, and yes to unplanned food runs. Do you get energy from playful, direct people who try new things, or do you prefer more planned, cautious hangouts?
3 B: I tend to prefer more planned and cautious hangouts that fit around focused work. Reflective conversations and clear intentions help me recharge. How do you feel about social settings that involve loud competition or spontaneous pressure?
4 A: I thrive on playful, direct energy and quick decisions—hesitation without an answer drains me. Loud competition and spontaneous pressure can be energizing if it keeps momentum going. Do you find that kind of vibe helps or hinders your focus and recharging?
5 B: That kind of loud, spontaneous energy tends to drain me rather than help my focus or recharging. I protect my recovery time carefully when decisions or social pressure get intense. Do you often find yourself needing to step back and recharge after those energetic social moments?
6 A: Yeah, I do need to step back sometimes, but I usually bounce back quickly if the energy stays playful and honest. How do you usually recharge after social or work intensity—do you prefer solo downtime or low-key group hangouts?
7 B: I usually prefer solo downtime or quiet, low-key hangouts with one close friend. That helps me recover without adding social pressure. Does that kind of slower, more reflective pace fit with how you like to spend your recovery time?
```

Judge reasons: Diego wanted three bouldering sessions, pickup games, and unplanned food runs; Priya protected deep-work blocks and rarely chose spontaneous activity. Their reactions to loud competition and quick decisions were opposite. The only overlap was clear communication and a possible quiet one-on-one setting.

#### 2. Stronger fit — Leila / Mara, judge score 86/100

**Judge outcome:** favorable, with an explicit caution about differing social energy. Suggested first activity: a planned neighborhood walk for photographs and sketches, followed by tea or a small dinner.

```text
0 A: When you spend time with someone new, what kind of conversations or moments make you feel most connected and energized?
1 B: I find quiet, patient one-on-one conversations where people notice small details really energizing. I prefer moments that allow for thoughtful exchange rather than loud or last-minute group chats. How about you? What kind of interactions help you recharge and feel connected?
2 A: I’m energized by observant, warm people who bring curiosity and openness to slow conversations. I value space for others to change their minds without pressure. Quick small talk or performative networking tends to drain me. Do you enjoy projects or shared activities that let you explore a neighborhood or story at a relaxed pace?
3 B: Yes, I do appreciate projects or activities that allow a relaxed pace and thoughtful exploration, especially when they involve noticing details and having space to reflect. I like quiet mornings for sketching transit maps and long walks to absorb the surroundings. Do you have any favorite low-key activities or routines that help you feel grounded and connected?
4 A: I enjoy photographing neighborhood stories, editing small zines, and hosting relaxed dinners. These activities let me slow down and notice the world closely while sharing space with others. Do you prefer creative projects that involve collaboration, or do you lean more toward solitary reflection when exploring your surroundings?
5 B: I lean more toward solitary reflection, especially when sketching or planning. It helps me think things through without pressure. That said, I do value steady, patient companionship during long walks or quiet moments. How do you balance your creative projects between solo time and social connection?
6 A: I balance by carving out solo time for photographing and editing, then inviting a few close friends for relaxed dinners where we share stories and observations. It keeps my creativity grounded and nourished by connection without rushing. When collaborating on a project, I prefer a slow, thoughtful pace with clear space for everyone’s ideas to evolve. Does that approach resonate with how you like to engage in shared or creative activities?
7 B: Yes, that resonates well. I appreciate a slow, thoughtful pace where ideas can evolve without pressure. It’s important for me to have enough alone time to think before committing to plans or collaborations. I also protect reliability in friendships, so I value steady, predictable connections over spontaneous or crowded events. How do you usually handle invitations or plans that come up last minute or feel too busy?
```

Judge reasons: both wanted slow one-on-one conversation and disliked networking or loud last-minute groups; photography/zines and transit-map sketching were complementary observational activities; both valued room to think and reliable plans. The judge also correctly flagged that Leila's dinners/collaboration and Mara's solitary reflection could create a social-energy mismatch.

#### 3. Good but overly agreeable — Aisha / Sofia, judge score 78/100

**Judge outcome:** reasonable introduction candidate, but the transcript should be treated as tentative because it mirrors agreement more than it explores a difference.

```text
0 A: What does a dependable creative friend look like to you in everyday interactions or shared activities?
1 B: A dependable creative friend for me would be someone who communicates kindly and early, so plans don’t feel flaky or uncertain. They’d enjoy simple, screen-free activities like exploring farmers markets or community classes without making every outing expensive. How do you usually like to spend time with friends in ways that feel relaxed and genuine?
2 A: I appreciate your focus on kindness and clear communication. I usually enjoy spending time with friends through activities that feel meaningful but not rushed—like rehearsing music together or volunteering side by side. Those moments feel genuine to me. Do you find that shared creative projects or community involvement help build dependable friendships for you?
3 B: Yes, shared creative projects and community involvement do help build dependable friendships for me, especially when they allow space for emotional honesty and don’t add pressure. I find that a week feels right when I cook for friends, teach a beginner yoga class, and have one screen-free evening. How do you balance staying connected with friends while protecting your own routines and boundaries?
4 A: I like that balance you describe—it sounds nurturing and intentional. For me, protecting my routine means prioritizing rehearsals and family calls without letting social plans interfere. I tend to keep my commitments clear and avoid last-minute changes, which helps me stay dependable. When it comes to connection, I value gentle conversations and shared creative moments that don’t demand too much energy or disrupt my focus. How do you respond when friends’ plans feel unpredictable or draining?
5 B: I appreciate your thoughtful approach to balance and clear commitments. When plans feel unpredictable or draining, I tend to step back gently and communicate honestly about my needs, aiming to avoid conflict but also protect my energy. I prefer friends who understand if I need to say no or reschedule without pressure. Does this kind of open, low-pressure communication align with how you like to handle those situations?
6 A: Yes, that approach aligns well with how I handle such situations. I also value honesty and kindness when plans need to change, and I appreciate friends who respect my boundaries without making me feel guilty. It helps keep the friendship steady and supportive. When you say you teach beginner yoga classes, do you find that teaching others creatively energizes your friendships or community connections?
7 B: Teaching beginner yoga classes does energize my friendships and community connections because it creates a shared space where people can learn and grow together without pressure. It feels rewarding to support others gently and practically, which aligns with how I like to nurture relationships. Do you enjoy activities where you can both teach and learn with friends, or do you prefer more equal participation in creative projects?
```

Judge reasons: kind and early communication, low-pressure community activities, and predictable schedules aligned. The judge correctly noted that the dialogue was mostly agreement with too little concrete disagreement. Its first-meeting suggestion—planned farmers market, simple meal, or relaxed jam session—was grounded in facts, but still needs a real human decision.

#### 4. Mixed fit — Diego / Ben, judge score 55/100

**Judge outcome:** do not auto-introduce at this score. A score in this range should remain a founder-review threshold experiment until outcome data supports a policy.

```text
0 A: How often do you like to climb or boulder each week, and are you up for spontaneous food runs or pickup games on top of that?
1 B: How often do you usually spend time outdoors each week, and do you prefer planned activities or more spontaneous ones?
2 A: I like a good week to have three bouldering sessions, a pickup game, and people saying yes to an unplanned food run. How about you—do you get energy from trying new things on the fly, or do you lean toward planning ahead?
3 B: I prefer planned outdoor activities and consistent routines rather than spontaneous ones. How important is it for you that friends stick to a set plan versus being flexible?
4 A: I protect momentum and honest feedback when I choose, so I lean toward flexibility and quick decisions rather than sticking rigidly to plans. Does hesitation without an answer drain your energy too, or do you find comfort in taking time to decide?
5 B: I find hesitation without an answer draining—it disrupts momentum. Quick, clear communication helps me stay grounded. Do you have a hobby you care about that you regularly invest time in?
6 A: I’m all in for climbing—three sessions a week is my sweet spot, plus some pickup games and spontaneous food runs. I’m training for an outdoor climbing trip in six months. What about you? Any hobbies or goals you’re actively working on?
7 B: I focus on woodworking and aim to finish at least one project a month. It keeps me grounded and gives me a tangible result to show for my time. Does your climbing routine leave space for other hobbies or interests, or is it your main focus?
```

Judge reasons: shared direct communication and commitment to a hobby were real positives. Planning style was an explicit conflict and Ben had not shown interest in climbing. The proposed controlled test—a scheduled beginner-friendly bouldering session followed by a pre-agreed food stop—was specific, but should not override the mismatch.

#### 5. Quiet-routine alignment — Mara / Owen, judge score 84/100

**Judge outcome:** plausible introduction candidate; caution that the conversation was mirrored and surface-level.

```text
0 A: What does your ideal quiet morning look like, and how do you like to spend that time?
1 B: A good week gives me early library shifts, a museum sketchbook hour, and one unhurried coffee with a friend. How do you usually like to spend your quiet mornings?
2 A: I like to spend quiet mornings sketching transit maps, which helps me focus and relax. It’s important that this time feels uninterrupted and calm. Do you prefer quiet one-on-one moments like your coffee hour, or do you sometimes enjoy group activities?
3 B: I prefer quiet one-on-one moments, especially when they feel unhurried and calm. Group activities can be nice but only if they’re low-key and don’t interrupt my focus or quiet time. How do you usually balance your sketching with social time?
4 A: I usually keep my sketching mornings separate from social time. I need that quiet to recharge and think before I commit to plans. When I do socialize, I prefer patient one-on-one conversations where details matter. Do you find it easy to protect your alone time before meeting friends, or do you sometimes feel pressured to join larger groups or last-minute plans?
5 B: I find it important to protect my alone time before meeting friends, especially when I have a difficult choice to make. Last-minute plans or larger groups can feel draining rather than energizing. Do you also try to keep your social time predictable and low-key to maintain your energy?
6 A: Yes, I do. I value reliability in plans and enough alone time to prepare mentally. I avoid crowded or loud events unless I’ve agreed to them well in advance. How do you usually handle invitations to events or gatherings that come up unexpectedly?
7 B: I usually decline or ask for more time to decide if the invitation feels too last-minute or might disrupt my quiet time. I try to protect my follow-through and avoid feeling rushed. Do you find it easy to say no to unexpected invitations, or do you sometimes feel obligated to join despite your preferences?
```

Judge reasons: quiet focused mornings, one-on-one time, and predictable plans aligned. The proposed museum-café or library coffee with sketchbooks and a loose one-hour window follows from the transcript. The score is directionally sensible, but there was little contrast-testing and no real-world outcome.

### Human assessment

The agents do ask fact-linked questions and the independent judge catches meaningful mismatches. Diego/Priya is the clearest success: the model did not turn surface politeness into a high compatibility score. Leila/Mara and Mara/Owen have defensible low-pressure activity suggestions.

The weakness is equally clear: several good-score transcripts mirror language, agree too readily, and sometimes make broad statements before enough evidence exists. A 55/100 score is not an automatic introduction policy. The transcript quality is useful enough for a founder-reviewed alpha, but not enough to claim durable match quality. The next proof must be opt-in post-introduction outcome feedback, evaluated against a preregistered threshold and a control.

### Exact tracked cohort spend

This table is from `ModelCall` rows for the ten `verified.*@example.test` cohort users through `2026-10-05 13:24:00` local time. Values are cents, including failed attempts that reached a provider.

| Task         | Provider/model                      |   Calls | Spend (cents) |
| ------------ | ----------------------------------- | ------: | ------------: |
| interview    | OpenRouter / Gemini 2.5 Flash       |      50 |      0.443680 |
| embedding    | OpenRouter / text-embedding-3-small |     120 |      0.010946 |
| rerank       | OpenRouter / Gemini 2.5 Flash       |      78 |      3.735490 |
| rerank       | OpenRouter / GPT-4.1 mini           |      67 |      1.970960 |
| conversation | OpenRouter / Gemini 2.5 Flash       |      50 |      1.308720 |
| conversation | OpenRouter / GPT-4.1 mini           |      77 |      2.734080 |
| redaction    | OpenRouter / GPT-4o mini            |     126 |      0.862365 |
| judge        | OpenRouter / Claude Sonnet 5.5      |      13 |      7.512200 |
| **Total**    |                                     | **581** | **18.578441** |

This is the exact ledgered amount for that window. It is not a statement of every provider charge ever made during exploratory debugging: a few direct catalog/probe calls and early embedding experiments occurred before embedding calls were added to the ledger, so their historical external charge cannot be reconstructed exactly. They are excluded rather than guessed.

---

## Part 2 — runtime model selection and live pricing

The router now supports `cheap`, `mid`, and `strong` tiers selected entirely from environment variables. Task call sites still ask for a task such as `conversation` or `judge`; they do not embed a model slug. The resolver fetches OpenRouter's `/models` catalog at runtime, caches successful prices for one hour, and uses explicit environment metadata if the catalog is unavailable. A catalog lookup on 2026-10-05 returned 466 models.

### Current local tier policy

| Tier   | Primary route                 | Fallback route                 | Observed catalog input / output price per 1M tokens | Work assigned                                                            | Why                                                                        |
| ------ | ----------------------------- | ------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Cheap  | `openai/gpt-4o-mini`          | `google/gemini-2.5-flash-lite` | 15 / 60 cents; fallback 10 / 40 cents               | redaction, embedding task config, Ask routing                            | short structured work and high-volume gates                                |
| Mid    | `openai/gpt-4.1-mini`         | `google/gemini-2.5-flash`      | 40 / 160 cents; fallback 30 / 250 cents             | interview, conversation, rerank, skill crystallization, skill validation | stronger instruction-following without using the judge tier for every turn |
| Strong | `anthropic/claude-sonnet-5.5` | `openai/gpt-4.1`               | 200 / 1000 cents; fallback 200 / 800 cents          | independent judging and drafts                                           | higher-stakes synthesis and explanation                                    |

Prices are observed catalog values, not guarantees. The live resolver and cost ledger make a later catalog move visible in new call records; caps are checked before a request.

### Fallback behavior

- Every task has an explicit primary model, fallback provider, fallback model, and fallback price metadata.
- Provider failures retry within the bounded router policy, then switch to the fallback route.
- A circuit breaker avoids repeatedly hitting a route that has failed enough times.
- `CostCapError` prevents both primary and fallback calls after a user or global daily limit is reached.
- The test suite covers a missing primary provider, a user cap, catalog-price parsing, catalog unavailability, tier mapping, and the fact that a BYOK secret never appears in a ledger record.

---

## Part 3 — founder document: agent reality

See [WHAT_THE_AGENT_IS.md](/Users/hetulpatel/Documents/ORBIT/docs/WHAT_THE_AGENT_IS.md). It answers the six requested questions directly: ownership, interaction, useful work, task specialization, skill sharing, and bounded self-upgrade. It also states the current limit: there is no evidence yet that relationship quality improves at scale.

---

## Part 4 — durable layered profile

Migration `202610050010_profile_and_proactive` adds a durable profile model around the existing memory table.

| Layer         | Purpose                                        | Update rule                                                       |
| ------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| Identity      | facts a person explicitly owns                 | user-locked facts reject inferred replacement                     |
| Preferences   | recurring likes, dislikes, style, and routines | repeated observation raises confidence at three observations      |
| Relationships | people and connection context                  | provenance retained in `sourceRef`                                |
| Judgment      | outcomes, ratings, and inferred lessons        | reviewed history visible through receipts                         |
| State         | time-sensitive work and current context        | default 30-day expiry; expired state retires during consolidation |

Each fact now has a canonical key, state (`ACTIVE`, `SUPERSEDED`, or `RETIRED`), source reference, first/last confirmation time, observation count, expiry policy, optional expiry, and an append-only receipt trail. A newer fact with the same canonical key supersedes an older active fact; a person-locked fact is not silently overwritten by inference. Profile-vector refresh excludes `STATE` facts, so transient work does not distort durable match retrieval.

### Portability verification

The actual API test imported a profile into a source account, exported `/v1/profile/export`, then imported that JSON into a fresh account:

```json
{
  "source": { "facts": 5, "skills": 1, "judgments": 1 },
  "destination": { "facts": 6, "skills": 1, "judgments": 0 },
  "layers": { "identity": 1, "preferences": 1, "relationships": 1, "judgment": 2, "state": 1 },
  "stateExpiry": "7d"
}
```

The destination has two judgment facts because the source contained one judgment-layer fact plus one portable outcome summary. Introduction-outcome rows are not copied as if they belonged to an unrelated introduction; they are imported as judgment facts instead. That preserves useful learning without forging a foreign introduction relationship.

Endpoints:

- `GET /v1/profile` — visible layered profile and receipts.
- `POST /v1/profile/consolidate` — expiry, vector refresh, and consolidation time.
- `GET /v1/profile/export` — versioned `orbit-profile.json` download.
- `POST /v1/profile/import` — validates and imports profile layers, skills, and portable outcome summaries.

---

## Part 5 — proactive suggestions and autonomy

The worker derives candidates from already authorized ORBIT records: approaching commitments, unanswered-message signals, calendar conflicts, watcher hits, stale state facts, recurring state expiry, and a reviewable pattern when three judgment facts exist. Every proposal records a stable key, source reason, confidence, status, autonomy level, due time where known, reversibility, and whether it touches another person.

### Safety policy

| Level   | Meaning                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------- |
| Observe | Retain a signal without asking the user to do anything.                                                 |
| Propose | Show the evidence and require accept, dismiss, or snooze.                                               |
| Act     | Only a safe reversible local suggestion may be marked handled after five accepts and explicit approval. |

Messages, calendar conflicts, watcher hits, and anything touching another person can never be promoted to Act. The implementation contains no external send, invitation, calendar edit, or deletion action. A proposal cannot be accepted twice to manufacture trust.

### Verified behavior

- A worker-only `proactive` run over 12 local test accounts completed with `created: 0`, `acted: 1`, `failed: 0`; the one action was a safe local state action, not an external operation.
- Five **distinct** stale-project proposals were accepted through the API. The policy offered promotion; a separate `approve-act` call changed the level to `act`.
- Two distinct `PATTERN` proposals were dismissed through the API. The policy changed from `act` to `propose` with `consecutiveDismissals: 2`.
- The mobile **Proactive** screen lists proposal evidence/status, controls Observe and Propose, shows a safe Act approval only when earned, and exposes Accept, Snooze, and Dismiss.

Worker configuration includes `PROACTIVE_TICK_CRON` (default every hour at minute 15), `PROACTIVE_DAILY_CAP` (default 6), and a targeted `WORKER_ONCE_JOBS` switch for isolated job verification.

---

## Part 6 — offline, provider, and cost failure paths

### Implemented behavior

| Failure                       | Behavior                                                                                                                                                                                                        | Verification status                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| App cannot reach API          | A visible banner says cached information is shown; queries without a cache return `NETWORK_UNAVAILABLE`, never invented records.                                                                                | Browser confirmed the explicit offline state when loading from a disallowed local origin. |
| Safe cached read              | Brief, life, introductions, skills, watchers, activity, current user, and proactive dashboard GETs can use an AsyncStorage cache.                                                                               | Unit contract covered.                                                                    |
| Offline user action           | Only local reversible actions (Catch dismiss/snooze/complete and proactive response/policy changes) enter an ordered queue of at most 80 entries. A later successful authenticated request replays it in order. | Unit contract covered.                                                                    |
| External action while offline | Inbox approval, sending, connector changes, calendar work, and all unknown writes are rejected rather than queued.                                                                                              | Unit contract covered.                                                                    |
| Provider fails                | Bounded retry, primary/fallback route, circuit breaker, and audit ledger apply.                                                                                                                                 | LLM test covered; real redaction failures were fail-closed.                               |
| No configured embedding key   | No fake vector is written; embedding helper returns no embedding.                                                                                                                                               | Code path inspected; a no-key live server exercise remains pending.                       |
| Cost cap reached              | Router rejects before a provider request and worker records a paused-cost-cap state where applicable.                                                                                                           | LLM test covered.                                                                         |

The mobile suite now has 34 passing tests, including the offline policy test. It does **not** substitute for a native iOS/Android interruption test, background/relaunch replay test, or airplane-mode device run.

---

## Local run state and verification commands

At handoff, the local services were reachable at:

- Web UI: [http://localhost:8081](http://localhost:8081)
- API readiness: [http://127.0.0.1:4101/ready](http://127.0.0.1:4101/ready)

The web UI was opened in a browser and its sign-in flow reached the local development OTP screen. Use `localhost`, not `127.0.0.1`, for the web page if the current API CORS list is unchanged. Development OTP codes are displayed only because the local environment explicitly enables that behavior; production must use a real delivery provider.

The final code gates to run from the repository root are:

```bash
pnpm run ci
pnpm --filter @orbit/mobile test
pnpm --filter @orbit/llm test
pnpm --filter @orbit/api test
pnpm --filter @orbit/worker test
```

---

## Launch decision and remaining proof

**Recommended current release mode: supervised founder alpha only.**

The local product has working user flows and a real model path, but the following evidence is still missing before any public launch claim:

1. A consented real-user outcome study with a published evaluation plan, enough completed introductions, and actual post-meeting ratings.
2. A native iPhone and Android device pass for offline replay, push registration, OAuth callback, secure storage, background/foreground transitions, and error presentation.
3. Credentialed end-to-end tests for Resend, Twilio, Google OAuth/Gmail/Calendar, Expo push receipts, Sentry, search, and deployment infrastructure.
4. A security review of rate limits, deletion/export, OAuth token handling, admin access, web origins, and incident response in the target environment.
5. Load, abuse, and cost-envelope testing on the deployment topology rather than a local database.

Those are evidence gaps, not features being represented as complete. No GitHub work was started in this pass.
