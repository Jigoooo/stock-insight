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
const cssUrl = new URL(
  '../src/pages/research-workspace/ui/research-workspace-page.module.css',
  import.meta.url,
);
const statusUrl = new URL(
  '../src/pages/research-workspace/ui/views/status-view.tsx',
  import.meta.url,
);

describe('workspace relation crossfade', () => {
  it('crossfades one scoped container with opacity only', async () => {
    const source = await readFile(hookUrl, 'utf8');

    assert.match(source, /useGSAP/);
    assert.match(source, /scope:\s*scopeRef/);
    assert.match(source, /dependencies:\s*\[normalizeMotion, stateKey\]/);
    assert.match(source, /opacity:\s*0/);
    assert.match(source, /opacity:\s*1/);
    assert.match(source, /duration:\s*0\.16/);
    assert.match(source, /clearProps:\s*'opacity'/);
    assert.match(source, /reducedMotion \|\| forcedColors/);
    assert.doesNotMatch(source, /querySelector|stagger|\by:|\bx:|scale|width:|height:/);
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
    const hoverRule = css.match(/\.tableWrap tbody tr:hover td\s*\{([^}]*)\}/)?.[1] ?? '';

    assert.match(hoverRule, /background:/);
    assert.doesNotMatch(hoverRule, /transform|translate|scale/);
    assert.doesNotMatch(status, /NumberTicker|requestAnimationFrame|setInterval/);
  });
});
