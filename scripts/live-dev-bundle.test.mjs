import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildBundlePayload,
  decryptBundleFile,
  encryptBundleFile,
  exportLiveDevBundle,
  initializeAgeRecipient,
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

  const payload = buildBundlePayload({ env });

  assert.equal(
    payload.pgpass,
    [
      String.raw`127.0.0.1:*:research_app:stock_insight_app_reader:read\:pass`,
      String.raw`127.0.0.1:*:research_app:stock_insight_app_writer:write\\pass`,
      '',
    ].join('\n'),
  );
  assert.deepEqual(payload.manifest, {
    schemaVersion: 2,
    database: 'research_app',
    roles: ['stock_insight_app_reader', 'stock_insight_app_writer'],
    files: ['pgpass'],
  });
  assert.deepEqual(Object.keys(payload).sort(), ['manifest', 'pgpass', 'schemaVersion']);
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
      }),
    /database must be research_app/,
  );
});

test('validateBundlePayload rejects additional fields and bundles containing local-only secrets', () => {
  const valid = {
    schemaVersion: 2,
    pgpass: [
      '127.0.0.1:*:research_app:stock_insight_app_reader:read',
      '127.0.0.1:*:research_app:stock_insight_app_writer:write',
      '',
    ].join('\n'),
    manifest: {
      schemaVersion: 2,
      database: 'research_app',
      roles: ['stock_insight_app_reader', 'stock_insight_app_writer'],
      files: ['pgpass'],
    },
  };

  assert.throws(() => validateBundlePayload({ ...valid, extra: true }), /unexpected bundle field/);
  assert.throws(
    () => validateBundlePayload({ ...valid, internalContext: 'x'.repeat(48) }),
    /unexpected bundle field: internalContext/,
  );
});

test('installBundlePayload writes pgpass and creates device-local context and session secrets', async () => {
  const homeDir = await mkdtemp(join(tmpdir(), 'stock-insight-live-bundle-'));
  const targetDir = join(homeDir, '.hermes', 'secrets', 'stock-insight-live-dev');
  const payload = buildBundlePayload({
    env: {
      STOCK_INSIGHT_DATABASE_READ_URL:
        'postgresql://stock_insight_app_reader:read@research-app-postgres:5432/research_app',
      STOCK_INSIGHT_DATABASE_WRITE_URL:
        'postgresql://stock_insight_app_writer:write@research-app-postgres:5432/research_app',
    },
  });

  const installed = await installBundlePayload(payload, { homeDir, platform: 'linux' });

  assert.equal(installed.secretDir, targetDir);
  assert.equal(await readFile(installed.pgpassFile, 'utf8'), payload.pgpass);
  assert.ok((await readFile(installed.internalContextFile, 'utf8')).trim().length >= 32);
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

test('installBundlePayload replaces pgpass atomically and preserves device-local secrets', async () => {
  const homeDir = await mkdtemp(join(tmpdir(), 'stock-insight-live-bundle-replace-'));
  const secretDir = join(homeDir, '.hermes', 'secrets', 'stock-insight-live-dev');
  const payload = buildBundlePayload({
    env: {
      STOCK_INSIGHT_DATABASE_READ_URL:
        'postgresql://stock_insight_app_reader:newread@research-app-postgres:5432/research_app',
      STOCK_INSIGHT_DATABASE_WRITE_URL:
        'postgresql://stock_insight_app_writer:newwrite@research-app-postgres:5432/research_app',
    },
  });
  const first = await installBundlePayload(payload, { homeDir, platform: 'linux' });
  const originalContext = await readFile(first.internalContextFile, 'utf8');
  const originalSession = await readFile(first.sessionSecretFile, 'utf8');
  await writeFile(join(secretDir, 'pgpass'), 'stale\n', { mode: 0o600 });

  await installBundlePayload(payload, { homeDir, platform: 'linux' });

  assert.equal(await readFile(join(secretDir, 'pgpass'), 'utf8'), payload.pgpass);
  assert.equal(await readFile(first.internalContextFile, 'utf8'), originalContext);
  assert.equal(await readFile(first.sessionSecretFile, 'utf8'), originalSession);
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
      }),
      { homeDir, platform: 'linux' },
    ),
    /symbolic link/,
  );
});

