# ORBIT public-alpha launch checklist

Updated October 11, 2026: the founder expanded this cohort to include strangers, with a hard ceiling of 100 accounts. The historical dates below were missed; they are not evidence of distribution. Apply the [public-alpha verification](PUBLIC_ALPHA_VERIFICATION.md), [moderation runbook](MODERATION_RUNBOOK.md) and [orbitapp.world DNS handoff](DOMAIN_SETUP.md) before opening admission. The own-domain landing and legal/support pages are live over HTTPS; no TestFlight/APK links exist yet.

October 12 decision/status: public App Store/Google Play release is requested **after verified Google access**, not as an unverified 100-user workaround. Both signed IPA and APK completed and passed signature/identity/targeted bundle inspection, with no physical-install proof yet. Apple agreement/signing are complete; exact ORBIT store name is unavailable, and upload/compliance are pending. Personal Play registration is complete but identity/device/phone verification blocks app creation. Founder-only API operator bootstrap is approved/live; signup and staffing gates stay closed. See [current gates, artifact evidence and onboarding-fidelity findings](STORE_RELEASE_AND_AGENT_READINESS.md). Do not call a binary or passing automated suite a public store launch.

Prepared Friday, October 9, 2026. Target: founder on iPhone by Saturday, October 10; about 25 invited people by Monday, October 12. This is TestFlight/APK distribution, not public store release.

> **Current blockers:** signed phone builds/installation, separate production Google setup, real deployed/device verification and staffed safety response. Resend sending domain/key are now verified and installed; local founder OTP arrived and onboarding was confirmed. Deployed non-founder OTP and actual report email/native push still need proof. Public signups remain closed. No code is shown on screen.

## Gate 0 — accounts and values to prepare

1. Put production secrets in a password manager. Run `pnpm secrets:generate` once locally to create ignored `.env.production.local`; copy values to Railway without printing or committing them. JWT access, JWT refresh, field encryption, and export signing values must all differ from development and from each other.
2. Confirm `git check-ignore -v .env .env.production.local` names `.gitignore` before doing anything else.
3. Have access to GitHub, Railway, Resend, Google Cloud, Sentry, Expo, Apple Developer Program/App Store Connect, Namecheap, and real iOS/Android devices. Railway deployment is complete under explicit dashboard-route approval: four online services in the separate ORBIT project. Reuse it; do not create duplicates. Founder reports paid Apple membership; existing Expo account is signed in.
4. The owned landing domain is `orbitapp.world`, registered at Namecheap; DNS/TLS and all four public pages are verified. Proposed API domain `api.orbitapp.world` needs its own Railway record after deployment. The approved public support address is configured locally and in the landing; prove real receipt and monitoring. Do not infer moderator staffing from a supplied support address.

## Gate 1 — verified Resend; finish deployed receipt drills

The sending domain **notify.orbitapp.world** is Verified, sending enabled and receiving disabled. The three approved DNS records are saved/resolved. A sending-only, domain-restricted replacement key is installed locally and in API/worker; old exposed key revoked. Do not create another domain/key or change root mail records.

1. Open Resend **Domains → notify.orbitapp.world** and retain its Verified state.
2. Keep Railway API/worker **Variables** set to real Resend delivery and the approved verified sender; never paste credentials into chat or a report.
3. Local founder OTP is Delivered and human sign-in reached onboarding. From the **deployed** signed app request fresh OTPs to founder and a non-founder, verify receipt, 30-second resend, old-code rejection and honest quota failures.
4. Separately run the real report drill against approved test accounts/devices: suppression before review, operator email **and** native push, acknowledgement/protective-action timestamps.
5. Free quota is 100/day including OTPs and alerts. Do not invite users until alert headroom and staffing are established. Paid email reserve is not upgrade authority.

## Gate 2 — deployed Railway; finish operations proof

