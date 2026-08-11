'use client';

import { createContext, useSyncExternalStore, type ReactNode } from 'react';

import {
  DEFAULT_DEPTH_MODE,
  DEPTH_MODE_STORAGE_KEY,
  isDepthMode,
  readStoredDepthMode,
  writeStoredDepthMode,
  type DepthMode,
} from './depth-mode';

export type DepthModeContextValue = {
  mode: DepthMode;
  setMode: (mode: DepthMode) => void;
};

export const DepthModeContext = createContext<DepthModeContextValue | null>(null);

/**
 * 저장된 선호는 React 상태가 아니라 **외부 스토어**다.
 *
 * effect 안에서 `setState` 로 복원하면 마운트마다 연쇄 렌더가 생기고(oxlint
 * `set-state-in-effect`), 첫 렌더에서 곧장 `localStorage` 를 읽으면 SSR 마크업과
 * 어긋나 hydration 이 깨진다. `useSyncExternalStore` 는 hydration 동안
 * 서버 스냅샷을 쓰고 그 뒤에 클라이언트 스냅샷으로 넘어가므로 둘 다 피한다.
 */
let cachedMode: DepthMode | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribeDepthMode(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  // 전역 토글이라 다른 탭에서 바꾼 선호도 따라간다.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== DEPTH_MODE_STORAGE_KEY) return;
    cachedMode = isDepthMode(event.newValue) ? event.newValue : readStoredDepthMode();
    notify();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener('storage', onStorage);
  };
}

function getDepthModeSnapshot(): DepthMode {
  cachedMode ??= readStoredDepthMode();
  return cachedMode;
}

function getServerDepthModeSnapshot(): DepthMode {
  return DEFAULT_DEPTH_MODE;
}

function storeDepthMode(next: DepthMode) {
  if (cachedMode === next) return;
  cachedMode = next;
  writeStoredDepthMode(next);
  notify();
}

export type DepthModeProviderProps = {
  children: ReactNode;
  /**
   * 이 모드로 고정한다. **테스트 전용** — 프로덕션에서는 넘기지 않는다.
   * 특정 모드의 트리를 렌더해 도달성을 검사할 때만 쓴다.
   */
  pinnedMode?: DepthMode;
};

/** 전역 토글 + 클라이언트 저장(IA §9 결정 2). */
export function DepthModeProvider({ children, pinnedMode }: DepthModeProviderProps) {
  const storedMode = useSyncExternalStore(
    subscribeDepthMode,
    getDepthModeSnapshot,
    getServerDepthModeSnapshot,
  );
  const mode = pinnedMode ?? storedMode;

  return <DepthModeContext value={{ mode, setMode: storeDepthMode }}>{children}</DepthModeContext>;
}
