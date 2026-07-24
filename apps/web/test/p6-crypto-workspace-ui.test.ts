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
    const [page, search, cache, loader, payload] = await Promise.all([
      read('pages/research-workspace/ui/research-workspace-page.tsx'),
      read('pages/research-workspace/model/workspace-search.ts'),
      read('pages/research-workspace/model/workspace-view-cache.ts'),
      read('server/research-workspace.ts'),
      read('pages/research-workspace/model/workspace-view-payload.ts'),
    ]);
    assert.match(page, /\{ id: 'crypto', label: '크립토', icon: Bitcoin \}/);
    assert.match(
      page,
      /section === 'crypto' && data\.view === 'crypto' && \(\s*<CryptoWorkspaceView data=\{data\.crypto\} \/>/,
    );
    assert.match(search, /const allowedViews = new Set<SectionId>\(\[[\s\S]*?'crypto'/);
    assert.match(cache, /export type WorkspaceViewId =[\s\S]*?\| 'crypto'/);
    assert.match(
      payload,
      /\| \{ crypto: CryptoResearchWorkspace; shell: ResearchWorkspaceShellSummary; view: 'crypto' \}/,
    );
    const cryptoCase = loader.match(/case 'crypto':\s*\{([\s\S]*?)\n\s*break;/)?.[1] ?? '';
    assert.match(cryptoCase, /getCryptoResearchWorkspace\(executor/);
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
    assert.match(view, /<table/);
    assert.match(view, /<caption/);
    assert.match(view, /data-read-only="true"/);
    assert.match(view, /data-order-executable="false"/);
    assert.doesNotMatch(
      view,
      /<(?:button|form|a)\b|href=|onClick=|매수|매도|주문 실행|walletConnect/i,
    );
    assert.equal(formatCryptoMagnitude('0.00001', 'ratio'), '<0.0001 ratio');
    assert.equal(formatCryptoMagnitude('-0.00001', 'ratio'), '>-0.0001 ratio');
    assert.equal(formatCryptoConfidence(0.999), '신뢰도 99.9%');
    assert.equal(formatCryptoConfidence(1), '신뢰도 100%');
    assert.match(
      view,
      /<ul className=\{styles\.assetList\} aria-label="추적 자산 목록" role="list">/,
    );
    assert.match(
      view,
      /<ol className=\{styles\.eventList\} aria-label="온체인 사건 목록" role="list">/,
    );
    assert.match(
      view,
      /<ul className=\{styles\.riskList\} aria-label="리스크 전파 목록" role="list">/,
    );
    assert.match(
      view,
      /<section\s+className=\{styles\.tableWrap\}\s+aria-label="기업 연결 표 가로 스크롤 영역"\s+aria-describedby="crypto-company-scroll-hint"\s+tabIndex=\{0\}\s*>/,
    );
  });

  it('keeps table and mobile overflow rules bound to their own selectors', async () => {
    const css = await read('pages/research-workspace/ui/views/crypto-workspace-view.module.css');
    assert.match(extractCssBlock(css, '.tableWrap'), /overflow-x:\s*auto/);
    assert.match(extractCssBlock(css, '.tableWrap'), /min-width:\s*0/);
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
