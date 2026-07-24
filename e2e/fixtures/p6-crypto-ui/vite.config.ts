import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

import react from '../../../apps/web/node_modules/@vitejs/plugin-react/dist/index.js';

const fixtureRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(fixtureRoot, '../../..');
const webNodeModules = resolve(repositoryRoot, 'apps/web/node_modules');

export default defineConfig({
  root: fixtureRoot,
  plugins: [react()],
  publicDir: resolve(repositoryRoot, 'apps/web/public'),
  resolve: {
    alias: [
      {
        find: '@stock-insight/contracts/crypto-research',
        replacement: resolve(repositoryRoot, 'packages/contracts/src/crypto-research.ts'),
      },
      { find: '@', replacement: resolve(repositoryRoot, 'apps/web/src') },
      { find: /^react$/, replacement: resolve(webNodeModules, 'react/index.js') },
      { find: /^react\/(.*)$/, replacement: `${resolve(webNodeModules, 'react')}/$1` },
      { find: /^react-dom$/, replacement: resolve(webNodeModules, 'react-dom/index.js') },
      { find: /^react-dom\/(.*)$/, replacement: `${resolve(webNodeModules, 'react-dom')}/$1` },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 0,
    strictPort: false,
    fs: { allow: [repositoryRoot] },
  },
});
