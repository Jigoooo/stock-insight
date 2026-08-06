import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

/**
 * The FRED series list lives in two places and they can drift apart silently.
 *
 *   apps/api/src/ingest/run-fred-vintage.ts   CORE_SERIES — what gets COLLECTED
 *   analytics.macro_series_topic (migrations) — what reaches the GRAPH
 *
 * Neither side fails when the other is missing an entry. A series in the array
 * only collects vintages that nothing reads; a series in the mapping only creates
 * a Metric entity with no data behind it. DCOILWTICO actually went through this:
 * added to the collector on 2026-08-05 and given its entity by a separate
 * migration (067) afterwards, so between those two moments it was in one list and
 * not the other.
 *
 * Both directions are checked, because the two failures look nothing alike.
 */
const COLLECTOR = new URL('../src/ingest/run-fred-vintage.ts', import.meta.url);
const MIGRATIONS = new URL('../../../packages/db-schema/src/migrations/', import.meta.url);

/**
 * Series deliberately collected without a graph mapping, with the reason. An entry
 * here is a decision someone made; the test fails if one gains a mapping, so the
 * list cannot quietly stop describing reality.
 */
const COLLECTED_WITHOUT_TOPIC = new Map<string, string>([
  // EMPTY, and that is a measurement rather than an oversight. Checked against
  // analytics.macro_series_topic on 2026-08-07: all 14 collected series carry a
  // topic mapping. The monthly and weekly ones (CPIAUCSL, PAYEMS, ICSA …) are
  // mapped too — the co-movement model drops them for trading-day alignment, but
  // that happens downstream of the mapping and is a different thing from being
  // unmapped. Conflating the two was the first draft of this file.
  //
  // An entry belongs here only when a series is collected on purpose with no way
  // to reach the graph, and the reason is written down.
]);

async function collectorSeries(): Promise<Set<string>> {
  const source = await readFile(COLLECTOR, 'utf8');
  const block = source.slice(source.indexOf('const CORE_SERIES'), source.indexOf('] as const;'));
  return new Set([...block.matchAll(/^\s*'([A-Z0-9]+)',/gm)].map((m) => m[1]!));
}

async function mappedSeries(): Promise<Set<string>> {
  const names = (await readdir(MIGRATIONS)).filter((name) => name.endsWith('.ts'));
  const bodies = await Promise.all(
    names.map((name) => readFile(new URL(name, MIGRATIONS), 'utf8')),
  );
  const found = new Set<string>();
  for (const body of bodies) {
    for (const match of body.matchAll(/'fred:([A-Z0-9]+)'/g)) found.add(match[1]!);
  }
  return found;
}

describe('FRED series list parity', () => {
  it('reads both lists', async () => {
    assert.ok((await collectorSeries()).size >= 10, 'CORE_SERIES parse looks wrong');
    assert.ok((await mappedSeries()).size >= 10, 'migration parse looks wrong');
  });

  it('every mapped series is actually collected', async () => {
    // The worse direction: a Metric entity exists, the graph can reach it, and no
    // data ever arrives behind it.
    const collected = await collectorSeries();
    const orphans = [...(await mappedSeries())].filter((id) => !collected.has(id)).sort();
    assert.deepEqual(
      orphans,
      [],
      `mapped but never collected — add to CORE_SERIES:\n  ${orphans.join('\n  ')}`,
    );
  });

  it('every collected series is mapped, or listed as deliberately unmapped', async () => {
    const mapped = await mappedSeries();
    const orphans = [...(await collectorSeries())]
      .filter((id) => !mapped.has(id) && !COLLECTED_WITHOUT_TOPIC.has(id))
      .sort();
    assert.deepEqual(
      orphans,
      [],
      `collected but unreachable from the graph. Add a macro_series_topic row, or record why not:\n  ${orphans.join('\n  ')}`,
    );
  });

  it('every exemption is still unmapped and still collected', async () => {
    // Both rot directions for the allowlist.
    const mapped = await mappedSeries();
    const collected = await collectorSeries();
    const nowMapped = [...COLLECTED_WITHOUT_TOPIC.keys()].filter((id) => mapped.has(id)).sort();
    const gone = [...COLLECTED_WITHOUT_TOPIC.keys()].filter((id) => !collected.has(id)).sort();
    assert.deepEqual(
      nowMapped,
      [],
      `these are mapped now — remove from the exemption list:\n  ${nowMapped.join('\n  ')}`,
    );
    assert.deepEqual(
      gone,
      [],
      `these are no longer collected — remove from the exemption list:\n  ${gone.join('\n  ')}`,
    );
  });
});
