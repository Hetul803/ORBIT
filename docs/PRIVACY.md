# ORBIT Privacy Policy

Effective: October 13, 2026

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

For Gmail, ORBIT reads message ID, thread ID, sender, recipients, subject, date, labels, a source link, and message text. Message text is held in memory only long enough to derive bounded signals such as whether a reply may be needed, a stated commitment, a date mention, or a renewal mention. **ORBIT does not retain Gmail message bodies.** Stored Gmail records contain metadata, the bounded derived signals, and a link that opens the original message in Gmail. Optional original-email drafting requires separate in-product consent as described below; drafts are never sent by ORBIT.

For the primary Google Calendar, ORBIT reads and stores event ID, title, start/end time, status, source link, and event description for the next 14 days. This is used to produce source-backed Catch items and open the original event. ORBIT cannot add, edit, or delete calendar events.

Google refresh tokens are encrypted at rest. Disconnecting Google revokes access when Google is reachable and erases ORBIT's stored token. In Google's testing mode, access can expire and require reconnection.

ORBIT's use and transfer of information received from Google APIs is limited to providing or improving the user-facing features described here and follows the Google API Services User Data Policy, including its Limited Use requirements.

## Separate connected accounts

Google and Microsoft connections are optional and separately authorized. Each imported email or calendar event retains its provider and connected-account identity. ORBIT can show an all-accounts view or one-account view without copying messages or events between providers. Disconnecting an account erases ORBIT's token and stops showing its linked sources and follow-ups. Other accounts remain connected. For Microsoft, revoke the underlying app grant separately in Microsoft's account controls; local disconnect is not tenant-wide sign-out.

## Microsoft mail and calendar

ORBIT requests delegated User.Read, Mail.Read, Calendars.Read and offline_access only. These identify the consenting mailbox, read that mailbox's email/calendar and refresh already-authorized access. ORBIT does not request mail sending, calendar writing, shared mailboxes or tenant-wide application access. A Microsoft organization can restrict consent; ORBIT does not bypass that policy.

Imports are bounded snapshots: up to 2,500 examined emails from the last 90 days per account and up to 250 events from the default calendar over the next 14 days. Microsoft email bodies are processed transiently for small follow-up/category signals, not retained as full bodies. Stored records include headers, account identity, source links and derived signals. Microsoft event descriptions are not retained. Google Calendar behavior remains as disclosed in the existing policy, including stored event descriptions. Categories are clues, not a guarantee that every important item was found.

## Optional account-aware model use

After a separate in-app review, account-aware chat sends a small selected set of synced email headers/follow-up labels and calendar titles/times, including account provenance, to ORBIT's reasoning provider. It does not send full email bodies for chat. Recent consented conversation turns, reviewed voice examples and saved memories may accompany the request. This is a partial snapshot, not unrestricted live mailbox access.

When the owner explicitly chooses **Allow email context and prepare draft**, ORBIT fetches only the selected account's original supported text email, sends at most 8,000 characters plus the reviewed writing style and account identity to the reasoning provider, and saves the resulting draft for owner review. The original body is not persisted by ORBIT. Drafts may themselves contain information from the email and are retained until affected data is deleted. ORBIT never sends these emails or changes calendar events. Copying a draft is not sending; marking it reviewed only saves a review receipt.

Connected-model use is **default off outside synthetic tests** through `ACCOUNT_MODEL_CONTEXT_ENABLED=false`. The operator must review the published disclosures and OpenRouter input/output logging, product-data opt-ins and relevant provider processing terms before enabling it. Requests enforce no-provider-data-collection and ZDR routing and do not fall back to unsupported providers. Those request controls are not proof of account-level logging settings or independent legal compliance. OpenRouter's documented anonymous categorization and its metadata processing must also be reviewed, rather than promising that no processing occurs anywhere.

## Local calendar reminders

Optional device reminders use the latest synced calendar snapshot, with OS notification permission and a separate in-app opt-in. Up to 20 timed events are scheduled 10 minutes beforehand; all-day and legacy events with unknown timing are excluded. Notifications use generic wording without event titles on the lock screen. Opening ORBIT after calendar changes refreshes the schedule. Account disconnection clears only that account's ORBIT reminders; logout clears ORBIT calendar reminders. Device delivery is subject to OS settings and has not yet been physically verified for this release.

## No automatic access to private phone messaging

ORBIT does not read iPhone Messages or a WhatsApp inbox automatically. Voice learning uses messages the owner explicitly selects or imports, reviews and confirms as their own. Reading connected mail does not automatically add other people's private messages to a shared persona, matching profile or model-training corpus. The agent remains an assistant with limited supplied context, not the person or AGI.

## Model processing

ORBIT sends only the prompt context needed for a requested agent task to the configured model provider. The service records task, provider, model, token count, cost, timing, status, and request ID. It does not intentionally place credentials, email addresses, Gmail bodies, or private prompt text in application logs.

**ORBIT does not use private user data to train a shared model.** ORBIT does not sell personal data or use it for advertising. A configured model provider processes prompts under its own terms and data-handling commitments; the beta operator must select provider settings suitable for private data before deployment.

## Introductions and other people

Agent-to-agent conversations use bounded profile facts and apply a privacy redaction gate. Contact fields remain private until both people separately choose to reveal. Either person can decline, block, or report. Reporting an attached conversation suppresses it for both participants before review and revokes its meeting-plan links. Authorized staff can inspect privacy-cleared text and report details; staff views/actions are audited. Resend receives operator addresses and a generic report reference; Expo receives operator device tokens and a generic alert, not participant identities or report text. Provider acceptance is not proof of inbox/device delivery or human acknowledgement.

Blocks stop contact in both directions for the two accounts, with no expiry or user-facing unblock option. They cannot erase copied details or delivered notifications, prevent a different identity, or survive erasure as an unlimited cross-identity ban. Safety/audit records may be retained where necessary; actual retention and legal requirements need operator review.

## Verified waitlist and reconnection measurement

A verified-email user may explicitly join the waitlist when admission is full or paused. It stores the verified email and join time, creates no account/reservation, promises no invitation date and sends no automatic marketing or invitation. Remove an entry using its current verified session, or reverify the email and remove it. Account deletion does not automatically remove a separately opted-in waitlist entry.

Google token expiry, a foreground reconnect prompt shown, reconnect start and reconnection success are distinct product events, not substitutes for ordinary retention.

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

Use [ORBIT private support](https://orbitapp.world/support/) or email `patelhetul803@gmail.com` for account and privacy matters. The founder supplied this contact; inbox receipt and moderation response staffing remain unverified, so public enrollment stays closed. Signed-in users can report through the Safety center. Never put account, report, sign-in code or Gmail data in public GitHub issues. These policy documents describe implemented behavior; independent legal review remains outstanding.
