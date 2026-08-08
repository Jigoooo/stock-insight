import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { selectWorkspaceAppendedKeys } from '../src/pages/research-workspace/model/workspace-append-reveal.ts';

const hookUrl = new URL(
  '../src/pages/research-workspace/ui/use-workspace-append-reveal.ts',
  import.meta.url,
);

describe('workspace append reveal', () => {
  it('selects only newly appended keys in current order and caps decoration at five', () => {
    assert.deepEqual(
      selectWorkspaceAppendedKeys(['a', 'b'], ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']),
      ['c', 'd', 'e', 'f', 'g'],
    );
    assert.deepEqual(selectWorkspaceAppendedKeys(['a', 'b'], ['b', 'a']), []);
    assert.deepEqual(selectWorkspaceAppendedKeys(['a'], ['a', 'b', 'b', 'c']), ['b', 'c']);
  });

  it('uses one scoped bounded reveal without scale or layout animation', async () => {
    const source = await readFile(hookUrl, 'utf8');

    assert.match(source, /from 'motion\/react'/);
    assert.match(source, /useLayoutEffect/);
    assert.match(
      source,
      /const useBeforePaintEffect = typeof window === 'undefined' \? useEffect : useLayoutEffect/,
    );
    assert.match(source, /useBeforePaintEffect\(\(\) =>/);
    assert.match(source, /\banimate\(/);
    assert.match(source, /\bstagger\(0\.025\)/);
    assert.match(source, /selectWorkspaceAppendedKeys\([^)]*,[^)]*,\s*5\)/);
    assert.match(source, /element\.style\.opacity = '0'/);
    assert.match(source, /element\.style\.transform = 'translateY\(6px\)'/);
    assert.match(source, /opacity:\s*1/);
    assert.match(source, /y:\s*0/);
    assert.match(source, /duration:\s*0\.18/);
    assert.match(source, /removeProperty\('opacity'\)/);
    assert.match(source, /removeProperty\('transform'\)/);
    assert.match(source, /reducedMotion \|\| forcedColors/);
    assert.doesNotMatch(source, /@gsap\/react|from ['"]gsap['"]|useGSAP/);
    assert.doesNotMatch(source, /\buseEffect\(\(\) =>/);
    assert.doesNotMatch(source, /scale|width:|height:|left:|top:/);
  });

  it('resets the baseline when lane or collection identity changes', async () => {
    const source = await readFile(hookUrl, 'utf8');

    assert.match(source, /previous\.resetKey !== resetKey/);
    assert.match(source, /previousRef\.current = \{ keys: currentKeys, resetKey \}/);
  });

  it('integrates only with appendable Today, Radar, and History row owners', async () => {
    const sources = await Promise.all([
      readFile(
        new URL('../src/pages/research-workspace/ui/views/today-view.tsx', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL(
          '../src/pages/research-workspace/ui/market-connection-sections.tsx',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL('../src/pages/research-workspace/ui/views/history-view.tsx', import.meta.url),
        'utf8',
      ),
    ]);

    for (const source of sources) {
      assert.match(source, /useWorkspaceAppendReveal\(/);
      assert.match(source, /data-append-key=/);
    }
    assert.match(sources[0] ?? '', /resetKey:\s*lane/);
  });
});
