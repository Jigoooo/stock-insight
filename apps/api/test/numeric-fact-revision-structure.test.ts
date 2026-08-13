import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findRevisionStructureViolations,
  immutableClaimStructure,
  type ExistingNumericFactState,
  type NumericFactRow,
  type PlannedWrite,
} from '../src/backfill/numeric-fact-plan.ts';

/**
 * 픽스처는 2026-08-11 에 실제로 파이프라인을 멈춘 행이다.
 *
 * `dart:20260807000176:BS:10:ifrs-full_CurrentTaxAssets:-:period` 가
 * `dart:20260515001686:...` 를 정정하면서 리비전 2가 됐고, 앞 행이
 * 2026-08-08 배치라 `metricDefinitionKey` 를 들고 있지 않았다.
 *
 * 지어낸 문자열로 시험하면 규칙이 통과하는 것만 보이고 **놓쳐야 할 것을
 * 놓치는지**는 안 보인다. 오늘 이 저장소에서 그 실수를 이미 두 번 했다.
 */
const BASE: NumericFactRow = {
  factKey: 'dart:20260807000176:BS:10:ifrs-full_CurrentTaxAssets:-:period',
  restatementGroupKey: 'dart:455:ifrs-full:CurrentTaxAssets:i:2026-03-31T23:59:59.999Z:BS:x:period',
  entityId: 455,
  conceptNamespace: 'ifrs-full',
  conceptKey: 'CurrentTaxAssets',
  value: 1234,
  unit: 'krw',
  currency: 'KRW',
  scalePower: 0,
  periodStart: null,
  periodEnd: null,
  instantAt: '2026-03-31T23:59:59.999Z',
  fiscalYear: 2026,
  fiscalQuarter: 1,
  dimensionsJson: {},
  locator: {},
  sourceRevisionId: 1,
  availableAt: '2026-08-07T00:00:00.000Z',
  knownAt: '2026-08-07T00:00:00.000Z',
  metadata: {},
  definitionKey: 'dart.ifrs-full.currenttaxassets.instant.krw',
};

function existingWith(overrides: Partial<NumericFactRow>): ExistingNumericFactState {
  const stored = { ...BASE, ...overrides };
  return {
    factKeys: new Set([stored.factKey]),
    groups: new Map([
      [
        stored.restatementGroupKey,
        {
          maxRevision: 1,
          latestFactId: 1,
          latestFactKey: stored.factKey,
          latestStructure: immutableClaimStructure(stored),
        },
      ],
    ]),
  };
}

function revisionWrite(overrides: Partial<NumericFactRow> = {}): PlannedWrite {
  return {
    fact: { ...BASE, ...overrides },
    revisionNo: 2,
    supersedesFactKey: 'dart:20260515001686:BS:10:ifrs-full_CurrentTaxAssets:-:period',
    supersedesNumericFactId: 1,
  };
}

test('기록되지 않았던 지표정의키를 채우는 것은 충돌이 아니다', () => {
  // 마이그레이션 122 가 DB 쪽에서 허용하는 것과 같은 규칙. 여기만 엄격하면
  // DB 가 받아들이는 쓰기를 코드가 막는다.
  const violations = findRevisionStructureViolations(
    [revisionWrite()],
    existingWith({ definitionKey: '' }),
  );
  assert.deepEqual(violations, []);
});

test('기록된 지표정의키가 다른 값으로 바뀌면 충돌이다', () => {
  const violations = findRevisionStructureViolations(
    [revisionWrite()],
    existingWith({ definitionKey: 'dart.ifrs-full.currenttaxassets.duration_quarter.krw' }),
  );
  assert.equal(violations.length, 1);
  assert.deepEqual(
    violations[0]?.differing.map((entry) => entry.field),
    ['definitionKey'],
  );
});

test('기간은 DB 와 같은 정밀도로 비교한다', () => {
  // 저장된 값은 DATE 컬럼이라 `2026-01-01`, 계획 쪽은 ISO 문자열이라
  // `2026-01-01T00:00:00.000Z` 다. 문자열로 비교하면 같은 날짜가 다르다고
  // 보고되고, 처음 이 검사를 붙였을 때 실제로 46건이 그렇게 나왔다.
  const violations = findRevisionStructureViolations(
    [
      revisionWrite({
        instantAt: null,
        periodStart: '2026-01-01T00:00:00.000Z',
        periodEnd: '2026-03-31T23:59:59.999Z',
      }),
    ],
    existingWith({
      instantAt: null,
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
    }),
  );
  assert.deepEqual(violations, []);
});

test('진짜 청구 변경은 계속 잡는다', () => {
  const violations = findRevisionStructureViolations(
    [revisionWrite({ fiscalQuarter: 2, unit: 'usd' })],
    existingWith({}),
  );
  assert.equal(violations.length, 1);
  assert.deepEqual(violations[0]?.differing.map((entry) => entry.field).sort(), [
    'fiscalQuarter',
    'unit',
  ]);
});

test('첫 리비전은 비교 대상이 없으므로 검사하지 않는다', () => {
  const first: PlannedWrite = {
    fact: BASE,
    revisionNo: 1,
    supersedesFactKey: null,
    supersedesNumericFactId: null,
  };
  assert.deepEqual(findRevisionStructureViolations([first], existingWith({})), []);
});

test('같은 배치 안에서 이어지는 리비전도 비교한다', () => {
  // 그룹 상태를 배치 진행에 따라 갱신하지 않으면, 한 실행 안에서 2차·3차
  // 리비전이 생길 때 두 번째부터는 아무것도 비교되지 않는다.
  const groupKey = BASE.restatementGroupKey;
  const writes: PlannedWrite[] = [
    {
      fact: { ...BASE, factKey: 'a', definitionKey: 'dart.x.instant.krw' },
      revisionNo: 1,
      supersedesFactKey: null,
      supersedesNumericFactId: null,
    },
    {
      fact: { ...BASE, factKey: 'b', definitionKey: 'dart.y.instant.krw' },
      revisionNo: 2,
      supersedesFactKey: 'a',
      supersedesNumericFactId: null,
    },
  ];
  const empty: ExistingNumericFactState = { factKeys: new Set(), groups: new Map() };
  const violations = findRevisionStructureViolations(writes, empty);
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.restatementGroupKey, groupKey);
  assert.equal(violations[0]?.factKey, 'b');
});
