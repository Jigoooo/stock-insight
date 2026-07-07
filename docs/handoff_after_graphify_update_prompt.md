# Graphify 업데이트 후 새 세션 handoff 프롬프트

아래 블록만 새 Hermes 세션 첫 메시지로 붙여넣기.

```text
주인님 목표:
/home/jigoo/.hermes/workspace/stock-insight 에서 Graphify 그래프를 최신 monorepo/Phase8~12 상태로 업데이트한 뒤, 현재까지 완료된 작업을 정확히 기억한 상태로 다음 작업을 이어가라.

절대 원칙:
- 한국어로 보고.
- 먼저 결론부터.
- 장황하게 설명하지 말고 검증 결과 중심으로 보고.
- 제품은 조회 전용 리서치 터미널이다. 주문/브로커/매수·매도 실행 기능 금지.
- 매수·매도 시점/타이밍/추천 판단은 구현하지 말 것.
- API key 필요한 작업(OpenDART/FMP 등)은 명시 승인 전 제외.
- DB 결측은 허위 값으로 채우지 말고 `missing/collecting/text_only/stale/error/unsupported` 상태로 표시.
- Graphify/understand/분석용 작업은 비침습적으로. runtime/config/gateway/cron 변경은 명시 승인 전 금지.

먼저 할 일:
1. 필요한 스킬을 로드하라:
   - `skill_view(name="graphify")`
   - 코드 변경/검증 작업이면 `test-driven-development`, `long-task-orchestration`, 필요 시 `database-store-migration`도 로드.
2. 작업 디렉토리 확인:
   - `cd /home/jigoo/.hermes/workspace/stock-insight`
   - `git status --short`
   - `git rev-parse HEAD`
   - `git ls-remote origin refs/heads/master`
3. 기준 커밋:
   - local/remote 기준 커밋은 `371e0f95f34a84eb5ba7b69c05fd460f90caadac`
   - commit subject: `feat: align stock insight with research app data`
   - 이 커밋은 origin/master에 push 완료됨.
4. Graphify 업데이트를 진행할 때:
   - `.graphifyignore`가 없으면 먼저 생성/검토하라.
   - node_modules, .turbo, dist, build, coverage, DB/dump/sqlite, backups, secrets, generated routeTree 등을 제외하라.
   - monorepo이므로 Graphify 스킬의 `JS/TS pnpm 모노레포 + understand-anything 병행` 지침을 따르라.
   - 기존 `graphify-out/graph.json`이 있으면 raw graph를 무작정 덮어쓰기 전에 SHA/상태를 확인하라.
   - 대형 그래프면 full HTML 렌더링을 강행하지 말고 staged clustering/meta/status 방식으로 보고하라.
   - Graphify 결과물은 `graphify-out/` 아래 생성되며, commit 대상인지 여부는 주인님에게 별도 확인 전까지 보류하라.

현재 완료된 작업 요약:

## Repo/배포 상태
- repo: `/home/jigoo/.hermes/workspace/stock-insight`
- branch: `master`
- remote: `https://github.com/Jigoooo/stock-insight.git`
- pushed commit: `371e0f95f34a84eb5ba7b69c05fd460f90caadac`
- commit: `feat: align stock insight with research app data`
- push 검증: local SHA와 remote `refs/heads/master` SHA 일치.

## 구조 변경
- 기존 flat Vite 앱이 pnpm/turbo monorepo로 정리됨.
- 주요 경로:
  - `apps/web`: 웹 앱, TanStack Router route/API handlers, dashboard UI.
  - `apps/api`: read-model, DB client, backfill/runner, 테스트.
  - `packages/contracts`: Zod DTO/공통 타입.
  - `packages/api-client`: 수동 포트폴리오 API client.
  - `packages/db-schema`: additive DDL/migration contract.
  - `packages/ui`: shared UI package placeholder.
- 검증 기준은 root `pnpm test`, `pnpm lint`, `pnpm typecheck`.

## Phase 8 완료
- `DataAvailability` 7종 상태 정렬:
  - `available`, `missing`, `collecting`, `stale`, `text_only`, `unsupported`, `error`
- `DataQualityPopover`, `StatusQualityStack`, empty-state copy 표준화.
- dashboard/stock detail/discover/learning card availability fixture E2E 확산.
- UI는 출처/갱신/품질 상태를 숨기지 않는 방향으로 정렬됨.

## Phase 9 완료
- SEC EDGAR 공식 JSON 기반 `sec_annual_facts` backfill 구현/적용.
- 대상 US 핵심 5종목:
  - `BMNR`, `FIG`, `NVDA`, `PLTR`, `TSLA`
- DB 결과:
  - `company_financials`: `20 → 25`
  - `sec_annual_facts`: 5건
  - total SEC metrics: 50
  - source/currency/availability 오류 0
  - SEC `migration_runs` 1건
- FIG의 극단 operating/net margin은 삭제하지 않고 warning으로 보존.
- `apps/api/src/stocks/read-model.ts` detail anchor를 보강해 candidate row가 없어도 financial-only detail이 노출되게 함.
- read-model smoke 결과 5종목 모두 detail `available`, `sec_annual_facts:10` 노출.

