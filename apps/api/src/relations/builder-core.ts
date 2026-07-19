import { createHash } from 'node:crypto';

// B6 — shared candidate draft shapes for all relation builders.
// A builder consumes PIT-gated observations already bound to exact immutable
// ingestion.source_revision rows and emits candidate drafts. It NEVER writes
// to the ledger itself; persistence goes through the accepted-relation gate
// (guard trigger + relation-ledger store) in a later execution unit.

import { evaluateRelationCandidate, type RelationCandidateDecision } from './relation-policy.ts';

export type RelationKind = 'structural' | 'statistical' | 'hypothesis';

export type RelationEvidenceDraft = {
  sourceRevisionId: number;
  relationPayloadHash: string;
  evidenceText: string;
  evidenceHash: string;
  validFrom: string;
};

export type RelationCandidateDraft = {
  predicate: string;
  subjectEntityId: number;
  objectEntityId: number;
  relationKind: RelationKind;
  validFrom: string;
  payloadHash: string;
  evidence: RelationEvidenceDraft[];
  policyDecision: RelationCandidateDecision;
  /** Revision status the persister must use — accepted only when policy passed. */
  targetRevisionStatus: 'accepted' | 'quarantined_unverified';
  /** Statistical builders bind the exact model configuration used. */
  modelConfig?: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
};

export type SuperhubExclusion = {
  reason: 'superhub_cap_exceeded';
  predicate: string;
  hubEntityId: number;
  memberCount: number;
  suppressedPairCount: number;
};

export type BuilderRunOptions = {
  /** Builder run cutoff — only source revisions available at/before this instant participate. */
  asOf: string;
};

export type BuilderResult = {
  candidates: RelationCandidateDraft[];
  exclusions: SuperhubExclusion[];
};

const compareUtf8 = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));

function assertWellFormedUnicode(value: string, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error(`${path} must not contain an unpaired surrogate`);
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error(`${path} must not contain an unpaired surrogate`);
    }
  }
}

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export function parseAsOf(options: BuilderRunOptions): number {
  const asOfMs = new Date(options.asOf).getTime();
  if (Number.isNaN(asOfMs)) throw new Error('asOf must be a valid timestamp');
  return asOfMs;
}

export function assertPositiveInt(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

export function assertValidTimestamp(value: string, label: string): void {
  if (Number.isNaN(new Date(value).getTime())) {
    throw new Error(`${label} must be a valid timestamp`);
  }
}

function canonicalJsonValue(
  value: unknown,
  path: string,
  ancestors = new WeakSet<object>(),
): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    assertWellFormedUnicode(value, path);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} must contain only finite numbers`);
    return value;
  }
  if (Array.isArray(value)) {
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error(`${path} must not contain symbol keys`);
    }
    for (const key of Object.getOwnPropertyNames(value)) {
      if (key === 'length') continue;
      if (key === 'toJSON') {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (descriptor.enumerable || !('value' in descriptor) || descriptor.value !== undefined) {
          throw new Error(`${path}.toJSON must be a non-enumerable undefined data property`);
        }
        continue;
      }
      if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
        throw new Error(`${path} must not contain non-index array keys`);
      }
    }
    if (ancestors.has(value)) throw new Error(`${path} must not contain cyclic references`);
    ancestors.add(value);
    try {
      const canonical = Array.from({ length: value.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor) throw new Error(`${path} must not contain sparse array holes`);
        if (!('value' in descriptor)) throw new Error(`${path}[${index}] must not be an accessor`);
        return canonicalJsonValue(descriptor.value, `${path}[${index}]`, ancestors);
      });
      Object.defineProperty(canonical, 'toJSON', { value: undefined, enumerable: false });
      return Object.freeze(canonical);
    } finally {
      ancestors.delete(value);
    }
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path} must contain only plain JSON objects`);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error(`${path} must not contain symbol keys`);
    }
    if (Object.getOwnPropertyNames(value).length !== Object.keys(value).length) {
      throw new Error(`${path} must not contain non-enumerable keys`);
    }
    if (ancestors.has(value)) throw new Error(`${path} must not contain cyclic references`);
    ancestors.add(value);
    try {
      const canonical = Object.create(null) as Record<string, unknown>;
      const keys = Object.keys(value);
      for (const key of keys) assertWellFormedUnicode(key, `${path} key`);
      for (const key of keys.sort(compareUtf8)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (!('value' in descriptor)) throw new Error(`${path}.${key} must not be an accessor`);
        if (descriptor.value === undefined) throw new Error(`${path}.${key} must not be undefined`);
        canonical[key] = canonicalJsonValue(descriptor.value, `${path}.${key}`, ancestors);
      }
      return Object.freeze(canonical);
    } finally {
      ancestors.delete(value);
    }
  }
  throw new Error(`${path} must contain only JSON values`);
}

