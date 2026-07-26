\set ON_ERROR_STOP on

\if :{?owner_username}
\else
  SELECT 1 / 0 AS owner_username_variable_is_required;
\endif

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('stock_insight.bootstrap_owner.v1'));
LOCK TABLE public.app_local_accounts IN SHARE MODE;
LOCK TABLE public.app_account_roles IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE operator_owner_target ON COMMIT DROP AS
SELECT a.user_id
  FROM public.app_local_accounts a
  JOIN public.app_users u ON u.id = a.user_id
 WHERE a.username = :'owner_username';

DO $target_check$
BEGIN
  IF (SELECT count(*) FROM operator_owner_target) <> 1 THEN
    RAISE EXCEPTION 'owner username must resolve to exactly one active local account';
  END IF;
END
$target_check$;

INSERT INTO public.app_account_roles (user_id, role, granted_by_user_id, granted_at)
SELECT user_id, 'owner', NULL, clock_timestamp()
  FROM operator_owner_target
ON CONFLICT (user_id) DO UPDATE
SET role = 'owner',
    granted_by_user_id = NULL,
    granted_at = EXCLUDED.granted_at;

DO $owner_preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.app_account_roles r
      JOIN operator_owner_target target ON target.user_id = r.user_id
     WHERE r.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'target owner promotion failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.app_account_roles WHERE role = 'owner') THEN
    RAISE EXCEPTION 'owner preflight failed: no owner exists';
  END IF;
END
$owner_preflight$;

COMMIT;

SELECT EXISTS (
  SELECT 1
    FROM public.app_account_roles r
    JOIN public.app_local_accounts a ON a.user_id = r.user_id
   WHERE a.username = :'owner_username'
     AND r.role = 'owner'
) AS owner_ready;
