# ORBIT store-submission packet

Prepared October 9, 2026. This packet is for later submission; Pass 5 did not submit either store.

## Product identity

| Field                                             | Value                                                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| App name                                          | **ORBIT**                                                                                                   |
| iOS bundle ID / Android package                   | `com.orbit.companion`                                                                                       |
| Version                                           | `0.1.0`                                                                                                     |
| Initial iOS build / Android version code          | `1` / `1`; EAS production uses remote auto-increment after the first build                                  |
| Primary category                                  | Lifestyle                                                                                                   |
| Secondary category                                | Productivity                                                                                                |
| Minimum audience                                  | 18+                                                                                                         |
| Copyright                                         | `2026 ORBIT`                                                                                                |
| Privacy URL available now                         | `https://github.com/Hetul803/ORBIT/blob/main/docs/PRIVACY.md`                                               |
| Terms URL available now                           | `https://github.com/Hetul803/ORBIT/blob/main/docs/TERMS.md`                                                 |
| Preferred hosted privacy URL after Railway deploy | `https://<API_DOMAIN>/privacy`                                                                              |
| Preferred hosted terms URL after Railway deploy   | `https://<API_DOMAIN>/terms`                                                                                |
| Interim support URL                               | `https://github.com/Hetul803/ORBIT/issues`                                                                  |
| Preferred hosted support URL                      | `https://<API_DOMAIN>/support`                                                                              |
| Contact email                                     | **BLOCKED: create a private mailbox on the owned sending domain and replace this field before submission.** |

The GitHub legal URLs become public as soon as this commit reaches the public `main` branch. The API also serves the same disclosures at `/privacy`, `/terms`, and `/support`, but those URLs are not public until Railway is deployed. A public issue must never contain a sign-in code, Gmail content, or other private data.

## Listing copy

### Apple subtitle

`A private agent that acts`

### Apple promotional text

`A second self that remembers what matters, catches the loose ends in your real life, and tests thoughtful introductions—without a feed, ads, or social scraping.`

### Google Play short description

`A private agent that remembers, catches loose ends, and acts only with consent.`

### Full description

ORBIT is a private agent built around your actual life—not a feed designed to keep you scrolling.

Start with a short interview. ORBIT turns your answers into a memory you can inspect, edit, forget, or export. Connect Gmail and Google Calendar read-only when you want the Catch to surface commitments, replies, dates, and renewals with a link back to the original source. Message bodies are not retained, and ORBIT never sends mail or edits your calendar.

Tell ORBIT what you are open to: a friend, collaborator, roommate, or another supported intent. Your agent can privately speak with another person's agent, test a real concern, and show the transcript. Nothing is revealed until both people separately agree.

You stay in control:

- inspect or remove memories;
- approve actions before they leave your private space;
- see the source behind a Catch item;
- dismiss, snooze, or copy a draft;
- disconnect Google and erase the stored token;
- export a signed archive; and
- schedule account deletion with a seven-day cancellation window.

ORBIT is for adults 18 and older. Model output can be wrong; verify important facts and drafts before acting. Google connection is optional, and the rest of the app remains usable without it.

### Apple keywords

`private agent,personal memory,commitments,introductions,calendar,email,focus,assistant`

### Beta description

`Test the complete path from email sign-in through the private-agent interview, Today, read-only Google connection, source-backed Catch, watchers, and consent-based introductions. Please report any stalled sync, clipped type, stale source, unclear error, or action without an explicit confirmation.`

### Beta feedback email

**BLOCKED: use the private support mailbox created on the owned domain.**

## Screenshots and graphics

All checked-in screenshots are light-mode captures of the real web build, placed on the app's warm-bone background at accepted store dimensions. They contain no fabricated records. Before a public store submission, replace them with fresh captures from the final signed native build so platform chrome, safe areas, and final Gmail states are accurate.

