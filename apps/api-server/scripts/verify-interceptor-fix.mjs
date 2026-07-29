// Live proof that controller-backed routes no longer 500.
// Boots the real Nest app in-process; asserts an authenticated data route gets
// past the interceptor. Any status other than 500 proves the stream contract is
// intact (the DB may legitimately answer 401/503 depending on credentials).
import { createHmac } from 'node:crypto';

import { createApp } from '../dist/index.js';

const SECRET = 'x'.repeat(48);
const USER_ID = '11111111-2222-4333-8444-555555555555';

function sign(method, path) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 60;
  const mac = createHmac('sha256', Buffer.from(SECRET, 'utf8'))
    .update('stock-insight:internal-user-context:v1\0', 'utf8')
    .update(USER_ID, 'utf8')
    .update('\0', 'utf8')
    .update(String(iat), 'utf8')
    .update('\0', 'utf8')
    .update(String(exp), 'utf8')
    .update('\0', 'utf8')
    .update(method.toUpperCase(), 'utf8')
    .update('\0', 'utf8')
    .update(path, 'utf8')
    .digest('base64url');
  return `${USER_ID}.${iat}.${exp}.${mac}`;
}

const app = await createApp({ internalContextSecret: SECRET });
await app.init();
const server = app.getHttpAdapter().getInstance();

const results = [];
for (const [method, path, expectPublic] of [
  ['GET', '/health', true],
  ['GET', '/v1/meta', true],
  ['GET', '/v1/stocks', false],
  ['GET', '/v1/dashboard/today', false],
  ['GET', '/v1/workspace', false],
  ['GET', '/v1/status', false],
]) {
  const headers = { 'content-type': 'application/json' };
  if (!expectPublic) headers['x-internal-user-context'] = sign(method, path);
  const r = await server.inject({ method, url: path, headers });
  const pass = r.statusCode !== 500;
  results.push(pass);
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${method} ${path} → ${r.statusCode} (must not be 500)  ${r.body.slice(0, 90)}`,
  );
}

await app.close();

const failed = results.filter((p) => !p).length;
console.log(`\n${results.length - failed}/${results.length} routes escaped the 500 trap`);
process.exit(failed === 0 ? 0 : 1);
