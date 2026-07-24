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
const releaseBuild = read('../../../docker-compose.release-build.yml');
const dockerfile = read('../Dockerfile');
const apiDockerfile = read('../../api-server/Dockerfile');
const releaseImage = 'sha256:ba69de3a275b097055f939fb3263821aac3fed8e9837c822f183301403d5f4d8';
const apiReleaseImage = 'sha256:f207a1c18c116d6e4c08c565da710ece5fa8444686953c072bfb1969da0fd6cd';

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

  it('keeps production immutable and isolates fresh-host builds from deployment', () => {
    assert.match(production, /include:\s+- path: docker-compose\.prod-db-auth\.yml/);
    assert.match(production, /^name: stock-insight$/m);
    assert.doesNotMatch(production, /services:/);
    assert.ok(productionDbOnly.includes(`image: ${releaseImage}`));
    assert.ok(productionDbOnly.includes(`image: ${apiReleaseImage}`));
    assert.doesNotMatch(productionDbOnly, /STOCK_INSIGHT_(APP|API)_IMAGE/);
    assert.equal((productionDbOnly.match(/pull_policy: never/g) ?? []).length, 2);
    assert.doesNotMatch(productionDbOnly, /^\s+build:/m);
    assert.match(releaseBuild, /image: stock-insight-app:p1p6-380fb1cb/);
    assert.match(releaseBuild, /image: stock-insight-api:p1p6-380fb1cb/);
    assert.match(releaseBuild, /build:\s+context: \.\s+dockerfile: apps\/web\/Dockerfile/);
    assert.match(releaseBuild, /build:\s+context: \.\s+dockerfile: apps\/api-server\/Dockerfile/);
    for (const buildManifest of [dockerfile, apiDockerfile]) {
      const fromLines = buildManifest.match(/^FROM .+$/gm) ?? [];
      const externalNodeStages = fromLines.filter((line: string) => line.startsWith('FROM node:'));
      assert.equal(externalNodeStages.length, 2);
      assert.ok(externalNodeStages.every((line: string) => /@sha256:[a-f0-9]{64}/.test(line)));
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
