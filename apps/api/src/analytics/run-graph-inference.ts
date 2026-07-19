import { randomUUID } from 'node:crypto';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

// SET E / E-4: rule engine v1 — event -> relation walk -> impact paths.
// Rules (04-A §4): recent verified-ish events with a target entity expand through
// active structural relations (allowlist, max 2 hops) to reach Stock entities.
// path_score = event_strength * Π(edge_confidence) * hop_decay^(hops-1)
//              * freshness * market_confirmation_dampener
// Scores are INDUSTRIAL LINKAGE strength, never price predictions.

const JOB_NAME = 'stock-insight-graph-inference';
const RULE_VERSION = 'impact-v1';
const HOP_DECAY = 0.7;
const MAX_HOPS = 2;
const MAX_PATHS_PER_EVENT = 20;
const FRESHNESS_HALF_LIFE_DAYS = 14;

const RELATION_PREDICATES = [
  'AFFECTS', 'SAME_THEME', 'SUPPLY_CHAIN', 'SAME_INDUSTRY', 'PEER_OF',
  'EXPOSES', 'ROLLS_UP', 'STAGE', 'OWNS',
] as const;

const RECENT_EVENTS_SQL = `
SELECT event.event_id, event.event_type, event.target_entity_id,
       coalesce(event.occurred_at, event.created_at) AS occurred_at,
       event.magnitude, event.summary_text,
       (event.source_document_id IS NOT NULL) AS has_document
FROM knowledge.event event
WHERE event.target_entity_id IS NOT NULL
  AND coalesce(event.occurred_at, event.created_at) >= $1::timestamptz - interval '14 days'
  AND coalesce(event.occurred_at, event.created_at) <= $1::timestamptz
ORDER BY occurred_at DESC
LIMIT $2
`;

const RELATIONS_SQL = `
SELECT relation.relation_id, relation.subject_entity_id, relation.object_entity_id,
       relation.predicate, relation.confidence
FROM knowledge.relation relation
WHERE relation.status = 'active' AND relation.recorded_to IS NULL
  AND relation.predicate = ANY($1::text[])
`;

const STOCK_ENTITIES_SQL = `
SELECT entity.entity_id FROM core.entity entity WHERE entity.entity_type = 'Stock'
`;

const EVIDENCE_BACKED_RELATIONS_SQL = `
SELECT DISTINCT evidence.relation_id
FROM knowledge.relation_evidence evidence
`;

const CLEAR_RUN_SQL = `
DELETE FROM analytics.impact_path WHERE inference_run_id = $1
`;

const INSERT_PATH_SQL = `
INSERT INTO analytics.impact_path (
  trigger_event_id, target_entity_id, path_nodes, path_edges, path_score,
  direction, horizon, inference_kind, explanation, inference_run_id, expires_at
) VALUES ($1, $2, $3, $4, $5, $6, '1q', 'rule_derived', $7::jsonb, $8, $9)
ON CONFLICT (trigger_event_id, target_entity_id, inference_run_id) DO NOTHING
RETURNING impact_path_id
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES ($1, $2, 'derived', 'completed', $3, $4, $5, $6, $7, NULL, $8::jsonb)
`;

type EventRow = QueryResultRow & {
  event_id: string | number;
  event_type: string;
  target_entity_id: string | number;
  occurred_at: Date;
  magnitude: string | number | null;
  has_document: boolean;
};

