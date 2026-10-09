# ORBIT Privacy Policy

Effective: October 9, 2026

ORBIT is a private companion that helps a person remember commitments, review their own life, and discover introductions through a user-controlled agent. This policy describes the current limited beta identified by bundle/package ID `com.orbit.companion`.

## Information ORBIT processes

ORBIT processes the minimum data needed for features a person chooses to use:

- **Account and eligibility:** email address, display name, date of birth for the 18+ gate, email verification time, optional phone or campus verification, and one-way IP hashes used for signup and abuse limits.
- **Agent and profile:** interview answers, agent name and voice settings, memories, preferences, constraints, goals, active intents, skills, trust settings, and feedback.
- **Product activity:** Catch actions, watcher rules and results, approvals, introductions, reveal decisions, safety reports and blocks, activity receipts, run status, request IDs, model usage, and cost totals.
- **Device information:** push token, device platform, notification settings, and ordinary service diagnostics. ORBIT does not request precise location, contacts, photos, microphone, advertising ID, or cross-app tracking in the current build.
- **Files a person chooses:** an imported file is processed only after an explicit selection. Import metadata and extracted facts may be retained; private object storage must be configured before file upload is enabled for a shared deployment.

## Gmail and Google Calendar

Google connection is optional. ORBIT requests only these scopes in one consent flow:

- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/calendar.readonly`

For Gmail, ORBIT reads message ID, thread ID, sender, recipients, subject, date, labels, a source link, and message text. Message text is held in memory only long enough to derive bounded signals such as whether a reply may be needed, a stated commitment, a date mention, or a renewal mention. **ORBIT does not retain Gmail message bodies.** Stored Gmail records contain metadata, the bounded derived signals, and a link that opens the original message in Gmail. Draft suggestions are generated from stored metadata and are never sent by ORBIT.

For the primary Google Calendar, ORBIT reads and stores event ID, title, start/end time, status, source link, and event description for the next 14 days. This is used to produce source-backed Catch items and open the original event. ORBIT cannot add, edit, or delete calendar events.

Google refresh tokens are encrypted at rest. Disconnecting Google revokes access when Google is reachable and erases ORBIT's stored token. In Google's testing mode, access can expire and require reconnection.

ORBIT's use and transfer of information received from Google APIs is limited to providing or improving the user-facing features described here and follows the Google API Services User Data Policy, including its Limited Use requirements.

## Model processing

ORBIT sends only the prompt context needed for a requested agent task to the configured model provider. The service records task, provider, model, token count, cost, timing, status, and request ID. It does not intentionally place credentials, email addresses, Gmail bodies, or private prompt text in application logs.

**ORBIT does not use private user data to train a shared model.** ORBIT does not sell personal data or use it for advertising. A configured model provider processes prompts under its own terms and data-handling commitments; the beta operator must select provider settings suitable for private data before deployment.

## Introductions and other people

Agent-to-agent conversations use bounded profile facts and apply a privacy redaction gate. An introduction remains private until both people separately choose to reveal. Either person can decline, block, or report. Safety and audit records may be kept to enforce those choices.

## Why ORBIT uses information

ORBIT processes data to authenticate accounts; enforce age, abuse, and budget limits; remember user-directed context; produce Catch items and drafts; run opt-in matching; deliver requested notifications; prevent harm; diagnose failures; honor export and deletion requests; and meet legal obligations. ORBIT does not use third-party advertising.

## Retention, export, and deletion

Settings includes **Create signed export**, which creates a signed archive of account data. Settings also includes **Delete account**. A deletion request starts a seven-day cancellation period. The person can cancel during that period; after it ends, the deletion worker removes the account and associated personal data. A disconnected Google token is erased immediately. Limited security, fraud, safety, or legal records may be retained only where necessary to protect people, establish legal claims, or comply with law.

The public web deletion-request path still needs to be hosted before a Google Play submission. In-app deletion is implemented now.

## Security and international processing

ORBIT encrypts transport using HTTPS in a deployed environment and encrypts stored provider tokens and user-supplied model keys. Access is limited by authentication and service roles. No service can promise absolute security. Data may be processed where ORBIT's infrastructure and selected providers operate.

## Adults only

ORBIT is for people 18 and older. It is not directed to children, and an under-18 date of birth is rejected and cannot be replayed into an adult account.

## Changes

Material changes will update the effective date and be shown before they apply when required.

## Contact a human

Open a request through [ORBIT Support](https://github.com/Hetul803/ORBIT/issues). Do not include sign-in codes, private account data, or Gmail content in a public issue. A private support email and owned public domain must be added before public store submission; that unfinished item is tracked in the repository.
