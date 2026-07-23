import { z } from 'zod';

import { decisionSupportPacketSchema } from '@stock-insight/contracts/research-workspace';

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const dateTimeSchema = z.string().datetime();
const uuidSchema = z.string().uuid();
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const decimalSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
const probabilitySchema = z.number().finite().min(0).max(1);
const finiteSchema = z.number().finite();
const entityKeySchema = z
  .string()
  .regex(/^(?:KR:\d{6}|US:[A-Z][A-Z0-9]{0,7}(?:[.-][A-Z0-9]{1,2})?)$/);
const availabilitySchema = z.enum(['available', 'missing', 'stale', 'error']);

export const personalizationDecisionReasonCodeSchema = z.enum([
  'THESIS_WEAKENED',
  'THESIS_BROKEN',
  'NEGATIVE_EVENT_TRANSMISSION',
  'GEO_CONCENTRATION_RISK',
  'VALUATION_RISK',
  'RISK_BUDGET_BREACH',
  'PORTFOLIO_CONCENTRATION',
  'LIQUIDITY_NEED',
  'CATALYST_EXPIRED',
  'BETTER_RISK_ADJUSTED_ALTERNATIVE',
  'THESIS_INTACT',
  'POSITIVE_SCENARIO_ASYMMETRY',
  'MARGIN_OF_SAFETY',
  'DIVERSIFICATION_BENEFIT',
  'UNDER_TARGET_WEIGHT',
  'POSITIVE_EVENT_TRANSMISSION',
  'COST_OF_TRADING_EXCEEDS_BENEFIT',
  'WAIT_FOR_CONFIRMATION',
]);

export type PersonalizationDecisionReasonCode = z.infer<
  typeof personalizationDecisionReasonCodeSchema
>;

export const personalizationPortfolioPositionSchema = z.object({
  entityKey: entityKeySchema,
  entityName: boundedText(320),
  market: z.enum(['KR', 'US']),
  currency: z.string().regex(/^[A-Z]{3}$/),
  quantity: decimalSchema,
  marketValue: decimalSchema,
  portfolioWeight: probabilitySchema,
  costBasisTotal: decimalSchema.nullable(),
  acquiredAt: dateTimeSchema.nullable(),
});

export const personalizationPortfolioSnapshotSchema = z
  .object({
    schemaVersion: z.literal('p4.v1'),
    availability: availabilitySchema,
    portfolioSnapshotId: uuidSchema,
    snapshotAsOf: dateTimeSchema,
    sourceKnownAt: dateTimeSchema,
    sealedAt: dateTimeSchema,
    baseCurrency: z.string().regex(/^[A-Z]{3}$/),
    totalMarketValue: decimalSchema,
    positionCount: z.number().int().nonnegative().max(1_000),
    snapshotDigest: digestSchema,
    positions: z.array(personalizationPortfolioPositionSchema).max(1_000),
  })
  .superRefine((snapshot, context) => {
    const snapshotAsOf = Date.parse(snapshot.snapshotAsOf);
    const sourceKnownAt = Date.parse(snapshot.sourceKnownAt);
    const sealedAt = Date.parse(snapshot.sealedAt);
    if (sourceKnownAt < snapshotAsOf || sealedAt < sourceKnownAt) {
      context.addIssue({ code: 'custom', message: 'snapshot timestamps must be causally ordered' });
    }
    const totalWeight = snapshot.positions.reduce(
      (sum, position) => sum + position.portfolioWeight,
      0,
    );
    if (!Number.isFinite(totalWeight) || totalWeight > 1 + 1e-8) {
      context.addIssue({ code: 'custom', message: 'portfolio position weights cannot exceed one' });
    }
    if (snapshot.positionCount !== snapshot.positions.length) {
      context.addIssue({ code: 'custom', message: 'positionCount must match returned positions' });
    }
  });

export type PersonalizationPortfolioSnapshot = z.infer<
  typeof personalizationPortfolioSnapshotSchema
>;

