import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const mapSource = readFileSync(
  new URL('../src/pages/research-workspace/ui/geo-market-map.tsx', import.meta.url),
  'utf8',
);
const panelSource = readFileSync(
  new URL('../src/pages/research-workspace/ui/market-overview-panel.tsx', import.meta.url),
  'utf8',
);
const css = readFileSync(
  new URL('../src/pages/research-workspace/ui/research-workspace-page.module.css', import.meta.url),
  'utf8',
);

describe('P3-WD geo map UI contract', () => {
  it('loads MapLibre lazily with an internal empty style and disposes its runtime', () => {
    assert.match(mapSource, /import\('maplibre-gl'\)/);
    assert.match(mapSource, /EMPTY_MAP_STYLE/);
    assert.match(mapSource, /map\.addSource\('geo-snapshot'/);
    assert.match(mapSource, /ownedMap\?\.remove\(\)/);
    assert.doesNotMatch(mapSource, /https?:\/\//);
  });

  it('keeps renderer state scoped to the current snapshot and motion generation', () => {
    assert.match(mapSource, /renderKey/);
    assert.match(mapSource, /snapshot\.snapshotId/);
    assert.match(mapSource, /renderState\.key === renderKey/);
    assert.match(mapSource, /useState<boolean \| null>\(null\)/);
    assert.match(mapSource, /if \(reducedMotion === null\) return/);
    assert.doesNotMatch(
      mapSource,
      /if \(cancelled \|\| !containerRef\.current\) \{\s*setRenderState\('fallback'\)/,
    );
  });

  it('keeps a semantic evidence fallback when WebGL or motion is unavailable', () => {
    assert.match(mapSource, /data-testid="geo-map-canvas"/);
    assert.match(mapSource, /data-testid="geo-fallback-row"/);
    assert.match(mapSource, /<table/);
    assert.match(mapSource, /evidenceLocator\.sourceRevisionId/);
    assert.match(mapSource, /evidenceLocator\.geoEntityRevisionId/);
    assert.match(mapSource, /summarizeGeometryForEvidence\(feature\.geometry\)/);
    assert.match(mapSource, /data-label="도형"/);
    assert.match(mapSource, /prefers-reduced-motion/);
    assert.match(mapSource, /<output/);
    assert.match(mapSource, /지도 렌더링을 사용할 수 없어 근거 표를 유지합니다/);
  });

  it('does not misrepresent kilometer uncertainty as a fixed screen-pixel halo', () => {
    assert.doesNotMatch(mapSource, /id: 'geo-point-halo'/);
    assert.doesNotMatch(mapSource, /\['get', 'uncertaintyRadiusKm'\]/);
    assert.match(mapSource, /feature\.properties\.uncertaintyRadiusKm/);
  });

  it('renders snapshot lineage and dedicated accessible map controls', () => {
    assert.match(mapSource, /snapshot\.snapshotId/);
    assert.match(mapSource, /snapshot\.sourceAsOf/);
    assert.match(mapSource, /aria-label="지도 확대"/);
    assert.match(mapSource, /aria-label="지도 축소"/);
    assert.match(mapSource, /aria-label="지도 범위 초기화"/);
    assert.match(css, /\.geoMapControl[\s\S]*min-width:\s*44px/);
    assert.match(css, /\.geoMapControl[\s\S]*min-height:\s*44px/);
  });

  it('fits world-spanning points and prioritizes evidence when the renderer is absent', () => {
    assert.match(mapSource, /minimumWorldZoomForWidth/);
    assert.match(mapSource, /Math\.max\(-2, Math\.log2\(Math\.max\(width, 1\) \/ 512\)\)/);
    assert.match(mapSource, /minZoom:\s*minimumWorldZoom/);
    assert.match(mapSource, /renderWorldCopies:\s*true/);
    assert.match(mapSource, /map\.on\('resize', syncMinimumWorldZoom\)/);
    assert.match(mapSource, /map\.setMinZoom\(minimumWorldZoomForWidth/);
    assert.match(mapSource, /right:\s*112/);
    assert.match(mapSource, /map\.on\('idle', updateRenderedFeatureCount\)/);
    assert.match(
      mapSource,
      /setRenderState\(\{ key: renderKey, status: 'loading', visibleFeatureCount: 0 \}\)/,
    );
    assert.match(mapSource, /unwrapPositionsForMinimumLongitudeSpan/);
    assert.match(mapSource, /data:\s*snapshot\.geojson/);
    assert.match(mapSource, /queryRenderedFeatures/);
    assert.match(mapSource, /data-visible-feature-count/);
    assert.match(mapSource, /currentRenderState !== 'fallback'/);
    assert.match(mapSource, /data-label="근거"/);
    assert.match(css, /\.geoMapStage\[data-map-state='fallback'\][\s\S]*height:\s*176px/);
    assert.match(css, /\.geoEvidenceTable td::before/);
    assert.match(css, /\.geoMapControls[\s\S]*grid-template-columns:\s*repeat\(3, 44px\)/);
  });

  it('connects the map only to the map-globe mode and preserves reduced motion', () => {
    assert.match(panelSource, /mode\.id === 'map_globe'/);
    assert.match(panelSource, /<GeoMarketMap snapshot=\{geoSnapshot\}/);
    assert.match(mapSource, /cooperativeGestures:\s*true/);
    assert.match(mapSource, /fadeDuration:\s*reducedMotion === true \? 0 : 250/);
    assert.match(mapSource, /fitSnapshotToViewport\(reducedMotion === true \? 0 : 500\)/);
    assert.match(mapSource, /fitSnapshotToViewport\?\.\(0\)/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.geoMapCanvas/);
  });
});
