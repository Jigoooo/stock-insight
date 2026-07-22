import { Minus, Plus, RotateCcw } from 'lucide-react';
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';

import styles from './research-workspace-page.module.css';

import {
  collectGeometryPositions,
  summarizeGeometryForEvidence,
  unwrapPositionsForMinimumLongitudeSpan,
} from '../model/geo-map-geometry';

import type { GeoSnapshot } from '@stock-insight/contracts/geo-api-contract';

const EMPTY_MAP_STYLE = {
  version: 8,
  name: 'Futur Insight local geo plane',
  sources: {},
  layers: [
    {
      id: 'geo-plane',
      type: 'background',
      paint: { 'background-color': '#f8fafc' },
    },
  ],
} satisfies StyleSpecification;

const MAP_FIT_PADDING = { top: 56, right: 112, bottom: 56, left: 56 };

function minimumWorldZoomForWidth(width: number): number {
  return Math.max(-2, Math.log2(Math.max(width, 1) / 512));
}

type MapRenderState = 'loading' | 'ready' | 'fallback';
type KeyedMapRenderState = Readonly<{
  key: string;
  status: MapRenderState;
  visibleFeatureCount: number;
}>;

function precisionLabel(
  precision: GeoSnapshot['geojson']['features'][number]['properties']['precisionClass'],
) {
  return {
    exact: '정확 위치',
    approximate: '근사 위치',
    admin_area: '행정구역',
    country: '국가 범위',
    unknown: '정밀도 미상',
  }[precision];
}

function readableTime(value: string | null): string {
  if (value === null) return '원천 시각 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value));
}

function evidenceLabel(
  properties: GeoSnapshot['geojson']['features'][number]['properties'],
): string {
  const evidenceLocator = properties.evidenceLocator;
  if (!evidenceLocator) return '근거 누락';
  return `geo revision ${evidenceLocator.geoEntityRevisionId ?? '누락'} · source revision ${evidenceLocator.sourceRevisionId}${
    evidenceLocator.sourceId ? ` · ${evidenceLocator.sourceId}` : ''
  }`;
}

