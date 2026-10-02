# ORBIT provider setup and 100-user cost model

Pricing checked: 2026-10-02 (USD, before tax). Provider prices change; verify each linked pricing page again before purchasing. This document separates credentials the current code actually reads from services that are optional.

## Bottom line

For a 100-monthly-active-user private beta, budget **about $65–$150 per month**, or **$0.65–$1.50 per monthly active user**, under the usage assumptions below. The lean end uses one region, non-HA pilot infrastructure, GPT-5.6 Luna for all routine work, free email/push/monitoring tiers, and limited search watchers. The upper end uses a Luna/Terra model mix, Expo's Starter plan, and more infrastructure headroom.

That estimate does **not** include taxes, founder/developer time, advertising, legal work, high availability, customer support, or a Google restricted-scope security assessment. The last item is a material unknown: ORBIT's optional Gmail feature requests `gmail.readonly`, and Google says server-side apps using restricted data may need annual assessment by an approved third party. Keep Gmail invite-only and disabled by default until that review path and its quoted cost are acceptable.

ORBIT can be tested locally with no paid provider keys. Direct-URL/RSS/JSON watchers, the bounded onboarding sequence, memory, intents, skills, exchange, safety, receipts, export, and the local web UI still work. Real LLM behavior, real embeddings, production OTP, Gmail, search-query watchers, native push, and production monitoring need the accounts below.

## Credentials to obtain

### Required for the recommended 100-user beta

| Provider/account    | What to obtain                                                                                                                        | ORBIT variables                                                                                                                                    | Purpose                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI API Platform | A project-scoped secret API key with a billing limit                                                                                  | `OPENAI_API_KEY`, `OPENAI_EMBEDDING_MODEL`, `LLM_DEFAULT_PROVIDER`, all `LLM_MODEL_*` values, and model-cost variables                             | Adaptive interview, agent conversations, reranking, judging, drafting, redaction, skill work, Ask routing, and real 1,536-dimension memory embeddings |
| Resend              | API key plus a verified sending domain/address                                                                                        | `OTP_DELIVERY_MODE=resend`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                                                                                  | Production email OTP                                                                                                                                  |
| Twilio              | Account SID, auth token, one SMS-capable number, and US A2P registration where applicable                                             | `PHONE_OTP_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_PHONE`                                                        | Phone verification OTP; ORBIT uses Programmable Messaging, not Twilio Verify                                                                          |
| Google Cloud        | Production OAuth web client ID/secret, enabled Gmail API, verified consent screen/domain, and approved `gmail.readonly` access        | `GMAIL_INTEGRATION_ENABLED=true`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `ORBIT_MOBILE_REDIRECT_URL` | Optional read-only Gmail triage. No generic Google API key is used for this path                                                                      |
| Brave Search API    | Search subscription token                                                                                                             | `SEARCH_API_ENDPOINT`, `SEARCH_API_KEY`                                                                                                            | Natural-language search watchers without a direct source URL. Direct URL/feed watchers do not need it                                                 |
| Expo/EAS            | Expo account and EAS project UUID                                                                                                     | `EXPO_PUBLIC_EAS_PROJECT_ID`                                                                                                                       | Native Expo push-token attribution and cloud builds                                                                                                   |
| Sentry              | DSN for the API and worker projects                                                                                                   | `SENTRY_DSN`, `SENTRY_ENVIRONMENT`                                                                                                                 | Error reporting                                                                                                                                       |
| Hosting/data        | TLS PostgreSQL 16 with pgvector, TLS Redis, Linux/Docker host, DNS, and an AWS IAM identity or instance role that can read one secret | `DATABASE_URL`, `REDIS_URL`, `STAGING_DOMAIN`, `ORBIT_STAGING_SECRET_ID`                                                                           | Production runtime and the included private-staging deploy script                                                                                     |

Only one LLM generation provider is required. The router also supports Anthropic (`ANTHROPIC_API_KEY`) and Google Generative AI (`GOOGLE_GENERATIVE_AI_API_KEY`), but do not buy or configure all three for the initial beta. OpenAI is the simplest initial choice because the current real-vector implementation already requires `OPENAI_API_KEY` for embeddings.

### Generated secrets, not purchased API keys

Generate separate production values for:

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `FIELD_ENCRYPTION_KEY` — exactly 32 random bytes encoded as base64
- `EXPORT_SIGNING_SECRET`

Store them in the secret manager, never in the repository or a mobile `EXPO_PUBLIC_*` variable. Rotate staging and production independently.

### Native distribution credentials

These are not server API keys, but are required before store release:

