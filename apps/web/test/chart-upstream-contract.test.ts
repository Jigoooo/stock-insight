import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { describe, it } from 'node:test';

const webPackageUrl = new URL('../package.json', import.meta.url);
const componentsUrl = new URL('../components.json', import.meta.url);
const manifestUrl = new URL(
  '../src/shared/ui/chart/vendor/bklit/upstream-manifest.json',
  import.meta.url,
);
const noticesUrl = new URL('../../../THIRD_PARTY_NOTICES.md', import.meta.url);
const productRoots = ['pages', 'widgets', 'features', 'entities'].map(
  (layer) => new URL(`../src/${layer}/`, import.meta.url),
);

async function sourceFiles(directory: URL): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, directory);
    if (entry.isDirectory()) result.push(...(await sourceFiles(child)));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) result.push(await readFile(child, 'utf8'));
  }
  return result;
}

describe('chart upstream contract', () => {
  it('pins official sources and licenses', async () => {
    const packageJson = JSON.parse(await readFile(webPackageUrl, 'utf8'));
    const components = JSON.parse(await readFile(componentsUrl, 'utf8'));
    const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
    const notices = await readFile(noticesUrl, 'utf8');

    assert.equal(components.registries['@bklit'], 'https://ui.bklit.com/r/{name}.json');
    assert.equal(packageJson.dependencies['lightweight-charts'], '5.2.0');
    assert.equal(manifest.revision, 'c57f66bfa7c3198edb677b567ce08cbf364ae159');
    assert.deepEqual(manifest.registryItems, [
      '@bklit/area-chart',
      '@bklit/composed-chart',
      '@bklit/reference-area',
    ]);
    assert.match(notices, /## Bklit UI/);
    assert.match(notices, /## TradingView Lightweight Charts/);
    assert.match(notices, /Apache License, Version 2\.0/);
    assert.match(notices, /TradingView Lightweight Charts™/);
  });

  it('keeps renderer imports inside shared ui chart', async () => {
    const sources = (await Promise.all(productRoots.map(sourceFiles))).flat();
    const offenders = sources.filter((source) =>
      /from ['"](?:lightweight-charts|@\/shared\/ui\/chart\/vendor\/bklit)/.test(source),
    );
    assert.equal(offenders.length, 0);
  });
});
