import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const configFile = resolve(root, 'e2e/fixtures/select-controls/vite.config.ts');
const server = await createServer({ configFile, logLevel: 'error' });
const browser = await chromium.launch({ headless: true });

try {
  await server.listen();
  const address = server.httpServer?.address();
  assert(address && typeof address === 'object');
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const page = await context.newPage();
  page.setDefaultTimeout(5_000);
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle' });

  const workspaceFirstPaint = await page.evaluate(() => window.__runWorkspaceFirstPaintCases());
  assert(workspaceFirstPaint.append.opacity < 1);
  assert.notEqual(workspaceFirstPaint.append.transform, 'none');
  assert(workspaceFirstPaint.relation.opacity < 1);
  assert.notEqual(workspaceFirstPaint.relation.transform, 'none');

  const motionRuntime = await page.evaluate(() => window.__runMotionAdapterRuntimeCases());
  assert.equal(motionRuntime.repeatedFromTo.firstFinal.opacity, 1);
  assert.equal(motionRuntime.repeatedFromTo.firstFinal.transform, 'none');
  assert(motionRuntime.repeatedFromTo.secondStart.opacity < 1);
  assert.notEqual(motionRuntime.repeatedFromTo.secondStart.transform, 'none');
  assert.equal(motionRuntime.repeatedFromTo.secondFinal.opacity, 1);
  assert.equal(motionRuntime.repeatedFromTo.secondFinal.transform, 'none');
  assert.equal(motionRuntime.animatedReducedNormal.reduced.opacity, 1);
  assert.match(
    motionRuntime.animatedReducedNormal.reduced.transform,
    /^(?:none|matrix\(1, 0, 0, 1, 0, 0\))$/,
  );
  assert.equal(motionRuntime.animatedReducedNormal.normal.opacity, 0.65);
  assert.match(motionRuntime.animatedReducedNormal.normal.transform, /,\s*2\)$/);
  assert.deepEqual(motionRuntime.interrupted.callbacks, ['new']);
  assert.equal(motionRuntime.interrupted.final.opacity, 0.75);
  assert.match(motionRuntime.interrupted.final.transform, /,\s*3\)$/);
  assert.deepEqual(motionRuntime.staleCompletion.callbacks, ['new']);
  assert(motionRuntime.staleCompletion.whileNewerActive.opacity > 0);
  assert.equal(motionRuntime.staleCompletion.final.opacity, 0.6);

  const expectedNativeEventOrder = [
    { eventPhase: 1, handler: 'root-capture' },
    { eventPhase: 1, handler: 'child-capture' },
    { eventPhase: 3, handler: 'child-bubble' },
    { eventPhase: 3, handler: 'root-bubble' },
  ];
  const expectedStoppedNativeEventOrder = expectedNativeEventOrder.slice(0, 3);
  for (const probe of ['button', 'icon-button', 'switch', 'toggle', 'text-link']) {
    await page.locator(`[data-event-target="${probe}-normal"]`).dispatchEvent('drag');
    await page.locator(`[data-event-target="${probe}-stopped"]`).dispatchEvent('drag');
    await page
      .locator(`[data-event-target="${probe}-animation-normal"]`)
      .dispatchEvent('animationstart');
    await page
      .locator(`[data-event-target="${probe}-animation-stopped"]`)
      .dispatchEvent('animationstart');
  }
  const nativeEventLog = await page.evaluate(() => window.__nativeEventLog);
  for (const probe of ['button', 'icon-button', 'switch', 'toggle', 'text-link']) {
    assert.deepEqual(nativeEventLog[`${probe}-normal`], expectedNativeEventOrder);
    assert.deepEqual(nativeEventLog[`${probe}-stopped`], expectedStoppedNativeEventOrder);
    assert.deepEqual(nativeEventLog[`${probe}-animation-normal`], expectedNativeEventOrder);
    assert.deepEqual(nativeEventLog[`${probe}-animation-stopped`], expectedStoppedNativeEventOrder);
  }

  const wrappedFieldLabel = page.locator('label').filter({ hasText: 'Wrapped field' });
  assert.equal(
    await wrappedFieldLabel.evaluate((label) =>
      label instanceof HTMLLabelElement ? label.control?.id : null,
    ),
    'wrapped-field-control',
  );
  const directFieldControl = page.locator('#direct-field-control');
  assert.equal(
    await directFieldControl.getAttribute('aria-describedby'),
    'direct-field-control-description',
  );
  assert.equal(
    await directFieldControl.getAttribute('aria-errormessage'),
    'direct-field-control-error',
  );
  assert.equal(await directFieldControl.getAttribute('aria-invalid'), 'true');

  const animatedTarget = page.locator('[data-event-target="button-normal"]');
  const animatedButton = page.locator('button', { has: animatedTarget });
  const animatedVisual = animatedButton.locator('[data-slot="motion-visual"]');
  await animatedButton.hover();
  await page.waitForTimeout(120);
  const hoverTransform = await animatedVisual.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  assert.notEqual(hoverTransform, 'none');
  await animatedButton.dispatchEvent('pointerdown', {
    button: 0,
    pointerId: 73,
    pointerType: 'mouse',
  });
  await page.waitForTimeout(120);
  const tapTransform = await animatedVisual.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  assert.notEqual(tapTransform, hoverTransform);
  await animatedButton.dispatchEvent('pointerup', {
    button: 0,
    pointerId: 73,
    pointerType: 'mouse',
  });

  const geometryCombo = page.getByRole('combobox', { name: 'Search choices', exact: true });
  await geometryCombo.fill('ga');
  const geometryClearButton = geometryCombo
    .locator('..')
    .getByRole('button', { name: '선택 지우기' });
  const clearGeometry = await geometryClearButton.evaluate((button) => {
    const icon = button.querySelector('svg');
    if (!(icon instanceof SVGElement)) throw new Error('clear icon is missing');
    const buttonBox = button.getBoundingClientRect();
    const iconBox = icon.getBoundingClientRect();
    return {
      xDelta: iconBox.left + iconBox.width / 2 - (buttonBox.left + buttonBox.width / 2),
      yDelta: iconBox.top + iconBox.height / 2 - (buttonBox.top + buttonBox.height / 2),
    };
  });
  assert(Math.abs(clearGeometry.xDelta) <= 0.75);
  assert(Math.abs(clearGeometry.yDelta) <= 0.75);
  await geometryClearButton.click();
  assert.equal(await geometryCombo.inputValue(), '');

  const focusNeutralVisuals = [
    animatedVisual,
    page
      .locator('a', { has: page.locator('[data-event-target="text-link-normal"]') })
      .locator('[data-slot="motion-visual"]'),
    page
      .getByRole('button', { name: 'Disabled button', exact: true })
      .locator('[data-slot="motion-visual"]'),
    page
      .getByRole('link', { name: 'ARIA disabled link', exact: true })
      .locator('[data-slot="motion-visual"]'),
  ];
  for (const visual of focusNeutralVisuals) {
    const focusState = await visual.evaluate((element) => {
      element.focus();
      return {
        active: document.activeElement === element,
        hasTabIndex: element.hasAttribute('tabindex'),
      };
    });
    assert.deepEqual(focusState, { active: false, hasTabIndex: false });
  }

  const unavailableControls = [
    page.getByRole('button', { name: 'Disabled button', exact: true }),
    page.getByRole('button', { name: 'Pending button', exact: true }),
    page.getByRole('button', { name: 'ARIA disabled button', exact: true }),
    page.getByRole('button', { name: 'Inert button', exact: true }),
    page.getByRole('link', { name: 'ARIA disabled link', exact: true }),
    page.getByRole('button', { name: 'Disabled icon button', exact: true }),
    page.getByRole('button', { name: 'Pending icon button', exact: true }),
    page.getByRole('switch', { name: 'Disabled switch', exact: true }),
    page.getByRole('switch', { name: 'Pending switch', exact: true }),
    page.getByRole('button', { name: 'Disabled toggle', exact: true }),
    page.getByRole('button', { name: 'Pending toggle', exact: true }),
    page.getByRole('combobox', { name: 'Disabled select', exact: true }),
    page.getByRole('combobox', { name: 'Disabled search choices', exact: true }),
  ];
  for (const control of unavailableControls) {
    const before = await control.evaluate((element) => {
      const style = getComputedStyle(element);
      return { opacity: style.opacity, transform: style.transform };
    });
    const motionVisual = control.locator('[data-slot="motion-visual"]');
    const visualBefore =
      (await motionVisual.count()) === 1
        ? await motionVisual.evaluate((element) => {
            const style = getComputedStyle(element);
            return { opacity: style.opacity, transform: style.transform };
          })
        : null;
    await control.hover({ force: true });
    await control.dispatchEvent('pointerdown', { button: 0, pointerId: 91, pointerType: 'mouse' });
    await page.waitForTimeout(120);
    const after = await control.evaluate((element) => {
      const style = getComputedStyle(element);
      return { opacity: style.opacity, transform: style.transform };
    });
    assert.deepEqual(after, before);
    if (visualBefore) {
      const visualAfter = await motionVisual.evaluate((element) => {
        const style = getComputedStyle(element);
        return { opacity: style.opacity, transform: style.transform };
      });
      assert.deepEqual(visualAfter, visualBefore);
    }
    await control.dispatchEvent('pointerup', { button: 0, pointerId: 91, pointerType: 'mouse' });
  }
  for (const label of [
    'Pending button',
    'Pending icon button',
    'Pending switch',
    'Pending toggle',
  ]) {
    const control = page.getByRole(label.includes('switch') ? 'switch' : 'button', {
      name: label,
      exact: true,
    });
    assert.equal(await control.isDisabled(), true);
    assert.equal(await control.getAttribute('aria-busy'), 'true');
  }
  assert.equal(
    await page.getByRole('combobox', { name: 'Disabled select', exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await page.getByRole('combobox', { name: 'Disabled search choices', exact: true }).isDisabled(),
    true,
  );

  const select = page.getByRole('combobox', { name: 'Uncontrolled select', exact: true });
  const selectListboxId = await select.getAttribute('aria-controls');
  const selectListbox = page.locator(`[id="${selectListboxId}"]`);
  await select.focus();
  await page.keyboard.press('End');
  assert.equal(await select.getAttribute('aria-expanded'), 'true');
  const endActiveId = await select.getAttribute('aria-activedescendant');
  assert.match(endActiveId ?? '', /option-3$/);
  assert.equal(await page.locator(`[id="${endActiveId}"]`).getAttribute('aria-selected'), 'true');
  assert.equal(
    await page.getByRole('option', { name: 'Alpha', exact: true }).getAttribute('aria-selected'),
    'false',
  );
  await page.keyboard.press('ArrowDown');
  assert.equal(await select.getAttribute('aria-activedescendant'), endActiveId);
  await page.keyboard.press('Home');
  const firstActiveId = await select.getAttribute('aria-activedescendant');
  assert.match(firstActiveId ?? '', /option-0$/);
  await page.keyboard.press('ArrowUp');
  assert.equal(await select.getAttribute('aria-activedescendant'), firstActiveId);

  await page.keyboard.press('ArrowDown');
  const gammaId = await select.getAttribute('aria-activedescendant');
  assert.match(gammaId ?? '', /option-2$/);
  assert.equal(
    await page.getByRole('option', { name: /Gamma/ }).getAttribute('aria-selected'),
    'true',
  );
  await page.keyboard.press('Tab');
  assert.equal(await select.getAttribute('aria-expanded'), 'false');
  assert.equal((await select.innerText()).trim(), 'Gamma');
  assert.equal(
    await page
      .getByRole('combobox', { name: 'Controlled select', exact: true })
      .evaluate((element) => document.activeElement === element),
    true,
  );

  await select.focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Escape');
  assert.equal((await select.innerText()).trim(), 'Gamma');
  await page.keyboard.press('Home');
  await page.getByRole('button', { name: 'Outside target' }).click();
  assert.equal(await select.getAttribute('aria-expanded'), 'false');
  assert.equal((await select.innerText()).trim(), 'Gamma');

  await select.click();
  assert.equal(
    await selectListbox.getByRole('option', { name: /Gamma/ }).getAttribute('aria-selected'),
    'true',
  );
  await page.getByRole('option', { name: 'Beta', exact: true }).click({ force: true });
  assert.equal((await select.innerText()).trim(), 'Gamma');
  await page.keyboard.press('Escape');

  const longSelect = page.getByRole('combobox', { name: 'Long select', exact: true });
  await longSelect.focus();
  await page.keyboard.press('End');
  const longActiveId = await longSelect.getAttribute('aria-activedescendant');
  const scrollState = await page.locator(`[id="${longActiveId}"]`).evaluate((option) => {
    const listbox = option.parentElement;
    const optionRect = option.getBoundingClientRect();
    const listboxRect = listbox?.getBoundingClientRect();
    return {
      scrollTop: listbox?.scrollTop ?? 0,
      visible:
        Boolean(listboxRect) &&
        optionRect.top >= listboxRect.top &&
        optionRect.bottom <= listboxRect.bottom,
    };
  });
  assert(scrollState.scrollTop > 0);
  assert.equal(scrollState.visible, true);
  await page.keyboard.press('Escape');

  const controlledSelect = page.getByRole('combobox', {
    name: 'Controlled select',
    exact: true,
  });
  await controlledSelect.click();
  await page.getByRole('option', { name: 'Delta', exact: true }).click();
  assert.equal((await controlledSelect.innerText()).trim(), 'Delta');

  await page.getByRole('button', { name: 'Submit form' }).click();
  const submitted = JSON.parse(
    await page.getByRole('status', { name: 'Submitted data' }).innerText(),
  );
  assert.equal(submitted.uncontrolledSelect, 'gamma');
  assert.equal(submitted.controlledSelect, 'delta');
  assert.equal('disabledSelect' in submitted, false);

  await page.getByRole('button', { name: 'Reset form' }).click();
  assert.equal((await select.innerText()).trim(), 'Alpha');
  assert.equal((await controlledSelect.innerText()).trim(), 'Alpha');
  await page.getByRole('button', { name: 'Submit form' }).click();
  const resetSubmission = JSON.parse(
    await page.getByRole('status', { name: 'Submitted data' }).innerText(),
  );
  assert.equal(resetSubmission.uncontrolledSelect, 'alpha');
  assert.equal(resetSubmission.controlledSelect, 'alpha');

  const combo = page.getByRole('combobox', { name: 'Search choices', exact: true });
  await combo.fill('ga');
  const comboListboxId = await combo.getAttribute('aria-controls');
  const comboListbox = page.locator(`[id="${comboListboxId}"]`);
  assert.deepEqual(await comboListbox.getByRole('option').allTextContents(), ['GammaThird choice']);
  await page.keyboard.press('Escape');
  assert.equal(await combo.getAttribute('aria-expanded'), 'false');
  await page.keyboard.press('ArrowDown');
  await page.getByRole('button', { name: 'Outside target' }).click();
  assert.equal(await combo.getAttribute('aria-expanded'), 'false');
  assert.equal(await combo.inputValue(), 'ga');
  await combo.fill('missing');
  assert.equal(
    await comboListbox.getByRole('option', { name: 'No matching choices' }).isVisible(),
    true,
  );
  await combo.locator('..').getByRole('button', { name: '선택 지우기' }).click();
  assert.equal(await combo.inputValue(), '');
  await page.keyboard.press('End');
  await page.keyboard.press('Tab');
  assert.equal(await combo.inputValue(), 'Delta');
  await comboListbox.waitFor({ state: 'detached' });

  const controlledCombo = page.getByRole('combobox', {
    name: 'Controlled search choices',
    exact: true,
  });
  await controlledCombo.fill('third');
  const controlledComboListboxId = await controlledCombo.getAttribute('aria-controls');
  const controlledComboListbox = page.locator(`[id="${controlledComboListboxId}"]`);
  assert.equal(
    await controlledComboListbox.getByRole('option', { name: /Gamma/ }).isVisible(),
    true,
  );
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await controlledCombo.inputValue(), 'Gamma');
  await controlledComboListbox.waitFor({ state: 'detached' });

  await page.getByRole('button', { name: 'Submit form' }).click();
  const comboSubmission = JSON.parse(
    await page.getByRole('status', { name: 'Submitted data' }).innerText(),
  );
  assert.equal(comboSubmission.combo, 'delta');
  assert.equal(comboSubmission.controlledCombo, 'gamma');
  assert.equal('disabledCombo' in comboSubmission, false);
  await page.getByRole('button', { name: 'Reset form' }).click();
  assert.equal(await combo.inputValue(), '');
  assert.equal(await controlledCombo.inputValue(), '');

  await select.click();
  await controlledCombo.evaluate((element) =>
    element instanceof HTMLElement ? element.focus() : null,
  );
  const visibleListboxes = await page
    .locator('[role="listbox"]:visible')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-labelledby')));
  assert.deepEqual(visibleListboxes.sort(), [
    'controlled-combo-label',
    'uncontrolled-select-label',
  ]);
  await page.waitForTimeout(500);
  const axe = await new AxeBuilder({ page }).analyze();
  if (axe.violations.length > 0) {
    console.error(
      JSON.stringify(
        axe.violations.map((violation) => ({
          id: violation.id,
          nodes: violation.nodes.map((node) => ({
            failureSummary: node.failureSummary,
            target: node.target,
          })),
        })),
        null,
        2,
      ),
    );
  }
  assert.deepEqual(
    axe.violations.map((violation) => violation.id),
    [],
  );

  console.log('SELECT_CONTROLS_BROWSER_GATE=PASS');
} finally {
  await browser.close();
  await server.close();
}
