import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const inspectorUrl = new URL(
  '../src/pages/research-workspace/ui/evidence-inspector.tsx',
  import.meta.url,
);
const inspectorFrameUrl = new URL(
  '../src/pages/research-workspace/ui/detail-inspector-frame.tsx',
  import.meta.url,
);
const pageUrl = new URL(
  '../src/pages/research-workspace/ui/research-workspace-page.tsx',
  import.meta.url,
);
const dialogCssUrl = new URL('../src/shared/ui/dialog/dialog.module.css', import.meta.url);
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
  it('delegates inspector presence, focus, escape, and modal truth to shared Dialog', async () => {
    const [inspector, inspectorFrame, shellCss] = await Promise.all([
      readFile(inspectorUrl, 'utf8'),
      readFile(inspectorFrameUrl, 'utf8'),
      readFile(shellCssUrl, 'utf8'),
    ]);

    assert.match(inspector, /open:\s*boolean/);
    assert.match(inspector, /<DetailInspectorFrame/);
    assert.match(inspectorFrame, /<Dialog\s+modal\s/);
    assert.match(inspectorFrame, /<DialogContent/);
    assert.match(inspectorFrame, /data-inspector-presentation/);
    assert.match(inspectorFrame, /\bportalled\b/);
    assert.match(
      inspectorFrame,
      /!mobile && desktopPresentation === 'modal' \? 'modal' : 'inspector'/,
    );
    assert.match(inspectorFrame, /\bshowOverlay\s/);
    assert.match(inspectorFrame, /motionPreset="quick"/);
    assert.match(inspectorFrame, /overlayTone="light"/);
    assert.doesNotMatch(inspectorFrame, /onPointerDownOutside=/);
    assert.match(inspectorFrame, /<Button[\s\S]*?넓게 보기[\s\S]*?옆에서 보기/);
    assert.doesNotMatch(inspectorFrame, /<IconButton/);
    assert.doesNotMatch(shellCss, /shell:has\(> \[data-testid='evidence-inspector'\]\)/);
    assert.doesNotMatch(inspectorFrame, /useFocusTrap|useWorkspaceOverlayMotion|<dialog\b/);
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
    const css = await readFile(dialogCssUrl, 'utf8');
    const mobileScrim = css.match(/\.overlay\s*\{([\s\S]*?)\}/)?.[0] ?? '';

    assert.match(mobileScrim, /background:/);
    assert.doesNotMatch(mobileScrim, /backdrop-filter|blur\(/);
  });

  it('delegates the mobile drawer presence state to the official Sheet', async () => {
    const shell = await readFile(shellUrl, 'utf8');

    assert.match(shell, /<Sheet[\s\S]*?open=\{mobileOpen\}/);
    assert.match(shell, /<SheetContent[\s\S]*?side="left"/);
    assert.doesNotMatch(shell, /data-overlay-phase/);
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
