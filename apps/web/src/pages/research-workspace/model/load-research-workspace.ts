import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import type { ResearchWorkspaceViewPayload } from './workspace-view-payload';
import { authFunctionMiddleware } from '@/server/auth/auth-middleware';

export type { ResearchWorkspaceViewPayload } from './workspace-view-payload';

const workspaceViewInputSchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    lane: z.enum(['must_know', 'for_you', 'explore']).optional(),
    record: z.string().min(1).max(256).optional(),
    snapshot: z
      .object({
        analysisRunId: z.string().min(1).max(128),
        analysisRevision: z.number().int().nonnegative(),
      })
      .optional(),
    view: z.enum(['today', 'radar', 'stocks', 'themes', 'research', 'history', 'status']),
  })
  .strict();

export const loadResearchWorkspaceView = createServerFn({ method: 'GET' })
  .middleware([authFunctionMiddleware])
  .validator(workspaceViewInputSchema)
  .handler(async ({ data }): Promise<ResearchWorkspaceViewPayload> => {
    const { loadResearchWorkspaceView: loadDirect } = await import('@/server/research-workspace');
    return loadDirect(data);
  });
