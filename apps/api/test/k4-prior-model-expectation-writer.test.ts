import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseK4PriorModelExpectationArgs,
  persistK4PriorModelExpectations,
} from '../src/analytics/k4-prior-model-expectation-writer.ts';
import type { K4PriorModelExpectationPlan } from '../src/analytics/k4-prior-model-expectation.ts';

const cutoff = '2026-08-08T14:59:59.999Z';

function plan(overrides: Partial<K4PriorModelExpectationPlan> = {}): K4PriorModelExpectationPlan {
  const expectationKey = 'k4:expectation:prior_model:101:us-gaap:InventoryNet:USD:2025-12-31:v1';
  return {
    expectationKey,
    derivationKey: `k4:derivation:${expectationKey}:v1`,
    expectationKind: 'prior_model',
    modelKey: 'prior_model.annual_drift.v1',
    periodBasis: 'instant',
    issuerEntityId: 101,
    conceptNamespace: 'us-gaap',
    conceptKey: 'InventoryNet',
    targetInstantAt: '2025-12-31T23:59:59.999Z',
    targetPeriodStart: '2025-12-31',
    targetPeriodEnd: '2025-12-31',
    targetNumericFactId: 5,
    horizon: 'next_annual_period',
    expectedValue: 140,
    expectedUnit: 'USD',
    drift: 10,
    dispersion: 0,
    priorObservationCount: 4,
    priorObservations: [
      {
        numericFactId: 1,
        value: 100,
        periodEnd: '2021-12-31',
        knownAt: '2022-02-15T00:00:00.000Z',
      },
      {
        numericFactId: 2,
        value: 110,
        periodEnd: '2022-12-31',
        knownAt: '2023-02-15T00:00:00.000Z',
      },
      {
        numericFactId: 3,
        value: 120,
        periodEnd: '2023-12-31',
        knownAt: '2024-02-15T00:00:00.000Z',
      },
      {
        numericFactId: 4,
        value: 130,
        periodEnd: '2024-12-31',
        knownAt: '2025-02-15T00:00:00.000Z',
      },
    ],
    asOfAt: '2025-02-15T00:00:00.000Z',
    availableAt: '2025-02-15T00:00:00.000Z',
    knownAt: '2025-02-15T00:00:00.000Z',
    ...overrides,
  };
}

function tag(sql: string): string {
  return /\/\* (k4_[a-z0-9_]+) \*\//.exec(sql)?.[1] ?? 'untagged';
}

class FakeClient {
  readonly calls: Array<{ tag: string; params: readonly unknown[] }> = [];

  readonly options: {
    metricDefinitions?: Array<Record<string, unknown>>;
    existing?: Array<Record<string, unknown>>;
  };

  constructor(
    options: {
      metricDefinitions?: Array<Record<string, unknown>>;
      existing?: Array<Record<string, unknown>>;
    } = {},
  ) {
    this.options = options;
  }

  async query(sql: string, params: readonly unknown[] = []) {
    const queryTag = tag(sql);
    this.calls.push({ tag: queryTag, params });
    const rows: Array<Record<string, unknown>> = (() => {
      switch (queryTag) {
        case 'k4_read_expectation_metric_definition':
          return this.options.metricDefinitions ?? [{ metric_definition_id: 61 }];
        case 'k4_read_prior_model_expectation':
          return this.options.existing ?? [];
        case 'k4_insert_derivation':
          return [{ derivation_id: 21 }];
        case 'k4_insert_derivation_step':
          return [{ derivation_step_id: 22 }];
        case 'k4_compute_derivation_digest':
          return [{ derivation_digest: 'd'.repeat(64) }];
        case 'k4_seal_derivation':
          return [{ derivation_id: 21 }];
        case 'k4_insert_prior_model_expectation':
          return [{ expectation_revision_id: 71 }];
        default:
          return [];
      }
    })();
    return { rows, rowCount: rows.length };
  }
}

