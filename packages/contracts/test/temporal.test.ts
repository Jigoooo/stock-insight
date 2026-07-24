import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseTemporalQuery,
  resolveTemporalQuery,
  temporalQuerySchema,
  temporalResolutionMetaSchema,
} from '../src/temporal.ts';

describe('temporal query contract', () => {
  it('accepts explicit validAt/knownAt/informationSet', () => {
    const parsed = temporalQuerySchema.parse({
      validAt: '2026-07-20T00:00:00.000Z',
      knownAt: '2026-07-21T00:00:00.000Z',
      informationSet: 'as_known',
    });
    assert.equal(parsed.validAt, '2026-07-20T00:00:00.000Z');
    assert.equal(parsed.knownAt, '2026-07-21T00:00:00.000Z');
    assert.equal(parsed.informationSet, 'as_known');
  });

  it('defaults informationSet to as_known when omitted', () => {
    const parsed = temporalQuerySchema.parse({});
    assert.equal(parsed.informationSet, 'as_known');
    assert.equal(parsed.validAt, undefined);
    assert.equal(parsed.knownAt, undefined);
  });

  it('rejects a knownAt that precedes validAt (no future-known leak)', () => {
    assert.throws(() =>
      temporalQuerySchema.parse({
        validAt: '2026-07-21T00:00:00.000Z',
        knownAt: '2026-07-20T00:00:00.000Z',
      }),
    );
  });

  it('decomposes the asOf compatibility alias into both times', () => {
    const resolved = resolveTemporalQuery(
      parseTemporalQuery(new URLSearchParams('asOf=2026-07-20T00:00:00.000Z')),
    );
    assert.equal(resolved.validAt, '2026-07-20T00:00:00.000Z');
    assert.equal(resolved.knownAt, '2026-07-20T00:00:00.000Z');
    assert.equal(resolved.aliasApplied, 'asOf');
  });

  it('prefers explicit validAt/knownAt over asOf and records no alias', () => {
    const resolved = resolveTemporalQuery(
      parseTemporalQuery(
        new URLSearchParams(
          'asOf=2026-07-01T00:00:00.000Z&validAt=2026-07-20T00:00:00.000Z&knownAt=2026-07-21T00:00:00.000Z',
        ),
      ),
    );
    assert.equal(resolved.validAt, '2026-07-20T00:00:00.000Z');
    assert.equal(resolved.knownAt, '2026-07-21T00:00:00.000Z');
    assert.equal(resolved.aliasApplied, null);
  });

  it('resolves knownAt-now defaults and marks them resolved', () => {
    const resolved = resolveTemporalQuery(parseTemporalQuery(new URLSearchParams()), {
      now: '2026-07-21T12:00:00.000Z',
    });
    assert.equal(resolved.knownAt, '2026-07-21T12:00:00.000Z');
    assert.equal(resolved.validAt, '2026-07-21T12:00:00.000Z');
    assert.equal(resolved.informationSet, 'as_known');
    assert.equal(resolved.knownAtSource, 'now');
  });

  it('supports point-in-time information set that pins knownAt to validAt', () => {
    const resolved = resolveTemporalQuery(
      parseTemporalQuery(
        new URLSearchParams('validAt=2026-06-01T00:00:00.000Z&informationSet=point_in_time'),
      ),
    );
    assert.equal(resolved.informationSet, 'point_in_time');
    assert.equal(resolved.knownAt, '2026-06-01T00:00:00.000Z');
    assert.equal(resolved.validAt, '2026-06-01T00:00:00.000Z');
  });

  it('rejects an invalid asOf datetime', () => {
    assert.throws(() => parseTemporalQuery(new URLSearchParams('asOf=not-a-date')));
  });

  it('produces a resolution meta that round-trips through its schema', () => {
    const resolved = resolveTemporalQuery(
      parseTemporalQuery(new URLSearchParams('asOf=2026-07-20T00:00:00.000Z')),
      { ontologyRevision: 7 },
    );
    const meta = temporalResolutionMetaSchema.parse({
      validAt: resolved.validAt,
      knownAt: resolved.knownAt,
      informationSet: resolved.informationSet,
      aliasApplied: resolved.aliasApplied,
      knownAtSource: resolved.knownAtSource,
      ontologyRevision: resolved.ontologyRevision,
    });
    assert.equal(meta.validAt, '2026-07-20T00:00:00.000Z');
    assert.equal(meta.knownAt, '2026-07-20T00:00:00.000Z');
    assert.equal(meta.ontologyRevision, 7);
  });
});
