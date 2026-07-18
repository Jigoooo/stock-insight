import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runnerSource = readFileSync(
  new URL('../src/ingest/run-dart-financial-facts.ts', import.meta.url),
  'utf8',
);

test('quarterly OpenDART runner advances only on success or explicit no-data', () => {
  assert.match(runnerSource, /if \(status === '020'\)[\s\S]*?break outer/);
  assert.match(runnerSource, /if \(status === '013'\) continue/);
  assert.match(
    runnerSource,
    /if \(status !== '000'\) \{\s*throw new Error\(`OpenDART API status \$\{status\}`\);\s*\}/,
  );
  assert.doesNotMatch(runnerSource, /if \(status !== '000'\) continue/);
});

test('manual offset runs never advance the durable OpenDART cursor', () => {
  assert.match(runnerSource, /const shouldAdvanceCursor = requestedOffset === undefined/);
  assert.match(
    runnerSource,
    /if \(shouldAdvanceCursor\) \{[\s\S]*?client\.query\(SAVE_CURSOR_SQL/,
  );
  assert.match(runnerSource, /cursorAdvanced: apply && shouldAdvanceCursor/);
});

test('OpenDART source, cursor, and final audit fail closed atomically', () => {
  assert.match(runnerSource, /if \(source\.rows\.length !== 1\)/);
  assert.match(runnerSource, /SAVE_CURSOR_SQL[\s\S]*RETURNING source_id/);
  assert.match(runnerSource, /savedCursor\.rowCount[\s\S]*Expected one OpenDART cursor row/);
  assert.match(
    runnerSource,
    /client\.query\('BEGIN'\)[\s\S]*?client\.query\(SAVE_CURSOR_SQL[\s\S]*?client\.query\(INSERT_MIGRATION_RUN_SQL[\s\S]*?client\.query\('COMMIT'\)/,
  );
});
