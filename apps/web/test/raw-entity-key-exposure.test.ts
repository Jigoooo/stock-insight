import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

/**
 * 원시 entity key 가 화면에 나가지 않는다 — UX 헌법 7번(릴리스 차단).
 *
 * `KR:005930` 은 우리 내부 표기법이고 독자의 낱말이 아니다. 이미
 * `asset-deep-dive-shell-contract.test.ts:229` 가 같은 것을 막지만, 그것은
 * **한 화면의 두 분기**를 렌더해 문자열을 보는 형태라 다른 화면은 못 본다.
 *
 * 실제로 못 봤다. `market-connection-inspector.tsx` 가 연결 종목 목록에서
 * `<small>{entity.entityKey}</small>` 로 그대로 그리고 있었고, 어느 테스트에도
 * 걸리지 않았다. 프리뷰 브라우저 검사에서도 안 드러났다 — 그 목록이 비어
 * 있었기 때문이다. **비어 있어서 통과한 검사는 통과가 아니다.**
 *
 * 그래서 렌더 결과가 아니라 **소스**를 본다. JSX 가 `{something.entityKey}` 를
 * 텍스트 자리에 놓는 순간 걸린다. key·prop·비교로 쓰는 것은 화면에 나가지
 * 않으므로 막지 않는다 — 이 구분이 이 테스트의 전부다.
 */

const SRC = new URL('../src/', import.meta.url);

/** `{x.entityKey}` 가 자식 위치에 오는 형태. `key={...}` `selected={...}` 등은 제외. */
const TEXT_POSITION = /(?<![A-Za-z])(?<!=)\{\s*[A-Za-z_$][\w$.]*\.entityKey\s*\}/;

async function collectTsx(dir: URL, found: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) await collectTsx(new URL(`${entry.name}/`, dir), found);
    else if (entry.name.endsWith('.tsx')) found.push(new URL(entry.name, dir).pathname);
  }
  return found;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('화면이 원시 entity key 를 텍스트로 그리지 않는다', async () => {
  const files = await collectTsx(SRC);
  const offenders: string[] = [];

  for (const path of files) {
    const source = stripComments(await readFile(path, 'utf8'));
    source.split('\n').forEach((line, index) => {
      // `key={...}` 같은 prop 대입은 `=` 가 바로 앞에 오므로 정규식이 거른다.
      if (TEXT_POSITION.test(line)) {
        offenders.push(`${path.split('/src/')[1]}:${index + 1} — ${line.trim().slice(0, 70)}`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `원시 entity key 가 화면 텍스트로 나간다(UX 헌법 7번):\n  ${offenders.join('\n  ')}`,
  );
});

test('검사가 실제로 텍스트 자리와 prop 자리를 가른다', () => {
  // 정규식이 둘 다 잡거나 둘 다 놓치면 이 테스트는 장식이 된다.
  assert.match('            <small>{entity.entityKey}</small>', TEXT_POSITION);
  assert.match('        {stock.entityKey}', TEXT_POSITION);
  assert.doesNotMatch('              key={stock.entityKey}', TEXT_POSITION);
  assert.doesNotMatch(
    '              selected={selectedStockKey === stock.entityKey}',
    TEXT_POSITION,
  );
  assert.doesNotMatch('  const key = entity.entityKey;', TEXT_POSITION);
});
