import { describe, expect, it } from 'vitest';

import { isOfflineQueueable, isOfflineReadable } from './offline-policy.js';

describe('offline transport contract', () => {
  it('allows cached reads only for defined presentation screens', () => {
    expect(isOfflineReadable('/v1/brief/today', 'GET')).toBe(true);
    expect(isOfflineReadable('/v1/life/catch', 'GET')).toBe(true);
    expect(isOfflineReadable('/v1/profile/export', 'GET')).toBe(false);
    expect(isOfflineReadable('/v1/life/catch', 'POST')).toBe(false);
  });

  it('queues only reversible local choices and never sends or schedules externally', () => {
    expect(isOfflineQueueable('/v1/life/catch/record-123/dismiss', 'POST')).toBe(true);
    expect(isOfflineQueueable('/v1/proactive/record-123/respond', 'POST')).toBe(true);
    expect(isOfflineQueueable('/v1/inbox/record-123/approve', 'POST')).toBe(false);
    expect(isOfflineQueueable('/v1/connections/google/calendar', 'POST')).toBe(false);
  });
});
