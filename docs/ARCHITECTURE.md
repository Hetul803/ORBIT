# Architecture

## System boundaries

The mobile app owns presentation, local secure tokens, a bounded offline cache, and explicit user approvals. The API owns identity, authorization, validation, consent transactions, safety actions, export/deletion requests, realtime events, and all database access. Workers own scheduled or expensive background execution; neither client nor API request handlers impersonate the scheduler.

Shared Zod contracts keep wire shapes stable. Prisma models and SQL migrations enforce unique decisions, relationship ownership, and append-only activity records. The LLM and agent packages remain provider- and transport-independent so they can be tested without Fastify, Expo, or paid keys.

## Introduction pipeline

```text
active intent + memory profile
  → deterministic eligibility filters
      block/mute, group scope, adult compatibility, recent activity,
      duplicate introduction, daily cap
  → retrieve up to 20
  → LLM rerank to 5
  → bounded alternating agent conversation
      max turns + max tokens + immediate unsafe stop
  → regex redaction
  → model redaction
  → second regex verification
  → persist redacted text + original hash only
  → independent judge reads redacted transcript
  → score >= threshold creates pending introduction
  → each human records an immutable decision
  → reveal only intersection(selected fields A, selected fields B)
  → activity receipts + realtime event
```

If either redaction stage is uncertain, the pipeline marks the conversation `REDACTION_FAILED`; all list, detail, transcript, and decision queries require `redactionPassed = true`.

## ORVIN-derived learning backbone

A completed workflow produces an experience trace: trigger, steps, tools, approval requirements, outcome, timing, and model-call evidence. Only a validated trace with successful steps can crystallize into a skill definition. Each correction creates evidence for a new version rather than silently changing history; confidence, validation pass rate, input coverage, and consecutive failures route execution among compiled replay, hybrid replay plus reasoning, or full frontier reasoning.

The skill graph records dependencies, permissions, explicit success checks, unfamiliar branches, and a fallback. A learning receipt compares the first run with the current run—actions, model calls, reusable steps, confidence, and whether fallback was needed—so value is visible even for a single user.

## Data and security properties

- Access JWTs are short-lived; refresh tokens are hashed, rotated, and revocable.
- OTPs and IP addresses are hashed; production logs redact authorization, refresh tokens, and API keys.
- BYOK values are AES-256-GCM encrypted and resolved only for the selected provider call.
- Every model call records user/run/conversation, tokens, latency, provider, model, and cost, but never prompts or keys.
- Safety blocks are symmetric in matching; reports and moderation actions are auditable.
- Export archives are generated per request and signed; history imports are not retained.
- Deletion removes personal relations after a grace period and retains only an anonymized audit tombstone.

## Scaling path

API instances are stateless apart from authenticated WebSocket membership and can sit behind a load balancer; production should replace the in-memory realtime hub with Redis pub/sub. BullMQ job concurrency and database uniqueness make retries idempotent. Matching currently uses deterministic lexical retrieval with pgvector-ready columns; a production embedding backfill can replace retrieval scoring without changing filtering, reranking, conversation, consent, or surface contracts.
