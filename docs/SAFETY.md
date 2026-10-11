# Safety and privacy model

ORBIT treats autonomy as permissioned execution, not a blanket delegation. Reading approved memory, private analysis, proposing a match, revealing identity, sending a reply, and writing to an external service are distinct capabilities with distinct approval defaults.

## Enforced controls

- Accounts are hard-blocked below age 18 before creation, and the attempt is recorded without storing a reusable plaintext email identifier.
- Blocks are immediate after commit, bidirectional and permanent for the two accounts: no expiry or unblock route. Pair locks protect concurrent reveals/matches/proposals; stale read/export/inbox/brief paths also enforce the current database block. Copied data and new identities cannot be recalled or prevented by this mechanism.
- Agent dialogue stops on sexual, hostile, coercive, threatening, or minor-related content.
- Full names, contact details, street addresses, handles, employers, class sections, and exact schedules pass through regex and model redaction, then a second deterministic check.
- Uncertain redaction fails closed, and every read route independently requires a safe conversation.
- The independent judge receives redacted text only.
- Reveal requires two independent decisions and intersects the exact fields each person selected.
- Inbox drafts require approval before send; trust defaults are visible and editable.
- Exchange proposal cards say that ORBIT handles no money, and handoffs favor public places.
- Reports suppress the attached conversation before review and immediately attempt both operator email and native push through a durable outbox. Retry/polling does not replace human coverage. Staff review/action receipts are attributed; acknowledgement and first action have separate timestamps.
- Safety plans use unguessable share tokens and record check-ins.

## Operational response

For the stranger-inclusive alpha, follow [MODERATION_RUNBOOK.md](MODERATION_RUNBOOK.md): require staffed acknowledgement in 15 minutes and first action in 60 minutes; keep public admissions closed until delivery/staffing are proven. The server hard-caps at 100 non-deleted accounts and fails closed for operational readiness/overdue conditions. No public launch has been proved by local tests alone.

For suspected leakage, pause the worker, revoke provider keys, preserve append-only audit records, identify affected conversation IDs from model-call and activity metadata, and mark affected content unavailable. Do not query or log raw credentials. Follow the incident checklist in `docs/RUNBOOK.md`, notify affected users according to applicable law, and rotate signing/encryption secrets only through a planned re-encryption procedure.
