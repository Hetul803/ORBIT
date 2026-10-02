import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^react-native$/u,
        replacement: fileURLToPath(
          new URL('./node_modules/react-native-web/dist/index.js', import.meta.url),
        ),
      },
      {
        find: /^react-native-svg$/u,
        replacement: fileURLToPath(new URL('./tests/react-native-svg.tsx', import.meta.url)),
      },
      {
        find: /^react-native-safe-area-context$/u,
        replacement: fileURLToPath(new URL('./tests/safe-area.tsx', import.meta.url)),
      },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.tsx', 'tests/**/*.test.ts'],
    globals: true,
    css: false,
    env: { EXPO_PUBLIC_API_URL: 'http://localhost:4100' },
  },
  root,
});
