import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const surfaceUrl = new URL('../src/shared/ui/primitives/surface.tsx', import.meta.url);
const feedbackUrl = new URL('../src/shared/ui/primitives/feedback.tsx', import.meta.url);
const primitivesCssUrl = new URL(
  '../src/shared/ui/primitives/primitives.module.css',
  import.meta.url,
);
const toastUrl = new URL('../src/shared/ui/toast/motion-toast.tsx', import.meta.url);
const toastCssUrl = new URL('../src/shared/ui/toast/motion-toast.module.css', import.meta.url);

const adoptionUrls = [
  new URL('../src/routes/_authenticated/workspace.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/research-workspace-page.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/stock-deep-dive-panel.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/market-overview-panel.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/geo-market-map.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/relation-sigma-graph.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/views/stocks-view.tsx', import.meta.url),
  new URL('../src/pages/admin-invitations/ui/admin-invitation-page.tsx', import.meta.url),
];

describe('Task 4 shared feedback and surface contract', () => {
  it('exposes explicit SaaS-style anatomy on every feedback and surface primitive', async () => {
    const [surface, feedback, toast] = await Promise.all([
      readFile(surfaceUrl, 'utf8'),
      readFile(feedbackUrl, 'utf8'),
      readFile(toastUrl, 'utf8'),
    ]);

    assert.match(surface, /data-slot="card-root"/);
    assert.match(feedback, /data-slot="status-badge-root"/);
    assert.match(feedback, /data-slot="status-badge-label"/);
    assert.match(feedback, /data-slot="data-quality-root"/);
    assert.match(feedback, /data-slot="data-quality-trigger"/);
    assert.match(feedback, /data-slot="data-quality-content"/);
    assert.match(feedback, /data-slot="feedback-root"/);
    assert.match(feedback, /data-slot="feedback-content"/);
    assert.match(feedback, /data-slot="skeleton-root"/);
    assert.match(toast, /data-slot="toast-root"/);
    assert.match(toast, /data-slot="toast-indicator"/);
    assert.match(toast, /data-slot="toast-content"/);
    assert.match(toast, /data-slot="toast-title"/);
    assert.match(toast, /data-slot="toast-description"/);
    assert.match(toast, /data-slot="toast-close"/);
  });

  it('uses the local Motion foundation for surface, feedback, and disclosure presence', async () => {
    const [surface, feedback] = await Promise.all([
      readFile(surfaceUrl, 'utf8'),
      readFile(feedbackUrl, 'utf8'),
    ]);

    assert.match(surface, /import \{ Effect \}/);
    assert.match(surface, /<Effect\b/);
    assert.match(feedback, /import \{ Effect, PresenceRegion \}/);
    assert.match(feedback, /<Effect\b/);
    assert.match(feedback, /<PresenceRegion\b/);
    assert.doesNotMatch(surface + feedback, /MotionRegion/);
  });

  it('keeps surface depth restrained and feedback styling semantic', async () => {
    const [primitivesCss, toastCss] = await Promise.all([
      readFile(primitivesCssUrl, 'utf8'),
      readFile(toastCssUrl, 'utf8'),
    ]);

    assert.match(primitivesCss, /:where\(\.card\)/);
    assert.match(primitivesCss, /var\(--color-surface\)/);
    assert.match(primitivesCss, /color-mix\(in srgb, var\(--color-border\)/);
    assert.doesNotMatch(primitivesCss, /\.card\s*\{[^}]*var\(--shadow-panel\)/s);
    assert.doesNotMatch(toastCss, /backdrop-filter:/);
    assert.match(toastCss, /var\(--color-surface\)/);
  });

  it('adopts shared controls and shared feedback surfaces at direct product call sites', async () => {
    const sources = await Promise.all(adoptionUrls.map((url) => readFile(url, 'utf8')));
    const rawControls = sources.flatMap((source, index) =>
      [...source.matchAll(/<(button|input|textarea|select)\b/g)].map(
        (match) => `${adoptionUrls[index]?.pathname}:${match[1]}`,
      ),
    );
    const combined = sources.join('\n');

    assert.deepEqual(rawControls, []);
    assert.match(combined, /<ErrorState\b/);
    assert.match(combined, /<EmptyState\b/);
    assert.match(combined, /<Skeleton\b/);
  });
});
