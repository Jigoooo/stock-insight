import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const view = readFileSync(
  new URL('../src/pages/research-workspace/ui/views/my-research-view.tsx', import.meta.url),
  'utf8',
);
const css = readFileSync(
  new URL('../src/pages/research-workspace/ui/research-workspace-page.module.css', import.meta.url),
  'utf8',
);
const presenter = readFileSync(
  new URL(
    '../src/pages/research-workspace/ui/views/decision-support-presentation.ts',
    import.meta.url,
  ),
  'utf8',
);
const content = readFileSync(
  new URL('../src/pages/research-workspace/ui/views/decision-support-content.ts', import.meta.url),
  'utf8',
);
const panelSource = view.slice(
  view.indexOf('function DecisionSupportPanel'),
  view.indexOf('export function MyResearchView'),
);

describe('P4 decision-support read-only UI', () => {
  it('renders a labelled decision-support section with explicit legal and order boundaries', () => {
    assert.match(view, /decisionSupport/);
    assert.match(view, /aria-labelledby="decision-support-title"/);
    assert.match(view, /id="decision-support-title"/);
    assert.match(view, /getDecisionSupportPresentation\(data\)/);
    assert.match(view, /<DecisionSupportContent data=\{data\}/);
    assert.match(content, /getDecisionSupportPresentation\(data\)/);
    assert.match(content, /presentation\.title/);
    assert.match(content, /presentation\.description/);
    assert.match(view, /presentation\.executionBoundary/);
    assert.match(presenter, /법률 검토 전/);
    assert.match(presenter, /PACKET_EXPIRED/);
    assert.match(presenter, /판단 패킷 만료/);
    assert.match(presenter, /주문 기능과 연결되지 않습니다/);
    assert.match(presenter, /adviceProhibited/);
    assert.match(presenter, /orderExecutable/);
  });

  it('maps every approved read-only action without creating an action control', () => {
    for (const action of [
      'ADD',
      'HOLD',
      'REDUCE',
      'EXIT',
      'WATCH',
      'NO_ACTION',
      'INSUFFICIENT_DATA',
    ]) {
      assert.match(presenter, new RegExp(`${action}:`));
    }
    const decisionUi = `${view}\n${content}\n${presenter}`;
    assert.doesNotMatch(
      decisionUi,
      /<Button|<button|<a\b|<Link\b|href=|onClick=|<form|type="submit"/i,
    );
    assert.doesNotMatch(decisionUi, /주문 실행|매수하기|매도하기/);
    const componentTags = [
      ...new Set([...panelSource.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map((match) => match[1])),
    ];
    assert.deepEqual(componentTags, ['DecisionSupportContent']);
    assert.doesNotMatch(panelSource, /packet\.(?:action|actionReason|abstentionReason)/);
    const viewComponentTags = [
      ...new Set([...view.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map((match) => match[1])),
    ];
    assert.deepEqual(viewComponentTags, [
      'DecisionSupportContent',
      'PageHeader',
      'AvailabilityNotice',
      'PersonalizationWorkspacePanel',
      'DecisionSupportPanel',
      'HistoryRows',
    ]);
  });

  it('uses the existing panel spine and a bounded responsive decision body', () => {
    assert.match(view, /styles\.panel/);
    assert.match(view, /styles\.researchSections/);
    assert.match(view, /styles\.decisionSupportBody/);
    assert.match(css, /\.researchSections\s*\{[\s\S]*display:\s*grid[\s\S]*gap:\s*24px/);
    assert.match(css, /\.decisionSupportBody\s*\{[\s\S]*grid-template-columns:/);
    assert.match(
      css,
      /@media[^}]*max-width:\s*860px[\s\S]*\.decisionSupportBody\s*\{[\s\S]*grid-template-columns:\s*1fr/,
    );
  });
});
