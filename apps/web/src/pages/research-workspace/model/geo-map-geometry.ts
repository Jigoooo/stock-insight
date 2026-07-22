import type { GeoFeature } from '@stock-insight/contracts/geo-api-contract';

type GeoGeometry = GeoFeature['geometry'];
type Position = [number, number];

export function collectGeometryPositions(geometry: GeoGeometry): Position[] {
  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates];
    case 'LineString':
      return geometry.coordinates;
    case 'Polygon':
      return geometry.coordinates.flat();
    case 'MultiPolygon':
      return geometry.coordinates.flatMap((polygon) => polygon.flat());
  }
}

function createMinimumArcLongitudeProjector(positions: readonly Position[]) {
  if (positions.length < 2) return (longitude: number) => longitude;
  const normalizedLongitudes = positions.map(([longitude]) => ((longitude % 360) + 360) % 360);
  const sorted = [...new Set(normalizedLongitudes)].sort((first, second) => first - second);
  let largestGap = -1;
  let arcStart = sorted[0] ?? 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index]!;
    const next = index === sorted.length - 1 ? sorted[0]! + 360 : sorted[index + 1]!;
    const gap = next - current;
    if (gap > largestGap) {
      largestGap = gap;
      arcStart = next % 360;
    }
  }

  const unwrappedLongitudes = positions.map(([longitude]) => {
    let normalized = ((longitude % 360) + 360) % 360;
    if (normalized < arcStart) normalized += 360;
    return normalized;
  });
  const center = (Math.min(...unwrappedLongitudes) + Math.max(...unwrappedLongitudes)) / 2;
  const shift = Math.round(center / 360) * 360;
  return (longitude: number) => {
    let normalized = ((longitude % 360) + 360) % 360;
    if (normalized < arcStart) normalized += 360;
    return normalized - shift;
  };
}

export function unwrapPositionsForMinimumLongitudeSpan(positions: readonly Position[]): Position[] {
  const projectLongitude = createMinimumArcLongitudeProjector(positions);
  return positions.map(([longitude, latitude]) => [projectLongitude(longitude), latitude]);
}

export function summarizeGeometryForEvidence(geometry: GeoGeometry): string {
  if (geometry.type === 'Point') {
    return `점 · 경도 ${geometry.coordinates[0].toFixed(4)}° · 위도 ${geometry.coordinates[1].toFixed(4)}°`;
  }

  const positions = unwrapPositionsForMinimumLongitudeSpan(collectGeometryPositions(geometry));
  const longitudes = positions.map(([longitude]) => longitude);
  const latitudes = positions.map(([, latitude]) => latitude);
  const longitudeSpan = Math.max(...longitudes) - Math.min(...longitudes);
  const label = {
    LineString: '선',
    Polygon: '면',
    MultiPolygon: '다중면',
  }[geometry.type];
  return `${label} · 좌표 ${positions.length}개 · 경도 폭 ${longitudeSpan.toFixed(2)}° · 위도 ${Math.min(...latitudes).toFixed(2)}°~${Math.max(...latitudes).toFixed(2)}°`;
}
