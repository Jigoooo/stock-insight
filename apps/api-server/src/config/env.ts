import { isAbsolute } from 'node:path';

import { z } from 'zod';

const optionalNonEmptyUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().optional(),
);

const optionalUserId = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().uuid().optional(),
);

const optionalAbsolutePath = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string()
    .refine((value) => isAbsolute(value), { message: 'must be an absolute path' })
    .optional(),
);

const apiServerEnvSchema = z.object({
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(6200),
  DATABASE_URL: optionalNonEmptyUrl,
  DATABASE_READ_URL: optionalNonEmptyUrl,
  STOCK_INSIGHT_USER_ID: optionalUserId,
  STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE: optionalAbsolutePath,
  NODE_ENV: z.string().optional(),
});

export type ApiServerEnv = {
  host: string;
  port: number;
  databaseReadUrl?: string;
  userId?: string;
  internalContextSecretFile?: string;
  nodeEnv?: string;
};

type EnvSource = Record<string, string | undefined>;

export function parseApiServerEnv(source: EnvSource = process.env): ApiServerEnv {
  const result = apiServerEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid api-server environment: ${issues}`);
  }

  const env: ApiServerEnv = {
    host: result.data.HOST,
    port: result.data.PORT,
  };
  const databaseReadUrl = result.data.DATABASE_READ_URL ?? result.data.DATABASE_URL;
  if (databaseReadUrl) env.databaseReadUrl = databaseReadUrl;
  if (result.data.STOCK_INSIGHT_USER_ID) env.userId = result.data.STOCK_INSIGHT_USER_ID;
  if (result.data.STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE) {
    env.internalContextSecretFile = result.data.STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE;
  }
  if (result.data.NODE_ENV) env.nodeEnv = result.data.NODE_ENV;
  return env;
}
