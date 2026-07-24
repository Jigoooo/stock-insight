import { cryptoResearchEntitySchema } from '@stock-insight/contracts/crypto-research';

export type CryptoEntityKind =
  | 'blockchain'
  | 'l2'
  | 'protocol'
  | 'smart_contract'
  | 'token'
  | 'stablecoin'
  | 'bridge'
  | 'oracle'
  | 'validator'
  | 'exchange'
  | 'custodian'
  | 'wallet_cluster';

export type CryptoIdentityKeyResult =
  | Readonly<{
      status: 'ok';
      entityKind: CryptoEntityKind;
      entityKey: string;
      chainId: string | null;
      accountAddress: string | null;
      readOnly: true;
      orderExecutable: false;
    }>
  | Readonly<{
      status: 'abstained';
      reason: 'INVALID_CRYPTO_IDENTITY';
      readOnly: true;
      orderExecutable: false;
    }>;

const abstained: CryptoIdentityKeyResult = {
  status: 'abstained',
  reason: 'INVALID_CRYPTO_IDENTITY',
  readOnly: true,
  orderExecutable: false,
};

const chainKinds = new Set<CryptoEntityKind>(['blockchain', 'l2']);
const assetKinds = new Set<CryptoEntityKind>(['token', 'stablecoin']);
const onchainKinds = new Set<CryptoEntityKind>([
  'smart_contract',
  'bridge',
  'oracle',
  'validator',
  'wallet_cluster',
]);
const offchainKinds = new Set<CryptoEntityKind>(['protocol', 'exchange', 'custodian']);
const allKinds = new Set<CryptoEntityKind>([
  ...chainKinds,
  ...assetKinds,
  ...onchainKinds,
  ...offchainKinds,
]);

function compiledIdentity(
  kind: CryptoEntityKind,
  entityKey: string,
  chainId: string | null,
  accountAddress: string | null,
): CryptoIdentityKeyResult {
  const canonical = cryptoResearchEntitySchema.safeParse({
    entityKey,
    entityKind: kind,
    displayName: 'canonical identity validation',
    symbol: null,
    chainId,
    sourceRevisionId: 1,
    knownAt: '1970-01-01T00:00:00.000Z',
  });
  if (!canonical.success) return abstained;
  return {
    status: 'ok',
    entityKind: kind,
    entityKey,
    chainId,
    accountAddress,
    readOnly: true,
    orderExecutable: false,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseChainId(value: unknown): { chainId: string; namespace: string } | null {
  if (typeof value !== 'string' || !/^[a-z0-9-]{3,32}:[A-Za-z0-9-]{1,32}$/.test(value)) {
    return null;
  }
  const [namespace, reference] = value.split(':');
  if (namespace === undefined || reference === undefined) return null;
  if (namespace === 'eip155' && !/^\d+$/.test(reference)) return null;
  return { chainId: `${namespace}:${reference}`, namespace };
}

function normalizeAccount(namespace: string, value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (namespace === 'eip155') {
    return /^0x[0-9a-fA-F]{40}$/.test(value) ? value.toLowerCase() : null;
  }
  return /^[A-Za-z0-9._~%+-]{3,128}$/.test(value) ? value : null;
}

function parseAssetId(value: unknown): { assetId: string; chainId: string } | null {
  if (typeof value !== 'string') return null;
  const separator = value.indexOf('/');
  if (separator <= 0 || separator !== value.lastIndexOf('/')) return null;
  const chain = parseChainId(value.slice(0, separator));
  const asset = value.slice(separator + 1);
  const match = /^([a-z0-9-]{3,32}):([A-Za-z0-9._~%+-]{1,128})$/.exec(asset);
  if (chain === null || match === null) return null;
  const [, namespace, rawReference] = match;
  if (namespace === undefined || rawReference === undefined) return null;
  let reference = rawReference;
  if (namespace === 'slip44') {
    if (!/^\d+$/.test(reference)) return null;
  } else if (namespace === 'erc20') {
    if (chain.namespace !== 'eip155' || !/^0x[0-9a-fA-F]{40}$/.test(reference)) return null;
    reference = reference.toLowerCase();
  }
  return { assetId: `${chain.chainId}/${namespace}:${reference}`, chainId: chain.chainId };
}

export function compileCryptoIdentityKey(input: unknown): CryptoIdentityKeyResult {
  try {
    const record = asRecord(input);
    if (
      record === null ||
      typeof record.kind !== 'string' ||
      !allKinds.has(record.kind as CryptoEntityKind)
    ) {
      return abstained;
    }
    const kind = record.kind as CryptoEntityKind;
    if (chainKinds.has(kind)) {
      const chain = parseChainId(record.chainId);
      if (
        chain === null ||
        record.accountAddress !== undefined ||
        record.slug !== undefined ||
        record.assetId !== undefined
      ) {
        return abstained;
      }
      return compiledIdentity(kind, `crypto:${kind}:${chain.chainId}`, chain.chainId, null);
    }
    if (assetKinds.has(kind)) {
      const asset = parseAssetId(record.assetId);
      if (
        asset === null ||
        record.chainId !== undefined ||
        record.accountAddress !== undefined ||
        record.slug !== undefined
      ) {
        return abstained;
      }
      return compiledIdentity(kind, `crypto:${kind}:${asset.assetId}`, asset.chainId, null);
    }
    if (onchainKinds.has(kind)) {
      const chain = parseChainId(record.chainId);
      if (chain === null || record.slug !== undefined || record.assetId !== undefined)
        return abstained;
      const accountAddress = normalizeAccount(chain.namespace, record.accountAddress);
      if (accountAddress === null) return abstained;
      return compiledIdentity(
        kind,
        `crypto:${kind}:${chain.chainId}:${accountAddress}`,
        chain.chainId,
        accountAddress,
      );
    }
    if (
      !offchainKinds.has(kind) ||
      typeof record.slug !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug) ||
      record.chainId !== undefined ||
      record.accountAddress !== undefined ||
      record.assetId !== undefined
    ) {
      return abstained;
    }
    return compiledIdentity(kind, `crypto:${kind}:${record.slug}`, null, null);
  } catch {
    return abstained;
  }
}
