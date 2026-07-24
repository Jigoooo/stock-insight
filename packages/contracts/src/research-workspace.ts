import { z } from 'zod';

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const countSchema = z.number().int().nonnegative().max(10_000_000);
const dateTimeSchema = z.string().datetime();
const canonicalAvailabilitySchema = z.enum([
  'available',
  'missing',
  'collecting',
  'stale',
  'text_only',
  'unsupported',
  'error',
]);
const qualitySchema = z.enum(['low', 'medium', 'high']);
const stockEntityKeySchema = z
  .string()
  .regex(/^(?:KR:\d{6}|US:[A-Z][A-Z0-9]{0,7}(?:[.-][A-Z0-9]{1,2})?)$/);

export const sourceCoverageSchema = z
  .object({
    linked: countSchema,
    clickable: countSchema,
    total: countSchema,
  })
  .superRefine(({ clickable, linked, total }, context) => {
    if (clickable > linked || linked > total) {
      context.addIssue({
        code: 'custom',
        message: 'source coverage must satisfy clickable <= linked <= total',
      });
    }
  });

export type SourceCoverage = z.infer<typeof sourceCoverageSchema>;

export const workspaceSnapshotMetaSchema = z.object({
  schemaVersion: z.literal('v3'),
  visibility: z.literal('internal'),
  generatedAt: dateTimeSchema,
  freshness: canonicalAvailabilitySchema,
  contentSnapshot: z.object({
    analysisRunId: boundedText(240),
    analysisRevision: z.number().int().positive(),
    analysisCutoffAt: dateTimeSchema,
    sourceWatermarkAt: dateTimeSchema,
    freshUntil: dateTimeSchema,
  }),
  graphSnapshot: z.object({
    requestedAsOf: dateTimeSchema,
    knownThroughAt: dateTimeSchema,
    edgeRevisionPolicy: z.literal('latest_known_at_or_before_cutoff'),
  }),
  marketSnapshot: z.object({ marketDataAsOf: dateTimeSchema.nullable() }),
  sourceCoverage: sourceCoverageSchema,
  qualityFlags: z.array(boundedText(160)).max(50),
});

export type WorkspaceSnapshotMeta = z.infer<typeof workspaceSnapshotMetaSchema>;

export const researchFeedLaneIdSchema = z.enum(['must_know', 'for_you', 'explore']);
export type ResearchFeedLaneId = z.infer<typeof researchFeedLaneIdSchema>;

export const relevanceSchema = z.object({
  kind: z.enum(['direct', 'related', 'indirect', 'market', 'discovery']),
  hops: z.number().int().min(0).max(6).nullable(),
});

export const researchFeedItemSchema = z.object({
  recordKey: boundedText(320),
  recordType: boundedText(120),
  market: z.enum(['KR', 'US', 'MACRO', 'GLOBAL']),
  title: boundedText(320),
  summary: boundedText(4_000),
  publishedAt: dateTimeSchema,
  affectedEntityKeys: z.array(stockEntityKeySchema).max(50),
  whySurfaced: boundedText(1_000),
  relevance: relevanceSchema,
  confidence: qualitySchema,
  sourceCoverage: sourceCoverageSchema,
  qualityFlags: z.array(boundedText(160)).max(50),
});

export type ResearchFeedItem = z.infer<typeof researchFeedItemSchema>;

export const researchFeedLaneSchema = z
  .object({
    lane: researchFeedLaneIdSchema,
    scopeTotal: countSchema,
    items: z.array(researchFeedItemSchema).max(50),
    nextCursor: boundedText(1_024).nullable(),
  })
  .superRefine(({ items, scopeTotal }, context) => {
    if (scopeTotal < items.length) {
      context.addIssue({
        code: 'custom',
        message: 'scopeTotal must include every returned item',
        path: ['scopeTotal'],
      });
    }
  });

export type ResearchFeedLane = z.infer<typeof researchFeedLaneSchema>;

export const researchFeedPageSchema = z
  .object({
    meta: workspaceSnapshotMetaSchema,
    lane: researchFeedLaneIdSchema,
    scopeTotal: countSchema,
    items: z.array(researchFeedItemSchema).max(50),
    nextCursor: boundedText(1_024).nullable(),
  })
  .superRefine(({ items, scopeTotal }, context) => {
    if (scopeTotal < items.length) {
      context.addIssue({ code: 'custom', message: 'scopeTotal must include every returned item' });
    }
  });

