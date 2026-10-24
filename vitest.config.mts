import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  // [G] Generous timeouts: several suites take 3-4 s on an idle machine and flaked at the 5 s default under load.
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 60_000, hookTimeout: 60_000 },
});
