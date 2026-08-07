export const detailInspectorDefaultWidth = 520;
export const detailInspectorMinWidth = 420;
export const detailInspectorMaxWidth = 760;
export const evidenceInspectorWidthStorageKey = 'stock-insight:evidence-inspector-width';
export const stockInspectorWidthStorageKey = 'stock-insight:stock-inspector-width';
export const marketConnectionInspectorWidthStorageKey =
  'stock-insight:market-connection-inspector-width';

const viewportMargin = 24;

export function clampDetailInspectorWidth(width: number, viewportWidth: number) {
  const viewportMaximum = Math.max(
    detailInspectorMinWidth,
    Math.min(detailInspectorMaxWidth, viewportWidth - viewportMargin),
  );
  return Math.round(Math.min(viewportMaximum, Math.max(detailInspectorMinWidth, width)));
}

export function parseStoredDetailInspectorWidth(value: string | null, viewportWidth: number) {
  if (value === null) return detailInspectorDefaultWidth;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return detailInspectorDefaultWidth;
  return clampDetailInspectorWidth(parsed, viewportWidth);
}
