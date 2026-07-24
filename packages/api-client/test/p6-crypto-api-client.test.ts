import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createApiClient } from '../src/index.ts';

const emptyWorkspace = {
  schemaVersion: 'p6.v1',
  availability: 'empty',
  knownAt: '2026-07-23T00:00:00.000Z',
  readOnly: true,
  orderExecutable: false,
  stats: { entities: 0, events: 0, companyLinks: 0, riskExposures: 0 },
  entities: [],
  events: [],
  companyLinks: [],
  riskExposures: [],
};

describe('P6-6 crypto API client', () => {
  it('serializes canonical PIT inputs and rejects malformed options before fetch', async () => {
    const requests: string[] = [];
    const client = createApiClient({
      fetcher: (async (input) => {
        requests.push(String(input));
        return new Response(JSON.stringify(emptyWorkspace), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch,
    });

    await client.cryptoResearchWorkspace({
      knownAt: '2026-07-23T00:00:00.000Z',
      limit: 40,
    });
    assert.equal(
      requests[0],
      '/api/v1/crypto/workspace?knownAt=2026-07-23T00%3A00%3A00.000Z&limit=40',
    );

    const callUnsafe = client.cryptoResearchWorkspace as (input: unknown) => Promise<unknown>;
    await assert.rejects(callUnsafe({ knownAt: '', limit: 40 }));
    await assert.rejects(callUnsafe({ knownAt: '2026-07-23', limit: 100.5 }));
    assert.equal(requests.length, 1);
  });
});
