import '@testing-library/jest-dom/vitest';

import { vi } from 'vitest';

vi.mock('expo-router', () => ({
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    navigate: vi.fn(),
    canGoBack: vi.fn(() => true),
  },
  useLocalSearchParams: () => ({ id: 'record-12345678' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSegments: () => [],
  usePathname: vi.fn(() => '/connections'),
  Stack: () => null,
  Tabs: () => null,
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});
