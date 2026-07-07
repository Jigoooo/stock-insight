import { z } from 'zod';

import { dataAvailabilitySchema } from '@stock-insight/contracts';

const percentTupleSchema = z.tuple([z.string(), z.number()]);
const timelineTupleSchema = z.tuple([z.string(), z.string()]);
const reviewTupleSchema = z.tuple([z.string(), z.string(), z.string()]);

export const stockSchema = z.object({
  id: z.string(),
  entityKey: z.string().optional(),
  market: z.enum(['KR', 'US']).optional(),
  dataAvailability: dataAvailabilitySchema.optional(),
  dataSource: z.enum(['mock', 'database', 'fallback']).optional(),
  analysisStatus: z.enum(['none', 'cached', 'queued', 'running', 'failed', 'stale']).optional(),
  lastAnalyzedAt: z.string().optional(),
  holding: z.boolean(),
  ticker: z.string(),
  name: z.string(),
  logo: z.string(),
  theme: z.string(),
  price: z.string(),
  change: z.string(),
  stance: z.string(),
  summary: z.string(),
  founded: z.string(),
  hq: z.string(),
  capital: z.string(),
  shares: z.string(),
  marketCap: z.string(),
  sales: z.string(),
  operatingProfit: z.string(),
  debtRatio: z.string(),
  roe: z.string(),
  segments: z.array(percentTupleSchema),
  shareholders: z.array(percentTupleSchema),
  history: z.array(timelineTupleSchema),
  positives: z.array(z.string()),
  risks: z.array(z.string()),
  review: reviewTupleSchema,
});

export const stockListSchema = z.array(stockSchema).min(1);
