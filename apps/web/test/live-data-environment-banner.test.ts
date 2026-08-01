import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { getLiveDataEnvironmentLabel } from '../src/shared/ui/live-data-environment/live-data-environment.ts';

const componentUrl = new URL(
  '../src/shared/ui/live-data-environment/live-data-environment-banner.tsx',
  import.meta.url,
);
const cssUrl = new URL(
  '../src/shared/ui/live-data-environment/live-data-environment.module.css',
  import.meta.url,
);
const rootUrl = new URL('../src/pages/root/ui/root.tsx', import.meta.url);

test('live data label is visible only for the explicit production-live build marker', () => {
  assert.equal(getLiveDataEnvironmentLabel(undefined), undefined);
  assert.equal(getLiveDataEnvironmentLabel('development'), undefined);
  assert.deepEqual(getLiveDataEnvironmentLabel('production-live'), {
    environment: '운영 DB',
    writeMode: '실제 쓰기',
  });
});

test('root mounts a persistent, non-interactive production data warning', async () => {
  const [component, css, root] = await Promise.all([
    readFile(componentUrl, 'utf8'),
    readFile(cssUrl, 'utf8'),
    readFile(rootUrl, 'utf8'),
  ]);
  assert.match(root, /<LiveDataEnvironmentBanner \/>/);
  assert.match(component, /<output/);
  assert.match(component, /운영 DB/);
  assert.match(component, /실제 쓰기/);
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /z-index:/);
});
