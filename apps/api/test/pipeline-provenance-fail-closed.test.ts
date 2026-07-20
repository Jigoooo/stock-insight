import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const common = new URL('../scripts/pipeline_common.sh', import.meta.url).pathname;

test('pipeline stage provenance fails closed and fingerprints wrapper plus tracked source tree', async () => {
  const source = await readFile(common, 'utf8');
  assert.doesNotMatch(source, /echo unknown/);
  assert.match(source, /rev-parse --verify HEAD/);
  assert.match(source, /source_tree_hash/);
  assert.match(source, /BASH_SOURCE\[0\]/);
  assert.match(source, /wrapper_script/);

  const root = await mkdtemp(join(tmpdir(), 'pipeline-provenance-'));
  const bin = join(root, 'bin');
  const marker = join(root, 'psql-called');
  const wrapper = join(root, 'wrapper.sh');
  await import('node:fs/promises').then(({ mkdir }) => mkdir(bin));
  await writeFile(join(bin, 'git'), '#!/usr/bin/env bash\nexit 41\n');
  await writeFile(
    join(bin, 'psql'),
    `#!/usr/bin/env bash\ntouch ${JSON.stringify(marker)}\nexit 0\n`,
  );
  await chmod(join(bin, 'git'), 0o700);
  await chmod(join(bin, 'psql'), 0o700);
  await writeFile(
    wrapper,
    `#!/usr/bin/env bash\nset -euo pipefail\nROOT=${JSON.stringify(root)}\nDB_URL=postgresql://fixture\nsource ${JSON.stringify(common)}\npipeline_record_stage_success fixture-stage 2026-07-20T00:00:00Z\n`,
  );
  await chmod(wrapper, 0o700);

  try {
    const result = spawnSync('bash', [wrapper], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    assert.notEqual(result.status, 0);
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
