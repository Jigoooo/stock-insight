// Turning a company name written in a Korean annual report into an entity id.
//
// This is the whole cost of C1. Measured 2026-08-05 on 40 사업보고서: 32 carry a
// 매출처 section and 16 name a counterparty we already hold. But a naive
// substring match over those reports produced 89 pairs where the honest count is
// 37, and the 52 extra were three distinct mistakes:
//
//   자기·계열      대한전선 → 대한전선, (주)LS → LS ELECTRIC
//   이름 변형      한국전력 + 한국전력공사(주) counted twice — they are one issuer
//   짧은 이름      GS · NC · LS · KT match almost anywhere in a 300-character window
//                  (롯데에너지머티리얼즈 → "NC, GS" was pure noise)
//
// So the resolver has to be the careful part, and the collector the mechanical
// one. Nothing here reads a document; it decides what a set of candidate name
// hits means.

/** A name the catalog knows, already collapsed to the issuer it belongs to. */
export type NameCatalogEntry = {
  /** The entity the NAME is written on — may be a security. */
  entityId: number;
  /**
   * The issuer that entity resolves to, via ISSUED_BY. Equal to entityId when the
   * entity is already an issuer.
   *
   * This is what kills the 이름 변형 noise with data instead of a guess: the
   * ledger holds 254 accepted ISSUED_BY edges, and 한국전력 → 한국전력공사(주) is
   * one of them, so both names collapse to one counterparty.
   */
  issuerEntityId: number;
  name: string;
};

export type ResolvedMention = {
  issuerEntityId: number;
  /** The catalog name that matched, for the evidence text. */
  matchedName: string;
  /**
   * Other names in the same window that resolved to this issuer.
   *
   * Not decoration: without it the arithmetic does not close. Re-measured
   * 2026-08-05, the 40-report sample went 89 raw hits to 35 mentions with only 34
   * rejections — the other 20 were issuer merges that left no trace, and a
   * summary that silently loses 20 rows is the exact fault this file's rejection
   * list exists to prevent.
   */
  mergedNames: string[];
};

export type MentionRejection = {
  needle: string;
  reason:
    | 'self_or_same_name_group'
    | 'below_minimum_specificity'
    | 'ambiguous_across_issuers'
    | 'shadowed_by_longer_match';
};

/**
 * Minimum normalized length for a name to count as a mention.
 *
 * Chosen by reading the output, the same way the macro correlation threshold was.
 * Measured on the 40-report sample: at 2 characters the result is 61 pairs and
 * includes 롯데에너지머티리얼즈 → "NC, GS"; at 4 it is 37 and every row reads
 * (현대건설 → 한국전력, 한온시스템 → 현대모비스·현대자동차); at 5 it drops to 25
 * and loses real counterparties like 기아.
 *
 * It is a threshold, not a solution — 기아 is a genuine 2-character customer and
 * this rule cannot see it. The count it costs is recorded rather than hidden.
 */
export const MIN_MENTION_LENGTH = 4;

/** Strips the corporate-form decorations Korean filings vary freely. */
export function normalizeCompanyName(value: string): string {
  return value.replace(/\(주\)|주식회사|㈜|\(유\)|유한회사|\s+/g, '').toLowerCase();
}

/**
 * Which issuers a report's 매출처 windows actually name.
 *
 * Deliberately NOT doing: affiliate and parent exclusion. `(주)LS → LS일렉트릭`
 * is a subsidiary, not a customer, and no name rule can tell that — the two
 * normalized forms share no substring. The ledger cannot help either: OWNS and
 * ROLLS_UP both stand at ZERO accepted revisions (measured on snapshot 28), so
 * there is no ownership graph to subtract. Callers get the rejections they can
 * act on and this gap is reported rather than papered over with a heuristic.
 */
