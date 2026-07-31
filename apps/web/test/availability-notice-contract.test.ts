import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import type { WorkspaceAvailability } from '../src/shared/ui/workspace/availability-notice.tsx';

type AvailabilityNoticeModule = {
  AvailabilityNotice: ComponentType<{ availability: WorkspaceAvailability }>;
};

const componentUrl = new URL('../src/shared/ui/workspace/availability-notice.tsx', import.meta.url);
const webRoot = fileURLToPath(new URL('..', import.meta.url));

const availabilityValues = [
  'available',
  'collecting',
  'stale',
  'text_only',
  'partial',
  'error',
  'missing',
  'unsupported',
  'empty',
] as const satisfies readonly WorkspaceAvailability[];

async function loadAvailabilityNotice(): Promise<AvailabilityNoticeModule> {
  const server = await createServer({
    appType: 'custom',
    configFile: false,
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    root: webRoot,
    server: { hmr: false, middlewareMode: true, watch: null, ws: false },
  });

  try {
    return (await server.ssrLoadModule(
      '/src/shared/ui/workspace/availability-notice.tsx',
    )) as AvailabilityNoticeModule;
  } finally {
    await server.close();
  }
}

describe('AvailabilityNotice contract', () => {
  it('binds the prop to canonical workspace unions with an exhaustive switch', async () => {
    const source = await readFile(componentUrl, 'utf8');

    assert.equal(availabilityValues.length, 9);
    assert.match(source, /type \{ DataAvailability \} from '@stock-insight\/contracts'/);
    assert.match(source, /MarketComponentWatermark\['availability'\]/);
    assert.match(source, /switch \(availability\)/);
    assert.match(source, /return assertNeverAvailability\(availability\)/);
    assert.match(source, /case 'collecting':[\s\S]*새 데이터를 정리하고 있습니다/);
    assert.doesNotMatch(source, /availability:\s*string/);
  });

  it('preserves every user-visible state and rejects unknown runtime values', async () => {
    const { AvailabilityNotice } = await loadAvailabilityNotice();
    const render = (availability: WorkspaceAvailability) =>
      renderToStaticMarkup(createElement(AvailabilityNotice, { availability }));

    assert.equal(render('available'), '');
    assert.match(render('stale'), /data-kind="stale"[\s\S]*업데이트를 기다리는 데이터입니다/);
    assert.match(render('text_only'), /원문 연결이 제한되어 있습니다/);
    assert.match(render('partial'), /data-kind="partial"[\s\S]*일부 데이터만 확인됐습니다/);
    assert.match(render('error'), /data-kind="error"[\s\S]*데이터를 확인하지 못했습니다/);
    assert.match(
      render('missing'),
      /data-kind="unavailable"[\s\S]*현재 사용할 수 없는 데이터입니다/,
    );
    assert.match(render('unsupported'), /현재 사용할 수 없는 데이터입니다/);
    assert.match(render('empty'), /data-kind="empty"[\s\S]*아직 보여드릴 데이터가 없습니다/);
    assert.throws(
      () =>
        renderToStaticMarkup(
          createElement(AvailabilityNotice, {
            availability: 'unknown' as WorkspaceAvailability,
          }),
        ),
      /Unsupported workspace availability/,
    );
  });
});