export type ResearchFeedPage = z.infer<typeof researchFeedPageSchema>;

export const workspaceTodaySchema = z
  .object({
    meta: workspaceSnapshotMetaSchema,
    summary: z.object({
      laneItemCount: countSchema,
      relationCount: countSchema,
      watchlistCount: countSchema,
      sourceCount: countSchema,
    }),
    lanes: z.array(researchFeedLaneSchema).length(3),
    defaultRecordKey: boundedText(320).nullable(),
  })
  .superRefine(({ defaultRecordKey, lanes, summary }, context) => {
    const laneIds = new Set(lanes.map(({ lane }) => lane));
    if (laneIds.size !== 3) {
      context.addIssue({
        code: 'custom',
        message: 'workspace must contain each feed lane exactly once',
        path: ['lanes'],
      });
    }

    const recordKeys = new Set<string>();
    let itemCount = 0;
    for (const [laneIndex, lane] of lanes.entries()) {
      for (const [itemIndex, item] of lane.items.entries()) {
        itemCount += 1;
        if (recordKeys.has(item.recordKey)) {
          context.addIssue({
            code: 'custom',
            message: 'a record may appear in only one feed lane',
            path: ['lanes', laneIndex, 'items', itemIndex, 'recordKey'],
          });
        }
        recordKeys.add(item.recordKey);
      }
    }

    if (summary.laneItemCount !== itemCount) {
      context.addIssue({
        code: 'custom',
        message: 'laneItemCount must equal returned lane items',
        path: ['summary', 'laneItemCount'],
      });
    }
    if (defaultRecordKey !== null && !recordKeys.has(defaultRecordKey)) {
      context.addIssue({
        code: 'custom',
        message: 'defaultRecordKey must reference a returned item',
        path: ['defaultRecordKey'],
      });
    }
  });

export type WorkspaceToday = z.infer<typeof workspaceTodaySchema>;

export const researchSourceSchema = z
  .object({
    sourceKey: boundedText(320),
    attributionText: boundedText(1_000),
    url: z.string().url().max(2_048).nullable(),
    publishedAt: dateTimeSchema.nullable(),
    sourceContentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    bindingState: z.enum(['verified', 'superseded', 'missing']),
  })
  .superRefine(({ bindingState, sourceContentHash }, context) => {
    if (bindingState === 'missing' && sourceContentHash !== null) {
      context.addIssue({
        code: 'custom',
        message: 'missing source bindings cannot claim a content hash',
      });
    }
    if (bindingState !== 'missing' && sourceContentHash === null) {
      context.addIssue({
        code: 'custom',
        message: 'verified source bindings require a content hash',
      });
    }
  });

export const researchEvidenceSchema = z.object({
  evidenceId: boundedText(320),
  claim: boundedText(4_000),
  sourceKeys: z.array(boundedText(320)).min(1).max(20),
  quality: qualitySchema,
});

export const researchRecordDetailSchema = researchFeedItemSchema
  .extend({
    meta: workspaceSnapshotMetaSchema,
    body: boundedText(20_000),
    category: boundedText(160),
    limitations: z.array(boundedText(1_000)).max(50),
    evidence: z.array(researchEvidenceSchema).max(100),
    sources: z.array(researchSourceSchema).max(50),
  })
  .superRefine(({ evidence, sources }, context) => {
    const sourcesByKey = new Map(sources.map((source) => [source.sourceKey, source]));
    for (const [evidenceIndex, item] of evidence.entries()) {
      for (const [sourceIndex, sourceKey] of item.sourceKeys.entries()) {
        const source = sourcesByKey.get(sourceKey);
        if (!source) {
          context.addIssue({
            code: 'custom',
            message: 'evidence must reference a returned run-bound source',
            path: ['evidence', evidenceIndex, 'sourceKeys', sourceIndex],
          });
        } else if (source.bindingState === 'missing') {
          context.addIssue({
            code: 'custom',
            message: 'evidence cannot reference a source missing its cutoff binding',
            path: ['evidence', evidenceIndex, 'sourceKeys', sourceIndex],
          });
        }
      }
    }
  });

export type ResearchRecordDetail = z.infer<typeof researchRecordDetailSchema>;

export const relationNodeSchema = z.object({
  entityKey: stockEntityKeySchema,
  label: boundedText(240),
  market: z.enum(['KR', 'US']),
  watched: z.boolean(),
  holding: z.boolean(),
});