Completed: dedicated project **2adb816f-2c53-4bed-bfe8-f77de16a56a3**, four online single-replica services, two private volumes, resource caps, fresh server secrets, sixteen migrations, server source-map uploads, public API HTTPS. Initial successful API/worker source was **92d8199**. October 12 founder-only allowlist change rebuilt API from **e4f01f3** on main; API/worker/packages/infra/Dockerfile source is unchanged between those commits. Worker remains on its prior deployment. [Readiness](https://orbit-api-production-807e.up.railway.app/ready) is HTTP 200. [Exact current evidence](STORE_RELEASE_AND_AGENT_READINESS.md).

1. Open the existing ORBIT project → **Architecture**. Keep API/worker/pgvector/Redis; do not provision replacements. Data services and worker remain private.
2. Open API **Settings → Build**: Dockerfile path **infra/Dockerfile.api**, repository root. Worker uses **infra/Dockerfile.worker**. Config-as-code opt-in is unavailable for these new services; explicit settings are applied. Do not rely on old Add File Path instructions.
3. API **Settings → Deploy**: pre-deploy **pnpm --filter @orbit/db migrate:deploy**, start **pnpm --filter @orbit/api start**, health **/ready**; **Variables** API_PORT/PORT **4100**. Worker start **pnpm --filter @orbit/worker start**. No seed.
4. **Settings → Scaling**: one replica each; CPU .25 each; API/worker/Postgres 500,000,000-byte memory, Redis 250,000,000. No automatic increase without budget review.
5. **Settings → Networking**: only API public, current generated host **orbit-api-production-807e.up.railway.app** target 4100. An owned API alias needs a separately approved DNS change. Preserve landing/mail records.
6. **Variables**: private direct service references for database/Redis; service-specific private secrets/provider credentials. Keep signup/coverage false, production Gmail disabled until approved client exists, development seed/OTP off, phone disabled, worker modeled spend zero. Founder explicitly approved adding only patelhetul803@gmail.com to API ADMIN_EMAILS; that setting is live, but real account creation/role still need native sign-in proof. Do not expand it or infer staffing.
7. **Deployments → active deployment → View Logs**: retain migration/upload/listening/worker-ready evidence without publishing private payloads. Earlier failed deployments remain visible; current API warning still requires assessment.
8. On an actual phone **with Wi-Fi off**, open public **/ready**. Save successful JSON as independent cellular evidence. The workstation curl is not that test.
9. Finish private database backup restore, vector-extension/account-count SQL and runtime/migrator least privilege before inviting strangers.
10. Verify ingress trust with Railway. Fastify ignores forwarding headers by default. Use only verified immediate peer CIDRs, never trust-all; test two networks and forged headers. Until proven, per-IP limits may aggregate ingress users. Do not relax account/cost caps.
11. Billing hard limit affects every workspace workload, including unrelated apps. Obtain separate approval/isolation before applying it. [Budget](BUDGETED_DEPLOYMENT.md).

## Gate 3 — configure Google Cloud

1. The founder created the separate **ORBIT** project `orbit-511108`; its identity and previously unconfigured Google Auth Platform were inspected October 11. Use this project, not an unrelated app's project or a duplicate. Privately retain project creation/ownership evidence; branding, verification state and testing allowances are per project.
2. Gmail API and Google Calendar API are enabled in `orbit-511108`, verified in their service detail pages. No paid Google resources or billing were enabled.
3. External/Testing consent configuration was created with founder-approved contacts and explicit approval of the required data policy. It is not production-verified.
4. **Branding** already has homepage `https://orbitapp.world/`, privacy `https://orbitapp.world/privacy/`, terms `https://orbitapp.world/terms/`, authorized domain `orbitapp.world` and the approved support contact. All four public pages returned HTTPS 200. Support receipt/monitoring is still unproven. Google Search Console verification TXT records are separate from hosting TXT records; preserve both.
5. **Google Auth Platform → Data Access** already has exactly Gmail API `.../auth/gmail.readonly` and Calendar API `.../auth/calendar.readonly` saved and verified. Do not add send, modify, contacts or calendar-write access. **ORBIT local founder alpha** already exists with only `http://localhost:4100/v1/connections/gmail/callback`, credentials in ignored local `.env`, and both supplied Google accounts in the persisted test-user table. No account has granted data access. Do not recreate that local client; the next step is a separate deployment client after the API exists.
6. Open **Google Auth Platform → Clients → Create Client**. Choose **Web application**, name it `ORBIT Railway`, and under **Authorized redirect URIs** click **Add URI**. Enter exactly `https://<API_DOMAIN>/v1/connections/gmail/callback`. Click **Create**.
7. Copy the new project's client ID and secret into `orbit-api` Railway variables. Also set `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_OAUTH_REDIRECT_URI` to the exact callback, `GOOGLE_OAUTH_VERIFICATION_STATUS=testing`, `GOOGLE_TEST_USER_EMAILS` to permitted ORBIT account emails, and `GMAIL_INTEGRATION_ENABLED=true`; redeploy. Do not label the app verified before Google approves it.
8. In **Google Auth Platform → Audience**, keep status **Testing** until necessary verification is complete. Add each permitted Google-account test email and align the ORBIT API allowlist. Unlisted ORBIT users are told Google access is pending verification; other features remain available. The ORBIT 100-account cap is independent of Google's testing limits. A public link and fewer than 100 strangers do not create a personal-use verification exemption. [Restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).
9. On the installed iPhone, open **You → Settings & model keys → Connections → Connect Google read-only**. Read the full consent screen, approve both scopes, return through `orbit://connections`, and confirm progress advances through mail, Calendar, and Catch. Cancel once and deny once before the successful test; confirm each message is distinct.
10. To begin verification today, complete Branding with an owned, publicly accessible homepage that links Privacy; verify the domain in Search Console if prompted; keep Data Access limited to the two exact scopes; prepare a screen recording showing the English consent screen, OAuth client ID, complete grant, Gmail-derived Catch item, Calendar-derived item, source links, disconnect, and deletion; write a scope-by-scope necessity explanation; then open **Google Auth Platform → Verification Center** or the **Prepare for verification** action shown in Branding/Data Access. Review the summary, click **Submit for verification**, and answer Google's email requests. Plan for four to six weeks; that timing is an operating estimate, not a guarantee. Gmail read-only is a restricted scope; server-side handling may also require Google's security assessment process, not just sensitive-scope review.

## Gate 4 — Sentry provider setup done; finish real-device proof

Three dedicated projects exist in **gsin-bb** on Developer Free. Server DSNs/private upload token are installed in Railway. Production API/worker source-map uploads succeeded; local compiled diagnostics show original source lines. Existing unrelated project and GitHub integration were not changed.

1. Sentry **Settings → Projects → orbit-api / orbit-worker / orbit-mobile → Security & Privacy**: preserve default/data scrubbers, Prevent Storing IP, sensitive fields and geography-child removal rule. No performance sampling.
2. Expo **ORBIT → Project settings → Environment variables**: mobile ingestion DSN is public; SENTRY_AUTH_TOKEN uses **Secret** visibility. Never put it under EXPO_PUBLIC.
3. On the signed phone, trigger an approved non-sensitive diagnostic, remove the trigger, and verify correct mobile release/source lines with no private context.
4. Separately verify actual deployed API/worker error routing/alert ownership. Synthetic Node ingestion is not a native SDK test or a production-route crash.
5. Verify worker/mobile newly ingested diagnostics omit inferred geography after the final wildcard rule. Existing old diagnostic events were not deleted.
6. Missing/failed source-map upload must still stop server startup. [Evidence and privacy limits](PROVIDER_SETUP_VERIFICATION.md).

## Gate 5 — initialize EAS and build

1. Existing **hetul** account and CLI login are verified. Dedicated **ORBIT / orbit** project is created. Reuse it; no new account or duplicate init. Official browser login succeeded; no sudo/chmod or account-wide API token was needed.
2. Open **ORBIT → Project settings → Environment variables**. The project UUID is stored there, not hardcoded into Git. Export it only in the local command environment for EAS CLI config/build commands.
3. Seven project variables are saved in development/preview/production. Public project ID, API HTTPS, WS WSS and mobile DSN are separate from server/private credentials. API host is **orbit-api-production-807e.up.railway.app**; WS path **/v1/stream**. Do not point a shipped binary at localhost.
4. SENTRY_ORG and SENTRY_PROJECT are saved; SENTRY_AUTH_TOKEN is saved with **Secret** visibility. It is available to cloud builds, not readable from EAS CLI or the public bundle.
5. Resolved iOS production / Android preview configs were verified: version **0.1.0**, initial build/code **1**, **com.orbit.companion**, proper distribution/channel, Updates appVersion runtime and mobile Sentry plugin. Cloud native builds now succeed; physical runtime remains unverified.
6. Reuse the approved Apple Distribution certificate and ORBIT App Store profile in EAS; don't regenerate/revoke them or create APNs credentials by assumption. The first iOS production build **e53b1cd6-2afd-44e0-8be7-5cb6a23a3cce** is FINISHED, IPA signature/profile/config inspected and copied to artifacts/ios/ORBIT-0.1.0-1.ipa. Configure EXPO_PUBLIC_EAS_PROJECT_ID from ORBIT's saved EAS value for CLI commands; do not accept an automatic repository-config rewrite.
7. Reuse the approved Android keystore. Preview build **fe1c8591-42af-4762-8866-06228a93c0ac** is FINISHED, APK signature/config inspected and copied to artifacts/android/ORBIT-0.1.0-1.apk. Physical install, feature testing and final Play-delivered signing continuity remain separate gates.
8. In Expo Dashboard open **ORBIT → Builds**, open each completed build, and retain the build URL. Do not mark a queued or failed build as delivered.
9. After founder approves the alternate store display name, create its app record. Obtain separate scoped upload-auth approval (Developer-role team key still covers all apps) or have the founder upload through Apple Transporter. Submit the explicit build ID **e53b1cd6-2afd-44e0-8be7-5cb6a23a3cce**, not an ambiguous --latest. Uploading to App Store Connect/TestFlight is not public App Store version submission. No upload has occurred yet.

## Sequence 1 — founder's own iPhone, today

1. Exact store name `ORBIT` was rejected as already in use. In App Store Connect **Apps → + → New App**, use the founder-approved alternative display name, iOS only, English (U.S.), bundle ID `com.orbit.companion` and SKU `orbit-ios-001`. Do not submit a trademark claim or choose a new name without the founder. Icon label stays ORBIT. The pending error form contains no saved app record.
2. Upload the production iOS build through EAS Submit as described above.
3. In App Store Connect open **Apps → ORBIT → TestFlight → iOS**. Wait until build `0.1.0 (1)` finishes **Processing**. Answer **Manage Compliance** accurately if Apple asks about encryption; the app uses standard OS/network encryption and does not ship a custom cryptographic algorithm.
4. In the TestFlight sidebar next to **Internal Testing**, click **+**. Choose **Create New Group**, name it `Founder`, enable automatic distribution only if wanted, and click **Create**.
5. Open the `Founder` group. Click **Add Builds → 0.1.0 (1) → Add**.
6. Click **Add Testers**. Select the founder's App Store Connect user. If he is absent, open **Users and Access → +**, add his Apple Account email with an app-access role, then return and add him.
7. On the iPhone install Apple's **TestFlight** app from the App Store. Open the invitation email or TestFlight, tap **Accept**, then **Install** beside ORBIT.
8. Internal testing does not require Beta App Review. Processing, compliance questions, signing, and account agreements can still block availability.
9. On cellular, not Mac loopback, complete the ten-step deployed verification in `docs/PASS5_VERIFICATION.md`. Save screenshots of `/ready`, successful email receipt with the code obscured, Google connected/progress, Catch source open, two-sided reveal, deletion countdown/cancel, and export verification.

## Sequence 2 — public TestFlight distribution, including strangers

1. In App Store Connect open **Apps → ORBIT → TestFlight**. After an internal group exists, create an **External Testing** group named `ORBIT Alpha`. The first external build needs Beta App Review; a queued upload or internal invitation does not meet the public-link requirement. [Apple external-testing instructions](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/).
2. Open the group and click **Add Builds**. Select the exact founder-tested build, click **Add**, and complete **Test Information**: beta description, features to test, private feedback email, review contact name/phone/email, and sign-in credentials.
3. Use the real reviewer mailbox plan in `docs/STORE_SUBMISSION.md`. Put mailbox access/OTP instructions only in the private Beta App Review fields. Never add a fixed OTP or source-code bypass.
4. Answer export compliance and content questions. Click **Submit for Review** for Beta App Review. The first external build requires review; submit Saturday rather than waiting for Monday.
5. After approval, enable the public link with suitable device/OS criteria and a controlled tester limit. The server independently caps all accounts at 100, including staff/suspended/pending deletion; TestFlight enrollment is not account admission.
6. Verify the real `https://testflight.apple.com/join/...` link and installation. Put it in `apps/landing/release-config.json`, rebuild and republish the existing site. It must be reachable from `https://orbitapp.world/`, not only sent privately.
7. Keep Google gated to permitted named testers while verification is pending. Do not tell strangers to bypass an unverified-app warning as a public-launch workaround.
8. Complete the moderation delivery/staffing drill before opening signups. Watch health, outbox, response deadlines, provider limits, Sentry and daily costs. Admission automatically fails closed for absent readiness, stale unsent alerts and overdue acknowledgement/first action.

## Sequence 3 — direct Android APK on the owned landing page

1. Build/install the signed preview APK, verify package `com.orbit.companion`, API HTTPS/WSS environment, native deep links and push, and download the actual artifact. Compute its SHA-256 and publish the immutable `.apk` over public HTTPS on an approved artifact host. Do not use an expiring/private signed URL or a build-dashboard page as the direct download.
2. Put its public URL and digest in `apps/landing/release-config.json`, rebuild and republish. Verify downloading from `https://orbitapp.world/` produces the same digest and installs the exact founder-tested artifact. It is not Google Play; disclose direct installation clearly.
3. On Android, open the link, download the `.apk`, and tap the download. Chrome or Files may say **For your security, your phone currently isn't allowed to install unknown apps from this source**. Tap **Settings**, enable **Allow from this source** for the app that opened the file, go back, then tap **Install**.
4. If Play Protect offers **Scan app**, let it scan. Do not tell people to disable Play Protect. If Android shows a different publisher, package, or source than the Expo ORBIT build page, stop.
5. After installation, return to **Settings → Apps → Special app access → Install unknown apps**, open Chrome/Files, and turn **Allow from this source** off again.
6. Open ORBIT and complete email OTP. Google testers must already be listed in Google Auth Platform. Record model/manufacturer, Android version, install result, deep-link result, push permission/result, and any clipped type.

## Expo Updates after the signed build

1. The dynamic config enables Updates only when `EXPO_PUBLIC_EAS_PROJECT_ID` is present and uses runtime policy `appVersion`; the build profiles use `preview` and `production` channels.
2. Test a JavaScript-only fix on the preview channel first: `pnpm dlx eas-cli@latest update --channel preview --environment preview --message "Describe the tested fix"`.
3. Install/restart the preview build twice and confirm the update/recovery behavior. Then publish the same compatible commit with `--channel production --environment production`.
4. A new native build is required for native dependencies/plugins, Expo SDK or React Native upgrades, permissions, entitlements, icons/splash resources, bundle/package IDs, iOS plist/Android manifest changes, or any native API contract change. Because Pass 5 removed microphone permission, the first TestFlight build must be newly built; an update cannot remove a binary permission.

## Stop conditions

Do not invite friends if any of these is true: `/ready` fails over cellular; OTP does not arrive from the verified sender; the build points to localhost/HTTP; Google callback does not return to the app; message bodies or credentials appear in logs; account cap/cost cap is absent; deletion cannot be cancelled; Catch invents a source; or Sentry receives private content.

The October 9 dependency audit also found two remaining high-severity advisories with no published fixes (`node-forge` and `braces`). Patched versions of `shell-quote` and `source-map-js` are pinned. Do not bypass the CI audit gate: resolve or independently assess and mitigate the remaining advisories before distributing this release.
