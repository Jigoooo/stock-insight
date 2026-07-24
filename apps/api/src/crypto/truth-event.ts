export type CryptoTruthEventType =
  | 'transaction_anomaly'
  | 'contract_upgrade'
  | 'audit_publication'
  | 'exploit'
  | 'depeg'
  | 'peg_recovery'
  | 'protocol_pause'
  | 'validator_incident'
  | 'bridge_incident'
  | 'oracle_incident'
  | 'governance_execution'
  | 'chain_halt'
  | 'chain_restart';

export type CryptoEventLifecycleState =
  | 'detected'
  | 'reported'
  | 'confirmed'
  | 'effective'
  | 'resolved'
  | 'retracted';

export type CryptoFinalityState = 'unfinalized' | 'safe' | 'finalized' | 'not_applicable';

export type CryptoEventParticipantRole =
  | 'actor'
  | 'target'
  | 'affected'
  | 'dependency'
  | 'issuer'
  | 'auditor'
  | 'attacker_candidate'
  | 'reserve_asset'
  | 'venue';

export type CryptoTruthEventResult =
  | Readonly<{
      status: 'ok';
      eventKey: string;
      chainEntityKey: string;
      eventType: CryptoTruthEventType;
      lifecycleState: CryptoEventLifecycleState;
      primaryReference: Readonly<{
        kind: 'transaction' | 'source_digest';
        value: string;
      }>;
      occurredAt: string;
      availableAt: string;
      knownAt: string;
      finalityState: CryptoFinalityState;
      participants: readonly Readonly<{
        entityKey: string;
        role: CryptoEventParticipantRole;
      }>[];
      readOnly: true;
      acceptedRelationAllowed: false;
      orderExecutable: false;
    }>
  | Readonly<{
      status: 'abstained';
      reason: 'INVALID_CRYPTO_TRUTH_EVENT';
      readOnly: true;
      acceptedRelationAllowed: false;
      orderExecutable: false;
    }>;

const abstained: CryptoTruthEventResult = {
  status: 'abstained',
  reason: 'INVALID_CRYPTO_TRUTH_EVENT',
  readOnly: true,
  acceptedRelationAllowed: false,
  orderExecutable: false,
};

const eventTypes = new Set<CryptoTruthEventType>([
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
]);
const lifecycleStates = new Set([
  'detected',
  'reported',
  'confirmed',
  'effective',
  'resolved',
  'retracted',
]);
const participantRoles = new Set([
  'actor',
  'target',
  'affected',
  'dependency',
  'issuer',
  'auditor',
  'attacker_candidate',
  'reserve_asset',
  'venue',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseUtcTimestamp(value: unknown): number {
  if (typeof value !== 'string') return Number.NaN;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  try {
    return new Date(parsed).toISOString() === value ? parsed : Number.NaN;
  } catch {
    return Number.NaN;
  }
}

export function compileCryptoTruthEvent(input: unknown): CryptoTruthEventResult {
  try {
    const record = asRecord(input);
    const reference = asRecord(record?.primaryReference);
    const occurredAt = parseUtcTimestamp(record?.occurredAt);
    const availableAt = parseUtcTimestamp(record?.availableAt);
    const knownAt = parseUtcTimestamp(record?.knownAt);
    if (
      record === null ||
      typeof record.chainEntityKey !== 'string' ||
      !/^crypto:(?:blockchain|l2):[a-z0-9-]{3,32}:[A-Za-z0-9-]{1,32}$/.test(
        record.chainEntityKey,
      ) ||
      typeof record.eventType !== 'string' ||
      !eventTypes.has(record.eventType as CryptoTruthEventType) ||
      typeof record.lifecycleState !== 'string' ||
      !lifecycleStates.has(record.lifecycleState) ||
      reference === null ||
      !Number.isFinite(occurredAt) ||
      !Number.isFinite(availableAt) ||
      !Number.isFinite(knownAt) ||
      availableAt < occurredAt ||
      knownAt < availableAt ||
      !Array.isArray(record.participants) ||
      record.participants.length < 1 ||
      record.participants.length > 100
    ) {
      return abstained;
    }

    let normalizedReference: { kind: 'transaction' | 'source_digest'; value: string };
    if (reference.kind === 'transaction') {
      if (
        typeof reference.value !== 'string' ||
        !/^0x[0-9a-fA-F]{64}$/.test(reference.value) ||
        !['unfinalized', 'safe', 'finalized'].includes(record.finalityState as string)
      ) {
        return abstained;
      }
      normalizedReference = { kind: 'transaction', value: reference.value.toLowerCase() };
    } else if (reference.kind === 'source_digest') {
      if (
        typeof reference.value !== 'string' ||
        !/^[a-f0-9]{64}$/.test(reference.value) ||
        record.finalityState !== 'not_applicable'
      ) {
        return abstained;
      }
      normalizedReference = { kind: 'source_digest', value: reference.value };
    } else {
      return abstained;
    }

    const participantKeys = new Set<string>();
    const participants: Array<{
      entityKey: string;
      role: CryptoEventParticipantRole;
    }> = [];
    for (const value of record.participants) {
      const participant = asRecord(value);
      if (
        participant === null ||
        typeof participant.entityKey !== 'string' ||
        !participant.entityKey.startsWith('crypto:') ||
        typeof participant.role !== 'string' ||
        !participantRoles.has(participant.role)
      ) {
        return abstained;
      }
      const key = `${participant.role}:${participant.entityKey}`;
      if (participantKeys.has(key)) return abstained;
      participantKeys.add(key);
      participants.push({
        entityKey: participant.entityKey,
        role: participant.role as (typeof participants)[number]['role'],
      });
    }
    participants.sort(
      (left, right) =>
        left.role.localeCompare(right.role) || left.entityKey.localeCompare(right.entityKey),
    );
    const referencePrefix = normalizedReference.kind === 'transaction' ? 'tx' : 'source';
    return {
      status: 'ok',
      eventKey: `crypto:event:${record.eventType}:${record.chainEntityKey}:${referencePrefix}:${normalizedReference.value}`,
      chainEntityKey: record.chainEntityKey,
      eventType: record.eventType as CryptoTruthEventType,
      lifecycleState: record.lifecycleState as CryptoEventLifecycleState,
      primaryReference: normalizedReference,
      occurredAt: record.occurredAt as string,
      availableAt: record.availableAt as string,
      knownAt: record.knownAt as string,
      finalityState: record.finalityState as CryptoFinalityState,
      participants,
      readOnly: true,
      acceptedRelationAllowed: false,
      orderExecutable: false,
    };
  } catch {
    return abstained;
  }
}
