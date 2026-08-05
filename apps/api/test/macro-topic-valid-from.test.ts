import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

/**
 * A curated mapping's valid_from must not come from the run clock.
 *
 * Measured on production 2026-08-06: MEASURED_BY held 84 revisions across 14
 * identities — six per edge, one per publish since migration 068 — with an
 * IDENTICAL payload hash on every one. Only valid_from differed, because the
 * observation carried `registered.sourceAvailableAt` and a fresh raw object is
 * registered each run.
 *
 * appendRelationRevision calls a write a replay only when valid_from matches too,
 * so the ledger grew by 14 revisions per publish for facts that never changed.
 * Nothing was wrong in the graph: the newest revision was accepted and the
 * selector read it. The record just claimed we learned the same thing six times.
 *
 * The bitemporal split is the point. available_at moves — it is when we could see
 * the mapping, and we re-read it every publish. valid_from does not — re-reading a
 * curated snapshot does not make `topic:energy MEASURED_BY fred:DCOILWTICO` newly
 * true. The retraction payload hash was made stable for this exact reason on
 * 2026-08-05 and the reasoning was not carried across to here.
 */
describe('macro topic edges are dated from the mapping, not from the run', () => {
  const publisher = (): Promise<string> =>
    readFile(new URL('../src/analytics/run-v2-graph-publish.ts', import.meta.url), 'utf8');

  it('reads the mapping row creation time', async () => {
    const source = await publisher();
    assert.match(
      source,
      /mapping\.created_at AS mapping_created_at/,
      'the mapping query must expose created_at — there is nothing else to date the edge from',
    );
  });

  it('never dates the edge from the source read time', async () => {
    const source = await publisher();
    // Scoped to the topic materializer on purpose. The product-profile
    // materializer uses `registered.sourceAvailableAt` for valid_from and is
    // CORRECT to: a profile's content hash is stable, so registerRawObject returns
    // the existing revision and that timestamp stays at first registration. The
    // topic snapshot embeds `asOf: capturedAt` in the hashed content, so it never
    // replays and its sourceAvailableAt advances every publish. Same expression,
    // opposite behaviour — which is why this assertion cannot be file-wide.
    const start = source.indexOf('async function materializeMacroTopicSource');
    assert.notEqual(start, -1, 'materializeMacroTopicSource must exist');
    const body = source.slice(start, source.indexOf('\nasync function', start + 1));

    assert.doesNotMatch(
      body,
      /validFrom: registered\.sourceAvailableAt/,
      'valid_from must not be the time we read the curated snapshot',
    );
    assert.match(body, /validFrom: row\.mappingCreatedAt/);
    // available_at SHOULD still be the read time — that half of the bitemporal
    // pair is supposed to move.
    assert.match(body, /availableAt: registered\.sourceAvailableAt/);
  });

  it('uses the same valid_from in the dry run as in the apply path', async () => {
    const source = await publisher();
    // Two occurrences: the dry-run topic candidates and the apply materializer. A
    // dry run with its own valid_from cannot predict whether the write replays,
    // which is the same defect the synthetic ETF ids had.
    const occurrences = source.match(/validFrom: row\.mappingCreatedAt/g) ?? [];
    assert.equal(
      occurrences.length,
      2,
      'both the dry run and the apply path must date it the same',
    );
  });
});
