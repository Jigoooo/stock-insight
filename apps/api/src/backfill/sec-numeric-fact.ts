import { createHash } from 'node:crypto';

export type SecUnitEntry = {
  start?: string;
  end?: string;
  val?: number;
  accn?: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  frame?: string;
};

export type SecCompanyFactsPayload = {
  cik?: number | string;
  entityName?: string;
  facts?: Record<
    string,
    Record<
      string,
      {
        label?: string;
        description?: string;
        units?: Record<string, SecUnitEntry[]>;
      }
    >
  >;
};

export type SecNumericFactContext = {
  canonicalCik: string;
  entityId: number;
  sourceRevisionId: number;
  ingestedAt: string;
  sinceYear: number;
  /** Proven issuer fiscal year-end month. Without it canonical fiscal fields stay null. */
  fiscalYearEndMonth?: number;
};

export type SecFactLocator = {
  provider: 'sec-edgar';
  cik: string;
  taxonomy: string;
  tag: string;
  unit: string;
  accession: string;
  form: string | null;
  filed: string;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  start: string | null;
  end: string;
  frame: string | null;
  entryIdentity: string;
  entryIndex: number;
};

export type SecNumericFactDraft = {
  factKey: string;
  restatementGroupKey: string;
  entityId: number;
  conceptNamespace: string;
  conceptKey: string;
  value: number;
  unit: string;
  currency: string | null;
  scalePower: number;
  periodStart: string | null;
  periodEnd: string | null;
  instantAt: string | null;
  fiscalYear: number | null;
  fiscalQuarter: number | null;
  dimensionsJson: Record<string, string>;
  locator: SecFactLocator;
  sourceRevisionId: number;
  availableAt: string;
  knownAt: string;
  metadata: Record<string, unknown>;
};

export type SecNumericFactSkip = { reason: string; count: number };

export type SecNumericFactExpansion = {
  drafts: SecNumericFactDraft[];
  skips: SecNumericFactSkip[];
  skippedCount: number;
};

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CIK_WIDTH = 10;
const FILING_TIME_ZONE = 'America/New_York';

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

export function normalizeSecCik(value: number | string | undefined): string | null {
  if (value === undefined) return null;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) return null;
  if (/^0+$/.test(raw)) return null;
  const unpadded = raw.replace(/^0+(?=\d)/, '');
  if (unpadded.length > CIK_WIDTH) return null;
  return unpadded.padStart(CIK_WIDTH, '0');
}

function parseDateParts(value: string | undefined): [number, number, number] | null {
  const match = DATE_PATTERN.exec(value ?? '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }
  return [year, month, day];
}

function nextCalendarDay(value: string): [number, number, number] {
  const parts = parseDateParts(value);
  if (!parts) throw new Error(`invalid calendar date: ${value}`);
  const next = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1));
  return [next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()];
}

function zoneParts(
  instant: Date,
  timeZone: string,
): [number, number, number, number, number, number] {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(formatted.find((candidate) => candidate.type === type)?.value);
  return [part('year'), part('month'), part('day'), part('hour'), part('minute'), part('second')];
}

/**
 * Converts a local wall-clock value to UTC without assuming that New York is
 * always EST. The second pass handles the offset changing around the guess;
 * midnight itself is not a DST transition in this zone.
 */
function zonedWallClockToUtc(
  parts: [number, number, number, number, number, number],
  timeZone: string,
): Date {
  const desired = Date.UTC(
    ...([parts[0], parts[1] - 1, ...parts.slice(2)] as [
      number,
      number,
      number,
      number,
      number,
      number,
    ]),
  );
  let candidate = new Date(desired);
  for (let pass = 0; pass < 2; pass += 1) {
    const observed = zoneParts(candidate, timeZone);
    const observedAsUtc = Date.UTC(
      observed[0],
      observed[1] - 1,
      observed[2],
      observed[3],
      observed[4],
      observed[5],
    );
    candidate = new Date(candidate.getTime() + desired - observedAsUtc);
  }
  return candidate;
}

/**
 * SEC companyfacts exposes a filing date, not a publication timestamp. We use
 * the end of that calendar day in America/New_York as a conservative upper
 * bound. If the object was collected earlier that day, collection is a tighter
 * proven upper bound, so availability is clamped to knownAt.
 */
