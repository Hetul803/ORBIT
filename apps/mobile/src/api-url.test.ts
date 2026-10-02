import { describe, expect, it } from 'vitest';

import { resolveApiUrl } from './api-url.js';

describe('API base URL resolution', () => {
  it('always gives the explicit configuration highest priority', () => {
    expect(
      resolveApiUrl({
        configured: 'https://staging-api.orbit.example/',
        platform: 'android',
        physicalDevice: true,
        production: true,
      }),
    ).toBe('https://staging-api.orbit.example');
  });

  it('uses correct development defaults for web and both simulators', () => {
    expect(resolveApiUrl({ platform: 'web', physicalDevice: false, production: false })).toBe(
      'http://localhost:4100',
    );
    expect(resolveApiUrl({ platform: 'ios', physicalDevice: false, production: false })).toBe(
      'http://localhost:4100',
    );
    expect(resolveApiUrl({ platform: 'android', physicalDevice: false, production: false })).toBe(
      'http://10.0.2.2:4100',
    );
  });

  it('derives the LAN host for a physical Expo device and fails closed without one', () => {
    expect(
      resolveApiUrl({
        platform: 'ios',
        physicalDevice: true,
        developmentHost: '192.168.1.40:8081',
        production: false,
      }),
    ).toBe('http://192.168.1.40:4100');
    expect(resolveApiUrl({ platform: 'ios', physicalDevice: true, production: false })).toBe('');
  });

  it('requires explicit configuration in production', () => {
    expect(resolveApiUrl({ platform: 'web', physicalDevice: false, production: true })).toBe('');
  });
});
