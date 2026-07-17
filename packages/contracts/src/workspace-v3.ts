import { z } from 'zod';

export const workspaceV3Limits = {
  entityEvidence: 50,
  entitySources: 25,
  evidenceSourceIds: 10,
  graphNodes: 100,
  graphEdges: 200,
  graphEvidenceIds: 20,
  graphSourceIds: 20,
} as const;

const boundedTextSchema = (max: number) => z.string().trim().min(1).max(max);
const nonnegativeCountSchema = z.number().int().nonnegative().max(1_000_000);

export const workspaceV3MarketSchema = z.enum(['KR', 'US']);

export type WorkspaceV3Market = z.infer<typeof workspaceV3MarketSchema>;

export const stockEntityKeySchema = z
  .string()
  .regex(/^(?:KR:\d{6}|US:[A-Z][A-Z0-9]{0,7}(?:[.-][A-Z0-9]{1,2})?)$/);

export type StockEntityKey = z.infer<typeof stockEntityKeySchema>;

export const canonicalSourceSchema = z.enum(['database', 'projection', 'fallback']);

export type CanonicalSource = z.infer<typeof canonicalSourceSchema>;

export const canonicalAvailabilitySchema = z.enum([
  'available',
  'missing',
  'collecting',
  'stale',
  'text_only',
  'unsupported',
  'error',
]);

export type CanonicalAvailability = z.infer<typeof canonicalAvailabilitySchema>;

export const qualitySchema = z.enum(['low', 'medium', 'high']);

export type Quality = z.infer<typeof qualitySchema>;

export const canonicalMetaSchema = z.object({
  schemaVersion: z.literal('v3'),
  source: canonicalSourceSchema,
  availability: canonicalAvailabilitySchema,
  generatedAt: z.string().datetime(),
  asOf: z.string().datetime(),
});

export type CanonicalMeta = z.infer<typeof canonicalMetaSchema>;

export const analysisStatusSchema = z.enum([
  'none',
  'cached',
  'queued',
  'running',
  'failed',
  'stale',
]);

export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;

export const workspaceSummarySchema = z.object({
  meta: canonicalMetaSchema,
  entityCount: nonnegativeCountSchema,
  feedItemCount: nonnegativeCountSchema,
  evidenceCount: nonnegativeCountSchema,
  sourceCount: nonnegativeCountSchema,
  quality: qualitySchema,
  analysisStatus: analysisStatusSchema,
});

export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

export const feedListItemSchema = z.object({
  id: boundedTextSchema(160),
  entityKey: stockEntityKeySchema,
  title: boundedTextSchema(240),
  summary: boundedTextSchema(2_000),
  asOf: z.string().datetime(),
  availability: canonicalAvailabilitySchema,
  analysisStatus: analysisStatusSchema,
  evidenceCount: nonnegativeCountSchema,
  sourceCount: nonnegativeCountSchema,
  quality: qualitySchema,
});

export type FeedListItem = z.infer<typeof feedListItemSchema>;

export const entitySourceLinkSchema = z.object({
  id: boundedTextSchema(160),
  label: boundedTextSchema(240),
  url: z.string().url().max(2_048),
  kind: z.enum(['filing', 'exchange', 'official', 'news', 'research']),
  publishedAt: z.string().datetime().optional(),
});

export type EntitySourceLink = z.infer<typeof entitySourceLinkSchema>;

export const entityEvidenceSchema = z.object({
  id: boundedTextSchema(160),
  claim: boundedTextSchema(4_000),
  asOf: z.string().datetime(),
  quality: qualitySchema,
  sourceIds: z.array(boundedTextSchema(160)).min(1).max(workspaceV3Limits.evidenceSourceIds),
});

export type EntityEvidence = z.infer<typeof entityEvidenceSchema>;

const entityIdentitySchema = z
  .object({
    entityKey: stockEntityKeySchema,
    ticker: boundedTextSchema(16),
    market: workspaceV3MarketSchema,
  })
  .superRefine(({ entityKey, market, ticker }, context) => {
    if (entityKey !== `${market}:${ticker}`) {
      context.addIssue({
        code: 'custom',
        message: 'entityKey must match market and ticker',
        path: ['entityKey'],
      });
    }
  });

