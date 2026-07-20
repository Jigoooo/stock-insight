import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getThemeResearchList, type ThemeResearchQueryExecutor } from '../src/themes/read-model.ts';

const userScope = { userId: 'b3ca4de6-905c-484e-bfd6-a927c801d903' } as const;

describe('theme research read model', () => {
  it('returns sealed V2 community summaries with user context', async () => {
    const seen: unknown[][] = [];
    const executor: ThemeResearchQueryExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>(sql: string, parameters = []) => {
        seen.push([...parameters]);
        assert.match(sql, /analytics\.graph_snapshot/);
        assert.match(sql, /analytics\.graph_community_member/);
        assert.doesNotMatch(sql, /current_temporal_graph_edge/);
        return [
          {
            theme_key: 'THEME:ai_semi',
            title: 'AI 반도체',
            member_count: '12',
            watched_count: '2',
            holding_count: '1',
            recent_signal_count: '18',
            top_entity_keys: ['US:NVDA', 'US:AMD'],
            graph_known_through_at: '2026-07-16T13:05:26.678Z',
            signal_as_of: '2026-07-16T12:00:00.000Z',
          },
        ] as unknown as TRow[];
      },
    };

    const result = await getThemeResearchList(executor, {
      userScope,
      now: new Date('2026-07-17T01:00:00.000Z'),
    });

    assert.equal(seen[0]?.[0], userScope.userId);
    assert.equal(seen[0]?.[1], '2026-07-10T01:00:00.000Z');
    assert.equal(seen[0]?.[2], '2026-07-17T01:00:00.000Z');
    assert.equal(result.items[0]?.memberCount, 12);
    assert.equal(result.items[0]?.recentSignalCount, 18);
    assert.equal(result.graphKnownThroughAt, '2026-07-16T13:05:26.678Z');
    assert.equal(result.availability, 'available');
    assert.equal('userId' in (result.items[0] ?? {}), false);
  });
});
