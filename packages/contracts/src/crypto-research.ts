import { z } from 'zod';

const dateTimeSchema = z.iso.datetime({ offset: true });
const decimalSchema = z.string().regex(/^\d+(?:\.\d+)?$/);
const caip2Pattern = /^[a-z0-9-]{3,32}:[A-Za-z0-9-]{1,32}$/;
const accountPattern = /^[A-Za-z0-9._~%+-]{3,128}$/;
const assetPattern = /^[a-z0-9-]{3,32}:[A-Za-z0-9._~%+-]{1,128}$/;
const chainKinds = new Set(['blockchain', 'l2']);
const onchainKinds = new Set(['smart_contract', 'bridge', 'oracle', 'validator', 'wallet_cluster']);
const offchainKinds = new Set(['protocol', 'exchange', 'custodian']);

export type ParsedCanonicalCryptoKey = Readonly<{
  kind: string;
  chainId: string | null;
}>;

function parseCanonicalChainId(
  value: string,
): Readonly<{ chainId: string; namespace: string }> | null {
  if (!caip2Pattern.test(value)) return null;
  const [namespace, reference] = value.split(':');
  if (namespace === undefined || reference === undefined) return null;
  if (namespace === 'eip155' && !/^\d+$/.test(reference)) return null;
  return { chainId: value, namespace };
}

export function parseCanonicalCryptoKey(value: string): ParsedCanonicalCryptoKey | null {
  if (!value.startsWith('crypto:')) return null;
  const match = value.match(/^crypto:([a-z_]+):(.+)$/);
  if (!match) return null;
  const [, kind, locator] = match;
  if (kind === undefined || locator === undefined) return null;
  if (chainKinds.has(kind)) {
    const chain = parseCanonicalChainId(locator);
    return chain === null ? null : { kind, chainId: chain.chainId };
  }
  if ((kind === 'token' || kind === 'stablecoin') && locator.includes('/')) {
    const separator = locator.indexOf('/');
    if (separator !== locator.lastIndexOf('/')) return null;
    const chain = parseCanonicalChainId(locator.slice(0, separator));
    const asset = locator.slice(separator + 1);
    const assetMatch = asset.match(/^([a-z0-9-]{3,32}):([A-Za-z0-9._~%+-]{1,128})$/);
    if (chain === null || assetMatch === null || !assetPattern.test(asset)) return null;
    const [, namespace, reference] = assetMatch;
    if (namespace === undefined || reference === undefined) return null;
    if (namespace === 'slip44' && !/^\d+$/.test(reference)) return null;
    if (
      namespace === 'erc20' &&
      (chain.namespace !== 'eip155' || !/^0x[0-9a-f]{40}$/.test(reference))
    ) {
      return null;
    }
    return { kind, chainId: chain.chainId };
  }
  if (onchainKinds.has(kind)) {
    const matchLocator = locator.match(/^([a-z0-9-]{3,32}:[A-Za-z0-9-]{1,32}):(.+)$/);
    if (!matchLocator) return null;
    const chain = parseCanonicalChainId(matchLocator[1] ?? '');
    const account = matchLocator[2];
    if (chain === null || account === undefined || !accountPattern.test(account)) return null;
    if (chain.namespace === 'eip155' && !/^0x[0-9a-f]{40}$/.test(account)) return null;
    return { kind, chainId: chain.chainId };
  }
  return offchainKinds.has(kind) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(locator)
    ? { kind, chainId: null }
    : null;
}

export const cryptoEntityKeySchema = z
  .string()
  .min(8)
  .max(512)
  .refine((value) => parseCanonicalCryptoKey(value) !== null, 'invalid canonical crypto key');
const coreEntityKeySchema = z
  .string()
  .min(4)
  .max(320)
  .regex(/^(?:COMPANY|STOCK|ETF|FUND|LEGAL_ENTITY):[A-Z0-9._-]+:[A-Z0-9._:-]+$/);
const coreTypePrefix = {
  Company: 'COMPANY',
  Stock: 'STOCK',
  ETF: 'ETF',
  Fund: 'FUND',
  LegalEntity: 'LEGAL_ENTITY',
} as const;

