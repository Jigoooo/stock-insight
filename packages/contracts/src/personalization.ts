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
/**
 * `not_computed` is not a synonym for `missing`. REQ-SRC-001 requires "there is
 * none" and "we have not worked it out" to be different answers, because a user
 * reading "no impact" as a measurement makes a decision on a number we never
 * calculated. It is emitted when the inputs a surface depends on are legitimately
 * empty — see `analytics.impact_exposure_revision`, held empty on purpose because
 * filling it would mean inventing sign, materiality and economic magnitude.
 */
const availabilitySchema = z.enum(['available', 'missing', 'not_computed', 'stale', 'error']);

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
const impactEvaluationDispositionSchema = z.enum([
  'accepted',
  'missing_identity',
  'no_pit_evidence',
  'unsupported_measurement',
  'ambiguous_driver_attribution',
  'no_recent_observation',
]);

const impactScoreComponentKindSchema = z.enum([
  'evidence_confidence',
  'relation_strength',
  'materiality',
  'transmission',
  'direction',
  'lag',
  'market_reflection',
  'model_uncertainty',
]);
const requiredImpactScoreKinds = new Set(impactScoreComponentKindSchema.options);
const ledgerIdSchema = z.string().regex(/^[1-9]\d*$/);
const economicUnitSchema = boundedText(80);

const impactScoreComponentV2Schema = z.object({
  kind: impactScoreComponentKindSchema,
  value: probabilitySchema,
  rationale: boundedText(1_000),
});

const impactEvidenceReferenceV2Schema = z.object({
  numericFactId: ledgerIdSchema,
  sourceRevisionId: ledgerIdSchema,
  sourcePitQualityId: ledgerIdSchema,
  pitQualityClass: z.enum([
    'PIT_A_NATIVE_VINTAGE',
    'PIT_B_VERSIONED_ARTIFACT',
    'PIT_C_OUR_ARCHIVE',
  ]),
  inputRole: z.enum(['current', 'comparison', 'corroboration']),
});

const impactPathStepReferenceV2Schema = z.object({
  impactPathStepId: ledgerIdSchema,
  citationRole: z.enum(['economic_basis', 'corroboration']),
});

const analysisInformationSetReferenceV2Schema = z
  .object({
    informationSetId: boundedText(320),
    validCutoff: dateTimeSchema,
    sourceAvailableCutoff: dateTimeSchema,
    systemKnownCutoff: dateTimeSchema,
    marketObservationCutoff: dateTimeSchema,
    semanticSnapshotId: boundedText(320),
  })
  .superRefine((informationSet, context) => {
    const validCutoff = Date.parse(informationSet.validCutoff);
    for (const [field, value] of [
      ['sourceAvailableCutoff', informationSet.sourceAvailableCutoff],
      ['systemKnownCutoff', informationSet.systemKnownCutoff],
      ['marketObservationCutoff', informationSet.marketObservationCutoff],
    ] as const) {
      if (Date.parse(value) > validCutoff) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'analysis information-set cutoffs cannot exceed validCutoff',
        });
      }
    }
  });

const portfolioImpactExposureV2Schema = z
  .object({
    exposureRevisionId: ledgerIdSchema,
    evaluationRevisionId: ledgerIdSchema,
    entityKey: entityKeySchema,
    portfolioWeight: probabilitySchema,
    direction: z.enum(['positive', 'negative', 'ambiguous']),
    economicMagnitude: z.object({ value: finiteSchema, unit: economicUnitSchema }),
    materiality: probabilitySchema,
    uncertainty: probabilitySchema,
    epistemicConfidence: probabilitySchema,
    scoreComponents: z.array(impactScoreComponentV2Schema).length(8),
    references: z.object({
      securityIssuerIdentityId: ledgerIdSchema,
      sectorPlaybookId: ledgerIdSchema,
      businessDriverId: ledgerIdSchema,
      businessDriverMeasurementRuleId: ledgerIdSchema,
      analysisInformationSet: analysisInformationSetReferenceV2Schema,
      derivationId: ledgerIdSchema,
      eventRevisionId: ledgerIdSchema,
      evidence: z.array(impactEvidenceReferenceV2Schema).min(2).max(50),
      pathSteps: z.array(impactPathStepReferenceV2Schema).max(100),
    }),
  })
  .superRefine((exposure, context) => {
    const scoreKinds = new Set(exposure.scoreComponents.map((component) => component.kind));
    if (
      scoreKinds.size !== requiredImpactScoreKinds.size ||
      [...requiredImpactScoreKinds].some((kind) => !scoreKinds.has(kind))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['scoreComponents'],
        message: 'exposure requires the exact eight score component kinds',
      });
    }
    const evidenceRoles = new Set(
      exposure.references.evidence.map((reference) => reference.inputRole),
    );
    if (!evidenceRoles.has('current') || !evidenceRoles.has('comparison')) {
      context.addIssue({
        code: 'custom',
        path: ['references', 'evidence'],
        message: 'exposure evidence requires current and comparison inputs',
      });
    }
  });

