# Public store release and agent-representation readiness

Updated October 12, 2026, America/Chicago. The founder requested a real App Store/Google Play release, then explicitly chose **wait for verified Google access** rather than ship a Google-disabled public release. This supersedes the earlier beta-only distribution objective, not its unmet release checks.

## Public launch decision

No public store submission or signup opening has occurred. Prepare/test binaries now; submit only after actual Google approval and the remaining device, safety, privacy and store gates pass. Manually changing a verification flag is not Google approval. Existing TestFlight/APK testing remains separate from public store release.

Google Testing permits up to 100 explicitly listed testers; Google access/refresh authorization expires after seven days. This is **Google reconnection**, not ORBIT email sign-in. The independent server account cap is a different limit. Public restricted-Gmail access is not exempt because enrollment is small; server-handled restricted data also requires the applicable verification/security assessment. [Audience rules](https://support.google.com/cloud/answer/15549945), [restricted-scope requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

Google production client/callback, owned-domain verification, real grant/native sync, demonstration video, Limited Use/provider-data-use evidence and actual review remain unfinished. No approval date or assessment budget is promised. Google integration stays disabled in the deployed backend meanwhile.

## Will onboarding teach the agent about its user?

**Yes, users are prompted to teach it; no, the current evidence does not establish that six answers are enough for faithful representation.** Completion willingness/retention must be measured with real people rather than assumed.

The implemented starting sequence asks about:

1. What makes a week go well.
2. People who energize or drain the user.
3. What the user protects when making difficult decisions.
4. What they want to change over six months.
5. How the agent should sound.
6. What the agent must never assume or do without asking.

The server saves each answer as an owner-scoped memory, tracks the interview run and builds a summary/voice configuration on completion. The client saves progress and unsent drafts; tests cover resuming question four. Model/cost failure falls back to fixed questions and preserves written answers. Owners can add, correct and forget memories; optional history import adds separately derived facts. This is not a trained personal model or a complete psychological assessment.

Nightly representative conversations receive stored memory facts, voice guidance and intent parameters. Their prompt says to use known facts, ask about missing details, disclose no identifying information, raise concrete constraints, and make no binding commitments. Redaction/consent gates protect publishing/reveal. Those instructions are useful safeguards, **not proof that every generated sentence obeys them**. Physical-user fidelity and usefulness have not been measured.

### Concrete gaps found in source inspection

- Adaptive follow-ups can ask across topics, but the server labels answers by fixed answer position. It also uses the fifth/sixth answer for voice/boundary settings. A differently focused adaptive question can therefore misclassify its answer.
- Naming an agent marks onboarding complete in the API independently of a verified completed interview; client sequencing alone is not a server completion gate.
- Matching loads active agents without an explicit completed-onboarding/evidence-readiness predicate. Sparse or unconfirmed memory must not be represented as deep knowledge.

These findings are tracked in [issue #36](https://github.com/Hetul803/ORBIT/issues/36); they were **not silently rewritten** in the signing/build follow-up. No founder/private answer was copied into this report or an issue. Current sources: apps/api/src/routes/core.ts, apps/mobile/app/(onboarding)/agent.tsx, apps/worker/src/jobs/nightly.ts and packages/agent/src/conversation.ts.

### Representation acceptance criteria before public release

Align adaptive questions with recorded topics and actual question/answer provenance; have the user review voice, goals and boundaries; enforce completion/evidence requirements server-side; test sparse/contradictory/changed facts. Run user-reviewed scenarios such as declining an incompatible plan, negotiating a collaboration constraint, explaining uncertainty and respecting a corrected preference. Record unsupported-claim and boundary-violation rates, not just compatibility scores. Keep unknowns explicit and request human approval for commitments. These are **remaining acceptance criteria**, not features claimed implemented.

## Signing and build evidence

Apple App Store Connect access is verified. Founder personally accepted the updated Developer Program agreement; the warning cleared and New App became available. Active Apple team 6QYVG36Z22 has renewal date May 25, 2027. Existing PartyWithMe is untouched. New iOS distribution/profile storage needs scoped approval; no APNs key or certificate revocation is authorized by assumption. EU trader status is the founder's declaration, not the agent's guess.

Android signing/build was explicitly approved. New remote ORBIT keystore created; version 0.1.0/code 1 and preview update channel initialized. [Actual EAS build fe1c8591](https://expo.dev/accounts/hetul/projects/orbit/builds/fe1c8591-42af-4762-8866-06228a93c0ac) uses commit 8971c2d6de357aece60a794da65ed20a4cfad439 and **FINISHED successfully** at October 11, 11:49:27 PM Chicago time. Native build time 21m19s. APK saved locally at artifacts/android/ORBIT-0.1.0-1.apk, outside Git/EAS uploads. Build page showed 13 days availability; its temporary artifact link was not published as a permanent landing download.

Artifact inspection with Google's official apksig 9.4.1 verifies its v2 cryptographic signature with zero warnings. Package com.orbit.companion, version 0.1.0/code 1, minimum Android API 24, target 36, debuggable false; microphone permission absent, notification permission present. Actual packaged JavaScript contains the deployed HTTPS API and WSS stream URLs; no actual private root/provider/production env values were found in that checked bundle. This is **artifact inspection, not physical installation or feature/device testing**. Production founder registration remains blocked until explicit staff bootstrap/readiness authority; public admission is still closed.

- APK SHA-256: da46aca5ea85e94052814d789a4af90b88058f6cb2adad234854c384b26c3c45.
- Signer certificate SHA-256: ca73d20caf8dfd97357fdb4ed97cc98a787442973a0f9bb5ce080ee6e2b15211.

Before Play distribution, settle signing-identity continuity for existing APK testers and independently inspect the final AAB/Play-delivered build. No private keystore transfer to Google or Play App Signing enrollment occurred in this follow-up. Retain the current EAS signing record; do not rotate it to solve unrelated provider issues.

![Android artifact completed](screenshots/public-alpha/expo-android-build-finished.jpg)

Build preparation repaired three real gaps: root .easignore excludes private env/signing/local evidence files; EAS post-install builds the shared workspace dependency; Metro now adds Sentry debug IDs with replay/development source-context endpoint disabled. Archive inspection succeeded after a transient api.expo.dev DNS failure; private env files/docs/signing artifacts were absent. No DNS override or paid workaround. Local Android native JavaScript/Hermes export succeeded; source map has a debug ID and 2,485 embedded sources, no actual private env values in the checked map. That export is not an installed APK and used local export settings, not a deployed-device session.

## Latest tests and remaining gates

Play Console currently opens account registration for the signed-in founder account, not an existing developer dashboard. Another login may own an existing account; this has not been assumed. New registration is $25 once and requires the founder's account-type/legal identity choices. New personal accounts additionally require a closed test with at least 12 continuously opted-in testers for 14 days, then production-access application; Android device verification also applies. No registration purchase, agreement acceptance or identity upload was performed. [Registration](https://support.google.com/googleplay/android-developer/answer/6112435), [personal-account testing](https://support.google.com/googleplay/android-developer/answer/14151465).

Full isolated suite now **150 passing, zero failures/skips**: 129 Vitest plus 21 root-script tests. Databases orbit_test_mobile_isolated_20261011 and orbit_test_mobile_alpha_isolated_20261011 were newly created/migrated; only the former received synthetic seed data. Primary and production data were not wiped/reseeded. One intermediate run inherited local real Google configuration and failed an expected-unconfigured assertion; the final runner excludes private root-env fields, uses fresh test databases and keeps the assertion unchanged. Mobile typecheck/lint, actual shared hook, archive inspection and local native JS export pass.

Remaining: signed/installed iOS and Android, native Sentry/push, production founder setup through explicit staff-role authority, real Google grant/sync/Catch sources, two-device reveal, outage/offline/cost/delete/export matrix, real moderated response/staffing, backups/least privilege/ingress, advisories/hosted CI, reviewer account, native store assets/disclosures/external deletion page and Google verification. $100/month allocation excludes unapproved assessment/legal/staffing purchases; no paid EAS plan bought. [Full product report](PUBLIC_ALPHA_VERIFICATION.md), [provider evidence](PROVIDER_SETUP_VERIFICATION.md), [budget](BUDGETED_DEPLOYMENT.md), [distribution paths](LAUNCH_CHECKLIST.md).
