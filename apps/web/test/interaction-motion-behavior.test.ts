import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  installDelegatedInteractionMotion,
  type DelegatedMotionElement,
  type InteractionMotionAdapter,
  type InteractionMotionTarget,
  type MotionMediaQuery,
  type MotionRoot,
  type MotionTweenVars,
} from '../src/shared/ui/motion/interaction-motion-controller.ts';
import {
  isMotionTargetUnavailable,
  MOTION_RECIPES,
  MOTION_SELECTOR,
  resolveDelegatedMotionTarget,
  type MotionAvailabilityElement,
} from '../src/shared/ui/motion/motion-contract.ts';

const packageUrl = new URL('../package.json', import.meta.url);
const motionCssUrl = new URL('../src/shared/ui/motion/motion-system.css', import.meta.url);
const profileCssUrl = new URL('../public/styles/profiles/calm-market.css', import.meta.url);

class FakeMediaQuery extends EventTarget implements MotionMediaQuery {
  matches: boolean;

  constructor(matches: boolean) {
    super();
    this.matches = matches;
  }

  setMatches(matches: boolean) {
    this.matches = matches;
    this.dispatchEvent(new Event('change'));
  }
}

class FakeMotionRoot implements MotionRoot {
  private readonly listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event) {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
  }
}

type MotionCall = {
  element: DelegatedMotionElement;
  vars?: MotionTweenVars;
};

type TestMotionElement = MotionAvailabilityElement & {
  dataset: { motion?: string };
  id: string;
};

type MotionLogEntry = {
  element: string;
  method: 'kill' | 'set' | 'to';
  vars?: Omit<MotionTweenVars, 'onComplete'> & { onComplete?: true };
};

function createMotionElement(
  id: string,
  {
    ariaDisabled = false,
    disabled = false,
    inert = false,
    recipe = 'pressable',
  }: {
    ariaDisabled?: boolean;
    disabled?: boolean;
    inert?: boolean;
    recipe?: string;
  } = {},
): TestMotionElement {
  return {
    id,
    dataset: { motion: recipe },
    closest: (selector) => (selector === '[inert]' && inert ? { inert: true } : null),
    getAttribute: (name) => (name === 'aria-disabled' && ariaDisabled ? 'true' : null),
    matches: (selector) => selector === ':disabled' && disabled,
  };
}

function serializeVars(vars: MotionTweenVars) {
  const { onComplete, ...serializable } = vars;
  return onComplete ? { ...serializable, onComplete: true as const } : serializable;
}

function unsafeMotionDeclarations(css: string) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...source.matchAll(/(?:^|[;{}])\s*(transition(?:-[a-z-]+)?|will-change)\s*:/gim)].map(
    (match) => match[1]?.toLowerCase(),
  );
}

function pointerEvent(
  type: 'pointercancel' | 'pointerdown' | 'pointerout' | 'pointerover' | 'pointerup',
  options: { button?: number; pointerId?: number; pointerType?: string } = {},
) {
  const event = new Event(type);
  Object.defineProperties(event, {
    button: { value: options.button ?? 0 },
    pointerId: { value: options.pointerId ?? 1 },
    pointerType: { value: options.pointerType ?? 'mouse' },
    relatedTarget: { value: null },
    target: { value: { id: 'event-target' } },
  });
  return event;
}

function createHarness(
  initialTarget: InteractionMotionTarget = {
    element: createMotionElement('pressable'),
    recipe: 'pressable',
  },
) {
  const root = new FakeMotionRoot();
  const motionPreference = new FakeMediaQuery(false);
  const finePointer = new FakeMediaQuery(true);
  const calls = {
    kill: [] as MotionCall[],
    log: [] as MotionLogEntry[],
    set: [] as MotionCall[],
    to: [] as MotionCall[],
  };
  let currentTarget: InteractionMotionTarget | null = initialTarget;

  const motion: InteractionMotionAdapter = {
    killTweensOf(element) {
      calls.kill.push({ element });
      calls.log.push({ element: (element as TestMotionElement).id, method: 'kill' });
    },
    set(element, vars) {
      calls.set.push({ element, vars });
      calls.log.push({
        element: (element as TestMotionElement).id,
        method: 'set',
        vars: serializeVars(vars),
      });
    },
    to(element, vars) {
      calls.to.push({ element, vars });
      calls.log.push({
        element: (element as TestMotionElement).id,
        method: 'to',
        vars: serializeVars(vars),
      });
    },
  };

  const cleanup = installDelegatedInteractionMotion({
    finePointer,
    isUnavailable: (element) => isMotionTargetUnavailable(element as TestMotionElement),
    motion,
    motionPreference,
    readNumber: (token) => {
      const values: Record<string, number> = {
        '--motion-hover-y': -1,
        '--motion-press-scale': 0.975,
        '--motion-press-y': 0.5,
        '--motion-quiet-press-opacity': 0.84,
      };
      return values[token] ?? 0;
    },
    readSeconds: (token) => (token === '--duration-press' ? 0.12 : 0.18),
    readValue: (token) => token,
    resolveTarget: (target) => (target === null ? null : currentTarget),
    root,
  });

  return {
    calls,
    clearLog() {
      calls.log.length = 0;
    },
    cleanup,
    finePointer,
    motionPreference,
    root,
    setTarget(target: InteractionMotionTarget | null) {
      currentTarget = target;
    },
  };
}

