import type { FastifyInstance } from 'fastify';
import type { ApiConfig } from '../config.js';

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/gu,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
const contact = (config: ApiConfig): string =>
  config.SUPPORT_EMAIL.length > 0
    ? `<p>Contact <a href="mailto:${encodeURIComponent(config.SUPPORT_EMAIL)}">${escapeHtml(config.SUPPORT_EMAIL)}</a> for private account and support matters. Never share sign-in codes or provider keys. Signed-in users can report from the Safety center.</p>`
    : '<p>A monitored private support mailbox is not configured. This environment is not ready for public enrollment. Never post account, report or Gmail content in public issues.</p>';

const page = (title: string, body: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} · ORBIT</title>
    <style>
      :root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; color: #171712; background: #f7f5f0; }
      body { margin: 0 auto; max-width: 48rem; padding: 3rem 1.25rem 5rem; line-height: 1.65; }
      h1, h2 { font-family: Georgia, serif; line-height: 1.15; }
      h1 { font-size: clamp(2.2rem, 8vw, 4rem); margin-bottom: .25rem; }
      h2 { margin-top: 2rem; }
      a { color: #315949; }
      .date { color: #66665c; }
    </style>
  </head>
  <body>${body}</body>
</html>`;

const privacyBody = `
  <h1>Privacy Policy</h1>
  <p class="date">Effective October 13, 2026</p>
  <p>ORBIT is a private companion that helps a person remember commitments, review their own life, and discover introductions through a user-controlled agent.</p>
  <h2>What ORBIT collects</h2>
  <p>ORBIT stores account email, date of birth for the 18+ gate, profile and interview answers, agent memories, intents, introductions, safety actions, product activity, device push tokens, and security records such as one-way IP hashes. It records model usage and request identifiers without intentionally recording credentials or message bodies in logs.</p>
  <h2>Google data</h2>
  <p>With permission, ORBIT reads Gmail and the primary Google Calendar using read-only scopes. For Gmail it reads message identifiers, thread identifiers, sender, recipients, subject, date, labels, and message text in memory while deriving bounded signals such as whether a reply may be needed, a stated commitment, a date mention, or a renewal mention. Gmail message bodies are not retained. ORBIT stores those derived signals and a source link. For Calendar it stores an event identifier, title, time, status, source link, and description so the Catch can show the event and open the original.</p>
  <h2>Models and sharing</h2>
  <p>ORBIT sends the minimum prompt needed for a requested agent task to the configured model provider. ORBIT does not use private user data to train a shared model. Provider processing remains subject to the provider's terms. ORBIT does not sell personal information.</p>
  <h2>Control, export, and deletion</h2>
  <p>A person can disconnect Google, remove memories, export a signed profile archive, and request account deletion in Settings. Account deletion has a seven-day cancellation period, after which the deletion worker removes the account and associated data. Some security or legal records may be retained only when required by law.</p>
  <h2>Reports, blocks and the waitlist</h2>
  <p>A reported conversation is suppressed for both participants before review. Authorized staff can review privacy-cleared text; views and decisions are audited. Resend and Expo receive generic operator alerts without report text or participant identities. Provider acceptance is not proof of device delivery or human acknowledgement. Blocks are immediate, bidirectional and permanent for the two accounts, without an unblock option. They cannot recall copied data or prevent a new identity.</p>
  <p>The verified-email waitlist stores an email and join time only after explicit consent. It creates no account or reservation and sends no automatic invitation or marketing. Verify your email again to remove an expired-session entry. Google token expiry, visible reconnect prompts, reconnect starts and successes are measured separately from ordinary retention.</p>
<h2>Separate connected accounts</h2>
<p>Google and Microsoft connections are optional and separately authorized. Each imported email or calendar event retains its provider and connected-account identity. ORBIT can show an all-accounts view or one-account view without copying messages or events between providers. Disconnecting an account erases ORBIT's token and stops showing its linked sources and follow-ups. Other accounts remain connected. For Microsoft, revoke the underlying app grant separately in Microsoft's account controls; local disconnect is not tenant-wide sign-out.</p>
<h2>Microsoft mail and calendar</h2>
<p>ORBIT requests delegated User.Read, Mail.Read, Calendars.Read and offline_access only. These identify the consenting mailbox, read that mailbox's email/calendar and refresh already-authorized access. ORBIT does not request mail sending, calendar writing, shared mailboxes or tenant-wide application access. A Microsoft organization can restrict consent; ORBIT does not bypass that policy.</p>
<p>Imports are bounded snapshots: up to 2,500 examined emails from the last 90 days per account and up to 250 events from the default calendar over the next 14 days. Microsoft email bodies are processed transiently for small follow-up/category signals, not retained as full bodies. Stored records include headers, account identity, source links and derived signals. Microsoft event descriptions are not retained. Google Calendar behavior remains as disclosed in the existing policy, including stored event descriptions. Categories are clues, not a guarantee that every important item was found.</p>
<h2>Optional account-aware model use</h2>
<p>After a separate in-app review, account-aware chat sends a small selected set of synced email headers/follow-up labels and calendar titles/times, including account provenance, to ORBIT's reasoning provider. It does not send full email bodies for chat. Recent consented conversation turns, reviewed voice examples and saved memories may accompany the request. This is a partial snapshot, not unrestricted live mailbox access.</p>
<p>When the owner explicitly chooses <strong>Allow email context and prepare draft</strong>, ORBIT fetches only the selected account's original supported text email, sends at most 8,000 characters plus the reviewed writing style and account identity to the reasoning provider, and saves the resulting draft for owner review. The original body is not persisted by ORBIT. Drafts may themselves contain information from the email and are retained until affected data is deleted. ORBIT never sends these emails or changes calendar events. Copying a draft is not sending; marking it reviewed only saves a review receipt.</p>
<p>Connected-model use is <strong>default off outside synthetic tests</strong> through <code>ACCOUNT_MODEL_CONTEXT_ENABLED=false</code>. The operator must review the published disclosures and OpenRouter input/output logging, product-data opt-ins and relevant provider processing terms before enabling it. Requests enforce no-provider-data-collection and ZDR routing and do not fall back to unsupported providers. Those request controls are not proof of account-level logging settings or independent legal compliance. OpenRouter's documented anonymous categorization and its metadata processing must also be reviewed, rather than promising that no processing occurs anywhere.</p>
<h2>Local calendar reminders</h2>
<p>Optional device reminders use the latest synced calendar snapshot, with OS notification permission and a separate in-app opt-in. Up to 20 timed events are scheduled 10 minutes beforehand; all-day and legacy events with unknown timing are excluded. Notifications use generic wording without event titles on the lock screen. Opening ORBIT after calendar changes refreshes the schedule. Account disconnection clears only that account's ORBIT reminders; logout clears ORBIT calendar reminders. Device delivery is subject to OS settings and has not yet been physically verified for this release.</p>
<h2>No automatic access to private phone messaging</h2>
<p>ORBIT does not read iPhone Messages or a WhatsApp inbox automatically. Voice learning uses messages the owner explicitly selects or imports, reviews and confirms as their own. Reading connected mail does not automatically add other people's private messages to a shared persona, matching profile or model-training corpus. The agent remains an assistant with limited supplied context, not the person or AGI.</p>
  <h2>Contact a human</h2>`;

const termsBody = `
  <h1>Terms of Service</h1>
  <p class="date">Effective October 11, 2026</p>
  <p>These terms govern the ORBIT limited beta. By using ORBIT, you agree to them.</p>
  <h2>Eligibility and account</h2>
  <p>You must be at least 18 years old and provide accurate account information. You are responsible for access to your email account and device. Do not share sign-in codes.</p>
  <h2>What ORBIT provides</h2>
  <p>ORBIT uses software and model providers to organize user-supplied information, surface possible tasks, draft text, and suggest introductions. Outputs may be incomplete or wrong. Verify important dates, facts, drafts, and decisions. ORBIT is not medical, legal, financial, or emergency advice.</p>
  <h2>Google access and acceptable use</h2>
  <p>Google access is optional, read-only, and may be disconnected at any time. Do not use ORBIT to harm, stalk, impersonate, discriminate against, or deceive another person; to upload unlawful material; or to probe or overload the service. Safety reports, blocks, and moderation decisions may restrict access.</p>
  <h2>Beta availability</h2>
  <p>The alpha has a server-side limit of 100 non-deleted accounts, including staff, suspended and pending-deletion accounts. Admission may pause for safety coverage or provider failure. Joining the waitlist does not reserve a place or promise an invitation date. Google testing access is limited to named users and may require reconnection. No promise is made that an introduction, Catch item, or model output will be available or suitable.</p>
  <h2>Your content and termination</h2>
  <p>You retain rights to your content and grant ORBIT permission to process it only to provide and protect the service. You may export data and request deletion in Settings. ORBIT may suspend access for abuse, safety risk, legal requirements, or threats to the service.</p>
  <h2>Safety choices</h2>
  <p>A reported conversation stays hidden even after review. Blocks have no expiry or user-facing reversal for the two accounts. ORBIT is not an emergency response service; contact local emergency services for immediate danger.</p>
  <h2>Contact</h2>`;

export const registerLegalRoutes = (app: FastifyInstance, config: ApiConfig): void => {
  app.get('/privacy', (_request, reply) =>
    reply
      .type('text/html; charset=utf-8')
      .send(page('Privacy Policy', privacyBody + contact(config))),
  );
  app.get('/terms', (_request, reply) =>
    reply
      .type('text/html; charset=utf-8')
      .send(page('Terms of Service', termsBody + contact(config))),
  );
  app.get('/support', (_request, reply) =>
    reply
      .type('text/html; charset=utf-8')
      .send(
        page(
          'Support',
          '<h1>ORBIT Support</h1>' +
            contact(config) +
            '<p>In-app deletion: Settings → Delete account. It has a seven-day cancellation period. A public unauthenticated deletion-request service is not implemented. ORBIT is not an emergency response service.</p>',
        ),
      ),
  );
};
