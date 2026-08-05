import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = async (path: string) =>
  readFile(new URL(`../src/${path}`, import.meta.url), 'utf8').catch(() => '');

/**
 * Pairs every `data-motion-owner="motion"` with the slot it sits on.
 *
 * `data-motion-owner` is a PER-ELEMENT marker, not a per-file one: reduced-motion
 * reaches an animated element only through `:where([data-motion-owner='motion'])`
 * in motion-system.css, and motion-contract.ts reads it off the element itself.
 * select.tsx legitimately carries two. So counting occurrences file-wide asserts
 * nothing about the invariant this suite is named for — that the dialog CONTENT
 * has exactly one owner and never a nested second one.
 *
 * The pairing relies on attributes being alphabetically sorted, which puts
 * `data-motion-owner` ahead of `data-slot` inside the same element. The pair
 * count is asserted against the raw owner count below so that a reordering
 * breaks this test loudly instead of quietly matching the wrong slot.
 */
const motionOwnedSlots = (source: string) =>
  [...source.matchAll(/data-motion-owner="motion"[\s\S]*?data-slot="([\w-]+)"/g)].map(
    (match) => match[1],
  );

describe('shared dialog system', () => {
  it('keeps one content Motion owner and the approved B spring', async () => {
    const source = await read('shared/ui/dialog/dialog.tsx');

    assert.match(source, /stiffness:\s*150/);
    assert.match(source, /damping:\s*25/);
    assert.match(source, /reducedMotion \? false : \{ x: 72, opacity: 0 \}/);

    const owned = motionOwnedSlots(source);
    assert.equal(
      owned.length,
      source.match(/data-motion-owner="motion"/g)?.length,
      'every motion owner must pair with a slot; an unpaired one means the attribute order changed',
    );
    assert.equal(
      owned.filter((slot) => slot === 'dialog-content').length,
      1,
      'the dialog content animates through exactly one Motion owner',
    );
    assert.ok(
      owned.includes('dialog-overlay'),
      'the overlay is a separate animated element and needs its own owner for reduced-motion',
    );
  });

  it('reserves a 32px close slot and stable action widths', async () => {
    const css = await read('shared/ui/dialog/dialog.module.css');

    assert.match(css, /--dialog-close-size:\s*32px/);
    assert.match(css, /border-radius:\s*7px/);
    assert.match(css, /min-height:\s*62px/);
    assert.match(css, /data-tone='secondary'[\s\S]*min-width:\s*92px/);
    assert.match(css, /data-tone='primary'[\s\S]*min-width:\s*104px/);
    assert.match(css, /data-tone='danger'[\s\S]*min-width:\s*104px/);
  });

  it('keeps AlertDialog modal and deliberately omits an X close control', async () => {
    const source = await read('shared/ui/dialog/alert-dialog.tsx');

    assert.match(source, /onEscapeKeyDown/);
    assert.match(source, /AlertDialogPrimitive\.Content/);
    assert.doesNotMatch(source, /\bX\b|AlertDialogPrimitive\.Close|data-slot="dialog-close"/);
  });

  it('does not restyle nested form controls from the dialog stylesheet', async () => {
    const css = await read('shared/ui/dialog/dialog.module.css');

    assert.doesNotMatch(css, /\binput\b|\btextarea\b|\.button\b|\.checkbox\b/);
  });
});
