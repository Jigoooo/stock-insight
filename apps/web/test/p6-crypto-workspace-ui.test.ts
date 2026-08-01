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
  it('routes a first-class crypto view through URL, cache, loader, and workspace payload', async () => {
    const [page, sections, search, cache, loader, payload] = await Promise.all([
      read('pages/research-workspace/ui/research-workspace-page.tsx'),
      read('features/workspace-navigation/model/sections.ts'),
      read('pages/research-workspace/model/workspace-search.ts'),
      read('pages/research-workspace/model/workspace-view-cache.ts'),
      read('server/research-workspace.ts'),
      read('pages/research-workspace/model/workspace-view-payload.ts'),
    ]);
    assert.match(
      sections,
      /\{ id: 'crypto', label: '크립토', icon: Bitcoin, href: '\/workspace\/crypto' \}/,
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
    assert.match(cryptoCase, /loadCryptoResearchWorkspace\(userId/);
    assert.match(cryptoCase, /activeSlice = \{ crypto, view: options\.view \}/);
  });

  it('renders company links, events, risk, and explicit empty/read-only states without controls', async () => {
    const view = await read('pages/research-workspace/ui/views/crypto-workspace-view.tsx');
    for (const label of [
      '크립토·기업 연결',
      '추적 자산',
      '기업 연결',
      '온체인 사건',
      '리스크 전파',
      '조회 전용',
      '출처 revision',
      '기준 시각',
      '데이터가 아직 없습니다',
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
    assert.match(view, /kind="unavailable"[\s\S]*?현재 사용할 수 없는/);
    assert.match(view, /kind="unavailable"[\s\S]*?지원하지 않음/);
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
      /<DataTable[\s\S]*?containerProps=\{\{[\s\S]*?'aria-describedby': 'crypto-company-scroll-hint',[\s\S]*?'aria-label': '기업 연결 표 가로 스크롤 영역',[\s\S]*?tabIndex: 0,[\s\S]*?\}\}/,
    );
    assert.doesNotMatch(view, /<section[\s\S]*?tabIndex=\{0\}/);
  });

  it('keeps one shared table scroll owner and mobile layout rules', async () => {
    const [css, table, tableCss] = await Promise.all([
      read('pages/research-workspace/ui/views/crypto-workspace-view.module.css'),
      read('shared/ui/table/table.tsx'),
      read('shared/ui/table/table.module.css'),
    ]);
    assert.doesNotMatch(extractCssBlock(css, '.tableWrap'), /overflow-x:/);
    assert.match(extractCssBlock(css, '.tableWrap'), /min-width:\s*0/);
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
