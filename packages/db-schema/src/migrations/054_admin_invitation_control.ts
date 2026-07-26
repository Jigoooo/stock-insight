export const adminInvitationControlMigrationSql = String.raw`
-- P0-MU-2: server-authoritative account roles and invitation administration.
-- Existing accounts are preserved and default to member. Environment-specific
-- owner promotion is an operator transaction, never hard-coded in this migration.

CREATE TABLE IF NOT EXISTS public.app_account_roles (
  user_id uuid PRIMARY KEY REFERENCES public.app_users (id) ON DELETE RESTRICT,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  granted_by_user_id uuid REFERENCES public.app_users (id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_account_roles ENABLE ROW LEVEL SECURITY;

LOCK TABLE public.app_users IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO public.app_account_roles (user_id, role)
SELECT id, 'member'
  FROM public.app_users
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_app_account_member_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.app_account_roles (user_id, role)
  VALUES (NEW.id, 'member')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_app_account_member_role() FROM PUBLIC;

DROP TRIGGER IF EXISTS app_users_member_role_after_insert ON public.app_users;
CREATE TRIGGER app_users_member_role_after_insert
AFTER INSERT ON public.app_users
FOR EACH ROW
EXECUTE FUNCTION public.ensure_app_account_member_role();

DO $role_backfill$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.app_users u
      LEFT JOIN public.app_account_roles r ON r.user_id = u.id
     WHERE r.user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'role ledger backfill incomplete';
  END IF;
END
$role_backfill$;

ALTER TABLE public.app_invitations
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES public.app_users (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS revoked_by_user_id uuid REFERENCES public.app_users (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS revoked_reason text;

DO $checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.app_invitations'::regclass
       AND conname = 'app_invitations_revoked_reason_length'
  ) THEN
    ALTER TABLE public.app_invitations
      ADD CONSTRAINT app_invitations_revoked_reason_length
      CHECK (revoked_reason IS NULL OR char_length(revoked_reason) BETWEEN 1 AND 240);
  END IF;
END
$checks$;

CREATE INDEX IF NOT EXISTS app_invitations_created_by_idx
  ON public.app_invitations (created_by_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.current_app_account_role()
RETURNS TABLE (user_id uuid, role text)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_text text;
  v_user_id uuid;
BEGIN
  v_user_text := nullif(current_setting('stock_insight.user_id', true), '');
  IF v_user_text IS NULL THEN
    RETURN;
  END IF;
  BEGIN
    v_user_id := v_user_text::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN;
  END;

  RETURN QUERY
  SELECT r.user_id, r.role
    FROM public.app_account_roles r
    JOIN public.app_local_accounts a ON a.user_id = r.user_id
   WHERE r.user_id = v_user_id
   LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.current_app_account_role() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.require_app_invitation_admin()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
BEGIN
  SELECT c.user_id
    INTO v_actor
    FROM public.current_app_account_role() c
   WHERE c.role IN ('owner', 'admin');

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'administrator capability required' USING ERRCODE = '42501';
  END IF;
  RETURN v_actor;
END;
$$;

REVOKE ALL ON FUNCTION public.require_app_invitation_admin() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.require_app_invitation_writer()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['stock_insight_app_writer','stock_insight_writer'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
       AND pg_has_role(session_user, r, 'member') THEN
      RETURN;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'application writer role required' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.require_app_invitation_writer() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_app_capabilities()
RETURNS TABLE (role text, can_manage_invitations boolean)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT c.role, c.role IN ('owner', 'admin')
    FROM public.current_app_account_role() c
$$;

REVOKE ALL ON FUNCTION public.get_app_capabilities() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.issue_app_invitation(
  p_code_digest text,
  p_label text,
  p_max_uses integer,
  p_expires_at timestamp with time zone
)
RETURNS TABLE (
  invitation_id uuid,
  label text,
  max_uses integer,
  used_count integer,
  expires_at timestamp with time zone,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
BEGIN
  PERFORM public.require_app_invitation_writer();
  v_actor := public.require_app_invitation_admin();
  IF p_code_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid invitation digest' USING ERRCODE = '22023';
  END IF;
  IF p_label IS NULL OR char_length(btrim(p_label)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'invalid invitation label' USING ERRCODE = '22023';
  END IF;
  IF p_max_uses < 1 OR p_max_uses > 10 THEN
    RAISE EXCEPTION 'invalid invitation use limit' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at IS NULL
     OR p_expires_at <= now() + interval '1 hour'
     OR p_expires_at > now() + interval '30 days' THEN
    RAISE EXCEPTION 'invalid invitation expiry' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  INSERT INTO public.app_invitations (
    code_digest,
    label,
    max_uses,
    expires_at,
    created_by_user_id
  )
  VALUES (p_code_digest, btrim(p_label), p_max_uses, p_expires_at, v_actor)
  RETURNING
    app_invitations.invitation_id,
    app_invitations.label,
    app_invitations.max_uses,
    app_invitations.used_count,
    app_invitations.expires_at,
    app_invitations.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_app_invitation(text,text,integer,timestamp with time zone) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.list_app_invitations()
RETURNS TABLE (
  invitation_id uuid,
  label text,
  max_uses integer,
  used_count integer,
  expires_at timestamp with time zone,
  revoked_at timestamp with time zone,
  revoked_reason text,
  created_at timestamp with time zone,
  created_by_username text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_app_invitation_admin();
  RETURN QUERY
  SELECT
    i.invitation_id,
    i.label,
    i.max_uses,
    i.used_count,
    i.expires_at,
    i.revoked_at,
    i.revoked_reason,
    i.created_at,
    a.username,
    CASE
      WHEN i.revoked_at IS NOT NULL THEN 'revoked'
      WHEN i.expires_at IS NOT NULL AND i.expires_at <= now() THEN 'expired'
      WHEN i.used_count >= i.max_uses THEN 'exhausted'
      ELSE 'active'
    END
  FROM public.app_invitations i
  LEFT JOIN public.app_local_accounts a ON a.user_id = i.created_by_user_id
  ORDER BY i.created_at DESC, i.invitation_id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_app_invitations() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.revoke_app_invitation(
  p_invitation_id uuid,
  p_reason text
)
RETURNS TABLE (invitation_id uuid, revoked_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
BEGIN
  PERFORM public.require_app_invitation_writer();
  v_actor := public.require_app_invitation_admin();
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'invalid revocation reason' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  UPDATE public.app_invitations i
     SET revoked_at = now(),
         revoked_by_user_id = v_actor,
         revoked_reason = btrim(p_reason)
   WHERE i.invitation_id = p_invitation_id
     AND i.revoked_at IS NULL
  RETURNING i.invitation_id, i.revoked_at;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_app_invitation(uuid,text) FROM PUBLIC;

DO $grants$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'stock_insight_app_reader','stock_insight_app_writer',
    'stock_insight_reader','stock_insight_writer'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON public.app_account_roles FROM %I', r);
      EXECUTE format('REVOKE ALL ON public.app_invitations FROM %I', r);
      EXECUTE format('REVOKE ALL ON public.app_invitation_consumptions FROM %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.current_app_account_role() TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.get_app_capabilities() TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.list_app_invitations() TO %I', r);
    END IF;
  END LOOP;

  FOREACH r IN ARRAY ARRAY['stock_insight_app_writer','stock_insight_writer'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.issue_app_invitation(text,text,integer,timestamp with time zone) TO %I', r);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.revoke_app_invitation(uuid,text) TO %I', r);
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.consume_invitation_and_create_account(text,text,text) TO %I',
        r
      );
    END IF;
  END LOOP;
END
$grants$;
`;
