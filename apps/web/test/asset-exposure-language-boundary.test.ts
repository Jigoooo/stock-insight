import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

/**
 * 노출·관계 화면이 **동조를 인과로 바꾸지 않는다**(REQ-MKT-001).
 *
 * 이 보증은 원래 `stock-deep-dive-impact.test.ts` 에 있었다. 그 파일은 12섹션
 * 기계와 함께 은퇴했는데, 거기 있던 단언 중 하나는 모듈이 아니라 **제품의 언어
 * 경계**를 지키고 있었다:
 *
 *   moves_with 는 '함께 움직임' 이지 '영향' 이 아니다 — MACRO_COMOVEMENT 는
 *   두 값이 같이 움직였다는 것만 재고, 어느 쪽이 어느 쪽을 움직였는지는 재지 않는다.
 *
 * 대체 화면(`pages/asset-deep-dive`)은 경로 문구를 만들지 않고 종목 코드만
 * 그리므로 옛 단언을 그대로 옮길 대상이 없다. 그래서 **문구가 생기는 순간**
 * 걸리도록 표면 전체를 검사하는 형태로 다시 세운다. 지키던 것을 잃지 않으면서
 * 사라진 구현에 묶이지 않는 방법이다.
 *
 * 은퇴한 파일이 지키던 나머지 단언(목록 상한 고지, 실패의 국소화)은 대체 화면의
 * `asset-deep-dive-shell-contract.test.ts` 가 이미 같은 성질을 검사한다 —
 * "counts distinct events and claims completeness against that number",
 * "keeps absence and failure distinct in copy and in announcement".
 */

const SURFACE = new URL('../src/pages/asset-deep-dive/', import.meta.url);

/**
 * 인과를 주장하는 낱말. 측정이 담지 않은 방향을 문장이 만들어내는 자리다.
 * `영향 경로`(impact path)는 이 저장소가 파이프라인 산출물에 붙인 고유명사라
 * 제외한다 — 그것을 금지하면 단언이 이름을 못 부르게 만든다.
 */
const CAUSAL = ['때문', '유발', '이끌', '초래', '탓으로'];

async function collectSources(dir: URL, found: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) await collectSources(new URL(`${entry.name}/`, dir), found);
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      found.push(new URL(entry.name, dir).pathname);
    }
  }
  return found;
}

/** 주석은 설명이고 화면이 아니다. 사람에게 나가는 문자열만 본다. */
function userFacingStrings(source: string): string[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return [...withoutComments.matchAll(/'([^'\n]{4,})'|"([^"\n]{4,})"/g)]
    .map((match) => match[1] ?? match[2] ?? '')
    .filter((text) => /[가-힣]/.test(text));
}

test('노출 화면의 문구가 동조를 인과로 바꾸지 않는다', async () => {
  const files = await collectSources(SURFACE);
  const offenders: string[] = [];

  for (const path of files) {
    const source = await readFile(path, 'utf8');
    for (const text of userFacingStrings(source)) {
      for (const word of CAUSAL) {
        if (text.includes(word)) {
          offenders.push(`${path.split('/asset-deep-dive/')[1]}: "${text.slice(0, 60)}"`);
        }
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `측정이 담지 않은 방향을 문장이 주장한다:\n  ${offenders.join('\n  ')}`,
  );
});

test('검사가 실제로 화면 문구를 보고 있다', async () => {
  // 정규식이 조용히 0개를 매치하면 위 테스트는 장식이 된다.
  const files = await collectSources(SURFACE);
  let total = 0;
  for (const path of files) total += userFacingStrings(await readFile(path, 'utf8')).length;
  assert.ok(total > 50, `한국어 화면 문구가 ${total}개뿐이다 — 추출이 깨졌다`);
});
