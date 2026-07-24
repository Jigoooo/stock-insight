import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const payload = readFileSync(
  new URL('../src/pages/research-workspace/model/workspace-view-payload.ts', import.meta.url),
  'utf8',
);
const loader = readFileSync(
  new URL('../src/server/research-workspace.ts', import.meta.url),
  'utf8',
);
const view = readFileSync(
  new URL(
    '../src/pages/research-workspace/ui/views/personalization-workspace-panel.tsx',
    import.meta.url,
  ),
  'utf8',
);

describe('P4-C personalization workspace UI', () => {
  it('binds portfolio, impact, decision, history, and thesis to one research snapshot payload', () => {
    assert.match(payload, /PersonalizationResearchWorkspace/);
    for (const field of ['portfolio', 'impact', 'decision', 'decisionHistory', 'thesis']) {
      assert.match(payload, new RegExp(`${field}:`));
    }
    const researchCase = loader.match(/case 'research':\s*\{([\s\S]*?)\n\s*break;/)?.[1] ?? '';
    for (const symbol of [
      'getPersonalizationPortfolioSnapshot',
      'getPersonalizationPortfolioImpact',
      'getPersonalizationDecisionSupport',
      'getPersonalizationDecisionHistory',
      'getPersonalizationThesis',
    ]) {
      assert.match(researchCase, new RegExp(`${symbol}\\(executor`));
    }
    assert.doesNotMatch(researchCase, /fetch\(|Promise\.all/);
  });

  it('renders the complete nine-part explanation and private lineage without order controls', () => {
    for (const label of [
      '변경된 사실',
      '공통 종목 관점',
      '개인화 이유',
      '사건·지역 경로',
      '상승·하락·기간',
      '비용·세금·집중도',
      '반대 근거·미확인',
      '무효화 조건',
      '유효 기한',
      '포트폴리오 스냅샷',
      '포트폴리오 영향',
      '내 논지',
      '판단 이력',
    ]) {
      assert.match(view, new RegExp(label));
    }
    assert.match(view, /data-read-only="true"/);
    assert.match(view, /orderExecutable/);
    assert.doesNotMatch(view, /<button|<Button|<form|onClick=|매수하기|매도하기|주문 실행/i);
  });
});
