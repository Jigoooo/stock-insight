import { createHash } from 'node:crypto';

/**
 * Canonical JSON serialisation and its digest.
 *
 * Written for the SEC numeric-fact backfill and moved here when K6 needed the same
 * digest for common asset view packets. Two producers hashing "the same" object with
 * different key orders would emit different digests for identical content, which is
 * the one failure a content digest exists to prevent.
 */

/**
 * A value JSON.stringify would drop: object properties disappear, array slots
 * become null. Mirrored here so the streamed bytes match the old monolithic call.
 */
function isSerializable(value: unknown): boolean {
  return value !== undefined && typeof value !== 'function' && typeof value !== 'symbol';
}

/** A key JavaScript treats as an array index, and therefore lists before string keys. */
function isIntegerIndexKey(key: string): boolean {
  return /^(0|[1-9]\d*)$/.test(key) && Number(key) <= 4_294_967_294;
}

/**
 * Emits exactly the bytes `JSON.stringify(canonical(value))` would, one bounded
 * chunk at a time.
 *
 * This used to be a single `JSON.stringify` over the whole plan. On 2026-08-09 the
 * SEC backfill grew past Node's maximum string length, every market-enrichment run
 * died with `RangeError: Invalid string length`, and because the analytics pipeline
 * gates on that wrapper it stopped running for two days. Widening the batch would
 * have re-broken it later; not materialising the string cannot.
 *
 * The digest value must not move — `sec-numeric-fact-digest.test.ts` pins it against
 * the pre-rewrite implementation.
 */
export function writeCanonicalJson(value: unknown, write: (chunk: string) => void): void {
  if (Array.isArray(value)) {
    write('[');
    for (const [index, item] of value.entries()) {
      if (index > 0) write(',');
      if (isSerializable(item)) writeCanonicalJson(item, write);
      else write('null');
    }
    write(']');
    return;
  }
  if (value !== null && typeof value === 'object') {
    write('{');
    const sorted = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => isSerializable(item))
      .sort(([a], [b]) => a.localeCompare(b));
    // The old code rebuilt the sorted pairs with `Object.fromEntries`, and an object
    // literal always lists integer-like keys first in ascending numeric order however
    // they were inserted. Reproducing that re-ordering is what keeps the digest stable.
    const entries = [
      ...sorted.filter(([key]) => isIntegerIndexKey(key)).sort(([a], [b]) => Number(a) - Number(b)),
      ...sorted.filter(([key]) => !isIntegerIndexKey(key)),
    ];
    for (const [index, [key, item]] of entries.entries()) {
      if (index > 0) write(',');
      write(JSON.stringify(key));
      write(':');
      writeCanonicalJson(item, write);
    }
    write('}');
    return;
  }
  const text = JSON.stringify(value);
  write(text === undefined ? 'null' : text);
}

export function canonicalDigest(value: unknown): string {
  const hash = createHash('sha256');
  writeCanonicalJson(value, (chunk) => hash.update(chunk, 'utf8'));
  return hash.digest('hex');
}
