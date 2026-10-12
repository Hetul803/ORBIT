# API guide

## October 12 durable-sync contract (local/tested, not deployed yet)

`POST /v1/connections/gmail/sync` now queues a server-owned job and returns **202** `{ok, runId, alreadyRunning, background:true, daysRead:90, maxMessages:2500}`, not a completed sync result. The owner status route includes run, retry and safe-error fields. Successful OAuth callback queues first sync before phone redirect. Additive migration 17 must precede deployment. The API-hosted runner checkpoints each message, handles provider retries and continues without the mobile screen; it does not send Gmail to the model for background Catch extraction.

New authenticated owner-only `GET /v1/mail?category=important` validates category, returns Gmail-label-derived counts and the newest 100 matching headers/source links within the bounded synced set. Categories: important, spam, promotions, social, updates, sent, other; omit category for All. No Google label writes or new scopes. `google.sync_progress` is an empty-payload advisory invalidation. Existing `/v1/agent/chat` and `/v1/life/ask` power separate contexts in the new conversation UI; account lookup results are not added to personal-model history. [Complete contracts/tests/release state](GMAIL_SYNC_CHAT_20261012.md).

The founder has now confirmed Google consent/partial import and successful native personal-chat replies after the scoped OpenRouter key replacement. Older expired-key assertions below are historical. New UI/durable sync are not yet production features.

The API listens on port 4100 by default. Authenticated routes require `Authorization: Bearer <accessToken>`; errors use `{ "error": { "code", "message", "requestId", "details?" } }`. Public exceptions include OTP request/verify/refresh, alpha status, purpose-token waitlist join/remove, the single-use-state Google callback, and safety-plan share. Waitlist tokens are not access tokens.

## Public-alpha safety and admission (October 11)