## Phase 10 완료
- 외부 API/API key 없이 `watchlist.deep_cache`와 앱 DB만 사용.
- 구현:
  - `apps/api/src/backfill/phase10.ts`
  - `apps/api/src/backfill/run-phase10.ts`
  - `apps/api/test/phase10-learning-pipeline.test.ts`
- DB 결과:
  - `analysis_jobs=8`
  - `analysis_job_events=40`
  - `stock_learning_cards=8`
  - `entity_glossary_terms=16`
  - Phase10 `migration_runs` 1건
- 이것은 학습/분석 상태 기록이며, 투자 타이밍/매수·매도 판단 엔진이 아니다.

## Phase 11 완료
- notification/alert 원장 구현.
- 구현:
  - `apps/api/src/backfill/phase11.ts`
  - `apps/api/src/backfill/run-phase11.ts`
  - `apps/api/test/phase11-alert-ledger.test.ts`
  - `packages/db-schema/src/migrations/001_app_research_foundation.ts`
- DB 결과:
  - `user_notification_rules=1`
  - `user_alert_events=3`
  - alert sourceRows 50 중 stock-only alert 3건 생성
  - filteredNonStock 47
  - non-stock leaks 0
  - action-advice leaks 0
- 알림은 “확인 필요” 원장이지 매수/매도 지시가 아니다.

## Phase 12 완료
- 기록형 decision journal 구현.
- 구현:
  - `apps/api/src/backfill/phase12.ts`
  - `apps/api/src/backfill/run-phase12.ts`
  - `apps/api/test/phase12-decision-journal.test.ts`
  - `public.user_decision_journal_entries`
  - `public.v_user_decision_journal`
- DB 결과:
  - `user_decision_journal_entries=3`
  - `v_user_decision_journal=3`
  - `advice_prohibited=true` 3/3
  - action-advice leaks 0
  - Phase12 `migration_runs` 1건
- 실제 `user_positions`, `user_trades`, `user_judgment_evaluations`는 0건 유지.
- 성과평가/잘했다·못했다 판정은 데이터 축적 전까지 보류.

## 최종 DB readback 핵심 수치
- `company_financials=25`
- `analysis_jobs=8`
- `analysis_job_events=40`
- `stock_learning_cards=8`
- `entity_glossary_terms=16`
- `user_notification_rules=1`
- `user_alert_events=3`
- `user_decision_journal_entries=3`
- `user_positions=0`
- `user_trades=0`
- `user_judgment_evaluations=0`

## 최종 검증 완료
- `pnpm test` 통과.
- `pnpm lint` 통과.
- `pnpm typecheck` 통과.
- `git diff --check` 통과.
- secret/artifact scan 통과.
- push 완료.

## 백업 파일
- Phase9 SEC apply 전:
  - `/home/jigoo/.hermes/backups/stock-insight/research_app-sec-edgar-preapply-20260707-121902.dump`
  - sha256 `4dbc25f6695b8551101dfcca67b082ffd106706c6852f93d41cf21fc6a648bd6`
- Phase10 apply 전:
  - `/home/jigoo/.hermes/backups/stock-insight/research_app-phase10-preapply-20260707-130221.dump`
  - sha256 `d08ade46b0291d90035478007a2a93ae28959096632009230faba8dda10088d5`
- Phase11 DDL 전:
  - `/home/jigoo/.hermes/backups/stock-insight/research_app-phase11-preddl-20260707-131320.dump`
  - sha256 `b423ae37d6360b8a0351c80a2f148d2790ae964bc50f56c5b843d09bb681571c`
- Phase12 DDL 전:
  - `/home/jigoo/.hermes/backups/stock-insight/research_app-phase12-preddl-20260707-132001.dump`
  - sha256 `9c916a132eea526d8d95ec323a8fb7123a028eb236e3dd0077d8874c1ebbcfe2`

## 중요한 문서
- `docs/research_db_alignment_plan.md`
  - 원래 장기 로드맵/설계 문서.
- `docs/phase8-12-data-readiness-roadmap.md`
  - Phase8~12 최종 진행/검증/readback 결과 반영 완료.
- `docs/handoff_after_graphify_update_prompt.md`
  - 이 handoff 프롬프트.

## 다음 세션의 안전한 진행 순서
1. Graphify 업데이트를 한다면 먼저 `.graphifyignore`/기존 `graphify-out` 상태를 확인하고, Graphify 스킬 절차대로 진행.
2. Graphify 결과를 보고할 때는 실제 생성된 파일만 말하라. HTML/Obsidian/GraphML 등이 없으면 없다고 말하라.
3. 이후 다음 제품 작업은 별도 목표를 다시 잡아야 한다.
4. API key 필요한 collector, 실제 거래성과 평가, 매수·매도 시점 판단은 주인님이 명시 승인/요청하기 전까지 진행하지 말라.
5. 새 변경을 하면 TDD → 구현 → `pnpm test`/`pnpm lint`/`pnpm typecheck` → 필요 시 browser/API smoke → docs 갱신 → commit/push 순서로 진행.
```
