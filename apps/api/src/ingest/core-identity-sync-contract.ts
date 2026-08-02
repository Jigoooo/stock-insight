export type IdentityScalar = number | string;

export type IdentityState = {
  entityKey: string;
  market: string;
  ticker: string;
  expectedExchangeKey: string | null;
  cik: string | null;
  stockId: IdentityScalar | null;
  stockType: string | null;
  listingCount: number;
  listingOwner: IdentityScalar | null;
  listingExchangeKey: string | null;
  tickerIdentifierCount: number;
  tickerIdentifierOwner: IdentityScalar | null;
  tickerIdentifierNamespace: string | null;
  companyId: IdentityScalar | null;
  companyType: string | null;
  cikOwner: IdentityScalar | null;
  cikOwnerType: string | null;
};

function same(left: IdentityScalar | null, right: IdentityScalar | null): boolean {
  return left !== null && right !== null && String(left) === String(right);
}

function fail(state: IdentityState, reason: string): never {
  throw new Error(`core identity state conflict for ${state.entityKey}: ${reason}`);
}

export function normalizeCik(value: string | null): string | null {
  const candidate = value ?? '';
  return candidate.length === 10 && /^(?!0{10}$)\d{10}$/.test(candidate) ? candidate : null;
}

// 'deferred' means nothing is wrong — the reference data needed to mint this
// identity has not arrived yet. New US tickers land in public.entities as soon
// as news or price ingestion sees them, but their SEC CIK only arrives with the
// weekly fundamentals backfill, and some tickers (e.g. those absent from SEC
// company_tickers.json) never resolve at all. Treating that as a conflict made a
// single unresolvable ticker kill the whole nightly analytics pipeline; the SEC
// backfill already records the same situation as a non-fatal `missing_cik`.
// A genuine contradiction still throws.
export function classifyIdentityState(
  state: IdentityState,
): 'complete' | 'missing' | 'repairable' | 'deferred' {
  if (!['KR', 'US'].includes(state.market) || !state.entityKey || !state.ticker) {
    return fail(state, 'legacy identity is incomplete');
  }

  if (state.companyId !== null && state.companyType !== 'Company') {
    return fail(state, 'company INTERNAL_KEY is not owned by a Company');
  }
  if (state.cikOwner !== null && state.cikOwnerType !== 'Company') {
    return fail(state, 'CIK is not owned by a Company');
  }
  if (
    state.companyId !== null &&
    state.cikOwner !== null &&
    !same(state.companyId, state.cikOwner)
  ) {
    return fail(state, 'company INTERNAL_KEY and CIK resolve to different entities');
  }

  if (state.stockId === null) {
    // Conflicts are checked BEFORE readiness: half-built state under a ticker we
    // believe is new is a real contradiction and must never be deferred away.
    if (
      state.stockType !== null ||
      state.listingCount !== 0 ||
      state.listingOwner !== null ||
      state.listingExchangeKey !== null ||
      state.tickerIdentifierCount !== 0 ||
      state.tickerIdentifierOwner !== null ||
      state.tickerIdentifierNamespace !== null
    ) {
      return fail(state, 'new identity conflicts with an existing ticker or listing');
    }
    // Nothing exists yet and the authoritative reference is not in hand. Wait for
    // the upstream backfill rather than minting an identity we cannot anchor.
    if (state.market === 'US' && state.cik === null) return 'deferred';
    if (state.expectedExchangeKey === null) return 'deferred';
    return 'missing';
  }

  if (state.stockType !== 'Stock') return fail(state, 'INTERNAL_KEY is not owned by a Stock');
  if (state.listingCount !== 1 || !same(state.listingOwner, state.stockId)) {
    return fail(state, 'current listing is missing, duplicated, or owned by another entity');
  }
  if (state.listingExchangeKey === null)
    return fail(state, 'current listing exchange is unresolved');
  if (
    state.expectedExchangeKey !== null &&
    state.listingExchangeKey !== state.expectedExchangeKey
  ) {
    return fail(state, 'current listing disagrees with the authoritative exchange');
  }
  if (
    state.expectedExchangeKey === null &&
    (state.market !== 'KR' ||
      !['EXCHANGE:KOSPI', 'EXCHANGE:KOSDAQ'].includes(state.listingExchangeKey))
  ) {
    return fail(state, 'profile-less legacy identity has an unsupported listing exchange');
  }
  if (
    state.tickerIdentifierCount !== 1 ||
    !same(state.tickerIdentifierOwner, state.stockId) ||
    state.tickerIdentifierNamespace !== state.listingExchangeKey
  ) {
    return fail(state, 'LOCAL_TICKER is missing, duplicated, or split from the listing');
  }
  if (state.companyId === null || state.companyType !== 'Company') {
    return fail(state, 'company identity is missing or invalid');
  }
  if (state.market === 'US' && state.cik !== null && state.cikOwner === null) return 'repairable';
  if (state.market === 'US' && state.cik !== null && !same(state.companyId, state.cikOwner)) {
    return fail(state, 'trusted CIK is not bound to the company identity');
  }
  return 'complete';
}
