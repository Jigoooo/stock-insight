import { pathToFileURL } from 'node:url';

import pg, { type PoolClient } from 'pg';

import {
  executeK4SemanticSnapshotJob,
  parseK4SemanticSnapshotArgs,
  type K4SemanticSnapshotQueryClient,
} from './k4-semantic-snapshot.ts';

type PgModule = {
  Pool: new (options: { connectionString: string; max: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const args = parseK4SemanticSnapshotArgs(argv);
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  const client = await pool.connect();
  try {
    const summaries = await executeK4SemanticSnapshotJob({
      client: client as unknown as K4SemanticSnapshotQueryClient,
      args,
    });
    console.log(JSON.stringify(summaries, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  await main();
}
