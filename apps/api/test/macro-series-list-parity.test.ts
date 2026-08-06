import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

/**
 * The macro series list lives in two places and they can drift apart silently.
 *
 *   apps/api/src/ingest/run-fred-vintage.ts   CORE_SERIES — what gets COLLECTED
 *   apps/api/src/ingest/run-ecos-vintage.ts   CORE_SERIES — what gets COLLECTED
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
 *
 * Series keys are compared WHOLE (`fred:DGS10`, `ecos:817Y002:010200000`) rather
 * than as bare vendor ids. The first version of this file stripped the prefix,
 * which worked while FRED was the only provider and would have quietly matched an
 * ECOS item code against a FRED series id once it was not.
 *
 * WHAT THIS TEST STILL DOES NOT COVER, measured 2026-08-07 and written down so it
 * is not mistaken for coverage: a series can pass every assertion here and still
 * never reach a stock. Reaching a stock needs an entry in MACRO_SERIES_TRANSFORMS
 * (run-v2-graph-publish loads exactly `Object.keys(MACRO_SERIES_TRANSFORMS)`) and
 * an identifier the window query joins on. `fred:DHHNGSP` is the live example —
 * collected 2026-08-06, mapped to the `energy` topic, in neither table, and
 * holding zero relations of any predicate. Extending this test to the model is a
 * separate piece of work, not a line here.
 */
const FRED_COLLECTOR = new URL('../src/ingest/run-fred-vintage.ts', import.meta.url);
const ECOS_COLLECTOR = new URL('../src/ingest/run-ecos-vintage.ts', import.meta.url);
const MIGRATIONS = new URL('../../../packages/db-schema/src/migrations/', import.meta.url);

/**
 * Series deliberately collected without a graph mapping, with the reason. An entry
 * here is a decision someone made; the test fails if one gains a mapping, so the
 * list cannot quietly stop describing reality.
 */
const COLLECTED_WITHOUT_TOPIC = new Map<string, string>([
  // The five ECOS series, all held back by the same measured obstacle rather than
  // by five separate judgements. MACRO_SERIES_WINDOW_SQL joins
  // core.entity_identifier on identifier_type = 'FRED_SERIES', so a Korean series
  // cannot enter the co-movement model no matter what mapping it is given. Giving
  // them macro_series_topic rows before that join is widened would mint Metric
  // entities and MEASURED_BY edges that lead nowhere — which is exactly the state
  // fred:DHHNGSP is in right now, and the reason it is named in the header.
  //
  // Collection is still worth doing ahead of the mapping: the vintages accumulate
  // history, and market.macro_vintage is the only place they can accumulate it.
  ['ecos:817Y002:010200000', 'graph join is FRED_SERIES-only; collection first, mapping after'],
  ['ecos:817Y002:010210000', 'graph join is FRED_SERIES-only; collection first, mapping after'],
  ['ecos:817Y002:010300000', 'graph join is FRED_SERIES-only; collection first, mapping after'],
  ['ecos:817Y002:010502000', 'graph join is FRED_SERIES-only; collection first, mapping after'],
  ['ecos:722Y001:0101000', 'graph join is FRED_SERIES-only; collection first, mapping after'],
]);

async function collectorSeries(): Promise<Set<string>> {
  const found = new Set<string>();

  // FRED: a flat array of bare series ids under a `fred:` prefix at use sites.
  const fred = await readFile(FRED_COLLECTOR, 'utf8');
  const fredBlock = fred.slice(fred.indexOf('const CORE_SERIES'), fred.indexOf('] as const;'));
  for (const match of fredBlock.matchAll(/^\s*'([A-Z0-9]+)',/gm)) found.add(`fred:${match[1]!}`);

  // ECOS: an array of objects, each carrying its own fully-qualified seriesKey.
  const ecos = await readFile(ECOS_COLLECTOR, 'utf8');
  const ecosBlock = ecos.slice(ecos.indexOf('const CORE_SERIES'), ecos.indexOf('] as const;'));
  for (const match of ecosBlock.matchAll(/seriesKey:\s*'(ecos:[A-Z0-9]+:[0-9]+)'/g)) {
    found.add(match[1]!);
  }

  return found;
}

async function mappedSeries(): Promise<Set<string>> {
  const names = (await readdir(MIGRATIONS)).filter((name) => name.endsWith('.ts'));
  const bodies = await Promise.all(
    names.map((name) => readFile(new URL(name, MIGRATIONS), 'utf8')),
  );
  const found = new Set<string>();
  for (const body of bodies) {
    for (const match of body.matchAll(/'fred:([A-Z0-9]+)'/g)) found.add(`fred:${match[1]!}`);
    for (const match of body.matchAll(/'(ecos:[A-Z0-9]+:[0-9]+)'/g)) found.add(match[1]!);
  }
  return found;
}

describe('macro series list parity', () => {
  it('reads both lists', async () => {
    const collected = await collectorSeries();
    assert.ok(collected.size >= 10, 'CORE_SERIES parse looks wrong');
    assert.ok(
      [...collected].some((key) => key.startsWith('fred:')),
      'FRED collector parse looks wrong',
    );
    assert.ok(
      [...collected].some((key) => key.startsWith('ecos:')),
      'ECOS collector parse looks wrong',
    );
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
