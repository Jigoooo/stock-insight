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
const primitivesCssUrl = new URL(
  '../src/shared/ui/primitives/primitives.module.css',
  import.meta.url,
);
const toastUrl = new URL('../src/shared/ui/toast/motion-toast.tsx', import.meta.url);
const toastCssUrl = new URL('../src/shared/ui/toast/motion-toast.module.css', import.meta.url);
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
    assert.match(feedback, /MotionRegion/);
    assert.match(feedback, /recipe="skeleton"/);
    assert.doesNotMatch(feedback, /data-motion-loop=/);
    assert.doesNotMatch(primitives, /@keyframes|animation:/);
  });

  it('removes browser-native control chrome and provides accessible shared link, switch, and toggle primitives', async () => {
    const [controls, motionCss, primitivesCss] = await Promise.all([
      readFile(controlsUrl, 'utf8'),
      readFile(motionCssUrl, 'utf8'),
      readFile(primitivesCssUrl, 'utf8'),
    ]);

    assert.match(motionCss, /appearance:\s*none/);
    assert.match(motionCss, /-webkit-tap-highlight-color:\s*transparent/);
    assert.match(motionCss, /:focus-visible/);
    assert.match(controls, /role="switch"/);
    assert.match(controls, /aria-checked=\{checked\}/);
    assert.match(controls, /aria-pressed=\{pressed\}/);
    assert.match(controls, /data-motion="(?:switch|toggle|pressable)"/);
    assert.match(primitivesCss, /\.switchControl,[\s\S]*?min-height:\s*44px/);
  });

  it('provides toast pause, dismiss, and preference fallbacks without fixing a library', async () => {
    const [toast, toastCss] = await Promise.all([
      readFile(toastUrl, 'utf8'),
      readFile(toastCssUrl, 'utf8'),
    ]);

    assert.match(toast, /visibilitychange/);
    assert.match(toast, /addEventListener\('mouseenter', pauseTimer\)/);
    assert.match(toast, /app-toast-dismiss/);
    assert.match(toastCss, /prefers-reduced-transparency/);
  });
});
