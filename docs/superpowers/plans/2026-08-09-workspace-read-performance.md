# 핵심 워크스페이스 읽기 성능 최적화

## 목표

- `오늘`, `내 종목`, `시장 연결`, `복기`, `데이터 신뢰도`의 최초 BFF→brain 호출을 화면당 1회로 줄인다.
- 종목·시장 연결·오늘 상세 진입을 각각 하나의 집계 요청으로 통합한다.
- 모든 집계는 동일한 사용자 scope의 `REPEATABLE READ READ ONLY` snapshot에서 수행한다.
- raw SQL과 기존 endpoint는 유지하고 `STOCK_INSIGHT_WORKSPACE_READ_V2=legacy|v2`로 전환한다.
- warm endpoint p95는 500ms 이하, named SQL p95는 250ms 이하를 목표로 한다.

## 실행 순서

1. 현재 호출 수와 query ID를 고정하고 일회용 rehearsal DB 측정 도구를 추가한다.
2. 숨김 화면 UI를 제거하고 기존 URL은 핵심 화면으로 replace 리다이렉트한다.
3. `GET /v1/workspace/views/:view`와 화면별 V2 집계 계약을 추가한다.
4. entity·record 상세 집계 endpoint를 추가하고 브라우저 fan-out을 제거한다.
5. `v_user_feed_dedup` 사용자 선필터와 주요 read SQL 실행계획을 감사한다.
6. rehearsal에서 20% 이상 개선이 증명된 index만 concurrent migration으로 추가한다.
7. candidate에서 V2를 검증하고 기존 endpoint를 한 릴리스 유지한다.

## 안전 경계

- 숨김 사용자 화면만 제거하며 backend API, DB, 공개 데이터 계약은 삭제하지 않는다.
- `EXPLAIN ANALYZE`, index 생성, migration apply는 disposable rehearsal DB에서만 실행한다.
- SQL 원문·파라미터·사용자 ID는 성능 로그에 기록하지 않는다.
- 동일 snapshot을 깨는 connection 병렬화는 하지 않는다.
- 기존 UI 변경과 성능 변경은 서로 다른 커밋으로 유지한다.

## 완료 기준

- 정상 최초 화면 BFF→brain 1회, 정상 상세 1회, cache hit·presentation 전환 0회.
- 기존 500ms 초과 endpoint는 p95 40% 이상 개선한다.
- 기존 500ms 이하 endpoint는 p95 10% 초과 회귀하지 않는다.
- fixture와 rehearsal 응답에서 legacy/V2 의미 동등성을 확인한다.
- 두 사용자 RLS 격리, 부분 실패, invalid query, redirect 무요청 계약을 검증한다.
- format, lint, typecheck, test, build, release gate, graphify, diff check 결과를 기록한다.
