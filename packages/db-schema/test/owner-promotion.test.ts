import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const promotionUrl = new URL('../../../ops/db/admin/promote-owner.sql', import.meta.url);

describe('owner promotion operator transaction', () => {
  it('requires an explicit username and fails closed on ambiguous targets', async () => {
    const sql = await readFile(promotionUrl, 'utf8');
    assert.match(sql, /\\if :\{\?owner_username\}/);
    assert.match(sql, /count\(\*\) FROM operator_owner_target\) <> 1/);
    assert.doesNotMatch(sql, /rlawldn1997/);
  });

  it('is serialized, idempotent, and verifies an owner exists before commit', async () => {
    const sql = await readFile(promotionUrl, 'utf8');
    assert.match(sql, /pg_advisory_xact_lock/);
    assert.match(sql, /ON CONFLICT \(user_id\) DO UPDATE/);
    assert.match(sql, /WHERE role = 'owner'/);
    assert.ok(sql.indexOf('owner preflight failed') < sql.indexOf('COMMIT;'));
  });
});