export function canonicalJsonClone<T>(value: T, path: string): T {
  return canonicalJsonValue(value, path) as T;
}

export function snapshotOwnDataRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${path} must not use an inherited prototype`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${path} must not contain symbol keys`);
  }
  if (Object.getOwnPropertyNames(value).length !== Object.keys(value).length) {
    throw new Error(`${path} must not contain non-enumerable keys`);
  }
  const snapshot = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    assertWellFormedUnicode(key, `${path} key`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in descriptor)) throw new Error(`${path}.${key} must not be an accessor`);
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

export function snapshotOwnDataArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${path} must not contain symbol keys`);
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === 'length') continue;
    if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
      throw new Error(`${path} must not contain non-index array keys`);
    }
  }
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor) throw new Error(`${path} must not contain sparse array holes`);
    if (!('value' in descriptor)) throw new Error(`${path}[${index}] must not be an accessor`);
    return descriptor.value;
  });
}

export function relationPayloadHash(payload: Record<string, unknown>): string {
  return sha256(JSON.stringify(canonicalJsonValue(payload, 'relation payload')));
}

export function sourceRevisionEvidence(input: {
  sourceRevisionId: number;
  payloadHash: string;
  evidenceText: string;
  validFrom: string;
}): RelationEvidenceDraft {
  return {
    sourceRevisionId: input.sourceRevisionId,
    relationPayloadHash: input.payloadHash,
    evidenceText: input.evidenceText,
    evidenceHash: sha256(
      JSON.stringify({
        kind: 'source_revision',
        sourceRevisionId: input.sourceRevisionId,
        payloadHash: input.payloadHash,
        evidenceText: input.evidenceText,
      }),
    ),
    validFrom: input.validFrom,
  };
}

export function decideCandidate(input: {
  predicate: string;
  evidence: readonly RelationEvidenceDraft[];
  hasModelConfigEvidence: boolean;
  subjectDegree: number;
  objectDegree: number;
}): {
  policyDecision: RelationCandidateDecision;
  targetRevisionStatus: 'accepted' | 'quarantined_unverified';
} {
  const policyDecision = evaluateRelationCandidate({
    predicate: input.predicate,
    distinctSourceRevisionIds: input.evidence.map((row) => row.sourceRevisionId),
    hasModelConfigEvidence: input.hasModelConfigEvidence,
    subjectDegree: input.subjectDegree,
    objectDegree: input.objectDegree,
  });
  return {
    policyDecision,
    // Only a clean policy pass may target the accepted status; everything else
    // stays quarantined so the DB guard trigger has a consistent contract.
    targetRevisionStatus:
      policyDecision.decision === 'accepted' ? 'accepted' : 'quarantined_unverified',
  };
}

function canonicalText(value: unknown, path: string): string {
  return JSON.stringify(canonicalJsonValue(value, path));
}

function normalizeCandidate(candidate: RelationCandidateDraft): RelationCandidateDraft {
  const values = snapshotOwnDataRecord(candidate, 'candidate');
  const requiredString = (value: unknown, label: string): string => {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is required`);
    assertWellFormedUnicode(value, label);
    return value;
  };
  const positiveId = (value: unknown, label: string): number => {
    if (typeof value !== 'number') throw new Error(`${label} must be a positive integer`);
    assertPositiveInt(value, label);
    return value;
  };
  const evidence = snapshotOwnDataArray(values.evidence, 'candidate.evidence')
    .map((rawEvidence, index): RelationEvidenceDraft => {
      const row = snapshotOwnDataRecord(rawEvidence, `candidate.evidence[${index}]`);
      const validFrom = requiredString(row.validFrom, `candidate.evidence[${index}].validFrom`);
      assertValidTimestamp(validFrom, `candidate.evidence[${index}].validFrom`);
      return Object.freeze({
        sourceRevisionId: positiveId(
          row.sourceRevisionId,
          `candidate.evidence[${index}].sourceRevisionId`,
        ),
        relationPayloadHash: requiredString(
          row.relationPayloadHash,
          `candidate.evidence[${index}].relationPayloadHash`,
        ),
        evidenceText: requiredString(row.evidenceText, `candidate.evidence[${index}].evidenceText`),
        evidenceHash: requiredString(row.evidenceHash, `candidate.evidence[${index}].evidenceHash`),
        validFrom,
      });
    })
    .sort((left, right) =>
      compareUtf8(
        canonicalText(left, 'candidate.evidence'),
        canonicalText(right, 'candidate.evidence'),
      ),
    );
  const predicate = requiredString(values.predicate, 'candidate.predicate');
  const validFrom = requiredString(values.validFrom, 'candidate.validFrom');
  assertValidTimestamp(validFrom, 'candidate.validFrom');
  if (
    values.relationKind !== 'structural' &&
    values.relationKind !== 'statistical' &&
    values.relationKind !== 'hypothesis'
  ) {
    throw new Error('candidate.relationKind is invalid');
  }
  if (
    values.targetRevisionStatus !== 'accepted' &&
    values.targetRevisionStatus !== 'quarantined_unverified'
  ) {
    throw new Error('candidate.targetRevisionStatus is invalid');
  }
  const policyDecision = canonicalJsonClone(
    values.policyDecision,
    'candidate.policyDecision',
  ) as RelationCandidateDecision;
  const metadata = canonicalJsonClone(values.metadata, 'candidate.metadata') as Record<
    string,
    unknown
  >;
  const modelPresent = Object.hasOwn(values, 'modelConfig');
  if (modelPresent && values.modelConfig === undefined) {
    throw new Error('candidate.modelConfig must not be undefined');
  }
  const normalized: RelationCandidateDraft = Object.create(null) as RelationCandidateDraft;
  Object.assign(normalized, {
    predicate,
    subjectEntityId: positiveId(values.subjectEntityId, 'candidate.subjectEntityId'),
    objectEntityId: positiveId(values.objectEntityId, 'candidate.objectEntityId'),
    relationKind: values.relationKind,
    validFrom,
    payloadHash: requiredString(values.payloadHash, 'candidate.payloadHash'),
    evidence: Object.freeze(evidence),
    policyDecision,
    targetRevisionStatus: values.targetRevisionStatus,
    metadata,
  });
  if (modelPresent) {
    normalized.modelConfig =
      values.modelConfig === null
        ? null
        : (canonicalJsonClone(values.modelConfig, 'candidate.modelConfig') as Record<
            string,
            unknown
          >);
  }
  return Object.freeze(normalized);
}

