# Stock Insight DB/API/Frontend 감사 기록 — 2026-07-07

## 결론

- 제품 경계는 조회 전용 리서치 터미널로 유지했다.
- 외부 API 키가 필요한 OpenDART/FMP류 호출은 수행하지 않았다.
- 실제 PostgreSQL/API/UI 점검 중 KR 티커 suffix(`.KS`, `.KQ`)가 API 엔티티 중복을 만드는 결함을 발견해 read-model 계층에서 canonical 6자리 티커로 정규화했다.
- 데이터 결측은 허위 값으로 채우지 않고 기존 `missing/collecting/text_only/stale/error/unsupported` 상태 체계를 유지했다.

## 기준선

- handoff 기준 문서: `docs/handoff_after_graphify_update_prompt.md`
- 문서 기준 커밋: `7246ef4 docs: clarify graphify handoff baseline`
- 제품 구현 기준 커밋: `371e0f9 feat: align stock insight with research app data`
- Graphify 보호 파일: `.graphifyignore`

## Graphify 보호 규칙

`.graphifyignore`에 다음 계열을 제외했다.

- 의존성/런타임: `node_modules/`, `.pnpm-store/`, `.turbo/`, `.vite/`, `.cache/`
- 빌드/생성물: `dist/`, `build/`, `.output/`, `coverage/`, `playwright-report/`, `test-results/`, `routeTree.gen.ts`, `*.gen.ts`
- secrets/env: `.env*`, key/cert/pem, `*secret*`
- DB/dump/backup/state: `*.db`, `*.sqlite*`, `*.dump`, `*.sql.gz`, `data/`, `state/`, `backups/`, `dumps/`
- Graphify 산출물: `graphify-out/`, `.graphify_*.json`, `.graphify_*.txt`

## 실측 DB 감사 요약

읽기 전용 계측 결과:

- `company_financials`
  - `market_snapshot`: 20 rows, `available`, USD, source 누락 0, currency 누락 0
  - `sec_annual_facts`: 5 rows, `available`, USD, source 누락 0, currency 누락 0
- `company_profiles`
  - `available`: 1 row, source 누락 0
  - `text_only`: 7 rows, source_refs 미보유 7 rows — 숫자 승격 전 텍스트 기반 상태로 유지
- `stock_learning_cards`: 8 rows, `text_only`
- `analysis_jobs`: 8 rows, `completed`
- advice 금지 계층
  - journal `advice_prohibited=true`: 3/3
  - journal/alert advice text leak: 0

## 발견 결함과 수정

### 1. KR suffix 중복 엔티티

원천 `stock.candidates`에 다음 canonical ticker가 suffix 버전과 무suffix 버전으로 공존했다.

- `000660`, `005930`, `267260`, `009150`, `042700`, `012450`, `207940`, `036930`

수정 전 API 예시:

- `/api/stocks?market=KR&q=삼성전자` → `KR:005930`, `KR:005930.KS`가 동시에 노출

수정 후 invariant:

- API read-model은 KR/KRX/KOSPI/KOSDAQ 후보·스냅샷·딥캐시 ticker를 `regexp_replace(..., '\\.(KS|KQ)$', '', 'i')`로 canonical 6자리 ticker로 통일한다.
- detail 요청이 `KR:005930.KS`로 들어와도 내부 조회는 `KR:005930` 기준으로 뉴스/학습/프로필/metrics를 읽는다.

수정 파일:

- `apps/api/src/stocks/read-model.ts`
- `apps/api/src/discover/read-model.ts`
- `apps/api/src/dashboard/read-model.ts`
- `apps/api/test/read-model.test.ts`

### 2. 스냅샷 날짜 라벨 접근성 대비

DB-mode axe 점검에서 snapshot bar 날짜 라벨이 애니메이션 opacity 때문에 WCAG AA 색 대비 경계값 아래로 떨어졌다.

수정:

- `snapshot-rise` keyframes에서 부모 bar `opacity: 0.72` 제거
- scale animation은 유지하되 자식 텍스트 대비를 훼손하지 않게 했다.

수정 파일:

- `apps/web/src/widgets/dashboard-shell/ui/dashboard-shell.module.css`

## 검증 결과

- `pnpm exec turbo run test --force` → pass, 9/9 tasks, cache 0
- `pnpm lint` → pass, 0 warnings / 0 errors
- `pnpm exec turbo run typecheck --force` → pass, 11/11 tasks, cache 0
- `DATABASE_URL=... SMOKE_BASE_URL=http://127.0.0.1:6123 pnpm --filter @stock-insight/web smoke:api` → pass
  - dashboard: database/available, stockCount 8
  - meBootstrap: database/available, watchlistCount 8
  - marketNews: database/available, count 16
  - discoverStocks: database/available, count 20
  - stock detail `KR:005930`: database/available
- live API canonical smoke
  - `/api/stocks?market=KR&q=삼성전자`: count 1, `KR:005930`, suffixRows 0
  - `/api/stocks/KR:005930.KS`: `KR:005930` detail로 canonicalized
  - `/api/discover/stocks?market=KR&reason=all`: suffixRows 0
  - `/api/dashboard/today`: dashboard stocks suffixRows 0
- axe DB-mode smoke on `dashboard-shell` → violationCount 0, colorContrastCount 0
- `pnpm test:e2e` → pass, 34 passed / 30 skipped

## 남은 판단

- DB-mode 전체 E2E는 live DB 데이터 shape와 fixture 전용 기대값이 섞이면 테스트 목적이 흐려진다. 현재 공식 표준 E2E는 fallback/fixture matrix 기준으로 통과한다.
- live DB 검증은 API smoke와 focused axe/browser smoke로 분리하는 편이 더 안정적이다.
