import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporaryRoot = mkdtempSync(join(tmpdir(), 'stock-insight-auth-visual-'));
const secretPath = join(temporaryRoot, 'session-secret');
writeFileSync(secretPath, randomBytes(32).toString('hex'), { mode: 0o600 });

for (const key of [
  'AUTH_VISUAL_DIR',
  'PLAYWRIGHT_BASE_URL',
  'PLAYWRIGHT_GREP',
  'PLAYWRIGHT_GREP_INVERT',
  'PLAYWRIGHT_SKIP_WEB_SERVER',
]) {
  delete process.env[key];
}

try {
  const result = spawnSync(
    'pnpm',
    ['exec', 'playwright', 'test', 'e2e/auth-visual.spec.ts'],
    {
      cwd: root,
      env: {
        ...process.env,
        PLAYWRIGHT_PORT: '18098',
        PLAYWRIGHT_USE_PRODUCTION_BUILD: '1',
        STOCK_INSIGHT_E2E_SESSION_SECRET_PATH: secretPath,
      },
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`production auth visual gate exited with ${result.status}`);
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
