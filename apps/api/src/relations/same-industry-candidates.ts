/**
 * Turns the industry taxonomy into SAME_INDUSTRY candidates.
 *
 * canonical/01 §5 requires Discovery to give every related company a REASON, and
 * competitor/peer is the first one it lists. Measured 2026-08-11 the graph had no
 * accepted evidence for it at all: SAME_INDUSTRY held 418 revisions, every one
 * quarantined, seeded once in July by a path that predates the B6 policy gate and
 * backed by no source revision.
 *
 * The classification now exists — 322 of 356 securities carry a code from DART or SEC,
 * each tracing to an immutable ingestion revision — so the edge can be derived rather
 * than asserted. Two securities under one code, with both classifications naming the
 * revision that reported them.
 *
 * WHAT THIS IS NOT. A shared code is not an economic link. relationSignalTier maps this
 * predicate's hierarchy class to 'structural', so it can serve as Discovery's
 * competitor/peer reason and can never stand as exposure. REQ-PROD-030 is about exactly
 * that distinction.
 */

/**
 * Codes that group companies by something other than what they do.
 *
 * KSIC 64992 지주회사 is the reason this list exists. It is the widest group in the
 * universe at 15 securities, and it holds 신한·KB·하나·BNK·JB·아이엠금융지주 alongside
 * LG, LS, SK, SK스퀘어, 에코프로, HD한국조선해양, OCI홀딩스 and LS에코에너지. A
 * SAME_INDUSTRY edge between a bank group and a shipbuilder would be false, and it would
 * be the single largest source of edges in the graph.
 *
 * The same judgement is already written down in playbook-assignment.ts, which excludes
 * 64992 from the bank playbook for the same reason. Two places state it because they
 * answer different questions — which playbook governs a company, and which companies are
 * peers — and collapsing them would make one silently follow the other.
 */
export const NON_INDUSTRY_CODES: Record<string, string> = {
  '64992':
    'KSIC 64992 지주회사 is a legal form. The same code covers six bank groups and eight industrials, so co-membership says how a company is incorporated and nothing about what it does.',
  '649': 'KSIC 649 기타 금융업 is a residual bucket that names no business.',
  '6199':
    'SIC 6199 finance services is a residual bucket; in this universe it holds crypto platforms and a cannabis-banking company together.',
  '6221':
    'SIC 6221 commodity contracts brokers holds commodity ETFs here, which are not operating companies at all.',
  '7389': 'SIC 7389 business services NEC is a residual bucket by construction.',
  UNCLASSIFIED: 'the explicit absence of a classification, which is not a shared industry.',
};

export type ClassifiedSecurity = {
  entityId: number;
  entityKey: string;
  taxonomySystem: string;
  code: string;
  /** The ingestion revision that reported this classification, when there is one. */
  sourceRevisionId: number | null;
};

export type SameIndustryCandidate = {
  subjectEntityId: number;
  objectEntityId: number;
  taxonomySystem: string;
  code: string;
  /** Distinct source revisions behind the pair — one per side when both are sourced. */
  distinctSourceRevisionIds: number[];
  /** Members of this code minus one; the degree each endpoint would carry. */
  degree: number;
};

export type SameIndustryPlan = {
  candidates: SameIndustryCandidate[];
  /** Codes skipped because they group by legal form or are residual, with the reason. */
  skippedCodes: { code: string; members: number; reason: string }[];
  /** Codes whose group is a single security, so there is no pair to make. */
  singletonCodes: number;
};

/**
 * A code groups companies from one classification system. Two securities under the same
 * digits in DIFFERENT systems are not co-members — KSIC 2612 and SIC 2612 mean unrelated
 * things — so the group key carries the system.
 */
function groupKey(security: ClassifiedSecurity): string {
  return `${security.taxonomySystem}:${security.code}`;
}

export function planSameIndustryCandidates(
  securities: readonly ClassifiedSecurity[],
): SameIndustryPlan {
  const groups = new Map<string, ClassifiedSecurity[]>();
  for (const security of securities) {
    const key = groupKey(security);
    const bucket = groups.get(key);
    if (bucket) bucket.push(security);
    else groups.set(key, [security]);
  }

  const candidates: SameIndustryCandidate[] = [];
  const skippedCodes: { code: string; members: number; reason: string }[] = [];
  let singletonCodes = 0;

  for (const [key, members] of [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const code = members[0]?.code ?? '';
    const reason = NON_INDUSTRY_CODES[code];
    if (reason) {
      // Reported, not silently dropped. A group this large disappearing without a stated
      // reason is exactly the kind of absence this repository keeps making visible.
      skippedCodes.push({ code: key, members: members.length, reason });
      continue;
    }
    if (members.length < 2) {
      singletonCodes += 1;
      continue;
    }

    const ordered = [...members].sort((left, right) => left.entityId - right.entityId);
    const degree = ordered.length - 1;
    for (const subject of ordered) {
      for (const object of ordered) {
        if (subject.entityId === object.entityId) continue;
        candidates.push({
          subjectEntityId: subject.entityId,
          objectEntityId: object.entityId,
          taxonomySystem: subject.taxonomySystem,
          code: subject.code,
          // Both sides, deduplicated: two securities classified by the same revision
          // (possible when one filing covers both) genuinely carry one revision, and
          // the policy's minimum of two will quarantine that pair rather than accept
          // half an edge as whole.
          distinctSourceRevisionIds: [
            ...new Set(
              [subject.sourceRevisionId, object.sourceRevisionId].filter(
                (id): id is number => id !== null,
              ),
            ),
          ],
          degree,
        });
      }
    }
  }

  return { candidates, skippedCodes, singletonCodes };
}
