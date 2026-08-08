import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const layoutModuleUrl = new URL(
  '../src/pages/research-workspace/model/detail-inspector-layout.ts',
  import.meta.url,
);
const frameModuleUrl = new URL(
  '../src/pages/research-workspace/ui/detail-inspector-frame.tsx',
  import.meta.url,
);

describe('detail inspector frame', () => {
  it('shares the approved width behavior while keeping inspector storage independent', async () => {
    assert.equal(existsSync(layoutModuleUrl), true, 'the reusable detail layout module must exist');

    const layout = await import(layoutModuleUrl.href);
    assert.equal(layout.detailInspectorDefaultWidth, 520);
    assert.equal(layout.detailInspectorMinWidth, 420);
    assert.equal(layout.detailInspectorMaxWidth, 760);
    assert.equal(layout.clampDetailInspectorWidth(300, 1440), 420);
    assert.equal(layout.clampDetailInspectorWidth(900, 1440), 760);
    assert.equal(layout.clampDetailInspectorWidth(760, 700), 676);
    assert.equal(layout.parseStoredDetailInspectorWidth('612', 1440), 612);
    assert.equal(layout.parseStoredDetailInspectorWidth('invalid', 1440), 520);
    assert.equal(layout.evidenceInspectorWidthStorageKey, 'stock-insight:evidence-inspector-width');
    assert.equal(layout.stockInspectorWidthStorageKey, 'stock-insight:stock-inspector-width');
    assert.equal(
      layout.marketConnectionInspectorWidthStorageKey,
      'stock-insight:market-connection-inspector-width',
    );
    assert.equal(layout.historyInspectorWidthStorageKey, 'stock-insight:history-inspector-width');
    assert.notEqual(layout.evidenceInspectorWidthStorageKey, layout.stockInspectorWidthStorageKey);
    assert.notEqual(
      layout.marketConnectionInspectorWidthStorageKey,
      layout.evidenceInspectorWidthStorageKey,
    );
    assert.notEqual(
      layout.marketConnectionInspectorWidthStorageKey,
      layout.stockInspectorWidthStorageKey,
    );
    assert.notEqual(
      layout.historyInspectorWidthStorageKey,
      layout.evidenceInspectorWidthStorageKey,
    );
    assert.notEqual(layout.historyInspectorWidthStorageKey, layout.stockInspectorWidthStorageKey);
    assert.notEqual(
      layout.historyInspectorWidthStorageKey,
      layout.marketConnectionInspectorWidthStorageKey,
    );
  });

  it('requires an explicit detail identity and exposes the resolved presentation to content', () => {
    assert.equal(existsSync(frameModuleUrl), true, 'the reusable detail frame must exist');

    const source = readFileSync(fileURLToPath(frameModuleUrl), 'utf8');
    assert.match(source, /detailKey: string \| null/);
    assert.match(source, /children: \(presentation: DetailInspectorPresentation\) => ReactNode/);
    assert.match(
      source,
      /export type DetailInspectorPresentation = 'drawer' \| 'modal' \| 'mobile'/,
    );
  });
});