export function resolveSecAvailability(filed: string, ingestedAt: string): string {
  const filedParts = parseDateParts(filed);
  if (!filedParts) throw new Error(`invalid filing date: ${filed}`);
  const filingDayStart = zonedWallClockToUtc(
    [filedParts[0], filedParts[1], filedParts[2], 0, 0, 0],
    FILING_TIME_ZONE,
  );
  const next = nextCalendarDay(filed);
  const nextMidnight = zonedWallClockToUtc([next[0], next[1], next[2], 0, 0, 0], FILING_TIME_ZONE);
  const filingDayUpperBound = nextMidnight.getTime() - 1;
  const knownAt = new Date(ingestedAt).getTime();
  if (!Number.isFinite(knownAt)) throw new Error(`invalid ingestion timestamp: ${ingestedAt}`);
  if (knownAt < filingDayStart.getTime()) {
    throw new Error(`source ingestion predates New York filing day ${filed}`);
  }
  return new Date(Math.min(filingDayUpperBound, knownAt)).toISOString();
}

/** ISO 4217 alphabetic codes; a three-letter token outside this set stays lossless raw unit. */
const ISO_4217_CODES = new Set(
  `AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HRK HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD USN UYI UYU UYW UZS VED VES VND VUV WST XAF XAG XAU XBA XBB XBC XBD XCD XCG XDR XOF XPD XPF XPT XSU XTS XUA XXX YER ZAR ZMW ZWG`.split(
    ' ',
  ),
);

function normalizeUnit(rawUnit: string): { unit: string; currency: string | null } {
  if (rawUnit === 'shares' || rawUnit === 'pure') {
    return { unit: rawUnit, currency: null };
  }
  const upper = rawUnit.toUpperCase();
  if (ISO_4217_CODES.has(upper)) return { unit: 'currency', currency: upper };
  return { unit: rawUnit, currency: null };
}

function canonicalFiscalPeriod(
  periodEnd: string,
  fiscalYearEndMonth: number | undefined,
): { fiscalYear: number | null; fiscalQuarter: number | null } {
  if (fiscalYearEndMonth === undefined) return { fiscalYear: null, fiscalQuarter: null };
  const [claimYear, claimMonth] = parseDateParts(periodEnd)!;
  const fiscalYear = claimMonth <= fiscalYearEndMonth ? claimYear : claimYear + 1;
  const monthsAfterYearEnd = (claimMonth - fiscalYearEndMonth + 11) % 12;
  return { fiscalYear, fiscalQuarter: Math.floor(monthsAfterYearEnd / 3) + 1 };
}

function bump(counts: Map<string, number>, reason: string): void {
  counts.set(reason, (counts.get(reason) ?? 0) + 1);
}

function sortedSkips(counts: Map<string, number>): SecNumericFactSkip[] {
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => left.reason.localeCompare(right.reason));
}

function emptyWith(reason: string): SecNumericFactExpansion {
  return { drafts: [], skips: [{ reason, count: 1 }], skippedCount: 1 };
}

