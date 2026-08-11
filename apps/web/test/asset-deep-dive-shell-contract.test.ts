import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';

import { describeEventCoverage } from '../src/pages/asset-deep-dive/model/event-coverage.ts';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const fromWeb = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * SSR 로 실제 마크업을 뽑는다. 소스 정규식만으로는 "셸이 세 갈래 **전부**에서
 * 그려지는가" 를 확인할 수 없다 — `research-workspace-v3` 는 `WorkspaceShell`
 * 안쪽에서만 나오는 testid 라서 렌더해 봐야 나온다.
 *
 * 별칭 두 개는 순서가 중요하다. `@` 는 접두 별칭이라 더 구체적인
 * `@/pages/auth/model/auth-functions` 가 먼저 와야 한다.
 */
async function withViteServer<T>(run: (server: ViteDevServer) => Promise<T>): Promise<T> {
  const server = await createServer({
    appType: 'custom',
    configFile: false,
    resolve: {
      alias: [
        {
          find: /^@tanstack\/react-router$/,
          replacement: fromWeb('./fixtures/tanstack-router-stub.tsx'),
        },
        {
          find: /^@\/pages\/auth\/model\/auth-functions$/,
          replacement: fromWeb('./fixtures/auth-functions-stub.ts'),
        },
        { find: '@', replacement: fileURLToPath(new URL('../src', import.meta.url)) },
      ],
    },
    root: webRoot,
    server: { hmr: false, middlewareMode: true, watch: null, ws: false },
  });
  try {
    return await run(server);
  } finally {
    await server.close();
  }
}

type AssetBriefingResultShape =
  | { status: 'ready'; briefing: Record<string, unknown> }
  | { status: 'not_found'; entityKey: string }
  | { status: 'failed'; entityKey: string };

type PageModule = {
  AssetDeepDivePage: ComponentType<{
    activeTab: null;
    children: ReactNode;
    result: AssetBriefingResultShape;
  }>;
};
type DepthModule = {
  DepthModeProvider: ComponentType<{ children: ReactNode; pinnedMode: string }>;
};

const CHILD_MARKER = 'ASSET_DEEP_DIVE_OUTLET_MARKER';

/**
 * `ready` 갈래의 최소 briefing. 패킷이 아직 없는 종목의 모양이라 픽스처 없이도
 * 셸·헤더·탭까지 전부 그려진다(`AssetAboveTheFold` 는 `packet === null` 에서
 * 아예 그려지지 않는다).
 */
const readyBriefing = {
  entityKey: 'KR:005930',
  commonAssetView: null,
  stockDetail: null,
  partialFailures: {},
};

async function renderBranches(): Promise<Record<'ready' | 'not_found' | 'failed', string>> {
  return withViteServer(async (server) => {
    const page = (await server.ssrLoadModule(
      '/src/pages/asset-deep-dive/ui/asset-deep-dive-page.tsx',
    )) as unknown as PageModule;
    const depth = (await server.ssrLoadModule(
      '/src/shared/depth/depth-context.tsx',
    )) as unknown as DepthModule;

    const render = (result: AssetBriefingResultShape) =>
      renderToStaticMarkup(
        createElement(
          depth.DepthModeProvider,
          { pinnedMode: 'standard' },
          createElement(
            page.AssetDeepDivePage,
            { activeTab: null, result },
            createElement('p', null, CHILD_MARKER),
          ),
        ),
      );

    return {
      ready: render({ status: 'ready', briefing: readyBriefing }),
      not_found: render({ status: 'not_found', entityKey: 'KR:005930' }),
      failed: render({ status: 'failed', entityKey: 'KR:005930' }),
    };
  });
}

