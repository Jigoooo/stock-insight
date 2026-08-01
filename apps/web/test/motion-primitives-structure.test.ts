import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const rootUrl = new URL('../src/pages/root/ui/root.tsx', import.meta.url);
const authenticatedUrl = new URL('../src/routes/_authenticated.tsx', import.meta.url);
const deferredToastUrl = new URL('../src/shared/ui/toast/deferred-toast-host.tsx', import.meta.url);
const motionUrl = new URL('../src/shared/ui/motion/interaction-motion.tsx', import.meta.url);
const controllerUrl = new URL(
  '../src/shared/ui/motion/interaction-motion-controller.ts',
  import.meta.url,
);
const motionCssUrl = new URL('../src/shared/ui/motion/motion-system.css', import.meta.url);
const controlsUrl = new URL('../src/shared/ui/primitives/controls.tsx', import.meta.url);
const switchUrl = new URL('../src/shared/ui/switch/switch.tsx', import.meta.url);
const switchCssUrl = new URL('../src/shared/ui/switch/switch.module.css', import.meta.url);
const primitivesCssUrl = new URL(
  '../src/shared/ui/primitives/primitives.module.css',
  import.meta.url,
);
const toastUrl = new URL('../src/shared/ui/toast/motion-toast.tsx', import.meta.url);
const toastCssUrl = new URL('../src/shared/ui/toast/toast.module.css', import.meta.url);
const feedbackUrl = new URL('../src/shared/ui/primitives/feedback.tsx', import.meta.url);

describe('shared interaction and feedback boundaries', () => {
  it('mounts one authenticated interaction provider and one deferred toast viewport', async () => {
    const [root, authenticated, deferredToast] = await Promise.all([
      readFile(rootUrl, 'utf8'),
      readFile(authenticatedUrl, 'utf8'),
      readFile(deferredToastUrl, 'utf8'),
    ]);

    assert.doesNotMatch(root, /InteractionMotionProvider|AppToaster/);
    assert.match(root, /<DeferredToastHost\s*\/>/);
    assert.match(authenticated, /<InteractionMotionProvider>/);
    assert.match(deferredToast, /<LazyAppToaster\s*\/>/);
  });

  it('uses explicit delegated micro-interactions without owning component entry or loop state', async () => {
    const [provider, controller, motionSystem, feedback, primitives] = await Promise.all([
      readFile(motionUrl, 'utf8'),
      readFile(controllerUrl, 'utf8'),
      readFile(motionCssUrl, 'utf8'),
      readFile(feedbackUrl, 'utf8'),
      readFile(primitivesCssUrl, 'utf8'),
    ]);
    assert.match(provider, /return installDelegatedInteractionMotion\(/);
    assert.doesNotMatch(provider, /addEventListener\('pointer/);
    assert.match(controller, /addEventListener\('pointerdown'/);
    assert.doesNotMatch(controller, /\b(?:contextSafe|gsap|useGSAP)\b/);
    assert.doesNotMatch(provider, /boxShadow\s*:/);
    assert.doesNotMatch(provider, /MutationObserver|data-motion-enter|data-motion-loop/);
    assert.doesNotMatch(controller, /MutationObserver|data-motion-enter|data-motion-loop/);
    assert.doesNotMatch(motionSystem, /will-change|transition\s*:[^;]*\btransform\b/);
    assert.doesNotMatch(primitives, /\.(?:button|iconButton):active[^{}]*\{[^}]*transform\s*:/);
    assert.match(controller, /addEventListener\('change', onMotionPreferenceChange\)/);
    assert.match(controller, /killTweensOf/);
    assert.match(feedback, /import \{ Effect, PresenceRegion \}/);
    assert.match(feedback, /data-slot="skeleton-root"/);
    assert.doesNotMatch(feedback, /data-motion-loop=/);
    assert.doesNotMatch(primitives, /@keyframes|animation:/);
  });

  it('removes browser-native control chrome and provides accessible shared link, switch, and toggle primitives', async () => {
    const [controls, switchSource, switchCss, motionCss] = await Promise.all([
      readFile(controlsUrl, 'utf8'),
      readFile(switchUrl, 'utf8'),
      readFile(switchCssUrl, 'utf8'),
      readFile(motionCssUrl, 'utf8'),
    ]);

    assert.match(motionCss, /appearance:\s*none/);
    assert.match(motionCss, /-webkit-tap-highlight-color:\s*transparent/);
    assert.match(motionCss, /:focus-visible/);
    assert.match(switchSource, /SwitchPrimitive\.Root/);
    assert.match(switchSource, /data-slot="switch-control"/);
    assert.match(controls, /aria-pressed=\{pressed\}/);
    assert.match(controls, /data-motion="toggle"/);
    assert.match(switchCss, /\.track\s*\{/);
  });

  it('delegates toast stack, dismiss, and swipe behavior to Sonner', async () => {
    const [toast, toastCss] = await Promise.all([
      readFile(toastUrl, 'utf8'),
      readFile(toastCssUrl, 'utf8'),
    ]);

    assert.match(toast, /toast\.custom/);
    assert.match(toast, /toast\.dismiss/);
    assert.match(toast, /swipeDirections=\{\['right', 'top'\]\}/);
    assert.match(toast, /unstyled:\s*true/);
    assert.match(toastCss, /prefers-reduced-transparency/);
  });
});