export function expandSecCompanyFacts(
  payload: SecCompanyFactsPayload,
  context: SecNumericFactContext,
): SecNumericFactExpansion {
  const canonicalCik = normalizeSecCik(context.canonicalCik);
  const payloadCik = normalizeSecCik(payload.cik);
  if (!canonicalCik) return emptyWith('canonical CIK is missing or invalid');
  if (!payloadCik) return emptyWith('payload CIK is missing or invalid');
  if (payloadCik !== canonicalCik) {
    return emptyWith(`payload CIK ${payloadCik} does not match canonical CIK ${canonicalCik}`);
  }
  if (!Number.isInteger(context.entityId) || context.entityId <= 0) {
    return emptyWith('canonical entity id is missing or invalid');
  }
  if (!Number.isInteger(context.sourceRevisionId) || context.sourceRevisionId <= 0) {
    return emptyWith('source revision id is missing or invalid');
  }
  if (!Number.isFinite(new Date(context.ingestedAt).getTime())) {
    return emptyWith('source revision ingestion timestamp is invalid');
  }
  if (
    context.fiscalYearEndMonth !== undefined &&
    (!Number.isInteger(context.fiscalYearEndMonth) ||
      context.fiscalYearEndMonth < 1 ||
      context.fiscalYearEndMonth > 12)
  ) {
    return emptyWith('issuer fiscal year-end month is invalid');
  }

  const drafts: SecNumericFactDraft[] = [];
  const skipCounts = new Map<string, number>();
  const seenEntryIdentities = new Set<string>();

  for (const [taxonomy, facts] of Object.entries(payload.facts ?? {})) {
    if (!taxonomy.trim() || taxonomy !== taxonomy.trim()) {
      bump(skipCounts, 'taxonomy is missing or has surrounding whitespace');
      continue;
    }
    for (const [tag, body] of Object.entries(facts)) {
      if (!tag.trim() || tag !== tag.trim()) {
        bump(skipCounts, 'tag is missing or has surrounding whitespace');
        continue;
      }
      for (const [rawUnit, entries] of Object.entries(body.units ?? {})) {
        if (!rawUnit.trim() || rawUnit !== rawUnit.trim()) {
          bump(skipCounts, 'XBRL unit is missing or has surrounding whitespace');
          continue;
        }
        entries.forEach((entry, entryIndex) => {
          if (typeof entry.val !== 'number' || !Number.isFinite(entry.val)) {
            bump(skipCounts, 'entry value is not finite numeric');
            return;
          }
          if (!entry.accn?.trim()) {
            bump(skipCounts, 'entry accession is missing');
            return;
          }
          if (!parseDateParts(entry.filed)) {
            bump(skipCounts, 'entry filed date is missing or invalid');
            return;
          }
          if (!parseDateParts(entry.end)) {
            bump(skipCounts, 'entry period end is missing or invalid');
            return;
          }
          if (entry.start !== undefined && !parseDateParts(entry.start)) {
            bump(skipCounts, 'entry period start is invalid');
            return;
          }
          if (
            entry.fy !== undefined &&
            (!Number.isInteger(entry.fy) || entry.fy < 1800 || entry.fy > 3000)
          ) {
            bump(skipCounts, 'entry filing-focus fiscal year is invalid');
            return;
          }
          const claimEndYear = parseDateParts(entry.end)![0];
          if (claimEndYear < context.sinceYear) {
            bump(skipCounts, 'entry claim end year is before sinceYear');
            return;
          }
          let availableAt: string;
          try {
            availableAt = resolveSecAvailability(entry.filed!, context.ingestedAt);
          } catch (error) {
            bump(
              skipCounts,
              error instanceof Error ? error.message : 'entry availability is invalid',
            );
            return;
          }

          const locatorIdentityInput = {
            cik: canonicalCik,
            taxonomy,
            tag,
            unit: rawUnit,
            accession: entry.accn,
            form: entry.form ?? null,
            filed: entry.filed,
            fiscalYear: entry.fy,
            fiscalPeriod: entry.fp ?? null,
            start: entry.start ?? null,
            end: entry.end,
            frame: entry.frame ?? null,
            value: entry.val,
          };
          const entryIdentity = stableHash(locatorIdentityInput);
          if (seenEntryIdentities.has(entryIdentity)) {
            bump(skipCounts, 'duplicate SEC entry identity within payload');
            return;
          }
          seenEntryIdentities.add(entryIdentity);
          const locator: SecFactLocator = {
            provider: 'sec-edgar',
            cik: canonicalCik,
            taxonomy,
            tag,
            unit: rawUnit,
            accession: entry.accn,
            form: entry.form ?? null,
            filed: entry.filed!,
            fiscalYear: entry.fy ?? null,
            fiscalPeriod: entry.fp ?? null,
            start: entry.start ?? null,
            end: entry.end!,
            frame: entry.frame ?? null,
            entryIdentity,
            entryIndex,
          };
          const normalizedUnit = normalizeUnit(rawUnit);
          const isDuration = entry.start !== undefined;
          const fiscal = canonicalFiscalPeriod(entry.end!, context.fiscalYearEndMonth);
          const restatementSignature = stableHash({
            entityId: context.entityId,
            taxonomy,
            tag,
            unit: rawUnit,
            start: entry.start ?? null,
            end: entry.end,
          }).slice(0, 24);

          drafts.push({
            factKey: `sec:${canonicalCik}:${entry.accn}:${entryIdentity}`,
            restatementGroupKey: `sec:${context.entityId}:${taxonomy}:${tag}:${restatementSignature}`,
            entityId: context.entityId,
            conceptNamespace: taxonomy,
            conceptKey: tag,
            value: entry.val,
            unit: normalizedUnit.unit,
            currency: normalizedUnit.currency,
            scalePower: 0,
            periodStart: isDuration ? entry.start! : null,
            periodEnd: isDuration ? entry.end! : null,
            instantAt: isDuration ? null : `${entry.end}T23:59:59.999Z`,
            fiscalYear: fiscal.fiscalYear,
            fiscalQuarter: fiscal.fiscalQuarter,
            dimensionsJson: {},
            locator,
            sourceRevisionId: context.sourceRevisionId,
            availableAt,
            knownAt: context.ingestedAt,
            metadata: {
              entityName: payload.entityName ?? null,
              label: body.label ?? null,
              description: body.description ?? null,
            },
          });
        });
      }
    }
  }

  drafts.sort((left, right) => left.factKey.localeCompare(right.factKey));
  const skips = sortedSkips(skipCounts);
  return {
    drafts,
    skips,
    skippedCount: skips.reduce((total, skip) => total + skip.count, 0),
  };
}
