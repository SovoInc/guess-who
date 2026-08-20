import { defineConfig } from 'vitest/config';

// Standalone config so the unit tests run in plain Node and do not inherit the
// browser-oriented plugin chain from vite.config.ts (wasm, polyfills, react).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/__tests__/**/*.test.ts'],
    // The game logic is pure and fast; a short timeout keeps CI honest.
    testTimeout: 15_000,
  },
});
