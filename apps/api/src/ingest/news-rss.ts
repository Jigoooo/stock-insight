import { createHash } from 'node:crypto';

export type RssNewsItem = {
  title?: unknown;
  url?: unknown;
  source?: unknown;
  region?: unknown;
  kind?: unknown;
  when?: unknown;
  summary?: unknown;
};

export type RssNewsBundle = {
  items?: unknown;
  by?: unknown;
  errors?: unknown;
  stats?: unknown;
};

export type SourceDocumentSeed = {
  sourceKey: string;
  providerKey: string;
  sourceSystem: 'rss_news';
  sourceType: 'news';
  sourceName: string;
  title: string;
  summary?: string;
  url: string;
  publishedAt?: string;
  collectedAt: string;
  validAt: string;
  knownAt: string;
  contentHash: string;
  revisionFingerprint: string;
  policyDecision: 'review_required';
  rawJson: Record<string, unknown>;
};

export type NewsIngestAudit = {
  collected: number;
  eligible: number;
  skipped: number;
  duplicateUrls: number;
  feedErrors: number;
  seeds: SourceDocumentSeed[];
};

const TRACKING_QUERY_KEYS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'spm',
]);

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function canonicalizeNewsUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || TRACKING_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.toLowerCase();
    if (
      (url.protocol === 'https:' && url.port === '443') ||
      (url.protocol === 'http:' && url.port === '80')
    ) {
      url.port = '';
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

export function parsePublishedAt(value: unknown): string | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function providerKey(source: string): string {
  const slug = source
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `rss:${slug || sha256(source).slice(0, 16)}`;
}

export function toSourceDocumentSeed(
  item: RssNewsItem,
  collectedAt = new Date().toISOString(),
): SourceDocumentSeed | undefined {
  const title = stringValue(item.title);
  const sourceName = stringValue(item.source);
  const url = canonicalizeNewsUrl(stringValue(item.url));
  if (!title || !sourceName || !url) return undefined;

  const publishedAt = parsePublishedAt(item.when);
  const summary = stringValue(item.summary).slice(0, 4000);
  const validAt = publishedAt ?? collectedAt;
  const rawJson = {
    source: sourceName,
    region: stringValue(item.region) || null,
    kind: stringValue(item.kind) || 'news',
    originalUrl: stringValue(item.url),
    publishedText: stringValue(item.when) || null,
    feedSummaryPresent: summary.length > 0,
  };
  const contentHash = sha256(JSON.stringify({ title, url, summary }));
  const revisionFingerprint = sha256(
    JSON.stringify({ title, url, summary, publishedAt: publishedAt ?? null, sourceName }),
  );

  return {
    sourceKey: sha256(`rss-news\0${url}`),
    providerKey: providerKey(sourceName),
    sourceSystem: 'rss_news',
    sourceType: 'news',
    sourceName,
    title,
    ...(summary ? { summary } : {}),
    url,
    ...(publishedAt ? { publishedAt } : {}),
    collectedAt,
    validAt,
    knownAt: collectedAt,
    contentHash,
    revisionFingerprint,
    policyDecision: 'review_required',
    rawJson,
  };
}

export function buildNewsIngestAudit(
  bundle: RssNewsBundle,
  collectedAt = new Date().toISOString(),
): NewsIngestAudit {
  const items = Array.isArray(bundle.items) ? (bundle.items as RssNewsItem[]) : [];
  const seenUrls = new Set<string>();
  const seeds: SourceDocumentSeed[] = [];
  let skipped = 0;
  let duplicateUrls = 0;

  for (const item of items) {
    const seed = toSourceDocumentSeed(item, collectedAt);
    if (!seed) {
      skipped += 1;
      continue;
    }
    if (seenUrls.has(seed.url)) {
      duplicateUrls += 1;
      continue;
    }
    seenUrls.add(seed.url);
    seeds.push(seed);
  }

  const errors = bundle.errors;
  return {
    collected: items.length,
    eligible: seeds.length,
    skipped,
    duplicateUrls,
    feedErrors:
      errors && typeof errors === 'object' && !Array.isArray(errors)
        ? Object.keys(errors).length
        : 0,
    seeds,
  };
}
