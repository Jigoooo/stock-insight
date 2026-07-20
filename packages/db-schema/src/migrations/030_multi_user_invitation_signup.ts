export const multiUserInvitationSignupMigrationSql = String.raw`
-- P0-MU-1: Invitation-gated multi-user signup.
-- Additive only: existing app_user_identity_map / app_local_accounts /
-- app_auth_bootstrap_state rows are never modified. This migration adds the
-- invitation ledger plus one SECURITY DEFINER function that atomically consumes
-- an invitation and mints (identity map + bootstrap tombstone + local account +
-- consumption) in a single transaction, so a single-use invite can never create
-- two accounts.

CREATE TABLE IF NOT EXISTS public.app_invitations (
  invitation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_digest text NOT NULL UNIQUE CHECK (code_digest ~ '^[0-9a-f]{64}$'),
  label text,
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses >= 1),
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0 AND used_count <= max_uses),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_invitation_consumptions (
  consumption_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES public.app_invitations (invitation_id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.app_user_identity_map (user_id) ON DELETE RESTRICT,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS app_invitation_consumptions_invitation_idx
  ON public.app_invitation_consumptions (invitation_id);

-- Invitation ledger is admin-managed and NOT user-scoped: ENABLE (not FORCE)
-- RLS so the table owner / SECURITY DEFINER signup function can operate on it,
-- while ordinary reader/writer client roles receive no table grants at all and
-- therefore cannot touch it directly.
ALTER TABLE public.app_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_invitation_consumptions ENABLE ROW LEVEL SECURITY;

-- Bootstrap INSERT policies for the two FORCE-RLS credential tables. The signup
-- function sets the transaction-local stock_insight.user_id GUC to the freshly
-- minted user before inserting, so these WITH CHECK predicates confirm every
-- credential row is written under its own canonical id. Table-level INSERT
-- privilege is still restricted to the owner + stock_insight_writer, so making
-- the policy role-agnostic does not widen who may attempt a write; it only lets
-- the SECURITY DEFINER owner satisfy FORCE RLS during atomic signup.
DROP POLICY IF EXISTS app_signup_scoped_insert ON public.app_local_accounts;
CREATE POLICY app_signup_scoped_insert ON public.app_local_accounts
  FOR INSERT
  WITH CHECK (user_id = nullif(current_setting('stock_insight.user_id', true), '')::uuid);

DROP POLICY IF EXISTS app_signup_scoped_insert ON public.app_auth_bootstrap_state;
CREATE POLICY app_signup_scoped_insert ON public.app_auth_bootstrap_state
  FOR INSERT
  WITH CHECK (user_id = nullif(current_setting('stock_insight.user_id', true), '')::uuid);

-- Login-lookup policy: the FORCE-RLS app_local_accounts table normally scopes
-- reads to the caller's own user id. Login must resolve an account by username
-- before the user id is known, so the SECURITY DEFINER lookup functions below
-- turn on a transaction-local privileged-lookup flag and immediately turn it
-- back off. Only those REVOKE-from-PUBLIC functions can set the flag in a
-- committing transaction, so no ordinary query path can read across users.
DROP POLICY IF EXISTS app_login_lookup ON public.app_local_accounts;
CREATE POLICY app_login_lookup ON public.app_local_accounts
  FOR SELECT
  USING (current_setting('stock_insight.login_lookup', true) = 'on');

CREATE OR REPLACE FUNCTION public.consume_invitation_and_create_account(
  p_code_digest text,
  p_username text,
  p_password_record text
)
RETURNS TABLE (status text, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invitation public.app_invitations%ROWTYPE;
  v_user_id uuid;
  v_legacy_key text;
BEGIN
  IF p_code_digest !~ '^[0-9a-f]{64}$' THEN
    RETURN QUERY SELECT 'invalid_code'::text, NULL::uuid;
    RETURN;
  END IF;
  IF p_username !~ '^[A-Za-z0-9._-]{3,64}$' THEN
    RETURN QUERY SELECT 'invalid_username'::text, NULL::uuid;
    RETURN;
  END IF;
  IF p_password_record !~ '^scrypt\$v=1\$N=16384\$r=8\$p=1\$[A-Za-z0-9_-]{21}[AQgw]\$[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$' THEN
    RETURN QUERY SELECT 'invalid_password'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Serialize all consumers of the same invite so the used_count check-and-bump
  -- is race-free even under concurrent apply. The lock is keyed on the digest.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('invitation:' || p_code_digest, 0)
  );

  SELECT * INTO v_invitation
    FROM public.app_invitations
   WHERE code_digest = p_code_digest
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid_code'::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_invitation.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT 'revoked'::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_invitation.expires_at IS NOT NULL AND v_invitation.expires_at <= now() THEN
    RETURN QUERY SELECT 'expired'::text, NULL::uuid;
    RETURN;
  END IF;
  IF v_invitation.used_count >= v_invitation.max_uses THEN
    RETURN QUERY SELECT 'exhausted'::text, NULL::uuid;
    RETURN;
  END IF;

  v_user_id := gen_random_uuid();
  v_legacy_key := 'mu:' || v_user_id::text;

  -- Write every credential row under the new user's own scope so FORCE-RLS
  -- WITH CHECK predicates pass. Transaction-local; reset on commit.
  PERFORM set_config('stock_insight.user_id', v_user_id::text, true);

  BEGIN
    INSERT INTO public.app_user_identity_map (legacy_user_id, user_id)
    VALUES (v_legacy_key, v_user_id);

    INSERT INTO public.app_auth_bootstrap_state (user_id)
    VALUES (v_user_id);

    INSERT INTO public.app_local_accounts (user_id, username, password_record)
    VALUES (v_user_id, p_username, p_password_record);

    INSERT INTO public.app_invitation_consumptions (invitation_id, user_id)
    VALUES (v_invitation.invitation_id, v_user_id);

    UPDATE public.app_invitations
       SET used_count = used_count + 1
     WHERE invitation_id = v_invitation.invitation_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- user_id is a fresh random UUID, so the only reachable collision is the
      -- canonical username. Roll back the whole block (the invite is not spent).
      RETURN QUERY SELECT 'username_taken'::text, NULL::uuid;
      RETURN;
  END;

  RETURN QUERY SELECT 'created'::text, v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_invitation_and_create_account(text, text, text) FROM PUBLIC;

-- Login resolves an account by its canonical username WITHOUT knowing the user
-- id first, which per-user RLS cannot express. A SECURITY DEFINER lookup returns
-- only the id + username + scrypt record needed to verify the password. Callable
-- by the app reader/writer roles only (REVOKE from PUBLIC); the record is a
-- one-way scrypt hash and the caller already needs it to run verification.
CREATE OR REPLACE FUNCTION public.lookup_login_account(p_username text)
RETURNS TABLE (user_id uuid, username text, password_record text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM set_config('stock_insight.login_lookup', 'on', true);
  RETURN QUERY
    SELECT a.user_id, a.username, a.password_record
      FROM public.app_local_accounts a
     WHERE a.username_canonical = lower(p_username)
     LIMIT 1;
  PERFORM set_config('stock_insight.login_lookup', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_login_account(text) FROM PUBLIC;

-- Session refresh already carries a verified user id (the signed token sub), so
-- rebuild the credential by canonical id. Same SECURITY DEFINER rationale.
CREATE OR REPLACE FUNCTION public.lookup_account_by_id(p_user_id uuid)
RETURNS TABLE (user_id uuid, username text, password_record text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM set_config('stock_insight.login_lookup', 'on', true);
  RETURN QUERY
    SELECT a.user_id, a.username, a.password_record
      FROM public.app_local_accounts a
     WHERE a.user_id = p_user_id
     LIMIT 1;
  PERFORM set_config('stock_insight.login_lookup', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_account_by_id(uuid) FROM PUBLIC;
`;
