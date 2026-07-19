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
    const [foundation, expressiveProfile, componentSources] = await Promise.all([
      readFile(foundationUrl, 'utf8'),
      readFile(expressiveProfileUrl, 'utf8'),
      readDesignSourceTree(componentStylesUrl),
    ]);
    const definitions = new Set<string>(
      `${foundation}\n${expressiveProfile}`.match(/--[\w-]+(?=\s*:)/g) ?? [],
    );
    const componentUses = new Set<string>();
    for (const source of [foundation, ...componentSources]) {
      for (const match of source.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
        if (match[1]) componentUses.add(match[1]);
      }
      if (source.includes('readProfileMotion')) {
        for (const match of source.matchAll(/['"](--[\w-]+)['"]/g)) componentUses.add(match[1]);
      }
    }
    const runtimeLocalTokens = new Set(['--strength']);
    const unresolved = [...componentUses]
      .filter((token) => !definitions.has(token) && !runtimeLocalTokens.has(token))
      .sort();

    assert.deepEqual(unresolved, []);
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