| Store target                         | Dimensions                    | Files                                                                                             |
| ------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| Apple required Dynamic Island medium | 1179×2556 PNG, no alpha       | `docs/store-assets/screenshots/ios-dynamic-island-medium/01-sign-in.png` through `05-offline.png` |
| Apple optional Dynamic Island large  | 1290×2796 PNG, no alpha       | `docs/store-assets/screenshots/ios-dynamic-island-large/01-sign-in.png` through `05-offline.png`  |
| Google Play phone                    | 1080×1920 PNG, 9:16, no alpha | `docs/store-assets/screenshots/android-phone/01-sign-in.png` through `05-offline.png`             |
| App Store icon                       | 1024×1024 PNG                 | `docs/store-assets/icons/app-store-1024.png`                                                      |
| Play Store icon                      | 512×512 PNG                   | `docs/store-assets/icons/play-store-512.png`                                                      |
| Play feature graphic                 | 1024×500 PNG, no alpha        | `docs/store-assets/play-feature-1024x500.png`                                                     |

The Expo app icon source remains `apps/mobile/assets/orbit-ring-icon.png` at 1254×1254. EAS generates platform launcher sizes from that source. The store assets README records file hashes and the manual replacement step.

## Apple App Privacy answers

Choose **Yes, we collect data**. “Linked to the user” below means the record is stored with the ORBIT account or is reasonably linkable to it. Choose **No** for tracking across other companies' apps and websites. Choose **No** for third-party advertising and developer advertising.

| Apple data type                        | Collected                                      | Linked       | Tracking | Purposes and exact behavior                                                                                                            |
| -------------------------------------- | ---------------------------------------------- | ------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Contact Info → Name                    | Yes                                            | Yes          | No       | Account display name, agent labeling, app functionality                                                                                |
| Contact Info → Email Address           | Yes                                            | Yes          | No       | OTP sign-in, security, account management, admin allow-list                                                                            |
| Contact Info → Phone Number            | Only if phone verification is enabled and used | Yes          | No       | Optional verification and fraud prevention; current mobile sign-in does not expose phone OTP                                           |
| User Content → Emails or Text Messages | Yes                                            | Yes          | No       | Gmail content is read through Google, processed transiently for Catch, and not retained; metadata and derived signals are retained     |
| User Content → Other User Content      | Yes                                            | Yes          | No       | Interview/profile text, memories, intents, watcher queries, agent transcripts, reports, files selected for import, Calendar event data |
| Identifiers → User ID                  | Yes                                            | Yes          | No       | Internal account, agent, run, connection, introduction, and request IDs                                                                |
| Identifiers → Device ID                | Yes                                            | Yes          | No       | Expo push token and device platform for opted-in notifications                                                                         |
| Usage Data → Product Interaction       | Yes                                            | Yes          | No       | Catch actions, reveals, approvals, settings, sync receipts, runs, and activity audit                                                   |
| Usage Data → Other Usage Data          | Yes                                            | Yes          | No       | Model task/provider/token/cost status and rate/cost-limit enforcement                                                                  |
| Diagnostics → Crash Data               | Yes when Sentry is configured                  | No by design | No       | Crash diagnosis; do not attach account email or prompt/body data to events                                                             |
| Diagnostics → Performance Data         | Yes when Sentry is configured                  | No by design | No       | Trace/performance diagnosis at a 0.1 sample rate                                                                                       |
| Other Data → Other Data Types          | Yes                                            | Yes          | No       | Date of birth/18+ result, consent records, one-way IP hashes, safety/block/moderation records                                          |

Answer **No** for purchases, financial information, precise or coarse location, health and fitness, address book contacts, photos/videos, audio, gameplay, advertising data, browser history, and search history. If a future SDK or feature begins collecting one of them, update the form before shipping it.

