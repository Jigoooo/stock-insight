/**
 * Decides which companies each sector playbook governs.
 *
 * The live taxonomy cannot answer this on its own, and both playbooks show why in the
 * same way: an industry code is sometimes a business and sometimes a legal form.
 *
 * SEMICONDUCTOR, measured 2026-08-08:
 *
 *   SIC 3674   Broadcom, Micron, TSMC ADR, AMD, Intel, Marvell, NVIDIA, Arm
 *   KSIC 2612  SK Hynix
 *   KSIC 2621  LG Display          — display panels, not semiconductors
 *   KSIC 2622  Samsung Electro-Mechanics — passive components and substrates
 *   KSIC 26299 Hanwha Systems      — defence electronics
 *   KSIC 26429 Intellian           — satellite antennas
 *   KSIC 264   Samsung Electronics — communications equipment, and the largest
 *                                    memory manufacturer in the universe
 *
 * BANK, measured 2026-08-11:
 *
 *   SIC 6021   National Commercial Banks — BAC, C, JPM, WFC
 *   KSIC 64121 국내은행 — 기업은행, 카카오뱅크
 *   KSIC 64992 지주회사 — FIFTEEN companies, of which six are bank groups
 *              (신한·KB·하나·BNK·JB·아이엠) and eight are industrials
 *              (LG, LS, SK, SK스퀘어, 에코프로, HD한국조선해양, OCI홀딩스,
 *              LS에코에너지). The code is a legal form, not an industry.
 *
 * Assigning by code alone would take in a defence contractor and a satellite antenna
 * maker on one side, and a shipbuilder and a battery materials maker on the other. So
 * the codes that are unambiguous carry a 'taxonomy' assignment, and anything else is
 * 'curated' and has to say why in a sentence somebody can disagree with.
 *
 * The near misses are reported rather than silently dropped: a company sitting one node
 * away from an assignment is the case where a future reader most needs to see that
 * somebody looked and decided.
 */

export type TaxonomyMember = {
  /** Issuer resolved through the exact temporal identity; null when none exists yet. */
  issuerEntityId?: number | null;
  securityIssuerIdentityId?: number | null;
  entityId: number;
  /**
   * The stable INTERNAL_KEY, 'KR:055550'. Curations are keyed by this, not by name.
   *
   * core.entity.canonical_name is not reliably a company name: 하나금융지주 reads as
   * '086790', KB금융지주 as '105560', and 신한금융지주 as '신한지주'. A curation keyed by
   * name silently matches nothing for those three, which is exactly how a decision
   * disappears without anybody seeing it fail.
   */
  entityKey: string;
  entityName: string;
  taxonomyNodeId: number;
  taxonomySystem: string;
  code: string;
};

export type PlaybookAssignmentRow = {
  /** Migration 088 requires the subject to be the issuer Company, not the security. */
  issuerEntityId?: number | null;
  securityIssuerIdentityId?: number | null;
  entityId: number;
  entityName: string;
  playbookKey: string;
  assignmentBasis: 'taxonomy' | 'curated';
  taxonomyNodeId: number | null;
  rationale: string;
};

export type NearMiss = {
  entityId: number;
  entityName: string;
  playbookKey: string;
  code: string;
  reason: string;
};

export type PlaybookScope = {
  playbookKey: string;
  /** Codes that mean "this company is in this sector" with no further argument needed. */
  codes: Record<string, string>;
  /**
   * Companies the codes get wrong, keyed by INTERNAL_KEY, each with the reason.
   *
   * The key is the identifier and the name lives in the reason, because the name is a
   * label that drifts and the key is not.
   */
  curated: Record<string, string>;
  /** Codes that sit next to the sector without being in it. Recorded, not reversed quietly. */
  adjacent: Record<string, string>;
};

