import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const surfaceUrl = new URL('../src/shared/ui/card/card.tsx', import.meta.url);
const feedbackUrl = new URL('../src/shared/ui/feedback/feedback.tsx', import.meta.url);
const surfaceCssUrl = new URL('../src/shared/ui/card/card.module.css', import.meta.url);
const feedbackCssUrl = new URL('../src/shared/ui/feedback/feedback.module.css', import.meta.url);
const toastUrl = new URL('../src/shared/ui/toast/app-toast.tsx', import.meta.url);
const toastCssUrl = new URL('../src/shared/ui/toast/toast.module.css', import.meta.url);

const adoptionUrls = [
  new URL('../src/routes/_authenticated/workspace.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/research-workspace-page.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/stock-briefing-inspector.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/market-exploration.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/geo-market-map.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/relation-sigma-graph.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/views/stocks-view.tsx', import.meta.url),
  new URL('../src/pages/admin-invitations/ui/admin-invitation-page.tsx', import.meta.url),
];

const feedbackSurfaceInventory = [
  {
    className: 'viewLoadError',
    ownerPattern: '<ErrorState[\\s\\S]{0,220}?className=\\{styles\\.viewLoadError\\}',
    url: new URL('../src/pages/research-workspace/ui/research-workspace-page.tsx', import.meta.url),
  },
  {
    className: 'graphRuntimeError',
    ownerPattern: '<ErrorState[\\s\\S]{0,220}?className=\\{styles\\.graphRuntimeError\\}',
    url: new URL('../src/pages/research-workspace/ui/relation-sigma-graph.tsx', import.meta.url),
  },
  {
    className: 'emptyState',
    ownerPattern:
      '<WorkspaceState[\\s\\S]{0,220}?className=\\{styles\\.emptyState\\}[\\s\\S]{0,120}?kind="empty"',
    url: new URL('../src/pages/admin-invitations/ui/admin-invitation-page.tsx', import.meta.url),
  },
] as const;

function matchCount(source: string, pattern: RegExp) {
  return [...source.matchAll(pattern)].length;
}

describe('Task 4 shared feedback and surface contract', () => {
  it('exposes explicit SaaS-style anatomy on every feedback and surface primitive', async () => {
    const [surface, feedback, toast] = await Promise.all([
      readFile(surfaceUrl, 'utf8'),
      readFile(feedbackUrl, 'utf8'),
      readFile(toastUrl, 'utf8'),
    ]);

    assert.match(surface, /data-slot="card"/);
    assert.match(surface, /data-slot="card-header"/);
    assert.match(surface, /data-slot="card-content"/);
    assert.match(feedback, /data-slot="status-badge-root"/);
    assert.match(feedback, /data-slot="status-badge-label"/);
    assert.match(feedback, /data-slot="data-quality-root"/);
    assert.match(feedback, /data-slot="data-quality-trigger"/);
    assert.match(feedback, /data-slot="data-quality-content"/);
    assert.match(feedback, /data-slot="feedback-root"/);
    assert.match(feedback, /data-slot="feedback-content"/);
    assert.match(feedback, /data-slot="skeleton-root"/);
    assert.match(toast, /data-slot="toast-root"/);
    assert.match(toast, /data-slot="toast-icon"/);
    assert.match(toast, /data-slot="toast-content"/);
    assert.match(toast, /data-slot="toast-title"/);
    assert.match(toast, /data-slot="toast-description"/);
    assert.match(toast, /data-slot="toast-close"/);
  });

  it('keeps card geometry stable and uses the local Motion foundation for feedback presence', async () => {
    const [surface, feedback] = await Promise.all([
      readFile(surfaceUrl, 'utf8'),
      readFile(feedbackUrl, 'utf8'),
    ]);

    assert.match(surface, /data-variant=\{variant\}/);
    assert.doesNotMatch(surface, /whileHover|whileTap|layoutId/);
    assert.match(feedback, /import \{ Effect, PresenceRegion \}/);
    assert.match(feedback, /<Effect\b/);
    assert.match(feedback, /<PresenceRegion\b/);
    assert.doesNotMatch(surface + feedback, /MotionRegion/);
  });

  it('keeps native root event semantics outside the non-interactive Motion visual layer', async () => {
    const [surface, feedback] = await Promise.all([
      readFile(surfaceUrl, 'utf8'),
      readFile(feedbackUrl, 'utf8'),
    ]);

    assert.match(surface, /const Component = selectable \? 'button' : 'div'/);
    assert.match(surface, /<Component[\s\S]*\{\.\.\.props\}[\s\S]*data-slot="card"/);
    assert.match(feedback, /<span[\s\S]*data-slot="status-badge-root"/);
    assert.match(feedback, /<div[\s\S]*\{\.\.\.props\}[\s\S]*data-slot="feedback-root"/);
    assert.match(feedback, /data-slot="feedback-visual"/);
    assert.match(feedback, /data-slot="skeleton-visual"/);
    assert.doesNotMatch(surface + feedback, /props as EffectProps/);
  });

  it('keeps surface depth restrained and feedback styling semantic', async () => {
    const [surfaceCss, feedbackCss, toastCss] = await Promise.all([
      readFile(surfaceCssUrl, 'utf8'),
      readFile(feedbackCssUrl, 'utf8'),
      readFile(toastCssUrl, 'utf8'),
    ]);

    assert.match(surfaceCss, /\.card\s*\{/);
    assert.match(surfaceCss, /var\(--color-surface\)/);
    assert.match(feedbackCss, /color-mix\(in srgb, var\(--color-border\)/);
    assert.doesNotMatch(surfaceCss, /\.card\s*\{[^}]*var\(--shadow-panel\)/s);
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
    assert.deepEqual(rawControls, []);
  });

  it('accounts for every page-local feedback surface with a shared primitive owner', async () => {
    for (const { className, ownerPattern, url } of feedbackSurfaceInventory) {
      const source = await readFile(url, 'utf8');
      const references = matchCount(
        source,
        new RegExp(`className=\\{styles\\.${className}\\}`, 'g'),
      );
      const sharedOwners = matchCount(source, new RegExp(ownerPattern, 'g'));

      assert.ok(references > 0, `${url.pathname}:${className} must remain inventoried`);
      assert.equal(
        sharedOwners,
        references,
        `${url.pathname}:${className} must be owned by its inventoried shared feedback primitive`,
      );
    }

    const [workspaceState, inspector, stockInspector] = await Promise.all([
      readFile(new URL('../src/shared/ui/workspace/workspace-state.tsx', import.meta.url), 'utf8'),
      readFile(
        new URL('../src/pages/research-workspace/ui/evidence-inspector.tsx', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../src/pages/research-workspace/ui/stock-briefing-inspector.tsx', import.meta.url),
        'utf8',
      ),
    ]);
    assert.match(workspaceState, /<Skeleton\b/);
    assert.match(inspector, /<WorkspaceState\b/);
    assert.match(stockInspector, /<WorkspaceState\b/);
  });
});
