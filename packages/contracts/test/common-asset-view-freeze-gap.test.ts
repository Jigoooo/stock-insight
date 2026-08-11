import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { commonAssetViewPacketSchema } from '../src/common-asset-view.ts';

const FREEZE = new URL(
  '../../../docs/plan/stock-crypto-investment-context-world-model-v2-final/',
  import.meta.url,
);

// The frozen `common-asset-view.schema.json` requires eight properties. This packet
// supplies five of them and narrows a sixth, and that gap was recorded only in a header
// comment when the read path landed.
//
// A comment is not a gate. `analysis-information-set.test.ts` in this same directory
// already reads its frozen schema and holds the zod type to it, so the pattern exists —
// what was missing here is that our divergence is deliberate, and a deliberate
// divergence still has to be the kind a test fails on when it changes.
//
// The divergence is deliberate for one reason: the twelve blocks already carry thesis,
// risks and derivation ids, each with its own `blockState` and `stateReason`. Lifting
// them to the packet top level would put the same fact in two places, and when the two
// disagree the contract has no answer for which is true. canonical/06 §2 names the
// twelve blocks as the mandatory content; the machine schema is a narrower projection
// written for a different consumer.
//
// So this test does not assert conformance. It asserts the shape of the gap, so that a
// revision of the frozen schema — or a quiet decision to start filling these at the top
// level — fails here rather than being discovered by whoever writes the next reader.
describe('the common asset view packet diverges from the frozen schema on purpose', () => {
  const frozen = JSON.parse(
    readFileSync(new URL('contracts/common-asset-view.schema.json', FREEZE), 'utf8'),
  ) as { required: string[]; properties: Record<string, unknown> };

  const packetKeys = new Set(Object.keys(commonAssetViewPacketSchema.shape));

  it('still requires the eight properties this gap is measured against', () => {
    // Pinned so the gap below is read against a known baseline. If the freeze is revised,
    // this fails first and the divergence has to be re-decided rather than re-inherited.
    assert.deepEqual(frozen.required, [
      'assetViewId',
      'economicClaimId',
      'informationSetId',
      'semanticSnapshotId',
      'coverageState',
      'thesis',
      'risks',
      'derivationIds',
    ]);
  });

  it('supplies five required properties at the packet top level', () => {
    for (const key of [
      'assetViewId',
      'economicClaimId',
      'informationSetId',
      'semanticSnapshotId',
      'coverageState',
    ]) {
      assert.ok(packetKeys.has(key), `packet must carry ${key}`);
    }
  });

  it('carries thesis, risks and derivation ids as blocks rather than top-level fields', () => {
    // Blocks 9, 10 and 12 respectively. Naming them here is the point: a future author who
    // adds `thesis` to the packet has to delete this assertion, and deleting it is a
    // decision about where the truth lives rather than an oversight.
    for (const key of ['thesis', 'risks', 'derivationIds']) {
      assert.ok(
        !packetKeys.has(key),
        `${key} belongs to the twelve blocks; a top-level copy would let the two disagree`,
      );
    }
  });

  it('narrows informationSetId to nullable because the column does not exist yet', () => {
    // The freeze types this `string` and requires it. `serving.common_asset_view` has no
    // such column, no builder resolves an information set, and the append-only trigger
    // forbids backfilling existing packets — so every packet would report a value nobody
    // computed. Null is the honest answer and REQ-SRC-001 is the reason: "데이터 없음"과
    // "수집하지 않음"을 구분한다, applied to our own artifact.
    assert.equal(
      (frozen.properties.informationSetId as { type?: string } | undefined)?.type,
      'string',
    );
    assert.equal(commonAssetViewPacketSchema.shape.informationSetId.safeParse(null).success, true);
  });
});
