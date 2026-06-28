import type { stockSchema } from './schema';
import type { z } from '@/shared/schema';

export type Stock = z.infer<typeof stockSchema>;
