# ORBIT — $100/month deployment controls

Evidence date: October 11, 2026. Founder ceiling: **everything for the app under $100/month**. Figures are allocations, not an observed invoice or a promise of unrestricted use for 100 people.

## Actual running state

- [Local ORBIT](http://localhost:8081/agent) and the local API are running. Real Resend OTP reached the founder, who entered the code and confirmed onboarding. Primary database: 44 accounts, previous 43 preserved; sixteen migrations. It was not wiped or reseeded.
- [Deployed readiness](https://orbit-api-production-807e.up.railway.app/ready) is HTTP 200. Separate ORBIT Railway production environment: API, worker, private pgvector and private Redis online, one replica each, no pending changes. Application source is pinned to 92d81991f15d82f7b5ed91c34937524cc10e11c5. Sixteen production migrations succeeded; no development seed was run. Independent SQL account-count and backup-restore checks remain outstanding.
- Resource limits **applied**: API/worker/Postgres each 0.25 vCPU and 500,000,000 bytes; Redis 0.25 vCPU and 250,000,000 bytes. Two 5,000 MB volume allocations. Only API has public networking; data services and worker have no public domains/TCP proxies.
- API modeled allowance: 10 cents/user/day and 50 cents shared/day, locally and deployed. Worker allowance is explicitly zero during setup. Existing OpenRouter and four fresh production signing/encryption secrets installed privately in ORBIT API/worker only. Local Google credentials were not copied.
- Public signup and moderation-coverage flags remain false. Public alpha status reports acceptingNewAccounts:false, reason:safety_coverage, capacity 100, waitlist available. Operator mailbox configuration is not staffing or ADMIN promotion.
- Resend notify.orbitapp.world Verified; sending enabled, receiving disabled. Domain-restricted sending-only replacement key installed locally and in both production services; exposed old key permanently revoked after approval. OTP and labelled key-rotation verification mail show Delivered. No actual moderation/native-push drill claimed.
- Sentry three-project setup is on Developer Free. Server source-map uploads succeeded for orbit@0.1.0+92d8199; local compiled-stack diagnostics proved readable source lines. Native crash/source-map delivery remains unverified. Performance sampling zero; [privacy and provider evidence](PROVIDER_SETUP_VERIFICATION.md).
- Founder reports Apple membership already paid. Existing Expo account is now signed in and a dedicated ORBIT project created. No signed binary, TestFlight upload/link, direct APK link or paid EAS upgrade is claimed.

## Monthly allocation, not automatic purchases

| Category                      |   Allocation | Control / limitation                                                           |
| ----------------------------- | -----------: | ------------------------------------------------------------------------------ |
| Railway                       |          $45 | Resource limits applied; workspace-wide billing hard limit **not** configured. |
| Models including fee headroom |          $17 | Modeled allowance at most $15.50 in 31 days; verify actual charges.            |
| Transactional email           | $20 reserved | Currently Free at $0; reserve does not authorize an upgrade.                   |
| Sentry / EAS                  |           $0 | Free quotas only; no paid overages or upgrade approved.                        |
| Apple annual renewal reserve  |           $9 | Membership already paid per founder; not a new purchase.                       |
| Domain renewal reserve        |           $3 | Already owned; verify renewal receipt.                                         |
| Tax / other contingency       |           $5 | Included in the ceiling, not extra spending authority.                         |
| **Total allocation**          |      **$99** | Pause changes exceeding the founder's ceiling.                                 |

Railway's checked rates are approximately $10/GB-month RAM, $20/vCPU-month CPU, $0.15/GB-month volume storage and $0.05/GB egress. Plan minimums include usage; do not count the full subscription twice. Applied normalized CPU/RAM caps correspond to approximately **$37.50/month** before storage, egress, deployment overlap and tax. This is not measured utilization or an invoice. No 100-user load test passed. [Rates](https://docs.railway.com/pricing/plans), [billing explanation](https://docs.railway.com/pricing/understanding-your-bill).

Railway's **Workspace Usage → Set Usage Limits → Compute Usage** hard limit shuts down every workload in that workspace, including unrelated projects. A $35 alert / $45 hard limit is proposed only after explicit approval of that impact or workspace isolation. It has not been set. Railway Agent Usage does not cap ORBIT OpenRouter spending. [Cost-control semantics](https://docs.railway.com/pricing/cost-control).

At 100 accounts, a shared 50-cent model allowance averages half a cent/account/day. It is **not** 10 cents multiplied by 100: the shared cap wins. Frequent interviews, Ask and matching will exhaust it. Before scheduled model work is enabled, API and worker must use the same shared ceiling, not independent additive budgets. Keep worker spend zero during setup. Configured estimates/reservations are not a universal card/provider spending limit; measure actual receipts and retries.

Public OpenRouter catalog checked October 11 without a key or paid completion. Configured chat input/output prices, dollars/million tokens: GPT-4o-mini 0.15/0.60; Gemini 2.5 Flash Lite 0.10/0.40; GPT-4.1 mini 0.40/1.60; Gemini 2.5 Flash 0.30/2.50; Claude Sonnet 5.5 2/10; GPT-4.1 2/8. Optional tool/search charges not included; embedding pricing remains unverified. No new paid model evaluation in this provider follow-up. [Catalog](https://openrouter.ai/api/v1/models).

Resend Free permits 3,000 emails/month and **100/day**. OTPs, retries and operator alerts share that quota. It cannot guarantee alert headroom when 100 users repeatedly sign in that day. Start smaller or explicitly approve the reserved paid plan before demand exceeds Free. Sending DNS is now verified; deployed non-founder OTP and report receipt remain separate tests. [Resend pricing](https://resend.com/pricing).

Sentry billing UI confirms Developer Free, 5,000 errors included, no payment method, ended trial. No paid trial started. Expo Free has limited build capacity, not unlimited builds or expedited review. [Expo pricing](https://expo.dev/pricing). Apple $99/year membership is already paid according to founder; not purchased here. [Apple enrollment](https://developer.apple.com/programs/enroll/).

This allocation does not fund paid moderation staff, Google restricted-scope assessment, legal review, acquisition or unrestricted model usage. Gmail stays disabled in production pending separately approved setup and applicable verification. Hosting affordability is not stranger-alpha launch clearance.

## Remaining gates, in order

1. EAS CLI authentication, project environments and resolved build profiles are verified. Complete signed builds with scoped signing approval and the existing Apple account. Private upload tokens never use EXPO_PUBLIC names. [Build setup](https://docs.expo.dev/build/setup/).
2. Create a separately approved production Google Web client with the exact HTTPS callback, privately install it, and complete founder consent/native return/sync. Optionally attach an approved owned API alias first. Do not reuse localhost-only credentials.
3. Verify deployed founder/non-founder OTP, actual report email **and native push**, native Sentry, database runtime least privilege, backup restore, trusted ingress and ten-check device matrix. A workstation HTTPS request is not independent cellular-network proof.
4. Name primary/backup operators and accept the 15-minute acknowledgement / 60-minute protective-action commitment; configure actual staff accounts/devices. No silent founder promotion.
5. Resolve or assess/mitigate open security advisories and restore hosted CI. Obtain external Beta App Review/public TestFlight link and stable signed APK URL/digest; publish only verified artifacts on the owned landing.
6. Review observed costs and explicitly authorize admission changes. Hard capacity stays 100 account records. No signup/staffing gate opened here.

## Evidence and limits

Final local suite: **148 passed, zero failures/skips** (129 Vitest + 19 root-script tests), with fresh isolated databases orbit_test_release_final_20261011 and orbit_test_release_alpha_20261011. Primary data not used for fixtures. Typecheck/lint passed eight packages; format and API/worker builds passed. Docker images subsequently built and booted on Railway.

Connector deployments returned cancelled without a confirmation. Founder approved a dashboard route, which provisioned and committed reviewed configuration. No global/full-access bypass. Only the previously approved Railway read-actions permission changed.

Narrow deployment repairs: direct private service references, OpenSSL/CA certificates in Docker images, explicit PORT=4100 for readiness probe. Earlier failures remain visible. No healthcheck or safety gate removed.

[CI on deployed commit 92d8199](https://github.com/Hetul803/ORBIT/actions/runs/38180581003) failed before execution because GitHub reports a billing lock. Local green tests do not make this a hosted green release.

[Provider proof](PROVIDER_SETUP_VERIFICATION.md), [current product/API inventory](PUBLIC_ALPHA_VERIFICATION.md), [distribution click paths](LAUNCH_CHECKLIST.md).
