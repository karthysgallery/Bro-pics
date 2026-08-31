import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The `server-only` marker package throws when imported outside
      // Next's RSC webpack layer (which swaps it for a no-op via the
      // "react-server" export condition). Vitest has no such condition, so
      // alias it directly to the package's own no-op module.
      'server-only': fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
