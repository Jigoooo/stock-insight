import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { DEEP_DIVE_SECTION_IDS } from '../src/pages/research-workspace/model/stock-deep-dive.ts';
import {
  COMMON_ASSET_VIEW_BLOCK_KEYS,
  DEEP_DIVE_SECTION_IDS as DEPTH_TABLE_SECTION_IDS,
  DEPTH_ASSIGNMENTS,
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

const cavPlanUrl = new URL('../../api/src/serving/common-asset-view-plan.ts', import.meta.url);
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
  it('CAV blockKey 정본과 배정표 사본이 같다', async () => {
    const source = await readFile(cavPlanUrl, 'utf8');
    const literal = /export const COMMON_ASSET_VIEW_BLOCK_KEYS = \[([\s\S]*?)\] as const;/.exec(
      source,
    );
    assert.ok(literal?.[1], 'COMMON_ASSET_VIEW_BLOCK_KEYS 리터럴을 찾지 못했다');

    const canonical = [...literal[1].matchAll(/'([a-z0-9_]+)'/g)].map((match) => match[1]);
    // 정규식이 조용히 0개를 매치하면 이 테스트는 영원히 통과하는 장식이 된다.
    assert.ok(canonical.length > 0, 'blockKey 를 하나도 추출하지 못했다');
    assert.equal(canonical.length, 12, '정본 06 §2 는 12블록이다');
    assert.deepEqual(canonical, [...COMMON_ASSET_VIEW_BLOCK_KEYS]);
  });

  it('DEEP_DIVE_SECTION_ID 정본과 배정표 사본이 같다', () => {
    assert.ok(DEEP_DIVE_SECTION_IDS.length > 0);
    assert.deepEqual([...DEPTH_TABLE_SECTION_IDS], [...DEEP_DIVE_SECTION_IDS]);
  });

  it('모든 blockKey 와 섹션 ID 가 표에 정확히 1회 등장한다', () => {
    const expected = [...COMMON_ASSET_VIEW_BLOCK_KEYS, ...DEEP_DIVE_SECTION_IDS];
    const tableKeys = Object.keys(DEPTH_ASSIGNMENTS) as DepthAssignmentKey[];

    // 두 네임스페이스가 겹치면 한쪽이 다른 쪽을 조용히 덮어쓴다.
    assert.equal(new Set(expected).size, expected.length, 'blockKey 와 섹션 ID 가 충돌한다');
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