For collection purposes select **App Functionality** for every linked product field, **Analytics** only for usage/cost aggregates, and **Fraud Prevention, Security, and Compliance** for IP hashes, age/OTP controls, safety reports, blocks, and diagnostic records. Do not select advertising, third-party advertising, or product personalization for fields unless the App Store wording requires personalization for agent memories; if it does, add **Product Personalization** only to profile/memory/intents.

## Google Play Data Safety answers

Top-level answers:

- Does the app collect or share required user data? **Yes—collects.**
- Is all user data encrypted in transit? **Yes only after the app uses the deployed HTTPS/WSS domain. Do not submit while pointed at local HTTP.**
- Can users request deletion? **Yes in-app.** Google also requires an external deletion-request URL for apps with account creation; that web flow is not finished and blocks Play submission.
- Is data shared? **No under the service-provider exception**, provided Railway, Resend, Sentry, Expo, OpenRouter/model providers, and storage vendors act only as contracted processors. Re-answer **Yes** if any vendor uses data for its own purposes or the agreement does not meet Google's exception.
- Is processing optional? Google/Calendar content, push tokens, provider keys, file imports, and phone verification are optional. Email, name, date of birth, security records, and core app activity are required for an ORBIT account.
- Ephemeral processing still must be answered accurately. Gmail bodies are transmitted to ORBIT's server/model workflow but are not retained.

| Play data type                              | Collected                                                | Required?                                       | Purpose                                                                      |
| ------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Personal info → Name                        | Yes                                                      | Yes                                             | App functionality, account management                                        |
| Personal info → Email address               | Yes                                                      | Yes                                             | Authentication, security, account management                                 |
| Personal info → Phone number                | Conditional                                              | Optional                                        | Optional verification, fraud prevention                                      |
| Personal info → Other info                  | Yes                                                      | Yes                                             | Date of birth/18+ status, profile and preferences; app functionality, safety |
| Messages → Emails                           | Yes, Gmail body ephemeral; metadata/derivations retained | Optional Google feature                         | App functionality                                                            |
| Calendar → Calendar events                  | Yes                                                      | Optional Google feature                         | App functionality                                                            |
| Files and docs                              | Conditional                                              | Optional                                        | User-selected import and agent memory                                        |
| App activity → App interactions             | Yes                                                      | Yes                                             | App functionality, analytics, fraud prevention                               |
| App activity → Other user-generated content | Yes                                                      | Yes                                             | Memories, intents, watcher queries, transcripts, reports                     |
| App info and performance → Crash logs       | Conditional on Sentry                                    | Required for release diagnosis                  | Analytics                                                                    |
| App info and performance → Diagnostics      | Conditional on Sentry                                    | Required for release diagnosis                  | Analytics, security                                                          |
| Device or other IDs                         | Yes                                                      | Optional push; request ID/security IDs required | App functionality, fraud prevention                                          |

Mark data as deletable through the account-deletion flow. Mark Google tokens as deleted immediately on disconnect. Do not claim that retained safety/legal records are always deleted if the policy allows a narrow retention exception.

### Play account-deletion declaration

- In-app path: **You → Settings & model keys → Delete account → Schedule permanent deletion → Yes, schedule deletion**.
- The screen states that deletion is permanent after seven days and exposes **Cancel account deletion** during the countdown.
- API paths: `DELETE /v1/me`, `GET /v1/me/deletion`, and `POST /v1/me/deletion/cancel`.
- Deletion worker: applies the configured grace period, default seven days.
- External web deletion link: **BLOCKED**. `/support` currently gives a human contact but is not an authenticated deletion request. Build and host an email-OTP web deletion flow before Play submission.

## Age-rating answers

ORBIT itself is strictly 18+ because it processes private email/calendar context and enables adult introductions. It is not designed for children and must not be listed in a kids/family category.

### Apple

In **App Information → Age Ratings → Set Up Age Rating**, answer from the shipped build:

