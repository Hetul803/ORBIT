# ORBIT closed-alpha release — October 13, 2026

## Release status

The founder approved publication of the reviewed privacy disclosures and deployment of application candidate `1cbcd2876f305c4866e0841ff192d528505bbb2c`, controlled migrations 18–19, private Microsoft credential transfer to the API only, and the matching iOS-only update. **Backend and iOS OTA delivery completed and verified. Physical acceptance of this new update is still pending.** This is a closed founder alpha, not a public-store release.

The deployed backend source is pinned to `2f096a6e522c08ff3647fd1c7407a008efa92376`: the approved application candidate, a documentation-only checkpoint, and the separately approved privacy text plus legal-page regression assertions. No further runtime feature or mobile source change was added. The frozen phone artifact remains from `1cbcd28`.

## Published policy

The matching disclosures are live at [ORBIT privacy](https://orbitapp.world/privacy/), effective October 13. Existing home, support, terms and unavailable download states remain unchanged. Sites version 5 uses source `f7fd46cf763091fcc1b3af9ae9c043922fbc412b`; deployment `appgdep_6ace13bf5a5081918ba47eb28720880d` returned succeeded. The own-domain page was independently inspected in the browser and showed separate accounts, Microsoft scopes, selected-summary processing, explicitly approved original-email drafting, draft retention, local reminders and no automatic phone-message access. The Sites skill preserved the existing site's public audience and packaged/pushed the exact source before publication.

The in-app Privacy link points to the API's `/privacy`; its matching policy is included in backend `2f096a6`. Publishing disclosures does not enable connected-model processing or constitute Google/Microsoft verification or independent legal approval.

## Backup and maintenance

Railway's managed backup UI requires Pro. No plan upgrade was performed. Two custom-format `pg_dump` archives were created inside the existing private Postgres volume under `/var/lib/postgresql/orbit-approved-backups/`, mode 0600. The directory remains private; no database dump was downloaded, exposed through a public proxy or sent to another provider.

The first snapshot, `orbit-before-migrations18-19-20261013.dump`, is 586,909 bytes, SHA-256 `9d066f3723c504d5bf1658a280bf8a6f3221b32cf57aaddb9e4e0134092c25e4`. Its table of contents decoded successfully. Migration metadata showed 17 completed and zero unfinished migrations.

The old API deployment `99707621-4426-40e1-9f53-426ebfb23ed1` and worker `6230a316-0018-42c1-8387-19d79fd2883e` were stopped through Railway's deployment Remove action. This stopped their compute, not their services, source, account data or volumes. The environment snapshot confirmed both offline with no active deployments while Postgres/Redis remained online. Existing deployment history remains recoverable through a deliberate redeploy; running the old code after schema changes is not an automatic safe rollback.

The final quiesced snapshot, `orbit-quiesced-migrations18-19-20261013.dump`, is 586,909 bytes, SHA-256 `7e67c9cec9d05772281819943807ead725570bfe788a2dc68d3250001df4847a`. `pg_restore --file=/dev/null` decoded the complete archive successfully without importing or printing its contents. This is logical-backup verification, **not** a restore drill. Both backups share the database volume's failure domain and are not disaster-recovery copies or point-in-time recovery. No backup was deleted.

Both API and worker now run the idempotent `pnpm --filter @orbit/db migrate:deploy` check before startup, with a 300-second limit. Prisma coordinates migration execution; this prevents the new worker starting against the old schema. Old OAuth/sync writers were absent before the migration window. A reverse-schema or backup restore would need separate careful review; no restore, wipe or seed was performed in production.

The Railway connector again returned cancelled. The previously authorized dashboard route applied only the reviewed API/worker patch. No Postgres/Redis source/configuration, network exposure, replica, resource limit or plan change was staged. New deployments: API `19b4df8e-d729-49de-a25d-28d603cd6e8b`; worker `758fca8a-ab5e-4c4d-80df-77682cf489b4`.

## Microsoft and privacy boundaries

The approved 180-day credential was entered privately into only `orbit-api` as `MICROSOFT_OAUTH_CLIENT_SECRET`. It was not printed, committed, put in root `.env`, transferred to the worker/EAS, or bundled in the mobile app. The API has the dedicated client ID `031b94f2-9898-4e16-a444-6608c765015d` and its sole approved callback. Microsoft Testing is allowlisted to the two previously approved ORBIT login emails, not to arbitrary public signups. Each Microsoft mailbox still requires its owner's separate consent. No live Microsoft token or inbox has been obtained by this release operation.

Only delegated User.Read, Mail.Read, Calendars.Read and offline_access were registered. No sending, writing, application/shared-mailbox permissions, admin consent or tenant policy bypass. Google settings remain read-only External/Testing; the two providers retain separate token/account/source identities. Five accounts per provider are supported, not a merged mailbox.

`ACCOUNT_MODEL_CONTEXT_ENABLED=false` is explicit on API/worker. Selected connected summaries and original-email model drafts stay unavailable until actual OpenRouter logging/product opt-ins and provider terms are reviewed and enablement is deliberately authorized. Normal consented saved-profile chat is separate. Request-level ZDR/data-collection-deny controls are not a substitute for this review. Public signup and staffing gates stay closed; the account cap remains 100, shared model cap 50¢/day and worker model allowance zero.

## Tests and artifact checks

The policy-text patch passed all **216** tests with zero failures/skips on fresh, isolated local databases `orbit_test_founder_20261012_915013` and `orbit_test_founder_alpha_20261012_915013`. Root lint, typecheck and formatting checks passed. Public legal-page assertions now check each approved disclosure. Real private credentials were scanned against **380 tracked source files** and **44 iOS artifact files** with no match. Known local development placeholders were excluded from the real-key scan; no actual provider credential was excluded. No production/user database was used for tests.

Frozen iOS artifact: runtime 0.1.0, 5,262,240 bytes; SHA-256 `259ded898ccefb80d1f970e8a921a62c3f57c9ca35a331404a1a0715b97a777b`; debug ID `069bd615-9caf-4938-be49-9fff7555c1f5`. Its source map uploaded successfully to Sentry organization `gsin-bb`, project `orbit-mobile` (artifact bundle `5ee4980c-1128-5f81-bba4-f50a21194a4c`; server processing was initially pending). The publisher checks both the approved source metadata and actual bundle hash and uses the prepared artifact, not a fresh uninspected export.

## Remaining acceptance and launch gates

The live API `/ready` returned 200 with database ready. `/v1/alpha/status` returned capacity 100, acceptingNewAccounts false, waitlistAvailable true and reason safety_coverage. The approved API `/privacy` returned 200 with all new disclosures. Actual protected endpoints `/v1/mail`, `/v1/agenda`, `/v1/connections`, `/v1/agent` and `/v1/connections/outlook/status` returned 401/AUTH_REQUIRED without credentials. Early checks used nonexistent paths and correctly returned 404; they were corrected to the source-declared routes rather than counted as authentication proof.

Direct production metadata inspection found **19 completed migrations, zero unfinished**, both immutable account/source triggers enabled, and **zero bound-source owner/provider violations**. Migration 18 checksum matches `facec35d065932e5d3c005277a0ece6555e2aac832d8510e0093166a6ccbd06e`; migration 19 matches `48c45efca456be3ce82ec0aca545c45ad1dba4e6e7e28fd3ce20a231c1165c8a`. This audit printed schema metadata and violation counts, not mailbox contents or participant identities.

Railway reported all four services online, one running replica each, zero crashes/recent failures, no staged changes. API/worker remain at 0.25 CPU and 500,000,000 bytes each. Their startup records confirm dedicated Sentry source-map uploads; the worker recorded worker.ready and completed moderation/push/watcher jobs. This proves job execution, not real operator alert delivery or acknowledgement. Private services have no public TCP proxies.

The dashboard's unread critical notification was inspected: it references day-old failed API builds, including deployment `41d0b9b3`, not this release or a budget/payment warning. No notification preferences were changed and historical failure records were not deleted.

The API's actual runtime environment confirms source `2f096a6`, Google enabled/Testing, Microsoft enabled with exactly two test logins and a present server credential, connected-model false, signup false, coverage false, account cap 100, global model cap 50¢/day and API per-user cap 10¢/day. The worker's actual runtime confirms the same source/closed gates, **both global and per-user model caps zero**, and _\*zero MICROSOFT_* variables_*. These checks printed only selected configuration flags/counts, never private credentials.

iOS-only update group **`bc60e602-e93e-4f02-86ee-2e126080091a`**, update **`01a13506-e045-7cce-a6a9-7923786debdf`**, is published to production/runtime 0.1.0. The Expo manifest and launch asset both returned 200; the downloaded launch asset's 5,262,240-byte SHA-256 exactly matches the inspected artifact. Delivery verified at `2026-10-13T11:31:01.000Z`. No Android update or public store submission occurred. The founder was asked to reload once and independently test the new UI/Microsoft consent without sharing private contents.

Physical acceptance must separately confirm the new UI, real Outlook consent/sync, multiple live accounts, full real Gmail completion and reminders on the founder's iPhone. Synthetic account filtering and OS API mocks are not those acceptance tests.

This is not an unrestricted public release. Google verification, Microsoft publisher/organization consent restrictions, moderation staffing and physical alert drills, corrected fresh/offline native binary and Android device verification remain outstanding. No public TestFlight/APK link or public App Store/Play submission was made. Automatic iMessage/WhatsApp access, email sending, calendar writing and AGI are not implemented or promised. The [feature/control/API sprint report](DAY_ONE_AGENT_20261013.md) documents the exact implemented limits and remaining original-build gaps.

The model ceiling remains at most $15.50 for a 31-day month across the API, with zero worker model allowance. This is not unlimited use for 100 users or a measured all-in hosting bill. Existing low-resource services/plans were preserved; no new paid provider, Azure resource or plan was created. A 100-user multi-mailbox load/billing test remains outstanding. Temporary Azure credit is not part of a sustainable budget promise.

Private logical-backup retention/expiry and an independent disaster-recovery copy require operator review. These archives contain personal database data and must not silently become perpetual undeclared retention or be restored after deletion requests without reconciliation. No automated expiry, off-volume replication or restore drill is claimed by this release.

## Safe proof artifacts

Ignored local evidence (no credential value or mailbox contents):

- `tmp/founder-feedback/published-privacy-20261013.png`
- `tmp/founder-feedback/production-quiesced-backup-verified.png`
- `tmp/founder-feedback/production-migrations19-boundaries-verified.png`
- `tmp/founder-feedback/day-one-backend-live.png`
- `tmp/founder-feedback/day-one-api-gates-verified.png`
- `tmp/founder-feedback/day-one-worker-gates-verified.png`
- `tmp/founder-feedback/delivery-evidence.json`

The local UI/API still returned HTTP 200/ready at final verification, at `http://localhost:8081` and `http://localhost:4100/ready`. Local Microsoft credentials were deliberately not added to root `.env`; use the updated founder iPhone app for the approved production Microsoft testing. Fictional preview remains a UI fixture, not real inbox access.
