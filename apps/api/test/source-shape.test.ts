import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deriveShape, parseSourceShapeArgs } from '../src/ops/run-source-shape.ts';

const shapeOf = (text: string) => deriveShape(Buffer.from(text, 'utf8'));

describe('source shape extraction', () => {
  it('describes a JSON payload by its field names', () => {
    const shape = shapeOf('{"series":"WALCL","realtime_start":"2000-01-01"}');
    assert.equal(shape?.shapeKind, 'json_key_paths');
    assert.deepEqual(shape?.shape, ['realtime_start', 'series']);
  });

  it('does not call a shorter feed a schema change', () => {
    // The gauge is for a source that renamed or dropped a field, not for one that
    // returned nine items today and ten yesterday.
    const ten = shapeOf(
      JSON.stringify({ items: Array.from({ length: 10 }, () => ({ id: 1, at: 'x' })) }),
    );
    const nine = shapeOf(
      JSON.stringify({ items: Array.from({ length: 9 }, () => ({ id: 1, at: 'x' })) }),
    );
    assert.equal(ten?.shapeDigest, nine?.shapeDigest);
  });

  it('does call a renamed field a schema change', () => {
    const before = shapeOf('{"items":[{"publishedAt":"x"}]}');
    const after = shapeOf('{"items":[{"published_at":"x"}]}');
    assert.notEqual(before?.shapeDigest, after?.shapeDigest);
  });

  it('ignores values, so a number arriving as a string is not drift', () => {
    // That is a value problem. Folding types in would make every such payload read as
    // a schema change and drown the gauge.
    const numeric = shapeOf('{"volume":1234}');
    const stringy = shapeOf('{"volume":"1234"}');
    assert.equal(numeric?.shapeDigest, stringy?.shapeDigest);
  });

  it('reads a delimited export by its header columns', () => {
    const shape = shapeOf('Date|Symbol|ShortVolume|TotalVolume\n2026-08-10|AAPL|1|2\n');
    assert.equal(shape?.shapeKind, 'delimited_header');
    assert.deepEqual(shape?.shape, ['Date', 'Symbol', 'ShortVolume', 'TotalVolume']);
  });

  it('sees a new column in a delimited export', () => {
    const before = shapeOf('Date|Symbol|ShortVolume\na|b|c\n');
    const after = shapeOf('Date|Symbol|ShortVolume|Market\na|b|c|d\n');
    assert.notEqual(before?.shapeDigest, after?.shapeDigest);
  });

  it('never confuses a format change with a field change', () => {
    const json = shapeOf('{"Date":1,"Symbol":2,"ShortVolume":3}');
    const delimited = shapeOf('Date|Symbol|ShortVolume\na|b|c\n');
    // Same names, different carrier. The digest folds in the kind so one cannot be
    // mistaken for the other.
    assert.notEqual(json?.shapeDigest, delimited?.shapeDigest);
  });

  it('refuses a payload it cannot honestly read', () => {
    // Returning a shape here would let the gauge report "no drift" for a source it
    // never actually looked at — the exact failure it exists to catch.
    assert.equal(shapeOf(''), null);
    assert.equal(shapeOf('   '), null);
    assert.equal(shapeOf('{ not json'), null);
    assert.equal(shapeOf('# a markdown briefing\n\nprose, no columns\n'), null);
  });

  it('is stable regardless of key order', () => {
    assert.equal(shapeOf('{"a":1,"b":2}')?.shapeDigest, shapeOf('{"b":2,"a":1}')?.shapeDigest);
  });

  it('bounds depth rather than walking an arbitrarily nested payload', () => {
    let deep = '{"leaf":1}';
    for (let level = 0; level < 12; level += 1) deep = `{"n":${deep}}`;
    const shape = shapeOf(deep);
    assert.ok(shape);
    assert.ok(shape.shape.every((path) => path.split('.').length <= 8));
  });
});

describe('source shape arguments', () => {
  it('defaults to dry-run with a bounded batch', () => {
    const args = parseSourceShapeArgs([]);
    assert.equal(args.mode, 'dry-run');
    assert.equal(args.limit, 500);
  });

  it('supports rehearse and apply, but not both', () => {
    assert.equal(parseSourceShapeArgs(['--rehearse']).mode, 'rehearse');
    assert.equal(parseSourceShapeArgs(['--apply']).mode, 'apply');
    assert.throws(() => parseSourceShapeArgs(['--apply', '--rehearse']), /exactly one/);
  });

  it('rejects a nonsense limit', () => {
    assert.throws(() => parseSourceShapeArgs(['--limit', '0']), /positive/);
    assert.throws(() => parseSourceShapeArgs(['--limit']), /requires a value/);
  });
});