export function resolveCustomerMentions(input: {
  /** The issuer whose report this is; it cannot be its own customer. */
  reportingIssuerEntityId: number;
  reportingName: string;
  /** Text windows already narrowed to 매출처 context by the collector. */
  contextWindows: readonly string[];
  catalog: readonly NameCatalogEntry[];
}): {
  resolved: ResolvedMention[];
  rejections: MentionRejection[];
  /** Names folded into an issuer already claimed. resolved + rejected + merged = hits. */
  mergedByIssuer: number;
} {
  const reportingNeedle = normalizeCompanyName(input.reportingName);
  const rejections: MentionRejection[] = [];
  const reject = (needle: string, reason: MentionRejection['reason']): void => {
    if (!rejections.some((row) => row.needle === needle && row.reason === reason)) {
      rejections.push({ needle, reason });
    }
  };

  // One needle can belong to several catalog rows. Group first so ambiguity is
  // judged per needle rather than per row.
  const byNeedle = new Map<string, { issuers: Set<number>; names: Set<string> }>();
  for (const entry of input.catalog) {
    const needle = normalizeCompanyName(entry.name);
    if (needle.length === 0) continue;
    const group = byNeedle.get(needle) ?? { issuers: new Set<number>(), names: new Set<string>() };
    group.issuers.add(entry.issuerEntityId);
    group.names.add(entry.name);
    byNeedle.set(needle, group);
  }

  const windows = input.contextWindows.map(normalizeCompanyName);
  const hitNeedles = [...byNeedle.keys()].filter((needle) =>
    windows.some((window) => window.includes(needle)),
  );

  // Longest first: 한국전력기술 must win over 한국전력, which is a real prefix of
  // it (ISSUED_BY holds 한전기술 → 한국전력기술(주)). Without this the shorter
  // name would claim a mention that belongs to the longer one.
  const ordered = [...hitNeedles].sort(
    (left, right) => right.length - left.length || (left < right ? -1 : 1),
  );

  const resolved: ResolvedMention[] = [];
  const claimedByIssuer = new Map<number, ResolvedMention>();
  let mergedByIssuer = 0;
  const acceptedNeedles: string[] = [];
  for (const needle of ordered) {
    const group = byNeedle.get(needle)!;
    if (needle.length < MIN_MENTION_LENGTH) {
      reject(needle, 'below_minimum_specificity');
      continue;
    }
    // Self, and the family of names that normalize into each other. This is the
    // only affiliate case a name rule can honestly catch.
    //
    // Containment is gated on the REPORTING name being specific enough too. A
    // two-character issuer like (주)LS normalizes to `ls`, and an ungated
    // containment check would reject every counterparty whose name happens to
    // contain those letters — `wolseley` among them. Exact equality still holds
    // at any length, so a short name never becomes its own customer.
    const containmentIsMeaningful = reportingNeedle.length >= MIN_MENTION_LENGTH;
    if (
      needle === reportingNeedle ||
      (containmentIsMeaningful &&
        (needle.includes(reportingNeedle) || reportingNeedle.includes(needle)))
    ) {
      reject(needle, 'self_or_same_name_group');
      continue;
    }
    if (group.issuers.size > 1) {
      // One string, two counterparties. Picking either would be the invention the
      // attribution jobs refuse to make.
      reject(needle, 'ambiguous_across_issuers');
      continue;
    }
    if (acceptedNeedles.some((longer) => longer.includes(needle))) {
      reject(needle, 'shadowed_by_longer_match');
      continue;
    }
    const issuerEntityId = [...group.issuers][0]!;
    const primaryName = [...group.names].sort()[0]!;
    // Two names of one issuer are one mention — this is the ISSUED_BY collapse
    // doing its work. Counted and attributed, not dropped: a merge is a decision
    // and the summary has to add up.
    const claimed = claimedByIssuer.get(issuerEntityId);
    if (claimed !== undefined) {
      claimed.mergedNames.push(primaryName);
      mergedByIssuer += 1;
      continue;
    }
    const mention: ResolvedMention = { issuerEntityId, matchedName: primaryName, mergedNames: [] };
    claimedByIssuer.set(issuerEntityId, mention);
    acceptedNeedles.push(needle);
    resolved.push(mention);
  }

  for (const mention of resolved) mention.mergedNames.sort();
  resolved.sort((left, right) => left.issuerEntityId - right.issuerEntityId);
  return { resolved, rejections, mergedByIssuer };
}
