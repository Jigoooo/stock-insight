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
  /**
   * Entities excluded by identifier rather than by code, each with the reason.
   *
   * Needed because a token carries no industry code: `adjacent` is keyed by code and a
   * token's code is empty, so a code-keyed exclusion would silently match every token
   * at once. Six of the 24 Token rows are not protocols and each needs its own sentence.
   */
  adjacentEntities?: Record<string, string>;
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
  {
    playbookKey: 'life_science',
    // Every code here names a business rather than a legal form, so there is nothing
    // to curate. That is the difference from KSIC 64992 지주회사, where the code could
    // not tell a bank group from a shipbuilder.
    codes: {
      '2834': 'SIC 2834 is Pharmaceutical Preparations; the code says it outright',
      '2836': 'SIC 2836 is Biological Products; the code says it outright',
      '211': 'KSIC 211 is 기초 의약 물질 및 생물학적 제제 제조업',
      '21100': 'KSIC 21100 is the 기초 의약 물질 leaf; 셀트리온 sits here',
      '212': 'KSIC 212 is 의약품 제조업',
      '21212': 'KSIC 21212 is the 완제 의약품 leaf; 한미약품 sits here',
    },
    curated: {},
    adjacent: {
      // Adjacent by branch or by intuition, and each with economics this playbook does
      // not describe. Recorded so the decision is visible rather than inferable.
      '21299':
        'KSIC 21299 other pharmaceutical manufacturing; a residual bucket that names no development pipeline',
      '2830':
        'SIC 2830 drugs at the two-digit level; too coarse to say whether a company develops or distributes',
      '3841':
        'SIC 3841 surgical and medical instruments; devices clear a different regulatory path with no trial readout of this kind',
      '5122': 'SIC 5122 drugs and proprietaries wholesale; distribution economics, no pipeline',
      '8731':
        'SIC 8731 commercial physical and biological research; contract research, paid per study rather than owning the asset',
    },
  },
  {
    playbookKey: 'resources',
    // Extractive only. canonical/04 §5's minimums — reserves, grade, recovery, NAV —
    // all presuppose an orebody, and the refiners and utilities that share the 'energy'
    // banner own none.
    codes: {
      '1000': 'SIC 1000 is Metal Mining; the code says it outright',
      '1090': 'SIC 1090 is Miscellaneous Metal Ores; the code says it outright',
      '1400': 'SIC 1400 is Mining & Quarrying of Nonmetallic Minerals; the code says it outright',
    },
    curated: {},
    adjacent: {
      // Refiners: they buy the commodity rather than extract it.
      '2911':
        'petroleum refining; buys crude and sells product, so throughput and the crack spread are its economics and it owns no reserves',
      '192': 'KSIC 192 석유 정제품 제조업; same as SIC 2911 — refining margin, not an orebody',
      '19210': 'KSIC 19210 원유 정제처리업; refining, no reserves',
      // Regulated utilities: revenue is a tariff on a rate base, fuel passed through.
      '4911':
        'SIC 4911 electric services; a regulated utility earns a tariff on a rate base with fuel cost passed through, which has no reserve, grade or cost curve',
      '35120': 'KSIC 35120 송전 및 배전업; regulated transmission and distribution, same reason',
      '35200': 'KSIC 35200 연료용 가스 제조 및 배관공급업; regulated gas distribution, same reason',
      '4931': 'SIC 4931 electric and other services combined; regulated utility, same reason',
    },
  },
  {
    playbookKey: 'crypto',
    // No codes: a token has no industry classification, and inventing one would be a
    // classification this repository never made. Every assignment here is curated.
    codes: {},
    curated: {
      'CRYPTO:BTC':
        'Bitcoin. A protocol with a fixed supply schedule and no upgradeable fee mechanism; supply, emission and finality are the whole of what there is to measure.',
      'CRYPTO:ETH':
        'Ethereum. Protocol fees, a burn mechanism and an upgrade path that has changed issuance more than once — every canonical/04 §5 minimum applies literally.',
      'CRYPTO:SOL':
        'Solana. L1 with protocol fees, staking issuance and a published upgrade cadence.',
      'CRYPTO:ADA': 'Cardano. L1 with a fixed maximum supply and treasury-routed fees.',
      'CRYPTO:AVAX': 'Avalanche. L1 with a burn mechanism and subnet-level dependency surface.',
      'CRYPTO:DOT': 'Polkadot. L1 with inflationary issuance and parachain dependency.',
      'CRYPTO:BNB': 'BNB. Chain token with a scheduled burn against a chain it also secures.',
      'CRYPTO:TRX': 'TRON. L1 with resource-model fees and staking issuance.',
      'CRYPTO:XRP': 'XRP. Ledger token with a fixed supply and an escrow release schedule.',
      'CRYPTO:LINK': 'Chainlink. Oracle protocol; the dependency surface driver is what it sells.',
      'CRYPTO:UNI':
        'Uniswap. Application protocol whose fee switch is the value-capture question in its purest form.',
      'CRYPTO:NEAR': 'NEAR. L1 with inflationary issuance and a burn share.',
      'CRYPTO:SUI': 'Sui. L1 with staking issuance and a published unlock schedule.',
      'CRYPTO:DOGE':
        'Dogecoin. Perpetual fixed-amount issuance and no fee capture, which the playbook is built to state rather than hide.',
      'CRYPTO:ZEC': 'Zcash. L1 with a halving schedule and a development-fund routing decision.',
      'CRYPTO:HYPE': 'HYPE. Exchange protocol token with fee routing to holders.',
      'CRYPTO:LEO': 'LEO. Exchange token with a buyback-and-burn commitment.',
      'CRYPTO:RAIN':
        'RAIN. Protocol token carried in the crypto universe with its own supply schedule.',
    },
    adjacent: {},
    adjacentEntities: {
      'CRYPTO:ERROR':
        "an error placeholder that became an entity — canonical_name is 'coingecko_global'. This is a data defect, not a classification question, and it is named here so it stops being invisible.",
      'CRYPTO:GLOBAL':
        'total crypto market capitalisation; an aggregate with no supply schedule, no contract and no fees',
      'CRYPTO:ETH.D': 'Ethereum dominance; a ratio between two aggregates, not an asset',
      'CRYPTO:FNG': 'Fear & Greed index; a sentiment measure, not a protocol',
      'CRYPTO:SPY':
        'Macro:SPY — a US equity ETF typed as a Token; wrong entity type, not a protocol',
      'CRYPTO:QQQ': 'Macro:QQQ — the same',
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

      const adjacent = scope.adjacentEntities?.[member.entityKey] ?? scope.adjacent[member.code];
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
