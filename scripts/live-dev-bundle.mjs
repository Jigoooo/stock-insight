#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BUNDLE_SCHEMA_VERSION = 2;
const DATABASE_NAME = 'research_app';
const READ_ROLE = 'stock_insight_app_reader';
const WRITE_ROLE = 'stock_insight_app_writer';
const BUNDLE_FIELDS = ['manifest', 'pgpass', 'schemaVersion'];
const MANIFEST_FIELDS = ['database', 'files', 'roles', 'schemaVersion'];

export function parseEnvText(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function parseDatabaseUrl(value, label, expectedRole) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing`);
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${label} must be a PostgreSQL URL`);
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`${label} must be a PostgreSQL URL`);
  }
  if (decodeURIComponent(url.username) !== expectedRole) {
    throw new Error(`${label} role must be ${expectedRole}`);
  }
  if (url.pathname !== `/${DATABASE_NAME}`) {
    throw new Error(`${label} database must be ${DATABASE_NAME}`);
  }
  if (!url.password) throw new Error(`${label} must include a password`);
  return {
    role: expectedRole,
    password: decodeURIComponent(url.password),
  };
}

function escapePgpass(value) {
  return value.replaceAll('\\', '\\\\').replaceAll(':', '\\:');
}

export function buildBundlePayload({ env }) {
  const read = parseDatabaseUrl(env.STOCK_INSIGHT_DATABASE_READ_URL, 'reader', READ_ROLE);
  const write = parseDatabaseUrl(env.STOCK_INSIGHT_DATABASE_WRITE_URL, 'writer', WRITE_ROLE);

  const pgpass = [read, write]
    .map(({ role, password }) => `127.0.0.1:*:${DATABASE_NAME}:${role}:${escapePgpass(password)}`)
    .join('\n');

  const payload = {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    pgpass: `${pgpass}\n`,
    manifest: {
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      database: DATABASE_NAME,
      roles: [READ_ROLE, WRITE_ROLE],
      files: ['pgpass'],
    },
  };
  validateBundlePayload(payload);
  return payload;
}

function assertExactFields(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expectedSorted = [...expected].sort();
  const unexpected = actual.find((key) => !expectedSorted.includes(key));
  if (unexpected) throw new Error(`unexpected ${label} field: ${unexpected}`);
  const missing = expectedSorted.find((key) => !actual.includes(key));
  if (missing) throw new Error(`missing ${label} field: ${missing}`);
}

function splitPgpassLine(line) {
  const fields = [''];
  let escaped = false;
  for (const character of line) {
    if (escaped) {
      fields[fields.length - 1] += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === ':') {
      fields.push('');
    } else {
      fields[fields.length - 1] += character;
    }
  }
  if (escaped) throw new Error('pgpass contains a trailing escape');
  return fields;
}

export function validateBundlePayload(payload) {
  assertExactFields(payload, BUNDLE_FIELDS, 'bundle');
  if (payload.schemaVersion !== BUNDLE_SCHEMA_VERSION) {
    throw new Error(`unsupported bundle schema version: ${String(payload.schemaVersion)}`);
  }
  if (typeof payload.pgpass !== 'string' || !payload.pgpass.endsWith('\n')) {
    throw new Error('pgpass must be a newline-terminated string');
  }
  const lines = payload.pgpass.trimEnd().split('\n');
  if (lines.length !== 2) throw new Error('pgpass must contain exactly two entries');
  for (const [index, expectedRole] of [READ_ROLE, WRITE_ROLE].entries()) {
    const fields = splitPgpassLine(lines[index]);
    if (
      fields.length !== 5 ||
      fields[0] !== '127.0.0.1' ||
      fields[1] !== '*' ||
      fields[2] !== DATABASE_NAME ||
      fields[3] !== expectedRole ||
      !fields[4]
    ) {
      throw new Error(`pgpass entry ${index + 1} does not match the expected live DB role`);
    }
  }

  assertExactFields(payload.manifest, MANIFEST_FIELDS, 'manifest');
  if (
    payload.manifest.schemaVersion !== BUNDLE_SCHEMA_VERSION ||
    payload.manifest.database !== DATABASE_NAME ||
    JSON.stringify(payload.manifest.roles) !== JSON.stringify([READ_ROLE, WRITE_ROLE]) ||
    JSON.stringify(payload.manifest.files) !== JSON.stringify(['pgpass'])
  ) {
    throw new Error('bundle manifest does not match the live development contract');
  }
  return payload;
}

