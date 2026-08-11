import { createElement, type AnchorHTMLAttributes, type ReactNode } from 'react';

/**
 * `@tanstack/react-router` 의 렌더 전용 대역.
 *
 * `AssetDeepDivePage` 와 그 아래 `WorkspaceNavigation` 은 `<Link>` 를 쓰고,
 * 진짜 `<Link>` 는 라우터 컨텍스트 없이는 던진다. 이 테스트가 확인하려는 것은
 * 이동이 아니라 **세 갈래 전부가 `WorkspaceShell` 안에서 그려지는가**이므로,
 * 앵커만 내보내는 대역으로 충분하다. 라우터를 세우면 라우트 트리 전체가
 * 딸려 오고, 그때 깨지는 것은 이 계약이 아니라 라우터 설정이다.
 */
export function Link({
  children,
  to,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode; to?: string }) {
  return createElement('a', { href: to, ...rest }, children);
}

export function useNavigate() {
  return () => Promise.resolve();
}

export function Outlet() {
  return null;
}
