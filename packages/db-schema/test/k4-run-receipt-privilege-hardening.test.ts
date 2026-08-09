import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { additiveAppMigrations } from '../src/index.ts';
import { k4RunReceiptPrivilegeHardeningMigrationSql } from '../src/migrations/093_k4_run_receipt_privilege_hardening.ts';

describe('093 K4 run receipt privilege hardening', () => {
  it('is registered after the p4.v2 serving migration', () => {
    assert.equal(additiveAppMigrations.at(-1)?.id, '093_k4_run_receipt_privilege_hardening');
    assert.equal(additiveAppMigrations.at(-2)?.id, '092_p4_v2_serving');
  });

  it('revokes the raw receipt from public and both runtime app roles', () => {
    assert.match(
      k4RunReceiptPrivilegeHardeningMigrationSql,
      /REVOKE ALL PRIVILEGES ON TABLE analytics\.market_intelligence_run_receipt FROM PUBLIC/,
    );
    assert.match(k4RunReceiptPrivilegeHardeningMigrationSql, /stock_insight_app_reader/);
    assert.match(k4RunReceiptPrivilegeHardeningMigrationSql, /stock_insight_app_writer/);
  });

  it('does not revoke the analytics pipeline role that owns receipt writes', () => {
    assert.doesNotMatch(
      k4RunReceiptPrivilegeHardeningMigrationSql,
      /REVOKE[\s\S]*FROM si_analytics/,
    );
  });

  it('fails closed when the receipt relation is absent', () => {
    assert.match(
      k4RunReceiptPrivilegeHardeningMigrationSql,
      /to_regclass\('analytics\.market_intelligence_run_receipt'\) IS NULL/,
    );
    assert.match(k4RunReceiptPrivilegeHardeningMigrationSql, /RAISE EXCEPTION/);
  });
});
