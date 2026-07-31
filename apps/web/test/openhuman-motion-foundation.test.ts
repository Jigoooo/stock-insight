import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createElement,
  isValidElement,
  type ElementType,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { resolveDelegatedMotionTarget } from '../src/shared/ui/motion/motion-contract.ts';
import { resolveMotionButtonAnimation } from '../src/shared/ui/motion/motion-values.ts';

type ForwardRefComponent = {
  render: (props: Record<string, unknown>, ref: null) => ReactElement<Record<string, unknown>>;
};
type MotionBoundary = {
  Effect: ForwardRefComponent;
  Effects: (props: Record<string, unknown>) => ReactNode;
  MotionButton: ElementType<Record<string, unknown>> & ForwardRefComponent;
  PresenceRegion: (props: Record<string, unknown>) => ReactElement<Record<string, unknown>>;
};

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const packageUrl = new URL('../package.json', import.meta.url);
const rootUrl = new URL('../src/pages/root/ui/root.tsx', import.meta.url);

let motionBoundaryPromise: Promise<MotionBoundary> | undefined;

function loadMotionBoundary() {
  motionBoundaryPromise ??= (async () => {
    const server = await createServer({
      appType: 'custom',
      configFile: false,
      root: webRoot,
      server: { hmr: false, middlewareMode: true, watch: null, ws: false },
    });

    try {
      return (await server.ssrLoadModule(
        '/src/shared/ui/motion/index.ts',
      )) as unknown as MotionBoundary;
    } finally {
      await server.close();
    }
  })();

  return motionBoundaryPromise;
}

function invokeForwardRef(
  component: ForwardRefComponent,
  props: Record<string, unknown>,
): ReactElement<Record<string, unknown>> {
  const element = component.render(props, null);
  assert.equal(isValidElement(element), true);
  return element;
}

describe('OpenHuman Motion foundation structure', () => {
  it('installs Motion without retaining the completed GSAP migration dependencies', async () => {
    const packageJson = JSON.parse(await readFile(packageUrl, 'utf8')) as {
      dependencies?: Record<string, string>;
    };

    assert.equal(typeof packageJson.dependencies?.motion, 'string');
    assert.equal(packageJson.dependencies?.gsap, undefined);
    assert.equal(packageJson.dependencies?.['@gsap/react'], undefined);
  });

  it('configures user reduced-motion preference at the public-safe application root', async () => {
    const root = await readFile(rootUrl, 'utf8');

    assert.match(root, /import \{ MotionConfig \} from 'motion\/react'/);
    assert.match(root, /<MotionConfig reducedMotion="user">/);
    assert.doesNotMatch(root, /_authenticated|InteractionMotionProvider|MotionToast|AppToaster/);
  });

  it('exports the local Motion primitives from one shared boundary', async () => {
    const boundary = await loadMotionBoundary();

    assert.equal(typeof boundary.MotionButton.render, 'function');
    assert.equal(typeof boundary.Effect.render, 'function');
    assert.equal(typeof boundary.Effects, 'function');
    assert.equal(typeof boundary.PresenceRegion, 'function');
  });
});