describe('delegated interaction motion behavior', () => {
  it('keeps quiet press feedback opacity-only', () => {
    const harness = createHarness({ element: createMotionElement('quiet'), recipe: 'quiet' });

    harness.root.dispatchEvent(pointerEvent('pointerdown'));

    assert.deepEqual(harness.calls.log, [
      { element: 'quiet', method: 'kill' },
      {
        element: 'quiet',
        method: 'to',
        vars: {
          duration: 0.12,
          ease: '--motion-ease-press',
          opacity: 0.84,
          overwrite: 'auto',
        },
      },
    ]);
    harness.cleanup();
  });

  it('limits pressable hover to fine mouse and applies scale-y press feedback', () => {
    const harness = createHarness();

    harness.root.dispatchEvent(pointerEvent('pointerover', { pointerType: 'touch' }));
    assert.deepEqual(harness.calls.log, []);
    harness.root.dispatchEvent(pointerEvent('pointerover', { pointerType: 'mouse' }));
    assert.deepEqual(harness.calls.log, [
      { element: 'pressable', method: 'kill' },
      {
        element: 'pressable',
        method: 'to',
        vars: {
          duration: 0.18,
          ease: '--motion-ease-out',
          overwrite: 'auto',
          y: -1,
        },
      },
    ]);
    harness.clearLog();
    harness.root.dispatchEvent(pointerEvent('pointerdown'));
    assert.deepEqual(harness.calls.log, [
      { element: 'pressable', method: 'kill' },
      {
        element: 'pressable',
        method: 'to',
        vars: {
          duration: 0.12,
          ease: '--motion-ease-press',
          overwrite: 'auto',
          scale: 0.975,
          y: 0.5,
        },
      },
    ]);
    harness.cleanup();
  });

  it('rejects disabled aria-disabled and inert ancestry through the real availability gate', () => {
    for (const flags of [{ disabled: true }, { ariaDisabled: true }, { inert: true }] as const) {
      const element = createMotionElement('unavailable', flags);
      const harness = createHarness({ element, recipe: 'pressable' });

      harness.root.dispatchEvent(pointerEvent('pointerover'));
      harness.root.dispatchEvent(pointerEvent('pointerdown'));

      assert.equal(isMotionTargetUnavailable(element), true);
      assert.deepEqual(harness.calls.log, []);
      harness.cleanup();
    }
  });

  it('resolves only delegated recipes and rejects component recipes plus none', () => {
    const expected = new Map([
      ['pressable', 'pressable'],
      ['quiet', 'quiet'],
      ['field-shell', null],
      ['switch', null],
      ['toggle', null],
      ['overlay', null],
      ['none', null],
    ]);

    for (const recipe of MOTION_RECIPES) {
      const element = createMotionElement(recipe, { recipe });
      const target = {
        closest: (selector: string) => (selector === MOTION_SELECTOR ? element : null),
      } as unknown as EventTarget;
      const resolved = resolveDelegatedMotionTarget(target);
      const delegatedRecipe = expected.get(recipe);

      assert.equal(resolved?.element ?? null, delegatedRecipe ? element : null, recipe);
      assert.equal(resolved?.recipe ?? null, delegatedRecipe, recipe);
    }
  });

  it('normalizes active feedback when reduced motion turns on', () => {
    const harness = createHarness();
    harness.root.dispatchEvent(pointerEvent('pointerdown'));
    harness.clearLog();

    harness.motionPreference.setMatches(true);

    assert.deepEqual(harness.calls.log, [
      { element: 'pressable', method: 'kill' },
      {
        element: 'pressable',
        method: 'set',
        vars: { clearProps: 'transform' },
      },
    ]);
    harness.clearLog();
    harness.root.dispatchEvent(pointerEvent('pointerup'));
    assert.deepEqual(harness.calls.log, []);
    harness.cleanup();
  });

  it('normalizes fine-to-coarse but preserves an active coarse press on coarse-to-fine', () => {
    const harness = createHarness();
    harness.root.dispatchEvent(pointerEvent('pointerover'));
    harness.clearLog();

    harness.finePointer.setMatches(false);
    assert.deepEqual(harness.calls.log, [
      { element: 'pressable', method: 'kill' },
      {
        element: 'pressable',
        method: 'set',
        vars: { clearProps: 'transform' },
      },
    ]);

    harness.clearLog();
    harness.setTarget({ element: createMotionElement('quiet'), recipe: 'quiet' });
    harness.root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 9, pointerType: 'touch' }));
    assert.deepEqual(harness.calls.log, [
      { element: 'quiet', method: 'kill' },
      {
        element: 'quiet',
        method: 'to',
        vars: {
          duration: 0.12,
          ease: '--motion-ease-press',
          opacity: 0.84,
          overwrite: 'auto',
        },
      },
    ]);

    harness.clearLog();
    harness.finePointer.setMatches(true);
    assert.deepEqual(harness.calls.log, []);
    harness.root.dispatchEvent(pointerEvent('pointerup', { pointerId: 9, pointerType: 'touch' }));
    assert.deepEqual(harness.calls.log, [
      { element: 'quiet', method: 'kill' },
      {
        element: 'quiet',
        method: 'to',
        vars: {
          duration: 0.18,
          ease: '--motion-ease-out',
          onComplete: true,
          opacity: 1,
          overwrite: 'auto',
        },
      },
    ]);
    harness.cleanup();
  });

  it('restores press feedback on pointer cancellation', () => {
    const harness = createHarness();
    harness.root.dispatchEvent(pointerEvent('pointerdown', { pointerId: 7 }));
    harness.clearLog();

    harness.root.dispatchEvent(pointerEvent('pointercancel', { pointerId: 7 }));

    assert.deepEqual(harness.calls.log, [
      { element: 'pressable', method: 'kill' },
      {
        element: 'pressable',
        method: 'to',
        vars: {
          duration: 0.18,
          ease: '--motion-ease-out',
          onComplete: true,
          overwrite: 'auto',
          scale: 1,
          y: 0,
        },
      },
    ]);
    harness.cleanup();
  });

  it('removes event listeners and clears active inline state on cleanup', () => {
    const harness = createHarness({ element: createMotionElement('quiet'), recipe: 'quiet' });
    harness.root.dispatchEvent(pointerEvent('pointerdown'));
    harness.clearLog();
    harness.cleanup();
    assert.deepEqual(harness.calls.log, [
      { element: 'quiet', method: 'kill' },
      { element: 'quiet', method: 'set', vars: { clearProps: 'opacity' } },
    ]);

    harness.clearLog();
    harness.root.dispatchEvent(pointerEvent('pointerdown'));
    assert.deepEqual(harness.calls.log, []);
  });
});

describe('motion dependency and CSS ownership gates', () => {
  it('pins the approved @gsap/react version exactly', async () => {
    const packageJson = JSON.parse(await readFile(packageUrl, 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    assert.equal(packageJson.dependencies?.['@gsap/react'], '2.1.2');
  });

  it('fails closed on every transition and will-change declaration in motion-owned CSS', async () => {
    const css = (
      await Promise.all([readFile(motionCssUrl, 'utf8'), readFile(profileCssUrl, 'utf8')])
    ).join('\n');

    assert.deepEqual(unsafeMotionDeclarations(css), []);
    for (const fixture of [
      '.x { transition: 180ms ease; }',
      '.x { transition-property: var(--target); }',
      '.x { transition-duration: 180ms; }',
      '.x { will-change: var(--target); }',
    ]) {
      assert.equal(unsafeMotionDeclarations(fixture).length, 1, fixture);
    }
  });
});