- Apple Developer organization membership and APNs signing credentials. Apple lists membership at [$99 per year](https://developer.apple.com/programs/enroll/).
- Google/Android full distribution account and FCM v1 service-account credentials. Google lists the registration fee at [$25 one time](https://support.google.com/android-developer-console/answer/16604405?hl=en).
- iOS distribution certificates/profiles and Android app-signing key. Prefer EAS-managed credentials, with the account owner retaining recovery access.

## Recommended OpenAI beta profile

Start every generation task on `gpt-5.6-luna`, then move only measured quality bottlenecks—usually `judge` or `rerank`—to `gpt-5.6-terra`. OpenAI describes Luna as its efficient high-volume tier and lists **$0.20 per million input tokens / $1.20 per million output tokens**; Terra is **$2 / $12**. The vector path uses `text-embedding-3-small` at **$0.02 per million input tokens**. See the official [model catalog](https://developers.openai.com/api/docs/models), [Terra model page](https://developers.openai.com/api/docs/models/gpt-5.6-terra), and [embedding model page](https://developers.openai.com/api/docs/models/text-embedding-3-small).

Use this starting configuration in the server secret, not in the mobile bundle:

```dotenv
LLM_DEFAULT_PROVIDER=openai
OPENAI_API_KEY=sk-project-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

LLM_MODEL_INTERVIEW=gpt-5.6-luna
LLM_MODEL_CONVERSATION=gpt-5.6-luna
LLM_MODEL_RERANK=gpt-5.6-luna
LLM_MODEL_JUDGE=gpt-5.6-luna
LLM_MODEL_DRAFT=gpt-5.6-luna
LLM_MODEL_REDACTION=gpt-5.6-luna
LLM_MODEL_EMBEDDING=gpt-5.6-luna
LLM_MODEL_SKILL_CRYSTALLIZATION=gpt-5.6-luna
LLM_MODEL_SKILL_VALIDATION=gpt-5.6-luna
LLM_MODEL_ASK_ROUTING=gpt-5.6-luna
LLM_CHEAP_FALLBACK_MODEL=stub-fallback-v1

# Cents per one million tokens: $0.20 input and $1.20 output.
LLM_INPUT_COST_CENTS_PER_MILLION_TOKENS=20
LLM_OUTPUT_COST_CENTS_PER_MILLION_TOKENS=120

USER_DAILY_COST_CAP_CENTS=35
GLOBAL_DAILY_COST_CAP_CENTS=500
```

The code fails startup for a paid provider when pricing metadata is absent or invalid. This prevents a real call from being recorded as free and makes the admin cost ledger and caps auditable. If `judge` later moves to Terra, configure both its model and its rate:

```dotenv
LLM_MODEL_JUDGE=gpt-5.6-terra
LLM_COST_JUDGE_INPUT_CENTS_PER_MILLION_TOKENS=200
LLM_COST_JUDGE_OUTPUT_CENTS_PER_MILLION_TOKENS=1200
```

The proposed beta global cap of 500 cents/day bounds recorded model spend near $150 in a 30-day month. The repository's current example default is 2,500 cents/day, a $750/month ceiling; that is a safety ceiling, not an expected bill. Provider dashboards should have their own independent monthly hard limit and alert.

## 100-user monthly estimate

Assumptions:

- 100 monthly active users, roughly 20 active days each.
- 30 million uncached LLM input tokens and 5 million output tokens in total. This is intentionally more than a lightweight onboarding-only cohort and covers recurring Ask, matching, reranking, drafting, and skill work.
- 10 million embedding input tokens.
- 200 email OTP messages.
- 100 one-segment US phone verification messages.
- 3,000 Brave search requests; direct-source watcher fetches are not billable API searches.
- Each Gmail-connected user performs two last-10-message syncs per day.
- One small private region, no multi-region failover, and modest database storage.

| Component                                               | Calculation                                                                                                             |                              Estimated monthly cost |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------: |
| API, worker, PostgreSQL/pgvector, Redis, storage/egress | Small pilot compute using current usage-based host pricing; exact cost depends on CPU duty cycle and database plan      |                                         **$40–$80** |
| OpenAI generation — all Luna                            | 30M input × $0.20 + 5M output × $1.20                                                                                   |                                          **$12.00** |
| OpenAI generation — 80% Luna / 20% Terra alternative    | 24M/4M Luna plus 6M/1M Terra                                                                                            |                                          **$33.60** |
| OpenAI embeddings                                       | 10M × $0.02                                                                                                             |                                           **$0.20** |
| Resend email OTP                                        | 200 emails; the free tier currently includes 3,000/month and 100/day                                                    |                                              **$0** |
| Twilio phone OTP                                        | 100 × $0.0083, plus roughly $0.0035–$0.005 carrier fee, plus a $1.15 US long-code number                                | **about $2.33–$2.48**, before A2P registration fees |
| Brave Search                                            | 3,000 × $5/1,000, less the advertised $5 monthly credit                                                                 |                                             **$10** |
| Gmail API                                               | About 41,000 quota units/day under these assumptions, below Google's published 80M daily no-additional-charge threshold |                                    **$0 API usage** |
| Expo push                                               | Expo states its push service has no sending charge                                                                      |                                              **$0** |
| Expo EAS builds                                         | Free if quotas suffice; optional Starter plan                                                                           |                                       **$0 or $19** |
| Sentry                                                  | Developer/free plan for the initial pilot, subject to event quotas                                                      |                                              **$0** |
| AWS Secrets Manager                                     | One JSON secret at $0.40/month plus negligible calls at $0.05/10,000                                                    |                                     **about $0.40** |
| Domain/object storage/miscellaneous                     | Small allowance; domain pricing varies                                                                                  |                                           **$1–$5** |
| **Expected total**                                      | Luna-only to Luna/Terra + EAS upper case                                                                                |                            **about $65–$150/month** |

Reference pricing: [Resend](https://resend.com/pricing), [Twilio US SMS](https://www.twilio.com/en-us/sms/pricing/us), [Brave Search API](https://brave.com/search/api/), [Gmail quotas and pricing](https://developers.google.com/workspace/gmail/api/reference/quota), [Expo push](https://docs.expo.dev/push-notifications/faq/), [Expo plans](https://docs.expo.dev/billing/plans/), [Railway usage pricing](https://docs.railway.com/pricing/plans), and [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/pricing/).

### Important cost risks

1. **Gmail verification can dominate the budget.** Google classifies broad mailbox access as restricted. A public server-side integration can require verification and an annual third-party security assessment; Google does not publish the assessor's quote on the referenced pages. See [restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) and [security assessment](https://support.google.com/cloud/answer/13465431?hl=en). Do not include Gmail in public-launch promises until this is scoped and quoted.
2. **SMS compliance has fixed fees.** Twilio passes through carrier fees and US A2P onboarding/registration charges. Email-only sign-in is cheaper; keep phone verification optional until it materially improves trust or abuse resistance.
3. **Watcher frequency multiplies search cost.** A direct URL, RSS, Atom, JSON, or HTML watcher costs hosting bandwidth but no Brave request. Search-query watchers cost $5 per 1,000 calls. Default to direct sources and slower schedules.
4. **Model output is the expensive side.** Keep structured responses short, cache stable prefixes, use Luna for routine tasks, and send Terra only the compact candidate/evidence set that needs stronger judgment.
5. **High availability is not in the pilot number.** Multi-zone databases, replicas, continuous backups, paid support, and redundant app instances can move the infrastructure line to $150–$350/month even at 100 users. That is appropriate after retention is demonstrated, not before.

## Provider setup order

1. Create a company-owned domain, shared billing email, password manager, and separate staging/production provider projects.
2. Provision PostgreSQL/pgvector, Redis, the Docker host, DNS, TLS, backup policy, and the one AWS Secrets Manager JSON object.
3. Create an OpenAI project key, set a provider-side monthly budget/alerts, apply the Luna profile above, and verify the live interview, embeddings, reranker, and admin ledger.
4. Verify the sending domain in Resend, configure SPF/DKIM/DMARC, send email OTPs to multiple providers, and monitor bounces.
5. Lease the Twilio number, complete applicable A2P registration, and test successful, delayed, invalid, and rate-limited phone OTP paths.
6. Create separate Google Cloud staging and production projects. Enable Gmail API, set the exact HTTPS callback, publish the home/privacy/deletion pages, add only the `gmail.readonly` scope, and keep the feature flag off until approval.
7. Create a Brave Search subscription token and test search, rate-limit, empty, robots, and timeout behavior. Direct watchers should remain the default.
8. Create the Expo/EAS project, set its UUID in preview/production builds, configure APNs and FCM v1 credentials, then run the full physical-device push matrix.
9. Create Sentry projects for API and worker, scrub user content, set alert ownership, and test a synthetic exception before the pilot.
10. Enroll the company—not an employee's personal identity where avoidable—in Apple and Android distribution, complete store privacy declarations, and retain recovery credentials.

## What ORBIT does not currently need

- No Stripe key: exchange ends in a consented handoff and explicitly does not move money.
- No Google Maps key: there is no map product surface.
- No Twilio Verify service SID: the implemented adapter sends OTP text through Programmable Messaging.
- No separate vector database: pgvector runs inside PostgreSQL.
- No OpenAI key in the mobile app: every model/embedding call is server-side.
- No key for Expo's push HTTP endpoint: the client needs the EAS project UUID and native APNs/FCM credentials; the worker sends Expo push tokens through the Expo service.

## How to replace estimates with real unit economics

For the first two weeks of the invite-only cohort, review `/v1/admin/costs` daily and export provider usage. Record active users, generation input/output tokens, embeddings, watcher fetches/searches, email/SMS sends, push receipts, and infrastructure CPU/RAM. Then calculate:

```text
monthly variable cost per active user
  = (LLM + embeddings + search + email + SMS + incremental infrastructure) / MAU
```

Keep fixed pilot infrastructure separate so a one-user product is not mistaken for a bad variable-margin business. At 100 users, the expected variable provider cost in this model is roughly $0.25–$0.60/user/month; the rest is mostly the small always-on platform. The initial pricing decision should be based on observed 30-day retention and real usage, not this planning estimate alone.
