import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  buildK4RunCutoffs,
  executeK4MarketIntelligenceJob,
  parseK4MarketIntelligenceArgs,
} from '../src/analytics/k4-market-intelligence-runner.ts';
import {
  loadK4MarketIntelligenceInput,
  loadK4OutcomePlans,
  withK4MarketIntelligenceTransaction,
  type K4QueryClient,
} from '../src/analytics/k4-market-intelligence-store.ts';
import {
  K4_SHADOW_COHORT_V1,
  K4_SHADOW_COHORT_VERSION,
} from '../src/analytics/k4-shadow-cohort.ts';

class FakeClient implements K4QueryClient {
  readonly calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  private readonly responder: (
    sql: string,
    params: readonly unknown[],
  ) => Array<Record<string, unknown>>;

  constructor(
    responder: (
      sql: string,
      params: readonly unknown[],
    ) => Array<Record<string, unknown>> = () => [],
  ) {
    this.responder = responder;
  }

  async query(sql: string, params: readonly unknown[] = []) {
    this.calls.push({ sql, params });
    return { rows: this.responder(sql, params) };
  }
}

describe('K4 market-intelligence CLI', () => {
  it('defaults to a read-only seven-cutoff replay selection', () => {
    const args = parseK4MarketIntelligenceArgs(['--from', '2026-08-02', '--to', '2026-08-08']);
    assert.deepEqual(args, {
      mode: 'dry-run',
      runKind: 'replay',
      from: '2026-08-02',
      to: '2026-08-08',
      kstCutoffTime: '23:59:59.999',
      // No bound unless one is asked for. K4 evaluates the served universe; the
      // default used to be ten, which is how a validation cohort became the product.
      securityLimit: null,
    });
    assert.equal(buildK4RunCutoffs(args).length, 7);
  });

  it('accepts exactly one write mode and any positive selection bound', () => {
    // Any bound, not one magic number. The check used to demand exactly ten, which
    // meant the validation cohort could never grow into the served universe.
    for (const bound of ['1', '10', '297']) {
      assert.equal(
        parseK4MarketIntelligenceArgs([
          '--from',
          '2026-08-02',
          '--to',
          '2026-08-08',
          '--rehearse',
          '--security-limit',
          bound,
        ]).securityLimit,
        Number(bound),
      );
    }
    assert.throws(
      () =>
        parseK4MarketIntelligenceArgs([
          '--from',
          '2026-08-02',
          '--to',
          '2026-08-08',
          '--rehearse',
          '--apply',
        ]),
      /mode/i,
    );
    assert.throws(
      () =>
        parseK4MarketIntelligenceArgs([
          '--from',
          '2026-08-02',
          '--to',
          '2026-08-08',
          '--security-limit',
          '0',
        ]),
      /positive integer/i,
    );
  });

  it('requires canary to be explicit, single-cutoff, and independently applied', () => {
    const args = parseK4MarketIntelligenceArgs([
      '--canary',
      '--cutoff',
      '2026-08-09T12:00:00.000Z',
      '--apply',
    ]);
    assert.equal(args.runKind, 'canary');
    assert.deepEqual(buildK4RunCutoffs(args), ['2026-08-09T12:00:00.000Z']);
    assert.throws(
      () => parseK4MarketIntelligenceArgs(['--canary', '--cutoff', cutoff(), '--rehearse']),
      /canary.*apply/i,
    );
    assert.throws(
      () =>
        parseK4MarketIntelligenceArgs([
          '--canary',
          '--cutoff',
          cutoff(),
          '--from',
          '2026-08-02',
          '--apply',
        ]),
      /canary.*range/i,
    );
  });
});

function cutoff() {
  return '2026-08-09T12:00:00.000Z';
}

