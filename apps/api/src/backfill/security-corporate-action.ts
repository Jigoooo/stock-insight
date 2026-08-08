/**
 * Turns the collected corporate actions into the continuity bridge
 * core.security_corporate_action holds. Pure — the runner reads and writes.
 *
 * WHY ONLY SPLITS. The table's action_kind is
 * ('delisting','split','reverse_split','merger','spinoff','ticker_reuse','rename')
 * — every one of them an event where the economic claim itself changes shape or
 * identity. canonical/03 §6 calls this a continuity bridge and that is what the
 * enum encodes. A regular dividend does not change the claim, and the 9,532
 * dividend rows measured in market.corporate_action on 2026-08-08 carry no field
 * that would distinguish a special dividend from an ordinary one. They stay where
 * they are rather than being forced into a vocabulary that has no word for them.
 */

export type CollectedAction = {
  securityMasterId: number;
  actionType: string;
  effectiveDate: string;
  ratio: string | number | null;
  currency: string | null;
  sourceProvider: string;
  availableAt: string;
};

export type CorporateActionRow = {
  securityMasterId: number;
  actionKind: 'split' | 'reverse_split';
  effectiveAt: string;
  knownAt: string;
  ratioNumerator: number | null;
  ratioDenominator: number | null;
  metadata: Record<string, unknown>;
};

export type ActionSkip = { reason: string; count: number };

/**
 * The largest denominator a real split ratio is written with.
 *
 * Split ratios are announced as small whole-number exchanges — 2:1, 3:2, 1:10 —
 * and Korean bonus issues add hundredths, so 1.05 is 21/20. Measured 2026-08-08
 * the collected ratios include 1.02 (51/50) and 1.03 (103/100), which needs 100.
 * Past that the values stop looking like announcements and start looking like
 * price factors: 0.9878 and 0.650655 are in the same column and are not ratios
 * anybody declared.
 */
const MAX_RATIO_DENOMINATOR = 100;

/** Relative error below which a fraction is the ratio rather than near it. */
const RATIO_TOLERANCE = 1e-9;

/**
 * The exact fraction a ratio was announced as, or null if it was not announced as
 * one.
 *
 * Continued fractions rather than scanning denominators: it finds the best
 * rational approximation at each bound, so a repeating decimal like
 * 0.3333333333333333 resolves to 1/3 instead of being missed by a fixed epsilon.
 */
export function exactRatio(
  value: number,
  maxDenominator = MAX_RATIO_DENOMINATOR,
): { numerator: number; denominator: number } | null {
  if (!Number.isFinite(value) || value <= 0) return null;

  let [previousNumerator, numerator] = [0, 1];
  let [previousDenominator, denominator] = [1, 0];
  let remainder = value;

  for (let step = 0; step < 32; step += 1) {
    const whole = Math.floor(remainder);
    const nextNumerator = whole * numerator + previousNumerator;
    const nextDenominator = whole * denominator + previousDenominator;
    if (nextDenominator > maxDenominator) break;

    [previousNumerator, numerator] = [numerator, nextNumerator];
    [previousDenominator, denominator] = [denominator, nextDenominator];

    if (Math.abs(numerator / denominator - value) <= Math.abs(value) * RATIO_TOLERANCE) {
      return { numerator, denominator };
    }
    const fraction = remainder - whole;
    if (fraction === 0) break;
    remainder = 1 / fraction;
  }

  return null;
}

function parseRatio(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildCorporateActionRows(collected: readonly CollectedAction[]): {
  rows: CorporateActionRow[];
  skips: ActionSkip[];
} {
  const rows: CorporateActionRow[] = [];
  const counts = new Map<string, number>();
  const bump = (reason: string): void => {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  };

  for (const action of collected) {
    if (action.actionType !== 'split') {
      bump(`${action.actionType} is not a claim-continuity event; it stays in market`);
      continue;
    }

    const ratio = parseRatio(action.ratio);
    if (ratio === null || ratio <= 0) {
      bump('split carries no usable ratio');
      continue;
    }
    if (ratio === 1) {
      // A one-for-one split changes nothing, so recording it would put an event
      // in a continuity bridge that has no continuity to bridge.
      bump('split ratio of 1 changes nothing');
      continue;
    }

    // The direction is the whole distinction between the two kinds: above one the
    // share count rises, below one it falls.
    const actionKind = ratio > 1 ? 'split' : 'reverse_split';
    const exact = exactRatio(ratio);
    if (!exact) {
      // The event is evidenced even when its ratio is not. Leaving the columns
      // null and keeping the observed number in metadata records both facts, and
      // a consumer computing an adjustment gets nothing rather than 0.9878.
      bump('split ratio is not an announced fraction; recorded without one');
    }

    rows.push({
      securityMasterId: action.securityMasterId,
      actionKind,
      effectiveAt: action.effectiveDate,
      // We knew of it when we collected it. There is no announcement date in the
      // payload — measured 2026-08-08, announced_at is null for all 10,040 rows —
      // so claiming an earlier moment would be an invention, and a later one
      // would hide that we have it.
      knownAt: action.availableAt,
      ratioNumerator: exact?.numerator ?? null,
      ratioDenominator: exact?.denominator ?? null,
      metadata: {
        observedRatio: ratio,
        sourceProvider: action.sourceProvider,
        currency: action.currency,
        ...(exact ? {} : { ratioNotExact: true, ratioMaxDenominator: MAX_RATIO_DENOMINATOR }),
      },
    });
  }

  return {
    rows,
    skips: [...counts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count),
  };
}

/**
 * One action per security per effective date per kind. The collector appends a
 * row per run, so the same split arrives again on the next collection and the
 * bridge would grow a duplicate for an event that happened once.
 */
export function corporateActionKey(row: CorporateActionRow): string {
  return `${row.securityMasterId}:${row.effectiveAt.slice(0, 10)}:${row.actionKind}`;
}
