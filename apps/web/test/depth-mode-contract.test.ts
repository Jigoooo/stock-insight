import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  COMMON_ASSET_VIEW_BLOCK_KEYS,
  DEPTH_ASSIGNMENTS,
  detailDepthFor,
  type DepthAssignmentKey,
} from '../src/shared/depth/depth-assignment.ts';
import {
  DEPTH_LEVELS,
  DEPTH_MODE_OPTIONS,
  DEPTH_MODES,
  expandedLevelsAt,
  isExpandedAt,
  type DepthLevel,
} from '../src/shared/depth/depth-mode.ts';

import { commonAssetViewBlockKeys } from '@stock-insight/contracts/common-asset-view';

const sourceRoot = new URL('../src/', import.meta.url);

/** 깊이 모드를 읽어도 되는 유일한 두 파일. 정규식 예외가 아니라 눈에 보이는 목록. */
const DEPTH_MODE_READERS = [
  'src/shared/depth/depth-gate.tsx',
  'src/shared/depth/depth-mode-toggle.tsx',
] as const;

/** 뷰가 사는 레이어. 여기에는 깊이 분기가 있으면 안 된다. */
const PRODUCT_LAYERS = ['pages', 'widgets', 'features', 'entities'] as const;

async function readSourceTree(directory: URL): Promise<Array<{ path: string; source: string }>> {
  const sources: Array<{ path: string; source: string }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, directory);
    if (entry.isDirectory()) sources.push(...(await readSourceTree(child)));
    else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
      sources.push({ path: child.pathname, source: await readFile(child, 'utf8') });
    }
  }
  return sources;
}

function relativeToWeb(path: string): string {
  const index = path.indexOf('/src/');
  return index === -1 ? path : path.slice(index + 1);
}

describe('깊이 3모드 — 단조성', () => {
  it('펼침 집합이 essential ⊆ standard ⊆ research 로 커진다', () => {
    const beginner = new Set(expandedLevelsAt('beginner'));
    const standard = new Set(expandedLevelsAt('standard'));
    const research = new Set(expandedLevelsAt('research'));

    assert.deepEqual([...beginner], ['essential']);
    for (const level of beginner) assert.ok(standard.has(level), `standard 가 ${level} 을 잃었다`);
    for (const level of standard) assert.ok(research.has(level), `research 가 ${level} 을 잃었다`);
    assert.equal(research.size, DEPTH_LEVELS.length, 'research 는 모든 깊이를 펼쳐야 한다');
  });

  it('배정된 모든 항목이 모드가 깊어질수록 펼쳐지기만 한다', () => {
    const regressions: string[] = [];
    for (const [key, assignment] of Object.entries(DEPTH_ASSIGNMENTS)) {
      const levels: DepthLevel[] = [assignment.depth];
      if (assignment.detailDepth) levels.push(assignment.detailDepth);
      for (const level of levels) {
        const expanded = DEPTH_MODES.map((mode) => isExpandedAt(mode, level));
        for (let index = 1; index < expanded.length; index += 1) {
          if (expanded[index - 1] === true && expanded[index] !== true) {
            regressions.push(`${key}/${level}: ${DEPTH_MODES[index]} 에서 다시 접혔다`);
          }
        }
      }
    }
    assert.deepEqual(regressions, []);
  });

  it('모드 목록과 토글 옵션이 같은 순서로 같은 값을 쓴다', () => {
    assert.deepEqual(
      DEPTH_MODE_OPTIONS.map((option) => option.value),
      [...DEPTH_MODES],
    );
    // UX 헌법 7번: 라벨은 한국어, 내부 enum 은 value 에만.
    for (const option of DEPTH_MODE_OPTIONS) {
      assert.match(option.label, /^[가-힣]+$/, `${option.value} 라벨이 한국어가 아니다`);
    }
  });
});

