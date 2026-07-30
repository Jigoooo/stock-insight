import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const packageUrl = new URL('../package.json', import.meta.url);
const rootUrl = new URL('../src/pages/root/ui/root.tsx', import.meta.url);
const motionButtonUrl = new URL('../src/shared/ui/motion/motion-button.tsx', import.meta.url);
const effectUrl = new URL('../src/shared/ui/motion/effect.tsx', import.meta.url);
const presenceRegionUrl = new URL('../src/shared/ui/motion/presence-region.tsx', import.meta.url);
const motionValuesUrl = new URL('../src/shared/ui/motion/motion-values.ts', import.meta.url);
const motionBoundaryUrl = new URL('../src/shared/ui/motion/index.ts', import.meta.url);

function requireFile(url: URL) {
  assert.equal(existsSync(fileURLToPath(url)), true, `Missing ${fileURLToPath(url)}`);
}

describe('OpenHuman Motion foundation structure', () => {
  it('installs Motion without removing the existing GSAP migration dependency', async () => {
    const packageJson = JSON.parse(await readFile(packageUrl, 'utf8')) as {
      dependencies?: Record<string, string>;
    };

    assert.equal(typeof packageJson.dependencies?.motion, 'string');
    assert.equal(typeof packageJson.dependencies?.gsap, 'string');
    assert.equal(typeof packageJson.dependencies?.['@gsap/react'], 'string');
  });

  it('configures user reduced-motion preference at the public-safe application root', async () => {
    const root = await readFile(rootUrl, 'utf8');

    assert.match(root, /import \{ MotionConfig \} from 'motion\/react'/);
    assert.match(root, /<MotionConfig reducedMotion="user">/);
    assert.doesNotMatch(root, /_authenticated|InteractionMotionProvider|MotionToast|AppToaster/);
  });

  it('exports the local Motion primitives from one shared boundary', async () => {
    requireFile(motionBoundaryUrl);
    const boundary = await readFile(motionBoundaryUrl, 'utf8');

    assert.match(boundary, /MotionButton/);
    assert.match(boundary, /Effect/);
    assert.match(boundary, /Effects/);
    assert.match(boundary, /PresenceRegion/);
  });

  it('keeps presence ownership in AnimatePresence around keyed conditional content', async () => {
    requireFile(presenceRegionUrl);
    const source = await readFile(presenceRegionUrl, 'utf8');

    assert.match(source, /AnimatePresence/);
    assert.match(source, /key=\{presenceKey\}/);
    assert.match(source, /present \?/);
  });
});

describe('OpenHuman Motion foundation behavior', () => {
  it('uses the required restrained button scales and allows per-button overrides', async () => {
    requireFile(motionButtonUrl);
    requireFile(motionValuesUrl);
    const { resolveMotionButtonAnimation } = await import(motionValuesUrl.href);

    assert.deepEqual(resolveMotionButtonAnimation({}), {
      transition: { damping: 30, mass: 0.6, stiffness: 420, type: 'spring' },
      whileHover: { scale: 1.012 },
      whileTap: { scale: 0.978 },
    });
    assert.deepEqual(resolveMotionButtonAnimation({ hoverScale: 1.02, tapScale: 0.96 }), {
      transition: { damping: 30, mass: 0.6, stiffness: 420, type: 'spring' },
      whileHover: { scale: 1.02 },
      whileTap: { scale: 0.96 },
    });
  });

  it('composes fade, slide, zoom, blur, delay, and in-view behavior', async () => {
    requireFile(effectUrl);
    requireFile(motionValuesUrl);
    const { resolveEffectAnimation } = await import(motionValuesUrl.href);

    assert.deepEqual(
      resolveEffectAnimation({
        blur: '8px',
        delay: 0.12,
        fade: true,
        inView: true,
        inViewMargin: '-48px',
        inViewOnce: false,
        slide: { direction: 'left', offset: 24 },
        zoom: { initialScale: 0.96 },
      }),
      {
        animate: undefined,
        initial: {
          filter: 'blur(8px)',
          opacity: 0,
          scale: 0.96,
          x: -24,
        },
        transition: { delay: 0.12, duration: 0.24, ease: 'easeOut' },
        viewport: { amount: 'some', margin: '-48px', once: false },
        whileInView: {
          filter: 'blur(0px)',
          opacity: 1,
          scale: 1,
          x: 0,
        },
      },
    );
  });

  it('stagger-delays direct React-element children after the hold delay', async () => {
    requireFile(effectUrl);
    requireFile(motionValuesUrl);
    const { resolveEffectChildDelay } = await import(motionValuesUrl.href);

    assert.equal(resolveEffectChildDelay({ delay: 0.08, holdDelay: 0.12, index: 0 }), 0.12);
    assert.equal(resolveEffectChildDelay({ delay: 0.08, holdDelay: 0.12, index: 2 }), 0.28);
  });
});