export const relationEdgeSchema = z.object({
  edgeId: boundedText(320),
  from: stockEntityKeySchema,
  to: stockEntityKeySchema,
  relationType: z.enum(['same_industry', 'news_co_mention', 'peer', 'corroborates']),
  direction: z.enum(['directed', 'undirected']),
  weight: z.number().finite().min(0).max(1),
  approved: z.literal(true),
  inferred: z.literal(false),
  evidenceQuality: qualitySchema,
  evidenceCount: countSchema,
  clickableSourceCount: countSchema,
});

export const entityRelationGraphSchema = z
  .object({
    meta: workspaceSnapshotMetaSchema,
    rootEntityKey: stockEntityKeySchema,
    depth: z.number().int().min(0).max(2),
    nodes: z.array(relationNodeSchema).min(1).max(20),
    edges: z.array(relationEdgeSchema).max(80),
    evidenceSummary: z.object({
      evidenceCount: countSchema,
      clickableSourceCount: countSchema,
      limitation: boundedText(1_000),
    }),
  })
  .superRefine(({ edges, nodes, rootEntityKey }, context) => {
    const nodeKeys = new Set(nodes.map(({ entityKey }) => entityKey));
    if (!nodeKeys.has(rootEntityKey)) {
      context.addIssue({
        code: 'custom',
        message: 'rootEntityKey must reference a returned node',
        path: ['rootEntityKey'],
      });
    }
    for (const [edgeIndex, edge] of edges.entries()) {
      if (!nodeKeys.has(edge.from) || !nodeKeys.has(edge.to)) {
        context.addIssue({
          code: 'custom',
          message: 'relation edges must reference returned nodes',
          path: ['edges', edgeIndex],
        });
      }
      if (edge.clickableSourceCount > edge.evidenceCount) {
        context.addIssue({
          code: 'custom',
          message: 'clickableSourceCount cannot exceed evidenceCount',
          path: ['edges', edgeIndex, 'clickableSourceCount'],
        });
      }
    }
  });

export type EntityRelationGraph = z.infer<typeof entityRelationGraphSchema>;

export const datasetStatusSchema = z.object({
  domain: boundedText(120),
  datasetName: boundedText(240),
  availability: canonicalAvailabilitySchema,
  watermarkAt: dateTimeSchema.nullable(),
  rowCount: countSchema.nullable(),
  analysisRunId: boundedText(240).nullable(),
  analysisRevision: z.number().int().positive().nullable(),
});

export const systemStatusSchema = z.object({
  generatedAt: dateTimeSchema,
  overall: canonicalAvailabilitySchema,
  datasets: z.array(datasetStatusSchema).max(100),
  sourceCoverage: sourceCoverageSchema,
  graphSourceCoverage: sourceCoverageSchema,
});

export type SystemStatus = z.infer<typeof systemStatusSchema>;

export const decisionHistoryEntryTypeSchema = z.enum([
  'alert_review',
  'trade_note',
  'judgment_evaluation',
  'manual_note',
]);

export const decisionHistoryItemSchema = z.object({
  historyId: z.string().uuid(),
  entityKey: stockEntityKeySchema,
  market: z.enum(['KR', 'US']),
  entryType: decisionHistoryEntryTypeSchema,
  title: boundedText(320),
  thesis: boundedText(4_000),
  evidenceCount: countSchema,
  sourceKind: boundedText(160).nullable(),
  sourceRef: boundedText(500).nullable(),
  occurredAt: dateTimeSchema.nullable(),
  reviewDueAt: dateTimeSchema.nullable(),
  status: z.enum(['open', 'reviewed', 'archived']),
  adviceProhibited: z.literal(true),
  createdAt: dateTimeSchema,
});

export type DecisionHistoryItem = z.infer<typeof decisionHistoryItemSchema>;

export const decisionHistoryPageSchema = z
  .object({
    generatedAt: dateTimeSchema,
    availability: canonicalAvailabilitySchema,
    scopeTotal: countSchema,
    items: z.array(decisionHistoryItemSchema).max(50),
    nextCursor: boundedText(1_024).nullable(),
  })
  .superRefine(({ items, scopeTotal }, context) => {
    if (scopeTotal < items.length) {
      context.addIssue({ code: 'custom', message: 'scopeTotal must include every returned item' });
    }
  });

export type DecisionHistoryPage = z.infer<typeof decisionHistoryPageSchema>;

