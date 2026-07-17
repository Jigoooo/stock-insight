export type ReadSnapshotConnection = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
  release: () => void;
};

export type ReadSnapshotConnectionProvider = {
  connect: () => Promise<ReadSnapshotConnection>;
};

export type ReadSnapshotExecutor = Pick<ReadSnapshotConnection, 'queryRows'>;

export type ReadSnapshotOptions = {
  statementTimeoutMs: number;
  lockTimeoutMs: number;
  sessionUserId?: string;
};

function requirePositiveInteger(value: number, name: keyof ReadSnapshotOptions): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
}

export async function withReadSnapshot<TResult>(
  provider: ReadSnapshotConnectionProvider,
  work: (executor: ReadSnapshotExecutor) => Promise<TResult>,
  options: ReadSnapshotOptions,
): Promise<TResult> {
  requirePositiveInteger(options.statementTimeoutMs, 'statementTimeoutMs');
  requirePositiveInteger(options.lockTimeoutMs, 'lockTimeoutMs');
  const connection = await provider.connect();
  try {
    await connection.queryRows('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    if (options.sessionUserId !== undefined) {
      await connection.queryRows("SELECT set_config('stock_insight.user_id', $1, true)", [
        options.sessionUserId,
      ]);
    }
    await connection.queryRows("SELECT set_config('statement_timeout', $1, true)", [
      `${options.statementTimeoutMs}ms`,
    ]);
    await connection.queryRows("SELECT set_config('lock_timeout', $1, true)", [
      `${options.lockTimeoutMs}ms`,
    ]);
    const result = await work({ queryRows: connection.queryRows.bind(connection) });
    await connection.queryRows('COMMIT');
    return result;
  } catch (error) {
    try {
      await connection.queryRows('ROLLBACK');
    } catch {
      // Preserve the original failure; rollback is best-effort cleanup.
    }
    throw error;
  } finally {
    connection.release();
  }
}
