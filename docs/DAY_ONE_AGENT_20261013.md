# ORBIT — day-one agent and separate-account sprint

Evidence checkpoint: October 13, 2026, America/Chicago. This report distinguishes local implementation, automated verification, provider configuration and actual production/device acceptance. It supplements the [original build audit](BUILD_AND_LAUNCH_AUDIT.md), [full build inventory](STATE_OF_BUILD.md), [founder feedback inventory](FOUNDER_FEEDBACK_20261012.md) and [previous approved release](GMAIL_SYNC_CHAT_20261012.md); it does not retroactively claim every original requirement is complete.

## Outcome and deployment truth

Microsoft registration, its four approved delegated scopes and a privately stored 180-day server credential are configured. The app now has locally implemented, tested multi-account Google/Microsoft isolation, a single agent conversation, an action-focused inbox, account-labelled calendar views and optional local reminders. The local app runs at **http://localhost:8081**, backed by the existing local database on port 4100. A separate **fictional-data** preview runs at **http://localhost:8090**, API port 4150, with real Google/Microsoft integrations disabled and a stub model that is explicitly rejected for real agent replies/drafts. Preview fixtures are not proof of provider connectivity or model quality.

**The new sprint is not deployed to Railway or the installed iPhone.** Production still uses approved application commit `74cea03407ab18380f162d14ee464ca9b31d027a`, migration 17 and the previously delivered iOS update group `9b4778f6-536d-42db-aef2-d25cec18ac6c`, runtime 0.1.0. No Microsoft credential was copied into Railway, EAS, the mobile bundle or root `.env`. No public store submission, public admission, paid Azure resource, plan upgrade or model-cap increase occurred.

The founder physically confirmed that the previous update syncs while navigating away and has separate chat bubbles. This is important acceptance evidence. Completion of his actual approximately 2,000-email import, this sprint's native UI, real Outlook OAuth/sync, multiple live mailboxes and physical reminder delivery remain unconfirmed.

## What “separate accounts, one agent” means

| Layer               | Implemented boundary                                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connection identity | Every connection has an owner, provider, immutable account key and identified email. Up to five Google plus five Microsoft accounts per owner. Reconnecting a known account cannot reassign it to a different mailbox.                                                          |
| Credentials         | Server-only encrypted tokens carry owner/provider/account-key bindings. Microsoft rejects swapped envelopes before networking. Legacy Google credentials validate mailbox identity before further reads; unidentified legacy accounts with existing linked sources fail closed. |
| Source storage      | New imported records attach to the exact connection. Secondary Google and all Microsoft external IDs are namespaced. Thread grouping includes provider/source kind and connection, so identical message/thread IDs do not merge mailboxes.                                      |
| Database            | Migration 19 rejects mismatched source owners/providers, source identity moves and connection identity changes. Deleting a connection cascades its bound source records; deleting an owner remains supported.                                                                   |
| API visibility      | Mail/calendar filters validate that the requested account belongs to the signed-in user. Protected queries require matching active ownership/provider; tokens and full email bodies are not returned in lists.                                                                  |
| UI                  | Provider badge, email and a short connection suffix distinguish accounts, including identical email addresses from different providers or identities. All-accounts views retain those labels.                                                                                   |
| Agent               | With separate consent and the operator gate enabled, selected summaries from both providers retain their provenance. They are combined as context, not as a merged mailbox. The shared, owner-reviewed voice profile is not silently learned from third-party email text.       |
| Disconnect          | Only the selected account's token, sync job, linked sources, mail approvals and affected Catch context are removed from active use. Account-specific chat pairs and local reminder plans are cleared; unrelated providers/accounts survive.                                     |

Legacy unbound Google sources remain readable for backwards-compatible fixtures/data, labelled with unavailable account identity rather than a guessed mailbox. An unbound email cannot be drafted when more than one Google account is active. New sync paths always bind real imported sources. These compatibility cases are not presented as fully identified accounts.

## Screen and control inventory

### Today

The named personal-agent card offers **Talk to your agent**, **Teach my voice** and **Find my people**. **Open inbox** goes to the action-focused inbox. **Gmail & Calendar** and **Outlook & Calendar** offer providers that are not currently connected; the corresponding offer disappears once connected. Additional accounts are added in Connected accounts, not by repeatedly showing the home offer. Unavailable providers have honest preparation/verification wording.

During Google or Microsoft imports, a fixed-height progress card displays provider/account and examined counts. It does not trigger the list's pull-refresh spinner. Content invalidations are coalesced, and the daily brief refreshes at completion rather than on every progress event. **Pull to refresh** remains an explicit user action. The account-created task noise is filtered only for task-type brief items; legitimate email/inbox items containing that phrase remain visible.