describe('K4 market-intelligence write transaction', () => {
  it('locks the exact cutoff before work and commits apply', async () => {
    const client = new FakeClient();
    const result = await withK4MarketIntelligenceTransaction(
      client,
      { mode: 'apply', cutoff: cutoff() },
      async () => 'done',
    );
    assert.equal(result, 'done');
    assert.deepEqual(
      client.calls.map((call) => call.sql.replaceAll(/\s+/g, ' ').trim()),
      ['BEGIN', 'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', 'COMMIT'],
    );
    assert.deepEqual(client.calls[1]?.params, [`k4-market-intelligence:${cutoff()}`]);
  });

  it('rolls back rehearsal and failures without committing', async () => {
    const rehearsal = new FakeClient();
    await withK4MarketIntelligenceTransaction(
      rehearsal,
      { mode: 'rehearse', cutoff: cutoff() },
      async () => undefined,
    );
    assert.equal(rehearsal.calls.at(-1)?.sql, 'ROLLBACK');

    const failed = new FakeClient();
    await assert.rejects(
      withK4MarketIntelligenceTransaction(failed, { mode: 'apply', cutoff: cutoff() }, async () => {
        throw new Error('boom');
      }),
      /boom/,
    );
    assert.equal(failed.calls.at(-1)?.sql, 'ROLLBACK');
    assert.equal(
      failed.calls.some((call) => call.sql === 'COMMIT'),
      false,
    );
  });
});

describe('K4 fixed shadow cohort', () => {
  it('pins the requested ten securities by stable market and ticker selectors', () => {
    assert.equal(K4_SHADOW_COHORT_VERSION, 'k4.semiconductor-shadow.v1');
    assert.deepEqual(K4_SHADOW_COHORT_V1, [
      { market: 'US', ticker: 'MU' },
      { market: 'US', ticker: 'AMD' },
      { market: 'US', ticker: 'INTC' },
      { market: 'KR', ticker: '000660' },
      { market: 'KR', ticker: '005930' },
      { market: 'US', ticker: 'MRVL' },
      { market: 'US', ticker: 'NVDA' },
      { market: 'US', ticker: 'ARM' },
      { market: 'US', ticker: 'AVGO' },
      { market: 'US', ticker: 'TSM' },
    ]);
    assert.equal(
      new Set(K4_SHADOW_COHORT_V1.map(({ market, ticker }) => `${market}:${ticker}`)).size,
      10,
    );
  });
});