test('installBundlePayload rejects unsafe existing directory and local-secret permissions', async () => {
  const payload = buildBundlePayload({
    env: {
      STOCK_INSIGHT_DATABASE_READ_URL:
        'postgresql://stock_insight_app_reader:read@research-app-postgres:5432/research_app',
      STOCK_INSIGHT_DATABASE_WRITE_URL:
        'postgresql://stock_insight_app_writer:write@research-app-postgres:5432/research_app',
    },
  });
  const unsafeDirectoryHome = await mkdtemp(join(tmpdir(), 'stock-insight-live-unsafe-dir-'));
  const unsafeDirectory = join(unsafeDirectoryHome, '.hermes', 'secrets', 'stock-insight-live-dev');
  await mkdir(unsafeDirectory, { recursive: true, mode: 0o755 });
  await assert.rejects(
    installBundlePayload(payload, { homeDir: unsafeDirectoryHome, platform: 'linux' }),
    /directory must have mode 0700 or stricter/,
  );

  const unsafeFileHome = await mkdtemp(join(tmpdir(), 'stock-insight-live-unsafe-file-'));
  const installed = await installBundlePayload(payload, {
    homeDir: unsafeFileHome,
    platform: 'linux',
  });
  await chmod(installed.sessionSecretFile, 0o644);
  await assert.rejects(
    installBundlePayload(payload, { homeDir: unsafeFileHome, platform: 'linux' }),
    /session secret must have mode 0600 or stricter/,
  );
});

test('encryptBundleFile creates a private age file that decrypts only with the matching identity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stock-insight-live-age-'));
  const identity = join(directory, 'identity.txt');
  const outputDirectory = join(directory, 'exports');
  const output = join(outputDirectory, 'stock-insight-live-dev.age');
  execFileSync('age-keygen', ['-o', identity], { stdio: ['ignore', 'ignore', 'ignore'] });
  const recipient = execFileSync('age-keygen', ['-y', identity], { encoding: 'utf8' }).trim();
  const payload = buildBundlePayload({
    env: {
      STOCK_INSIGHT_DATABASE_READ_URL:
        'postgresql://stock_insight_app_reader:read@research-app-postgres:5432/research_app',
      STOCK_INSIGHT_DATABASE_WRITE_URL:
        'postgresql://stock_insight_app_writer:write@research-app-postgres:5432/research_app',
    },
  });

  await encryptBundleFile(payload, { recipient, outputPath: output, platform: 'linux' });

  assert.equal((await stat(output)).mode & 0o777, 0o600);
  assert.equal((await stat(outputDirectory)).mode & 0o777, 0o700);
  assert.doesNotMatch(await readFile(output, 'utf8'), /stock_insight_app_reader/);
  assert.deepEqual(await decryptBundleFile(output, { identityFile: identity }), payload);

  const foreignIdentity = join(directory, 'foreign.txt');
  execFileSync('age-keygen', ['-o', foreignIdentity], { stdio: ['ignore', 'ignore', 'ignore'] });
  await assert.rejects(
    decryptBundleFile(output, { identityFile: foreignIdentity }),
    /age decryption failed/,
  );
});

test('exportLiveDevBundle includes only the two approved DB role credentials', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stock-insight-live-export-'));
  const sourceEnvFile = join(directory, '.env.docker');
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
  execFileSync('age-keygen', ['-o', identity], { stdio: ['ignore', 'ignore', 'ignore'] });
  const recipient = execFileSync('age-keygen', ['-y', identity], { encoding: 'utf8' }).trim();

  await exportLiveDevBundle({
    sourceEnvFile,
    recipient,
    outputPath: output,
    platform: 'linux',
  });

  const decrypted = await decryptBundleFile(output, { identityFile: identity });
  assert.deepEqual(Object.keys(decrypted).sort(), ['manifest', 'pgpass', 'schemaVersion']);
  assert.doesNotMatch(JSON.stringify(decrypted), /must-not-export/);
});

test('exportLiveDevBundle rejects symlinked plaintext source files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stock-insight-live-source-symlink-'));
  const realEnv = join(directory, 'real.env');
  const sourceEnvFile = join(directory, 'source.env');
  await writeFile(realEnv, 'DATABASE_READ_URL=unused\n', { mode: 0o600 });
  await symlink(realEnv, sourceEnvFile);

  await assert.rejects(
    exportLiveDevBundle({
      sourceEnvFile,
      recipient: 'age1invalid',
      outputPath: join(directory, 'bundle.age'),
      platform: 'linux',
    }),
    /symbolic link/,
  );
});

