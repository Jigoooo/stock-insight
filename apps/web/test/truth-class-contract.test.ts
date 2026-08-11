import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  NOT_A_TRUTH_OBJECT,
  truthBindingForContentPackItem,
  UNDECIDED,
  type TruthBinding,
} from '../src/shared/ui/truth/truth-binding-state.ts';
import {
  TRUTH_CLASS_COPY,
  TRUTH_NON_STATE_COPY,
  truthCopyFor,
} from '../src/shared/ui/truth/truth-class-labels.ts';
import {
  assertRenderableInCommonView,
  requiresDistributionRendering,
  truthRuleFor,
} from '../src/shared/ui/truth/truth-render-guard.ts';
import {
  renderSpecForTruthClass,
  truthClassSchema,
} from '@stock-insight/contracts/truth-visual-language';

const migrationUrl = new URL(
  '../../../packages/db-schema/src/migrations/085_truth_class_binding.ts',
  import.meta.url,
);

const CSS_URL = new URL('../src/shared/ui/truth/truth.module.css', import.meta.url);

function describeBinding(binding: TruthBinding): string {
  return binding.state === 'bound' ? `bound:${binding.truthClass}` : binding.state;
}

describe('진술 종류 — 한국어 라벨(UX 헌법 7번)', () => {
  it('정본 14종이 모두 한국어 라벨과 한 줄 설명을 갖는다', () => {
    assert.equal(truthClassSchema.options.length, 14);
    for (const truthClass of truthClassSchema.options) {
      const copy = TRUTH_CLASS_COPY[truthClass];
      assert.ok(copy, `${truthClass}: 라벨이 없다`);
      assert.ok(copy.label.length > 0, `${truthClass}: 라벨이 비었다`);
      assert.ok(copy.description.length > 0, `${truthClass}: 설명이 비었다`);
    }
    assert.equal(Object.keys(TRUTH_CLASS_COPY).length, 14);
  });

  it('라벨과 설명 어디에도 내부 enum 이 새지 않는다', () => {
    const rendered = [
      ...Object.values(TRUTH_CLASS_COPY),
      ...Object.values(TRUTH_NON_STATE_COPY),
    ].flatMap((copy) => [copy.label, copy.description]);

    for (const text of rendered) {
      for (const truthClass of truthClassSchema.options) {
        assert.ok(!text.includes(truthClass), `내부 enum 노출: ${truthClass} in ${text}`);
      }
      for (const state of ['not_a_truth_object', 'undecided', 'bound']) {
        assert.ok(!text.includes(state), `내부 상태 노출: ${state} in ${text}`);
      }
      // 라틴 대문자 식별자(SCREAMING_SNAKE)는 전부 내부 어휘다.
      assert.doesNotMatch(text, /[A-Z]{3,}/, `대문자 식별자 노출: ${text}`);
    }
  });

  it('라벨이 서로 구별된다 — 같은 이름이면 구분이 아니다', () => {
    const labels = [...Object.values(TRUTH_CLASS_COPY), ...Object.values(TRUTH_NON_STATE_COPY)].map(
      (copy) => copy.label,
    );
    assert.equal(new Set(labels).size, labels.length);
  });

  it('“주장 아님”과 “분류 전”을 합치지 않는다', () => {
    // 085 가 문단을 따로 들여 구분한 자리. 하나로 뭉치면 거짓말이 된다.
    assert.notEqual(
      TRUTH_NON_STATE_COPY.not_a_truth_object.label,
      TRUTH_NON_STATE_COPY.undecided.label,
    );
    assert.notEqual(
      TRUTH_NON_STATE_COPY.not_a_truth_object.description,
      TRUTH_NON_STATE_COPY.undecided.description,
    );
    assert.equal(truthCopyFor(NOT_A_TRUTH_OBJECT), TRUTH_NON_STATE_COPY.not_a_truth_object);
    assert.equal(truthCopyFor(UNDECIDED), TRUTH_NON_STATE_COPY.undecided);
  });
});

