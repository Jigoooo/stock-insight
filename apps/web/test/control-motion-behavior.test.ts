import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  applyControlStateMotion,
  clearControlStateMotion,
  shouldCommitControlChange,
  type ControlMotionAdapter,
  type ControlMotionTarget,
} from '../src/shared/ui/primitives/control-motion-controller.ts';

const controlsUrl = new URL('../src/shared/ui/primitives/controls.tsx', import.meta.url);
const primitiveCssUrl = new URL(
  '../src/shared/ui/primitives/primitives.module.css',
  import.meta.url,
);

type MotionCall = {
  method: 'kill' | 'set' | 'to';
  target: ControlMotionTarget;
  vars?: object;
};

function createMotionLog() {
  const calls: MotionCall[] = [];
  const adapter: ControlMotionAdapter = {
    killTweensOf: (target) => calls.push({ method: 'kill', target }),
    set: (target, vars) => calls.push({ method: 'set', target, vars }),
    to: (target, vars) => calls.push({ method: 'to', target, vars }),
  };
  return { adapter, calls };
}

describe('component-owned control motion', () => {
  it('moves only the switch thumb on checked changes', () => {
    const target = {};
    const { adapter, calls } = createMotionLog();

    applyControlStateMotion({
      active: true,
      adapter,
      duration: 0.16,
      ease: 'power2.out',
      kind: 'switch',
      reducedMotion: false,
      target,
    });

    assert.deepEqual(calls, [
      { method: 'kill', target },
      {
        method: 'to',
        target,
        vars: { duration: 0.16, ease: 'power2.out', overwrite: 'auto', x: 18 },
      },
    ]);
  });

  it('fades only the toggle decorative rail on pressed changes', () => {
    const target = {};
    const { adapter, calls } = createMotionLog();

    applyControlStateMotion({
      active: false,
      adapter,
      duration: 0.12,
      ease: 'power1.out',
      kind: 'toggle',
      reducedMotion: false,
      target,
    });

    assert.deepEqual(calls, [
      { method: 'kill', target },
      {
        method: 'to',
        target,
        vars: { duration: 0.12, ease: 'power1.out', opacity: 0, overwrite: 'auto' },
      },
    ]);
  });

  it('normalizes reduced motion immediately without creating a tween', () => {
    const target = {};
    const { adapter, calls } = createMotionLog();

    applyControlStateMotion({
      active: true,
      adapter,
      duration: 0.16,
      ease: 'power2.out',
      kind: 'toggle',
      reducedMotion: true,
      target,
    });

    assert.deepEqual(calls, [
      { method: 'kill', target },
      { method: 'set', target, vars: { opacity: 1 } },
    ]);
  });

  it('kills active work and clears only controller-owned properties during cleanup', () => {
    const switchThumb = {};
    const toggleRail = {};
    const { adapter, calls } = createMotionLog();

    clearControlStateMotion({ adapter, kind: 'switch', target: switchThumb });
    clearControlStateMotion({ adapter, kind: 'toggle', target: toggleRail });

    assert.deepEqual(calls, [
      { method: 'kill', target: switchThumb },
      { method: 'set', target: switchThumb, vars: { clearProps: 'transform' } },
      { method: 'kill', target: toggleRail },
      { method: 'set', target: toggleRail, vars: { clearProps: 'opacity' } },
    ]);
  });
});

describe('control callback guard', () => {
  it('rejects disabled, pending, and default-prevented changes', () => {
    assert.equal(
      shouldCommitControlChange({ disabled: true, pending: false, defaultPrevented: false }),
      false,
    );
    assert.equal(
      shouldCommitControlChange({ disabled: false, pending: true, defaultPrevented: false }),
      false,
    );
    assert.equal(
      shouldCommitControlChange({ disabled: false, pending: false, defaultPrevented: true }),
      false,
    );
    assert.equal(
      shouldCommitControlChange({ disabled: false, pending: false, defaultPrevented: false }),
      true,
    );
  });
});

describe('Switch and Toggle integration contract', () => {
  it('uses a context-safe GSAP owner for the thumb and decorative rail only', async () => {
    const [source, css] = await Promise.all([
      readFile(controlsUrl, 'utf8'),
      readFile(primitiveCssUrl, 'utf8'),
    ]);

    assert.match(source, /useGSAP/);
    assert.match(source, /contextSafe/);
    assert.match(source, /gsap\.killTweensOf\(target\)/);
    assert.match(source, /data-switch-motion-thumb/);
    assert.match(source, /data-toggle-motion-rail/);
    assert.match(source, /applyControlStateMotion/);
    assert.match(source, /clearControlStateMotion/);
    assert.match(source, /pending\?: boolean/);
    assert.match(source, /aria-busy=\{pending \|\| undefined\}/);
    assert.match(source, /disabled=\{disabled \|\| pending\}/);
    assert.match(source, /shouldCommitControlChange/);
    assert.doesNotMatch(css, /\.switchThumb\s*\{[^}]*\btranslate\s*:/s);
    assert.doesNotMatch(css, /\.switchControl\[data-state='checked'\] \.switchThumb/);
    assert.match(css, /\.toggleRail\s*\{/);
  });
});