describe('깊이 3모드 — 배정표 완전성', () => {
  // 여기 있던 것은 `apps/api` 의 리터럴을 정규식으로 긁어 프런트 사본과 비교하는
  // 표류 테스트였다. 2026-08-11 CAV 읽기 경로가 blockKey 어휘를 계약 패키지로
  // 옮기면서 사본이 사라졌고(`depth-assignment.ts` 는 이제 계약을 재수출한다),
  // 비교할 두 벌이 없으므로 테스트도 지웠다. 어긋날 수 없게 만드는 것이 어긋남을
  // 잡는 것보다 낫다.
  //
  // 배정표가 계약을 따라가는지는 아래 "표에 정확히 1회" 테스트가 지킨다 — 계약이
  // 블록을 하나 더 들고 오면 배정표에 행이 없어서 그쪽이 깨진다. 여기 남은 것은
  // 계약 자체가 12블록이라는 정본 06 §2 의 수 하나뿐이다. (재수출이 같은 배열인지
  // 재는 단언은 두지 않았다 — 참조 동등은 항상 참이라 절대 깨지지 않는 장식이다.)
  it('계약이 정본 06 §2 의 12블록을 든다', () => {
    assert.equal(commonAssetViewBlockKeys.length, 12);
  });

  it('모든 blockKey 가 표에 정확히 1회 등장한다', () => {
    /*
      **표가 24행에서 12행이 됐다.**

      뒤의 12행은 `stock-deep-dive.ts` 의 deep dive 섹션 ID 사본이었고, 그것을
      조회하는 코드가 없었다 — `assignmentFor()` 의 유일한 호출부
      (`asset-section.tsx:39`)가 받는 인자는 CAV 블록 키다. 정본 01 §3 의 하위
      섹션은 `pages/asset-deep-dive` 의 11탭이 CAV 블록 위에서 이미 덮고 있고,
      `asset-tabs.ts` 주석이 "표에 행을 더하지 않는 것이 배정을 어기는 게 아니라
      배정을 그대로 쓰는 것" 이라고 그 관계를 적어뒀다.

      **이 단언이 지키던 것은 그대로 지킨다** — 선언한 키와 표의 키가 정확히
      일치한다는 것. 달라진 것은 정본이 두 벌에서 한 벌이 된 것뿐이고, 그래서
      맞춰볼 사본도 사라졌다. 어긋날 두 벌이 없는 편이 어긋남을 잡는 테스트보다
      낫다는 이 파일의 원래 원칙이 이제 표 전체에 적용된다.
    */
    const expected = [...COMMON_ASSET_VIEW_BLOCK_KEYS];
    const tableKeys = Object.keys(DEPTH_ASSIGNMENTS) as DepthAssignmentKey[];

    assert.equal(new Set(expected).size, expected.length, 'blockKey 가 중복된다');
    assert.equal(tableKeys.length, expected.length, '표 행 수가 정본 키 수와 다르다');
    assert.deepEqual([...tableKeys].sort(), [...expected].sort());
  });

  it('모든 행이 유효한 깊이와 화면, 그리고 출처를 갖는다', () => {
    for (const [key, assignment] of Object.entries(DEPTH_ASSIGNMENTS)) {
      assert.ok(DEPTH_LEVELS.includes(assignment.depth), `${key}: 알 수 없는 깊이`);
      if (assignment.detailDepth) {
        assert.ok(DEPTH_LEVELS.includes(assignment.detailDepth), `${key}: 알 수 없는 상세 깊이`);
      }
      assert.ok(assignment.surfaces.length > 0, `${key}: 화면이 없다`);
      assert.ok(assignment.source.length > 0, `${key}: 배정 출처가 비어 있다`);
    }
  });
});

