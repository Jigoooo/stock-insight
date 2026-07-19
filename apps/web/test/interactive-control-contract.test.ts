import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import ts from 'typescript';

const contractUrl = new URL('../src/shared/ui/motion/motion-contract.ts', import.meta.url);
const motionUrl = new URL('../src/shared/ui/motion/interaction-motion.tsx', import.meta.url);
const controllerUrl = new URL(
  '../src/shared/ui/motion/interaction-motion-controller.ts',
  import.meta.url,
);
const motionCssUrl = new URL('../src/shared/ui/motion/motion-system.css', import.meta.url);

async function readMotionSources() {
  const [contract, provider, controller, css] = await Promise.all([
    readFile(contractUrl, 'utf8'),
    readFile(motionUrl, 'utf8'),
    readFile(controllerUrl, 'utf8'),
    readFile(motionCssUrl, 'utf8'),
  ]);
  return { contract, controller, css, motion: `${provider}\n${controller}`, provider };
}

function parseSource(source: string, fileName: string) {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function collectNodes<NodeType extends ts.Node>(
  root: ts.Node,
  predicate: (node: ts.Node) => node is NodeType,
) {
  const matches: NodeType[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) matches.push(node);
    node.forEachChild(visit);
  };
  visit(root);
  return matches;
}

function objectProperty(
  sourceFile: ts.SourceFile,
  object: ts.ObjectLiteralExpression,
  name: string,
) {
  return object.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && property.name.getText(sourceFile) === name,
  );
}

function requireCallExpression(expression: ts.Expression | undefined, message: string) {
  if (!expression || !ts.isCallExpression(expression)) throw new Error(message);
  return expression;
}

function requireObjectLiteral(expression: ts.Expression | undefined, message: string) {
  if (!expression || !ts.isObjectLiteralExpression(expression)) throw new Error(message);
  return expression;
}