function candidateEvidenceKey(candidate: RelationCandidateDraft): string {
  return canonicalText(candidate.evidence, 'candidate.evidence');
}

function candidateModelConfigKey(candidate: RelationCandidateDraft): string {
  const present = Object.hasOwn(candidate, 'modelConfig');
  const value = present ? candidate.modelConfig : null;
  return `${present ? '1' : '0'}:${canonicalText(value, 'candidate.modelConfig')}`;
}

/** Stable total ordering across every persisted candidate field. */
export function sortCandidates(candidates: RelationCandidateDraft[]): RelationCandidateDraft[] {
  return candidates
    .map(normalizeCandidate)
    .sort(
      (a, b) =>
        compareUtf8(a.predicate, b.predicate) ||
        a.subjectEntityId - b.subjectEntityId ||
        a.objectEntityId - b.objectEntityId ||
        compareUtf8(a.validFrom, b.validFrom) ||
        compareUtf8(a.payloadHash, b.payloadHash) ||
        compareUtf8(a.targetRevisionStatus, b.targetRevisionStatus) ||
        compareUtf8(candidateEvidenceKey(a), candidateEvidenceKey(b)) ||
        compareUtf8(a.relationKind, b.relationKind) ||
        compareUtf8(
          canonicalText(a.policyDecision, 'candidate.policyDecision'),
          canonicalText(b.policyDecision, 'candidate.policyDecision'),
        ) ||
        compareUtf8(candidateModelConfigKey(a), candidateModelConfigKey(b)) ||
        compareUtf8(
          canonicalText(a.metadata, 'candidate.metadata'),
          canonicalText(b.metadata, 'candidate.metadata'),
        ),
    );
}
