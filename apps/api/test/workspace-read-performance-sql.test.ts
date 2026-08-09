import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('workspace read SQL guardrails', () => {
  it('materializes the user-filtered stock news feed before selecting entity news', async () => {
    const source = await read('stocks/read-model.ts');
    assert.match(
      source,
      /user_feed AS MATERIALIZED \([\s\S]*?FROM public\.v_user_feed_dedup[\s\S]*?WHERE user_id = \$2::uuid[\s\S]*?\), related_news AS/,
    );
    assert.match(source, /FROM user_feed[\s\S]*?record_entity_key/);
  });

  it('materializes record relevance after filtering by the current user', async () => {
    const source = await read('workspace/record-detail.ts');
    assert.match(
      source,
      /WITH relevance AS MATERIALIZED \([\s\S]*?FROM public\.v_user_feed_dedup[\s\S]*?WHERE user_id = \$1::uuid[\s\S]*?\)[\s\S]*?LEFT JOIN relevance/,
    );
    assert.doesNotMatch(
      source,
      /LEFT JOIN public\.v_user_feed_dedup relevance\s+ON relevance\.user_id/,
    );
  });
});
