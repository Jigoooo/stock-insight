import { pathToFileURL } from 'node:url';

import pg, { type PoolClient } from 'pg';

import { executeScenarioThesisJob, parseScenarioThesisArgs } from './scenario-thesis-writer.ts';

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
  const args = parseScenarioThesisArgs(argv);
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  const client = await pool.connect();
  try {
    const summary = await executeScenarioThesisJob({
      client: client as unknown as Parameters<typeof executeScenarioThesisJob>[0]['client'],
      args,
    });
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
