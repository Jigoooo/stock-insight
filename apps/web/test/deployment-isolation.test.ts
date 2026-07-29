import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

function read(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

function serviceBlock(manifest: string, service: string): string {
  const match = new RegExp(
    `^  ${service}:\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9_-]*:|^[a-z]|(?![\\s\\S]))`,
    'm',
  ).exec(manifest);
  assert.ok(match?.[0], `missing service block: ${service}`);
  return match![0];
}

type ProductionImageManifest = {
  api: { imageId: string; tag: string };
  app: { imageId: string; tag: string };
  formatVersion: number;
};

function assertProductionImagesBound(
  compose: string,
  expected: ProductionImageManifest,
): { api: string; app: string } {
  const imagePattern = /image: (sha256:[a-f0-9]{64})\n\s+pull_policy: never/;
  const api = imagePattern.exec(serviceBlock(compose, 'api'))?.[1];
  const app = imagePattern.exec(serviceBlock(compose, 'app'))?.[1];
  assert.ok(api);
  assert.ok(app);
  assert.equal(api, expected.api.imageId, 'production API image does not match release metadata');
  assert.equal(app, expected.app.imageId, 'production app image does not match release metadata');
  return { api: api!, app: app! };
}

const candidate = read('../../../docker-compose.candidate.yml');
const production = read('../../../docker-compose.prod.yml');
const productionDbOnly = read('../../../docker-compose.prod-db-auth.yml');
const releaseBuild = read('../../../docker-compose.release-build.yml');
const productionImageManifest = JSON.parse(
  read('../../../ops/release/production-image-manifest.json'),
) as ProductionImageManifest;
const dockerfile = read('../Dockerfile');
const apiDockerfile = read('../../api-server/Dockerfile');
const productionVerifier = read('../../../ops/scripts/verify-production-compose.sh');

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
    const api = serviceBlock(productionDbOnly, 'api');
    const app = serviceBlock(productionDbOnly, 'app');
    const { api: apiImage, app: appImage } = assertProductionImagesBound(
      productionDbOnly,
      productionImageManifest,
    );
    assert.notEqual(apiImage, appImage);
    assert.equal(productionImageManifest.formatVersion, 1);
    assert.equal(apiImage, productionImageManifest.api.imageId);
    assert.equal(appImage, productionImageManifest.app.imageId);
    assert.match(releaseBuild, new RegExp(`image: ${productionImageManifest.api.tag}`));
    assert.match(releaseBuild, new RegExp(`image: ${productionImageManifest.app.tag}`));
    assert.doesNotMatch(api, /^\s+build:/m);
    assert.doesNotMatch(app, /^\s+build:/m);
    assert.doesNotMatch(productionDbOnly, /STOCK_INSIGHT_(APP|API)_IMAGE/);
    assert.equal((productionDbOnly.match(/pull_policy: never/g) ?? []).length, 2);
    assert.doesNotMatch(productionDbOnly, /^\s+build:/m);
    assert.match(productionImageManifest.app.tag, /^stock-insight-app:[a-f0-9]{7}$/);
    assert.match(productionImageManifest.api.tag, /^stock-insight-api:[a-f0-9]{7}$/);
    assert.match(releaseBuild, /build:\s+context: \.\s+dockerfile: apps\/web\/Dockerfile/);
    assert.match(releaseBuild, /build:\s+context: \.\s+dockerfile: apps\/api-server\/Dockerfile/);
    for (const buildManifest of [dockerfile, apiDockerfile]) {
      const fromLines = buildManifest.match(/^FROM .+$/gm) ?? [];
      const externalNodeStages = fromLines.filter((line: string) => line.startsWith('FROM node:'));
      assert.equal(externalNodeStages.length, 2);
      assert.ok(externalNodeStages.every((line: string) => /@sha256:[a-f0-9]{64}/.test(line)));
    }
  });

  it('rejects a syntactically valid production digest that is not the release artifact', () => {
    const mutated = productionDbOnly.replace(
      productionImageManifest.api.imageId,
      `sha256:${'0'.repeat(64)}`,
    );
    assert.throws(
      () => assertProductionImagesBound(mutated, productionImageManifest),
      /production API image does not match release metadata/,
    );
  });

  it('derives the production verifier contract from canonical release metadata', () => {
    assert.match(productionVerifier, /production-image-manifest\.json/);
    assert.match(productionVerifier, /docker-compose\.release-build\.yml/);
    assert.match(productionVerifier, /manifest\[name\]/);
    assert.match(productionVerifier, /release\.imageId/);
    assert.match(productionVerifier, /release\.tag/);
    assert.match(productionVerifier, /docker["], \["image", "inspect"/);
    assert.doesNotMatch(productionVerifier, /sha256:[a-f0-9]{64}/);
  });

  it('provides a post-enrollment runtime with no bootstrap credential mounts', () => {
    assert.doesNotMatch(productionDbOnly, /AUTH_USERNAME|AUTH_PASSWORD|ENROLLMENT_TOKEN/);
    assert.match(productionDbOnly, /STOCK_INSIGHT_SESSION_SECRET_FILE/);
    assert.match(productionDbOnly, /stock-insight-session-secret/);
  });

  // P2/P3 brain split: the app container is a BFF with no database access at
  // all. Only the api (brain) container may carry a DSN or join the research
  // network; the app reaches the brain over the edge alias instead.
  it('keeps database credentials and the research network on the brain only', () => {
    const apiBlock = serviceBlock(productionDbOnly, 'api');
    const appBlock = serviceBlock(productionDbOnly, 'app');

    assert.match(apiBlock, /DATABASE_READ_URL/);
    assert.match(apiBlock, /research:/);

    assert.doesNotMatch(appBlock, /DATABASE_READ_URL|DATABASE_WRITE_URL/);
    assert.doesNotMatch(appBlock, /research:/);
    assert.match(appBlock, /STOCK_INSIGHT_BRAIN_URL/);
    // The app signs its own internal contexts, so it needs that secret — and
    // ONLY that secret plus the session key.
    assert.match(appBlock, /STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE/);
    assert.match(appBlock, /stock-insight-internal-context/);
  });

  // nginx is the only way in from the tunnel, so the brain hostname must be
  // routed there and confined to /v1/.
  it('routes the brain hostname through the edge with a narrowed surface', () => {
    const edgeConfig = read('../../../deploy/stock-edge/nginx.conf');
    assert.match(edgeConfig, /server_name insight-api\.jigooo\.com;/);
    assert.match(edgeConfig, /set \$stock_insight_brain stock-insight-api:6200;/);
    assert.match(edgeConfig, /location \/v1\/ \{/);
    // Anything outside /v1/ is refused, which keeps the api-server's
    // unauthenticated /health and /v1/meta off the public hostname.
    assert.match(edgeConfig, /location \/ \{\s*\n\s*return 404;/);
    // Edge-terminated Access credentials must not be forwarded to the brain.
    assert.match(edgeConfig, /proxy_set_header CF-Access-Client-Id "";/);
    assert.match(edgeConfig, /proxy_set_header CF-Access-Client-Secret "";/);

    // The brain must be reachable on the edge network under that alias.
    const apiBlock = serviceBlock(productionDbOnly, 'api');
    assert.match(apiBlock, /aliases:\s*\n\s*- stock-insight-api/);
  });
});