test('initializeAgeRecipient creates once and reuses the same private identity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stock-insight-live-recipient-'));
  const identity = join(directory, 'identity.txt');

  const first = await initializeAgeRecipient(identity, { platform: 'linux' });
  const originalIdentity = await readFile(identity, 'utf8');
  const second = await initializeAgeRecipient(identity, { platform: 'linux' });

  assert.match(first, /^age1[0-9a-z]+$/);
  assert.equal(second, first);
  assert.equal(await readFile(identity, 'utf8'), originalIdentity);
  assert.equal((await stat(identity)).mode & 0o777, 0o600);
});

test('initializeAgeRecipient rejects symlinks and reports the macOS age install command', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stock-insight-live-recipient-errors-'));
  const realIdentity = join(directory, 'real.txt');
  const linkedIdentity = join(directory, 'linked.txt');
  await writeFile(realIdentity, 'not-an-age-identity\n', { mode: 0o600 });
  await symlink(realIdentity, linkedIdentity);

  await assert.rejects(
    initializeAgeRecipient(linkedIdentity, { platform: 'darwin' }),
    /must not be a symbolic link/,
  );
  await assert.rejects(
    initializeAgeRecipient(join(directory, 'missing.txt'), {
      platform: 'darwin',
      spawnProcess: () => ({
        error: Object.assign(new Error('spawn age-keygen ENOENT'), { code: 'ENOENT' }),
      }),
    }),
    /brew install age.*spawn age-keygen ENOENT/s,
  );
});

test('initializeAgeRecipient rejects unsafe and invalid existing identities without replacing them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stock-insight-live-recipient-invalid-'));
  const identity = join(directory, 'identity.txt');
  await writeFile(identity, 'not-an-age-identity\n', { mode: 0o644 });
  await assert.rejects(
    initializeAgeRecipient(identity, { platform: 'linux' }),
    /age identity must have mode 0600 or stricter/,
  );
  await chmod(identity, 0o600);
  await assert.rejects(
    initializeAgeRecipient(identity, { platform: 'linux' }),
    /age recipient derivation failed.*unknown identity type/s,
  );
  assert.equal(await readFile(identity, 'utf8'), 'not-an-age-identity\n');
});

test('age command failures preserve the cause without printing private keys or DB passwords', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stock-insight-live-age-redaction-'));
  const identity = join(directory, 'identity.txt');
  await assert.rejects(
    initializeAgeRecipient(identity, {
      platform: 'darwin',
      spawnProcess: () => ({
        status: 1,
        stderr: 'invalid identity AGE-SECRET-KEY-1FAKEPRIVATE',
      }),
    }),
    (error) => {
      assert.match(error.message, /invalid identity/);
      assert.doesNotMatch(error.message, /AGE-SECRET-KEY-1FAKEPRIVATE/);
      return true;
    },
  );

  const payload = buildBundlePayload({
    env: {
      STOCK_INSIGHT_DATABASE_READ_URL:
        'postgresql://stock_insight_app_reader:reader-secret@research-app-postgres:5432/research_app',
      STOCK_INSIGHT_DATABASE_WRITE_URL:
        'postgresql://stock_insight_app_writer:writer-secret@research-app-postgres:5432/research_app',
    },
  });
  await assert.rejects(
    encryptBundleFile(payload, {
      recipient: 'age1recipient',
      outputPath: join(directory, 'exports', 'bundle.age'),
      platform: 'darwin',
      spawnProcess: (_tool, _args, options) => ({ status: 1, stderr: options.input }),
    }),
    (error) => {
      assert.match(error.message, /age encryption failed/);
      assert.doesNotMatch(error.message, /reader-secret|writer-secret/);
      return true;
    },
  );
});

test('parseBundleCliArgs exposes recipient-only export and optional-bundle setup', () => {
  assert.deepEqual(parseBundleCliArgs(['export', '--recipient', 'age1recipient']), {
    command: 'export',
    recipient: 'age1recipient',
  });
  assert.deepEqual(parseBundleCliArgs(['setup']), { command: 'setup' });
  assert.deepEqual(
    parseBundleCliArgs(['setup', '--bundle', '/imports/live.age', '--identity', '/keys/age.txt']),
    {
      command: 'setup',
      bundlePath: '/imports/live.age',
      identityFile: '/keys/age.txt',
    },
  );
  assert.throws(() => parseBundleCliArgs(['setup', '--unknown', 'value']), /unknown option/);
  assert.throws(
    () => parseBundleCliArgs(['export', '--source-env', '/source/.env.docker']),
    /unknown option/,
  );
  assert.throws(() => parseBundleCliArgs(['export', '--recipient']), /requires a value/);
});
