import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@bro-pics/shared': path.resolve(__dirname, '../packages/shared/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/lib/**'],
  },
});
