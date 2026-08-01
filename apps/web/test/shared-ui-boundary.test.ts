import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const sourceRoot = new URL('../src/', import.meta.url);
const primitivesUrl = new URL('../src/shared/ui/primitives/', import.meta.url);
const noticesUrl = new URL('../../../THIRD_PARTY_NOTICES.md', import.meta.url);
const productLayers = ['pages', 'widgets', 'features', 'entities'] as const;

async function readSourceTree(directory: URL): Promise<Array<{ path: string; source: string }>> {
  const sources: Array<{ path: string; source: string }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, directory);
    if (entry.isDirectory()) sources.push(...(await readSourceTree(child)));
    else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
      sources.push({ path: child.pathname, source: await readFile(child, 'utf8') });
    }
  }
  return sources;
}

describe('shared UI FSD boundary', () => {
  it('keeps product layers on canonical public component paths', async () => {
    const sources = (
      await Promise.all(
        productLayers.map((layer) => readSourceTree(new URL(`${layer}/`, sourceRoot))),
      )
    ).flat();

    const forbidden = sources.flatMap(({ path, source }) =>
      /@\/shared\/ui\/(?:primitives|animate-ui|chart\/vendor)(?:\/|['"])/.test(source)
        ? [path]
        : [],
    );

    assert.deepEqual(forbidden, []);
  });

  it('removes the legacy primitives directory', () => {
    assert.equal(existsSync(primitivesUrl), false);
  });

  it('retains third-party notices for the local Animate UI source and Sonner transport', async () => {
    const notices = await readFile(noticesUrl, 'utf8');

    assert.match(notices, /## Animate UI/);
    assert.match(notices, /## Sonner/);
    assert.match(notices, /MIT License/);
  });
});