export const personalizationPortfolioImpactSchema = z.object({
  schemaVersion: z.literal('p4.v1'),
  availability: availabilitySchema,
  portfolioSnapshotId: uuidSchema,
  eventId: boundedText(320).nullable(),
  scenarioId: boundedText(320).nullable(),
  horizon: boundedText(80),
  knownAt: dateTimeSchema,
  generatedAt: dateTimeSchema,
  aggregateImpact: finiteSchema,
  affectedPositions: z
    .array(
      z.object({
        entityKey: entityKeySchema,
        portfolioWeight: probabilitySchema,
        direction: z.enum(['positive', 'neutral', 'negative', 'mixed']),
        impactScore: finiteSchema,
        contribution: finiteSchema,
        evidenceRefs: z.array(boundedText(320)).min(1).max(50),
      }),
    )
    .max(1_000),
});

export type PersonalizationPortfolioImpact = z.infer<typeof personalizationPortfolioImpactSchema>;

const explanationSchema = z.object({
  whatChanged: z.array(boundedText(1_000)).min(1).max(50),
  commonAssetView: z.object({
    availability: z.enum(['available', 'empty', 'missing', 'error']),
    calibration: z.enum(['sufficient', 'insufficient', 'missing']),
    direction: z.enum(['positive', 'neutral', 'negative', 'mixed']),
    coverage: probabilitySchema,
  }),
  personalizedReason: boundedText(4_000),
  eventAndGeoPaths: z.object({
    eventTransmission: finiteSchema.min(-1).max(1),
    geoConcentrationRisk: probabilitySchema,
    valuationRisk: probabilitySchema,
  }),
  upsideDownsideAndHorizon: z.object({
    expectedReturn: finiteSchema,
    downsideCvar: finiteSchema.nonnegative(),
    lowerReturn: finiteSchema,
    upperReturn: finiteSchema,
    horizon: boundedText(80),
  }),
  costTaxAndConcentration: z.object({
    transactionCostRate: finiteSchema.nonnegative(),
    transactionCost: finiteSchema.nonnegative(),
    taxCostRate: finiteSchema.nonnegative(),
    taxCost: finiteSchema.nonnegative(),
    totalCost: finiteSchema.nonnegative(),
    concentrationBefore: probabilitySchema,
    concentrationAfter: probabilitySchema,
  }),
  counterEvidenceAndUnknowns: z.array(boundedText(2_000)).max(200),
  invalidationConditions: z.array(boundedText(2_000)).max(100),
  validUntil: dateTimeSchema,
});

export const personalizationDecisionSupportSchema = z
  .object({
    schemaVersion: z.literal('p4.v1'),
    availability: availabilitySchema,
    portfolioSnapshotId: uuidSchema,
    commonViewKey: boundedText(512),
    commonViewDigest: digestSchema,
    packet: decisionSupportPacketSchema,
    reasonCodes: z.array(personalizationDecisionReasonCodeSchema).max(18),
    targetWeight: z
      .object({ low: probabilitySchema, high: probabilitySchema })
      .refine(({ high, low }) => low <= high, 'target low must not exceed target high')
      .nullable(),
    explanation: explanationSchema.nullable(),
    readOnly: z.literal(true),
  })
  .superRefine((response, context) => {
    const redacted = response.packet.action === null;
    if (redacted) {
      if (
        response.reasonCodes.length !== 0 ||
        response.targetWeight !== null ||
        response.explanation !== null
      ) {
        context.addIssue({ code: 'custom', message: 'restricted packet details must be redacted' });
      }
      return;
    }
    if (response.targetWeight === null || response.explanation === null) {
      context.addIssue({ code: 'custom', message: 'visible action requires structured details' });
    }
    if (response.explanation?.validUntil !== response.packet.expiresAt) {
      context.addIssue({ code: 'custom', message: 'explanation and packet expiry must agree' });
    }
  });

export type PersonalizationDecisionSupport = z.infer<typeof personalizationDecisionSupportSchema>;

export const personalizationDecisionHistorySchema = z.object({
  schemaVersion: z.literal('p4.v1'),
  availability: availabilitySchema,
  entityKey: entityKeySchema,
  items: z.array(decisionSupportPacketSchema).max(200),
  nextCursor: boundedText(1_024).nullable(),
});

