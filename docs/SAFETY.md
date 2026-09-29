# Safety and privacy model

ORBIT treats autonomy as permissioned execution, not a blanket delegation. Reading approved memory, private analysis, proposing a match, revealing identity, sending a reply, and writing to an external service are distinct capabilities with distinct approval defaults.

## Enforced controls

- Accounts are hard-blocked below age 18 before creation, and the attempt is recorded without storing a reusable plaintext email identifier.
- Blocks remove a pair before reranking in either direction; mutes suppress contact while preserving evidence.
- Agent dialogue stops on sexual, hostile, coercive, threatening, or minor-related content.
- Full names, contact details, street addresses, handles, employers, class sections, and exact schedules pass through regex and model redaction, then a second deterministic check.
- Uncertain redaction fails closed, and every read route independently requires a safe conversation.
- The independent judge receives redacted text only.
- Reveal requires two independent decisions and intersects the exact fields each person selected.
- Inbox drafts require approval before send; trust defaults are visible and editable.
- Exchange proposal cards say that ORBIT handles no money, and handoffs favor public places.
- Reports enter a moderator queue; moderator actions are append-only activity events.
- Safety plans use unguessable share tokens and record check-ins.

## Operational response

For suspected leakage, pause the worker, revoke provider keys, preserve append-only audit records, identify affected conversation IDs from model-call and activity metadata, and mark affected content unavailable. Do not query or log raw credentials. Follow the incident checklist in `docs/RUNBOOK.md`, notify affected users according to applicable law, and rotate signing/encryption secrets only through a planned re-encryption procedure.
