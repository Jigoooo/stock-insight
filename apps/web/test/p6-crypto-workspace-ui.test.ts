import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  formatCryptoConfidence,
  formatCryptoMagnitude,
} from '../src/pages/research-workspace/model/crypto-display.ts';

const root = new URL('../src/', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

function extractCssBlock(source: string, selector: string): string {
  const start = source.indexOf(selector);
  assert.notEqual(start, -1, `missing CSS selector: ${selector}`);
  const open = source.indexOf('{', start);
  assert.notEqual(open, -1, `missing CSS block: ${selector}`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated CSS block: ${selector}`);
}

describe('P6-6 crypto read-only workspace vertical', () => {
  it('keeps the hidden crypto view directly addressable through URL, cache, loader, and payload', async () => {
    const [page, sections, search, cache, loader, payload] = await Promise.all([
      read('pages/research-workspace/ui/research-workspace-page.tsx'),
      read('features/workspace-navigation/model/sections.ts'),
      read('pages/research-workspace/model/workspace-search.ts'),
      read('pages/research-workspace/model/workspace-view-cache.ts'),
      read('server/research-workspace-orchestrator.ts'),
      read('pages/research-workspace/model/workspace-view-payload.ts'),
    ]);
    assert.match(
      sections,
      /id: 'crypto',[\s\S]*?label: '크립토',[\s\S]*?icon: Bitcoin,[\s\S]*?href: '\/workspace\/crypto',[\s\S]*?navigationGroup: 'hidden'/,
    );
    assert.match(
      page,
      /section === 'crypto' && data\.view === 'crypto' && <CryptoWorkspaceView data=\{data\.crypto\} \/>/,
    );
    assert.match(search, /const allowedViews = new Set<WorkspaceSectionId>\(\[[\s\S]*?'crypto'/);
    assert.match(cache, /export type WorkspaceViewId =[\s\S]*?\| 'crypto'/);
    assert.match(
      payload,
      /\| \{ crypto: CryptoResearchWorkspace; shell: ResearchWorkspaceShellSummary; view: 'crypto' \}/,
    );
    const cryptoCase = loader.match(/case 'crypto':\s*\{([\s\S]*?)\n\s*break;/)?.[1] ?? '';
    assert.match(cryptoCase, /loaders\s*\.loadCrypto\(userId/);
    assert.match(cryptoCase, /\{ crypto, view: 'crypto' as const \}/);
  });

  it('renders company links, events, risk, and explicit empty/read-only states without controls', async () => {
    const view = await read('pages/research-workspace/ui/views/crypto-workspace-view.tsx');
    for (const label of [
      '크립토 리서치',
      '추적 자산',
      '기업 연결',
      '온체인 사건',
      '리스크 전파',
      '조회 전용',
      '출처 버전',
      '기준 시각',
      // 문구가 "준비되면 표시됩니다" 였는데, 그건 수집이 진행 중이라는 뜻이고
      // 사실이 아니다. crypto_serving 네 표가 0행이고 쓰는 코드가 없다(2026-08-05).
      // 빈 화면이 "곧 옴" 이 아니라 "아직 시작 안 함" 을 말해야 한다.
      '크립토는 아직 수집하지 않습니다',
      '검증',
      '검토 중',
      '봉인됨',
      '작성 중',
      '유동성 회수',
      '좌우로 밀어 전체 근거 확인',
      '최종 확정',
      '안전 확인',
    ]) {
      assert.match(view, new RegExp(label));
    }
    assert.match(view, /<DataTable[\s\S]*?caption=/);
    assert.equal((view.match(/<MetricStrip\b/g) ?? []).length, 1);
    assert.match(view, /<Panel[\s\S]*?id="crypto-assets-title"/);
    assert.match(view, /<Panel[\s\S]*?id="crypto-company-links-title"/);
    assert.match(view, /<Panel[\s\S]*?id="crypto-events-title"/);
    assert.match(view, /<Panel[\s\S]*?id="crypto-risk-title"/);
    assert.match(view, /caption="크립토 자산과 주식·기업 간 검증 관계"/);
    assert.match(view, /aria-label="크립토 리서치 제약"/);
    assert.match(view, /label: '실시간 계정·지갑'/);
    assert.match(view, /label: '주문 실행'/);
    assert.doesNotMatch(view, /kind="unavailable"/);
    assert.match(view, /주문·지갑 연결 없음/);
    assert.match(view, /data-read-only="true"/);
    assert.match(view, /data-order-executable="false"/);
    assert.doesNotMatch(
      view,
      /<(?:button|form|a)\b|href=|onClick=|매수하기|매도하기|walletConnect/i,
    );
    assert.equal(formatCryptoMagnitude('0.00001', 'ratio'), '<0.0001 ratio');
    assert.equal(formatCryptoMagnitude('-0.00001', 'ratio'), '>-0.0001 ratio');
    assert.equal(formatCryptoConfidence(0.999), '신뢰도 99.9%');
    assert.equal(formatCryptoConfidence(1), '신뢰도 100%');
    assert.match(view, /<StructuredList className=\{styles\.assetList\}/);
    assert.match(view, /<Timeline className=\{styles\.eventList\} aria-label="온체인 사건 목록">/);
    assert.match(
      view,
      /<StructuredList className=\{styles\.riskList\} aria-label="리스크 전파 목록">/,
    );
    assert.match(
      view,
      /<section[\s\S]*?aria-describedby="crypto-company-scroll-hint"[\s\S]*?aria-label="기업 연결 표 가로 스크롤 영역"[\s\S]*?tabIndex=\{0\}/,
    );
    assert.doesNotMatch(view, /<DataTable[\s\S]*?containerProps=/);
  });

  it('keeps one shared table scroll owner and mobile layout rules', async () => {
    const [css, table, tableCss] = await Promise.all([
      read('pages/research-workspace/ui/views/crypto-workspace-view.module.css'),
      read('shared/ui/table/table.tsx'),
      read('shared/ui/table/table.module.css'),
    ]);
    assert.match(extractCssBlock(css, '.tableWrap'), /overflow-x:\s*auto/);
    assert.match(extractCssBlock(css, '.tableWrap'), /min-width:\s*0/);
    assert.match(
      extractCssBlock(css, ".tableWrap [data-slot='table-container']"),
      /overflow-x:\s*visible/,
    );
    assert.match(table, /data-slot="table-container"/);
    assert.match(extractCssBlock(tableCss, '.container'), /overflow-x:\s*auto/);
    assert.match(extractCssBlock(css, '@media (max-width: 520px)'), /grid-template-columns:\s*1fr/);
  });

  it('publishes an authenticated GET-only crypto workspace endpoint', async () => {
    const route = await read('routes/api/v1/crypto/workspace.ts');
    assert.match(route, /createFileRoute\('\/api\/v1\/crypto\/workspace'\)/);
    assert.doesNotMatch(route, /authRequestMiddleware|middleware:/);
    assert.match(route, /resolveRequestUserId/);
    assert.match(route, /loadCryptoResearchWorkspace/);
    assert.match(route, /GET: createCryptoWorkspaceGetHandler\(\{/);
    assert.doesNotMatch(route, /POST|PUT|PATCH|DELETE/);
  });
});
