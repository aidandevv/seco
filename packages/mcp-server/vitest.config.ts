import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@seco/core': join(__dirname, '../core/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
  },
});
