/**
 * Decides which companies the semiconductor playbook governs.
 *
 * The live taxonomy cannot answer this on its own. Measured 2026-08-08:
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
 * Assigning by code alone would take in a defence contractor and a satellite
 * antenna maker while leaving out the biggest memory maker there is. So the codes
 * that are unambiguous carry a 'taxonomy' assignment, and anything else is
 * 'curated' and has to say why in a sentence somebody can disagree with.
 *
 * The near misses are reported rather than silently dropped: a company sitting one
 * node away from an assignment is the case where a future reader most needs to see
 * that somebody looked and decided.
 */

export type TaxonomyMember = {
  entityId: number;
  entityName: string;
  taxonomyNodeId: number;
  taxonomySystem: string;
  code: string;
};

export type PlaybookAssignmentRow = {
  entityId: number;
  entityName: string;
  assignmentBasis: 'taxonomy' | 'curated';
  taxonomyNodeId: number | null;
  rationale: string;
};

export type NearMiss = { entityId: number; entityName: string; code: string; reason: string };

/**
 * Industry codes that mean "this company makes semiconductors" with no further
 * argument needed.
 */
const SEMICONDUCTOR_CODES: Record<string, string> = {
  '3674': 'SIC 3674 is Semiconductors & Related Devices; the code says it outright',
  '2612': 'KSIC 2612 is memory integrated circuit manufacturing; the code says it outright',
};

/**
 * Companies the codes get wrong, each with the reason the code is wrong.
 *
 * Keyed by entity name because that is what a reviewer reads. The runner resolves
 * it against the master and reports a name that no longer matches rather than
 * silently assigning nothing.
 */
const CURATED: Record<string, string> = {
  삼성전자: 'Classified under KSIC 264, communications and broadcasting equipment, on the strength of its handset business. It is also the largest memory manufacturer in the world, and every driver in this playbook — wafer capacity, HBM qualification, memory ASP — governs the majority of its operating profit.',
};

/**
 * Codes that sit inside the same KSIC 26 branch without making semiconductors.
 * Recorded so the decision is visible, not so it can be reversed quietly.
 */
const ADJACENT_NOT_ASSIGNED: Record<string, string> = {
  '2621':
    'display panel manufacturing; shares fab economics but not the node, interface or memory cycle this playbook is built on',
  '2622':
    'passive components and substrates; supplies the industry rather than participating in its product cycle',
  '26299': 'defence electronics; the KSIC 26 branch is electronics, not semiconductors',
  '26429': 'satellite communication antennas; same branch, unrelated economics',
};

export function assignSemiconductorPlaybook(members: readonly TaxonomyMember[]): {
  assignments: PlaybookAssignmentRow[];
  nearMisses: NearMiss[];
  unmatchedCurations: string[];
} {
  const assignments = new Map<number, PlaybookAssignmentRow>();
  const nearMisses: NearMiss[] = [];
  const curatedSeen = new Set<string>();

  for (const member of members) {
    const codeReason = SEMICONDUCTOR_CODES[member.code];
    if (codeReason) {
      // A company can hold two qualifying codes; the first is enough and the
      // second would be a duplicate assignment rather than a stronger one.
      if (!assignments.has(member.entityId)) {
        assignments.set(member.entityId, {
          entityId: member.entityId,
          entityName: member.entityName,
          assignmentBasis: 'taxonomy',
          taxonomyNodeId: member.taxonomyNodeId,
          rationale: codeReason,
        });
      }
      continue;
    }

    const curatedReason = CURATED[member.entityName];
    if (curatedReason) {
      curatedSeen.add(member.entityName);
      if (!assignments.has(member.entityId)) {
        assignments.set(member.entityId, {
          entityId: member.entityId,
          entityName: member.entityName,
          assignmentBasis: 'curated',
          // Deliberately null: the assignment is being made *against* the code, so
          // pointing at the node would suggest the code carried it.
          taxonomyNodeId: null,
          rationale: curatedReason,
        });
      }
      continue;
    }

    const adjacent = ADJACENT_NOT_ASSIGNED[member.code];
    if (adjacent) {
      nearMisses.push({
        entityId: member.entityId,
        entityName: member.entityName,
        code: member.code,
        reason: adjacent,
      });
    }
  }

  return {
    assignments: [...assignments.values()].sort((left, right) => left.entityId - right.entityId),
    nearMisses,
    // A curation naming a company that is no longer in the universe is a stale
    // decision, and a silent one is worse than a loud one.
    unmatchedCurations: Object.keys(CURATED).filter((name) => !curatedSeen.has(name)),
  };
}