export const cryptoResearchQuerySchema = z
  .object({
    knownAt: dateTimeSchema.optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const cryptoResearchEntitySchema = z
  .object({
    entityKey: cryptoEntityKeySchema,
    entityKind: z.enum([
      'blockchain',
      'l2',
      'protocol',
      'smart_contract',
      'token',
      'stablecoin',
      'bridge',
      'oracle',
      'validator',
      'exchange',
      'custodian',
      'wallet_cluster',
    ]),
    displayName: z.string().min(1).max(240),
    symbol: z.string().min(1).max(64).nullable(),
    chainId: z.string().min(3).max(96).nullable(),
    sourceRevisionId: z.number().int().positive(),
    knownAt: dateTimeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const parsedKey = parseCanonicalCryptoKey(value.entityKey);
    if (parsedKey?.kind !== value.entityKind) {
      context.addIssue({
        code: 'custom',
        path: ['entityKey'],
        message: 'crypto entity kind and key must match',
      });
    }
    if (parsedKey !== null && parsedKey.chainId !== value.chainId) {
      context.addIssue({
        code: 'custom',
        path: ['chainId'],
        message: 'crypto entity chain and key must match',
      });
    }
  });

export const cryptoResearchEventSchema = z
  .object({
    eventKey: z.string().min(1).max(768).startsWith('crypto:event:'),
    eventType: z.enum([
      'transaction_anomaly',
      'contract_upgrade',
      'audit_publication',
      'exploit',
      'depeg',
      'peg_recovery',
      'protocol_pause',
      'validator_incident',
      'bridge_incident',
      'oracle_incident',
      'governance_execution',
      'chain_halt',
      'chain_restart',
    ]),
    lifecycleState: z.enum([
      'detected',
      'reported',
      'confirmed',
      'effective',
      'resolved',
      'retracted',
    ]),
    summary: z.string().min(1).max(2_000),
    finalityState: z.enum(['unfinalized', 'safe', 'finalized', 'not_applicable']),
    sourceRevisionId: z.number().int().positive(),
    knownAt: dateTimeSchema,
  })
  .strict();

export const cryptoCompanyLinkSchema = z
  .object({
    relationKey: z.string().min(1).max(1_024),
    cryptoEntityKey: cryptoEntityKeySchema,
    cryptoName: z.string().min(1).max(240),
    coreEntityKey: coreEntityKeySchema,
    coreName: z.string().min(1).max(240),
    coreEntityType: z.enum(['Company', 'Stock', 'ETF', 'Fund', 'LegalEntity']),
    relationKind: z.enum([
      'issued_by_company',
      'treasury_held_by_company',
      'reserve_managed_by_company',
      'operated_by_company',
      'mined_by_company',
      'custodied_by_company',
      'revenue_exposure_company',
      'cost_exposure_company',
      'payment_distribution_company',
      'etf_underlying_exposure',
    ]),
    relationState: z.enum(['proposed', 'verified']),
    economicMagnitude: decimalSchema.nullable(),
    economicMagnitudeUnit: z.string().min(1).max(64).nullable(),
    epistemicConfidence: z.number().min(0).max(1).nullable(),
    sourceRevisionId: z.number().int().positive(),
    knownAt: dateTimeSchema,
  })
  .strict()
  .refine(
    (value) =>
      (value.economicMagnitude === null && value.economicMagnitudeUnit === null) ||
      (value.economicMagnitude !== null && value.economicMagnitudeUnit !== null),
    { message: 'economic magnitude and unit must be supplied together' },
  )
  .superRefine((value, context) => {
    const explicitPrefix = value.coreEntityKey.split(':', 1)[0];
    const expectedPrefix = coreTypePrefix[value.coreEntityType];
    if (explicitPrefix !== expectedPrefix) {
      context.addIssue({
        code: 'custom',
        path: ['coreEntityKey'],
        message: 'core entity type and key prefix must match',
      });
    }
  });

export const cryptoRiskExposureSchema = z
  .object({
    exposureKey: z.string().min(1).max(1_024),
    cryptoEntityKey: cryptoEntityKeySchema,
    cryptoName: z.string().min(1).max(240),
    shockType: z.enum([
      'bridge_failure',
      'oracle_failure',
      'custody_loss',
      'exchange_insolvency',
      'stablecoin_depeg',
      'liquidation_cascade',
      'smart_contract_exploit',
      'validator_failure',
      'liquidity_withdrawal',
      'regulatory_restriction',
    ]),
    channelKey: z.enum([
      'contract_dependency',
      'reserve_backing',
      'bridge_route',
      'oracle_feed',
      'custody_chain',
      'exchange_venue',
      'liquidity_pool',
      'collateral_chain',
      'treasury_exposure',
      'revenue_exposure',
    ]),
    directionSign: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
    economicMagnitude: decimalSchema.nullable(),
    economicMagnitudeUnit: z.string().min(1).max(64).nullable(),
    epistemicConfidence: z.number().min(0).max(1).nullable(),
    lifecycleState: z.enum(['building', 'sealed']),
    sourceRevisionId: z.number().int().positive(),
    knownAt: dateTimeSchema,
  })
  .strict()
  .refine(
    (value) =>
      (value.economicMagnitude === null && value.economicMagnitudeUnit === null) ||
      (value.economicMagnitude !== null && value.economicMagnitudeUnit !== null),
    { message: 'economic magnitude and unit must be supplied together' },
  );

export const cryptoResearchWorkspaceSchema = z
  .object({
    schemaVersion: z.literal('p6.v1'),
    availability: z.enum(['available', 'empty']),
    knownAt: dateTimeSchema,
    readOnly: z.literal(true),
    orderExecutable: z.literal(false),
    stats: z
      .object({
        entities: z.number().int().nonnegative(),
        events: z.number().int().nonnegative(),
        companyLinks: z.number().int().nonnegative(),
        riskExposures: z.number().int().nonnegative(),
      })
      .strict(),
    entities: z.array(cryptoResearchEntitySchema).max(100),
    events: z.array(cryptoResearchEventSchema).max(100),
    companyLinks: z.array(cryptoCompanyLinkSchema).max(100),
    riskExposures: z.array(cryptoRiskExposureSchema).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const keyedLists = [
      ['entities', value.entities.map((item) => item.entityKey)],
      ['events', value.events.map((item) => item.eventKey)],
      ['companyLinks', value.companyLinks.map((item) => item.relationKey)],
      ['riskExposures', value.riskExposures.map((item) => item.exposureKey)],
    ] as const;
    for (const [path, keys] of keyedLists) {
      if (new Set(keys).size !== keys.length) {
        context.addIssue({ code: 'custom', path: [path], message: `${path} keys must be unique` });
      }
    }
    const actualStats = {
      entities: value.entities.length,
      events: value.events.length,
      companyLinks: value.companyLinks.length,
      riskExposures: value.riskExposures.length,
    };
    for (const key of Object.keys(actualStats) as Array<keyof typeof actualStats>) {
      if (value.stats[key] !== actualStats[key]) {
        context.addIssue({
          code: 'custom',
          path: ['stats', key],
          message: 'workspace stats must equal returned item counts',
        });
      }
    }
    const empty = Object.values(actualStats).every((count) => count === 0);
    if ((value.availability === 'empty') !== empty) {
      context.addIssue({
        code: 'custom',
        path: ['availability'],
        message: 'availability must match returned item counts',
      });
    }
  });

export type CryptoResearchWorkspace = z.infer<typeof cryptoResearchWorkspaceSchema>;
export type CryptoResearchEntity = z.infer<typeof cryptoResearchEntitySchema>;
export type CryptoResearchEvent = z.infer<typeof cryptoResearchEventSchema>;
export type CryptoCompanyLink = z.infer<typeof cryptoCompanyLinkSchema>;
export type CryptoRiskExposure = z.infer<typeof cryptoRiskExposureSchema>;
export type CryptoResearchQuery = z.infer<typeof cryptoResearchQuerySchema>;
