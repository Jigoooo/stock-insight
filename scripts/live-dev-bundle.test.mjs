import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildBundlePayload,
  decryptBundleFile,
  encryptBundleFile,
  exportLiveDevBundle,
  installBundlePayload,
  parseBundleCliArgs,
  parseEnvText,
  validateBundlePayload,
} from './live-dev-bundle.mjs';

test('buildBundlePayload converts production DSNs into a localhost pgpass without leaking DSNs into the manifest', () => {
  const env = parseEnvText(`
STOCK_INSIGHT_DATABASE_READ_URL=postgresql://stock_insight_app_reader:read%3Apass@research-app-postgres:5432/research_app
STOCK_INSIGHT_DATABASE_WRITE_URL=postgresql://stock_insight_app_writer:write%5Cpass@research-app-postgres:5432/research_app
`);

  const payload = buildBundlePayload({ env, internalContext: 'x'.repeat(48) });

  assert.equal(
    payload.pgpass,
    [
      String.raw`127.0.0.1:*:research_app:stock_insight_app_reader:read\:pass`,
      String.raw`127.0.0.1:*:research_app:stock_insight_app_writer:write\\pass`,
      '',
    ].join('\n'),
  );
  assert.equal(payload.internalContext, 'x'.repeat(48));
  assert.deepEqual(payload.manifest, {
    schemaVersion: 1,
    database: 'research_app',
    roles: ['stock_insight_app_reader', 'stock_insight_app_writer'],
    files: ['pgpass', 'stock-insight-internal-context.secret'],
  });
  assert.doesNotMatch(JSON.stringify(payload.manifest), /read%3Apass|write%5Cpass/);
});

test('buildBundlePayload rejects a DSN for an unexpected database role or database', () => {
  const base = {
    STOCK_INSIGHT_DATABASE_READ_URL:
      'postgresql://stock_insight_app_reader:read@research-app-postgres:5432/research_app',
    STOCK_INSIGHT_DATABASE_WRITE_URL:
      'postgresql://stock_insight_app_writer:write@research-app-postgres:5432/research_app',
  };

  assert.throws(
    () =>
      buildBundlePayload({
        env: {
          ...base,
          STOCK_INSIGHT_DATABASE_WRITE_URL: base.STOCK_INSIGHT_DATABASE_WRITE_URL.replace(
            'stock_insight_app_writer',
            'postgres',
          ),
        },
        internalContext: 'x'.repeat(48),
      }),
    /writer role must be stock_insight_app_writer/,
  );
  assert.throws(
    () =>
      buildBundlePayload({
        env: {
          ...base,
          STOCK_INSIGHT_DATABASE_READ_URL: base.STOCK_INSIGHT_DATABASE_READ_URL.replace(
            '/research_app',
            '/other',
          ),
        },
        internalContext: 'x'.repeat(48),
      }),
    /database must be research_app/,
  );
});

test('validateBundlePayload rejects additional fields and short internal secrets', () => {
  const valid = {
    schemaVersion: 1,
    pgpass: '127.0.0.1:*:research_app:stock_insight_app_reader:read\n',
    internalContext: 'x'.repeat(48),
    manifest: {
      schemaVersion: 1,
      database: 'research_app',
      roles: ['stock_insight_app_reader', 'stock_insight_app_writer'],
      files: ['pgpass', 'stock-insight-internal-context.secret'],
    },
  };

  assert.throws(() => validateBundlePayload({ ...valid, extra: true }), /unexpected bundle field/);
  assert.throws(() => validateBundlePayload({ ...valid, internalContext: 'short' }), /too short/);
});

