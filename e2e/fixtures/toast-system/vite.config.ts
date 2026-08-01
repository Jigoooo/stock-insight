import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

export default defineConfig({
  cacheDir: resolve(repoRoot, 'node_modules/.vite/toast-system', String(process.pid)),
  root: fileURLToPath(new URL('./', import.meta.url)),
  resolve: {
    alias: {
      '@': `${repoRoot}apps/web/src`,
      react: `${repoRoot}apps/web/node_modules/react`,
      'react-dom': `${repoRoot}apps/web/node_modules/react-dom`,
    },
  },
  server: {
    fs: { allow: [repoRoot] },
  },
});
