/**
 * `@/pages/auth/model/auth-functions` 의 대역.
 *
 * 페이지가 `logout` 을 기본값으로 정적 import 한다. 진짜 모듈은
 * `@/server/auth/*`(레이트 리미터·세션 쿠키·CSRF)를 모듈 스코프에서 평가하므로,
 * 화면 계약 하나를 확인하려고 서버 인증 스택을 통째로 세우게 된다.
 */
export async function logout() {
  return { ok: true } as const;
}
