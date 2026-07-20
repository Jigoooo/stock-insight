import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { stalePublicationServingMigrationSql } from '../src/migrations/028_stale_publication_serving.ts';

describe('stale publication serving migration', () => {
  it('serves immutable available or stale bindings without weakening payload integrity', () => {
    assert.match(
      stalePublicationServingMigrationSql,
      /create or replace view ops\.internal_web_publication_records/i,
    );
    assert.match(
      stalePublicationServingMigrationSql,
      /status\.projection_status\s+in\s+\('available',\s*'stale'\)/i,
    );
    assert.match(
      stalePublicationServingMigrationSql,
      /binding\.payload_sha256\s*=\s*ops\.publication_record_payload_sha256\(binding\.record_id\)/i,
    );
    assert.match(stalePublicationServingMigrationSql, /binding\.lifecycle_state\s*=\s*'active'/i);
    assert.match(
      stalePublicationServingMigrationSql,
      /grant select on ops\.internal_web_publication_records to stock_insight_reader/i,
    );
    assert.doesNotMatch(stalePublicationServingMigrationSql, /\b(delete|truncate|drop table)\b/i);
  });
});