function addSnapshotLayers(map: MapLibreMap, snapshot: GeoSnapshot) {
  map.addSource('geo-snapshot', {
    type: 'geojson',
    data: snapshot.geojson,
    generateId: true,
  });
  map.addLayer({
    id: 'geo-area-fill',
    type: 'fill',
    source: 'geo-snapshot',
    filter: ['==', '$type', 'Polygon'],
    paint: {
      'fill-color': '#2563eb',
      'fill-opacity': 0.1,
    },
  });
  map.addLayer({
    id: 'geo-line',
    type: 'line',
    source: 'geo-snapshot',
    filter: ['in', '$type', 'LineString', 'Polygon'],
    paint: {
      'line-color': '#2563eb',
      'line-opacity': 0.62,
      'line-width': 1.5,
    },
  });
  map.addLayer({
    id: 'geo-point',
    type: 'circle',
    source: 'geo-snapshot',
    filter: ['==', '$type', 'Point'],
    paint: {
      'circle-color': '#2563eb',
      'circle-radius': 5,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });
}

export function GeoMarketMap({ snapshot }: { snapshot: GeoSnapshot }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const renderKey = `${snapshot.snapshotId}:${
    reducedMotion === null ? 'pending' : reducedMotion ? 'reduced' : 'motion'
  }`;
  const [renderState, setRenderState] = useState<KeyedMapRenderState>(() => ({
    key: renderKey,
    status: 'loading',
    visibleFeatureCount: 0,
  }));
  const currentRenderState = renderState.key === renderKey ? renderState.status : 'loading';
  const visibleFeatureCount = renderState.key === renderKey ? renderState.visibleFeatureCount : 0;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (reducedMotion === null) return;
    let cancelled = false;
    let loaded = false;
    let ownedMap: MapLibreMap | null = null;
    let fitSnapshotToViewport: ((duration: number) => void) | null = null;
    void import('maplibre-gl')
      .then(({ LngLatBounds, Map }) => {
        if (cancelled) return;
        if (!containerRef.current) {
          setRenderState({ key: renderKey, status: 'fallback', visibleFeatureCount: 0 });
          return;
        }
        const minimumWorldZoom = minimumWorldZoomForWidth(containerRef.current.clientWidth);
        const map = new Map({
          container: containerRef.current,
          style: EMPTY_MAP_STYLE,
          center: [0, 20],
          zoom: 1.2,
          minZoom: minimumWorldZoom,
          maxZoom: 14,
          attributionControl: false,
          cooperativeGestures: true,
          renderWorldCopies: true,
          fadeDuration: reducedMotion === true ? 0 : 250,
        });
        const syncMinimumWorldZoom = () => {
          if (cancelled) return;
          setRenderState({ key: renderKey, status: 'loading', visibleFeatureCount: 0 });
          map.setMinZoom(minimumWorldZoomForWidth(map.getContainer().clientWidth));
          fitSnapshotToViewport?.(0);
        };
        map.on('resize', syncMinimumWorldZoom);
        ownedMap = map;
        mapRef.current = map;
        map.once('load', () => {
          if (cancelled) return;
          loaded = true;
          addSnapshotLayers(map, snapshot);
          const updateRenderedFeatureCount = () => {
            if (cancelled) return;
            const renderedEntityKeys = new Set(
              map
                .queryRenderedFeatures({
                  layers: ['geo-area-fill', 'geo-line', 'geo-point'],
                })
                .map((feature) => feature.properties?.geoEntityKey)
                .filter((value): value is string => typeof value === 'string'),
            );
            setRenderState({
              key: renderKey,
              status: 'ready',
              visibleFeatureCount: renderedEntityKeys.size,
            });
          };
          map.on('idle', updateRenderedFeatureCount);
          const coordinates = unwrapPositionsForMinimumLongitudeSpan(
            snapshot.geojson.features.flatMap((feature) =>
              collectGeometryPositions(feature.geometry),
            ),
          );
          const bounds = new LngLatBounds();
          for (const coordinate of coordinates) bounds.extend(coordinate);
          fitSnapshotToViewport = (duration) => {
            if (coordinates.length === 1) {
              map.jumpTo({ center: coordinates[0], zoom: 5 });
            } else if (!bounds.isEmpty()) {
              map.fitBounds(bounds, {
                padding: MAP_FIT_PADDING,
                maxZoom: 7,
                duration,
              });
            }
          };
          fitSnapshotToViewport(reducedMotion === true ? 0 : 500);
        });
        map.once('error', () => {
          if (!cancelled && !loaded) {
            setRenderState({ key: renderKey, status: 'fallback', visibleFeatureCount: 0 });
          }
        });
      })
      .catch(() => {
        if (!cancelled) {
          setRenderState({ key: renderKey, status: 'fallback', visibleFeatureCount: 0 });
        }
      });
    return () => {
      cancelled = true;
      ownedMap?.remove();
      if (mapRef.current === ownedMap) mapRef.current = null;
    };
  }, [reducedMotion, renderKey, snapshot]);

  const resetBounds = () => {
    const map = mapRef.current;
    if (!map) return;
    const coordinates = unwrapPositionsForMinimumLongitudeSpan(
      snapshot.geojson.features.flatMap((feature) => collectGeometryPositions(feature.geometry)),
    );
    if (coordinates.length === 1) {
      map.easeTo({
        center: coordinates[0],
        zoom: 5,
        duration: reducedMotion === true ? 0 : 250,
      });
      return;
    }
    if (coordinates.length > 1) {
      const [first, ...rest] = coordinates;
      if (!first) return;
      void import('maplibre-gl').then(({ LngLatBounds }) => {
        if (mapRef.current !== map) return;
        const bounds = new LngLatBounds(first, first);
        for (const coordinate of rest) bounds.extend(coordinate);
        map.fitBounds(bounds, {
          padding: MAP_FIT_PADDING,
          maxZoom: 7,
          duration: reducedMotion === true ? 0 : 350,
        });
      });
    }
  };

  return (
    <section className={styles.geoMapShell} aria-label="정본 위치 지도와 근거">
      <header className={styles.geoMapMeta}>
        <div>
          <strong>검증된 위치 {snapshot.geojson.features.length}곳</strong>
          <span>
            H3 파생 셀 {snapshot.h3.cells.length}개 · 거부 {snapshot.rejected.count}건
          </span>
        </div>
        <dl>
          <div>
            <dt>스냅샷</dt>
            <dd>{snapshot.snapshotId}</dd>
          </div>
          <div>
            <dt>원천 기준</dt>
            <dd>
              <time dateTime={snapshot.sourceAsOf ?? undefined}>
                {readableTime(snapshot.sourceAsOf)}
              </time>
            </dd>
          </div>
        </dl>
      </header>

      <div
        className={styles.geoMapStage}
        data-map-state={currentRenderState}
        data-map-generation={renderKey}
        data-visible-feature-count={visibleFeatureCount}
      >
        <section
          ref={containerRef}
          className={styles.geoMapCanvas}
          data-testid="geo-map-canvas"
          aria-label="정본 GeoJSON 위치를 표시하는 대화형 지도"
        />
        {currentRenderState !== 'fallback' ? (
          <div className={styles.geoMapControls} aria-label="지도 조작">
            <button
              type="button"
              className={styles.geoMapControl}
              aria-label="지도 확대"
              disabled={currentRenderState !== 'ready'}
              onClick={() => mapRef.current?.zoomIn({ duration: reducedMotion === true ? 0 : 200 })}
            >
              <Plus aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.geoMapControl}
              aria-label="지도 축소"
              disabled={currentRenderState !== 'ready'}
              onClick={() =>
                mapRef.current?.zoomOut({ duration: reducedMotion === true ? 0 : 200 })
              }
            >
              <Minus aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.geoMapControl}
              aria-label="지도 범위 초기화"
              disabled={currentRenderState !== 'ready'}
              onClick={resetBounds}
            >
              <RotateCcw aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <output className={styles.geoMapStatus} aria-live="polite">
          {currentRenderState === 'loading'
            ? '지도 렌더링 준비 중'
            : currentRenderState === 'fallback'
              ? '지도 렌더링을 사용할 수 없어 근거 표를 유지합니다.'
              : '지도 렌더링 준비됨'}
        </output>
      </div>

      <div className={styles.geoEvidenceTableWrap}>
        <table className={styles.geoEvidenceTable}>
          <caption>지도 표시 위치의 도형, 정밀도와 원천 revision</caption>
          <thead>
            <tr>
              <th scope="col">위치</th>
              <th scope="col">도형</th>
              <th scope="col">정밀도</th>
              <th scope="col">불확실성</th>
              <th scope="col">근거</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.geojson.features.map((feature) => (
              <tr key={feature.properties.geoEntityKey} data-testid="geo-fallback-row">
                <td data-label="위치">
                  <strong>{feature.properties.label}</strong>
                  <small>{feature.properties.geoEntityKey}</small>
                </td>
                <td data-label="도형">{summarizeGeometryForEvidence(feature.geometry)}</td>
                <td data-label="정밀도">{precisionLabel(feature.properties.precisionClass)}</td>
                <td data-label="불확실성">
                  {feature.properties.uncertaintyRadiusKm === undefined
                    ? '미제공'
                    : `${feature.properties.uncertaintyRadiusKm} km`}
                </td>
                <td data-label="근거">{evidenceLabel(feature.properties)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={styles.geoLimitations} aria-label="지도 한계">
        {snapshot.limitations.map((limitation) => (
          <li key={limitation}>{limitation}</li>
        ))}
      </ul>
    </section>
  );
}
