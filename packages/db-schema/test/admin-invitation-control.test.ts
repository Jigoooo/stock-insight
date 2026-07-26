import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { adminInvitationControlMigrationSql } from '../src/migrations/054_admin_invitation_control.ts';

describe('054 admin invitation control migration', () => {
  it('creates a server-authoritative owner/admin/member role ledger', () => {
    assert.match(
      adminInvitationControlMigrationSql,
      /CREATE TABLE IF NOT EXISTS public\.app_account_roles/,
    );
    assert.match(
      adminInvitationControlMigrationSql,
      /CHECK \(role IN \('owner', 'admin', 'member'\)\)/,
    );
    assert.match(
      adminInvitationControlMigrationSql,
      /REFERENCES public\.app_users \(id\) ON DELETE RESTRICT/,
    );
    assert.match(
      adminInvitationControlMigrationSql,
      /INSERT INTO public\.app_account_roles[\s\S]*SELECT id, 'member'/,
    );
    assert.match(
      adminInvitationControlMigrationSql,
      /LOCK TABLE public\.app_users IN SHARE ROW EXCLUSIVE MODE/,
    );
    assert.match(
      adminInvitationControlMigrationSql,
      /LEFT JOIN public\.app_account_roles[\s\S]*role ledger backfill incomplete/,
    );
    assert.match(adminInvitationControlMigrationSql, /AFTER INSERT ON public\.app_users/);
  });

  it('authorizes invitation operations from the transaction-scoped session subject', () => {
    assert.match(
      adminInvitationControlMigrationSql,
      /current_setting\('stock_insight\.user_id', true\)/,
    );
    assert.match(adminInvitationControlMigrationSql, /role IN \('owner', 'admin'\)/);
    for (const signature of [
      'get_app_capabilities()',
      'issue_app_invitation(text,text,integer,timestamp with time zone)',
      'list_app_invitations()',
      'revoke_app_invitation(uuid,text)',
    ]) {
      assert.match(
        adminInvitationControlMigrationSql,
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature.replace(/[()]/g, '\\$&')}`),
      );
    }
  });

  it('bounds codes and exposes plaintext only outside the database', () => {
    assert.match(adminInvitationControlMigrationSql, /p_code_digest !~ '\^\[0-9a-f\]\{64\}\$'/);
    assert.match(adminInvitationControlMigrationSql, /p_max_uses < 1 OR p_max_uses > 10/);
    assert.match(adminInvitationControlMigrationSql, /p_expires_at IS NULL/);
    assert.match(
      adminInvitationControlMigrationSql,
      /p_expires_at <= now\(\) \+ interval '1 hour'/,
    );
    assert.match(
      adminInvitationControlMigrationSql,
      /p_expires_at > now\(\) \+ interval '30 days'/,
    );
    assert.doesNotMatch(adminInvitationControlMigrationSql, /plaintext|code_value|raw_code/i);
  });

  it('removes direct invitation-table mutation from application roles', () => {
    assert.match(
      adminInvitationControlMigrationSql,
      /'stock_insight_app_reader','stock_insight_app_writer'/,
    );
    assert.match(
      adminInvitationControlMigrationSql,
      /REVOKE ALL ON public\.app_invitations FROM %I/,
    );
    assert.doesNotMatch(
      adminInvitationControlMigrationSql,
      /GRANT (?:SELECT, )?INSERT(?:, UPDATE)? ON public\.app_invitations TO stock_insight_app_writer/,
    );
    const commonGrantStart = adminInvitationControlMigrationSql.indexOf(
      'FOREACH r IN ARRAY ARRAY[',
      adminInvitationControlMigrationSql.indexOf('DO $grants$'),
    );
    const writerGrantStart = adminInvitationControlMigrationSql.indexOf(
      "FOREACH r IN ARRAY ARRAY['stock_insight_app_writer','stock_insight_writer']",
      commonGrantStart,
    );
    const commonGrants = adminInvitationControlMigrationSql.slice(
      commonGrantStart,
      writerGrantStart,
    );
    const writerGrants = adminInvitationControlMigrationSql.slice(writerGrantStart);
    assert.doesNotMatch(commonGrants, /issue_app_invitation|revoke_app_invitation/);
    assert.match(writerGrants, /GRANT EXECUTE ON FUNCTION public\.issue_app_invitation/);
    assert.match(writerGrants, /GRANT EXECUTE ON FUNCTION public\.revoke_app_invitation/);
    assert.match(
      adminInvitationControlMigrationSql,
      /GRANT EXECUTE ON FUNCTION public\.list_app_invitations\(\) TO %I/,
    );
    assert.doesNotMatch(
      adminInvitationControlMigrationSql,
      /stock_insight_app_reader'[\s\S]{0,500}GRANT EXECUTE ON FUNCTION public\.issue_app_invitation/,
    );
    assert.match(adminInvitationControlMigrationSql, /pg_has_role\(session_user, r, 'member'\)/);
  });
});