type RelationRow = QueryResultRow & {
  relation_id: string | number;
  subject_entity_id: string | number;
  object_entity_id: string | number;
  predicate: string;
  confidence: number;
};

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function intOption(name: string, fallback: number, max: number): number {
  const index = process.argv.indexOf(name);
  const raw = index < 0 ? undefined : process.argv[index + 1];
  const value = Number(raw ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}`);
  }
  return value;
}

function eventStrength(event: EventRow): number {
  // Document-backed events are stronger; legacy no-document events are dampened.
  const base = event.has_document ? 0.9 : 0.5;
  const typeBoost: Record<string, number> = {
    capex_increase: 1.1, ma_deal: 1.1, regulation: 1.05, supply_disruption: 1.1,
    earnings: 1.0, sec_8k: 0.9, policy_event: 0.95, analyst: 0.7, insider_trade: 0.6,
  };
  return Math.min(1, base * (typeBoost[event.event_type] ?? 0.8));
}

function freshness(occurredAt: Date, asOf: Date): number {
  const ageDays = Math.max(0, (asOf.getTime() - occurredAt.getTime()) / 86_400_000);
  return Math.exp((-Math.LN2 * ageDays) / FRESHNESS_HALF_LIFE_DAYS);
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const eventLimit = intOption('--events', 200, 2000);
  const asOf = new Date();
  const startedAt = new Date();
  const inferenceRunId = `${RULE_VERSION}-${asOf.toISOString().slice(0, 10)}`;

  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const events = await client.query<EventRow>(RECENT_EVENTS_SQL, [asOf.toISOString(), eventLimit]);
    const relations = await client.query<RelationRow>(RELATIONS_SQL, [[...RELATION_PREDICATES]]);
    const stocks = await client.query<QueryResultRow & { entity_id: string | number }>(STOCK_ENTITIES_SQL);
    const backedRelations = await client.query<QueryResultRow & { relation_id: string | number }>(
      EVIDENCE_BACKED_RELATIONS_SQL,
    );
    await client.query('COMMIT');

    const evidenceBackedSet = new Set(backedRelations.rows.map((row) => Number(row.relation_id)));

    const stockSet = new Set(stocks.rows.map((row) => Number(row.entity_id)));
    // Undirected adjacency: relations connect either direction for expansion.
    const adjacency = new Map<number, Array<{ neighbor: number; relationId: number; predicate: string; confidence: number }>>();
    for (const relation of relations.rows) {
      const subject = Number(relation.subject_entity_id);
      const object = Number(relation.object_entity_id);
      const confidence = Math.min(1, Math.max(0.05, relation.confidence));
      for (const [from, to] of [[subject, object], [object, subject]] as const) {
        if (!adjacency.has(from)) adjacency.set(from, []);
        adjacency.get(from)!.push({
          neighbor: to,
          relationId: Number(relation.relation_id),
          predicate: relation.predicate,
          confidence,
        });
      }
    }

    type Path = {
      target: number;
      nodes: number[];
      edges: number[];
      predicates: string[];
      confidenceProduct: number;
      hops: number;
    };

    let candidatePaths = 0;
    let written = 0;
    const perEvent: Record<string, number> = {};

    if (apply) {
      await client.query('BEGIN');
      await client.query("SELECT set_config('statement_timeout', '300s', true)");
      await client.query(CLEAR_RUN_SQL, [inferenceRunId]);
    }

    for (const event of events.rows) {
      const origin = Number(event.target_entity_id);
      const strength = eventStrength(event);
      const fresh = freshness(event.occurred_at, asOf);
      const found = new Map<number, Path>();

      // BFS up to MAX_HOPS keeping the best (highest confidence product) path per stock.
      let frontier: Path[] = [{
        target: origin, nodes: [origin], edges: [], predicates: [], confidenceProduct: 1, hops: 0,
      }];
      for (let hop = 1; hop <= MAX_HOPS; hop += 1) {
        const next: Path[] = [];
        for (const path of frontier) {
          for (const edge of adjacency.get(path.target) ?? []) {
            if (path.nodes.includes(edge.neighbor)) continue;
            const extended: Path = {
              target: edge.neighbor,
              nodes: [...path.nodes, edge.neighbor],
              edges: [...path.edges, edge.relationId],
              predicates: [...path.predicates, edge.predicate],
              confidenceProduct: path.confidenceProduct * edge.confidence,
              hops: hop,
            };
            if (stockSet.has(edge.neighbor) && edge.neighbor !== origin) {
              const existing = found.get(edge.neighbor);
              if (!existing || extended.confidenceProduct > existing.confidenceProduct) {
                found.set(edge.neighbor, extended);
              }
            }
            if (next.length < 5000) next.push(extended);
          }
        }
        frontier = next;
      }

      const scored = [...found.values()]
        .map((path) => ({
          path,
          score: strength * path.confidenceProduct * HOP_DECAY ** (path.hops - 1) * fresh,
        }))
        .filter((entry) => entry.score >= 0.05)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_PATHS_PER_EVENT);

      candidatePaths += scored.length;
      perEvent[event.event_type] = (perEvent[event.event_type] ?? 0) + scored.length;

      if (apply) {
        for (const entry of scored) {
          // B0 truth gate: annotate whether every edge of this path is backed by
          // immutable source evidence. Paths without full backing stay stored as
          // internal analytics artifacts but are excluded from serving exposure
          // (serving.impact_summary_v1 filter, migration 018).
          const sourceBacked =
            entry.path.edges.length > 0 &&
            entry.path.edges.every((edgeId) => evidenceBackedSet.has(edgeId));
          const result = await client.query(INSERT_PATH_SQL, [
            Number(event.event_id),
            entry.path.target,
            entry.path.nodes,
            entry.path.edges,
            Number(entry.score.toFixed(4)),
            'unknown',
            JSON.stringify({
              rule: RULE_VERSION,
              event_type: event.event_type,
              event_strength: Number(strength.toFixed(3)),
              confidence_product: Number(entry.path.confidenceProduct.toFixed(4)),
              hop_decay: HOP_DECAY ** (entry.path.hops - 1),
              freshness: Number(fresh.toFixed(3)),
              hops: entry.path.hops,
              predicates: entry.path.predicates,
              source_backed: sourceBacked,
              note: 'industrial linkage strength, not a price prediction',
            }),
            inferenceRunId,
            new Date(asOf.getTime() + 90 * 86_400_000).toISOString(),
          ]);
          if ((result.rowCount ?? 0) > 0) written += 1;
        }
      }
    }

    const summary = {
      inferenceRunId,
      events: events.rows.length,
      relations: relations.rows.length,
      candidatePaths,
      written,
      perEventType: perEvent,
    };
    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', readOnly: true, audit: summary }, null, 2));
      return;
    }
    await client.query(INSERT_MIGRATION_RUN_SQL, [
      `impact-${randomUUID()}`,
      JOB_NAME,
      startedAt.toISOString(),
      new Date().toISOString(),
      events.rows.length,
      written,
      candidatePaths - written,
      JSON.stringify(summary),
    ]);
    await client.query('COMMIT');
    console.log(JSON.stringify({ mode: 'apply', jobName: JOB_NAME, audit: summary }, null, 2));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve original failure.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await run();
