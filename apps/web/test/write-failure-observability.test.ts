// Write-failure observability contract.
//
// REGRESSION ORIGIN (P3 cutover): a bare `} catch {` in the brain's manual
// portfolio service swallowed a PostgreSQL foreign-key violation. The route
// answered its generic 500 envelope and the container logs were EMPTY, so the
// real cause took ~30 minutes to find and was initially misdiagnosed as a
// broken write path.
//
// The client contract must stay opaque (a write failure must not leak schema
// details), but the operator side must not be silent. This test pins that
// asymmetry so the logging cannot be optimised away again.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const read = (relative: string) => readFileSync(repoRoot + relative, 'utf8');

// Paths where an exception means "a write we accepted did not happen". These
// may never be silent.
const WRITE_FAILURE_PATHS = [
  'apps/api-server/src/write/manual-portfolio.service.ts',
  'apps/api-server/src/personalization/personalization.service.ts',
  'apps/web/src/server/manual-portfolio.ts',
];

describe('write failures are observable to the operator', () => {
  for (const path of WRITE_FAILURE_PATHS) {
    it(`${path} logs before returning a failure envelope`, () => {
      const source = read(path);
      assert.match(
        source,
        /console\.error\(/,
        `${path} must log the underlying error before answering with a failure envelope`,
      );
      const logCalls = source.match(/console\.error\([\s\S]*?\n\s*\}\);/g) ?? [];
      assert.ok(logCalls.length > 0, `${path} must use a structured operator log`);
      for (const logCall of logCalls) {
        assert.match(logCall, /errorType:/);
        assert.doesNotMatch(logCall, /\berror\s*[,}]/);
        assert.doesNotMatch(logCall, /\bidempotencyKey\b|\bmessage:|\bdetail:/);
      }
    });

    // A bare `} catch {` cannot even reference the error, so it is structurally
    // incapable of reporting it.
    it(`${path} binds the caught error where it handles a write failure`, () => {
      const source = read(path);
      const bareCatches = source.match(/\}\s*catch\s*\{/g) ?? [];
      for (const bare of bareCatches) {
        // Only JSON/segment parsing helpers may discard the error; assert that
        // any bare catch here is NOT the one guarding the write transaction.
        const index = source.indexOf(bare);
        const window = source.slice(Math.max(0, index - 400), index);
        assert.doesNotMatch(
          window,
          /withTransaction|claimMutation|completeMutation|brainRequest\(/,
          `${path} discards the error from a write path at offset ${index}`,
        );
      }
    });
  }

  it('keeps the client-facing envelope opaque', () => {
    const source = read('apps/api-server/src/write/manual-portfolio.service.ts');
    // The failure body is a fixed contract value; the error object itself must
    // never be serialised into it.
    assert.match(source, /MANUAL_PORTFOLIO_WRITE_FAILED/);
    assert.doesNotMatch(source, /body:\s*(String\()?error/);
    assert.doesNotMatch(source, /message:\s*error/);
  });
});