describe('asset deep dive renders inside the workspace shell', () => {
  // 셸 밖에 있던 동안 `DepthModeToggle` 이 이 화면 어디에도 없었다. 깊이 게이트가
  // 가장 많이 걸린 화면에서 모드를 바꿀 손잡이가 없다는 뜻이고, 그것이
  // `REQ-PROD-002` 를 이 화면에서 도달 불가로 만들었다.
  it('wraps the page in WorkspaceShell so the depth toggle and navigation exist', async () => {
    const page = await read('pages/asset-deep-dive/ui/asset-deep-dive-page.tsx');

    assert.match(page, /import \{ WorkspaceShell \} from '@\/widgets\/workspace-shell'/);
    assert.match(page, /<WorkspaceShell[\s\S]*activeSection="stocks"/);
    assert.match(page, /navigationItems=\{workspaceSections\}/);
    assert.match(page, /onLogout=\{\(\) => void handleLogout\(\)\}/);
    assert.match(page, /<\/WorkspaceShell>/);
  });

  // 토글이 실제로 셸 안에 있다는 것까지 확인한다. 셸을 감싸 놓고 토글이
  // 사라지면 이 화면의 깊이 배정이 다시 무력해진다.
  it('keeps the depth toggle inside the shell chrome for desktop and mobile', async () => {
    const [shell, topbar] = await Promise.all([
      read('widgets/workspace-shell/ui/workspace-shell.tsx'),
      read('widgets/workspace-shell/ui/workspace-topbar.tsx'),
    ]);

    // 데스크톱·compact: 상단바 contextualActions 자리.
    assert.match(topbar, /mode !== 'mobile' \? \([\s\S]*<DepthModeToggle \/>/);
    // 390px: 상단바에 3옵션 토글을 더 얹으면 가로가 넘치므로 탐색 시트 푸터.
    assert.match(shell, /SheetFooter[\s\S]*<DepthModeToggle \/>/);
  });

  // 셸은 `Children.toArray(children)` 의 첫 원소만 `workspace-content` 안에 넣고
  // 나머지는 오버레이로 **밖에** 둔다. 자식이 둘이 되면 페이지 절반이 셸 콘텐츠
  // 영역 밖으로 나간다.
  it('hands the shell exactly one child element', async () => {
    const page = await read('pages/asset-deep-dive/ui/asset-deep-dive-page.tsx');
    // 헤더 주석이 `<WorkspaceShell>` 을 설명하므로 코드 영역만 센다.
    const code = page.slice(page.indexOf('export function AssetDeepDivePage'));
    const shellBody = code.slice(
      code.indexOf('<WorkspaceShell'),
      code.indexOf('</WorkspaceShell>'),
    );

    assert.match(shellBody, /<div className=\{styles\.page\} data-testid="asset-deep-dive">/);
    assert.equal((shellBody.match(/data-testid="asset-deep-dive"/g) ?? []).length, 1);
    // 셸은 갈래 **밖**에 한 번만 있다. 갈래마다 감싸면 부재·실패에서 셸이
    // 빠질 여지가 생기고, 그것이 이 화면이 겪었던 회귀다.
    assert.equal((code.match(/<WorkspaceShell/g) ?? []).length, 1);
    // 라우트 자식(하위 탭)은 `ready` 갈래 **안**에서만 그려진다. 부재·실패에서
    // `<Outlet/>` 을 그리면 부모가 이미 말한 이유 위에 두 번째 고지가 겹친다.
    assert.doesNotMatch(shellBody, /\{children\}\s*<\/div>/);
    assert.match(shellBody, /<AssetDeepDiveBody[\s\S]*?\{children\}[\s\S]*?<\/AssetDeepDiveBody>/);
  });

  // 셸이 `<main>` 을 소유한다. 페이지가 하나를 더 두면 landmark 가 둘이 되고
  // Axe 가 그것을 위반으로 잡는다 — e2e 매트릭스는 `violations` 가 빈 배열이길
  // 요구한다.
  it('does not add a second main landmark under the shell', async () => {
    const sources = await Promise.all(
      [
        'pages/asset-deep-dive/ui/asset-deep-dive-page.tsx',
        'pages/asset-deep-dive/ui/asset-above-the-fold.tsx',
        'pages/asset-deep-dive/ui/asset-tab-panel.tsx',
        'pages/asset-deep-dive/ui/asset-section.tsx',
        'pages/asset-deep-dive/ui/asset-learning-cards.tsx',
      ].map(read),
    );
    for (const source of sources) assert.doesNotMatch(source, /<main[\s>]/);
  });
});

describe('loader result branches all render inside the shell', () => {
  // 이번 수정의 요점. 로더가 던지면 TanStack 이 라우트 밖 `errorComponent` 를
  // 그리고 셸이 사라진다 — 깊이 토글도, 탐색 경로도, `research-workspace-v3` 도
  // 함께 사라진다. 셋 다 셸 안이어야 한다.
  it('emits the workspace shell testid for ready, not_found and failed alike', async () => {
    const markup = await renderBranches();
    for (const [branch, html] of Object.entries(markup)) {
      assert.match(html, /data-testid="research-workspace-v3"/, `${branch} lost the shell`);
      assert.match(html, /data-testid="depth-mode-toggle"/, `${branch} lost the depth toggle`);
      assert.match(html, /data-testid="workspace-sidebar"/, `${branch} lost the navigation`);
      assert.match(html, /내 종목으로/, `${branch} lost the way back`);
    }
  });

  it('renders the briefing body and the child outlet only when ready', async () => {
    const markup = await renderBranches();

    assert.match(markup.ready, new RegExp(CHILD_MARKER));
    assert.match(markup.ready, /종목 상세 하위 항목/);
    for (const branch of ['not_found', 'failed'] as const) {
      assert.doesNotMatch(markup[branch], new RegExp(CHILD_MARKER));
      assert.doesNotMatch(markup[branch], /종목 상세 하위 항목/);
    }
  });

  // UX 헌법 6번. 오류를 부재로 위장하지 않는다 — 문구도, 스크린리더가 받는
  // announcement 도 갈라져야 한다. 문구만 비교하면 나중에 둘이 같은 낱말로
  // 수렴해도 테스트가 통과한다.
  it('keeps absence and failure distinct in copy and in announcement', async () => {
    const markup = await renderBranches();

    assert.match(markup.not_found, /아직 다루지 않는 종목입니다/);
    assert.match(markup.failed, /종목 상세를 확인하지 못했습니다/);
    assert.doesNotMatch(markup.failed, /아직 다루지 않는 종목입니다/);
    assert.doesNotMatch(markup.not_found, /종목 상세를 확인하지 못했습니다/);

    // 실패만 `alert` + `assertive` 다. 부재는 조용히 놓인다.
    assert.match(markup.failed, /data-kind="error"/);
    assert.match(markup.failed, /role="alert"/);
    assert.match(markup.failed, /aria-live="assertive"/);
    assert.match(markup.not_found, /data-kind="empty"/);
    assert.doesNotMatch(markup.not_found, /role="alert"/);
    assert.doesNotMatch(markup.not_found, /aria-live="assertive"/);
    // 실패가 부재를 주장하지 않는다.
    assert.doesNotMatch(markup.failed, /data-kind="empty"/);
  });

  // UX 헌법 7번. 부재·실패 갈래가 손에 쥔 것은 `entityKey` 뿐이고, 그 원문은
  // 내부 식별자다. `ready` 는 탭 href 에 인코딩된 키를 싣기 때문에 제외한다.
  it('never leaks the raw entity key on the absence and failure branches', async () => {
    const markup = await renderBranches();
    for (const branch of ['not_found', 'failed'] as const) {
      assert.doesNotMatch(markup[branch], /KR:|KR%3A|US:|US%3A/);
    }
  });
});

describe('recent events count what the screen actually shows', () => {
  // PayPal(220@2026-08-11) 실측: payload 9건 중 한 쌍이 제목·시각까지 같아
  // 중복 제거 후 8줄. 세는 수가 접기 전 원본이던 동안 화면은 8줄짜리 목록 위에
  // "9건 전부가 실렸습니다" 를 그렸다.
  it('counts distinct events and claims completeness against that number', async () => {
    const view = await withViteServer(async (server) => {
      const module = (await server.ssrLoadModule(
        '/src/pages/asset-deep-dive/model/asset-packet.ts',
      )) as unknown as {
        readRecentEvents: (block: { payload: Record<string, unknown> }) => {
          events: unknown[];
          keptEventCount: number;
          totalEventCount: number;
          excludedEventCount: number;
        };
      };
      const events = Array.from({ length: 8 }, (_, index) => ({
        title: `사건 ${index}`,
        knownAt: '2026-08-11T00:00:00.000Z',
      }));
      // 아홉 번째는 첫 번째와 제목·시각이 같다. 라이브 payload 의 모양이다.
      events.push({ title: '사건 0', knownAt: '2026-08-11T00:00:00.000Z' });
      // `truncated` 없음 — 빌더가 자르지 않은 경우다.
      return module.readRecentEvents({ payload: { events } });
    });

    assert.equal(view.events.length, 8);
    assert.equal(view.keptEventCount, 8);
    // 폴백도 접은 뒤 수를 본다. 9로 남으면 `totalEventCount > keptEventCount` 가
    // 참이 되어 일어나지 않은 잘림을 주장한다.
    assert.equal(view.totalEventCount, 8);
    assert.equal(view.excludedEventCount, 0);

    const copy = describeEventCoverage(view);
    assert.equal(copy, '8건 전부가 실렸습니다.');
    assert.doesNotMatch(copy, /9건/);
    assert.doesNotMatch(copy, /최근 8건만/);
  });
});

describe('event coverage copy reads the exclusion count', () => {
  it('reads actionAdviceExcludedEvents out of the block payload', async () => {
    const model = await read('pages/asset-deep-dive/model/asset-packet.ts');
    assert.match(model, /excludedEventCount: asCount\(payload\.actionAdviceExcludedEvents\)/);
  });

  it('never claims everything was carried when events were excluded', () => {
    // 라이브 실측 네 종목의 모양(한화오션·LG유플러스·삼성전기·BGF리테일).
    // 이전 문구는 넷 모두에 대해 "N건 전부가 실렸습니다" 였다.
    const cases = [
      { keptEventCount: 1, totalEventCount: 1, excludedEventCount: 7 },
      { keptEventCount: 2, totalEventCount: 2, excludedEventCount: 7 },
      { keptEventCount: 15, totalEventCount: 15, excludedEventCount: 8 },
      { keptEventCount: 1, totalEventCount: 1, excludedEventCount: 6 },
    ];
    for (const counts of cases) {
      const copy = describeEventCoverage(counts);
      assert.doesNotMatch(copy, /전부가 실렸습니다/);
      assert.match(
        copy,
        new RegExp(`확인된 ${counts.totalEventCount + counts.excludedEventCount}건`),
      );
      assert.match(copy, new RegExp(`${counts.excludedEventCount}건은 제외`));
    }
  });

  it('says everything was carried only when nothing was excluded or truncated', () => {
    assert.equal(
      describeEventCoverage({ keptEventCount: 1, totalEventCount: 1, excludedEventCount: 0 }),
      '1건 전부가 실렸습니다.',
    );
    assert.equal(
      describeEventCoverage({ keptEventCount: 2, totalEventCount: 9, excludedEventCount: 0 }),
      '전체 9건 중 최근 2건만 실렸습니다.',
    );
  });

  // 잘림과 제외가 함께 있으면 총계가 둘이 된다. 두 문장으로 적으면 어느 쪽이
  // 무엇의 총계인지 읽는 사람이 알 수 없어 한 문장으로 정합시킨다.
  it('reconciles truncation and exclusion in one sentence', () => {
    const copy = describeEventCoverage({
      keptEventCount: 2,
      totalEventCount: 9,
      excludedEventCount: 4,
    });
    assert.equal(
      copy,
      '확인된 13건 중 4건은 정보 제공 범위를 벗어나 제외했고, 남은 9건에서 최근 2건만 실렸습니다.',
    );
    assert.equal((copy.match(/\./g) ?? []).length, 1);
  });

  // 완결을 주장할 대상이 아예 없는 자리(블록 4 `not_produced`, 라이브 297 중
  // 약 120)에서 "0건 전부가 실렸습니다" 를 그리지 않는다.
  it('does not claim completeness when there is nothing to complete', () => {
    const copy = describeEventCoverage({
      keptEventCount: 0,
      totalEventCount: 0,
      excludedEventCount: 0,
    });
    assert.equal(copy, '기록된 사건이 없습니다.');
    assert.doesNotMatch(copy, /전부가 실렸습니다/);
  });

  it('names the absence when every event was excluded', () => {
    assert.equal(
      describeEventCoverage({ keptEventCount: 0, totalEventCount: 0, excludedEventCount: 5 }),
      // 이 갈래는 `no_eligible_source` 고지("근거로 삼아도 되는 자료 자체가
      // 없습니다") 바로 아래 놓인다. "확인된" 이 아니라 "수집된 사건" 이라야
      // 위 문장을 반증하지 않고 그 이유로 읽힌다.
      '수집된 사건 5건은 모두 정보 제공 범위를 벗어나 이 화면에 실리지 않았습니다.',
    );
  });

  it('is the single copy source for both the fold and the events tab', async () => {
    const [fold, tabs] = await Promise.all([
      read('pages/asset-deep-dive/ui/asset-above-the-fold.tsx'),
      read('pages/asset-deep-dive/ui/asset-tab-panel.tsx'),
    ]);
    for (const source of [fold, tabs]) {
      assert.match(source, /describeEventCoverage\(events\)/);
      assert.doesNotMatch(source, /전부가 실렸습니다/);
    }
  });

  // 내부 판정 이름(`actionAdvice…`)은 화면 문구에 나오지 않는다(UX 헌법 7번).
  it('uses reader language rather than the internal gate name', () => {
    const copy = describeEventCoverage({
      keptEventCount: 1,
      totalEventCount: 1,
      excludedEventCount: 7,
    });
    assert.match(copy, /정보 제공 범위를 벗어난/);
    assert.doesNotMatch(copy, /actionAdvice|advice|buy|sell/i);
  });
});

describe('comparability copy does not contradict itself on one screen', () => {
  // 갭 목록이 "확인된 동종 관계가 아직 없어" 라고 적는 동안 같은 화면의
  // MetricStrip 은 "확인된 동종 8~108개" 를 그렸다. 둘은 서로 다른 것을 재지만
  // 사용자가 읽는 낱말은 같았다.
  it('keeps 동종 for the metric group sense only', async () => {
    const source = await read('pages/asset-deep-dive/ui/comparability-notice.tsx');
    // 주석은 화면에 나가지 않으므로 문구 판정에서 뺀다.
    const gapList = source
      .slice(source.indexOf('className={styles.gapList}'))
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');

    assert.doesNotMatch(gapList, /동종/);
    assert.match(gapList, /비교한 기업 이름/);
    assert.match(gapList, /이름을 지목할 수 있는 기업 간 관계가 아직 기록되지 않았고/);
    // 내부 식별자(`PEER_OF`)는 화면에 나가지 않는다(UX 헌법 7번).
    assert.doesNotMatch(gapList, /PEER_OF/);
  });

  // 갭 목록은 payload 가 비어도 참인 사실이므로 판정 유무로 감추지 않는다.
  it('never gates the gap list behind the judged metric strip', async () => {
    const source = await read('pages/asset-deep-dive/ui/comparability-notice.tsx');
    const gapSection = source.slice(source.indexOf('<PropertyList'));
    assert.doesNotMatch(gapSection, /judged/);
  });
});

describe('displayText refuses enum values in a sentence slot', () => {
  /**
   * 두 가드 사이로 정확히 빠져나가던 모양을 막는다.
   *
   * `SCREAMING_SNAKE` 는 콜론이 없어 `internalKeyPattern` 을 비켜가고 `null` 도 아니라
   * `nullishText` 도 비켜간다. 라이브 반증(2026-08-12): 블록1 의
   * `economicClaim.statement` 가 297종목 중 2종목에서 문자열 `FUND_UNIT` 이다
   * (`US:XLE` · `US:XLK`, 둘 다 섹터 ETF). 그 둘은 컨트롤러의 404 조건에 걸리지 않아
   * 200 으로 도착하고, `company_profiles` 행이 없어 한 줄 설명이 비므로 그 화면에서
   * 사람 말로 된 문장은 `FUND_UNIT` 하나뿐이 된다. UX 헌법 7번은 릴리스를 막는다.
   */
  it('blocks the SCREAMING_SNAKE shape', async () => {
    await withViteServer(async (server) => {
      const module = (await server.ssrLoadModule(
        '/src/pages/asset-deep-dive/model/asset-packet.ts',
      )) as { displayText: (value: unknown) => string | null };

      for (const enumValue of [
        'FUND_UNIT',
        'COMMON_STOCK',
        'NOT_COMPARABLE',
        'NO_ELIGIBLE_SOURCE',
        'PERSONAL_DECISION',
      ]) {
        assert.equal(module.displayText(enumValue), null, enumValue);
      }
    });
  });

  /**
   * 반대 방향이 이 패턴의 폭을 정한다. 밑줄 없는 대문자 토큰까지 막으면 라이브
   * `displayName` 에 실재하는 진짜 이름 24건이 함께 사라진다 — 열거값을 이름과
   * 가르는 것은 대문자가 아니라 **밑줄**이다.
   */
  it('keeps real names that happen to be all caps', async () => {
    await withViteServer(async (server) => {
      const module = (await server.ssrLoadModule(
        '/src/pages/asset-deep-dive/model/asset-packet.ts',
      )) as { displayText: (value: unknown) => string | null };

      for (const name of [
        'NAVER',
        'HPSP',
        'ASML',
        'SK',
        'GS',
        'NHN',
        'BRTMU',
        'Energy Select Sector SPDR',
        '반도체 소재를 만드는 회사',
      ]) {
        assert.equal(module.displayText(name), name, name);
      }
    });
  });
});
