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
  <p class="date">Effective October 11, 2026</p>
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
