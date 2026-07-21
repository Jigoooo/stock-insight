import babel from '@rolldown/plugin-babel';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig, loadEnv } from 'vite';

import { resolveDevServerPort } from './config/dev-server';

const securityHeaders = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    'worker-src blob:',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Referrer-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
} as const;

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
      nitro({
        routeRules: {
          '/**': { headers: securityHeaders },
        },
      }),
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
