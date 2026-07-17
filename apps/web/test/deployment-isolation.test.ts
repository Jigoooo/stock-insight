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
const releaseImage = 'sha256:b1b0f1b036f486511095c95dba4175c310e8461064ca94d43c81f8c81a46405f';

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
      assert.doesNotMatch(manifest, /\n\s+build:/);
    }
    const fromLines = dockerfile.match(/^FROM .+$/gm) ?? [];
    assert.equal(fromLines.length, 2);
    assert.ok(fromLines.every((line) => /@sha256:[a-f0-9]{64}/.test(line)));
  });

  it('provides a post-enrollment DB-only runtime with no bootstrap credential mounts', () => {
    assert.doesNotMatch(productionDbOnly, /AUTH_USERNAME|AUTH_PASSWORD|ENROLLMENT_TOKEN/);
    assert.match(productionDbOnly, /STOCK_INSIGHT_SESSION_SECRET_FILE/);
    assert.match(productionDbOnly, /stock-insight-session-secret/);
    assert.match(productionDbOnly, /DATABASE_READ_URL/);
    assert.match(productionDbOnly, /DATABASE_WRITE_URL/);
  });
});
