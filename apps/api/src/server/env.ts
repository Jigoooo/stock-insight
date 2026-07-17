import { z } from 'zod';

const optionalNonEmptyUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().optional(),
);

const optionalUserIdSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().uuid().optional(),
);

const serverEnvSchema = z
  .object({
    DATABASE_URL: optionalNonEmptyUrlSchema,
    DATABASE_READ_URL: optionalNonEmptyUrlSchema,
    DATABASE_WRITE_URL: optionalNonEmptyUrlSchema,
    STOCK_INSIGHT_USER_ID: optionalUserIdSchema,
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
  databaseReadUrl?: string;
  databaseWriteUrl?: string;
  userId?: string;
  nodeEnv?: string;
};

export function parseServerEnv(source: EnvSource = getDefaultEnv()): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(
      'Invalid server environment: database URLs must be valid URLs and STOCK_INSIGHT_USER_ID must be a valid UUID when set',
    );
  }

  const env: ServerEnv = {};
  if (result.data.DATABASE_URL) env.databaseUrl = result.data.DATABASE_URL;
  const databaseReadUrl = result.data.DATABASE_READ_URL ?? result.data.DATABASE_URL;
  if (databaseReadUrl) env.databaseReadUrl = databaseReadUrl;
  if (result.data.DATABASE_WRITE_URL) env.databaseWriteUrl = result.data.DATABASE_WRITE_URL;
  if (result.data.STOCK_INSIGHT_USER_ID) env.userId = result.data.STOCK_INSIGHT_USER_ID;
  if (result.data.NODE_ENV) env.nodeEnv = result.data.NODE_ENV;
  return env;
}
