# ORBIT public-alpha moderation response runbook

Effective operational draft: October 11, 2026. Applies to the adults-only, at-most-100-account alpha, including strangers. **This is a required coverage commitment, not evidence that someone has accepted or staffed it. Public admission remains closed until the founder confirms coverage and both alert channels pass real-device tests.** ORBIT is not an emergency-response service.

## Commitment required before opening

The on-call operator must:

- Acknowledge every report within **15 minutes of its server creation timestamp**.
- Take and record a first protective/review action within **60 minutes of creation**. This is not a promise that an investigation is finished in an hour. If investigation continues, record the first action and explanation and preserve the suppression; do not close a case merely to remove an overdue indicator.
- Provide continuous primary coverage while a stranger cohort can use the service, with a named backup and an explicit handoff. Pausing new admission does not remove the responsibility for existing users' reports.
- Treat credible imminent harm as immediate priority, not something that waits until minute 15. Direct users to local emergency services for immediate danger; do not claim ORBIT can dispatch help.

Fill these in privately, outside Git:

| Required private operational record                     | Current status                                  |
| ------------------------------------------------------- | ----------------------------------------------- |
| Primary operator, on-call schedule and timezone         | Not supplied                                    |
| Backup operator and escalation contact                  | Not supplied                                    |
| Monitored private report email(s)                       | Not supplied                                    |
| Active ADMIN/MODERATOR accounts and native push devices | Not proven                                      |
| Private support mailbox for account matters             | Founder supplied; monitoring/receipt unverified |
| Founder acceptance of 15/60-minute coverage             | Not confirmed                                   |

Do not substitute a public GitHub issue tracker for safety reports or account support. Do not put email addresses, report text, device tokens or user identifiers in public launch evidence.

## What the service does immediately

`POST /v1/reports` validates that the reporter and reported subject actually belong to any attached conversation. A transaction takes the pair lock, records/deduplicates the open report, suppresses the conversation, revokes associated public meeting-plan links, cancels queued introduction notifications, creates two durable alert rows per configured operator, and appends the safety receipt. Suppression commits **before** external notification requests.

Both users then fail authoritative introduction, transcript, reveal and other protected reads. Connected clients receive a generic `safety.suppressed` event and clear social query/cache data. Previously delivered bytes, screenshots, copied contact details and notifications cannot be recalled. The API, not the client cache, is the authority. Keep one API instance for this alpha: the current live-notification hub is process-local, not a cross-instance Redis pub/sub bus.

The API immediately attempts:

1. **Email through Resend** to every configured operator. The generic message contains a report reference, review instructions and deadlines, not participant identities or report/conversation text. A stable idempotency key prevents ordinary repeated email submissions from duplicating the message.
2. **High-priority native push through Expo** to the configured operator's active iOS/Android devices. It links to staff-only Admin. Operational safety push is not disabled by a consumer `safety: false` preference.

The worker polls the outbox every five seconds. Failed/unconfigured channels retry with a bounded backoff, up to 60 seconds between attempts, with stale sending leases reclaimed after 60 seconds. There is no final “give up and discard report” state. Claims prevent normal concurrent workers sending the same pending row at once; network/lease recovery can still duplicate a push.

`SENT` means the notification provider accepted the request. It does **not** prove inbox arrival, APNs/FCM device receipt, push display, reading, or human acknowledgement. Operator push receipt polling and human paging escalation are not implemented. Real inbox/device drills remain mandatory. Poll Admin even if no push arrived; the queue is the source of truth.

## Before admitting the first stranger

1. Verify Resend's sender domain and mailbox receipt. Configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in **both API and worker**.
2. Put comma-separated private operator emails in API `MODERATION_OPERATOR_EMAILS`. Each must belong to an ACTIVE ADMIN/MODERATOR account, not an ordinary user.
3. Register an actual signed-build device for every operator and verify push permission, APNs/FCM/EAS configuration and tapping the alert into Admin. Set server-only `EXPO_ACCESS_TOKEN` in API and worker if Expo enhanced push security requires it.
4. Set API `SUPPORT_EMAIL` and the same monitored public contact in the landing release configuration. Confirm the mailbox works. Support and operator addresses can differ.
5. Conduct the drill below. Confirm primary/backup coverage privately. Only then set `MODERATION_COVERAGE_CONFIRMED=true` and `PUBLIC_ALPHA_SIGNUPS_OPEN=true`. Keep `DEPLOYMENT_ACCOUNT_CAP=100` or a smaller cohort limit; values above 100 are rejected.
6. Check `/v1/alpha/status` reports accepting new accounts. A false result is not a reason to bypass the gate.

Production boot rejects absent operator/private support addresses and requires a real email adapter. New-account admission additionally requires confirmed/open flags, registered native operator devices, no unsent alert older than one minute, and no open report overdue for the response windows. Existing users can still sign in, and reporting remains available when admission is paused. A device row is only configuration evidence; it does not prove physical delivery.

