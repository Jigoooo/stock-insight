import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const hookUrl = new URL(
  '../src/pages/research-workspace/ui/use-workspace-relation-crossfade.ts',
  import.meta.url,
);
const themesUrl = new URL(
  '../src/pages/research-workspace/ui/views/themes-view.tsx',
  import.meta.url,
);
// Row feedback moved out of the page stylesheet in 1edcf81 ("워크스페이스 제품 UI
// 수렴") when tables became the shared DataTable/Table pair. The rule survived the
// move intact; only this pointer was left behind, so the assertion below had been
// matching an empty string and failing ever since. It reads the rule where it now
// lives rather than restoring the duplicate the refactor deleted.
const cssUrl = new URL('../src/shared/ui/table/table.module.css', import.meta.url);
const statusUrl = new URL(
  '../src/pages/research-workspace/ui/views/status-view.tsx',
  import.meta.url,
);

describe('workspace relation crossfade', () => {
  it('crossfades one scoped container with opacity and exactly 2px of offset', async () => {
    const source = await readFile(hookUrl, 'utf8');

    assert.match(source, /from 'motion\/react'/);
    assert.match(source, /useLayoutEffect/);
    assert.match(
      source,
      /const useBeforePaintEffect = typeof window === 'undefined' \? useEffect : useLayoutEffect/,
    );
    assert.match(source, /useBeforePaintEffect\(\(\) =>/);
    assert.match(source, /\banimate\(/);
    assert.match(source, /container\.style\.opacity = '0'/);
    assert.match(source, /container\.style\.transform = 'translateY\(2px\)'/);
    assert.match(source, /opacity:\s*1/);
    assert.match(source, /transform:\s*'translateY\(0px\)'/);
    assert.match(source, /duration:\s*0\.16/);
    assert.match(source, /removeProperty\('opacity'\)/);
    assert.match(source, /removeProperty\('transform'\)/);
    assert.match(source, /reducedMotion \|\| forcedColors/);
    assert.match(source, /\[normalizeMotion, scopeRef, stateKey\]/);
    assert.doesNotMatch(source, /@gsap\/react|from ['"]gsap['"]|useGSAP/);
    assert.doesNotMatch(source, /\buseEffect\(\(\) =>/);
    assert.doesNotMatch(
      source,
      /translateY\((?![02]px\))|querySelector|stagger|\by:|\bx:|scale|width:|height:/,
    );
  });

  it('keys the relation content by state and root without touching individual nodes', async () => {
    const source = await readFile(themesUrl, 'utf8');

    assert.match(source, /useWorkspaceRelationCrossfade\(/);
    assert.match(source, /stateKey:\s*`\$\{state\}:\$\{graph\?\.rootEntityKey \?\? 'none'\}`/);
    assert.match(source, /data-relation-motion="container"/);
    assert.doesNotMatch(source, /data-relation-motion="node"/);
  });

  it('keeps table feedback to background or border without row lift or number theatrics', async () => {
    const [css, status] = await Promise.all([
      readFile(cssUrl, 'utf8'),
      readFile(statusUrl, 'utf8'),
    ]);
    const hoverRule = css.match(/\.row:hover[^{]*\{([^}]*)\}/)?.[1] ?? '';

    // An empty match used to pass the doesNotMatch pair silently, so the rule has
    // to be proven present before its contents are judged.
    assert.notEqual(hoverRule.trim(), '', 'row hover feedback rule not found');
    assert.match(hoverRule, /background:/);
    assert.doesNotMatch(hoverRule, /transform|translate|scale/);
    assert.doesNotMatch(status, /NumberTicker|requestAnimationFrame|setInterval/);
  });
});
