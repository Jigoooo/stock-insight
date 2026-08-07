export const evidenceInspectorDefaultWidth = 520;
export const evidenceInspectorMinWidth = 420;
export const evidenceInspectorMaxWidth = 760;
export const evidenceInspectorWidthStorageKey = 'stock-insight:evidence-inspector-width';

const viewportMargin = 24;

export function clampEvidenceInspectorWidth(width: number, viewportWidth: number) {
  const viewportMaximum = Math.max(
    evidenceInspectorMinWidth,
    Math.min(evidenceInspectorMaxWidth, viewportWidth - viewportMargin),
  );
  return Math.round(Math.min(viewportMaximum, Math.max(evidenceInspectorMinWidth, width)));
}

export function parseStoredEvidenceInspectorWidth(value: string | null, viewportWidth: number) {
  if (value === null) return evidenceInspectorDefaultWidth;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return evidenceInspectorDefaultWidth;
  return clampEvidenceInspectorWidth(parsed, viewportWidth);
}
