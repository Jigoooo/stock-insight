import { spawnSync } from 'node:child_process';

// 라이브 DB 의 읽기 표면(read surface) 계약을 "건너뛸 수 없게" 강제하는 게이트.
//
// 왜 별도 러너인가. turbo 의 `test` 태스크에 passThroughEnv 를 넣으면 URL 이 자식
// 프로세스까지 도달하지만, passThroughEnv 의 "값"은 turbo 캐시 키에 들어가지 않는다.
// 2026-08-11 실측: DB URL 을 넣고 한 번 돌린 뒤 URL 을 완전히 제거하고 다시 돌리면
// turbo 가 `skipped 45` 를 캐시에서 그대로 재생한다. 즉 `pnpm test` 는 DB 가 있던 실행과
// 없던 실행을 구분하지 못하므로 게이트가 될 수 없다. 이 러너는 turbo 를 거치지 않고
// 직접 node --test 를 띄우고 `skipped 0` 을 단언한다 — 그래서 이쪽이 게이트다.
//
// 주입하는 키는 아래 두 개뿐이다. 대상 테스트들이 실제로 읽는 키가 그 둘이기 때문이고,
// 두 개를 다 넣는 이유는 테스트가 `STOCK_INSIGHT_LIVE_READ_DB_URL ?? DATABASE_URL` 로
// 읽으므로 운영자가 어느 쪽만 설정했든 해석되게 하기 위해서다.
// 대상 파일에 세 번째 키로 gate 되는 테스트가 추가되면 `skipped 0` 이 깨지는데, 그때
// 원인을 읽을 수 있도록 주입 키를 여기 명시해 둔다.
const databaseUrl = process.env.STOCK_INSIGHT_LIVE_READ_DB_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'STOCK_INSIGHT_LIVE_READ_DB_URL or DATABASE_URL is required for the live read-surface gate',
  );
}

const env = {
  ...process.env,
  STOCK_INSIGHT_LIVE_READ_DB_URL: databaseUrl,
  DATABASE_URL: databaseUrl,
};

// 이 두 파일이 위 두 키만으로 깨어나는 전부다(2026-08-11 실측: 47 skip → 45 skip).
// 둘 다 "리더가 봐서는 안 되는 것을 라이브 DB 가 내주지 않는다"를 잰다.
const tests = [
  'test/default-privilege-contract.test.ts',
  'test/live-common-asset-view-privacy.test.ts',
  // The read half. The privacy test above EXPLAINs loadAssetSourceFacts — the BUILDER
  // store — so without this line the gate named for the common asset view watched only
  // the write side, and getCommonAssetView had no executable coverage anywhere.
  'test/live-common-asset-view-read.test.ts',
];

const result = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: process.cwd(),
  env,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
if (!/^ℹ skipped 0$/m.test(result.stdout ?? '')) {
  throw new Error('live read-surface gate requires skipped 0');
}