export const entityDetailSchema = z
  .object({
    meta: canonicalMetaSchema,
    entityKey: stockEntityKeySchema,
    ticker: boundedTextSchema(16),
    market: workspaceV3MarketSchema,
    displayName: boundedTextSchema(240),
    summary: boundedTextSchema(4_000),
    analysisStatus: analysisStatusSchema,
    quality: qualitySchema,
    evidence: z.array(entityEvidenceSchema).max(workspaceV3Limits.entityEvidence),
    sources: z.array(entitySourceLinkSchema).max(workspaceV3Limits.entitySources),
  })
  .superRefine((detail, context) => {
    const identity = entityIdentitySchema.safeParse(detail);
    if (!identity.success) {
      for (const issue of identity.error.issues) {
        context.addIssue({
          code: 'custom',
          message: issue.message,
          path: issue.path,
        });
      }
    }

    const sourceIds = new Set(detail.sources.map(({ id }) => id));
    for (const [evidenceIndex, evidence] of detail.evidence.entries()) {
      for (const [sourceIndex, sourceId] of evidence.sourceIds.entries()) {
        if (!sourceIds.has(sourceId)) {
          context.addIssue({
            code: 'custom',
            message: 'evidence sourceIds must reference a public source link',
            path: ['evidence', evidenceIndex, 'sourceIds', sourceIndex],
          });
        }
      }
    }
  });

export type EntityDetail = z.infer<typeof entityDetailSchema>;

export const relationGraphNodeSchema = z
  .object({
    entityKey: stockEntityKeySchema,
    market: workspaceV3MarketSchema,
    label: boundedTextSchema(240),
    quality: qualitySchema,
  })
  .superRefine(({ entityKey, market }, context) => {
    if (!entityKey.startsWith(`${market}:`)) {
      context.addIssue({
        code: 'custom',
        message: 'graph node market must match entityKey',
        path: ['entityKey'],
      });
    }
  });

export type RelationGraphNode = z.infer<typeof relationGraphNodeSchema>;

export const relationGraphEdgeSchema = z.object({
  id: boundedTextSchema(160),
  from: stockEntityKeySchema,
  to: stockEntityKeySchema,
  relation: boundedTextSchema(120),
  evidenceIds: z.array(boundedTextSchema(160)).max(workspaceV3Limits.graphEvidenceIds),
  sourceIds: z.array(boundedTextSchema(160)).max(workspaceV3Limits.graphSourceIds),
  quality: qualitySchema,
});

export type RelationGraphEdge = z.infer<typeof relationGraphEdgeSchema>;

export const relationGraphSchema = z
  .object({
    rootEntityKey: stockEntityKeySchema,
    nodes: z.array(relationGraphNodeSchema).min(1).max(workspaceV3Limits.graphNodes),
    edges: z.array(relationGraphEdgeSchema).max(workspaceV3Limits.graphEdges),
    asOf: z.string().datetime(),
    depth: z.number().int().min(0).max(2),
    availability: canonicalAvailabilitySchema,
    quality: qualitySchema,
  })
  .superRefine((graph, context) => {
    const nodeKeys = new Set(graph.nodes.map(({ entityKey }) => entityKey));
    if (!nodeKeys.has(graph.rootEntityKey)) {
      context.addIssue({
        code: 'custom',
        message: 'rootEntityKey must reference a graph node',
        path: ['rootEntityKey'],
      });
    }

    for (const [edgeIndex, edge] of graph.edges.entries()) {
      if (!nodeKeys.has(edge.from)) {
        context.addIssue({
          code: 'custom',
          message: 'edge from must reference a graph node',
          path: ['edges', edgeIndex, 'from'],
        });
      }
      if (!nodeKeys.has(edge.to)) {
        context.addIssue({
          code: 'custom',
          message: 'edge to must reference a graph node',
          path: ['edges', edgeIndex, 'to'],
        });
      }
    }
  });

export type RelationGraph = z.infer<typeof relationGraphSchema>;