export const radarSignalItemSchema = z.object({
  signalKey: boundedText(320),
  entityKey: stockEntityKeySchema,
  market: z.enum(['KR', 'US']),
  symbol: boundedText(32),
  name: boundedText(240),
  signalType: boundedText(120),
  polarity: boundedText(80),
  strength: z.number().finite().min(0).max(1),
  summary: boundedText(2_000),
  occurredAt: dateTimeSchema,
  sourceName: boundedText(240).nullable(),
  watched: z.boolean(),
  holding: z.boolean(),
});

export type RadarSignalItem = z.infer<typeof radarSignalItemSchema>;

export const marketComponentAvailabilitySchema = z.enum([
  'available',
  'partial',
  'empty',
  'stale',
  'missing',
  'error',
]);

export const marketComponentWatermarkSchema = z
  .object({
    availability: marketComponentAvailabilitySchema,
    watermarkAt: dateTimeSchema.nullable(),
    rowCount: countSchema,
  })
  .superRefine(({ availability, rowCount, watermarkAt }, context) => {
    if (['available', 'partial', 'stale'].includes(availability) && watermarkAt === null) {
      context.addIssue({
        code: 'custom',
        message: 'content component watermark requires a timestamp',
        path: ['watermarkAt'],
      });
    }
    if (['empty', 'missing'].includes(availability) && (watermarkAt !== null || rowCount !== 0)) {
      context.addIssue({
        code: 'custom',
        message: 'empty or missing component watermark cannot claim rows or a timestamp',
      });
    }
  });

export const marketComponentWatermarksSchema = z.object({
  event_radar: marketComponentWatermarkSchema,
  factor_map: marketComponentWatermarkSchema,
  propagation_map: marketComponentWatermarkSchema,
  theme_community: marketComponentWatermarkSchema,
  heatmap_matrix: marketComponentWatermarkSchema,
  timeline: marketComponentWatermarkSchema,
  map_globe: marketComponentWatermarkSchema,
  value_chain: marketComponentWatermarkSchema,
});

export type MarketComponentWatermark = z.infer<typeof marketComponentWatermarkSchema>;
export type MarketComponentWatermarks = z.infer<typeof marketComponentWatermarksSchema>;

export const radarSignalPageSchema = z
  .object({
    generatedAt: dateTimeSchema,
    signalAsOf: dateTimeSchema.nullable(),
    scopeTotal: countSchema,
    componentWatermarks: marketComponentWatermarksSchema,
    items: z.array(radarSignalItemSchema).max(50),
    nextCursor: boundedText(1_024).nullable(),
  })
  .superRefine(({ items, scopeTotal }, context) => {
    if (scopeTotal < items.length) {
      context.addIssue({
        code: 'custom',
        message: 'scopeTotal must include every returned signal',
      });
    }
  });

export type RadarSignalPage = z.infer<typeof radarSignalPageSchema>;

export const themeResearchItemSchema = z
  .object({
    themeKey: z.string().regex(/^THEME:[a-z0-9][a-z0-9_-]{1,119}$/),
    title: boundedText(240),
    description: boundedText(1_000),
    memberCount: countSchema,
    watchedCount: countSchema,
    holdingCount: countSchema,
    recentSignalCount: countSchema,
    topEntityKeys: z.array(stockEntityKeySchema).max(5),
  })
  .superRefine(({ holdingCount, memberCount, topEntityKeys, watchedCount }, context) => {
    if (
      holdingCount > memberCount ||
      watchedCount > memberCount ||
      topEntityKeys.length > memberCount
    ) {
      context.addIssue({ code: 'custom', message: 'theme membership counts are inconsistent' });
    }
  });

export type ThemeResearchItem = z.infer<typeof themeResearchItemSchema>;

export const themeResearchListSchema = z.object({
  generatedAt: dateTimeSchema,
  graphKnownThroughAt: dateTimeSchema.nullable(),
  signalAsOf: dateTimeSchema.nullable(),
  availability: canonicalAvailabilitySchema,
  items: z.array(themeResearchItemSchema).max(100),
});

export type ThemeResearchList = z.infer<typeof themeResearchListSchema>;

export const decisionSupportActionSchema = z.enum([
  'ADD',
  'HOLD',
  'REDUCE',
  'EXIT',
  'WATCH',
  'NO_ACTION',
  'INSUFFICIENT_DATA',
]);

