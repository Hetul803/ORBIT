# ORBIT public-alpha launch checklist

Updated October 11, 2026: the founder expanded this cohort to include strangers, with a hard ceiling of 100 accounts. The historical dates below were missed; they are not evidence of distribution. Apply the [public-alpha verification](PUBLIC_ALPHA_VERIFICATION.md), [moderation runbook](MODERATION_RUNBOOK.md) and [orbitapp.world DNS handoff](DOMAIN_SETUP.md) before opening admission. The own-domain landing and legal/support pages are live over HTTPS; no TestFlight/APK links exist yet.

Prepared Friday, October 9, 2026. Target: founder on iPhone by Saturday, October 10; about 25 invited people by Monday, October 12. This is TestFlight/APK distribution, not public store release.

> **Monday blocker: verify a sending domain in Resend.** Until `RESEND_FROM_EMAIL` uses a verified domain and Railway has the matching `RESEND_API_KEY`, real OTP email is not proven. The app deliberately refuses production log mode and never shows a code on screen. Google test-user access is a second per-person requirement for anyone connecting Google.

## Gate 0 — accounts and values to prepare

1. Put production secrets in a password manager. Run `pnpm secrets:generate` once locally to create ignored `.env.production.local`; copy values to Railway without printing or committing them. JWT access, JWT refresh, field encryption, and export signing values must all differ from development and from each other.
2. Confirm `git check-ignore -v .env .env.production.local` names `.gitignore` before doing anything else.
3. Have access to GitHub, Railway, Resend, Google Cloud, Sentry, Expo, Apple Developer Program/App Store Connect, Namecheap, and real iOS/Android devices. Railway access became available October 11: a new private ORBIT project and two staged service shells exist, but applying the staged deployment was not approved. Do not reuse the unrelated projects or claim the API is deployed.
4. The owned landing domain is `orbitapp.world`, registered at Namecheap; DNS/TLS and all four public pages are verified. Proposed API domain `api.orbitapp.world` needs its own Railway record after deployment. The approved public support address is configured locally and in the landing; prove real receipt and monitoring. Do not infer moderator staffing from a supplied support address.

## Gate 1 — verify Resend before inviting anyone

1. Sign in to Resend and open **Domains → Add Domain**.
2. Enter the owned sending domain or a sending subdomain such as `mail.<owned-domain>`; choose the region closest to Railway if offered; click **Add**.
3. At the DNS host, create every SPF, DKIM, and return-path record Resend displays. Copy names and values exactly. Do not proxy mail records through a CDN.
4. Return to Resend **Domains**, open the domain, and click **Verify DNS Records** until status is **Verified**.
5. Open **API Keys → Create API Key**. Name it `ORBIT production`, limit it to sending if Resend offers permission scope, create it, and copy it once into Railway as `RESEND_API_KEY`.
6. In Railway set `OTP_DELIVERY_MODE=resend` and `RESEND_FROM_EMAIL=ORBIT <sign-in@<verified-domain>>`.
7. From the deployed app, request an OTP to the founder and to one non-founder mailbox. Confirm the newest six-digit code arrives, the From domain aligns, resend waits 30 seconds, and an earlier code cannot be used. Do not invite friends until both addresses pass.

## Gate 2 — deploy Railway

The founder declined the staged deployment. This sequence requires new approval before execution. Reuse existing ORBIT project `2adb816f-2c53-4bed-bfe8-f77de16a56a3` and staged API/worker services; do not create duplicate projects or service shells. The template/repository steps below describe provisioning/source work still needed, not actions already completed.

