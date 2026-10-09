import { describe, expect, it } from 'vitest';

import { scrubTelemetryEvent } from './telemetry.js';

describe('private release diagnostics', () => {
  it('removes secret-bearing context while retaining source frames and request IDs', () => {
    const sensitive = 'person@example.test token-123456 message-body';
    const event = scrubTelemetryEvent({
      user: { email: sensitive },
      request: { url: `/callback?code=${sensitive}`, data: sensitive },
      extra: { prompt: sensitive },
      contexts: { custom: sensitive },
      breadcrumbs: [{ message: sensitive }],
      message: sensitive,
      logentry: { formatted: sensitive },
      transaction: '/callback?code=token-123456',
      exception: {
        values: [
          {
            value: sensitive,
            stacktrace: { frames: [{ filename: 'app.ts', vars: { sensitive } }] },
          },
        ],
      },
      spans: [{ data: { body: sensitive }, description: sensitive }],
      tags: { requestId: 'generated-request-id', accountEmail: sensitive },
    });
    expect(JSON.stringify(event)).not.toContain(sensitive);
    expect(JSON.stringify(event)).not.toContain('token-123456');
    expect(event.tags.requestId).toBe('generated-request-id');
    expect(event.exception.values[0]?.stacktrace.frames[0]?.filename).toBe('app.ts');
  });
});
