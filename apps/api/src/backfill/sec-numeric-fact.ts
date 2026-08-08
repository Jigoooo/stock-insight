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
  fiscalYear: number;
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
  fiscalYear: number;
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
  const next = nextCalendarDay(filed);
  const nextMidnight = zonedWallClockToUtc([next[0], next[1], next[2], 0, 0, 0], FILING_TIME_ZONE);
  const filingDayUpperBound = nextMidnight.getTime() - 1;
  const knownAt = new Date(ingestedAt).getTime();
  if (!Number.isFinite(knownAt)) throw new Error(`invalid ingestion timestamp: ${ingestedAt}`);
  return new Date(Math.min(filingDayUpperBound, knownAt)).toISOString();
}

function normalizeUnit(rawUnit: string): { unit: string; currency: string | null } {
  if (/^[a-z]{3}$/i.test(rawUnit)) {
    return { unit: 'currency', currency: rawUnit.toUpperCase() };
  }
  if (rawUnit === 'shares' || rawUnit === 'pure') {
    return { unit: rawUnit, currency: null };
  }
  return { unit: rawUnit, currency: null };
}

function fiscalQuarter(fp: string | undefined): number | null {
  if (fp === 'FY' || fp === 'Q4') return 4;
  if (fp === 'Q1') return 1;
  if (fp === 'Q2') return 2;
  if (fp === 'Q3') return 3;
  return null;
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

  const drafts: SecNumericFactDraft[] = [];
  const skipCounts = new Map<string, number>();

  for (const [taxonomy, facts] of Object.entries(payload.facts ?? {})) {
    if (!taxonomy.trim()) {
      bump(skipCounts, 'taxonomy is missing');
      continue;
    }
    for (const [tag, body] of Object.entries(facts)) {
      if (!tag.trim()) {
        bump(skipCounts, 'tag is missing');
        continue;
      }
      for (const [rawUnit, entries] of Object.entries(body.units ?? {})) {
        if (!rawUnit.trim()) {
          bump(skipCounts, 'XBRL unit is missing');
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
          if (!Number.isInteger(entry.fy) || (entry.fy ?? 0) < 1800 || (entry.fy ?? 0) > 3000) {
            bump(skipCounts, 'entry fiscal year is missing or invalid');
            return;
          }
          if ((entry.fy ?? 0) < context.sinceYear) {
            bump(skipCounts, 'entry fiscal year is before sinceYear');
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
          const locator: SecFactLocator = {
            provider: 'sec-edgar',
            cik: canonicalCik,
            taxonomy,
            tag,
            unit: rawUnit,
            accession: entry.accn,
            form: entry.form ?? null,
            filed: entry.filed!,
            fiscalYear: entry.fy!,
            fiscalPeriod: entry.fp ?? null,
            start: entry.start ?? null,
            end: entry.end!,
            frame: entry.frame ?? null,
            entryIdentity,
            entryIndex,
          };
          const normalizedUnit = normalizeUnit(rawUnit);
          const isDuration = entry.start !== undefined;
          const restatementSignature = stableHash({
            entityId: context.entityId,
            taxonomy,
            tag,
            unit: rawUnit,
            start: entry.start ?? null,
            end: entry.end,
            frame: entry.frame ?? null,
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
            fiscalYear: entry.fy!,
            fiscalQuarter: fiscalQuarter(entry.fp),
            dimensionsJson: entry.frame ? { frame: entry.frame } : {},
            locator,
            sourceRevisionId: context.sourceRevisionId,
            availableAt: resolveSecAvailability(entry.filed!, context.ingestedAt),
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
