import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// A gate nobody runs is not a gate. `test:core-release` has existed in this package since
// it was written and is referenced by exactly one file — its own package.json entry. It is
// in no chain, so it has never once failed a release. This file is the reason the live
// read-surface gate cannot end up in the same place: it reads the two package.json files
// and fails if the wiring is removed.
//
// It touches no database, so it runs in the ordinary `pnpm test` with nothing configured.
// That is the point — the wiring is checked by a test that always runs, while the contract
// it wires up is checked by a runner that refuses to skip.
const runner = readFileSync(
  new URL('../scripts/run-live-read-surface-gate.mjs', import.meta.url),
  'utf8',
);
const apiPackage = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as {
  scripts: Record<string, string>;
};
const rootPackage = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
) as { scripts: Record<string, string> };
const turboConfig = JSON.parse(
  readFileSync(new URL('../../../turbo.json', import.meta.url), 'utf8'),
) as { tasks: Record<string, { env?: string[]; passThroughEnv?: string[] }> };

describe('live read-surface gate runner', () => {
  it('runs the contracts that wake on a live read URL and refuses to skip', () => {
    assert.match(runner, /test\/default-privilege-contract\.test\.ts/);
    assert.match(runner, /test\/live-common-asset-view-privacy\.test\.ts/);
    // The `skipped 0` assertion is the whole gate. Anchored, so a suite reporting
    // `skipped 10` cannot satisfy it by substring.
    assert.match(runner, /\^ℹ skipped 0\$/);
    assert.match(runner, /live read-surface gate requires skipped 0/);
  });

  it('injects both keys the target tests read, so either one configured is enough', () => {
    // The tests resolve `STOCK_INSIGHT_LIVE_READ_DB_URL ?? DATABASE_URL`. A runner that
    // injected only one of these would leave the other operator's environment skipping,
    // and `skipped 0` would then fail for a reason that has nothing to do with privileges.
    assert.match(
      runner,
      /process\.env\.STOCK_INSIGHT_LIVE_READ_DB_URL \?\? process\.env\.DATABASE_URL/,
    );
    assert.match(runner, /STOCK_INSIGHT_LIVE_READ_DB_URL: databaseUrl/);
    assert.match(runner, /DATABASE_URL: databaseUrl/);
    assert.match(runner, /is required for the live read-surface gate/);
  });

  it('is mandatory in the root release command', () => {
    assert.equal(
      apiPackage.scripts['test:live-read-surface'],
      'node scripts/run-live-read-surface-gate.mjs',
    );
    assert.equal(
      rootPackage.scripts['test:read-surface:db'],
      'pnpm --filter @stock-insight/api test:live-read-surface',
    );
    assert.match(rootPackage.scripts['verify:release'] ?? '', /pnpm test:read-surface:db/);
  });

  it('keeps the live read keys in turbo `env`, not `passThroughEnv`', () => {
    // Turbo runs in strict env mode, so a key absent from the task declaration never
    // reaches the child process and every test gated on it skips inside a green suite.
    //
    // 어느 목록에 두느냐가 그 다음 문제다. `passThroughEnv` 는 자식에게 값을 넘기지만
    // **해시에는 넣지 않는다**. 그 상태에서는 URL 을 제대로 넣은 실행이 오래된 no-DB
    // 캐시를 재생해 DB 계약 테스트를 조용히 건너뛴다 — 초록이 실행의 증거가 되지 못한다.
    // `env` 는 값이 해시에 들어가므로 URL 상태가 바뀌면 캐시가 무효화된다.
    //
    // 확인은 해시 **값**이 아니라 **분리 여부**로 한다: URL 있는 실행과
    // `env -u DATABASE_URL` 실행이 `@stock-insight/api#test` 에 대해 서로 다른 해시를
    // 내면 참이다. 특정 해시를 주석에 적지 않는 이유는 이 파일 자신이 그 해시의 입력이라
    // 적는 순간 무효가 되고, 값이 머신과 워킹트리에 따라 달라지기 때문이다. 숫자는
    // 아래 단언이 하는 일을 하지 못하고 반증만 당한다.
    //
    // 그래서 이 단언은 두 방향이다: `env` 에 있을 것, 그리고 `passThroughEnv` 로
    // 되돌아가 있지 않을 것. 후자가 없으면 조용히 원래대로 돌아가도 초록이다.
    const task = turboConfig.tasks['test'] ?? {};
    const env = task.env ?? [];
    const passThroughEnv = task.passThroughEnv ?? [];
    for (const key of ['DATABASE_URL', 'STOCK_INSIGHT_LIVE_READ_DB_URL']) {
      assert.ok(env.includes(key), `turbo test task must hash ${key} via \`env\``);
      assert.ok(
        !passThroughEnv.includes(key),
        `${key} must not sit in passThroughEnv — its value would leave the cache key`,
      );
    }
  });
});