## Handle a report

1. Open **ORBIT → Admin**, not an alert-provider dashboard containing user data. The queue refreshes every five seconds. Review oldest first unless a credible urgent threat takes priority.
2. Select **Review redacted conversation**. This is staff-only and audit-logged; only privacy-cleared message text is exposed. Never request a raw failed-redaction transcript as a workaround. The queue's report detail is itself sensitive even when the transcript is cleared.
3. Read the subject, category, report, deadlines and each channel's state. Missing/RETRY alerts are delivery faults. `SENT` is not acknowledgement.
4. Write an attributed reason and choose **Acknowledge**. This sets `acknowledgedAt` and status REVIEWING; it does not close the case or restore contact.
5. Record an evidence-based first action by minute 60. **Record first action** records an attributed step and timestamp while leaving an investigation REVIEWING; it does not require premature closure. **Suspend** when protective account restriction is warranted; **Dismiss** only after review supports it; **Warn** records a warning decision. The Warn action does not automatically contact the subject—any appropriate private communication needs the operator's own staffed support process. Confirmation is required for closing actions in the UI.
6. Use **Restore** only for an independently justified account restoration. It never removes a permanent pair block or reopens the reported conversation.
7. Log facts and reasons, not model speculation. Do not put tokens, private message text or email addresses in operational/Sentry logs. Keep external incident notes access-restricted.

Suspension revokes refresh tokens, rejects an existing access token on the next authenticated request by checking current database status, and closes local live sockets. An old JWT role cannot silently retain staff access. Account restoration does not reverse suppression.

Closing a report sets the resolved timestamp and an attributed activity event. **Closing is not unsuppressing.** No current moderator action clears `suppressedAt`, and no user unblock route exists.

## When a deadline or alert channel fails

- Set `PUBLIC_ALPHA_SIGNUPS_OPEN=false` immediately and ensure `/v1/alpha/status` shows paused admission. The server also fails closed automatically for the documented overdue/outbox conditions, but do not rely on that as the only operational response.
- Activate the backup directly using the private on-call record. This code does not automatically page a human backup; that process must actually exist.
- Poll the authenticated queue and manually handle reports. Keep suppression intact.
- Inspect only generic channel error codes and attempt timestamps. Restore provider availability/device registration; never expose report contents to debug delivery.
- If coverage cannot be restored, stop active introductions/the matching worker and consider suspending access rather than leaving an unstaffed public cohort. This is an operator decision, not an implemented automatic whole-service shutdown.
- Record the missed commitment and recovery timeline. Reopen admission only after the backlog, delivery drill and staffing are healthy, not after deleting evidence or changing report timestamps.

## Permanent block semantics

Blocking is immediate after the committed transaction, **bidirectional**, and has **no expiry or user-facing unblock option** for those accounts. Pair locks prevent a concurrent reveal or new matching/proposal transaction from bypassing the block. Server reads also filter stale introductions, inbox peer items, exchange proposals and Today brief entries. The database refuses soft-unblocking (`deletedAt` cannot become non-null). Migration 14 restores historical soft-deleted blocks to permanent enforcement; migration 15 revokes old share links for already suppressed conversations.

This is not identity verification: a new account, external messages, copied details or records already exported cannot be erased by a block. Physical account erasure can remove associated records under the deletion policy. Never promise a lifetime ban across every future identity.

## Mandatory real-provider drill and evidence

Use two ordinary adult accounts plus a real operator; avoid private Gmail in screenshots:

1. Create a safe visible introduction and a meeting-plan link. Submit a report while the operator watches Admin.
2. Confirm both ordinary accounts immediately get no list/transcript/reveal access, the meeting-plan link gives 404, and the queued introduction push is cancelled.
3. Record report creation, actual email inbox arrival, actual native push arrival and alert tap. Compare elapsed times. Obscure identities/tokens/codes.
4. Acknowledge from Admin within 15 minutes; take an attributed first action within 60. Confirm staff read/action receipts.
5. Simulate a provider failure in a dedicated staging environment, confirm durable retry and paused new admission after one minute, restore it, and observe actual delivery. Never revoke a production key to conduct a test without an incident plan.
6. Suspend the subject while signed in on another device. Confirm existing JWT requests and live sockets lose access. Restore only if the test warrants it; blocked/suppressed content must remain inaccessible.
7. Independently test a permanent block from either side, including a stale browser tab, a cached Today, transcript URL, queued notification, new exchange share and both account directions.
8. Verify honest full-capacity/waitlist behavior in an isolated staging database; never fill or wipe a real user database for proof.

Local mocked-provider/database tests cover the server and UI logic. They are not this drill. **This drill has not been completed against a deployed backend and signed phones.**