function nearestFunction(node: ts.Node | undefined) {
  let current = node?.parent;
  while (current) {
    if (
      ts.isArrowFunction(current) ||
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

function listenerTuple(sourceFile: ts.SourceFile, call: ts.CallExpression) {
  if (!ts.isPropertyAccessExpression(call.expression)) throw new Error('listener call required');
  const type = call.arguments[0];
  return [
    call.expression.expression.getText(sourceFile),
    ts.isStringLiteral(type) ? type.text : 'non-literal',
    call.arguments[1]?.getText(sourceFile) ?? 'missing-handler',
    call.arguments[2]?.getText(sourceFile) ?? 'no-options',
  ].join('|');
}

describe('explicit interactive-control motion contract', () => {
  it('defines one closed typed recipe taxonomy', async () => {
    const contract = await readFile(contractUrl, 'utf8');
    const recipeBlock = contract.match(/MOTION_RECIPES\s*=\s*\[([\s\S]*?)\]\s*as const/);

    assert.ok(recipeBlock, 'MOTION_RECIPES must be a readonly tuple');
    assert.deepEqual(recipeBlock[1]?.match(/'[a-z-]+'/g), [
      "'pressable'",
      "'quiet'",
      "'field-shell'",
      "'switch'",
      "'toggle'",
      "'overlay'",
      "'none'",
    ]);
    assert.match(contract, /export type MotionRecipe\s*=\s*\(typeof MOTION_RECIPES\)\[number\]/);
  });

  it('delegates only explicit data-motion controls instead of native or role selectors', async () => {
    const { contract, motion } = await readMotionSources();

    assert.match(contract, /MOTION_SELECTOR\s*=\s*'\[data-motion\]'/);
    assert.match(contract, /\.closest\(MOTION_SELECTOR\)/);
    assert.doesNotMatch(motion, /['"]button['"]|a\[href\]|\[role=/);
    assert.match(contract, /isDelegatedMotionRecipe/);
  });

  it('does not discover entry or loop animation globally', async () => {
    const { motion } = await readMotionSources();

    assert.doesNotMatch(
      motion,
      /MutationObserver|querySelectorAll|data-motion-enter|data-motion-loop/,
    );
  });

  it('keeps transform ownership in GSAP without permanent CSS animation hints', async () => {
    const css = await readFile(motionCssUrl, 'utf8');

    assert.doesNotMatch(css, /will-change/);
    assert.doesNotMatch(css, /transition\s*:[^;]*\btransform\b/);
  });

  it('limits positional hover to fine mouse pressables and makes release paths interruptible', async () => {
    const { motion } = await readMotionSources();

    assert.match(motion, /matchMedia\('\(hover: hover\) and \(pointer: fine\)'\)/);
    assert.match(motion, /event\.pointerType !== 'mouse'/);
    assert.match(motion, /recipe !== 'pressable'/);
    assert.match(motion, /addEventListener\('pointerdown'/);
    assert.match(motion, /addEventListener\('pointerup'/);
    assert.match(motion, /addEventListener\('pointercancel'/);
    assert.match(motion, /addEventListener\('pointerout'/);
  });

  it('keeps quiet press feedback non-positional', async () => {
    const { motion } = await readMotionSources();

    assert.match(
      motion,
      /if \(recipe === 'quiet'\)[\s\S]*?opacity:\s*readNumber\('--motion-quiet-press-opacity'\)/,
    );
    assert.match(motion, /scale:\s*readNumber\('--motion-press-scale'\)/);
  });

  it('normalizes only tracked active tweens when reduced-motion preference changes', async () => {
    const { motion } = await readMotionSources();

    assert.match(
      motion,
      /const activeElements = new Map<DelegatedMotionElement, DelegatedMotionRecipe>\(\)/,
    );
    assert.match(
      motion,
      /onMotionPreferenceChange[\s\S]*?normalizeActiveElements\(\)[\s\S]*?addEventListener\('change', onMotionPreferenceChange\)/,
    );
    assert.doesNotMatch(motion, /document\.querySelector/);
  });

  it('normalizes active feedback when the primary pointer becomes coarse', async () => {
    const { motion } = await readMotionSources();

    assert.match(motion, /finePointer\.addEventListener\('change', onPointerPreferenceChange\)/);
    assert.match(motion, /finePointer\.removeEventListener\('change', onPointerPreferenceChange\)/);
    assert.match(
      motion,
      /onPointerPreferenceChange[\s\S]*?if \(!finePointer\.matches\) normalizeActiveElements\(\)/,
    );
  });

  it('wires the provider adapter through contextSafe while the controller alone owns listeners', async () => {
    const { controller, provider } = await readMotionSources();
    const providerAst = parseSource(provider, 'interaction-motion.tsx');
    const controllerAst = parseSource(controller, 'interaction-motion-controller.ts');
    const providerCalls = collectNodes(providerAst, ts.isCallExpression);
    const controllerCalls = collectNodes(controllerAst, ts.isCallExpression);

    const gsapToCalls = providerCalls.filter(
      (call) =>
        ts.isPropertyAccessExpression(call.expression) &&
        call.expression.expression.getText(providerAst) === 'gsap' &&
        call.expression.name.text === 'to',
    );
    assert.equal(gsapToCalls.length, 1);

    const runTween = collectNodes(providerAst, ts.isVariableDeclaration).find(
      (declaration) => declaration.name.getText(providerAst) === 'runTween',
    );
    const runTweenInitializer = requireCallExpression(
      runTween?.initializer,
      'runTween must be initialized by contextSafe',
    );
    assert.equal(runTweenInitializer.expression.getText(providerAst), 'contextSafe');
    const contextSafeCallback = runTweenInitializer.arguments[0];
    assert.ok(
      contextSafeCallback &&
        (ts.isArrowFunction(contextSafeCallback) || ts.isFunctionExpression(contextSafeCallback)),
      'contextSafe must receive a function callback',
    );
    assert.equal(
      nearestFunction(gsapToCalls[0]),
      contextSafeCallback,
      'the only gsap.to call must be directly owned by the contextSafe callback',
    );

    const installCall = providerCalls.find(
      (call) => call.expression.getText(providerAst) === 'installDelegatedInteractionMotion',
    );
    if (!installCall || !ts.isReturnStatement(installCall.parent)) {
      throw new Error('provider must return installDelegatedInteractionMotion');
    }
    const installOptions = requireObjectLiteral(
      installCall.arguments[0],
      'provider install options must be an object literal',
    );
    assert.equal(
      objectProperty(providerAst, installOptions, 'resolveTarget')?.initializer.getText(
        providerAst,
      ),
      'resolveDelegatedMotionTarget',
    );
    const unavailableAdapter = objectProperty(providerAst, installOptions, 'isUnavailable');
    assert.ok(
      unavailableAdapter &&
        ts.isArrowFunction(unavailableAdapter.initializer) &&
        ts.isCallExpression(unavailableAdapter.initializer.body) &&
        unavailableAdapter.initializer.body.expression.getText(providerAst) ===
          'isMotionTargetUnavailable',
      'isUnavailable must directly return isMotionTargetUnavailable',
    );
    const motionAdapter = objectProperty(providerAst, installOptions, 'motion');
    const motionAdapterInitializer = requireObjectLiteral(
      motionAdapter?.initializer,
      'provider motion adapter must be an object literal',
    );
    assert.equal(
      objectProperty(providerAst, motionAdapterInitializer, 'to')?.initializer.getText(providerAst),
      'runTween',
    );
    assert.equal(
      providerCalls.some(
        (call) =>
          ts.isPropertyAccessExpression(call.expression) &&
          call.expression.name.text === 'addEventListener' &&
          call.arguments[0]?.getText(providerAst).includes('pointer'),
      ),
      false,
    );

    const forbiddenControllerIdentifiers = collectNodes(controllerAst, ts.isIdentifier)
      .map((identifier) => identifier.text)
      .filter((identifier) => ['contextSafe', 'gsap', 'useGSAP'].includes(identifier));
    assert.deepEqual(forbiddenControllerIdentifiers, []);
    const forbiddenControllerImports = collectNodes(controllerAst, ts.isImportDeclaration)
      .map((declaration) =>
        ts.isStringLiteral(declaration.moduleSpecifier) ? declaration.moduleSpecifier.text : '',
      )
      .filter((moduleName) => moduleName === '@gsap/react' || moduleName === 'gsap');
    assert.deepEqual(forbiddenControllerImports, []);

    const listenerCalls = (method: 'addEventListener' | 'removeEventListener') =>
      controllerCalls.filter(
        (call) =>
          ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === method,
      );
    const addCalls = listenerCalls('addEventListener');
    const removeCalls = listenerCalls('removeEventListener');
    assert.deepEqual(
      removeCalls.map((call) => listenerTuple(controllerAst, call)).sort(),
      addCalls.map((call) => listenerTuple(controllerAst, call)).sort(),
      'listener receiver/type/handler/capture tuples must be symmetrical',
    );

    const installFunction = collectNodes(controllerAst, ts.isFunctionDeclaration).find(
      (declaration) => declaration.name?.text === 'installDelegatedInteractionMotion',
    );
    assert.ok(installFunction);
    const cleanup = collectNodes(installFunction, ts.isReturnStatement).find(
      (statement) =>
        nearestFunction(statement) === installFunction &&
        statement.expression &&
        ts.isArrowFunction(statement.expression),
    );
    assert.ok(cleanup?.expression && ts.isArrowFunction(cleanup.expression));
    for (const removeCall of removeCalls) {
      assert.equal(
        nearestFunction(removeCall),
        cleanup.expression,
        'every listener removal must be directly owned by installer cleanup',
      );
    }
  });

  it('uses overwrite and clears inline transform state on completion, preference change, and unmount', async () => {
    const { motion } = await readMotionSources();

    assert.match(motion, /useGSAP/);
    assert.match(motion, /contextSafe/);
    assert.match(motion, /gsap\.killTweensOf\(element\)/);
    assert.match(motion, /overwrite:\s*'auto'/);
    assert.match(motion, /clearProps:\s*recipe === 'quiet' \? 'opacity' : 'transform'/);
    assert.match(motion, /onComplete:[\s\S]*?clearMotionProps\(element, recipe\)/);
    assert.match(
      motion,
      /return \(\) => \{[\s\S]*?normalizeActiveElements\(\)[\s\S]*?removeEventListener/,
    );
  });

  it('leaves component-owned state recipes alone and treats none as a full opt-out', async () => {
    const { contract, motion } = await readMotionSources();

    assert.match(
      contract,
      /DELEGATED_MOTION_RECIPES\s*=\s*\[\s*'pressable',\s*'quiet',?\s*\]\s*as const satisfies readonly MotionRecipe\[\]/,
    );
    assert.match(
      contract,
      /COMPONENT_OWNED_MOTION_RECIPES\s*=\s*\[\s*'field-shell',\s*'switch',\s*'toggle',\s*'overlay',?\s*\]\s*as const satisfies readonly MotionRecipe\[\]/,
    );
    assert.doesNotMatch(motion, /data-motion=[\\"'](?:field-shell|switch|toggle|overlay)[\\"']/);
    assert.match(contract, /recipe === 'none'[\s\S]*?return null/);
  });
});
