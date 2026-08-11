import { pathToFileURL } from 'node:url';

import pg, { type PoolClient } from 'pg';

import type { K4QueryClient } from './k4-market-intelligence-store.ts';
import type { K4PersistenceClient } from './k4-market-intelligence-writer.ts';
import { executeK4ValuationBandJob, parseK4ValuationBandArgs } from './k4-valuation-band-writer.ts';

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
  const args = parseK4ValuationBandArgs(argv);
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  const client = await pool.connect();
  try {
    const summaries = await executeK4ValuationBandJob({
      client: client as unknown as K4QueryClient & K4PersistenceClient,
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
