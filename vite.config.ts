import babel from '@rolldown/plugin-babel';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig, loadEnv } from 'vite';

import { resolveDevServerPort } from './config/dev-server';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const isPlaywrightE2E = process.env.PLAYWRIGHT_E2E === '1';

  return {
    server: {
      host: '0.0.0.0',
      port: resolveDevServerPort(env.VITE_PORT),
      open: true,
      watch: isPlaywrightE2E
        ? {
            ignored: [
              '**/.git/**',
              '**/.omx/**',
              '**/.output/**',
              '**/.tanstack/**',
              '**/dist/**',
              '**/dist-ssr/**',
              '**/node_modules/**',
              '**/playwright-report/**',
              '**/test-results/**',
            ],
            interval: 500,
            usePolling: true,
          }
        : undefined,
    },
    plugins: [
      tanstackStart(),
      nitro(),
      react(),
      babel({
        include: /\.[jt]sx?$/,
        exclude: [/node_modules/, /\.generated\.ts$/],
        presets: [reactCompilerPreset()],
      }),
    ],
    resolve: {
      tsconfigPaths: true,
    },
    build: {
      sourcemap: true,
    },
  };
});
