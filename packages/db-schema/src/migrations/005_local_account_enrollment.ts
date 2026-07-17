export const appLocalAccountEnrollmentMigrationSql = String.raw`
CREATE TABLE IF NOT EXISTS public.app_auth_bootstrap_state (
  user_id uuid PRIMARY KEY REFERENCES public.app_user_identity_map (user_id) ON DELETE RESTRICT,
  enrollment_consumed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_local_accounts (
  user_id uuid PRIMARY KEY REFERENCES public.app_user_identity_map (user_id) ON DELETE RESTRICT,
  username text NOT NULL CHECK (username ~ '^[A-Za-z0-9._-]{3,64}$'),
  username_canonical text GENERATED ALWAYS AS (lower(username)) STORED,
  password_record text NOT NULL CHECK (password_record ~ '^scrypt\$v=1\$N=16384\$r=8\$p=1\$[A-Za-z0-9_-]{21}[AQgw]\$[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (username_canonical)
);

ALTER TABLE public.app_auth_bootstrap_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_auth_bootstrap_state FORCE ROW LEVEL SECURITY;
ALTER TABLE public.app_local_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_local_accounts FORCE ROW LEVEL SECURITY;
`;
