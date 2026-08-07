import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  MACRO_SERIES_EXCLUSIONS,
  MACRO_SERIES_FREQUENCY,
  MACRO_SERIES_TRANSFORMS,
} from '../src/relations/macro-comovement-model.ts';

/**
 * A macro series has to appear in THREE places to be worth anything, and each pair
 * can drift apart without either side failing.
 *
 *   apps/api/src/ingest/run-fred-vintage.ts   CORE_SERIES — what gets COLLECTED
 *   apps/api/src/ingest/run-ecos-vintage.ts   CORE_SERIES — what gets COLLECTED
 *   analytics.macro_series_topic (migrations) — what becomes an ENTITY
 *   MACRO_SERIES_TRANSFORMS (model)           — what REACHES A STOCK
 *
 * A series in the array only collects vintages nothing reads. A series in the
 * mapping only creates a Metric entity with no data behind it. A series in both
 * but not in the model gets an entity, a MEASURED_BY edge, and no way to reach a
 * stock — it stops one hop short and looks connected.
 *
 * All three failures are silent and none of them looks like the others.
 *
 * THE THIRD CHECK EXISTS BECAUSE THE FIRST TWO PASSED WHILE fred:DHHNGSP FAILED.
 * Collected 2026-08-06 to widen the `energy` topic beyond one instrument, mapped
 * by migration 073, absent from MACRO_SERIES_TRANSFORMS — and
 * loadMacroComovementInputs asks for exactly `Object.keys(MACRO_SERIES_TRANSFORMS)`,
 * so it was never loaded. 680 vintages, zero relations of any predicate, and this
 * file was green throughout. Counting the inventory is what catches the next one.
 *
 * Series keys are compared WHOLE (`fred:DGS10`, `ecos:817Y002:010200000`) rather
 * than as bare vendor ids. The first version stripped the prefix, which worked
 * while FRED was the only provider and would have quietly matched an ECOS item
 * code against a FRED series id once it was not.
 */
const FRED_COLLECTOR = new URL('../src/ingest/run-fred-vintage.ts', import.meta.url);
const ECOS_COLLECTOR = new URL('../src/ingest/run-ecos-vintage.ts', import.meta.url);
const MIGRATIONS = new URL('../../../packages/db-schema/src/migrations/', import.meta.url);

/**
 * Series deliberately collected without a graph mapping, with the reason. An entry
 * here is a decision someone made; the test fails if one gains a mapping, so the
 * list cannot quietly stop describing reality.
 *
 * EMPTY as of 2026-08-07, and that is a measurement. The five ECOS series were
 * held here for part of one session because MACRO_SERIES_WINDOW_SQL joined on
 * FRED_SERIES only; migration 076 and that join's widening landed together and the
 * exemption came straight back off.
 */
const COLLECTED_WITHOUT_TOPIC = new Map<string, string>([
  // KOSPI is the KR MARKET FACTOR, not a correlation target. Every Korean pair is
  // controlled FOR it, so mapping it would make it both the control and a
  // candidate — and a Korean stock correlated against KOSPI while controlling for
  // KOSPI is zero by construction, which the partial-correlation denominator
  // guard would reject as degenerate.
  //
  // This is the one exemption that must NEVER be cleared by adding a mapping. The
  // others on this list were temporary; this one is the design.
  ['ecos:802Y001:0001000', 'KR market factor — controlled for, never correlated against'],
]);

async function collectorSeries(): Promise<Set<string>> {
  const found = new Set<string>();

  // FRED: a flat array of bare series ids, prefixed `fred:` at use sites.
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
  it('reads every list', async () => {
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
    assert.ok(Object.keys(MACRO_SERIES_TRANSFORMS).length >= 6, 'model table looks wrong');
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

  it('every mapped series can reach a stock, or says in code why it cannot', async () => {
    // The fred:DHHNGSP case. Being mapped buys a MEASURED_BY edge from the topic;
    // reaching a STOCK needs MACRO_SERIES_TRANSFORMS, because that object's keys
    // are literally the load list in loadMacroComovementInputs.
    const mapped = [...(await mappedSeries())].sort();
    const unreachable = mapped.filter(
      (id) => !(id in MACRO_SERIES_TRANSFORMS) && !(id in MACRO_SERIES_EXCLUSIONS),
    );
    assert.deepEqual(
      unreachable,
      [],
      `mapped but absent from both MACRO_SERIES_TRANSFORMS and MACRO_SERIES_EXCLUSIONS — it will get a MEASURED_BY edge and never reach a stock:\n  ${unreachable.join('\n  ')}`,
    );
  });

  it('the two model tables agree with each other', () => {
    // A transform without a frequency throws at run time ("no declared frequency
    // for macro series"), and a frequency without a transform is never loaded, so
    // the pair has to move together.
    const transforms = Object.keys(MACRO_SERIES_TRANSFORMS).sort();
    const frequencies = Object.keys(MACRO_SERIES_FREQUENCY).sort();
    assert.deepEqual(
      transforms.filter((id) => !(id in MACRO_SERIES_FREQUENCY)),
      [],
      'in MACRO_SERIES_TRANSFORMS but not MACRO_SERIES_FREQUENCY — this throws at run time',
    );
    assert.deepEqual(
      frequencies.filter((id) => !(id in MACRO_SERIES_TRANSFORMS)),
      [],
      'in MACRO_SERIES_FREQUENCY but not MACRO_SERIES_TRANSFORMS — it is never loaded',
    );
  });

  it('a series is never both measured and excluded', () => {
    const both = Object.keys(MACRO_SERIES_TRANSFORMS)
      .filter((id) => id in MACRO_SERIES_EXCLUSIONS)
      .sort();
    assert.deepEqual(both, [], `listed as both measured and excluded:\n  ${both.join('\n  ')}`);
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
