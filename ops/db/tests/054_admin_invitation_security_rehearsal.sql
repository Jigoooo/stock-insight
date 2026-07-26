\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE admin_acl_actor ON COMMIT DROP AS
SELECT r.user_id
  FROM public.app_account_roles r
  JOIN public.app_local_accounts a ON a.user_id = r.user_id
 WHERE r.role = 'owner'
 ORDER BY r.granted_at
 LIMIT 1;

DO $actor_check$
BEGIN
  IF (SELECT count(*) FROM admin_acl_actor) <> 1 THEN
    RAISE EXCEPTION 'rehearsal requires exactly one selected owner actor';
  END IF;
END
$actor_check$;

SELECT user_id AS owner_id FROM admin_acl_actor \gset

SET SESSION AUTHORIZATION stock_insight_app_reader;
SELECT set_config('stock_insight.user_id', :'owner_id', true);

DO $reader_denied$
BEGIN
  BEGIN
    PERFORM public.issue_app_invitation(
      repeat('a', 64),
      'reader must fail',
      1,
      now() + interval '1 day'
    );
    RAISE EXCEPTION 'reader unexpectedly issued an invitation';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$reader_denied$;

RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION stock_insight_app_writer;
SELECT set_config('stock_insight.user_id', :'owner_id', true);

SELECT invitation_id AS issued_id
  FROM public.issue_app_invitation(
    repeat('b', 64),
    'writer rehearsal',
    1,
    now() + interval '1 day'
  )
\gset

SELECT count(*) AS revoked_count
  FROM public.revoke_app_invitation(:'issued_id'::uuid, 'writer rehearsal cleanup')
\gset

\if :revoked_count
\else
  SELECT 1 / 0 AS writer_could_not_revoke_rehearsal_invitation;
\endif

RESET SESSION AUTHORIZATION;
ROLLBACK;
