// P0-2 — L3 assertion semantic verification (roadmap §4 P0-2; enhancement plan §10.1).
// Span existence alone is not enough: the same entities+predicate can appear in
// negated, conditional, speculative, attributed, or retracted sentences. This
// deterministic verifier classifies the quote's semantics BEFORE persistence.
// LLM output is input, never authority (ADR-001): whatever the model claimed,
// the verifier re-derives polarity/modality/attribution from the quote text.
//
// Output is a decision, not a boolean:
//   accept              — semantics compatible with an affirmed factual claim
//   accept_downgraded   — extractable but must persist with adjusted labels
//   quarantine          — semantics contradict automatic acceptance (kept as candidate)

export type SemanticVerdict = {
  decision: 'accept' | 'accept_downgraded' | 'quarantine';
  polarity: 1 | -1;
  modality: 'factual' | 'planned' | 'possible' | 'alleged' | 'forecast';
  attributed: boolean;
  conditional: boolean;
  retractedOrCorrected: boolean;
  numericallyConsistent: boolean;
  reasons: string[];
};

const NEGATION_PATTERNS: RegExp[] = [
  /(하지\s*않|치\s*않|지\s*않았|지\s*않는|않기로)/,
  /(없다|없었다|없는\s*것으로|아니다|아니라고|무산|철회|취소|부인|부정했다)/,
  /\b(not|no longer|denied|denies|deny|refuted|rejects?|rejected|cancell?ed|scrapped|called off|will not|won't|does not|did not|didn't|doesn't|never)\b/i,
];

const CONDITIONAL_PATTERNS: RegExp[] = [
  /(경우에는|경우에|한다면|이면|라면|조건부|전제(로|하에)|승인\s*시|승인되면|통과되면|성사되면)/,
  /\b(if|unless|provided that|subject to|conditional on|contingent (on|upon)|pending approval)\b/i,
];

const PLANNED_PATTERNS: RegExp[] = [
  /(계획|예정|추진|방침|하기로\s*했다|할\s*방침|착수한다|나설\s*계획)/,
  /\b(plans? to|will|intends? to|is set to|scheduled to|aims? to|preparing to)\b/i,
];

const POSSIBLE_PATTERNS: RegExp[] = [
  /(검토|가능성|고려|모색|타진|저울질|논의\s*중|협상\s*중|추진\s*중인\s*것으로)/,
  /\b(considering|may|might|could|reportedly exploring|in talks|weighing|potentially|possible)\b/i,
];

const ALLEGED_PATTERNS: RegExp[] = [
  /(알려졌다|전해졌다|소식통|루머|설이\s*제기|의혹|~인\s*것으로\s*보인다|관측이\s*나온다)/,
  /\b(allegedly|rumou?red|according to sources|reportedly|unconfirmed|sources? (say|said))\b/i,
];

const FORECAST_PATTERNS: RegExp[] = [
  /(전망|예상|예측|추정|관측된다|~할\s*것으로\s*보인다|기대된다|목표치)/,
  /\b(forecasts?|expects?|expected to|projected|outlook|estimates?|guidance suggests)\b/i,
];

const ATTRIBUTION_PATTERNS: RegExp[] = [
  /(밝혔다|말했다|주장했다|언급했다|설명했다|강조했다|따르면|인용|보도했다|발표문에서)/,
  /\b(said|stated|claimed|told|quoted|cited|according to|announced that|reported that)\b/i,
];

const CORRECTION_PATTERNS: RegExp[] = [
  /(정정|철회|번복|취소했다|무효화|바로잡|정정보도|해명)/,
  /\b(correction|corrected|retracts?|retracted|withdrew|withdrawn|reverses earlier|clarifi(es|ed))\b/i,
];

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Numbers appearing in the quote must also appear in the claimed object/value
 * text (and vice versa) after normalization — an LLM that "adjusted" a figure
 * fails this check. Only digit-bearing tokens participate.
 */
export function checkNumericalConsistency(quote: string, claimedValueText: string): boolean {
  const extract = (text: string): Set<string> => {
    const tokens = text.match(/\d[\d,.]*/g) ?? [];
    return new Set(
      tokens
        .map((token) => token.replaceAll(',', '').replace(/\.$/, ''))
        .filter((token) => token.length > 0),
    );
  };
  const claimedNumbers = extract(claimedValueText);
  if (claimedNumbers.size === 0) return true; // nothing numeric claimed
  const quoteNumbers = extract(quote);
  for (const value of claimedNumbers) {
    if (!quoteNumbers.has(value)) return false;
  }
  return true;
}

export function verifyAssertionSemantics(input: {
  quote: string;
  claimedValueText?: string;
  documentSectionType?: 'body' | 'headline' | 'summary' | 'disclaimer' | 'advertisement';
}): SemanticVerdict {
  const quote = input.quote.trim();
  const reasons: string[] = [];
  if (!quote) {
    return {
      decision: 'quarantine',
      polarity: 1,
      modality: 'factual',
      attributed: false,
      conditional: false,
      retractedOrCorrected: false,
      numericallyConsistent: false,
      reasons: ['empty_quote'],
    };
  }

  const negated = matchesAny(quote, NEGATION_PATTERNS);
  const conditional = matchesAny(quote, CONDITIONAL_PATTERNS);
  const attributed = matchesAny(quote, ATTRIBUTION_PATTERNS);
  const retractedOrCorrected = matchesAny(quote, CORRECTION_PATTERNS);
  const numericallyConsistent = checkNumericalConsistency(quote, input.claimedValueText ?? '');

  let modality: SemanticVerdict['modality'] = 'factual';
  if (matchesAny(quote, ALLEGED_PATTERNS)) modality = 'alleged';
  else if (matchesAny(quote, FORECAST_PATTERNS)) modality = 'forecast';
  else if (matchesAny(quote, POSSIBLE_PATTERNS)) modality = 'possible';
  else if (matchesAny(quote, PLANNED_PATTERNS)) modality = 'planned';

  // Decision ladder (fail-closed):
  if (retractedOrCorrected) reasons.push('correction_or_retraction_language');
  if (negated) reasons.push('negation_detected');
  if (!numericallyConsistent) reasons.push('numeric_mismatch_with_quote');
  if (input.documentSectionType === 'disclaimer' || input.documentSectionType === 'advertisement') {
    reasons.push(`non_evidential_section:${input.documentSectionType}`);
  }
  if (conditional) reasons.push('conditional_clause');
  if (modality === 'alleged') reasons.push('alleged_modality');
  if (modality === 'possible') reasons.push('possible_modality');
  if (attributed) reasons.push('attributed_statement');
  if (modality === 'forecast') reasons.push('forecast_modality');
  if (modality === 'planned') reasons.push('planned_modality');

  const hardBlock =
    retractedOrCorrected ||
    negated ||
    !numericallyConsistent ||
    input.documentSectionType === 'disclaimer' ||
    input.documentSectionType === 'advertisement';
  const needsDowngrade =
    conditional || attributed || modality !== 'factual';

  return {
    decision: hardBlock ? 'quarantine' : needsDowngrade ? 'accept_downgraded' : 'accept',
    polarity: negated ? -1 : 1,
    modality,
    attributed,
    conditional,
    retractedOrCorrected,
    numericallyConsistent,
    reasons,
  };
}

/** Map a semantic verdict onto the claim_type actually persisted. */
export function reconcileClaimType(
  llmClaimType: string,
  verdict: SemanticVerdict,
): string {
  if (verdict.decision === 'quarantine') return llmClaimType;
  switch (verdict.modality) {
    case 'forecast':
      return 'forecast';
    case 'alleged':
    case 'possible':
      return 'rumor';
    case 'planned':
      return 'guidance';
    default:
      return verdict.attributed && llmClaimType === 'asserted_fact'
        ? 'reported_claim'
        : llmClaimType;
  }
}
