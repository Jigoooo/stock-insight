import { createHash } from 'node:crypto';

/**
 * Connects the knowledge stack back to the ingestion stack, for news.
 *
 * WHAT THE K2 SURVEY GOT WRONG. It concluded that assertion was unreachable
 * because `document_chunk.source_revision_id` is NULL for all 9,041 rows and no
 * bridge existed. It tested two bridges — content_hash and
 * source_record_identity.provider_record_key — found zero matches in both, and
 * stopped. It never tried the article URL, which both stacks carry:
 * `knowledge.document.canonical_url` on one side and the `url` of each item
 * inside an rss-news-bundle raw object on the other.
 *
 * Measured 2026-08-08: 6,794 documents match a retained bundle item by URL, and
 * 6,196 of them (91.2%) have chunk text that is exactly `title + ' ' + summary`
 * from that item. The legacy row and our bundle are two records of one fetch.
 *
 * WHY THE EXACT MATCH IS THE WHOLE POINT. A shared URL alone proves the two rows
 * are about the same article, not that the bundle holds the bytes the chunk was
 * made from. RSS feeds get edited: one measured pair reads "18 tech stocks that
 * have fallen at least 30%" against "19 (mostly) tech stocks that have fallen at
 * least 25%" — same URL, different capture. Attaching a source revision there
 * would claim REQ-EVD-004 re-derivability that does not hold, which is exactly
 * the invention the survey was right to refuse. So the reconstruction is
 * recomputed per chunk and the 598 that do not reproduce are left alone.
 */

export type BundleItem = {
  sourceRevisionId: number;
  url: string;
  title: string | null;
  summary: string | null;
  availableAt: string;
  ingestedAt: string;
};

export type ChunkReading = {
  chunkId: number;
  documentId: number;
  canonicalUrl: string | null;
  content: string;
};

export type ChunkLineage = {
  chunkId: number;
  sourceRevisionId: number;
  availableAt: string;
  ingestedAt: string;
  /** Re-derivable proof, so a reader can check the bridge instead of trusting it. */
  evidence: {
    matchedBy: 'canonical_url';
    reconstructedFrom: 'title+summary';
    reconstructionHash: string;
    bundleUrl: string;
  };
};

export type LineageSkip = { reason: string; count: number };

/**
 * Whitespace is the only difference allowed.
 *
 * The chunk was assembled by joining the item's fields, and the join collapsed
 * newlines; nothing else about the text may differ, because anything else means
 * the bytes are not the ones the chunk came from.
 */
function normalize(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function reconstructChunkText(item: BundleItem): string {
  return normalize(`${item.title ?? ''} ${item.summary ?? ''}`);
}

function reconstructionHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function buildChunkLineage(
  chunks: readonly ChunkReading[],
  itemsByUrl: ReadonlyMap<string, BundleItem>,
): { lineage: ChunkLineage[]; skips: LineageSkip[] } {
  const lineage: ChunkLineage[] = [];
  const counts = new Map<string, number>();
  const bump = (reason: string): void => {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  };

  for (const chunk of chunks) {
    if (!chunk.canonicalUrl) {
      bump('document carries no canonical url');
      continue;
    }
    const item = itemsByUrl.get(chunk.canonicalUrl);
    if (!item) {
      bump('no retained bundle item for this url');
      continue;
    }

    const reconstructed = reconstructChunkText(item);
    if (normalize(chunk.content) !== reconstructed) {
      // Same article, different capture. The publisher edited the headline or
      // the summary between the two fetches, so our bytes are not the bytes this
      // chunk was made from.
      bump('bundle item does not reproduce the chunk; a later capture of the same url');
      continue;
    }

    lineage.push({
      chunkId: chunk.chunkId,
      sourceRevisionId: item.sourceRevisionId,
      availableAt: item.availableAt,
      ingestedAt: item.ingestedAt,
      evidence: {
        matchedBy: 'canonical_url',
        reconstructedFrom: 'title+summary',
        reconstructionHash: reconstructionHash(reconstructed),
        bundleUrl: item.url,
      },
    });
  }

  return {
    lineage,
    skips: [...counts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count),
  };
}
