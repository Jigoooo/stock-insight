import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashProductionArtifact } from './production-artifact-hash.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const productionOutput = new URL('../apps/web/.output/', import.meta.url);
const ROUND_COUNT = 2;
const evidenceRoot = join(tmpdir(), `stock-insight-p3d-evidence-${randomBytes(8).toString('hex')}`);

for (const key of [
  'PLAYWRIGHT_BASE_URL',
  'PLAYWRIGHT_GREP',
  'PLAYWRIGHT_GREP_INVERT',
  'PLAYWRIGHT_SKIP_WEB_SERVER',
]) {
  delete process.env[key];
}

const baselineArtifactSha256 = hashProductionArtifact(productionOutput);
const port = process.env.PLAYWRIGHT_PORT ?? '6122';
const matrices = [
  {
    id: 'normal',
    grep: 'switches all eight',
    projects: ['--project=desktop', '--project=mobile'],
    normalExpected: 2,
  },
  {
    id: 'edge',
    grep: 'keeps sealed geo evidence|settles the geo camera',
    projects: ['--project=desktop'],
    edgeExpected: 2,
  },
];

function summarizeReport(reportPath) {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const counts = { expected: 0, unexpected: 0, skipped: 0, flaky: 0 };
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const status = test.status ?? 'unknown';
        if (status in counts) counts[status] += 1;
        else counts.unexpected += 1;
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return counts;
}

function runMatrix(round, matrix) {
  const roundRoot = join(evidenceRoot, `round-${round}`);
  mkdirSync(roundRoot, { recursive: true });
  const reportPath = join(roundRoot, `${matrix.id}-report.json`);
  const outputPath = join(roundRoot, matrix.id);
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      'e2e/research-workspace-v3.spec.ts',
      '--grep',
      matrix.grep,
      ...matrix.projects,
      `--output=${outputPath}`,
      '--reporter=json',
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        P3D_CAPTURE_SCREENSHOTS: '1',
        PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
        PLAYWRIGHT_PORT: port,
        PLAYWRIGHT_PRODUCTION_ARTIFACT_SHA256: baselineArtifactSha256,
        PLAYWRIGHT_USE_PRODUCTION_BUILD: '1',
        PLAYWRIGHT_WORKERS: '1',
      },
      stdio: ['inherit', 'inherit', 'inherit'],
    },
  );
  if (result.error) throw result.error;
  if (!existsSync(reportPath)) throw new Error(`P3-D ${matrix.id} report is missing`);

  const counts = summarizeReport(reportPath);
  const expected = matrix.normalExpected ?? matrix.edgeExpected;
  if (
    result.status !== 0 ||
    counts.expected !== expected ||
    counts.unexpected !== 0 ||
    counts.flaky !== 0 ||
    counts.skipped !== 0
  ) {
    throw new Error(
      `P3-D ${matrix.id} matrix failed: exit=${result.status} expected=${counts.expected}/${expected} ` +
        `unexpected=${counts.unexpected} flaky=${counts.flaky} skipped=${counts.skipped}`,
    );
  }
  console.log(
    `p3d_round=${round} matrix=${matrix.id} passed=${counts.expected} skipped=${counts.skipped}`,
  );
}

function collectScreenshotDigests(rootPath) {
  const digests = new Map();
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith('.png')) {
        const key = relative(rootPath, path).replaceAll('\\', '/');
        digests.set(key, createHash('sha256').update(readFileSync(path)).digest('hex'));
      }
    }
  };
  visit(rootPath);
  return digests;
}

function compareScreenshotRounds(first, second) {
  if (first.size === 0 || first.size !== second.size) {
    throw new Error(`P3-D screenshot set mismatch: round1=${first.size} round2=${second.size}`);
  }
  for (const [path, digest] of first) {
    if (second.get(path) !== digest) {
      throw new Error(`P3-D screenshot mismatch: ${path}`);
    }
  }
}

try {
  const screenshotRounds = [];
  for (let round = 1; round <= ROUND_COUNT; round += 1) {
    const artifactBefore = hashProductionArtifact(productionOutput);
    if (artifactBefore !== baselineArtifactSha256) {
      throw new Error(`P3-D artifact changed before round ${round}`);
    }
    for (const matrix of matrices) runMatrix(round, matrix);
    const artifactAfter = hashProductionArtifact(productionOutput);
    if (artifactAfter !== baselineArtifactSha256) {
      throw new Error(`P3-D artifact changed after round ${round}`);
    }
    screenshotRounds.push(collectScreenshotDigests(join(evidenceRoot, `round-${round}`)));
    console.log(
      `p3d_round=${round} artifact_before=${artifactBefore} artifact_after=${artifactAfter}`,
    );
  }
  compareScreenshotRounds(screenshotRounds[0], screenshotRounds[1]);
  console.log(`p3d_production_artifact_sha256=${baselineArtifactSha256}`);
  console.log(`p3d_production_evidence_dir=${evidenceRoot}`);
  console.log(`p3d_production_e2e rounds=${ROUND_COUNT} screenshots=${screenshotRounds[0].size}`);
  process.exitCode = 0;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(`p3d_production_evidence_dir=${evidenceRoot}`);
  process.exitCode = 1;
}