test('installBundlePayload writes only fixed private files and creates a device-local session secret', async () => {
  const homeDir = await mkdtemp(join(tmpdir(), 'stock-insight-live-bundle-'));
  const targetDir = join(homeDir, '.hermes', 'secrets', 'stock-insight-live-dev');
  const payload = buildBundlePayload({
    env: {
      STOCK_INSIGHT_DATABASE_READ_URL:
        'postgresql://stock_insight_app_reader:read@research-app-postgres:5432/research_app',
      STOCK_INSIGHT_DATABASE_WRITE_URL:
        'postgresql://stock_insight_app_writer:write@research-app-postgres:5432/research_app',
    },
    internalContext: 'x'.repeat(48),
  });

  const installed = await installBundlePayload(payload, { homeDir, platform: 'linux' });

  assert.equal(installed.secretDir, targetDir);
  assert.equal(await readFile(installed.pgpassFile, 'utf8'), payload.pgpass);
  assert.equal(
    (await readFile(installed.internalContextFile, 'utf8')).trim(),
    payload.internalContext,
  );
  assert.ok((await readFile(installed.sessionSecretFile, 'utf8')).trim().length >= 32);
  assert.equal((await stat(targetDir)).mode & 0o777, 0o700);
  for (const path of [
    installed.pgpassFile,
    installed.internalContextFile,
    installed.sessionSecretFile,
  ]) {
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  }
});

test('installBundlePayload replaces an existing private pgpass atomically', async () => {
  const homeDir = await mkdtemp(join(tmpdir(), 'stock-insight-live-bundle-replace-'));
  const secretDir = join(homeDir, '.hermes', 'secrets', 'stock-insight-live-dev');
  const payload = buildBundlePayload({
    env: {
      STOCK_INSIGHT_DATABASE_READ_URL:
        'postgresql://stock_insight_app_reader:newread@research-app-postgres:5432/research_app',
      STOCK_INSIGHT_DATABASE_WRITE_URL:
        'postgresql://stock_insight_app_writer:newwrite@research-app-postgres:5432/research_app',
    },
    internalContext: 'y'.repeat(48),
  });
  await installBundlePayload(payload, { homeDir, platform: 'linux' });
  await writeFile(join(secretDir, 'pgpass'), 'stale\n', { mode: 0o600 });

  await installBundlePayload(payload, { homeDir, platform: 'linux' });

  assert.equal(await readFile(join(secretDir, 'pgpass'), 'utf8'), payload.pgpass);
});

test('installBundlePayload rejects a symlinked secret directory', async () => {
  const homeDir = await mkdtemp(join(tmpdir(), 'stock-insight-live-symlink-home-'));
  const redirected = await mkdtemp(join(tmpdir(), 'stock-insight-live-symlink-target-'));
  const parent = join(homeDir, '.hermes', 'secrets');
  await mkdir(parent, { recursive: true, mode: 0o700 });
  await symlink(redirected, join(parent, 'stock-insight-live-dev'), 'dir');

  await assert.rejects(
    installBundlePayload(
      buildBundlePayload({
        env: {
          STOCK_INSIGHT_DATABASE_READ_URL:
            'postgresql://stock_insight_app_reader:***@research-app-postgres:5432/research_app',
          STOCK_INSIGHT_DATABASE_WRITE_URL:
            'postgresql://stock_insight_app_writer:***@research-app-postgres:5432/research_app',
        },
        internalContext: 'x'.repeat(48),
      }),
      { homeDir, platform: 'linux' },
    ),
    /symbolic link/,
  );
});

test('encryptBundleFile creates a private age file that decrypts only with the matching identity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stock-insight-live-age-'));
  const identity = join(directory, 'identity.txt');
  const output = join(directory, 'stock-insight-live-dev.age');
  execFileSync('age-keygen', ['-o', identity], { stdio: ['ignore', 'ignore', 'ignore'] });
  const recipient = execFileSync('age-keygen', ['-y', identity], { encoding: 'utf8' }).trim();
  const payload = buildBundlePayload({
    env: {
      STOCK_INSIGHT_DATABASE_READ_URL:
        'postgresql://stock_insight_app_reader:read@research-app-postgres:5432/research_app',
      STOCK_INSIGHT_DATABASE_WRITE_URL:
        'postgresql://stock_insight_app_writer:write@research-app-postgres:5432/research_app',
    },
    internalContext: 'z'.repeat(48),
  });

  await encryptBundleFile(payload, { recipient, outputPath: output, platform: 'linux' });

  assert.equal((await stat(output)).mode & 0o777, 0o600);
  assert.doesNotMatch(await readFile(output, 'utf8'), /stock_insight_app_reader|zzzzzz/);
  assert.deepEqual(await decryptBundleFile(output, { identityFile: identity }), payload);

  const foreignIdentity = join(directory, 'foreign.txt');
  execFileSync('age-keygen', ['-o', foreignIdentity], { stdio: ['ignore', 'ignore', 'ignore'] });
  await assert.rejects(
    decryptBundleFile(output, { identityFile: foreignIdentity }),
    /age decryption failed/,
  );
});

