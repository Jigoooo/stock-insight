import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import ts from 'typescript';

const buttonUrl = new URL('../src/shared/ui/primitives/button.tsx', import.meta.url);
const buttonCssUrl = new URL('../src/shared/ui/primitives/button.module.css', import.meta.url);
const motionButtonUrl = new URL('../src/shared/ui/motion/motion-button.tsx', import.meta.url);
const controlsUrl = new URL('../src/shared/ui/primitives/controls.tsx', import.meta.url);
const formUrl = new URL('../src/shared/ui/primitives/form.tsx', import.meta.url);
const linkUrl = new URL('../src/shared/ui/primitives/link.tsx', import.meta.url);
const linkCssUrl = new URL('../src/shared/ui/primitives/link.module.css', import.meta.url);
const segmentedTabsUrl = new URL('../src/shared/ui/primitives/segmented-tabs.tsx', import.meta.url);
const selectBoxUrl = new URL('../src/shared/ui/primitives/select-box.tsx', import.meta.url);
const comboboxUrl = new URL('../src/shared/ui/primitives/combobox.tsx', import.meta.url);
const authCssUrl = new URL('../src/pages/auth/auth-page.module.css', import.meta.url);
const rootPackageUrl = new URL('../../../package.json', import.meta.url);
const targetUrls = [
  new URL('../src/routes/_authenticated/workspace.tsx', import.meta.url),
  new URL('../src/shared/ui/toast/motion-toast.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/research-workspace-page.tsx', import.meta.url),
  new URL('../src/pages/auth/signup-page.tsx', import.meta.url),
  new URL('../src/pages/auth/login-page.tsx', import.meta.url),
  new URL('../src/entities/stock/ui/stock-detail.tsx', import.meta.url),
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
    const [button, motionButton, controls, link, segmentedTabs, selectBox, combobox] =
      await Promise.all([
        readFile(buttonUrl, 'utf8'),
        readFile(motionButtonUrl, 'utf8'),
        readFile(controlsUrl, 'utf8'),
        readFile(linkUrl, 'utf8'),
        readFile(segmentedTabsUrl, 'utf8'),
        readFile(selectBoxUrl, 'utf8'),
        readFile(comboboxUrl, 'utf8'),
      ]);

    assert.match(button, /import \{ MotionButton/);
    assert.doesNotMatch(button, /<button\b/);
    assert.match(motionButton, /<button\b/);
    assert.match(motionButton, /<motion\.span\b/);
    assert.match(motionButton, /data-motion-owner="motion"/);
    assert.match(motionButton, /\{\.\.\.props\}[\s\S]*data-motion-owner="motion"/);
    assert.match(controls, /import \{ MotionButton/);
    assert.doesNotMatch(controls, /<button\b/);
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
    const [button, controls, form, link, segmentedTabs, selectBox, combobox] = await Promise.all([
      readFile(buttonUrl, 'utf8'),
      readFile(controlsUrl, 'utf8'),
      readFile(formUrl, 'utf8'),
      readFile(linkUrl, 'utf8'),
      readFile(segmentedTabsUrl, 'utf8'),
      readFile(selectBoxUrl, 'utf8'),
      readFile(comboboxUrl, 'utf8'),
    ]);

    assert.match(button, /data-slot="button-control"/);
    assert.match(button, /data-slot="button-label"/);
    assert.match(button, /data-slot="icon-button-control"/);
    assert.match(controls, /data-slot="switch-control"/);
    assert.match(controls, /data-slot="switch-indicator"/);
    assert.match(controls, /data-slot="toggle-control"/);
    assert.match(controls, /data-slot="control-label"/);
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
      assert.match(source, /data-slot="select-label"/);
      assert.match(source, /data-slot="select-description"/);
      assert.match(source, /data-slot="select-indicator"/);
    }
  });

  it('exposes typed delegated recipes and closed component-owned control recipes', async () => {
    const [button, controls] = await Promise.all([
      readFile(buttonUrl, 'utf8'),
      readFile(controlsUrl, 'utf8'),
    ]);

    assert.match(
      button,
      /type ButtonMotionRecipe = Extract<MotionRecipe, 'pressable' \| 'quiet' \| 'none'>/,
    );
    assert.match(button, /motion\?: ButtonMotionRecipe/);
    assert.match(button, /data-motion=\{motion\}/);
    assert.match(button, /motion = 'pressable'/);
    assert.match(button, /forwardRef<HTMLButtonElement, ButtonProps>/);
    assert.match(button, /ref=\{ref\}/);
    assert.match(controls, /data-motion="switch"/);
    assert.match(controls, /data-motion="toggle"/);
    assert.doesNotMatch(controls, /^\s*motion\??:/m);
  });

  it('removes raw buttons and anchors from the bounded product-control inventory', async () => {
    const sources: string[] = await Promise.all(targetUrls.map((url) => readFile(url, 'utf8')));
    const rawControls = sources.flatMap((source, index) => {
      const matches = [...source.matchAll(/<(button|a)\b/g)];
      return matches.map((match) => `${targetUrls[index]?.pathname}:${match[1]}`);
    });

    assert.deepEqual(rawControls, []);
  });

  it('requires an explicit recipe at every migrated primitive call site', async () => {
    const sources: string[] = await Promise.all(targetUrls.map((url) => readFile(url, 'utf8')));
    const missingRecipes = sources.flatMap((source, index) =>
      missingMotionRecipes(source, targetUrls[index]?.pathname ?? `target-${index}.tsx`),
    );

    assert.deepEqual(missingRecipes, []);
  });

  it('keeps transform and quiet opacity ownership out of primitive CSS transitions', async () => {
    const [buttonSource, authSource] = await Promise.all([
      readFile(buttonCssUrl, 'utf8'),
      readFile(authCssUrl, 'utf8'),
    ]);
    const css = buttonSource.replace(/\/\*[\s\S]*?\*\//g, '');
    const buttonBlock = css.match(/:where\(\.button,\s*\.iconButton\)\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    const authActionBlock =
      authSource.match(
        /\.submitButton,\s*\.primaryLink,\s*\.secondaryButton\s*\{([\s\S]*?)\}/,
      )?.[1] ?? '';

    assert.doesNotMatch(buttonBlock, /\btransform\b/);
    assert.doesNotMatch(buttonBlock, /\bopacity\b/);
    assert.doesNotMatch(css, /\.(?:button|iconButton):active[^{}]*\{[^}]*transform\s*:/);
    assert.doesNotMatch(authActionBlock, /\btransform\b/);
    assert.doesNotMatch(
      authSource,
      /\.(?:submitButton|primaryLink|secondaryButton):active[^{}]*\{[^}]*transform\s*:/,
    );
  });

  it('keeps shared control visuals lower-specificity than page-owned custom classes', async () => {
    const css =
      `${await readFile(buttonCssUrl, 'utf8')}\n${await readFile(linkCssUrl, 'utf8')}`.replace(
        /\/\*[\s\S]*?\*\//g,
        '',
      );

    assert.match(css, /:where\(\.button,\s*\.iconButton\)\s*\{/);
    assert.match(css, /:where\(\.button\[data-variant='secondary'\],\s*\.iconButton\)/);
    assert.match(css, /:where\(\.textLink\)\s*\{/);
    assert.doesNotMatch(css, /(?:^|\n)\.(?:button|iconButton|textLink)(?:\b|\[)/);
  });
});
