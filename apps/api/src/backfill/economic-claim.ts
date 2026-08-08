/**
 * Decides what economic claim each security represents, from what the database
 * can actually show. Pure — the runner supplies the readings and does the writes.
 *
 * The honest answer for almost every security today is "we do not know", and
 * saying so is the point. Measured 2026-08-08 all 297 securities carry
 * entity_type='Stock', including SMH which is the VanEck Semiconductor ETF, so a
 * consumer reaching for a security is free to assume common equity in the issuer.
 * canonical/03 §2 says that assumption is wrong. Writing an undetermined row
 * makes the join return NULL and forces the consumer to decide, which is more
 * than it had before.
 */

export type SecurityReading = {
  securityMasterId: number;
  primaryTicker: string;
  issuerEntityId: number | null;
  currency: string | null;
  listedFrom: string | null;
  createdAt: string;
  /** The security holds a basket, evidenced by a collected holdings snapshot. */
  hasHoldingsSnapshot: boolean;
};

export type EconomicClaimRow = {
  securityMasterId: number;
  issuerEntityId: number | null;
  claimType: 'FUND_UNIT' | null;
  claimTypeState: 'determined' | 'undetermined';
  determinationBasis: string;
  validFrom: string;
  knownAt: string;
};

/** A Korean listing code: six digits, and the last one carries the share class. */
const KRX_TICKER = /^[0-9]{6}$/;

/**
 * What the KRX numbering convention settles, and what it does not.
 *
 * A code ending in 0 is not a preferred line — those end in 5, 7 or 9 — so the
 * convention rules one claim type out. It does not rule anything in: Korean ETFs
 * are six digits ending in 0 as well, 069500 among them. Measured 2026-08-08 all
 * 188 Korean tickers in the master end in 0, so the convention narrows every one
 * of them to the same two possibilities and settles none.
 */
export function krxTickerRulesOutPreferred(ticker: string): boolean {
  return KRX_TICKER.test(ticker) && ticker.endsWith('0');
}

export function buildEconomicClaims(
  securities: readonly SecurityReading[],
  knownAt: string,
): { rows: EconomicClaimRow[]; determined: number; undetermined: number } {
  const rows: EconomicClaimRow[] = [];

  for (const security of securities) {
    // A security we have collected holdings for holds a basket, and a claim on a
    // basket is a fund unit. This is the only claim type anything in the database
    // evidences today — two of 297.
    const determined = security.hasHoldingsSnapshot;

    const basis = determined
      ? `ingestion holdings snapshot collected for ${security.primaryTicker}: the security holds a basket, so the claim is on the fund rather than on an issuer`
      : [
          'no claim-type evidence:',
          `entity_type is 'Stock' for every security including known funds;`,
          'no share-class field in security_master, listing or entity metadata;',
          'no holdings snapshot collected',
          krxTickerRulesOutPreferred(security.primaryTicker)
            ? '; KRX code ends in 0, which rules out a preferred line but not a fund'
            : '',
        ]
          .join(' ')
          .replace(/\s+;/g, ';');

    rows.push({
      securityMasterId: security.securityMasterId,
      issuerEntityId: security.issuerEntityId,
      claimType: determined ? 'FUND_UNIT' : null,
      claimTypeState: determined ? 'determined' : 'undetermined',
      determinationBasis: basis,
      // The claim exists from when the security was listed. Falling back to the
      // row's own creation is a statement about our record rather than about the
      // world, and the basis says which one a reader is looking at.
      validFrom: security.listedFrom ?? security.createdAt,
      knownAt,
    });
  }

  return {
    rows,
    determined: rows.filter((row) => row.claimTypeState === 'determined').length,
    undetermined: rows.filter((row) => row.claimTypeState === 'undetermined').length,
  };
}

/**
 * The table's CHECKs, applied before a transaction opens rather than discovered
 * by one row inside it.
 */
export function findClaimViolations(
  rows: readonly EconomicClaimRow[],
): { rule: string; count: number; example: number }[] {
  const found = new Map<string, { count: number; example: number }>();
  const record = (rule: string, example: number): void => {
    const entry = found.get(rule);
    if (entry) entry.count += 1;
    else found.set(rule, { count: 1, example });
  };

  for (const row of rows) {
    if ((row.claimTypeState === 'determined') !== (row.claimType !== null)) {
      record('claim_type_state disagrees with claim_type', row.securityMasterId);
    }
    if (row.determinationBasis.trim() === '') {
      record('a claim with no stated basis', row.securityMasterId);
    }
    if (Number.isNaN(Date.parse(row.validFrom))) {
      record('valid_from is not a time', row.securityMasterId);
    }
    if (Date.parse(row.knownAt) < Date.parse(row.validFrom)) {
      // Not a table CHECK, but a claim known before it existed is a reading
      // error rather than a fact about a security.
      record('known_at precedes valid_from', row.securityMasterId);
    }
  }

  return [...found.entries()].map(([rule, entry]) => ({ rule, ...entry }));
}