**Up next** shows up to three source-labelled events. **See my calendar** opens the agenda. Catch opens evidence-backed follow-ups. Existing daily-brief metrics and **Add watcher** remain. This is a practical first-day surface, not a promise that it has understood an entire person's life.

### Ask — one conversation

The header uses the agent's name, not separate “My agent” and “Mail & Calendar” mode tabs. User and assistant messages have separate bubbles and a compact bottom composer. Prompt suggestions populate the composer. **Send to my agent** is disabled for too-short input, missing context consent or an in-flight reply. A pending bubble appears immediately; failed input is preserved. Conversation/composer state survives screen remounts, but remains bounded, in-memory and owner-scoped rather than a server-persisted ChatGPT-style archive.

**Allow reviewed context for this chat** covers saved memories, reviewed voice and recent chat. The separate **Include synced mail and calendar summaries** choice is available only when the API reports that connected-model processing is ready. **Clear this chat** clears history and consent. **Your inbox** and **Teach my voice** are shortcuts. Source links identify provider/account and open originals. An affected account's question/answer pair is removed on disconnect; late replies are invalidated. The server drops history tagged with disconnected account IDs and rejects an answer if its source context changes while the model is answering.

Chat uses up to 40 current memories, reviewed voice, at most eight recent turns, up to ten email summaries and six upcoming events, and a 650-token output ceiling. It does not send full email bodies for chat. It has no sending, calendar-writing or external-action tools. Natural conversation and useful planning depend on model quality and supplied context; there is no basis for calling it AGI or the user themselves.

### Inbox / Mail

**All accounts** and individual labelled account chips change the protected source view. Action chips are **Needs reply**, **Reply ready**, **Receipts & purchases**, **Subscriptions**, **All**, **Important** and **Spam**. Counts refer to the bounded synced snapshot, not the provider's entire live inbox.

Needs reply uses the latest account-scoped thread, inbound direction, derived reply clues and automated/security/spam exclusions. Reply ready requires an actually stored nonempty draft, not a claimed future capability. Receipt/subscription groups use headers and bounded derived signals. They are heuristics and can miss or misclassify items; users must not assume an empty group proves no action is needed. Google labels and Microsoft importance/folder identity provide provider categories without changing original labels/folders.

Each card shows provenance, title, sender, date and **Open original email**. When enabled, **Draft a reply** opens a specific disclosure; **Allow email context and prepare draft** fetches only that account's selected original supported text email, forwards at most 8,000 characters plus reviewed voice to the reasoning provider, and persists the resulting review-only draft. Security-code/spam messages are refused. Unsupported text and model errors surface honestly. **Not now** cancels preparation. Existing drafts can be edited, copied and marked reviewed; **Mark draft reviewed** saves the edited wording and immutable review receipt. It does not send. Concurrent review requests cannot overwrite the first committed receipt, and subsequent preparation returns the stored/reviewed draft rather than spending again.

Non-mail approval flows remain in Inbox below the mail panel. Gmail/Outlook mail items are not duplicated in the miscellaneous approval list. **Manage connected accounts** opens settings for providers. No actual outbound email adapter/scope is enabled.

### Calendar and reminders

The agenda offers all-account or individual-account filtering, provider/email labels, local display times and original event links. The displayed window is the next 14 days from synced default calendars, with up to 250 records in the view. It is not all historical events or all secondary/shared calendars. Matching invitation UID/time duplicates can remain visible as separate account sources without inventing a calendar conflict.

**Enable calendar reminders** requires an installed native app, explicit opt-in and OS permission. It schedules at most 20 known timed events, ten minutes before start. Unknown legacy timing, all-day events, expired reminder times and disconnected accounts are excluded. Event titles stay off the lock screen. Reconciliation removes obsolete plans and avoids duplicate event/time plans. Disconnection cancels only the selected account's ORBIT plans, even if an old snapshot tries to reschedule them. **Turn off calendar reminders** removes the preference/plans; logout/account deletion clears ORBIT calendar plans. Other applications' notifications are untouched.

These are device-local scheduled notifications, not newly implemented remote APNs calendar pushes. They use the latest fetched snapshot, so calendar changes require ORBIT to refresh. Notification permissions, Focus modes and OS delivery can affect delivery. Physical iPhone timing/revocation tests are still required. Display filters do not limit reminder coverage across connected accounts.

### Connected accounts

Google and Microsoft have separate sections. Each account has its own identity, sync state, last-update information and controls: **Sync this account**, **Reconnect this account**, **Disconnect this account**, **Confirm disconnect this account**, **Keep this account**. Provider-specific add/connect controls are unavailable until actual provider configuration and tester eligibility are ready. OAuth completion refreshes server status; a returned deep link does not falsely claim that an import is finished.

Local disconnect is atomic before Google revoke is attempted. Microsoft local disconnect does not call tenant-wide sign-out or revoke all sessions; the underlying Microsoft app grant can be removed separately through Microsoft's account controls. These controls never delete original messages or events in Google/Microsoft.

