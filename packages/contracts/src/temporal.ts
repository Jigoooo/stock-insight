import { z } from 'zod';

/**
 * Temporal read contract (enhancement plan Task 3, P1-8).
 *
 * Every truth read declares its time basis with two independent clocks:
 *   - `validAt`  — the point in the world the facts are true about.
 *   - `knownAt`  — the point in the record from which knowledge is drawn.
 * `informationSet` selects how the two combine, and the legacy `asOf` alias is
 * decomposed into both. `knownAt` must never precede `validAt` so a response can
 * never leak information that was not yet known at the requested world time.
 */

const dateTimeSchema = z.string().datetime();

export const informationSetSchema = z.enum(['as_known', 'point_in_time', 'latest']);
export type InformationSet = z.infer<typeof informationSetSchema>;

export const temporalQuerySchema = z
  .object({
    validAt: dateTimeSchema.optional(),
    knownAt: dateTimeSchema.optional(),
    asOf: dateTimeSchema.optional(),
    informationSet: informationSetSchema.default('as_known'),
  })
  .superRefine((value, context) => {
    if (value.validAt && value.knownAt && value.knownAt < value.validAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'knownAt must not precede validAt (no future-known leak)',
        path: ['knownAt'],
      });
    }
  });

export type TemporalQuery = z.infer<typeof temporalQuerySchema>;

export const temporalResolutionMetaSchema = z
  .object({
    validAt: dateTimeSchema,
    knownAt: dateTimeSchema,
    informationSet: informationSetSchema,
    aliasApplied: z.literal('asOf').nullable(),
    knownAtSource: z.enum(['explicit', 'asOf', 'valid_at', 'now']),
    ontologyRevision: z.number().int().nonnegative().nullable(),
  })
  .superRefine((value, context) => {
    if (value.knownAt < value.validAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'knownAt must not precede validAt',
        path: ['knownAt'],
      });
    }
  });

export type TemporalResolutionMeta = z.infer<typeof temporalResolutionMetaSchema>;

/** Parse temporal params off a URLSearchParams into the validated query shape. */
export function parseTemporalQuery(params: URLSearchParams): TemporalQuery {
  const raw: Record<string, string> = {};
  for (const key of ['validAt', 'knownAt', 'asOf', 'informationSet'] as const) {
    const value = params.get(key);
    if (value !== null && value !== '') raw[key] = value;
  }
  return temporalQuerySchema.parse(raw);
}

export type ResolvedTemporalQuery = {
  validAt: string;
  knownAt: string;
  informationSet: InformationSet;
  aliasApplied: 'asOf' | null;
  knownAtSource: 'explicit' | 'asOf' | 'valid_at' | 'now';
  ontologyRevision: number | null;
};

/**
 * Resolve a parsed temporal query into two concrete clocks. Explicit
 * validAt/knownAt win over the `asOf` alias; `asOf` decomposes into both;
 * missing clocks fall back to `now`. `point_in_time` pins knownAt to validAt so
 * no later knowledge is admitted.
 */
export function resolveTemporalQuery(
  query: TemporalQuery,
  options: { now?: string; ontologyRevision?: number } = {},
): ResolvedTemporalQuery {
  const now = options.now ?? new Date().toISOString();
  const aliasApplied: 'asOf' | null =
    query.asOf !== undefined && query.validAt === undefined && query.knownAt === undefined
      ? 'asOf'
      : null;

  const validAt = query.validAt ?? query.asOf ?? now;

  let knownAt: string;
  let knownAtSource: ResolvedTemporalQuery['knownAtSource'];
  if (query.knownAt !== undefined) {
    knownAt = query.knownAt;
    knownAtSource = 'explicit';
  } else if (query.informationSet === 'point_in_time') {
    knownAt = validAt;
    knownAtSource = query.asOf !== undefined && aliasApplied ? 'asOf' : 'valid_at';
  } else if (aliasApplied) {
    knownAt = query.asOf!;
    knownAtSource = 'asOf';
  } else if (query.validAt === undefined) {
    knownAt = now;
    knownAtSource = 'now';
  } else {
    knownAt = now;
    knownAtSource = 'now';
  }

  // Invariant: knownAt is never earlier than validAt. If a caller pins an
  // explicit knownAt below validAt the schema already rejected it; the derived
  // paths above can only produce knownAt >= validAt.
  if (knownAt < validAt) knownAt = validAt;

  return {
    validAt,
    knownAt,
    informationSet: query.informationSet,
    aliasApplied,
    knownAtSource,
    ontologyRevision: options.ontologyRevision ?? null,
  };
}
