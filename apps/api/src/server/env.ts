import { z } from 'zod';

const optionalNonEmptyUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().optional(),
);

const serverEnvSchema = z
  .object({
    DATABASE_URL: optionalNonEmptyUrlSchema,
    NODE_ENV: z.string().optional(),
  })
  .passthrough();

type EnvSource = Record<string, string | undefined>;

function getDefaultEnv(): EnvSource {
  const maybeGlobalProcess = globalThis as typeof globalThis & {
    process?: { env?: EnvSource };
  };

  return maybeGlobalProcess.process?.env ?? {};
}

export type ServerEnv = {
  databaseUrl?: string;
  nodeEnv?: string;
};

export function parseServerEnv(source: EnvSource = getDefaultEnv()): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error('Invalid server environment: DATABASE_URL must be a valid URL when set');
  }

  const env: ServerEnv = {};
  if (result.data.DATABASE_URL) env.databaseUrl = result.data.DATABASE_URL;
  if (result.data.NODE_ENV) env.nodeEnv = result.data.NODE_ENV;
  return env;
}
