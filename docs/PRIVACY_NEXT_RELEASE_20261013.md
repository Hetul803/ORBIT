# Proposed privacy disclosure changes for the account-aware release

Draft for founder review, October 13, 2026. **Not the currently published policy and not an attestation that provider review is complete.** The existing policy must be updated on `orbitapp.world/privacy/` and in the app before the new connected-model features are enabled.

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

## Review references

- [Google user-data disclosures and Limited Use](https://developers.google.com/terms/api-services-user-data-policy)
- [OpenRouter data collection and opt-ins](https://openrouter.ai/docs/guides/privacy/data-collection)
- [OpenRouter ZDR routing and limitations](https://openrouter.ai/docs/guides/features/zdr)
- [Microsoft delegated permissions](https://learn.microsoft.com/en-us/graph/permissions-reference)

Founder/operator review, publication evidence, current provider settings and independent legal review remain outstanding. This draft must not be presented as a Google or Microsoft verification approval.
