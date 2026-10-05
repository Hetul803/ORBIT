# What the agent is

ORBIT is a user-owned personal-agent system, not a single open-ended chat prompt. Each account has one persisted `Agent` identity with a calibrated voice profile, layered facts, a vector profile, active intents, consent records, action receipts, and a durable history. The mobile app is where a person gives it context, sees its work, corrects it, and decides what may leave the private boundary.

## 1. Is there a personal agent that genuinely belongs to the user?

Yes. The `Agent` record belongs one-to-one to a `User`; every memory fact, profile embedding, model call, skill, run, life item, watcher, introduction outcome, and proactive policy is scoped to that user and is checked by authenticated API routes. It is not shared as a generic persona. A user can inspect, correct, export, or delete the relevant records. The public-facing “agent” is therefore a data-and-policy boundary owned by the person, rather than a name pasted into a prompt.

## 2. How does a user interact with it?

The first interaction is a six-turn interview. Each answer creates a sourced memory fact and, when a provider is configured, a real embedding. The user then uses the app to:

- edit or delete memories;
- set intents and matching constraints;
- connect narrowly scoped Gmail and Calendar readers;
- view source-cited Catch items and copy drafts rather than send them;
- approve, decline, or reveal mutually selected introduction fields;
- create, inspect, adopt, pause, and retire skills;
- review activity, privacy, safety, model-key, export, and deletion controls; and
- review proactive observations, proposals, and earned autonomy settings.

The agent never exposes an identity or sends an external message merely because a model suggested it. Those transitions are explicit product actions with records.

## 3. How does ORBIT move from prompts to useful work?

It turns a small set of governed inputs into bounded jobs. Profile retrieval creates candidate sets; a task-routed model may rerank them; two private agents hold a bounded conversation; redaction and an independent judge gate an introduction. Other job families turn source-backed mail/calendar metadata into a Catch item, public watcher results into reviewable hits, and repeated validated work into a skill graph. The worker owns scheduled jobs; API handlers own validation, authorization, and user-visible receipts; the app owns presentation and consent.

The new proactive loop has three states:

1. **Observe** records an evidence-backed signal.
2. **Propose** asks the user to accept, dismiss, or snooze it.
3. **Act** is available only for safe, reversible local suggestions after five accepts and a separate user opt-in. It cannot send a message, invite someone, alter a calendar, remove external data, or act on watcher content.

## 4. Are there specialized agents?

There is not a hidden general-purpose swarm. The specialization is deliberately task-scoped and inspectable:

| Scoped worker or model role        | Input boundary                                  | Output boundary                                     |
| ---------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| Interview                          | User answer only                                | One follow-up and durable fact candidate            |
| Matching / reranking               | Eligible, active, consent-compatible profiles   | Ranked private candidates                           |
| Conversation                       | Redacted profile facts only                     | Redacted bounded transcript                         |
| Redaction                          | Candidate model text                            | Persist-or-fail privacy gate                        |
| Judge                              | Redacted transcript                             | Score, reasons, flags, and first-meeting suggestion |
| Watcher                            | Allowed public source with SSRF/robots controls | Cited hit for review                                |
| Life / Catch                       | Read-only authorized source metadata            | Cited local task, nudge, or unsent draft            |
| Skill crystallization / validation | Completed runs and corrections                  | Versioned, reviewable skill graph                   |
| Proactive scheduler                | Existing ORBIT records                          | Observe/propose/limited-safe-act proposal           |

This is the minimum useful specialization: each role has a named input, output, cost ledger, and consent boundary. It avoids giving one broad model ambient access to everything.

## 5. Can a family of agents learn together?

Only through reviewed, reusable procedures—not by pooling private raw memories or transcripts. A validated skill graph can be adopted by another user with a separate ownership record and an adapted definition. Learning receipts retain operational evidence such as success and model-call savings. Outcome feedback can influence a user's own future ranking. There is no cross-user hidden profile training path in the application database.

## 6. Can an agent upgrade itself?

It can propose a bounded upgrade to a skill: a new version is drafted from run evidence, validated, and can be paused or retired when validation drops. It cannot silently change its own authorization policy, promote a proposal to external action, alter user-owned facts that are locked by a person, or deploy code. A user can keep using the prior skill version, and activity records explain the change.

## The practical limit today

ORBIT has real task routing, durable user state, scheduled work, and privacy gates. It does not yet have enough real opt-in outcome volume to claim that its matching judgement improves relationships at population scale. Its value at one user comes from clear memory, source-backed organization, safe drafts, and control; its value at a network grows only as consented outcomes demonstrate that the scores deserve trust.