See also the [October 12 founder-feedback API changes](FOUNDER_FEEDBACK_20261012.md#5-api-changes-in-this-repair): signup/signin mode handling, owner-only group codes, new private group creation, required voice-profile review and new consented personal-agent chat. The chat route uses current owner memories/voice and existing model caps, has no tools/external actions, and has not passed its live-model smoke (local key expired). Server refresh rotation is unchanged; the client now deduplicates concurrent refresh and preserves sessions during temporary failures. Google phone credentials are founder-only Testing, not public verification.

| Endpoint                                      | Authorization / behavior                                                                                                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/alpha/status`                        | Public capacity, full/admission status and honest pause reason; no private account roster.                                                                                                                                                  |
| `POST /v1/auth/otp/verify`                    | Consumes a real verified code; transactionally serializes new accounts under the hard 100 ceiling. Full/paused responses include a ten-minute purpose-bound waitlist token, not a login token. Existing users can sign in when full/paused. |
| `POST /v1/waitlist`                           | Requires `{verificationToken}` from verified OTP; idempotent email entry, explicit UI consent, no account or automatic invitation.                                                                                                          |
| `DELETE /v1/waitlist`                         | Same purpose-bound email proof; no arbitrary-email deletion. Reverify after expiry.                                                                                                                                                         |
| `POST /v1/reports`                            | Authenticated; validates participants, atomically suppresses attached conversation and revokes plan links/queued introduction pushes before alert attempts. Returns actual suppression and provider-acceptance/retry counts.                |
| `POST /v1/blocks`                             | Authenticated; committed pair lock, bidirectional permanent enforcement, no unblock route. Returns `bidirectional: true`, `permanent: true`.                                                                                                |
| `GET /v1/admin/moderation`                    | Current ADMIN/MODERATOR only; reports oldest first with deadlines, acknowledgement/first-action timestamps and generic alert statuses.                                                                                                      |
| `GET /v1/admin/reports/:id`                   | Current staff only; audit-logged privacy-cleared transcript, never raw failed-redaction text.                                                                                                                                               |
| `POST /v1/admin/reports/:id/action`           | Attributed reason required; `acknowledge`, `first_action`, `dismiss`, `warn`, `suspend`, `restore`. First action can leave an investigation open. Closing never unsuppresses.                                                               |
| `POST /v1/connections/gmail/reconnect-prompt` | Authenticated visible-screen exposure; `{source: 'connections' \| 'catch', expiredAt}`; one event per actual expiry episode, no generic retention substitution.                                                                             |
| `GET /v1/admin/metrics`                       | Staff-only, adds separate Google expiry/exposure/start/success counts and safety outbox/overdue acknowledgement counts.                                                                                                                     |

See [moderation response](MODERATION_RUNBOOK.md) and [verification evidence](PUBLIC_ALPHA_VERIFICATION.md). Provider acceptance is not actual device/email delivery. Live safety invalidation is process-local; use one API instance for this alpha.

## Route groups

- Auth: OTP request/verify, refresh, `.edu` request/verify, and phone request/verify. Phone OTP is disabled unless a real delivery adapter is configured; log delivery cannot run in production.
- Identity: current user read/update/delete/export, agent create/read/update/interview/import, and memory read/correct/delete.
- Discovery: intents, daily brief, introductions, safe transcript, immutable decisions, outcomes, and authenticated WebSocket stream.
- Exchange: item CRUD, generated proposals, and mutual proposal decisions.
- Work: inbox approve/decline, screening rules, watchers and hits, runs, skills/share/adopt, groups/join/shelf, and Ask interpretation.
- Safety: blocks, mutes, reports, safety-plan share/check-in, and activity.
- Admin: moderation queue/actions, cost report, and product/worker metrics.
- Google: combined Gmail/Calendar read-only consent, OAuth callback, connection status, disconnect, and sync with persistent progress. The callback is public but requires a valid, single-use OAuth state.
- Life: Catch read, dismiss, snooze, copy receipt, and source-grounded Ask. `POST /v1/life/catch/:id/copied` records that a draft was copied; it does not send email.
- Public pages: `/privacy`, `/terms`, `/support`, `/health`, and `/ready`.

Shared request and response schemas live in `packages/shared/src/schemas.ts`. The Fastify routes deliberately parse again at the boundary even when a typed client is used, because mobile types are not an authorization mechanism.

## Development authentication

With `NODE_ENV=development` or `test`, `OTP_DELIVERY_MODE=log`, and the explicit `ALLOW_DEVELOPMENT_OTP_DISPLAY=true` flag, `POST /v1/auth/otp/request` may return `developmentCode` to a development client. The shipped mobile UI never displays or autofills that field. The flag defaults to false; production refuses both the flag and log delivery. Without configured delivery and without that explicit development flag, sign-in fails honestly.

There is no stable seed OTP. Migration `202610090013_remove_legacy_seed_otp` removes the old seeded challenge. Seeding requires the explicit development-only `ALLOW_DEVELOPMENT_SEED=true` and refuses production. A running API does not seed accounts.

OTP requests enforce email/IP limits and a 30-second resend cooldown. Verification atomically consumes the code, limits incorrect attempts, and checks the adult age gate. New-account admission enforces a per-IP daily cap and a deployment-wide hard ceiling of 100 non-deleted accounts (including staff and suspended accounts); configuration may lower but never raise it. Production client-IP limits also depend on the verified trusted-ingress configuration described in `docs/LAUNCH_CHECKLIST.md`.

Every request gets a server-generated UUID, returned as `x-request-id`. Logs use route templates, not raw URLs or OAuth callback query strings. Model calls reserve their estimated cost under a database lock before primary, retry, or fallback execution. An ambiguous failure retains its reservation until the UTC day rolls over; reservations are allowances, not proof of billing.

## Realtime

Connect to `/v1/stream?access_token=<token>` or pass the bearer header. Events are advisory invalidations; the client should refetch the authoritative resource after an introduction decision or run update.
