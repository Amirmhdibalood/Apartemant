import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/** Slow stress suite (excluded from `npm test`). */
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    include: ['tests/stress/**/*.stress.ts'],
    environment: 'node',
    setupFiles: ['tests/setup-idb.ts'],
    testTimeout: 30 * 60_000,
    fileParallelism: false,
  },
});
