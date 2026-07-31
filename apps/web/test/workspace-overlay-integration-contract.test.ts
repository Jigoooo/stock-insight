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
const shellUrl = new URL('../src/widgets/workspace-shell/ui/workspace-shell.tsx', import.meta.url);
const topbarUrl = new URL(
  '../src/widgets/workspace-shell/ui/workspace-topbar.tsx',
  import.meta.url,
);
const shellCssUrl = new URL(
  '../src/widgets/workspace-shell/ui/workspace-shell.module.css',
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
    assert.match(inspector, /previousFocus\?\.isConnected/);
    assert.match(inspector, /previousFocus\.focus\(\)/);
    assert.match(inspector, /ref=\{scrimRef\}/);
    assert.match(inspector, /ref=\{inspectorRef\}/);
  });

  it('uses the shared Sheet for mobile navigation and removes ad-hoc GSAP ownership', async () => {
    const [page, shell, topbar] = await Promise.all([
      readFile(pageUrl, 'utf8'),
      readFile(shellUrl, 'utf8'),
      readFile(topbarUrl, 'utf8'),
    ]);

    assert.match(page, /import \{ EvidenceInspector \} from '.\/evidence-inspector'/);
    assert.doesNotMatch(page, /function EvidenceInspector\(/);
    assert.match(shell, /<Sheet[\s\S]*?open=\{mobileOpen\}/);
    assert.match(shell, /<SheetContent[\s\S]*?side="left"/);
    assert.match(topbar, /<SheetTrigger asChild>/);
    assert.match(shell, /dispatch\(\{ type: 'set-mobile-open', open \}\)/);
    assert.match(page, /open=\{inspectorVisible\}/);
    assert.doesNotMatch(shell, /gsap\.(?:killTweensOf|set|to)\(navigation/);
  });

  it('keeps approved branding and authenticated actions available in every mode', async () => {
    const [shell, topbar, shellCss] = await Promise.all([
      readFile(shellUrl, 'utf8'),
      readFile(topbarUrl, 'utf8'),
      readFile(shellCssUrl, 'utf8'),
    ]);

    assert.match(shell, /<span className=\{styles\.brandMark\}>SI<\/span>/);
    assert.match(shell, /<strong>Stock Insight<\/strong>/);
    assert.doesNotMatch(shell, />FI<|>Futur Insight</);
    assert.match(shell, /data-testid="workspace-mobile-actions"/);
    assert.match(shell, /\{contextualActions\}/);
    assert.match(shell, /<WorkspaceLogoutAction/);
    assert.match(topbar, /mode !== 'mobile'/);
    assert.match(shellCss, /\.mobileActions\s*\{/);
    const contextualActions = shellCss.match(/\.contextualActions\s*\{[^}]*\}/)?.[0] ?? '';
    assert.doesNotMatch(contextualActions, /display:\s*none/);
  });

  it('uses the approved regular action scale while controls remain non-scaling', async () => {
    const topbar = await readFile(topbarUrl, 'utf8');

    assert.match(topbar, /function WorkspaceLogoutAction/);
    assert.match(topbar, /hoverScale=\{1\.01\}/);
    assert.match(topbar, /tapScale=\{0\.985\}/);
    assert.match(topbar, /<IconButton[\s\S]*?motion="quiet"/);
    assert.doesNotMatch(topbar, /로그아웃[\s\S]{0,240}motion="quiet"/);
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
