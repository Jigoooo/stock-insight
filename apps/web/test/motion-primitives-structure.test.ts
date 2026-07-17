import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const rootUrl = new URL('../src/pages/root/ui/root.tsx', import.meta.url);
const motionUrl = new URL('../src/shared/ui/motion/interaction-motion.tsx', import.meta.url);
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
  it('mounts one global interaction provider and toast viewport', async () => {
    const root = await readFile(rootUrl, 'utf8');

    assert.match(root, /<InteractionMotionProvider>/);
    assert.match(root, /<AppToaster\s*\/>/);
  });

  it('uses delegated interactions with reduced-motion fallbacks', async () => {
    const [motion, motionSystem, feedback, primitives] = await Promise.all([
      readFile(motionUrl, 'utf8'),
      readFile(motionCssUrl, 'utf8'),
      readFile(feedbackUrl, 'utf8'),
      readFile(primitivesCssUrl, 'utf8'),
    ]);

    assert.match(motion, /addEventListener\('pointerdown'/);
    assert.doesNotMatch(motion, /boxShadow\s*:/);
    assert.match(motion, /MutationObserver/);
    assert.match(motionSystem, /prefers-reduced-motion:\s*reduce/);
    assert.match(
      primitives,
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.button:active[\s\S]*\.iconButton:active[\s\S]*transform:\s*none/,
    );
    assert.match(motion, /addEventListener\('change', onMotionPreferenceChange\)/);
    assert.match(motion, /killTweensOf/);
    assert.match(motion, /data-motion-loop/);
    assert.match(feedback, /data-motion-loop="skeleton"/);
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
