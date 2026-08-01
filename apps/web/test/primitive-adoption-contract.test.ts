import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import ts from 'typescript';

const buttonUrl = new URL('../src/shared/ui/button/button.tsx', import.meta.url);
const buttonCssUrl = new URL('../src/shared/ui/button/button.module.css', import.meta.url);
const animateButtonPrimitiveUrl = new URL(
  '../src/shared/ui/animate-ui/primitives/buttons/button.tsx',
  import.meta.url,
);
const motionButtonUrl = new URL('../src/shared/ui/motion/motion-button.tsx', import.meta.url);
const controlsUrl = new URL('../src/shared/ui/primitives/controls.tsx', import.meta.url);
const switchUrl = new URL('../src/shared/ui/switch/switch.tsx', import.meta.url);
const checkboxUrl = new URL('../src/shared/ui/checkbox/checkbox.tsx', import.meta.url);
const toggleGroupUrl = new URL('../src/shared/ui/toggle-group/toggle-group.tsx', import.meta.url);
const formUrl = new URL('../src/shared/ui/primitives/form.tsx', import.meta.url);
const linkUrl = new URL('../src/shared/ui/link/link.tsx', import.meta.url);
const linkCssUrl = new URL('../src/shared/ui/link/link.module.css', import.meta.url);
const segmentedTabsUrl = new URL('../src/shared/ui/primitives/segmented-tabs.tsx', import.meta.url);
const selectBoxUrl = new URL('../src/shared/ui/select/select.tsx', import.meta.url);
const comboboxUrl = new URL('../src/shared/ui/combobox/combobox.tsx', import.meta.url);
const authInputFieldUrl = new URL('../src/pages/auth/auth-input-field.tsx', import.meta.url);
const authCssUrl = new URL('../src/pages/auth/auth-page.module.css', import.meta.url);
const rootPackageUrl = new URL('../../../package.json', import.meta.url);
const targetUrls = [
  new URL('../src/routes/_authenticated/workspace.tsx', import.meta.url),
  new URL('../src/shared/ui/toast/motion-toast.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/research-workspace-page.tsx', import.meta.url),
  new URL('../src/pages/auth/signup-page.tsx', import.meta.url),
  new URL('../src/pages/auth/login-page.tsx', import.meta.url),
  authInputFieldUrl,
  new URL('../src/entities/stock/ui/stock-detail.tsx', import.meta.url),
];
const legacyMotionRecipeUrls = targetUrls.filter(
  (url) => !url.pathname.includes('/src/pages/auth/'),
);
const researchWorkspaceUrls = [
  new URL('../src/pages/research-workspace/ui/research-workspace-page.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/market-overview-panel.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/stock-deep-dive-panel.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/evidence-inspector.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/geo-market-map.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/workspace-search.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/views/today-view.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/views/radar-view.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/views/stocks-view.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/views/crypto-workspace-view.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/views/themes-view.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/views/my-research-view.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/views/history-view.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/views/status-view.tsx', import.meta.url),
  new URL('../src/shared/ui/workspace/data-table.tsx', import.meta.url),
  new URL('../src/shared/ui/workspace/panel.tsx', import.meta.url),
  new URL('../src/shared/ui/workspace/structured-list.tsx', import.meta.url),
];
const researchWorkspaceStyleUrls = [
  new URL('../src/pages/research-workspace/ui/research-workspace-page.module.css', import.meta.url),
  new URL('../src/pages/research-workspace/ui/relation-detail.module.css', import.meta.url),
];

function missingMotionRecipes(source: string, fileName: string) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const components = new Set(['Button', 'IconButton', 'TextLink']);
  const allowedRecipes = new Set(['pressable', 'quiet', 'none']);
  const missing: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const component = node.tagName.getText(sourceFile);
      if (components.has(component)) {
        const motion = node.attributes.properties.find(
          (attribute): attribute is ts.JsxAttribute =>
            ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === 'motion',
        );
        const validStringRecipe =
          motion?.initializer &&
          ts.isStringLiteral(motion.initializer) &&
          allowedRecipes.has(motion.initializer.text);
        const validExpression =
          motion?.initializer &&
          ts.isJsxExpression(motion.initializer) &&
          motion.initializer.expression !== undefined;
        if (!validStringRecipe && !validExpression) missing.push(`${fileName}:${component}`);
      }
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return missing;
}