export const PLAYBOOK_SCOPES: readonly PlaybookScope[] = [
  {
    playbookKey: 'semiconductor',
    codes: {
      '3674': 'SIC 3674 is Semiconductors & Related Devices; the code says it outright',
      '2612': 'KSIC 2612 is memory integrated circuit manufacturing; the code says it outright',
    },
    curated: {
      'KR:005930':
        '삼성전자. Classified under KSIC 264, communications and broadcasting equipment, on the strength of its handset business. It is also the largest memory manufacturer in the world, and every driver in this playbook — wafer capacity, HBM qualification, memory ASP — governs the majority of its operating profit.',
    },
    adjacent: {
      '2621':
        'display panel manufacturing; shares fab economics but not the node, interface or memory cycle this playbook is built on',
      '2622':
        'passive components and substrates; supplies the industry rather than participating in its product cycle',
      '26299': 'defence electronics; the KSIC 26 branch is electronics, not semiconductors',
      '26429': 'satellite communication antennas; same branch, unrelated economics',
    },
  },
  {
    playbookKey: 'bank',
    codes: {
      '6021': 'SIC 6021 is National Commercial Banks; the code says it outright',
      '64121': 'KSIC 64121 is 국내은행; the code says it outright',
    },
    // Every one of these is KSIC 64992 지주회사, a legal form shared with eight
    // industrial groups. The code cannot separate them, so each is named with the
    // reason it is a bank rather than a holding company in general.
    curated: {
      'KR:055550':
        '신한금융지주. KSIC 64992 지주회사 is a legal form. This is a bank holding company whose consolidated balance sheet is 신한은행 — deposits, a lending spread, and a regulatory capital constraint are what it is.',
      'KR:086790':
        '하나금융지주. KSIC 64992 지주회사 is a legal form. Consolidates 하나은행; the group P&L is a lending spread under a capital floor.',
      'KR:105560':
        'KB금융지주. KSIC 64992 지주회사 is a legal form. Consolidates 국민은행; the group P&L is a lending spread under a capital floor.',
      'KR:138930':
        'BNK금융지주. KSIC 64992 지주회사 is a legal form. Consolidates 부산은행 and 경남은행; regional but the same economics.',
      'KR:175330':
        'JB금융지주. KSIC 64992 지주회사 is a legal form. Consolidates 전북은행 and 광주은행; regional but the same economics.',
      'KR:139130':
        '아이엠금융지주. KSIC 64992 지주회사 is a legal form. Consolidates iM뱅크 (formerly 대구은행); regional but the same economics.',
    },
    adjacent: {
      // Same KSIC 64992 code as the bank groups above, and not banks.
      '64992':
        'holding company, a legal form rather than an industry — the same code covers LG, LS, SK, 에코프로 and HD한국조선해양, none of which funds itself with deposits',
      // Financial, and each with economics this playbook does not describe.
      '66121':
        'securities brokerage; fee and trading income with no deposit franchise, so deposit beta and NIM do not apply',
      '6211':
        'SIC 6211 securities brokers and dealers; same reason as KSIC 66121, no deposit franchise',
      '65110': 'life insurance; underwriting and float, not a lending spread',
      '65121': 'non-life insurance; underwriting and float, not a lending spread',
      '65122': 'guarantee insurance; underwriting, not a lending spread',
      '6324':
        'SIC 6324 hospital and medical service plans; a health insurer, whose loss ratio has no lending analogue',
      '6199':
        'SIC 6199 finance services; in this universe it is crypto platforms, which have no deposit-funded balance sheet of this kind',
      '6221':
        'SIC 6221 commodity contracts brokers; in this universe it is commodity ETFs, which are not operating companies at all',
      '6798': 'SIC 6798 REITs; property yield, not a lending spread',
      '649': 'KSIC 649 기타 금융업, a residual bucket that names no business',
      '66199': 'KSIC 66199 other financial support services; payments, not deposit taking',
    },
  },
];

export function assignPlaybooks(members: readonly TaxonomyMember[]): {
  assignments: PlaybookAssignmentRow[];
  nearMisses: NearMiss[];
  unmatchedCurations: { playbookKey: string; entityKey: string }[];
} {
  // Keyed by entity AND playbook: one company may legitimately be governed by two
  // sectors, and collapsing on entity alone would silently drop the second.
  const assignments = new Map<string, PlaybookAssignmentRow>();
  const nearMisses: NearMiss[] = [];
  const unmatchedCurations: { playbookKey: string; entityKey: string }[] = [];

  for (const scope of PLAYBOOK_SCOPES) {
    const curatedSeen = new Set<string>();
    for (const member of members) {
      const key = `${scope.playbookKey}:${member.entityId}`;

      const codeReason = scope.codes[member.code];
      if (codeReason) {
        // A company can hold two qualifying codes; the first is enough and the second
        // would be a duplicate assignment rather than a stronger one.
        if (!assignments.has(key)) {
          assignments.set(key, {
            entityId: member.entityId,
            entityName: member.entityName,
            playbookKey: scope.playbookKey,
            assignmentBasis: 'taxonomy',
            taxonomyNodeId: member.taxonomyNodeId,
            rationale: codeReason,
            issuerEntityId: member.issuerEntityId ?? null,
            securityIssuerIdentityId: member.securityIssuerIdentityId ?? null,
          });
        }
        continue;
      }

      const curatedReason = scope.curated[member.entityKey];
      if (curatedReason) {
        curatedSeen.add(member.entityKey);
        if (!assignments.has(key)) {
          assignments.set(key, {
            entityId: member.entityId,
            entityName: member.entityName,
            playbookKey: scope.playbookKey,
            assignmentBasis: 'curated',
            // Deliberately null: the assignment is being made *against* the code, so
            // pointing at the node would suggest the code carried it.
            taxonomyNodeId: null,
            rationale: curatedReason,
            issuerEntityId: member.issuerEntityId ?? null,
            securityIssuerIdentityId: member.securityIssuerIdentityId ?? null,
          });
        }
        continue;
      }

      const adjacent = scope.adjacent[member.code];
      if (adjacent) {
        nearMisses.push({
          entityId: member.entityId,
          entityName: member.entityName,
          playbookKey: scope.playbookKey,
          code: member.code,
          reason: adjacent,
        });
      }
    }

    // A curation naming a company that is no longer in the universe is a stale
    // decision, and a silent one is worse than a loud one.
    for (const entityKey of Object.keys(scope.curated)) {
      if (!curatedSeen.has(entityKey)) {
        unmatchedCurations.push({ playbookKey: scope.playbookKey, entityKey });
      }
    }
  }

  return {
    assignments: [...assignments.values()].sort(
      (left, right) =>
        left.playbookKey.localeCompare(right.playbookKey) || left.entityId - right.entityId,
    ),
    nearMisses,
    unmatchedCurations,
  };
}