## API inventory for this sprint

All owner routes require ORBIT authentication; the provider callbacks use bounded, single-use OAuth state rather than a user access token.

| API                                                | Behavior                                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /v1/connections`                              | Owned connection metadata, provider/account identity; no tokens.                                                                                             |
| `GET /v1/connections/gmail/status`                 | Specific/all Google account status, progress, expiry and Testing eligibility.                                                                                |
| `POST /v1/connections/gmail/start`                 | Reconnect target or add-account consent; identity-safe target and read-only scopes.                                                                          |
| `GET /v1/connections/gmail/callback`               | Consumes state once, validates exactly approved read scopes, binds identified mailbox and queues durable sync before phone redirect.                         |
| `POST /v1/connections/gmail/sync`                  | Eligibility checked first; optional owned account ID or all active Google accounts, HTTP 202, resumable server job.                                          |
| `DELETE /v1/connections/gmail?connectionId=…`      | Atomic local removal of only that account, then bounded upstream revoke attempt.                                                                             |
| Google reconnect-prompt route                      | Existing distinct prompt-shown event remains separate from token-expiry/start/success measurement. Adding an account is not falsely counted as reconnecting. |
| `GET /v1/connections/outlook/status`               | Microsoft-only owned status; accurate configuration/eligibility state.                                                                                       |
| `POST /v1/connections/outlook/start`               | Delegated read-only consent, encrypted PKCE verifier and ten-minute state; never tenant admin consent.                                                       |
| `GET /v1/connections/outlook/callback`             | Provider-specific state, code exchange, exact scope/profile checks, account-bound tokens, five-account cap, initial sync queue.                              |
| `POST /v1/connections/outlook/sync`                | Required exact owned Microsoft account ID; immediate HTTP 202 background response.                                                                           |
| `DELETE /v1/connections/outlook?connectionId=…`    | Only the named owned Microsoft account; no global session revocation or original-mail deletion.                                                              |
| `GET /v1/mail?connectionId=…&action=…&category=…`  | Owned active sources, bounded counts and newest 100 matching cards with provenance, draft/review IDs and `draftingAvailable`.                                |
| `POST /v1/mail/:sourceId/draft`                    | Separate consent and operator gate; one exact account/source, transient text read, private model routing, guarded draft persistence, never sends.            |
| `POST /v1/inbox/:id/approve`                       | Owner-only review receipt, safety/source recheck and compare-and-set protection; `sent:false`.                                                               |
| `GET /v1/agenda?connectionId=…`                    | Owned active Google/Microsoft calendar snapshots with identity and reminder eligibility.                                                                     |
| `GET /v1/agent`                                    | Existing persona plus `connectedContextAvailable`, so the client does not offer a gated feature as ready.                                                    |
| `POST /v1/agent/chat`                              | Profile/voice consent, optional separate connected-summary consent and operator gate, bounded history, labelled source context and model-budget checks.      |
| `google.sync_progress` / `microsoft.sync_progress` | Empty advisory realtime events; private content is fetched only through protected APIs.                                                                      |

## Durable Microsoft import

The runner lives inside the **existing API service**, not a new paid Azure resource or a new worker service. It leases one account job at a time, reads at most 20 message IDs per batch, and commits/checkpoints each message. It survives screen departure and process/service restart. Concurrent runners cannot own the same lease. Rate-limit/server failures back off from the last committed message; terminal errors retain bounded progress for retry. Disconnect/ownership checks prevent in-flight writes from restoring revoked context.

Graph requests are restricted to HTTPS `graph.microsoft.com/v1.0/me` resources, including pagination; redirects, other users and malicious next links are refused before token transmission. Immutable Outlook IDs are requested. Import is bounded to 90 days/2,500 examined messages, 130 pages, the default calendar's 250-event snapshot and no model calls. Full email bodies are never persisted; small derived signals can include short commitments/date/renewal clues. HTML-only unsupported text fails closed rather than pretending it understood the message.

The Microsoft application supports personal and organizational accounts in registration, but unverified-publisher and tenant consent policies can prevent organizational use. No publisher verification or tenant security weakening occurred. A configured callback/secret is not a passed live consent test. The selected client-secret expiry is 180 days; rotation and actual expiry-date monitoring remain an operator responsibility.

## Privacy and release gates

`ACCOUNT_MODEL_CONTEXT_ENABLED` defaults **false** outside synthetic tests. Connected-summary chat, metadata-to-model Catch drafting and original-email drafting cannot call the model until the operator deliberately enables it. Basic saved-profile chat and source lists are separate. The app shows capabilities honestly.

When enabled, private connected requests enforce OpenRouter `data_collection:deny` and `zdr:true`, with no unsupported-provider fallback. API routes reject stub outputs as real replies/drafts. This does not independently prove OpenRouter's account-level logging/product-data settings, suitable processing terms, or Google Restricted-Scope compliance. [OpenRouter documents separate account opt-ins and anonymous categorization](https://openrouter.ai/docs/guides/privacy/data-collection); these must be reviewed for the actual account. [Google requires accurate published/in-product disclosures before changed data use](https://developers.google.com/terms/api-services-user-data-policy).

The [proposed privacy changes](PRIVACY_NEXT_RELEASE_20261013.md) disclose account-aware model processing, original-body drafting, retained draft contents, Microsoft processing and local reminders. They are **not published or legally approved**. Publish/review the matching policy and verify provider controls before enabling connected-model processing. No private mail was sent to a reasoning provider by the new tests or browser preview.

## Schema and rollout readiness

Migration **18** adds connection account identity, source binding and OAuth challenge metadata, and replaces the old two-field connection uniqueness with owner/provider/account-key uniqueness. Migration **19** adds Microsoft source kinds, immutable identity/owner/provider triggers and cascaded bound-source deletion. Both applied successfully to fresh QA databases and the local primary/preview databases, after a local source-ownership audit. The local primary was not seeded, wiped or exported.

These are **not a fully backward-compatible additive rollout**: migration 18 replaces an index used by the old OAuth upsert, and migration 19 changes a foreign-key deletion behavior/adds checks. Production still has 17. Before release, snapshot/backup, pause OAuth/sync writes, migrate and deploy the matching backend together, then verify and resume. Do not run old OAuth code against the changed schema during a rolling overlap. The API/worker shared Prisma package must stay version-aligned. A reverse SQL rollback requires deliberate review; it is not implemented or automatically safe.

## Verification evidence

| Layer                      | Passing tests |
| -------------------------- | ------------: |
| Shared                     |             2 |
| LLM                        |            11 |
| Agent                      |            17 |
| Worker                     |            13 |
| API                        |            63 |
| Mobile                     |            85 |
| Root configuration/scripts |            25 |
| **Total**                  |       **216** |

Final checks: root lint and typecheck passed; the full suite passed with zero failures/skips on fresh isolated databases, serialized to avoid unrelated five-second fixture timeouts under concurrent build/database load. It includes all existing tests plus new provider/account boundary, scope/replay/PKCE, token-swap, malicious-nextLink, checkpoint/lease/retry/disconnect, cross-provider source attribution, draft-review immutability, deleted-owner cascade, privacy-gate, source-badge/filter, chat cleanup, Today stability and local-notification reconciliation tests. A simulated 2,000-message Google import recovers after failure at message 200. This is not a benchmark of real-provider latency or actual mailbox completeness.

Source credential scanning includes current ignored provider credentials and the fresh Microsoft secret; no private value is intentionally committed. Safe provider-setup screenshots omit the credential value. Browser checks use only fictional demo data, not the founder's private inbox. Hermes export/build and physical-device acceptance are distinct release steps and are not replaced by passing web tests.

## Remaining gaps and launch assessment

The startup is **not ready for an unrestricted public launch**. Remaining gates include reviewed/published privacy changes and model-provider settings, fresh closed-alpha release approval and matching backend/iOS delivery, real Microsoft consent/sync and multi-account founder tests, complete real Gmail sync, physical reminder delivery, and a new corrected embedded native binary so a fresh/offline install does not depend on an OTA startup fix.

Google remains External/Testing with the already approved test users; verified public restricted-Gmail release is still required. Microsoft publisher/organizational restrictions remain. Moderation staffing and physical operator-push/report drills are not demonstrated. Public signup remains closed with the server-side 100-account cap; no strangers were admitted. Public TestFlight/direct APK landing links and public App Store/Play release remain unavailable. Play's physical Android-device requirement still needs the founder's real device access; it cannot be satisfied with an iPhone or bypass.

ORBIT does not automatically read iPhone Messages/WhatsApp, send emails, write calendars, possess general autonomous intelligence, or represent a person's complete judgement. Reviewed voice imports/onboarding provide an initial persona, not a validated digital replacement. A single user can still benefit from the named personal-agent chat, source-backed follow-ups, read-only action inbox/calendar and reviewed voice; matching/network value depends on other users. Source-derived categories and agent decisions need further real-world precision/recall/voice-fidelity evaluation.

Existing hosting replicas/resource limits, closed signup/staffing gates, shared **50¢/day** model cap and **zero worker model allowance** remain unchanged. At the daily cap, model spend is at most $15.50 over a 31-day month; this is a shared ceiling, not a promise that 100 active users get unlimited replies. Hosting/storage/mail costs still require actual billing measurement. Ten linked accounts per owner can increase storage and sync load significantly; no 100-user multi-mailbox load test or guaranteed sub-$100 bill is claimed. Azure's $200 introductory credit is temporary and no new paid compute was deployed.
