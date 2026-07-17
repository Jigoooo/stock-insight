export const appPositionOpenUniquenessMigrationSql = String.raw`
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_positions
    WHERE status = 'open'
      AND closed_at IS NULL
    GROUP BY user_id, entity_key
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'cannot enforce one open position: duplicate user/entity rows exist';
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_positions_one_open
  ON public.user_positions (user_id, entity_key)
  WHERE status = 'open'
    AND closed_at IS NULL;
`;