describe('K4 cutoff-scoped canonical input loading', () => {
  it('reconstructs universe coverage while admitting only cutoff-valid issuer rules', async () => {
    const client = new FakeClient((sql) => {
      if (sql.includes('k4_semantic_snapshot')) {
        return [{ semantic_snapshot_id: 'snapshot-before-cutoff' }];
      }
      if (sql.includes('k4_security_universe')) {
        return Array.from({ length: 10 }, (_, index) => ({
          security_entity_id: index + 1,
          issuer_entity_id: index + 101,
          security_issuer_identity_id: index + 201,
          sector_playbook_id: 10,
        }));
      }
      if (sql.includes('k4_measurement_rules')) {
        return [
          {
            security_entity_id: 1,
            issuer_entity_id: 101,
            sector_playbook_id: 10,
            business_driver_id: 20,
            business_driver_measurement_rule_id: 30,
            driver_key: 'inventory_position',
            rule_key: 'inventory_yoy',
            comparison_method: 'period_end_year_over_year_delta',
            output_unit: 'currency',
            output_currency: 'USD',
            input_concept_selectors: [
              { concept_namespace: 'us-gaap', concept_keys: ['InventoryNet'] },
            ],
            direction_policy: { positive: 'negative', negative: 'positive', zero: 'ambiguous' },
            materiality_policy: { method: 'absolute_change_over_prior_absolute' },
            minimum_history_observations: 2,
            allowed_pit_classes: ['PIT_B_VERSIONED_ARTIFACT'],
            horizon: 'short',
          },
        ];
      }
      if (sql.includes('k4_numeric_facts')) {
        return [
          {
            numeric_fact_id: 1,
            entity_id: 101,
            concept_namespace: 'us-gaap',
            concept_key: 'InventoryNet',
            value: '120',
            unit: 'currency',
            currency: 'USD',
            instant_at: '2025-12-31T23:59:59.999Z',
            period_start: null,
            period_end: null,
            source_revision_id: 1001,
            source_pit_quality_id: 2001,
            pit_quality_class: 'PIT_B_VERSIONED_ARTIFACT',
            available_at: '2026-08-01T12:00:00.000Z',
            known_at: '2026-08-01T12:01:00.000Z',
            original_cell_or_xbrl_locator: { accession: 'a1' },
          },
          {
            numeric_fact_id: 2,
            entity_id: 101,
            concept_namespace: 'us-gaap',
            concept_key: 'InventoryNet',
            value: '100',
            unit: 'currency',
            currency: 'USD',
            instant_at: '2024-12-31T23:59:59.999Z',
            period_start: null,
            period_end: null,
            source_revision_id: 1002,
            source_pit_quality_id: 2001,
            pit_quality_class: 'PIT_B_VERSIONED_ARTIFACT',
            available_at: '2026-08-01T12:00:00.000Z',
            known_at: '2026-08-01T12:01:00.000Z',
            original_cell_or_xbrl_locator: { accession: 'a0' },
          },
        ];
      }
      if (sql.includes('k4_expectations')) return [];
      throw new Error(`unexpected query: ${sql}`);
    });

    const input = await loadK4MarketIntelligenceInput(client, {
      cutoff: '2026-08-08T14:59:59.999Z',
      securityLimit: 10,
    });
    assert.equal(input.securities.length, 10);
    assert.equal(input.rules.length, 1);
    assert.equal(input.facts.length, 2);
    assert.equal(input.expectations.length, 0);
    assert.match(input.informationSet.informationSetId, /^k4:/);
    assert.equal(input.informationSet.validCutoff, '2026-08-08T14:59:59.999Z');
    assert.equal(input.facts[0]?.sourcePitQualityId, 2001);
    const sql = client.calls.map((call) => call.sql).join('\n');
    assert.match(sql, /construction_mode='live_observed'/);
    assert.match(sql, /construction_mode='historical_reconstruction'/);
    assert.match(sql, /knowledge_cutoff <= \$1::timestamptz/);
    // The selection is the served universe, ordered by entity id so a bounded run is
    // reproducible. It used to be ten (market, ticker) pairs unnested WITH ORDINALITY.
    assert.match(sql, /FROM core\.v_security_universe security/);
    assert.match(sql, /row_number\(\) OVER \(ORDER BY security\.security_entity_id\)/);
    assert.doesNotMatch(sql, /playbook_key='semiconductor'/);
    assert.match(sql, /legacy_security_assignment/);
    assert.match(sql, /issuer_assignment/);
    assert.match(sql, /candidate\.known_at <= \$1::timestamptz/);
    // Cutoff and bound, nothing else. The ticker arrays are gone: passing the cohort
    // in as data is what made the sector a caller's choice rather than the data's.
    const universeCall = client.calls.find((call) => call.sql.includes('k4_security_universe'))!;
    assert.deepEqual(universeCall.params, ['2026-08-08T14:59:59.999Z', 10]);
    assert.doesNotMatch(sql, /market\.financial_fact/);
    assert.equal(
      client.calls.every(
        (call) => call.params.length === 0 || call.params[0] === input.informationSet.validCutoff,
      ),
      true,
    );
  });

  it('refuses a bounded run whose universe came back short', async () => {
    // The check the read model used to make, moved to the only place that knows what
    // was requested. A run that silently evaluated fewer securities than asked for
    // would report complete coverage of an incomplete set.
    const client = new FakeClient((sql) => {
      if (sql.includes('k4_semantic_snapshot')) return [{ semantic_snapshot_id: 'snapshot-1' }];
      if (sql.includes('k4_security_universe')) {
        return Array.from({ length: 7 }, (_, index) => ({
          security_entity_id: index + 1,
          issuer_entity_id: index + 101,
          security_issuer_identity_id: index + 201,
          sector_playbook_id: 10,
        }));
      }
      throw new Error('loader continued past the short universe');
    });
    await assert.rejects(
      loadK4MarketIntelligenceInput(client, {
        cutoff: '2026-08-08T14:59:59.999Z',
        securityLimit: 10,
      }),
      /asked for 10 securities and the universe returned 7/,
    );
  });

  it('refuses to run against an empty universe', async () => {
    const client = new FakeClient((sql) => {
      if (sql.includes('k4_semantic_snapshot')) return [{ semantic_snapshot_id: 'snapshot-1' }];
      if (sql.includes('k4_security_universe')) return [];
      throw new Error('loader continued past the empty universe');
    });
    await assert.rejects(
      loadK4MarketIntelligenceInput(client, {
        cutoff: '2026-08-08T14:59:59.999Z',
        securityLimit: null,
      }),
      /no securities in the served universe/,
    );
  });

  it('reports an exposure whose event predates the price history instead of failing the run', async () => {
    // market_ts.ohlcv holds about a month while a filing event can be months older, so
    // an exposure with no session before its event is a coverage fact rather than a
    // contradiction. It used to throw, which took the whole analytics stage down for
    // every other company — measured 2026-08-11 on 006280, whose cash fact is
    // available_at 2026-05-15 while its bars start 2026-07-14.
    const client = new FakeClient((sql) => {
      if (sql.includes('k4_market_outcome_bars')) {
        // Every bar is AFTER the event, so no anchor exists.
        return [
          {
            series_role: 'security',
            session_date: '2026-08-05',
            close: '100',
            known_at: '2026-08-05T00:00:00.000Z',
          },
        ];
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    const { outcomes, unanchoredExposureKeys } = await loadK4OutcomePlans(client, {
      informationSet: {
        informationSetId: 'k4:20260811:fixture',
        validCutoff: '2026-08-11T14:59:59.999Z',
        sourceAvailableCutoff: '2026-08-11T14:59:59.999Z',
        systemKnownCutoff: '2026-08-11T14:59:59.999Z',
        marketObservationCutoff: '2026-08-11T14:59:59.999Z',
        semanticSnapshotId: 'snapshot',
      },
      expectations: [],
      surprises: [],
      filingEvents: [
        {
          eventKey: 'event:old',
          eventType: 'regulatory_filing_numeric_fact',
          issuerEntityId: 101,
          sourceRevisionId: 1,
          availableAt: '2026-05-15T00:00:00.000Z',
          knownAt: '2026-05-15T00:00:00.000Z',
          locator: {},
        },
      ],
      shocks: [],
      evaluations: [],
      exposures: [
        {
          exposureKey: 'exposure:unanchored',
          evaluationKey: 'evaluation:1',
          shockKey: 'shock:1',
          eventKey: 'event:old',
          securityEntityId: 1,
          issuerEntityId: 101,
          channelClass: 'operational_capacity',
          sign: 'positive',
          horizon: 'short',
          economicMagnitude: 1,
          economicMagnitudeUnit: 'currency',
          materiality: 0.5,
          uncertainty: 0.5,
          epistemicConfidence: 0.5,
          scoreComponents: [],
        },
      ],
      valuations: [],
      pathCitations: [],
      coverage: [],
    });
    assert.deepEqual(outcomes, []);
    assert.deepEqual(unanchoredExposureKeys, ['exposure:unanchored']);
  });

  it('fails closed when no sealed semantic snapshot existed by the cutoff', async () => {
    const client = new FakeClient((sql) => {
      if (sql.includes('k4_semantic_snapshot')) return [];
      throw new Error('loader continued after missing semantic snapshot');
    });
    await assert.rejects(
      loadK4MarketIntelligenceInput(client, {
        cutoff: '2026-08-02T14:59:59.999Z',
        securityLimit: 10,
      }),
      /semantic snapshot.*cutoff/i,
    );
    assert.equal(client.calls.length, 1);
  });
});

describe('K4 cutoff-scoped outcome loading', () => {
  it('uses only cutoff-known stock/benchmark bars and leaves immature horizons pending', async () => {
    const client = new FakeClient((sql) => {
      if (!sql.includes('k4_market_outcome_bars')) throw new Error(`unexpected query: ${sql}`);
      return [
        {
          series_role: 'security',
          session_date: '2026-07-31',
          close: '100',
          known_at: '2026-08-01T01:00:00Z',
        },
        {
          series_role: 'benchmark',
          session_date: '2026-07-31',
          close: '200',
          known_at: '2026-08-01T01:00:00Z',
        },
        {
          series_role: 'security',
          session_date: '2026-08-03',
          close: '110',
          known_at: '2026-08-03T21:00:00Z',
        },
        {
          series_role: 'benchmark',
          session_date: '2026-08-03',
          close: '210',
          known_at: '2026-08-03T21:00:00Z',
        },
      ];
    });
    const { outcomes, unanchoredExposureKeys } = await loadK4OutcomePlans(client, {
      informationSet: {
        informationSetId: 'k4:20260808:fixture',
        validCutoff: '2026-08-08T14:59:59.999Z',
        sourceAvailableCutoff: '2026-08-08T14:59:59.999Z',
        systemKnownCutoff: '2026-08-08T14:59:59.999Z',
        marketObservationCutoff: '2026-08-08T14:59:59.999Z',
        semanticSnapshotId: 'snapshot',
      },
      expectations: [],
      surprises: [],
      filingEvents: [
        {
          eventKey: 'event:1',
          eventType: 'regulatory_filing_numeric_fact',
          issuerEntityId: 101,
          sourceRevisionId: 1001,
          availableAt: '2026-08-01T12:00:00.000Z',
          knownAt: '2026-08-01T12:01:00.000Z',
          locator: {},
        },
      ],
      shocks: [],
      evaluations: [],
      exposures: [
        {
          exposureKey: 'exposure:1',
          evaluationKey: 'evaluation:1',
          shockKey: 'shock:1',
          eventKey: 'event:1',
          securityEntityId: 1,
          issuerEntityId: 101,
          channelClass: 'operational_capacity',
          sign: 'negative',
          horizon: 'short',
          economicMagnitude: 20,
          economicMagnitudeUnit: 'USD',
          materiality: 0.2,
          uncertainty: 0.1,
          epistemicConfidence: 0.9,
          scoreComponents: [],
        },
      ],
      valuations: [],
      pathCitations: [],
      coverage: [],
    });
    assert.equal(outcomes.length, 3);
    // Every exposure had a session before its event, so nothing is unanchored here.
    assert.deepEqual(unanchoredExposureKeys, []);
    assert.equal(outcomes[0]?.outcomeState, 'evaluated');
    assert.equal(outcomes[0]?.anchorSessionDate, '2026-07-31');
    assert.deepEqual(
      outcomes.slice(1).map((row) => row.outcomeState),
      ['pending', 'pending'],
    );
    assert.deepEqual(client.calls[0]?.params, [
      1,
      '2026-08-01T12:00:00.000Z',
      '2026-08-08T14:59:59.999Z',
    ]);
    assert.match(client.calls[0]?.sql ?? '', /collected_at <= \$3::timestamptz/);
    assert.match(client.calls[0]?.sql ?? '', /available_at <= \$3::timestamptz/);
  });
});

function replayInput(cutoffAt: string) {
  return {
    informationSet: {
      informationSetId: `k4:${cutoffAt.slice(0, 10)}`,
      validCutoff: cutoffAt,
      sourceAvailableCutoff: cutoffAt,
      systemKnownCutoff: cutoffAt,
      marketObservationCutoff: cutoffAt,
      semanticSnapshotId: 'snapshot-before-cutoff',
    },
    securities: Array.from({ length: 10 }, (_, index) => ({
      securityEntityId: index + 1,
      issuerEntityId: null,
      securityIssuerIdentityId: null,
      sectorPlaybookId: null,
    })),
    rules: [],
    facts: [],
    expectations: [],
  };
}

describe('K4 replay/canary orchestration', () => {
  it('keeps dry-run read-only while planning every selected cutoff', async () => {
    const client = new FakeClient();
    const loaded: string[] = [];
    const summaries = await executeK4MarketIntelligenceJob({
      client,
      args: parseK4MarketIntelligenceArgs(['--from', '2026-08-02', '--to', '2026-08-03']),
      loadInput: async (_client, options) => {
        loaded.push(options.cutoff);
        return replayInput(options.cutoff);
      },
      persistPlan: async () => {
        throw new Error('dry-run attempted persistence');
      },
    });
    assert.equal(summaries.length, 2);
    assert.deepEqual(loaded, ['2026-08-02T14:59:59.999Z', '2026-08-03T14:59:59.999Z']);
    assert.equal(
      summaries.every((summary) => summary.mode === 'dry-run'),
      true,
    );
    assert.equal(
      summaries.every((summary) => summary.evaluationCount === 10),
      true,
    );
    assert.equal(
      summaries.every((summary) => summary.outcomeCount === 0),
      true,
    );
    assert.equal(client.calls.length, 0);
  });

  it('persists a canary inside the exact cutoff transaction and commits once', async () => {
    const client = new FakeClient();
    let persisted = 0;
    const args = parseK4MarketIntelligenceArgs([
      '--canary',
      '--cutoff',
      '2026-08-09T12:00:00.000Z',
      '--apply',
    ]);
    const summaries = await executeK4MarketIntelligenceJob({
      client,
      args,
      loadInput: async (_client, options) => replayInput(options.cutoff),
      persistPlan: async (_client, planned, options) => {
        persisted += 1;
        assert.equal(options.runKind, 'canary');
        assert.equal(options.cutoff, planned.informationSet.validCutoff);
        assert.deepEqual(options.outcomes, []);
        return {
          receiptId: 9,
          idempotent: false,
          acceptedEvaluationCount: 0,
          rejectedEvaluationCount: 10,
          sealedExposureCount: 0,
          surpriseCount: 0,
          valuationCount: 0,
          outcomeCount: 0,
        };
      },
    });
    assert.equal(persisted, 1);
    assert.equal(summaries[0]?.persistence?.receiptId, 9);
    assert.deepEqual(
      client.calls.map((call) => call.sql.replaceAll(/\s+/g, ' ').trim()),
      ['BEGIN', 'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', 'COMMIT'],
    );
  });
});

describe('K4 executable wiring', () => {
  it('exposes dry-run/rehearse/apply replay commands and a parameterized canary entrypoint', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };
    assert.equal(
      packageJson.scripts['analytics:k4-market-intelligence:replay:dry-run'],
      'node src/analytics/run-k4-market-intelligence.ts --from 2026-08-02 --to 2026-08-08',
    );
    assert.equal(
      packageJson.scripts['analytics:k4-market-intelligence:replay:rehearse'],
      'node src/analytics/run-k4-market-intelligence.ts --from 2026-08-02 --to 2026-08-08 --rehearse',
    );
    assert.equal(
      packageJson.scripts['analytics:k4-market-intelligence:replay:apply'],
      'node src/analytics/run-k4-market-intelligence.ts --from 2026-08-02 --to 2026-08-08 --apply',
    );
    assert.equal(
      packageJson.scripts['analytics:k4-market-intelligence:canary'],
      'node src/analytics/run-k4-market-intelligence.ts --canary',
    );
    const cli = await readFile(
      new URL('../src/analytics/run-k4-market-intelligence.ts', import.meta.url),
      'utf8',
    );
    assert.match(cli, /DATABASE_URL is required/);
    assert.match(cli, /executeK4MarketIntelligenceJob/);
    assert.match(cli, /pool\.end\(\)/);
    const analyticsPipeline = await readFile(
      new URL('../scripts/run_analytics_pipeline.sh', import.meta.url),
      'utf8',
    );
    assert.match(analyticsPipeline, /K4_CANARY_CUTOFF=\$\(/);
    assert.match(analyticsPipeline, /value\.toISOString\(\)\)' "\$RUN_STARTED_AT"/);
    assert.match(analyticsPipeline, /run-k4-market-intelligence\.ts/);
    assert.match(analyticsPipeline, /--canary --cutoff "\$K4_CANARY_CUTOFF" --apply/);
    assert.match(analyticsPipeline, /stock-insight-k4-market-intelligence-canary-stage/);
    // The expectation producer must run before the canary reads expectations.
    assert.ok(
      analyticsPipeline.indexOf('run-k4-prior-model-expectation.ts') <
        analyticsPipeline.indexOf('run-k4-market-intelligence.ts --canary'),
    );
    assert.match(analyticsPipeline, /stock-insight-k4-prior-model-expectation-stage/);
    // 최종 단언의 상한. 파이프라인의 `job_name IN (...)` 목록과 **함께** 움직여야
    // 한다 — 하나만 올리면 목록에 있는 단계 하나가 실행되지 않아도 통과한다.
    // 2026-08-07: 13. 2026-08-12: 14 (stock-insight-k4-valuation-band-stage 합류).
    assert.match(analyticsPipeline, /\) = 15/);
    assert.match(analyticsPipeline, /stock-insight-k4-valuation-band-stage/);
    // 리터럴을 다시 적는 대신 **둘이 같은지**를 잰다. 앞의 `= 15` 만 보면 목록에
    // 이름을 하나 더 넣고 숫자를 안 올린 실수가 그대로 통과한다: 그러면 단계 하나가
    // 통째로 빠져도 count 가 상한에 닿는다.
    const finalAssertion = analyticsPipeline.slice(
      analyticsPipeline.lastIndexOf('pipeline_require_db_assertion analytics "'),
    );
    const listedStages = finalAssertion
      .slice(0, finalAssertion.indexOf(')\n     AND status='))
      .match(/'stock-insight-[a-z0-9-]+-stage'/g);
    const declaredCount = Number(finalAssertion.match(/\) = (\d+)/)?.[1]);
    assert.equal(listedStages?.length, declaredCount);
  });
});