describe('OpenHuman Motion foundation behavior', () => {
  it('resolves MotionButton defaults and renders a native non-focusable visual layer', async () => {
    const { MotionButton } = await loadMotionBoundary();
    const defaults = resolveMotionButtonAnimation({});
    const overrides = resolveMotionButtonAnimation({ hoverScale: 1.02, tapScale: 0.96 });
    const html = renderToStaticMarkup(createElement(MotionButton, { type: 'submit' }, '기본 버튼'));

    assert.deepEqual(defaults.whileHover, { scale: 1.012 });
    assert.deepEqual(defaults.whileTap, { scale: 0.978 });
    assert.deepEqual(defaults.transition, {
      damping: 30,
      mass: 0.6,
      stiffness: 420,
      type: 'spring',
    });
    assert.deepEqual(overrides.whileHover, { scale: 1.02 });
    assert.deepEqual(overrides.whileTap, { scale: 0.96 });
    assert.match(html, /^<button[^>]*type="submit"[^>]*data-motion-owner="motion"[^>]*>/);
    assert.match(html, /<span[^>]*data-slot="motion-visual"[^>]*>기본 버튼<\/span>/);
    assert.doesNotMatch(html, /tabindex=/);
  });

  it('neutralizes unavailable gestures and keeps Motion ownership internal', async () => {
    const { MotionButton } = await loadMotionBoundary();
    const html = renderToStaticMarkup(
      createElement(
        MotionButton,
        {
          'aria-disabled': 'true',
          'data-motion-owner': 'legacy',
          disabled: true,
          inert: true,
          whileHover: { scale: 1.2 },
          whileTap: { opacity: 0.2, scale: 0.8 },
        },
        'Unavailable',
      ),
    );
    assert.match(html, /^<button[^>]*data-motion-owner="motion"[^>]*>/);
    assert.match(html, /disabled=""|disabled/);
    assert.match(html, /inert=""/);
    assert.doesNotMatch(html, /data-motion-owner="legacy"|tabindex=/);

    const motionElement = {
      dataset: {
        motion: 'pressable',
        motionOwner: 'motion',
      },
    };
    const target = {
      closest: () => motionElement,
    } as unknown as EventTarget;
    assert.equal(resolveDelegatedMotionTarget(target), null);
  });

  it('resolves Effect options onto the rendered Motion element', async () => {
    const { Effect } = await loadMotionBoundary();
    const effect = invokeForwardRef(Effect, {
      blur: '8px',
      children: '효과 본문',
      delay: 0.12,
      fade: true,
      id: 'effect-probe',
      inView: true,
      inViewMargin: '-48px',
      inViewOnce: false,
      slide: { direction: 'left', offset: 24 },
      transition: { duration: 0.3 },
      zoom: { initialScale: 0.96 },
    });

    assert.deepEqual(effect.props.initial, {
      filter: 'blur(8px)',
      opacity: 0,
      scale: 0.96,
      x: -24,
    });
    assert.equal(effect.props.animate, undefined);
    assert.deepEqual(effect.props.whileInView, {
      filter: 'blur(0px)',
      opacity: 1,
      scale: 1,
      x: 0,
    });
    assert.deepEqual(effect.props.viewport, {
      amount: 'some',
      margin: '-48px',
      once: false,
    });
    assert.deepEqual(effect.props.transition, {
      delay: 0.12,
      duration: 0.3,
      ease: 'easeOut',
    });
    assert.equal(effect.props.id, 'effect-probe');
    assert.equal(effect.props.children, '효과 본문');
    assert.equal('fade' in effect.props, false);
    assert.equal('inView' in effect.props, false);
  });

  it('wraps and stagger-delays each direct React-element child through Effect', async () => {
    const { Effect, Effects } = await loadMotionBoundary();
    const children = [
      createElement('span', { key: 'first' }, '첫 번째'),
      createElement('span', { key: 'second' }, '두 번째'),
    ];
    const result = Effects({
      children,
      delay: 0.08,
      fade: true,
      holdDelay: 0.12,
    });

    assert.equal(Array.isArray(result), true);
    const wrappers = result as ReactElement<Record<string, unknown>>[];
    assert.equal(wrappers.length, 2);
    assert.equal(
      wrappers.every((wrapper) => isValidElement(wrapper)),
      true,
    );
    assert.equal(wrappers[0]?.type, Effect);
    assert.equal(wrappers[1]?.type, Effect);
    assert.equal(wrappers[0]?.props.delay, 0.12);
    assert.equal(wrappers[1]?.props.delay, 0.2);
    assert.equal(wrappers[0]?.props.fade, true);
    assert.equal(wrappers[1]?.props.fade, true);
    assert.equal(wrappers[0]?.props.children, children[0]);
    assert.equal(wrappers[1]?.props.children, children[1]);
  });

  it('keeps keyed conditional content and exit completion on PresenceRegion', async () => {
    const { PresenceRegion } = await loadMotionBoundary();
    let exitCompletions = 0;
    const onExitComplete = () => {
      exitCompletions += 1;
    };
    const presentRegion = PresenceRegion({
      children: createElement('p', null, '저장됨'),
      exit: { opacity: 0 },
      mode: 'wait',
      onExitComplete,
      presenceKey: 'saved-notice',
      present: true,
    });
    const absentRegion = PresenceRegion({
      children: createElement('p', null, '숨김'),
      presenceKey: 'hidden-notice',
      present: false,
    });

    assert.equal(presentRegion.props.mode, 'wait');
    assert.equal(presentRegion.props.onExitComplete, onExitComplete);
    const keyedChild = presentRegion.props.children as ReactElement<Record<string, unknown>>;
    assert.equal(isValidElement(keyedChild), true);
    assert.equal(keyedChild.key, 'saved-notice');
    assert.deepEqual(keyedChild.props.exit, { opacity: 0 });
    assert.equal(isValidElement(keyedChild.props.children), true);
    assert.equal(absentRegion.props.children, null);

    (presentRegion.props.onExitComplete as () => void)();
    assert.equal(exitCompletions, 1);
  });
});
