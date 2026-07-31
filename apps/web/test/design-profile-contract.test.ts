import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  activeDesignProfile,
  inspectDesignProfileSource,
  requiredSemanticTokens,
} from '../src/shared/theme/design-profile-contract.ts';

const profileUrl = new URL(`../public${activeDesignProfile.cssHref}`, import.meta.url);
const expressiveProfileUrl = new URL('./fixtures/expressive-design-profile.css', import.meta.url);
const foundationUrl = new URL('../public/styles/index.css', import.meta.url);
const tailwindFoundationUrl = new URL('../src/shared/ui/tailwind.css', import.meta.url);
const documentUrl = new URL('../src/pages/root/ui/root-document.tsx', import.meta.url);
const rootRouteUrl = new URL('../src/routes/__root.tsx', import.meta.url);
const legacyTokensUrl = new URL('../src/shared/theme/tokens.ts', import.meta.url);
const componentStylesUrl = new URL('../src/', import.meta.url);

async function readDesignSourceTree(directory: URL): Promise<string[]> {
  const sources: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, directory);
    if (entry.isDirectory()) sources.push(...(await readDesignSourceTree(child)));
    else if (entry.isFile() && /\.(?:css|ts|tsx)$/.test(entry.name))
      sources.push(await readFile(child, 'utf8'));
  }
  return sources;
}

function findUnresolvedTokens(definitionSources: string[], usageSources: string[]): string[] {
  const definitions = new Set<string>(
    definitionSources.join('\n').match(/--[\w-]+(?=\s*:)/g) ?? [],
  );
  const componentLocalDefinitions = new Set<string>();
  const componentUses = new Set<string>();

  for (const source of usageSources) {
    for (const match of source.matchAll(/['"](--[\w-]+)['"]\s*:/g)) {
      if (match[1]) componentLocalDefinitions.add(match[1]);
    }
    for (const match of source.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
      if (match[1]) componentUses.add(match[1]);
    }
    if (source.includes('readProfileMotion')) {
      for (const match of source.matchAll(/['"](--[\w-]+)['"]/g)) componentUses.add(match[1]);
    }
  }

  return [...componentUses]
    .filter((token) => !definitions.has(token) && !componentLocalDefinitions.has(token))
    .sort();
}

describe('design profile contract', () => {
  it('keeps taste values in the active profile behind one semantic interface', async () => {
    const [profile, foundation, document] = await Promise.all([
      readFile(profileUrl, 'utf8'),
      readFile(foundationUrl, 'utf8'),
      readFile(documentUrl, 'utf8'),
    ]);
    const inspection = inspectDesignProfileSource(profile);
    const darkProfile = profile.slice(profile.indexOf('@media (prefers-color-scheme: dark)'));

    assert.match(activeDesignProfile.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(activeDesignProfile.cssHref, `/styles/profiles/${activeDesignProfile.id}.css`);
    assert.equal(activeDesignProfile.colorSchemes.includes('dark'), true);
    assert.equal(requiredSemanticTokens.length >= 20, true);
    assert.deepEqual(inspection.missingTokens, []);
    assert.equal(inspection.hasDarkScheme, true);
    assert.match(
      profile,
      new RegExp(`--color-canvas:\\s*${activeDesignProfile.themeColors.light}`),
    );
    assert.match(
      darkProfile,
      new RegExp(`--color-canvas:\\s*${activeDesignProfile.themeColors.dark}`),
    );
    assert.match(profile, /--color-accent-strong:\s*#20211f/);
    assert.match(darkProfile, /--color-accent-strong:\s*#f2f2ed/);
    assert.doesNotMatch(profile, /#(?:f3f6fa|070c14|356faf|245d9d|7fb0eb|98c3f3|173453)\b/i);
    assert.doesNotMatch(foundation, /@import\s/);
    assert.doesNotMatch(foundation, /--color-canvas:\s*#/);
    assert.match(document, /data-design-profile=\{activeDesignProfile\.id\}/);
  });

  it('accepts a visually different profile while rejecting an incomplete interface', async () => {
    const expressiveProfile = await readFile(expressiveProfileUrl, 'utf8');
    const expressiveInspection = inspectDesignProfileSource(expressiveProfile);
    const incompleteInspection = inspectDesignProfileSource(`
      :root { --color-canvas: hotpink; }
      @media (prefers-color-scheme: dark) { :root { --color-canvas: black; } }
    `);
    const darkOnlyInspection = inspectDesignProfileSource(`
      @media (prefers-color-scheme: dark) {
        :root { ${requiredSemanticTokens.map((token: string) => `${token}: inherit;`).join(' ')} }
      }
    `);

    assert.deepEqual(expressiveInspection.missingTokens, []);
    assert.equal(expressiveInspection.hasDarkScheme, true);
    assert.match(expressiveProfile, /linear-gradient/);
    assert.match(expressiveProfile, /--radius-panel:\s*32px/);
    assert.match(expressiveProfile, /--duration-base:\s*420ms/);
    assert.equal(incompleteInspection.missingTokens.includes('--color-focus'), true);
    assert.equal(incompleteInspection.missingTokens.includes('--radius-panel'), true);
    assert.equal(darkOnlyInspection.missingTokens.length, requiredSemanticTokens.length);
  });

  it('lets a complete alternative profile resolve every component token', async () => {
    const [foundation, expressiveProfile, tailwindFoundation, componentSources] = await Promise.all(
      [
        readFile(foundationUrl, 'utf8'),
        readFile(expressiveProfileUrl, 'utf8'),
        readFile(tailwindFoundationUrl, 'utf8'),
        readDesignSourceTree(componentStylesUrl),
      ],
    );
    const definitionSources = [foundation, expressiveProfile, tailwindFoundation];
    const usageSources = [foundation, ...componentSources];
    const unresolved = findUnresolvedTokens(definitionSources, usageSources);

    assert.deepEqual(unresolved, []);
    assert.deepEqual(
      findUnresolvedTokens(definitionSources, [
        ...usageSources,
        '.contract-probe { color: var(--truly-undefined-token); }',
      ]),
      ['--truly-undefined-token'],
    );
  });

  it('keeps browser metadata colors owned by the active profile', async () => {
    const [rootRoute, legacyTokens] = await Promise.all([
      readFile(rootRouteUrl, 'utf8'),
      readFile(legacyTokensUrl, 'utf8'),
    ]);

    assert.match(rootRoute, /activeDesignProfile\.themeColors\.light/);
    assert.match(rootRoute, /activeDesignProfile\.themeColors\.dark/);
    assert.match(rootRoute, /href:\s*activeDesignProfile\.cssHref/);
    assert.doesNotMatch(rootRoute, /colorTokens/);
    assert.doesNotMatch(legacyTokens, /#[\da-f]{3,8}\b/i);
  });
});