export const decisionSupportPacketSchema = z
  .object({
    decisionPacketId: z.string().uuid(),
    entityKey: stockEntityKeySchema.nullable(),
    entityName: boundedText(320),
    action: decisionSupportActionSchema.nullable(),
    actionReason: boundedText(2_000).nullable(),
    abstentionReason: boundedText(320).nullable(),
    commonViewAsOf: dateTimeSchema,
    generatedAt: dateTimeSchema,
    expiresAt: dateTimeSchema,
    legalReviewStatus: z.enum(['required', 'approved_read_only']),
    restrictionReason: z.enum(['LEGAL_REVIEW_REQUIRED', 'PACKET_EXPIRED']).nullable(),
    adviceProhibited: z.literal(true),
    orderExecutable: z.literal(false),
  })
  .superRefine((packet, context) => {
    const commonViewAsOf = Date.parse(packet.commonViewAsOf);
    const generatedAt = Date.parse(packet.generatedAt);
    const expiresAt = Date.parse(packet.expiresAt);
    if (commonViewAsOf > generatedAt || generatedAt >= expiresAt) {
      context.addIssue({ code: 'custom', message: 'packet timestamps must be causally ordered' });
    }
    if (
      packet.action !== null &&
      packet.action !== 'INSUFFICIENT_DATA' &&
      packet.abstentionReason !== null
    ) {
      context.addIssue({ code: 'custom', message: 'non-abstention action cannot carry a reason' });
    }
    if (packet.restrictionReason === 'PACKET_EXPIRED') {
      if (
        packet.action !== null ||
        packet.actionReason !== null ||
        packet.abstentionReason !== null
      ) {
        context.addIssue({ code: 'custom', message: 'expired packet must remain redacted' });
      }
      return;
    }
    if (packet.legalReviewStatus === 'required') {
      if (
        packet.action !== null ||
        packet.actionReason !== null ||
        packet.abstentionReason !== null ||
        packet.restrictionReason !== 'LEGAL_REVIEW_REQUIRED'
      ) {
        context.addIssue({ code: 'custom', message: 'unreviewed action must remain redacted' });
      }
      return;
    }
    if (
      packet.action === null ||
      packet.actionReason === null ||
      packet.restrictionReason !== null
    ) {
      context.addIssue({
        code: 'custom',
        message: 'approved read-only packet must expose its state',
      });
    }
    if (packet.action === 'INSUFFICIENT_DATA' && packet.abstentionReason === null) {
      context.addIssue({ code: 'custom', message: 'abstention packet requires a reason' });
    }
  });

export type DecisionSupportPacket = z.infer<typeof decisionSupportPacketSchema>;

export const decisionSupportSummarySchema = z
  .object({
    availability: canonicalAvailabilitySchema,
    sourceState: z.enum(['migration_missing', 'ready']),
    packetCount: countSchema,
    latestPacket: decisionSupportPacketSchema.nullable(),
  })
  .superRefine((summary, context) => {
    const hasPacket = summary.latestPacket !== null;
    if (summary.packetCount > 0 !== hasPacket) {
      context.addIssue({ code: 'custom', message: 'packet count and latest packet must agree' });
    }
    if (summary.sourceState === 'migration_missing') {
      if (summary.availability !== 'missing' || summary.packetCount !== 0 || hasPacket) {
        context.addIssue({ code: 'custom', message: 'missing migration cannot expose packets' });
      }
      return;
    }
    if (!summary.latestPacket) {
      if (summary.availability !== 'missing') {
        context.addIssue({ code: 'custom', message: 'ready source without packets is missing' });
      }
      return;
    }
    const expectedAvailability =
      summary.latestPacket.restrictionReason === 'PACKET_EXPIRED' ? 'stale' : 'available';
    if (summary.availability !== expectedAvailability) {
      context.addIssue({
        code: 'custom',
        message: 'packet restriction and availability must agree',
      });
    }
  });

export type DecisionSupportSummary = z.infer<typeof decisionSupportSummarySchema>;

export const myResearchOverviewSchema = z.object({
  generatedAt: dateTimeSchema,
  availability: canonicalAvailabilitySchema,
  watchlistCount: countSchema,
  holdingCount: countSchema,
  openHistoryCount: countSchema,
  reviewDueCount: countSchema,
  recentHistory: z.array(decisionHistoryItemSchema).max(10),
  decisionSupport: decisionSupportSummarySchema,
});

export type MyResearchOverview = z.infer<typeof myResearchOverviewSchema>;
