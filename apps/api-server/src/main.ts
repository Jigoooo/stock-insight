import { pathToFileURL } from 'node:url';

import { createApp } from './app.ts';
import type { ApiServerEnv } from './config/env.ts';
import { API_SERVER_ENV } from './config/tokens.ts';
import { verifyLiveDatabaseTarget } from './db/live-database-guard.ts';
import { primeReadOnlyDatabasePool } from '@stock-insight/api';

type ApiApplication = {
  get(token: unknown): ApiServerEnv;
  listen(options: { host: string; port: number }): Promise<unknown>;
  close(): Promise<unknown>;
};

export async function bootstrap({
  createApplication = createApp,
  verifyDatabase = verifyLiveDatabaseTarget,
  primeDatabase = primeReadOnlyDatabasePool,
}: {
  createApplication?: () => Promise<ApiApplication>;
  verifyDatabase?: (env: ApiServerEnv) => Promise<void>;
  primeDatabase?: (env: ApiServerEnv) => Promise<void>;
} = {}): Promise<void> {
  const app = await createApplication();
  try {
    const env = app.get(API_SERVER_ENV);
    await verifyDatabase(env);
    await primeDatabase(env);
    await app.listen({ host: env.host, port: env.port });
    process.stdout.write(`stock-insight-api-server listening on http://${env.host}:${env.port}\n`);
  } catch (error) {
    await app.close();
    throw error;
  }
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (entry === import.meta.url) {
  void bootstrap().catch((error: unknown) => {
    process.stderr.write(`api-server bootstrap failed: ${String(error)}\n`);
    process.exitCode = 1;
  });
}