describe('shared primitive adoption contract', () => {
  it('keeps research workspace composition on canonical shared UI boundaries', async () => {
    const sources = await Promise.all(researchWorkspaceUrls.map((url) => readFile(url, 'utf8')));
    const styles = await Promise.all(
      researchWorkspaceStyleUrls.map((url) => readFile(url, 'utf8')),
    );

    for (const source of sources) {
      assert.doesNotMatch(source, /@\/shared\/ui\/(?:primitives|animate-ui)(?:\/|['"])/);
    }
    for (const style of styles) {
      assert.doesNotMatch(
        style,
        /\.button:active|input:focus(?:-visible|-within)?|\[role=['"]option['"]\]|\[data-slot=['"](?:toast|dialog)/,
      );
    }
  });

  it('keeps native public control prop signatures on a compile-time fixture gate', async () => {
    const packageJson = JSON.parse(await readFile(rootPackageUrl, 'utf8')) as {
      scripts?: Record<string, string>;
    };

    assert.equal(
      packageJson.scripts?.['typecheck:controls:fixture'],
      'tsc -p e2e/fixtures/control-public-props/tsconfig.json --noEmit',
    );
  });

  it('adopts the local Motion foundation at each interactive control boundary', async () => {
    const [
      button,
      animateButton,
      motionButton,
      controls,
      switchSource,
      toggleGroup,
      link,
      segmentedTabs,
      selectBox,
      combobox,
    ] = await Promise.all([
      readFile(buttonUrl, 'utf8'),
      readFile(animateButtonPrimitiveUrl, 'utf8'),
      readFile(motionButtonUrl, 'utf8'),
      readFile(controlsUrl, 'utf8'),
      readFile(switchUrl, 'utf8'),
      readFile(toggleGroupUrl, 'utf8'),
      readFile(linkUrl, 'utf8'),
      readFile(segmentedTabsUrl, 'utf8'),
      readFile(selectBoxUrl, 'utf8'),
      readFile(comboboxUrl, 'utf8'),
    ]);

    assert.match(button, /Button as ButtonPrimitive/);
    assert.doesNotMatch(button, /<button\b/);
    assert.match(animateButton, /motion\.button/);
    assert.match(motionButton, /<button\b/);
    assert.match(motionButton, /<motion\.span\b/);
    assert.match(motionButton, /data-motion-owner="motion"/);
    assert.match(motionButton, /\{\.\.\.props\}[\s\S]*data-motion-owner="motion"/);
    assert.match(controls, /import \{ Button/);
    assert.doesNotMatch(controls, /<button\b/);
    assert.match(switchSource, /SwitchPrimitive\.Root/);
    assert.match(toggleGroup, /layoutId="toggle-group-indicator"/);
    assert.doesNotMatch(toggleGroup, /whileTap|scale/);
    assert.match(link, /import \{ motion/);
    assert.match(link, /<a\b/);
    assert.match(link, /<motion\.span\b/);
    assert.match(link, /\{\.\.\.props\}[\s\S]*data-motion-owner="motion"/);
    assert.match(segmentedTabs, /PresenceRegion/);
    for (const source of [selectBox, combobox]) {
      assert.match(source, /import \{ MotionButton, PresenceRegion \}/);
      assert.doesNotMatch(source, /<button\b/);
    }
  });

  it('exposes explicit control anatomy without changing native roles', async () => {
    const [
      button,
      controls,
      switchSource,
      checkbox,
      toggleGroup,
      form,
      link,
      segmentedTabs,
      selectBox,
      combobox,
    ] = await Promise.all([
      readFile(buttonUrl, 'utf8'),
      readFile(controlsUrl, 'utf8'),
      readFile(switchUrl, 'utf8'),
      readFile(checkboxUrl, 'utf8'),
      readFile(toggleGroupUrl, 'utf8'),
      readFile(formUrl, 'utf8'),
      readFile(linkUrl, 'utf8'),
      readFile(segmentedTabsUrl, 'utf8'),
      readFile(selectBoxUrl, 'utf8'),
      readFile(comboboxUrl, 'utf8'),
    ]);

    assert.match(button, /data-slot="button-control"/);
    assert.match(button, /data-slot="button-label"/);
    assert.match(button, /data-slot="button-spinner"/);
    assert.match(button, /function IconButton/);
    assert.match(switchSource, /data-slot="switch-control"/);
    assert.match(switchSource, /data-slot="switch-track"/);
    assert.match(checkbox, /data-slot="checkbox-control"/);
    assert.match(toggleGroup, /data-slot="toggle-group-indicator"/);
    assert.match(controls, /data-slot="toggle-control"/);
    assert.match(switchSource, /data-slot="control-label"/);
    assert.match(form, /data-slot="field-root"/);
    assert.match(form, /data-slot="field-label"/);
    assert.match(form, /data-slot="field-description"/);
    assert.match(form, /data-slot="field-error"/);
    assert.match(form, /data-slot="text-input-control"/);
    assert.match(form, /data-slot="textarea-control"/);
    assert.match(form, /data-slot="search-field-root"/);
    assert.match(form, /data-slot="search-field-indicator"/);
    assert.match(link, /data-slot="text-link-control"/);
    assert.match(segmentedTabs, /data-slot="segmented-tabs-root"/);
    assert.match(segmentedTabs, /data-slot="segmented-tab-control"/);
    assert.match(segmentedTabs, /data-slot="segmented-tab-indicator"/);
    for (const source of [selectBox, combobox]) {
      assert.match(source, /data-slot="select-root"/);
      assert.match(source, /data-slot="select-control"/);
      assert.match(source, /data-slot="select-option"/);
    }
    assert.match(selectBox, /data-slot="select-label"/);
    assert.match(selectBox, /data-slot="select-description"/);
    assert.match(selectBox, /data-slot="select-indicator"/);
    assert.match(combobox, /SelectOptionItem/);
  });

  it('exposes typed delegated recipes and closed component-owned control recipes', async () => {
    const [button, controls, switchSource, toggleGroup] = await Promise.all([
      readFile(buttonUrl, 'utf8'),
      readFile(controlsUrl, 'utf8'),
      readFile(switchUrl, 'utf8'),
      readFile(toggleGroupUrl, 'utf8'),
    ]);

    assert.match(button, /type ButtonMotion = 'pressable' \| 'quiet' \| 'none'/);
    assert.match(button, /motion\?: ButtonMotion/);
    assert.match(button, /data-motion=\{motion\}/);
    assert.match(button, /motion = 'pressable'/);
    assert.match(button, /forwardRef<HTMLButtonElement, ButtonProps>/);
    assert.match(button, /ref=\{ref\}/);
    assert.match(controls, /data-motion="toggle"/);
    assert.match(switchSource, /data-variant=\{variant\}/);
    assert.match(toggleGroup, /layoutId="toggle-group-indicator"/);
    assert.doesNotMatch(toggleGroup, /whileTap|scale/);
  });

  it('removes raw buttons and anchors from the bounded product-control inventory', async () => {
    const sources: string[] = await Promise.all(targetUrls.map((url) => readFile(url, 'utf8')));
    const rawControls = sources.flatMap((source, index) => {
      const matches = [...source.matchAll(/<(button|a|input|select|textarea)\b/g)];
      return matches.map((match) => `${targetUrls[index]?.pathname}:${match[1]}`);
    });

    assert.deepEqual(rawControls, []);
  });

  it('composes authentication fields from the shadcn registry boundaries', async () => {
    const source = await readFile(authInputFieldUrl, 'utf8');

    assert.match(source, /from '@\/shared\/ui\/field'/);
    assert.match(source, /from '@\/shared\/ui\/input'/);
    assert.match(source, /<Field\b/);
    assert.match(source, /<Input(?:Group|GroupInput)?\b/);
    assert.doesNotMatch(source, /TextInput|FieldMotionHalo/);
    assert.doesNotMatch(source, /<input\b/);
  });

  it('requires an explicit recipe at every legacy primitive call site', async () => {
    const sources: string[] = await Promise.all(
      legacyMotionRecipeUrls.map((url) => readFile(url, 'utf8')),
    );
    const missingRecipes = sources.flatMap((source, index) =>
      missingMotionRecipes(
        source,
        legacyMotionRecipeUrls[index]?.pathname ?? `target-${index}.tsx`,
      ),
    );

    assert.deepEqual(missingRecipes, []);
  });

  it('keeps calm press feedback in the canonical button and out of page styles', async () => {
    const [buttonSource, authSource] = await Promise.all([
      readFile(buttonCssUrl, 'utf8'),
      readFile(authCssUrl, 'utf8'),
    ]);
    const css = buttonSource.replace(/\/\*[\s\S]*?\*\//g, '');
    const authActionBlock =
      authSource.match(
        /\.submitButton,\s*\.primaryLink,\s*\.secondaryButton\s*\{([\s\S]*?)\}/,
      )?.[1] ?? '';

    assert.match(css, /:active[\s\S]*?translateY\(1px\)/);
    assert.doesNotMatch(css, /scale\(/);
    assert.doesNotMatch(authActionBlock, /\btransform\b/);
    assert.doesNotMatch(
      authSource,
      /\.(?:submitButton|primaryLink|secondaryButton):active[^{}]*\{[^}]*transform\s*:/,
    );
  });

  it('keeps shared control state selectors out of page-owned styles', async () => {
    const css =
      `${await readFile(buttonCssUrl, 'utf8')}\n${await readFile(linkCssUrl, 'utf8')}`.replace(
        /\/\*[\s\S]*?\*\//g,
        '',
      );

    assert.match(css, /\.button\s*\{/);
    assert.match(css, /\.button\[data-variant='secondary'\]/);
    assert.match(css, /:where\(\.textLink\)\s*\{/);
    assert.doesNotMatch(
      await readFile(authCssUrl, 'utf8'),
      /\.submitButton:(?:active|hover|focus-visible|disabled)/,
    );
  });
});
