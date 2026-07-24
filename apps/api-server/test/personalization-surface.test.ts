import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const controllerUrl = new URL(
  '../src/personalization/personalization.controller.ts',
  import.meta.url,
);
const serviceUrl = new URL('../src/personalization/personalization.service.ts', import.meta.url);
const moduleUrl = new URL('../src/app.module.ts', import.meta.url);

test('P4-C personalization routes stay authenticated, read-only except thesis POST, and order-free', async () => {
  const [controller, service, appModule] = await Promise.all([
    readFile(controllerUrl, 'utf8'),
    readFile(serviceUrl, 'utf8'),
    readFile(moduleUrl, 'utf8'),
  ]);

  for (const route of [
    "@Get('portfolio-snapshot')",
    "@Get('portfolio-impact')",
    "@Get('decision-support/:securityKey')",
    "@Get('decision-history/:securityKey')",
    "@Get('thesis/:securityKey')",
    "@Post('thesis/:securityKey')",
  ]) {
    assert.match(controller, new RegExp(route.replace(/[()]/g, '\\$&')));
  }
  assert.match(controller, /@Controller\('personalization'\)/);
  assert.match(controller, /researchContext\(\)/);
  assert.match(service, /requireRequestUserScope\(\)/);
  assert.match(service, /claimMutation/);
  assert.match(service, /completeMutation/);
  assert.match(service, /withTransaction/);
  assert.doesNotMatch(`${controller}\n${service}`, /placeOrder|executeOrder|broker|매수|매도/);
  assert.match(appModule, /PersonalizationController/);
});
