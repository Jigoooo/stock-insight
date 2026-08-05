// A2 — the unattributed backlog, reported by every attribution job.
//
// Measured 2026-08-06: 2,546 of 4,245 events carry no target_entity_id, and
// `loadRecentEvents` filters on `target_entity_id IS NOT NULL`, so an unattributed
// event cannot even begin an impact path. The number appeared in no summary, so it
// grew unobserved: the 2026-08-04 measurement was 2,542. Four events in two days
// is small, but nothing was watching the direction.
//
// Both attribution jobs report the SAME gauge from this one module on purpose. If
// each counted for itself the two definitions would drift and the numbers would
// stop being comparable across a run — which is the only thing that makes the
// company job's total and the topic job's total useful to read together.
//
// The gauge is read after the writes, so it answers "what is left" rather than
// "what was there". Without --apply it answers the same question about the
// unchanged database, which is what makes a dry run a usable observation.

import type { PoolClient, QueryResultRow } from 'pg';

/**
 * `summary_text IS NULL` is broken out because a zero there carries information:
 * it says nothing is invisible to these jobs for want of text. Measured
 * 2026-08-06 it is exactly 0 of 2,546. If it ever rises, those events need a
 * different handle entirely and no vocabulary change will reach them.
 */
export const UNATTRIBUTED_GAUGE_SQL = `
WITH unattributed AS (
  SELECT event.event_type, event.summary_text
  FROM knowledge.event AS event
  WHERE event.target_entity_id IS NULL
)
SELECT
  (SELECT count(*) FROM unattributed) AS unattributed_total,
  (SELECT count(*) FROM unattributed WHERE summary_text IS NULL)
    AS unattributed_without_summary_text,
  COALESCE(
    (
      SELECT jsonb_object_agg(ranked.event_type, ranked.events)
      FROM (
        SELECT event_type, count(*) AS events
        FROM unattributed
        GROUP BY event_type
        ORDER BY count(*) DESC, event_type
        LIMIT 6
      ) AS ranked
    ),
    '{}'::jsonb
  ) AS unattributed_top_types
`;

export type UnattributedGauge = {
  /** Events with no target_entity_id — these cannot start an impact path. */
  unattributedTotal: number;
  /** Of those, the ones no text-based job can ever reach. 0 as of 2026-08-06. */
  unattributedWithoutSummaryText: number;
  /** The largest event_type buckets, so a rise names its own cause. */
  unattributedTopTypes: Record<string, number>;
};

type GaugeRow = QueryResultRow & {
  unattributed_total: string | number;
  unattributed_without_summary_text: string | number;
  unattributed_top_types: Record<string, string | number> | null;
};

export async function readUnattributedGauge(client: PoolClient): Promise<UnattributedGauge> {
  const { rows } = await client.query<GaugeRow>(UNATTRIBUTED_GAUGE_SQL, []);
  const row = rows[0];
  if (!row) throw new Error('unattributed gauge query returned no row');

  const topTypes: Record<string, number> = {};
  for (const [eventType, events] of Object.entries(row.unattributed_top_types ?? {})) {
    topTypes[eventType] = Number(events);
  }

  return {
    unattributedTotal: Number(row.unattributed_total),
    unattributedWithoutSummaryText: Number(row.unattributed_without_summary_text),
    unattributedTopTypes: topTypes,
  };
}
