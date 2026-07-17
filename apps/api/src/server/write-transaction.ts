export type WriteTransactionConnection = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
  release: () => void;
};

export type WriteTransactionProvider = {
  connect: () => Promise<WriteTransactionConnection>;
};

export type WriteTransactionExecutor = Pick<WriteTransactionConnection, 'queryRows'>;

export type WriteTransactionOptions = Readonly<{
  statementTimeoutMs: number;
  lockTimeoutMs: number;
  sessionUserId: string;
}>;

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
}

export async function withWriteTransaction<TResult>(
  provider: WriteTransactionProvider,
  work: (executor: WriteTransactionExecutor) => Promise<TResult>,
  options: WriteTransactionOptions,
): Promise<TResult> {
  requirePositiveInteger(options.statementTimeoutMs, 'statementTimeoutMs');
  requirePositiveInteger(options.lockTimeoutMs, 'lockTimeoutMs');
  const connection = await provider.connect();
  try {
    await connection.queryRows('BEGIN');
    await connection.queryRows("SELECT set_config('stock_insight.user_id', $1, true)", [
      options.sessionUserId,
    ]);
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
      // Preserve the original mutation failure.
    }
    throw error;
  } finally {
    connection.release();
  }
}
