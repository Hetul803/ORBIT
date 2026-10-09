import { describe, expect, it } from 'vitest';
import { offlineScope } from './offline-scope';

const token = (sub: string): string => `header.${btoa(JSON.stringify({ sub }))}.signature`;
describe('account-private offline namespace', () => {
  it('separates accounts and stays stable across token refresh', () => {
    expect(offlineScope(token('user-alpha-123'))).toBe('user-alpha-123');
    expect(offlineScope(token('user-beta-123'))).not.toBe(offlineScope(token('user-alpha-123')));
    expect(offlineScope(`${token('user-alpha-123')}changed`)).toBe('user-alpha-123');
  });
  it('cannot read an authenticated cache while signed out or with malformed identity', () => {
    expect(offlineScope(null)).toBeNull();
    expect(offlineScope('malformed')).toBeNull();
    expect(offlineScope(token('../another-user'))).toBeNull();
  });
});