describe('K4 prior-model expectation persistence', () => {
  it('writes one sealed expectation citing every prior observation', async () => {
    const client = new FakeClient();
    const result = await persistK4PriorModelExpectations(client, [plan()], {
      informationSetId: 'k4:20260808:fixture',
      cutoff,
    });
    assert.equal(result.insertedCount, 1);
    assert.equal(result.skippedCount, 0);
    const inputs = client.calls.filter((call) => call.tag === 'k4_insert_derivation_input');
    assert.deepEqual(
      inputs.map((call) => call.params[3]),
      [1, 2, 3, 4],
    );
    const insert = client.calls.find((call) => call.tag === 'k4_insert_prior_model_expectation');
    assert.ok(insert);
    assert.equal(insert.params[0], plan().expectationKey);
    assert.equal(insert.params[3], 'prior_model');
    assert.equal(insert.params[8], 140);
    assert.equal(insert.params[9], 'USD');
  });

  it('writes nothing when the expectation key already exists', async () => {
    const client = new FakeClient({ existing: [{ expectation_revision_id: 71 }] });
    const result = await persistK4PriorModelExpectations(client, [plan()], {
      informationSetId: 'k4:20260808:fixture',
      cutoff,
    });
    assert.equal(result.insertedCount, 0);
    assert.equal(result.skippedCount, 1);
    assert.ok(!client.calls.some((call) => call.tag === 'k4_insert_prior_model_expectation'));
    assert.ok(!client.calls.some((call) => call.tag === 'k4_insert_derivation'));
  });

  it('reports rather than writes when the metric definition is ambiguous or missing', async () => {
    for (const metricDefinitions of [
      [{ metric_definition_id: 61 }, { metric_definition_id: 62 }],
      [],
    ]) {
      const client = new FakeClient({ metricDefinitions });
      const result = await persistK4PriorModelExpectations(client, [plan()], {
        informationSetId: 'k4:20260808:fixture',
        cutoff,
      });
      assert.equal(result.insertedCount, 0);
      assert.equal(result.unresolvedDefinitionCount, 1);
      assert.deepEqual(result.unresolvedDefinitionKeys, [plan().expectationKey]);
      // An unresolvable concept must not write a derivation it will never cite.
      assert.ok(!client.calls.some((call) => call.tag === 'k4_insert_derivation'));
      assert.ok(!client.calls.some((call) => call.tag === 'k4_insert_prior_model_expectation'));
    }
  });

  it('resolves the metric definition by the observed period basis', async () => {
    const client = new FakeClient();
    await persistK4PriorModelExpectations(
      client,
      [plan({ periodBasis: 'duration_quarter', targetInstantAt: null })],
      { informationSetId: 'k4:20260808:fixture', cutoff },
    );
    const lookup = client.calls.find(
      (call) => call.tag === 'k4_read_expectation_metric_definition',
    );
    assert.equal(lookup?.params[2], 'duration_quarter');
  });

  it('refuses an expectation that would be known after the cutoff', async () => {
    const client = new FakeClient();
    await assert.rejects(
      persistK4PriorModelExpectations(
        client,
        [plan({ knownAt: '2026-12-01T00:00:00.000Z', availableAt: '2026-12-01T00:00:00.000Z' })],
        { informationSetId: 'k4:20260808:fixture', cutoff },
      ),
      /after the cutoff/i,
    );
  });

  it('defaults to dry-run and accepts exactly one write mode', () => {
    assert.equal(parseK4PriorModelExpectationArgs(['--live', '--cutoff', cutoff]).mode, 'dry-run');
    assert.equal(
      parseK4PriorModelExpectationArgs(['--live', '--cutoff', cutoff, '--apply']).mode,
      'apply',
    );
    assert.equal(
      parseK4PriorModelExpectationArgs(['--live', '--cutoff', cutoff, '--rehearse']).mode,
      'rehearse',
    );
    assert.throws(
      () =>
        parseK4PriorModelExpectationArgs(['--live', '--cutoff', cutoff, '--apply', '--rehearse']),
      /exactly one/i,
    );
  });

  it('builds the same daily cutoffs a replay range asks for', () => {
    const args = parseK4PriorModelExpectationArgs(['--from', '2026-08-02', '--to', '2026-08-04']);
    assert.equal(args.cutoffs.length, 3);
    assert.equal(args.mode, 'dry-run');
  });

  // 이 생산자는 `securityLimit: 10` 이 근거 없이 박혀 있어 6종목만 움직였다.
  // 같은 로더를 쓰는 K4 러너는 이미 `number | null` 에 기본값 `null` 이다.
  it('leaves the security limit unbounded unless one is asked for', () => {
    assert.equal(
      parseK4PriorModelExpectationArgs(['--live', '--cutoff', cutoff]).securityLimit,
      null,
    );
    assert.equal(
      parseK4PriorModelExpectationArgs(['--from', '2026-08-02', '--to', '2026-08-04'])
        .securityLimit,
      null,
    );
  });

  it('parses --security-limit on both the live and the replay path', () => {
    assert.equal(
      parseK4PriorModelExpectationArgs(['--live', '--cutoff', cutoff, '--security-limit', '25'])
        .securityLimit,
      25,
    );
    assert.equal(
      parseK4PriorModelExpectationArgs([
        '--from',
        '2026-08-02',
        '--to',
        '2026-08-04',
        '--security-limit',
        '25',
      ]).securityLimit,
      25,
    );
  });

  // 검증이 분기 안에 있으면 한쪽 경로가 검증 없이 빠져나가므로 두 경로를 다 센다.
  it('refuses a security limit that is not a positive whole number', () => {
    for (const value of ['0', '-1', '2.5', 'ten']) {
      assert.throws(
        () =>
          parseK4PriorModelExpectationArgs([
            '--live',
            '--cutoff',
            cutoff,
            '--security-limit',
            value,
          ]),
        /--security-limit must be a positive integer/,
        `live path accepted ${value}`,
      );
      assert.throws(
        () =>
          parseK4PriorModelExpectationArgs([
            '--from',
            '2026-08-02',
            '--to',
            '2026-08-04',
            '--security-limit',
            value,
          ]),
        /--security-limit must be a positive integer/,
        `replay path accepted ${value}`,
      );
    }
  });

  it('requires a value after --security-limit', () => {
    assert.throws(
      () => parseK4PriorModelExpectationArgs(['--live', '--cutoff', cutoff, '--security-limit']),
      /--security-limit requires a value/,
    );
  });
});