describe('깊이 3모드 — 분기 금지', () => {
  it('뷰 레이어가 깊이 모드 API 를 전혀 읽지 않는다', async () => {
    const sources = (
      await Promise.all(
        PRODUCT_LAYERS.map((layer) => readSourceTree(new URL(`${layer}/`, sourceRoot))),
      )
    ).flat();

    const violations = sources.flatMap(({ path, source }) => {
      const found: string[] = [];
      // 모드를 읽는 API 를 뷰가 부르는 순간 렌더 타임 분기가 생긴다.
      for (const forbidden of [
        /\buseDepthMode\b/,
        /\bisExpandedAt\b/,
        /\bexpandedLevelsAt\b/,
        /\bDEPTH_MODES\b/,
        /\bdepthMode\b/,
        // `\bdepthMode\b` 는 대소문자를 구분하므로 `DepthModeContext` 에 걸리지
        // 않는다. 그런데 그 컨텍스트는 `depth-context.tsx` 가 그대로 export 하고,
        // 배럴을 우회해 깊은 경로로 import 하면 뷰가 모드를 읽어 분기할 수 있다.
        // 배럴 좁히기와 같은 논리다 — 우회하려면 이름으로 파고들어야 하고,
        // 그때 이 가드가 봐야 한다.
        /\bDepthModeContext\b/,
      ]) {
        if (forbidden.test(source)) found.push(`${relativeToWeb(path)}: ${forbidden.source}`);
      }
      // 모드 리터럴 비교. 'standard' 는 다른 도메인에도 흔해 제외하고,
      // 깊이 모드에만 쓰이는 두 리터럴로 잡는다.
      for (const comparison of source.matchAll(
        /[!=]==\s*['"](?:beginner|research)['"]|['"](?:beginner|research)['"]\s*[!=]==/g,
      )) {
        found.push(`${relativeToWeb(path)}: ${comparison[0]}`);
      }
      return found;
    });

    assert.deepEqual(violations, []);
  });

  it('useDepthMode 소비자가 게이트와 토글 둘뿐이다', async () => {
    const sources = await readSourceTree(sourceRoot);
    const consumers = sources
      .filter(
        ({ path, source }) =>
          !path.endsWith('/shared/depth/use-depth-mode.ts') && /\buseDepthMode\b/.test(source),
      )
      .map(({ path }) => relativeToWeb(path))
      .sort();

    assert.deepEqual(consumers, [...DEPTH_MODE_READERS].sort());
  });

  it('공개 배럴이 useDepthMode 를 내보내지 않는다', async () => {
    const barrel = await readFile(new URL('shared/depth/index.ts', sourceRoot), 'utf8');
    assert.doesNotMatch(barrel, /useDepthMode/);
    assert.match(barrel, /DepthGate/);
  });
});

/**
 * 표가 선언한 것을 화면이 **실제로 이행하는가.**
 *
 * 기존 세 묶음은 표의 모양(단조성·완전성)과 뷰의 금기(분기 금지)만 본다. 그
 * 사이에 아무도 보지 않는 자리가 있었다: `detailDepth` 는 IA §4 행 11 을 전사해
 * 선언돼 있었는데 **어느 화면도 그것을 조회하지 않았다.** 한 화면 안의 두 슬롯
 * 이라고 오전사된 주석 때문에 아무도 두 번째 화면을 찾지 않았고, 라이브에서
 * 종목 상세의 표준 모드와 연구 모드가 바이트 단위로 같아졌다(2026-08-12 실측).
 *
 * 모양만 보는 테스트는 그것을 잡을 수 없다. 선언마다 **조회하는 코드가 있는지**
 * 를 보는 것이 그 틈이다.
 */
describe('깊이 3모드 — 선언한 것은 이행된다', () => {
  it('detailDepth 가 배정된 키는 detailDepthFor 로 조회되는 화면을 갖는다', async () => {
    const declared = (Object.keys(DEPTH_ASSIGNMENTS) as DepthAssignmentKey[]).filter(
      (key) => DEPTH_ASSIGNMENTS[key].detailDepth !== undefined,
    );
    const sources = await readSourceTree(sourceRoot);
    const unhonoured = declared.filter(
      (key) => !sources.some(({ source }) => source.includes(`detailDepthFor('${key}')`)),
    );

    assert.deepEqual(
      unhonoured,
      [],
      `이 키들은 상세 깊이를 배정받았지만 그것을 조회하는 화면이 없다. 화면을 짓거나, IA §4 를 다시 읽고 배정을 내려라:\n  ${unhonoured.join('\n  ')}`,
    );
  });

  it('detailDepthFor 는 배정이 없는 키에서 조용히 요약 깊이로 떨어지지 않는다', () => {
    // `?? assignment.depth` 폴백이 들어오면 이 단언이 먼저 깨진다. 그 한 줄이
    // 표가 처음으로 하중을 받는 자리에서 표를 무력화한다.
    assert.throws(
      () => detailDepthFor('identity_economic_claim'),
      /상세 깊이가 배정되지 않았습니다/,
    );
    assert.equal(detailDepthFor('coverage_freshness_uncertainty'), 'research');
  });

  it('배럴은 호출자가 없는 조회 함수를 내보내지 않는다', async () => {
    // `assignmentKeysForSurface` 가 그렇게 살아 있었다 — 배럴 재수출이 유일한
    // 참조라 "쓰이는 것처럼" 보였다. 배럴은 사용 증거가 아니다.
    const barrel = await readFile(new URL('shared/depth/index.ts', sourceRoot), 'utf8');
    const exported = [...barrel.matchAll(/^\s{2}([a-z][A-Za-z]+),$/gm)].map((match) => match[1]);
    const sources = (await readSourceTree(sourceRoot)).filter(
      ({ path }) => !path.includes('/shared/depth/'),
    );
    const unused = exported.filter(
      (name) => !sources.some(({ source }) => new RegExp(`\\b${name}\\s*\\(`).test(source)),
    );

    assert.deepEqual(
      unused,
      [],
      `배럴이 내보내는데 shared/depth 밖에서 아무도 부르지 않는다. 쓰거나 내려라:\n  ${unused.join('\n  ')}`,
    );
  });
});
