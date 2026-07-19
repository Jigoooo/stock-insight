import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const inspectorUrl = new URL(
  '../src/pages/research-workspace/ui/evidence-inspector.tsx',
  import.meta.url,
);
const pageUrl = new URL(
  '../src/pages/research-workspace/ui/research-workspace-page.tsx',
  import.meta.url,
);
const cssUrl = new URL(
  '../src/pages/research-workspace/ui/research-workspace-page.module.css',
  import.meta.url,
);

describe('workspace overlay integration', () => {
  it('keeps the inspector owner mounted through exit with urgent focus and inert truth', async () => {
    const inspector = await readFile(inspectorUrl, 'utf8');

    assert.match(inspector, /useWorkspaceOverlayMotion/);
    assert.match(inspector, /open:\s*boolean/);
    assert.match(inspector, /if \(!transition\.rendered\) return null/);
    assert.match(inspector, /useFocusTrap\(renderModal && transition\.desiredOpen/);
    assert.match(inspector, /aria-hidden=\{!transition\.desiredOpen \|\| undefined\}/);
    assert.match(inspector, /inert=\{!transition\.desiredOpen \|\| undefined\}/);
    assert.match(inspector, /event\.key !== 'Escape'/);
    assert.match(inspector, /ref=\{scrimRef\}/);
    assert.match(inspector, /ref=\{inspectorRef\}/);
  });

  it('uses the shared overlay hook for mobile navigation and removes ad-hoc GSAP ownership', async () => {
    const page = await readFile(pageUrl, 'utf8');

    assert.match(page, /import \{ EvidenceInspector \} from '.\/evidence-inspector'/);
    assert.doesNotMatch(page, /function EvidenceInspector\(/);
    assert.match(page, /useWorkspaceOverlayMotion\(\{[\s\S]*?kind:\s*'drawer'/);
    assert.match(page, /ref=\{navigationScrimRef\}/);
    assert.match(page, /navTransition\.rendered/);
    assert.match(page, /open=\{inspectorVisible\}/);
    assert.doesNotMatch(page, /gsap\.(?:killTweensOf|set|to)\(navigation/);
  });

  it('uses plain dim scrims without backdrop blur', async () => {
    const css = await readFile(cssUrl, 'utf8');
    const mobileScrim = css.match(/\.scrim\s*\{([\s\S]*?)\}/g)?.join('\n') ?? '';

    assert.match(mobileScrim, /background:/);
    assert.doesNotMatch(mobileScrim, /backdrop-filter|blur\(/);
  });

  it('keeps the mobile drawer visibly open after GSAP context reverts', async () => {
    const css = await readFile(cssUrl, 'utf8');

    assert.match(
      css,
      /\.sidebar\[data-overlay-phase='open'\],[\s\S]*?\.sidebar\[data-overlay-phase='closing'\][\s\S]*?transform:\s*translateX\(0\)/,
    );
  });

  it('closes inspector semantics immediately and restores the desktop opener', async () => {
    const page = await readFile(pageUrl, 'utf8');

    assert.match(page, /issuedInspectorRecordKeysRef = useRef\(new Set<string>\(\)\)/);
    assert.match(page, /dismissedInspectorRecords\.has\(urlState\.record\)/);
    assert.match(page, /issuedInspectorRecordKeysRef\.current\.add\(item\.recordKey\)/);
    assert.match(page, /new Set\(issuedInspectorRecordKeysRef\.current\)/);
    assert.match(page, /inspectorOpenerRef\.current/);
    assert.match(page, /opener\?\.isConnected/);
    assert.match(page, /opener\.focus\(\)/);
  });
});
