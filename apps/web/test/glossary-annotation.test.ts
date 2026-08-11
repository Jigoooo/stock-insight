import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  annotateSection,
  annotateText,
  buildGlossaryIndex,
  excludedByAssetName,
  GLOSSARY_ANNOTATION_LIMIT,
  normalizeGlossaryTerm,
  type GlossarySegment,
} from '../src/features/glossary/model/glossary-index.ts';

import type { EntityGlossaryTerm } from '@stock-insight/contracts';

function term(name: string, definition = `${name} 의 뜻`, sources: string[] = []) {
  return {
    term: name,
    definition,
    sources: sources.map((label) => ({ label, url: `https://example.test/${label}` })),
  } satisfies EntityGlossaryTerm;
}

function annotatedTerms(segments: readonly GlossarySegment[]) {
  return segments.flatMap((segment) => (segment.kind === 'term' ? [segment.text] : []));
}

function joined(segments: readonly GlossarySegment[]) {
  return segments.map((segment) => segment.text).join('');
}

describe('용어 색인 — 세 상태를 구분한다', () => {
  it('필드가 없으면 unsupported, 빈 배열이면 empty', () => {
    assert.equal(buildGlossaryIndex(undefined).state, 'unsupported');
    assert.equal(buildGlossaryIndex([]).state, 'empty');
    assert.equal(buildGlossaryIndex([term('관세')]).state, 'ready');
  });

  it('출처가 없으면 text_only 로 파생한다 — 계약에는 없는 값이다', () => {
    const index = buildGlossaryIndex([term('관세'), term('환율', '환율의 뜻', ['한국은행'])]);
    assert.equal(index.entries[0]?.availability, 'text_only');
    assert.deepEqual(index.entries[0]?.sourceNames, []);
    assert.equal(index.entries[1]?.availability, 'available');
    assert.deepEqual(index.entries[1]?.sourceNames, ['한국은행']);
  });

  it('정규화가 서버 규칙(소문자)을 따르고 연속 공백을 접는다', () => {
    assert.equal(normalizeGlossaryTerm('  EV  캐즘  대응 '), 'ev 캐즘 대응');
  });

  it('같은 이름이 둘이면 먼저 온 것만 남는다', () => {
    const index = buildGlossaryIndex([term('관세', '첫째'), term('관세', '둘째')]);
    assert.equal(index.entries.length, 1);
    assert.equal(index.entries[0]?.definition, '첫째');
  });
});

describe('본문 주석 — 최장일치와 첫 등장', () => {
  const index = buildGlossaryIndex([term('관세'), term('관세 흡수형 가격정책'), term('환율')]);

  it('긴 이름이 짧은 이름을 이긴다', () => {
    const { segments } = annotateText(index, '올해는 관세 흡수형 가격정책 이 쟁점이다.');
    assert.deepEqual(annotatedTerms(segments), ['관세 흡수형 가격정책']);
  });

  it('같은 용어는 본문 안에서 한 번만 밑줄이 붙는다', () => {
    const { segments } = annotateText(index, '환율 이 오르면 환율 이 다시 문제다.');
    assert.deepEqual(annotatedTerms(segments), ['환율']);
  });

  it('원문을 한 글자도 잃지 않는다', () => {
    const text = '환율 과 관세 는 다르다.';
    assert.equal(joined(annotateText(index, text).segments), text);
  });

  it('exclude 에 든 용어는 건너뛴다 — 종목 이름과 같은 용어가 여기로 온다', () => {
    const excluded = excludedByAssetName('환율');
    const { segments } = annotateText(index, '환율 과 관세.', { exclude: excluded });
    assert.deepEqual(annotatedTerms(segments), ['관세']);
  });

  it('색인이 준비되지 않았으면 본문을 통째로 텍스트로 돌려준다', () => {
    const { segments } = annotateText(buildGlossaryIndex(undefined), '관세 이야기');
    assert.deepEqual(segments, [{ kind: 'text', text: '관세 이야기', start: 0 }]);
  });
});

describe('본문 주석 — 라틴 낱말 경계', () => {
  const index = buildGlossaryIndex([term('EV'), term('IRA')]);

  it('라틴 용어가 더 긴 낱말 안쪽에서 잡히지 않는다', () => {
    assert.deepEqual(annotatedTerms(annotateText(index, 'SEVEN 과 LIBRARY').segments), []);
  });

  it('낱말로 서 있으면 잡는다', () => {
    assert.deepEqual(annotatedTerms(annotateText(index, 'EV 와 IRA').segments), ['EV', 'IRA']);
  });
});

describe('본문 주석 — 예산은 섹션 전체를 가로지른다', () => {
  const index = buildGlossaryIndex(
    ['가', '나', '다', '라', '마', '바', '사'].map((name) => term(name)),
  );

  it('블록 하나에 다섯 개를 넘기지 않는다', () => {
    const { segments } = annotateText(index, '가 나 다 라 마 바 사');
    assert.equal(annotatedTerms(segments).length, GLOSSARY_ANNOTATION_LIMIT);
  });

  it('본문이 여럿이어도 예산과 첫 등장이 이어진다', () => {
    const plans = annotateSection(index, ['가 나 다', '다 라 마 바 사']);
    assert.deepEqual(annotatedTerms(plans[0] ?? []), ['가', '나', '다']);
    // '다' 는 첫 본문에서 이미 썼으므로 둘째 본문에서는 붙지 않고,
    // 남은 예산 2개가 '라' 와 '마' 로 간다.
    assert.deepEqual(annotatedTerms(plans[1] ?? []), ['라', '마']);
  });

  it('같은 입력을 다시 계획해도 같은 결과가 나온다 — 공유 가변 상태가 없다', () => {
    const first = annotateSection(index, ['가 나 다', '라 마 바']);
    const second = annotateSection(index, ['가 나 다', '라 마 바']);
    assert.deepEqual(first, second);
  });
});