describe('진술 종류 — 085 바인딩 표류 감지', () => {
  it('웹 로컬 맵이 마이그레이션 085 의 다섯 행과 글자 단위로 같다', async () => {
    const migration = await readFile(migrationUrl, 'utf8');
    const rows = [
      ...migration.matchAll(
        /\('serving\.content_pack_item',\s*'([a-z_]+)',\s*(NULL|'[a-z_]+'),\s*(NULL|'[A-Z_]+'),\s*'([a-z_]+)'/g,
      ),
    ];

    // 정규식이 조용히 0개를 매치하면 이 테스트는 장식이 된다. 먼저 못 박는다.
    assert.equal(rows.length, 5, '085 의 바인딩 행 수가 5가 아니다 — 바인딩이 개정되었다');

    const unquote = (value: string) => (value === 'NULL' ? null : value.slice(1, -1));

    for (const row of rows) {
      const kind = row[1] as string;
      const subkind = unquote(row[2] as string);
      const truthClass = unquote(row[3] as string);
      const state = row[4] as string;

      const local = truthBindingForContentPackItem(kind, subkind);
      const expected =
        state === 'bound' ? `bound:${truthClass}` : state === 'undecided' ? 'undecided' : state;

      assert.equal(
        describeBinding(local),
        expected,
        `085 와 어긋남: ${kind}/${subkind ?? '(없음)'} — DB 는 ${expected}, 웹은 ${describeBinding(local)}`,
      );
    }
  });

  it('바인딩이 없는 종류는 기본값이 아니라 미분류로 떨어진다', () => {
    // 지어낸 클래스는 인정된 공백보다 나쁘다(085 주석).
    assert.equal(describeBinding(truthBindingForContentPackItem('unknown_kind')), 'undecided');
    assert.equal(
      describeBinding(truthBindingForContentPackItem('evidence', 'unknown_subkind')),
      'undecided',
    );
    // 하위 종류를 모르는 evidence 는 SOURCE 로 낙관하지 않는다.
    assert.equal(describeBinding(truthBindingForContentPackItem('evidence')), 'undecided');
  });
});

describe('진술 종류 — fail-closed 렌더 가드', () => {
  it('개인 범위 진술은 공통 화면에서 던진다 (REQ-REC-001)', () => {
    const privateClasses = truthClassSchema.options.filter(
      (truthClass) => renderSpecForTruthClass(truthClass).privateScope,
    );
    assert.deepEqual(privateClasses, ['PERSONAL_DECISION']);

    assert.throws(() => assertRenderableInCommonView('PERSONAL_DECISION'), /REQ-REC-001/);
    for (const truthClass of truthClassSchema.options) {
      if (truthClass === 'PERSONAL_DECISION') continue;
      assert.doesNotThrow(() => assertRenderableInCommonView(truthClass));
    }
  });

  it('알 수 없는 클래스는 기본 스타일로 새지 않고 던진다', () => {
    assert.throws(() => assertRenderableInCommonView('NOT_A_CLASS' as never));
  });

  it('구분자는 선 모양이고 비상태는 선을 긋지 않는다', () => {
    for (const truthClass of truthClassSchema.options) {
      if (truthClass === 'PERSONAL_DECISION') continue;
      assert.equal(
        truthRuleFor({ state: 'bound', truthClass }),
        renderSpecForTruthClass(truthClass).lineStyle,
      );
    }
    assert.equal(truthRuleFor(UNDECIDED), 'none');
    assert.equal(truthRuleFor(NOT_A_TRUTH_OBJECT), 'none');
  });

  it('전망은 점이 아니라 범위로 그리라는 규칙이 배선에 남아 있다', () => {
    assert.equal(requiresDistributionRendering({ state: 'bound', truthClass: 'FORECAST' }), true);
    assert.equal(requiresDistributionRendering({ state: 'bound', truthClass: 'RELATION' }), false);
    assert.equal(requiresDistributionRendering(UNDECIDED), false);
  });
});

describe('진술 종류 — 색으로 구분하지 않는다', () => {
  it('시각 언어 스타일시트에 색 리터럴이 없다 (WCAG 1.4.1 · UX 헌법 1번)', async () => {
    const css = await readFile(CSS_URL, 'utf8');
    assert.doesNotMatch(css, /#[\da-f]{3,8}\b/i, '색 리터럴이 들어왔다');
    assert.doesNotMatch(css, /\b(?:rgb|hsl|oklch)a?\(/i, '색 함수가 들어왔다');
    // 구분은 dash 패턴으로 한다.
    assert.match(css, /border-left-style:\s*dashed/);
    assert.match(css, /border-left-style:\s*dotted/);
  });
});
