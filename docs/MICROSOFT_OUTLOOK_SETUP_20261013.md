# Microsoft / Outlook setup — October 13, 2026

## Verified provider state

The founder completed Azure free-account signup himself, including private identity/payment checks and agreement review. The resulting new Default Directory shows one user, no pre-existing applications, Entra Free, and the founder's Global Administrator role. This is not the school directory. Azure's home screen showed $200 in remaining introductory credit; this credit is temporary, not a recurring operating budget.

After explicit approval of the registration action and Microsoft identity-platform Terms of Use, **ORBIT: Private Companion** was registered in that directory. The resulting application overview shows an activated app, the audience `AzureADandPersonalMicrosoftAccount`, and one Web redirect. Authentication configuration confirms the sole redirect:

`https://orbit-api-production-807e.up.railway.app/v1/connections/outlook/callback`

After the founder's subsequent explicit approval, the API-permissions table was saved and verified with exactly four **delegated** permissions: **User.Read, Mail.Read, Calendars.Read, offline_access**. No tenant-wide admin consent was granted. These declarations are not user OAuth consent, and no Microsoft mailbox or calendar has been read.

The approved “ORBIT server OAuth — founder alpha” client secret was generated with the selected **180-day** expiry and saved directly into ignored `tmp/microsoft-onboarding/outlook-client-secret.json`, mode **0600**, inside a **0700** directory. Its value was not printed, committed, bundled in the mobile app, copied into `.env`, or transferred to Railway/EAS. Application/tenant identifiers and safe setup screenshots are recorded in the same ignored folder. The secret will need rotation before expiry; no automatic rotation job has been configured. Only a generated credential, not the whole provider screen, was stored.

## What is not working yet

Outlook connection is **not available in the deployed ORBIT app**. Local source now implements Microsoft OAuth/PKCE, Graph read-only sync, encrypted account-bound tokens, per-account status/disconnect, Outlook source attribution, account filters and review-only drafts. Source implementation is not deployment or real-provider acceptance. No live Outlook connect/sync/draft/device acceptance test has passed. The existing Gmail integration is separate and is not a substitute for Microsoft credentials or consent.

Mail.Read can read message contents, while offline_access permits token refresh for access already consented to; neither provides mail sending or calendar writing. No application permissions, shared-mailbox permissions, Mail.Send, calendar write, Teams, contacts, tenant administration, or directory-wide reads were added. Google scopes/credentials remain unchanged.

Before enabling Outlook, the new local code and migrations must pass the full isolated regression/credential scan, privacy disclosures and provider data controls must be reviewed, a tested release and private credential transfer must be approved, and the founder must separately review Microsoft consent on the iPhone. The durable sync runner is inside the existing **API service**, not a new Azure resource or separate paid worker. Five Google plus five Microsoft accounts are supported locally, with explicit provider/account provenance. This does not merge or move messages between providers. Existing signup, staffing, resource and model-spend gates are unchanged; no Azure compute resources or paid-plan upgrade were performed.

The final local lint/typecheck and full fresh isolated regression suite now pass **216 tests, zero failures/skips**. The [sprint report](DAY_ONE_AGENT_20261013.md) records the actual controls, boundaries, schema risks and remaining native/provider acceptance checks. New connected-model processing remains default off through `ACCOUNT_MODEL_CONTEXT_ENABLED`; the Microsoft credential remains local-only despite passing tests. That test result is not approval to deploy or proof of real Outlook access.

## Public-release caveat

The application overview displays Microsoft's warning about unverified publishers for new multitenant apps. Account-type support in registration does not guarantee organizational users can consent. Microsoft describes risk-based restrictions on new, unverified multitenant apps requesting more than basic sign-in/profile outside their home tenant. Organization policy may require administrator approval; this setup does not change or bypass it. Personal Microsoft account consent is a separate supported delegated-access scenario, still untested in ORBIT.

Publisher/domain verification, the appropriate organizational identity and Microsoft Partner verification requirements need further review before promising broad Microsoft 365 availability. A configured publisher domain alone is not a verified-publisher badge. ORBIT is not being represented as Microsoft-verified or public-launch-ready.

## Primary references

- [Register an application](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)
- [Microsoft identity-platform Terms of Use](https://learn.microsoft.com/en-us/legal/microsoft-identity-platform/terms-of-use)
- [Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference)
- [Delegated-access model](https://learn.microsoft.com/en-us/entra/identity-platform/delegated-access-primer)
- [Publisher verification and restrictions](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)
- [Azure introductory credit and account options](https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account)