- User-generated content: **Yes**—profile answers, intents, reports, and model/agent transcripts.
- Messaging/chat: **No direct person-to-person chat in the current build**; agents exchange bounded assessment turns.
- Unrestricted web access: **No**—the app opens explicit source/support links in the system browser but does not provide a general web browser.
- Advertising, gambling, contests, loot boxes, simulated gambling: **No**.
- Alcohol, tobacco, drugs, weapons, sexual content, horror, profanity, violence: **None in publisher-supplied content**. User-submitted text is moderated; answer any newer questionnaire question about possible UGC conservatively.
- Medical/wellness advice: **No**.
- Select the **18+ override** where App Store Connect offers the higher-age override, and explain: “ORBIT contractually restricts accounts to adults because it connects private email/calendar context with consent-based adult introductions.”

### Google Play

In **Policy and programs → App content → Content ratings → Start**, enter the private support email, choose the non-game/social-or-lifestyle questionnaire category, disclose user-generated profile/report content, no direct chat, moderation/report/block controls, no ads, no purchases, and no publisher-supplied violence/sexual/gambling/drug content. Select the 18+ target audience in **Target audience and content**. IARC assigns territory-specific ratings; do not misstate questionnaire answers just to force a number. Record the certificate after it is issued.

## App Review notes

Paste and then replace angle-bracket placeholders:

> ORBIT is an 18+ private-agent beta. A reviewer can reach the core product in under two minutes: enter `<REVIEWER_EMAIL>`, retrieve the six-digit email code from `<REVIEWER_MAILBOX_INSTRUCTIONS>`, enter a birth date showing age 18+, complete or resume the short agent interview, name the agent, and open Today. The Google connection is optional. It requests only Gmail read-only and Calendar read-only in one consent flow. Gmail message bodies are used transiently to derive bounded Catch signals and are not retained; every Catch item links to the original Google source. ORBIT cannot send mail or edit Calendar. To test Google, use `<REVIEWER_GOOGLE_TEST_ACCOUNT>` already added under Google Auth Platform → Audience → Test users. Settings contains signed export, Google disconnect, and account deletion. The reviewer can reach Catch from Today and Circle from the bottom navigation. Contact `<PRIVATE_SUPPORT_EMAIL>` or `<REVIEW_PHONE_IN_INTERNATIONAL_FORMAT>` if access fails.

### Reviewer account preparation

Do not add a static OTP, bypass, or hardcoded reviewer account. Before review:

1. Create a real mailbox `reviewer@<owned-domain>` with a password stored only in App Store Connect/Play Console review credentials.
2. Add that mailbox as a Google OAuth test user and connect a small, non-sensitive Gmail/Calendar fixture account.
3. Create the ORBIT account through the real Resend OTP path and complete onboarding.
4. Put the mailbox login or safe OTP-retrieval instructions only in the store's private review fields—not in Git, docs committed with real credentials, issue comments, or screenshots.
5. Re-run sign-in immediately before submission. Never provide a fixed code because OTPs expire and only the newest code is accepted.

## Current rejection and scale risks

1. Google OAuth is unverified. Testing mode is capped at 100 listed test users and their grants expire after seven days; people see an unverified-app warning.
2. Railway, Resend, Sentry, EAS, and Apple are not configured from this machine. A store reviewer cannot sign in until a verified Resend sender and reachable backend exist.
3. There is no private support mailbox or owned public support/legal domain in the supplied configuration.
4. Google Play requires an external web account-deletion request flow; only the in-app flow is complete.
5. Current store-sized screenshots are derived from real light-mode web captures, not the final signed native build. Replace them after device validation.
6. Sentry source-map upload is configured but not proven by a release event.
7. Real Gmail/Calendar sync, deep-link return, two-device reveal, push, airplane-mode behavior, API-kill behavior, and signed export remain unverified on deployed physical devices.
8. The 50-account default protects budget but will stop signups before a wider release unless the founder intentionally raises it with cost monitoring.
