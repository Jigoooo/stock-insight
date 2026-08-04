export const roadmapBatches = [
  { state: '진행 중', title: 'Data & Feedback' },
  { state: '예정', title: 'Charts End-to-End' },
] as const;

export type MenuOverlayVariant = 'hairline' | 'soft-surface';
type ResearchActionId = 'evidence' | 'impact' | 'copy-link' | 'archived';
type PanelKind = 'drawer' | 'sheet' | 'bottom-sheet';

export const menuOverlayVariants = [
  { id: 'hairline', label: 'A · Hairline', description: '얇은 경계와 최소 표면' },
  { id: 'soft-surface', label: 'B · Soft Surface', description: '낮은 배경과 그룹 면' },
] as const satisfies ReadonlyArray<{
  id: MenuOverlayVariant;
  label: string;
  description: string;
}>;

export const researchActions = [
  { id: 'evidence', label: '근거 보기', shortcut: 'Enter' },
  { id: 'impact', label: '영향 경로 확인', shortcut: 'I' },
  { id: 'copy-link', label: '링크 복사', shortcut: '⌘ C' },
  { id: 'archived', label: '보관된 항목 열기', shortcut: '', disabled: true },
] as const satisfies ReadonlyArray<{
  id: ResearchActionId;
  label: string;
  shortcut: string;
  disabled?: boolean;
}>;

export const panels = [
  { kind: 'drawer', label: 'Drawer', side: 'left' },
  { kind: 'sheet', label: 'Sheet', side: 'right' },
  { kind: 'bottom-sheet', label: 'BottomSheet', side: 'bottom' },
] as const satisfies ReadonlyArray<{
  kind: PanelKind;
  label: string;
  side: 'left' | 'right' | 'bottom';
}>;

export type ResearchAction = (typeof researchActions)[number];

export function resolveResearchActionResult(action: ResearchAction): string | null {
  return 'disabled' in action && action.disabled ? null : `${action.label} 실행됨`;
}
