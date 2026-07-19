import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import ts from 'typescript';

const buttonUrl = new URL('../src/shared/ui/primitives/button.tsx', import.meta.url);
const controlsUrl = new URL('../src/shared/ui/primitives/controls.tsx', import.meta.url);
const primitivesCssUrl = new URL(
  '../src/shared/ui/primitives/primitives.module.css',
  import.meta.url,
);
const authCssUrl = new URL('../src/pages/auth/auth-page.module.css', import.meta.url);
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
    const [primitiveSource, authSource] = await Promise.all([
      readFile(primitivesCssUrl, 'utf8'),
      readFile(authCssUrl, 'utf8'),
    ]);
    const css = primitiveSource.replace(/\/\*[\s\S]*?\*\//g, '');
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
    const css = (await readFile(primitivesCssUrl, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');

    assert.match(css, /:where\(\.button,\s*\.iconButton\)\s*\{/);
    assert.match(css, /:where\(\.button\[data-variant='secondary'\],\s*\.iconButton\)/);
    assert.match(css, /:where\(\.textLink\)\s*\{/);
    assert.doesNotMatch(css, /(?:^|\n)\.(?:button|iconButton|textLink)(?:\b|\[)/);
  });
});