const portfolioImpactCoverageV2Schema = z
  .object({
    entityKey: entityKeySchema,
    portfolioWeight: probabilitySchema.nullable(),
    evaluationCount: z.number().int().positive(),
    acceptedEvaluationCount: z.number().int().nonnegative(),
    reasonCodes: z.array(impactEvaluationDispositionSchema.exclude(['accepted'])).max(5),
    reasonDetails: z.array(boundedText(2_000)).max(100),
  })
  .superRefine((coverage, context) => {
    if (coverage.acceptedEvaluationCount > coverage.evaluationCount) {
      context.addIssue({ code: 'custom', message: 'accepted evaluations cannot exceed total' });
    }
    const rejectedCount = coverage.evaluationCount - coverage.acceptedEvaluationCount;
    if ((rejectedCount === 0) !== (coverage.reasonCodes.length === 0)) {
      context.addIssue({
        code: 'custom',
        path: ['reasonCodes'],
        message: 'reason codes must describe every non-empty rejected evaluation set',
      });
    }
    if ((rejectedCount === 0) !== (coverage.reasonDetails.length === 0)) {
      context.addIssue({
        code: 'custom',
        path: ['reasonDetails'],
        message: 'reason details must describe every non-empty rejected evaluation set',
      });
    }
  });

export const personalizationPortfolioImpactV2Schema = z
  .object({
    schemaVersion: z.literal('p4.v2'),
    availability: z.enum(['available', 'not_computed']),
    portfolioSnapshotId: uuidSchema,
    eventId: boundedText(320).nullable(),
    scenarioId: boundedText(320).nullable(),
    knownAt: dateTimeSchema,
    generatedAt: dateTimeSchema,
    groups: z.array(
      z.object({
        horizon: z.enum(['immediate', 'short', 'medium', 'long']),
        channel: boundedText(80),
        economicMagnitude: z.object({ unit: economicUnitSchema }),
        exposures: z.array(portfolioImpactExposureV2Schema).min(1).max(1_000),
      }),
    ),
    coverage: z.array(portfolioImpactCoverageV2Schema).max(10),
  })
  .strict()
  .superRefine((response, context) => {
    if (response.availability === 'available' && response.coverage.length !== 10) {
      context.addIssue({
        code: 'custom',
        path: ['coverage'],
        message: 'available p4.v2 coverage requires exactly ten securities',
      });
    }
    if (response.availability === 'not_computed') {
      if (response.coverage.length !== 0 || response.groups.length !== 0) {
        context.addIssue({
          code: 'custom',
          message: 'not-computed p4.v2 groups and coverage must be empty',
        });
      }
    }
    const coverageKeys = new Set(response.coverage.map((coverage) => coverage.entityKey));
    if (coverageKeys.size !== response.coverage.length) {
      context.addIssue({ code: 'custom', path: ['coverage'], message: 'coverage must be unique' });
    }
    const groupKeys = new Set<string>();
    const exposureIds = new Set<string>();
    for (const [groupIndex, group] of response.groups.entries()) {
      const groupKey = `${group.horizon}\u0000${group.channel}\u0000${group.economicMagnitude.unit}`;
      if (groupKeys.has(groupKey)) {
        context.addIssue({
          code: 'custom',
          path: ['groups', groupIndex],
          message: 'duplicate group',
        });
      }
      groupKeys.add(groupKey);
      for (const exposure of group.exposures) {
        if (exposure.economicMagnitude.unit !== group.economicMagnitude.unit) {
          context.addIssue({
            code: 'custom',
            path: ['groups', groupIndex, 'exposures'],
            message: 'exposure unit must equal its group unit',
          });
        }
        if (exposureIds.has(exposure.exposureRevisionId)) {
          context.addIssue({
            code: 'custom',
            path: ['groups', groupIndex, 'exposures'],
            message: 'an exposure can appear in only one group',
          });
        }
        exposureIds.add(exposure.exposureRevisionId);
      }
    }
  });

export type PersonalizationPortfolioImpactV2 = z.infer<
  typeof personalizationPortfolioImpactV2Schema
>;

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
