import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

function read(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

const candidate = read('../../../docker-compose.candidate.yml');
const production = read('../../../docker-compose.prod.yml');
const productionDbOnly = read('../../../docker-compose.prod-db-auth.yml');
const dockerfile = read('../Dockerfile');
const apiDockerfile = read('../../api-server/Dockerfile');
const releaseImage = 'sha256:f7eebfb9f9e80bb18a8361caf6d3c55ff11c7e46decb0255732e7c0cc2040ce9';
const apiReleaseImage = 'sha256:b9902487af4e2cded3d87b3eafcdef7bb8f4a206e4d6d7adf5028d2c21f6ec81';

describe('release deployment isolation', () => {
  it('gives enrollment E2E only explicit candidate reader/writer DSNs and dedicated secrets', () => {
    const candidateReader =
      '${STOCK_INSIGHT_CANDIDATE_DATABASE_READ_URL:?set a candidate reader DSN}';
    const candidateWriter =
      '${STOCK_INSIGHT_CANDIDATE_DATABASE_WRITE_URL:?set a candidate writer DSN}';
    assert.equal(candidate.split(candidateReader).length - 1, 1);
    assert.equal(candidate.split(candidateWriter).length - 1, 1);
    assert.match(candidate, /DATABASE_READ_URL: \$\{STOCK_INSIGHT_CANDIDATE_DATABASE_READ_URL:/);
    assert.match(candidate, /DATABASE_WRITE_URL: \$\{STOCK_INSIGHT_CANDIDATE_DATABASE_WRITE_URL:/);
    assert.match(candidate, /STOCK_INSIGHT_CANDIDATE_AUTH_PASSWORD_RECORD_HOST_PATH/);
    assert.match(candidate, /STOCK_INSIGHT_CANDIDATE_AUTH_ENROLLMENT_TOKEN_HASH_HOST_PATH/);
    assert.match(candidate, /STOCK_INSIGHT_CANDIDATE_SESSION_SECRET_HOST_PATH/);
    assert.doesNotMatch(candidate, /STOCK_INSIGHT_DATABASE_WRITE_URL/);
    assert.match(candidate, /networks: !override\s+- candidate/);
    assert.match(candidate, /STOCK_INSIGHT_CANDIDATE_NETWORK/);
    assert.doesNotMatch(candidate, /- research/);
  });

  it('pins production runtime bytes and Docker build bases by digest', () => {
    for (const manifest of [production, productionDbOnly]) {
      assert.ok(manifest.includes(`image: \${STOCK_INSIGHT_APP_IMAGE:-${releaseImage}}`));
      assert.ok(manifest.includes(`image: \${STOCK_INSIGHT_API_IMAGE:-${apiReleaseImage}}`));
      assert.doesNotMatch(manifest, /\n\s+build:/);
    }
    for (const buildManifest of [dockerfile, apiDockerfile]) {
      const fromLines = buildManifest.match(/^FROM .+$/gm) ?? [];
      const externalNodeStages = fromLines.filter((line: string) => line.startsWith('FROM node:'));
      assert.equal(externalNodeStages.length, 2);
      assert.ok(
        externalNodeStages.every((line: string) => /@sha256:[a-f0-9]{64}/.test(line)),
      );
    }
  });

  it('provides a post-enrollment DB-only runtime with no bootstrap credential mounts', () => {
    assert.doesNotMatch(productionDbOnly, /AUTH_USERNAME|AUTH_PASSWORD|ENROLLMENT_TOKEN/);
    assert.match(productionDbOnly, /STOCK_INSIGHT_SESSION_SECRET_FILE/);
    assert.match(productionDbOnly, /stock-insight-session-secret/);
    assert.match(productionDbOnly, /DATABASE_READ_URL/);
    assert.match(productionDbOnly, /DATABASE_WRITE_URL/);
  });
});
