import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = async (path: string) =>
  readFile(new URL(`../src/${path}`, import.meta.url), 'utf8').catch(() => '');

describe('shared Sonner toast system', () => {
  it('uses custom unstyled Sonner JSX for all four layouts', async () => {
    const [host, appToast] = await Promise.all([
      read('shared/ui/toast/motion-toast.tsx'),
      read('shared/ui/toast/app-toast.tsx'),
    ]);

    assert.match(host, /toast\.custom/);
    assert.match(host, /unstyled:\s*true/);
    assert.match(appToast, /kind:\s*ToastKind/);
    assert.match(appToast, /data-kind=\{kind\}/);
    for (const kind of ['status', 'action', 'progress', 'critical']) {
      assert.match(appToast, new RegExp(`data-kind=\\{kind\\}|${kind}`));
    }
    assert.doesNotMatch(host + appToast, /toneRail/);
  });

  it('owns a clear two-pixel surface and stable icon/action columns', async () => {
    const css = await read('shared/ui/toast/toast.module.css');

    assert.match(css, /border:\s*2px solid/);
    assert.match(css, /--toast-icon-size:\s*18px/);
    assert.match(css, /grid-template-columns:[^;]*var\(--toast-icon-size\)[^;]*minmax\(0, 1fr\)/);
    assert.match(css, /\.action\s*\{/);
    assert.match(css, /\.close\s*\{/);
    assert.doesNotMatch(css, /toneRail|border-left/);
  });

  it('exports a stable progress controller and compatible notify methods', async () => {
    const [controller, notify] = await Promise.all([
      read('shared/ui/toast/toast-controller.ts'),
      read('shared/ui/toast/notify.ts'),
    ]);

    assert.match(controller, /export type ProgressToastController/);
    assert.match(controller, /success:\s*\(title: ReactNode, description\?: ReactNode\)/);
    assert.match(controller, /error:\s*\(title: ReactNode, description\?: ReactNode\)/);
    for (const method of [
      'message',
      'success',
      'info',
      'warning',
      'error',
      'loading',
      'action',
      'progress',
      'dismiss',
    ]) {
      assert.match(notify, new RegExp(`${method}:`));
    }
  });
});