1. Sign in to Railway. Click **New Project → Deploy a Template**, search for **pgvector**, and deploy a PostgreSQL template that includes the vector extension. Name the service `orbit-postgres`.
2. In the project canvas click **New → Database → Add Redis**. Name it `orbit-redis`. Do not generate a public domain for either data service.
3. Click **New → GitHub Repo**, select `Hetul803/ORBIT`, and name the service `orbit-api`. Open **Settings → Source** and keep Root Directory `/`. Open **Settings → Config as Code → Add File Path**, enter `/infra/railway/api.json`, and save.
4. Open `orbit-api` **Settings → Networking → Public Networking → Generate Domain**. Record the HTTPS host. If using a custom host, click **Custom Domain**, enter it, add Railway's displayed DNS record, and wait for TLS.
5. Add another **New → GitHub Repo** service from the same repository, name it `orbit-worker`, and set **Settings → Config as Code** to `/infra/railway/worker.json`. Do not add public networking.
6. Open the project **Variables → Shared Variables → New Variable**. Add `NODE_ENV=production`, database and Redis reference variables, one fresh `FIELD_ENCRYPTION_KEY`, OpenRouter routing/cost variables, daily cost caps, and `SENTRY_DSN`. Use Railway's **Add Reference** picker for `DATABASE_URL` and `REDIS_URL`; do not paste public database credentials.
7. In `orbit-api` **Variables**, add `PUBLIC_API_URL`, `ALLOWED_ORIGINS`, both JWT secrets, export secret, Resend values, `PHONE_OTP_PROVIDER=disabled`, Google values, `ORBIT_MOBILE_REDIRECT_URL=orbit://connections`, `DEPLOYMENT_ACCOUNT_CAP=100` (never higher), the OTP/account limits from `.env.example`, `ADMIN_EMAILS`, `SUPPORT_EMAIL`, and private `MODERATION_OPERATOR_EMAILS`. Initially keep `PUBLIC_ALPHA_SIGNUPS_OPEN=false` and `MODERATION_COVERAGE_CONFIRMED=false`.
8. In `orbit-worker` **Variables**, add the cron values from `.env.example`, including `MODERATION_TICK_CRON=*/5 * * * * *`. API and worker both need Resend values and server-only `EXPO_ACCESS_TOKEN` if Expo requires it. Keep `ALLOW_DEVELOPMENT_SEED=false` and `ALLOW_DEVELOPMENT_OTP_DISPLAY=false` everywhere. Keep one API instance for the alpha's process-local live safety invalidation.
9. Select `orbit-api` and click **Deploy**. The config runs `prisma migrate deploy` before starting and checks `/ready`. Open **Deployments → latest deployment → View Logs**. A missing required production variable must stop boot and name the variable; correct it in Railway, not source.
10. When API status is **Active**, click its generated domain and verify `/health`, `/ready`, `/privacy`, `/terms`, and `/support`. From a phone on cellular—not the same Wi-Fi—open `https://<API_DOMAIN>/ready` and save the successful JSON screenshot as external-network evidence.
11. Select `orbit-worker` and click **Deploy**. In **Deployments → View Logs**, confirm scheduler registration and no credential/body/email in a line.
12. Never run `pnpm db:seed` against Railway. The seed script refuses production even if its development-only flag is explicitly set.
13. Before accepting signups, verify client-IP handling. Fastify ignores forwarded headers by default. Set `TRUSTED_PROXY_CIDRS` only to verified immediate-ingress addresses/CIDRs, never `true`, `0.0.0.0/0`, or `::/0`. Confirm with Railway which trusted ingress peers and forwarding headers apply to the chosen domain. Test two networks for separate limits and a forged forwarding header for no bypass. Until this is proven, per-IP limits may group all users behind one ingress and reject the sixth signup. Do not relax the account cap to compensate. [Railway networking contract](https://docs.railway.com/networking/public-networking/specs-and-limits), [Fastify proxy trust](https://fastify.dev/docs/latest/Reference/Server/).

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

## Gate 4 — Sentry release proof

1. In Sentry click **Projects → Create Project**. Create one **Node.js** project for `orbit-api`, one for `orbit-worker`, and one **React Native** project for `orbit-mobile`.
2. Put server DSNs in the matching Railway services as `SENTRY_DSN`; set `SENTRY_ENVIRONMENT=production`.
3. In Sentry open **Settings → Developer Settings → Internal Integrations → Create New Integration**. Create a CI release-upload token with only the needed project/release permissions. Put `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` in the EAS production environment; never use an `EXPO_PUBLIC_*` name for the token.
4. Put only the mobile public DSN in EAS as `EXPO_PUBLIC_SENTRY_DSN`.
5. After the build, trigger a controlled non-sensitive test error in each service, remove the trigger, and verify the Sentry event has readable source lines, environment, release, and request ID without email, token, prompt, or message body.
6. In each Railway service add private `SENTRY_AUTH_TOKEN`, its own `SENTRY_PROJECT`, `SENTRY_ORG`, and a distinct `SENTRY_RELEASE` such as `orbit-api@<commit-sha>` or `orbit-worker@<commit-sha>`. The start scripts inject debug IDs and upload service/shared-package source maps before launching the Node process. Missing settings or a failed upload stop production startup. The CLI token is passed through environment only. Upload success and readable release events still need to be proved with the founder's Sentry account. [Sentry source-map guidance](https://docs.sentry.io/platforms/javascript/guides/hono/sourcemaps/troubleshooting_js).

## Gate 5 — initialize EAS and build

1. In a terminal run `cd apps/mobile` and `pnpm dlx eas-cli@latest login`. Use the Expo account that will own ORBIT.
2. In Expo Dashboard click **Projects → Create a project**, name it `ORBIT`, and copy its project UUID. Alternatively run `pnpm dlx eas-cli@latest init`; if it writes the UUID into source, remove that source edit before committing.
3. In Expo Dashboard open **ORBIT → Project settings → Environment variables → Create variable**. For `development`, `preview`, and `production`, create plaintext `EXPO_PUBLIC_EAS_PROJECT_ID=<uuid>`. Also create `EXPO_PUBLIC_API_URL=https://<API_DOMAIN>`, `EXPO_PUBLIC_WS_URL=wss://<API_DOMAIN>/v1/stream`, and `EXPO_PUBLIC_SENTRY_DSN=<mobile-public-dsn>` in preview/production. These values are readable in the app bundle and must never contain a private key.
4. Add `SENTRY_ORG`, `SENTRY_PROJECT`, and secret `SENTRY_AUTH_TOKEN` to preview/production. Before each local EAS command, export the project UUID only in that terminal as `EXPO_PUBLIC_EAS_PROJECT_ID`; do not add it to Git.
5. Run `pnpm dlx eas-cli@latest config --platform ios` and the Android equivalent. Confirm version `0.1.0`, iOS build `1`, Android version code `1`, package/bundle ID `com.orbit.companion`, production channel, and HTTPS/WSS URLs.
6. Run `pnpm dlx eas-cli@latest build --platform ios --profile production`. When asked, sign in to the Apple Developer account, select the correct team, and let EAS create or reuse the distribution certificate and profile.
7. Run `pnpm dlx eas-cli@latest build --platform android --profile preview`. The checked-in preview profile uses `distribution: internal` and `buildType: apk`, so the result is directly installable.
8. In Expo Dashboard open **ORBIT → Builds**, open each completed build, and retain the build URL. Do not mark a queued or failed build as delivered.
9. Upload iOS using `pnpm dlx eas-cli@latest submit --platform ios --profile production --latest`. This uploads to App Store Connect/TestFlight; it does not submit the public App Store version.

## Sequence 1 — founder's own iPhone, today

1. In App Store Connect click **Apps → + → New App**. Select iOS, enter `ORBIT`, primary language, bundle ID `com.orbit.companion`, and an internal SKU such as `orbit-ios-001`; click **Create**.
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