export type PersonalizationDecisionHistory = z.infer<typeof personalizationDecisionHistorySchema>;

const thesisRevisionSchema = z.object({
  thesisRevisionId: uuidSchema,
  revisionNo: z.number().int().positive().max(1_000_000),
  sourceKind: z.enum(['user_authored', 'system_generated']),
  thesisText: boundedText(20_000),
  evidenceRefs: z.array(boundedText(512)).max(100),
  counterEvidence: z.array(boundedText(2_000)).max(100),
  invalidationConditions: z.array(boundedText(2_000)).max(100),
  status: z.enum(['active', 'invalidated', 'superseded']),
  validFrom: dateTimeSchema,
  validTo: dateTimeSchema.nullable(),
});

export const personalizationThesisSchema = z.object({
  schemaVersion: z.literal('p4.v1'),
  availability: availabilitySchema,
  entityKey: entityKeySchema,
  revision: thesisRevisionSchema.nullable(),
});

export type PersonalizationThesis = z.infer<typeof personalizationThesisSchema>;

export const personalizationThesisWriteInputSchema = z
  .object({
    thesisText: boundedText(20_000),
    evidenceRefs: z.array(boundedText(512)).max(100),
    counterEvidence: z.array(boundedText(2_000)).max(100),
    invalidationConditions: z.array(boundedText(2_000)).min(1).max(100),
  })
  .strict();

export type PersonalizationThesisWriteInput = z.infer<typeof personalizationThesisWriteInputSchema>;

const offlineGateSchema = z.object({
  pitWalkForwardPassed: z.boolean(),
  costsIncluded: z.boolean(),
  holdBaselineOutperformed: z.boolean(),
  netUtility: finiteSchema,
  downside: finiteSchema.nonnegative(),
});

const shadowGateSchema = z.object({
  sampleCount: z.number().int().nonnegative().max(10_000_000),
  disagreementRate: probabilitySchema,
  calibrationError: probabilitySchema,
  coverage: probabilitySchema,
  abstentionRate: probabilitySchema,
  privateIsolationPassed: z.boolean(),
  reproducibilityPassed: z.boolean(),
});

const limitedGateSchema = z.object({
  actionWeightCap: probabilitySchema,
  highRiskBlocked: z.boolean(),
  lowLiquidityBlocked: z.boolean(),
  confirmationRequired: z.boolean(),
  orderExecutable: z.literal(false),
});

export const personalizationEvaluationGateSchema = z
  .object({
    schemaVersion: z.literal('p4.v1'),
    evaluatedAt: dateTimeSchema,
    stage: z.enum(['offline', 'shadow', 'limited']),
    offline: offlineGateSchema,
    shadow: shadowGateSchema,
    limited: limitedGateSchema,
    promoted: z.boolean(),
    blockers: z.array(boundedText(320)).max(100),
  })
  .superRefine((gate, context) => {
    const offlinePassed =
      gate.offline.pitWalkForwardPassed &&
      gate.offline.costsIncluded &&
      gate.offline.holdBaselineOutperformed;
    const shadowPassed =
      gate.shadow.sampleCount > 0 &&
      gate.shadow.privateIsolationPassed &&
      gate.shadow.reproducibilityPassed;
    const limitedPassed =
      gate.limited.actionWeightCap > 0 &&
      gate.limited.highRiskBlocked &&
      gate.limited.lowLiquidityBlocked &&
      gate.limited.confirmationRequired;
    const stagePassed =
      gate.stage === 'offline'
        ? offlinePassed
        : gate.stage === 'shadow'
          ? offlinePassed && shadowPassed
          : offlinePassed && shadowPassed && limitedPassed;
    if (gate.promoted !== (stagePassed && gate.blockers.length === 0)) {
      context.addIssue({ code: 'custom', message: 'promotion must match every stage gate' });
    }
  });

export type PersonalizationEvaluationGate = z.infer<typeof personalizationEvaluationGateSchema>;
