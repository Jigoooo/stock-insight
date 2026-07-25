import { constants as fsConstants } from 'node:fs';
import { access, open, rename } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const pg = require('pg');

const [statePath, releasePath] = process.argv.slice(2);
if (!statePath || !releasePath) {
  throw new Error('usage: export-research-app-snapshot.mjs STATE_PATH RELEASE_PATH');
}
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error('DATABASE_URL is required');

const client = new pg.Client({ connectionString });
let finished = false;
async function releaseSnapshot() {
  if (finished) return;
  finished = true;
  try {
    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    void releaseSnapshot().finally(() => process.exit(128 + (signal === 'SIGINT' ? 2 : 15)));
  });
}

await client.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshotResult = await client.query('SELECT pg_export_snapshot() AS snapshot_id');
  const counts = await client.query(`
    SELECT
      (SELECT count(*)::text FROM serving.content_pack_item) AS content_pack_items,
      (SELECT count(*)::text FROM knowledge.derivation WHERE status = 'sealed') AS sealed_derivations,
      (SELECT count(*)::text FROM pg_index WHERE NOT indisvalid) AS invalid_indexes,
      (SELECT count(*)::text FROM timescaledb_information.hypertables) AS hypertables,
      (SELECT count(*)::text FROM timescaledb_information.jobs) AS timescale_jobs,
      to_char(transaction_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS captured_at
  `);
  const payload = {
    snapshotId: snapshotResult.rows[0]?.snapshot_id,
    contentPackItems: counts.rows[0]?.content_pack_items,
    sealedDerivations: counts.rows[0]?.sealed_derivations,
    invalidIndexes: counts.rows[0]?.invalid_indexes,
    hypertables: counts.rows[0]?.hypertables,
    timescaleJobs: counts.rows[0]?.timescale_jobs,
    capturedAt: counts.rows[0]?.captured_at,
  };
  if (!payload.snapshotId || Object.values(payload).some((value) => value === undefined)) {
    throw new Error('incomplete snapshot payload');
  }
  const temporary = `${statePath}.tmp-${process.pid}`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(payload)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, statePath);

  const deadline = Date.now() + 45 * 60_000;
  while (Date.now() < deadline) {
    try {
      await access(releasePath, fsConstants.F_OK);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  if (Date.now() >= deadline) throw new Error('snapshot release timeout');
} finally {
  await releaseSnapshot();
}