async function writePrivateFileAtomic(path, content, platform) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    if (platform !== 'win32') await chmod(temporary, 0o600);
    await rename(temporary, path);
    if (platform !== 'win32') await chmod(path, 0o600);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
}

async function readPrivateFile(path, platform, label) {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (error?.code === 'ELOOP') throw new Error(`${label} must not be a symbolic link: ${path}`);
    throw error;
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error(`${label} must be a regular file: ${path}`);
    if (
      platform !== 'win32' &&
      typeof process.getuid === 'function' &&
      metadata.uid !== process.getuid()
    ) {
      throw new Error(`${label} must be owned by the current user: ${path}`);
    }
    if (platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
      throw new Error(`${label} must have mode 0600 or stricter: ${path}`);
    }
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
}

async function requirePrivateFile(path, platform, label) {
  await readPrivateFile(path, platform, label);
}

async function requireExistingPrivateFile(path, platform, label) {
  try {
    await requirePrivateFile(path, platform, label);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function preparePrivateDirectoryChain(homeDir, platform) {
  let current = homeDir;
  for (const part of ['.hermes', 'secrets', 'stock-insight-live-dev']) {
    current = join(current, part);
    let created = false;
    try {
      await mkdir(current, { mode: 0o700 });
      created = true;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) {
      throw new Error(`live development secret directory must not be a symbolic link: ${current}`);
    }
    if (!metadata.isDirectory()) {
      throw new Error(`live development secret path must be a directory: ${current}`);
    }
    if (
      platform !== 'win32' &&
      typeof process.getuid === 'function' &&
      metadata.uid !== process.getuid()
    ) {
      throw new Error(
        `live development secret directory must be owned by the current user: ${current}`,
      );
    }
    if (platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
      if (!created) {
        throw new Error(
          `live development secret directory must have mode 0700 or stricter: ${current}`,
        );
      }
      await chmod(current, 0o700);
    }
  }
  return current;
}

function processFailureMessage(result, label, tool, platform) {
  const original = String(result.error?.message ?? result.stderr ?? '')
    .replace(/AGE-SECRET-KEY-[0-9A-Z-]+/gi, '[redacted age identity]')
    .replace(/(stock_insight_app_(?:reader|writer):)[^\\\r\n"\s]+/g, '$1[redacted password]')
    .replace(/(postgres(?:ql)?:\/\/[^:\s/"']+:)[^@\s/"']+@/gi, '$1[redacted password]@')
    .trim();
  const installHint =
    platform === 'darwin' && result.error?.code === 'ENOENT'
      ? ` ${tool} is not installed. Run: brew install age.`
      : '';
  return `${label} failed.${installHint}${original ? ` ${original.slice(0, 4096)}` : ''}`;
}

function runTool(tool, args, options, label, platform, spawnProcess = spawnSync) {
  const result = spawnProcess(tool, args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(processFailureMessage(result, label, tool, platform));
  }
  return result;
}

export async function encryptBundleFile(
  untrustedPayload,
  { recipient, outputPath, platform = process.platform, spawnProcess = spawnSync },
) {
  const payload = validateBundlePayload(untrustedPayload);
  if (typeof recipient !== 'string' || !/^age1[0-9a-z]+$/.test(recipient)) {
    throw new Error('age recipient must be an age1 public recipient');
  }
  if (typeof outputPath !== 'string' || !outputPath)
    throw new Error('bundle output path is required');
  const outputDirectory = join(outputPath, '..');
  const firstCreated = await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  const outputDirectoryMetadata = await lstat(outputDirectory);
  if (outputDirectoryMetadata.isSymbolicLink() || !outputDirectoryMetadata.isDirectory()) {
    throw new Error(`bundle output directory must be a private directory: ${outputDirectory}`);
  }
  if (
    platform !== 'win32' &&
    typeof process.getuid === 'function' &&
    outputDirectoryMetadata.uid !== process.getuid()
  ) {
    throw new Error(
      `bundle output directory must be owned by the current user: ${outputDirectory}`,
    );
  }
  if (platform !== 'win32' && (outputDirectoryMetadata.mode & 0o077) !== 0) {
    if (firstCreated === undefined) {
      throw new Error(
        `bundle output directory must have mode 0700 or stricter: ${outputDirectory}`,
      );
    }
    await chmod(outputDirectory, 0o700);
  }
  const temporary = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    runTool(
      'age',
      ['--encrypt', '--recipient', recipient, '--output', temporary],
      { input: `${JSON.stringify(payload)}\n` },
      'age encryption',
      platform,
      spawnProcess,
    );
    if (platform !== 'win32') await chmod(temporary, 0o600);
    await rename(temporary, outputPath);
    if (platform !== 'win32') await chmod(outputPath, 0o600);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
  return outputPath;
}

export async function decryptBundleFile(
  bundlePath,
  { identityFile, platform = process.platform, spawnProcess = spawnSync },
) {
  const identity = await readPrivateFile(identityFile, platform, 'age identity');
  const result = runTool(
    'age',
    ['--decrypt', '--identity', '-', bundlePath],
    { input: identity },
    'age decryption',
    platform,
    spawnProcess,
  );
  if (Buffer.byteLength(result.stdout, 'utf8') > 64 * 1024) {
    throw new Error('decrypted bundle exceeds the size limit');
  }
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    throw new Error('decrypted bundle is not valid JSON');
  }
  return validateBundlePayload(payload);
}

export async function exportLiveDevBundle({
  sourceEnvFile,
  recipient,
  outputPath,
  platform = process.platform,
  spawnProcess = spawnSync,
}) {
  const sourceEnv = await readPrivateFile(
    sourceEnvFile,
    platform,
    'production Docker environment file',
  );
  const payload = buildBundlePayload({ env: parseEnvText(sourceEnv) });
  await encryptBundleFile(payload, { recipient, outputPath, platform, spawnProcess });
  return { outputPath, manifest: payload.manifest };
}

export async function installBundlePayload(
  untrustedPayload,
  { homeDir = homedir(), platform = process.platform } = {},
) {
  const payload = validateBundlePayload(untrustedPayload);
  const secretDir = await preparePrivateDirectoryChain(homeDir, platform);

  const pgpassFile = join(secretDir, 'pgpass');
  const internalContextFile = join(secretDir, 'stock-insight-internal-context.secret');
  const sessionSecretFile = join(secretDir, 'stock-insight-session.secret');

  await requireExistingPrivateFile(pgpassFile, platform, 'pgpass');
  await writePrivateFileAtomic(pgpassFile, payload.pgpass, platform);
  for (const [localSecretFile, label] of [
    [internalContextFile, 'internal context secret'],
    [sessionSecretFile, 'session secret'],
  ]) {
    let created = false;
    try {
      await writeFile(localSecretFile, `${randomBytes(48).toString('base64url')}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      created = true;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
    if (created) {
      if (platform !== 'win32') await chmod(localSecretFile, 0o600);
    } else {
      await requirePrivateFile(localSecretFile, platform, label);
    }
  }

  await requirePrivateFile(pgpassFile, platform, 'pgpass');
  await requirePrivateFile(internalContextFile, platform, 'internal context secret');
  await requirePrivateFile(sessionSecretFile, platform, 'session secret');
  const internalContext = (
    await readPrivateFile(internalContextFile, platform, 'internal context secret')
  ).trim();
  const sessionSecret = (
    await readPrivateFile(sessionSecretFile, platform, 'session secret')
  ).trim();
  if (internalContext.length < 32)
    throw new Error('device-local internal context secret is too short');
  if (sessionSecret.length < 32) throw new Error('device-local session secret is too short');

  return { secretDir, pgpassFile, internalContextFile, sessionSecretFile };
}

const CLI_OPTION_NAMES = {
  '--bundle': 'bundlePath',
  '--identity': 'identityFile',
  '--recipient': 'recipient',
};

export function parseBundleCliArgs(args) {
  const [command, ...rest] = args;
  if (!['export', 'setup', 'help'].includes(command)) {
    throw new Error(`unknown bundle command: ${String(command ?? '')}`);
  }
  const result = { command };
  for (let index = 0; index < rest.length; index += 2) {
    const option = rest[index];
    const key = CLI_OPTION_NAMES[option];
    if (!key) throw new Error(`unknown option: ${String(option)}`);
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
    result[key] = value;
  }
  return result;
}

function printHelp() {
  process.stdout.write(`Stock Insight live development bundle\n\n`);
  process.stdout.write(`  setup [--bundle PATH] [--identity PATH]\n`);
  process.stdout.write(`  export --recipient AGE1...\n`);
}

export async function initializeAgeRecipient(
  identityFile,
  { platform = process.platform, spawnProcess = spawnSync } = {},
) {
  const identityDirectory = join(identityFile, '..');
  await mkdir(identityDirectory, { recursive: true, mode: 0o700 });
  const directoryMetadata = await lstat(identityDirectory);
  if (directoryMetadata.isSymbolicLink() || !directoryMetadata.isDirectory()) {
    throw new Error(`age identity directory must be a private directory: ${identityDirectory}`);
  }
  if (
    platform !== 'win32' &&
    typeof process.getuid === 'function' &&
    directoryMetadata.uid !== process.getuid()
  ) {
    throw new Error(
      `age identity directory must be owned by the current user: ${identityDirectory}`,
    );
  }
  if (platform !== 'win32') await chmod(identityDirectory, 0o700);

  let exists = true;
  try {
    await requirePrivateFile(identityFile, platform, 'age identity');
  } catch (error) {
    if (error?.code === 'ENOENT') exists = false;
    else throw error;
  }
  if (!exists) {
    const temporary = `${identityFile}.${process.pid}.${randomUUID()}.tmp`;
    try {
      runTool(
        'age-keygen',
        ['-o', temporary],
        { stdio: ['ignore', 'ignore', 'pipe'] },
        'age identity generation',
        platform,
        spawnProcess,
      );
      if (platform !== 'win32') await chmod(temporary, 0o600);
      await rename(temporary, identityFile);
    } finally {
      await unlink(temporary).catch((error) => {
        if (error?.code !== 'ENOENT') throw error;
      });
    }
  }
  await requirePrivateFile(identityFile, platform, 'age identity');
  const recipientResult = runTool(
    'age-keygen',
    ['-y', identityFile],
    { stdio: ['ignore', 'pipe', 'pipe'] },
    'age recipient derivation',
    platform,
    spawnProcess,
  );
  return recipientResult.stdout.trim();
}

async function main() {
  const parsed = parseBundleCliArgs(
    process.argv.slice(2).length ? process.argv.slice(2) : ['help'],
  );
  const homeDir = homedir();
  const defaultIdentity = join(homeDir, '.config', 'age', 'stock-insight-live-dev.txt');
  if (parsed.command === 'help') return printHelp();
  if (parsed.command === 'export') {
    if (!parsed.recipient) throw new Error('--recipient is required for export');
    const result = await exportLiveDevBundle({
      sourceEnvFile: resolve('.env.docker'),
      recipient: parsed.recipient,
      outputPath: join(homeDir, '.hermes', 'exports', 'stock-insight-live-dev.age'),
    });
    process.stdout.write(`Encrypted bundle: ${result.outputPath}\n`);
    process.stdout.write(`${JSON.stringify(result.manifest)}\n`);
    return;
  }
  const identityFile = parsed.identityFile ?? defaultIdentity;
  if (!parsed.bundlePath) {
    const recipient = await initializeAgeRecipient(identityFile);
    process.stdout.write(`Age recipient: ${recipient}\n`);
    process.stdout.write(`Private identity: ${identityFile}\n`);
    return;
  }
  const payload = await decryptBundleFile(parsed.bundlePath, { identityFile });
  const installed = await installBundlePayload(payload, { homeDir });
  process.stdout.write(`Live development secrets installed: ${installed.secretDir}\n`);
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (entry === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
