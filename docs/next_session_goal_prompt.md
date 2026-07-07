# 새 세션 붙여넣기용 목표 프롬프트

아래 블록만 새 세션 첫 메시지로 붙여넣기.

```text
주인님 목표:
/home/jigoo/.hermes/workspace/stock-insight 에서 docs/research_db_alignment_plan.md 를 단일 로드맵으로 삼아 남은 계획을 계속 진행하라.

현재 확인된 진행 상태:
- Phase 1 완료.
- Phase 2 진행 중.
- Phase 2 중 완료:
  - today dashboard bootstrap UI 주입 완료.
  - market news UI 주입 완료.
  - 뉴스 탭 `내 종목 뉴스` / `시장 전체 뉴스` 분리 완료.
  - 검증 완료: pnpm format:check, lint, typecheck, build, test, test:e2e, production artifact API/browser smoke.
  - /api/dashboard/today = database/available, stock 8개, insight 5개.
  - /api/market-news?type=all = database/available, count 100.
- Phase 6 판단력 평가/매수매도 타이밍 복기는 현재 보류. 주인님이 다시 명시하기 전 구현하지 말 것.

먼저 할 일:
1. cd /home/jigoo/.hermes/workspace/stock-insight
2. docs/research_db_alignment_plan.md 를 다시 읽고 live state 기준으로 현재 완료/미완료 확인.
3. git status --short 확인.
4. 5273 포트는 user-owned dev server일 수 있으므로 kill/restart 금지.
5. 검증 서버가 필요하면 agent-owned 임시 포트(예: 6123)를 쓰고 끝나면 반드시 종료.

진행 원칙:
- mock UI는 삭제하지 말고 fallback/status로 보존.
- DB 결측은 허위 값으로 채우지 말고 missing/collecting/text_only/stale 상태로 표시.
- 주문/브로커/매수매도 실행 기능 금지. 제품은 조회 전용 리서치 터미널.
- React Compiler 전제: 불필요한 useMemo/useCallback 추가 금지.
- DDL, DB write, 백필 실행, cron/config/배포 변경은 주인님 승인 필요.
- read-only inspection, UI/code 변경, test/build/local smoke는 진행 가능.
- 각 concrete slice마다 테스트 추가 → 구현 → pnpm full gate → 가능하면 browser/API smoke → docs/research_db_alignment_plan.md 갱신.

남은 로드맵:
1. Phase 2 마무리
   - stocks dedicated loader: /api/stocks, /api/stocks/:entityKey 를 종목 목록/상세 UI에 주입.
   - portfolio loader/status: /api/me/bootstrap 기반 watchlist/positions 상태 표시.
   - 상태 표시 통합: available/missing/collecting/text_only/stale/error.
   - 종목 상세에 심층 리포트, 출처, 분석 상태, 공부하기 진입점 추가.
   - “조회 전용/주문 기능 없음” 유지.

2. Phase 2.5 Production UI/UX hardening
   - Button/Input/Card/Badge/Skeleton/EmptyState/ErrorState 등 공통 primitive/status 정리.
   - double border, 한글 줄바꿈, URL/ticker overflow, keyboard navigation, accessibility, mobile/reduced-motion smoke.
   - chart lazy/chunk warning 개선 또는 추적 이슈 기록.

3. Phase 3 Additive DB 보강 1차
   - analysis_jobs, analysis_job_events, stock_learning_cards, entity_glossary_terms, v_stock_learning_status.
   - 실제 DDL 전: schema audit, migration plan, backup/rollback, no-destructive proof 작성 후 승인받기.
   - 분석 job 상태와 공부 카드 UI/API 기반 구축.

4. Phase 3.5 데이터 적재/백필 파이프라인
   - watchlist.deep_cache → stock_learning_cards.
   - publication_records/source_documents → source refs.
   - company_profiles/company_financials seed/backfill.
   - 먼저 dry-run/report/idempotency test, 실제 write/backfill은 승인 후.

5. Phase 4 회사정보/재무 구조화
   - company_profiles, company_financials, company_capitalization, v_stock_detail_base, v_stock_latest_snapshot.
   - 출처 없는 숫자는 UI 표시 금지.
   - stale/availability badge 표시.

6. Phase 5 수동 관심종목/보유종목 입력
   - 종목 resolve UI.
   - POST /api/watchlist.
   - POST /api/positions.
   - user_positions 기반 portfolio outlook.
   - 주문/브로커 연결 코드가 전혀 없는지 검증.

7. Phase 7 Alerts/changes/portfolio exposure
   - change_events 기반 “어제와 달라진 것”.
   - watchlist/position별 변화 알림.
   - portfolio exposure graph.
   - source quality/data freshness alert.
   - 알림은 매수/매도 지시가 아니라 변화/확인 필요 항목만 표현.

다음 concrete step:
Phase 2의 stocks dedicated loader slice부터 시작하라.
- resolver/unit test를 먼저 추가.
- /api/stocks 및 /api/stocks/:entityKey 응답을 UI에 주입.
- dashboard bootstrap stock data와 dedicated stock list/detail data의 경계를 분리.
- fallback/local mock은 화면 보존용으로 유지.
- 완료 후 pnpm format:check && pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm test:e2e 실행.
- 가능하면 production artifact API/browser smoke까지 확인.
- docs/research_db_alignment_plan.md Phase 2 진행 상태 갱신.
- 이 concrete step 단위로 완료 보고.
```
