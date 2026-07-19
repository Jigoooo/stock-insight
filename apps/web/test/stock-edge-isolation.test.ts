import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const root = new URL('../../../', import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), 'utf8');
}

function serviceBlock(compose: string, name: string) {
  const lines = compose.split('\n');
  const start = lines.findIndex((line) => line === `  ${name}:`);
  assert.notEqual(start, -1, `missing compose service: ${name}`);
  const endOffset = lines.slice(start + 1).findIndex((line) => /^ {2}\S/.test(line));
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset;
  return lines.slice(start, end).join('\n');
}

describe('Stock Insight edge isolation', () => {
  it('owns a dedicated edge without duplicating the shared Cloudflare connector', async () => {
    const compose = await source('docker-compose.edge.yml');
    const edge = serviceBlock(compose, 'edge');

    assert.match(compose, /^name: stock-insight-edge$/m);
    assert.match(edge, /STOCK_INSIGHT_EDGE_IMAGE:-sha256:[a-f0-9]{64}/);
    assert.match(edge, /127\.0\.0\.1:\$\{STOCK_INSIGHT_EDGE_PORT:-8092\}:80/);
    assert.match(edge, /networks:\s*\n\s+stock-edge:\s*\n\s+aliases:\s*\n\s+- stock-insight-edge/);
    assert.match(edge, /read_only: true/);
    assert.match(edge, /\/var\/cache\/nginx/);
    assert.match(edge, /\/var\/run/);
    assert.match(edge, /no-new-privileges:true/);
    assert.match(edge, /healthcheck:/);
    assert.match(edge, /restart: unless-stopped/);
    assert.match(compose, /^    name: stock-insight-edge$/m);
    assert.doesNotMatch(compose, /cloudflared|TUNNEL_TOKEN|consulting-web|web:81/);
  });

  it('keeps the Stock edge uncached, origin-local, and free of Basic Auth', async () => {
    const [nginx, headers, dockerfile] = await Promise.all([
      source('deploy/stock-edge/nginx.conf'),
      source('deploy/stock-edge/security-headers.conf'),
      source('deploy/stock-edge/Dockerfile'),
    ]);

    assert.match(nginx, /listen 80;/);
    assert.match(nginx, /set \$stock_insight_upstream stock-insight-app:3000;/);
    assert.match(nginx, /proxy_pass http:\/\/\$stock_insight_upstream;/);
    assert.match(nginx, /limit_req_zone \$binary_remote_addr zone=stock_connector/);
    assert.match(nginx, /limit_req_zone \$stock_client_ip zone=stock_client/);
    assert.match(nginx, /limit_req zone=stock_connector/);
    assert.match(nginx, /limit_req zone=stock_client/);
    assert.match(nginx, /X-Real-IP \$stock_client_ip/);
    assert.match(nginx, /X-Stock-Client-IP \$stock_client_ip/);
    assert.match(
      nginx,
      /Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, no-transform"/,
    );
    assert.doesNotMatch(nginx, /auth_basic|consulting/);
    assert.match(headers, /Content-Security-Policy/);
    assert.doesNotMatch(headers, /cloudflareinsights|static\.cloudflareinsights/);
    assert.match(dockerfile, /^FROM nginx:[^\s]+@sha256:[a-f0-9]{64}$/m);
  });

  it('moves both Stock app auth modes off the consulting network', async () => {
    const manifests = await Promise.all([
      source('docker-compose.prod.yml'),
      source('docker-compose.prod-db-auth.yml'),
    ]);

    for (const manifest of manifests) {
      const app = serviceBlock(manifest, 'app');
      assert.match(
        app,
        /networks:\s*\n\s+edge:\s*\n\s+aliases:\s*\n\s+- stock-insight-app\s*\n\s+research:/,
      );
      assert.match(manifest, /^    name: stock-insight-edge$/m);
      assert.doesNotMatch(manifest, /consulting-web_default/);
    }
  });
});