test('exportLiveDevBundle reads only the two approved source secrets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stock-insight-live-export-'));
  const sourceEnvFile = join(directory, '.env.docker');
  const internalContextFile = join(directory, 'internal.secret');
  const identity = join(directory, 'identity.txt');
  const output = join(directory, 'bundle.age');
  await writeFile(
    sourceEnvFile,
    [
      'UNRELATED_SECRET=must-not-export',
      'STOCK_INSIGHT_DATABASE_READ_URL=postgresql://stock_insight_app_reader:read@research-app-postgres:5432/research_app',
      'STOCK_INSIGHT_DATABASE_WRITE_URL=postgresql://stock_insight_app_writer:write@research-app-postgres:5432/research_app',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  await writeFile(internalContextFile, `${'i'.repeat(48)}\n`, { mode: 0o600 });
  execFileSync('age-keygen', ['-o', identity], { stdio: ['ignore', 'ignore', 'ignore'] });
  const recipient = execFileSync('age-keygen', ['-y', identity], { encoding: 'utf8' }).trim();

  await exportLiveDevBundle({
    sourceEnvFile,
    internalContextFile,
    recipient,
    outputPath: output,
    platform: 'linux',
  });

  const decrypted = await decryptBundleFile(output, { identityFile: identity });
  assert.equal(decrypted.internalContext, 'i'.repeat(48));
  assert.doesNotMatch(JSON.stringify(decrypted), /must-not-export/);
});

test('exportLiveDevBundle rejects symlinked plaintext source files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stock-insight-live-source-symlink-'));
  const realEnv = join(directory, 'real.env');
  const sourceEnvFile = join(directory, 'source.env');
  const internalContextFile = join(directory, 'internal.secret');
  await writeFile(realEnv, 'DATABASE_READ_URL=unused\n', { mode: 0o600 });
  await symlink(realEnv, sourceEnvFile);
  await writeFile(internalContextFile, 'i'.repeat(48), { mode: 0o600 });

  await assert.rejects(
    exportLiveDevBundle({
      sourceEnvFile,
      internalContextFile,
      recipient: 'age1invalid',
      outputPath: join(directory, 'bundle.age'),
      platform: 'linux',
    }),
    /symbolic link/,
  );
});

test('parseBundleCliArgs accepts only the fixed export and setup options', () => {
  assert.deepEqual(
    parseBundleCliArgs([
      'export',
      '--recipient',
      'age1recipient',
      '--source-env',
      '/source/.env.docker',
      '--internal-context',
      '/source/internal.secret',
      '--out',
      '/exports/live.age',
    ]),
    {
      command: 'export',
      recipient: 'age1recipient',
      sourceEnvFile: '/source/.env.docker',
      internalContextFile: '/source/internal.secret',
      outputPath: '/exports/live.age',
    },
  );
  assert.deepEqual(
    parseBundleCliArgs(['setup', '--bundle', '/imports/live.age', '--identity', '/keys/age.txt']),
    {
      command: 'setup',
      bundlePath: '/imports/live.age',
      identityFile: '/keys/age.txt',
    },
  );
  assert.throws(() => parseBundleCliArgs(['setup', '--unknown', 'value']), /unknown option/);
  assert.throws(() => parseBundleCliArgs(['export', '--recipient']), /requires a value/);
});
