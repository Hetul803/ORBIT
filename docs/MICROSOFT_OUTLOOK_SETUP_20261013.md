# Microsoft / Outlook setup — October 13, 2026

## Verified provider state

The founder completed Azure free-account signup himself, including private identity/payment checks and agreement review. The resulting new Default Directory shows one user, no pre-existing applications, Entra Free, and the founder's Global Administrator role. This is not the school directory. Azure's home screen showed $200 in remaining introductory credit; this credit is temporary, not a recurring operating budget.

After explicit approval of the registration action and Microsoft identity-platform Terms of Use, **ORBIT: Private Companion** was registered in that directory. The resulting application overview shows an activated app, the audience `AzureADandPersonalMicrosoftAccount`, and one Web redirect. Authentication configuration confirms the sole redirect:

`https://orbit-api-production-807e.up.railway.app/v1/connections/outlook/callback`

After the founder's subsequent explicit approval, the API-permissions table was saved and verified with exactly four **delegated** permissions: **User.Read, Mail.Read, Calendars.Read, offline_access**. No tenant-wide admin consent was granted. These declarations are not user OAuth consent, and no Microsoft mailbox or calendar has been read.

The approved “ORBIT server OAuth — founder alpha” client secret was generated with the selected **180-day** expiry and saved directly into ignored `tmp/microsoft-onboarding/outlook-client-secret.json`, mode **0600**, inside a **0700** directory. After the founder approved the scoped release, it was transferred privately to **ORBIT's Railway API only**. Its value was not printed, committed, bundled in the mobile app, copied into root `.env`, or transferred to the worker/EAS. The live API confirms credential presence without displaying its value; the worker has no Microsoft variables. Application/tenant identifiers and safe setup screenshots are recorded in the same ignored folder. The secret will need rotation before expiry; the actual expiry date still needs an operator check and no automatic rotation job is configured. Only a generated credential, not the whole provider screen, was stored.

## Configured testing versus real acceptance

Outlook connection is now **configured in the deployed closed alpha**, limited to the two previously approved ORBIT login emails and each mailbox owner's separate Microsoft consent. Backend 2f096a6 and its matching hash-verified iOS-only update implement Microsoft OAuth/PKCE, Graph read-only sync, encrypted account-bound tokens, per-account status/disconnect, Outlook source attribution, account filters and review-only drafts. **Real Outlook OAuth/sync and physical-device acceptance remain pending. Model drafts/connected-summary chat stay off until provider review and deliberate enablement.** The existing Gmail integration is separate and is not a substitute for Microsoft credentials or consent.

Mail.Read can read message contents, while offline_access permits token refresh for access already consented to; neither provides mail sending or calendar writing. No application permissions, shared-mailbox permissions, Mail.Send, calendar write, Teams, contacts, tenant administration, or directory-wide reads were added. Google scopes/credentials remain unchanged.

The full isolated regression and private-credential scans passed; the founder approved the tested release/transfer and reviewed disclosure publication. Matching policy text is live at orbitapp.world/privacy/ and the API policy used in-app. Production migrations 18–19 applied after quiesced backup. The founder must still separately review Microsoft consent on the iPhone. The durable sync runner is inside the existing **API service**, not a new Azure resource or separate paid worker. Five Google plus five Microsoft accounts are supported in the released source, with explicit provider/account provenance. This does not merge or move messages between providers. Existing signup, staffing, resource and model-spend gates are unchanged; no Azure compute resources or paid-plan upgrade were performed.

The final local lint/typecheck/formatting and full fresh isolated regression suite pass **216 tests, zero failures/skips**. The [sprint report](DAY_ONE_AGENT_20261013.md) records the actual controls, boundaries, schema risks and remaining native/provider acceptance checks; the [release record](DAY_ONE_RELEASE_20261013.md) records backup, live gates and matching iOS delivery. Connected-model processing is explicitly false in the live configuration. Passing tests, configured credentials and delivery are not proof of real Outlook access or Microsoft verification.

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
