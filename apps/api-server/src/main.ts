import { createApp } from './app.ts';
import type { ApiServerEnv } from './config/env.ts';
import { API_SERVER_ENV } from './config/tokens.ts';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const env = app.get<ApiServerEnv>(API_SERVER_ENV);
  await app.listen({ host: env.host, port: env.port });
  process.stdout.write(`stock-insight-api-server listening on http://${env.host}:${env.port}\n`);
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(`api-server bootstrap failed: ${String(error)}\n`);
  process.exitCode = 1;
});
