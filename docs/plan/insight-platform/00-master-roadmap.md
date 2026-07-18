# 00 — 총괄 로드맵: 기존 레이어 전면 고도화

> 기준 설계: `../stock-crypto-insight-platform-architecture.md` (Baseline v1.0)
> 실측 기준선: 2026-07-18 03:53 KST, `master@7034d77`
> 원칙: Baseline의 목표 아키텍처를 **정본**으로 삼고, 현재 자산은 버리지 않고 그 위로 수렴시킨다.

---

## 1. 한 문장 결론

현재 시스템은 Baseline이 요구하는 9계층 중 **수집(부분)·발행(부분)·예측원장(상당)**만 갖췄고,
**core 식별자, knowledge(Claim/Event), 온톨로지 추론, Feature Store, Content Pack, 개인화 순위화, serving 읽기모델**이 비어 있다.
따라서 로드맵의 축은 "새 기능 추가"가 아니라 **Baseline 스키마·파이프라인으로의 단계적 수렴(migration by convergence)**이다.

## 2. 설계 원칙 (Baseline §4 승계 + 기존 불변식 통합)

1. PostgreSQL = Source of Truth. 원문은 객체 저장소, PG에는 해시·URI·메타 (Baseline §4.1)
2. 쓰기 모델(knowledge/analytics)과 읽기 모델(serving) 분리 (Baseline §4.2)
3. `asserted_fact / reported_claim / rule_derived / statistical / causal_hypothesis / llm_hypothesis` 물리적 구분 (Baseline §4.3)
4. 모든 결과물은 `as_of + data_cutoff + snapshot/model/prompt/pipeline version`으로 시점 재현 가능 (Baseline §4.4)
5. LLM은 계획·추출후보·서술 담당, 사실 저장 권한 없음. 스키마 검증·NLI·출처 연결·품질 게이트 통과 후 발행 (Baseline §4.5)
6. 공통 Content Pack 재사용, 사용자별 LLM 생성 금지 (Baseline §4.6)
7. 채팅형 RAG 없음. `스케줄/변화 → 후보 → 근거 패키지 → 구조화 리포트 → 검증 → 발행 → 조회` (Baseline §1)
8. [기존 승계] surge/ICT 라이브봇 로컬 SQLite 원장은 이 프로그램 범위 밖. 주문 경로 무변경
9. [기존 승계] GBrain은 검증된 발행물의 후행 아카이브. 수치 정본·API 직접 소스로 역사용 금지
10. [기존 승계] cron rc=0 ≠ 업무 성공. 기대 산출물 부재는 skip이 아니라 SLA incident

## 3. 실측 갭 스코어카드 (2026-07-18)

| Baseline 계층 | 현재 구현 | 충족도 | 핵심 갭 |
|---|---|---|---|
| `ingestion` | migration_runs, data_collection_runs, source_collection_policy(15), source_documents 2,826 + revision 5,028 | ◑ 50% | 객체저장소 없음, rss:* provider 미등록, Source Contract 없음, 워터마크 부분 |
| `core` | public.entities (ticker KR151/US102) | ◔ 25% | 회사/증권/상장 분리 없음, identifier registry 없음, alias 없음, 코인 엔티티 미정비 |
| `knowledge` | source_documents(문서), market_signals 13,269(신호), temporal_graph_edge 3,318 | ◔ 20% | chunk/claim/event 테이블 없음, signal→문서 링크 0, graph_evidence source_key 0, NLI 없음 |
| `market` | market_ts.ohlcv 63,109(1D), macro 10,251, financials 208 | ◑ 40% | 조정주가·corporate action·calendar 없음, macro vintage 없음, 재무 fact화 안 됨 |
| `analytics` | forecast issuance 3,554/outcome 8,283 | ◔ 30% | feature snapshot 0, impact_path 없음, 시장확인 계층 없음, calibration 0 |
| `content` | internal_web_publication_records 132, analysis_run_revision 20, briefings | ◑ 45% | report_definition/planner/evidence pack/구조화 JSON 생성 없음, 클릭 가능 출처 5.3% |
| `personalization` | user_watchlist 9, user_positions, user_feed_index 15,074, v_user_feed_dedup | ◑ 40% | 순위화 점수·explanation_codes·다양성 제약·콜드스타트 정책 없음 |
| `serving` | ops.publication_projection_status + API가 원계층 직접 조인 | ◔ 15% | serving.* 읽기모델 전무, 최신 포인터 원자 교체 없음, 캐시 없음 |
| `ops` | job_run, quality.runs/events, dataset_watermark(3종), expected_output | ◑ 45% | 워터마크가 발행 3종뿐, 오케스트레이터 없음, 비용예산·드리프트 없음 |

보조 실측 (전체 근거는 01 문서):

- API 종목 커버리지: KR 21/151(13.9%), US 32/102(31.4%) — universe SoT가 `stock.candidates`
- `market_ts.ohlcv`는 어떤 read-model도 소비하지 않음
- NestJS api-server: 소스 완료(23 라우트), 운영 컨테이너는 레거시(`/api/meta` 404)
- 예측 평가 final 340/4,654(7.3%), calibration_profiles 0
- `stock.*` 시간컬럼 TEXT 24개, market_snapshots에 진단행(api_key_status) 1,479건 혼입

## 4. 전략: 3-트랙 수렴

```text
Track A (운영 정합) ─ 이미 쌓인 자산을 지금 API·상태감시에 연결. Baseline 이전에도 실익
Track B (정본 구축) ─ core/ingestion/knowledge/market canonical 계층을 additive로 신설
Track C (생산 체계) ─ planner→evidence pack→구조화 생성→품질 게이트→원자 발행→개인화→serving
```

기존 `stock/watchlist/public` 스키마는 **transitional source**로 유지한다. rename/drop은 각 Wave의 parity 게이트 통과 후에만 한다 (02 문서 §7).

## 5. Wave 로드맵

Baseline Phase 0~5와 기존 P0~P3 감사 결론을 병합했다. 기간보다 **완료 게이트**로 관리한다.

### Wave 0 — 운영 정합 (Track A, 즉시)

Baseline 착수 전에 현재 자산의 왜곡부터 제거한다.

| # | 작업 | 근거 실측 |
|---|---|---|
| 0-1 | NestJS api-server 운영 cutover + `/api/meta`·23라우트·DB readback 검증 | 컨테이너가 레거시 artifact 실행 중 |
| 0-2 | 종목 universe SoT를 `stock.candidates` → `public.entities`로 교체 | 커버리지 13.9%/31.4% |
| 0-3 | `market_ts.ohlcv` 기반 latest_price/price_series serving 뷰 신설, stocks read-model 연결 | OHLCV 미소비 |
| 0-4 | `ops.dataset_watermark`를 ohlcv/profiles/financials/news/signals/graph/forecast로 확대 | 현재 3종 |
| 0-5 | market_snapshots 진단행 격리(뷰 필터), fiscal_year=0 재무행 quarantine | 오염 1,479 + 20건 |
| 0-6 | RSS provider key(`rss:*`) 를 source_collection_policy에 등록 | UNREGISTERED 다수 |

게이트: `/api/stocks` 커버리지 = entities 전 종목, `/api/status`에 신규 워터마크 노출, cutover 후 골든 diff 0.

### Wave 1 — 기반과 범위 고정 (Baseline Phase 0)

| # | 작업 |
|---|---|
| 1-1 | `core` 스키마 신설: entity / entity_identifier / entity_alias + listing (02 §3) |
| 1-2 | `ingestion` 스키마 신설: source / source_contract / fetch_run / raw_object 레지스트리 + 객체 저장소 도입 |
| 1-3 | 시간 규약 강제: `published_at / observed_at / available_at / ingested_at` + bitemporal (02 §2) |
| 1-4 | 기존 entities·source_documents를 core/ingestion으로 매핑 백필 (KR/US 전 종목 + 코인 상위 Universe) |
| 1-5 | 워크플로 실행 규약: `run_id/partition_key/idempotency_key` 전 워커 통일 (06 §2) |

게이트: 원본→정규화 계보 추적 100%, 동일 입력 재실행 무중복, 소스 지연·누락 대시보드 가시화 (Baseline Phase 0 완료조건).

### Wave 2 — 지식화 최소셋 + 글로벌 리포트 MVP (Baseline Phase 1)

| # | 작업 |
|---|---|
| 2-1 | `knowledge` 스키마: document / document_chunk / claim / event (Baseline §6.2 DDL 채택) |
| 2-2 | RSS 본문(또는 허용 snippet) 수집 + chunking + 임베딩, `summary_ko` 파이프라인 재가동 |
| 2-3 | Entity Linking: 문서→core.entity (현재 RSS entity 링크 0 해소) |
| 2-4 | market_signals 13,269건 이관: 문서 링크 가능한 것 → claim/event, 불가한 것 → `untrusted_legacy` 격리 |
| 2-5 | 핵심 predicate 20~40개 통제어휘 확정 (04 §3) |
| 2-6 | `content` 스키마: report_definition / report_run / report / report_evidence + 기존 briefing 발행을 report_run 구조로 이관 |
| 2-7 | Evidence Pack v1 + 숫자·인용·시점 품질 게이트 + 원자 발행(최신 포인터) |

게이트: 핵심 사실 문장 인용 커버리지 100%, 정시 발행 무개입, 실패 시 이전 리포트 유지 (Baseline Phase 1 완료조건).

### Wave 3 — 그래프 추론·자산/테마 분석 (Baseline Phase 2)

| # | 작업 |
|---|---|
| 3-1 | Structural/Event/Market 3-그래프 분리, 기존 temporal_graph_edge 이관 (04 §4) |
| 3-2 | graph_evidence 25,332건 → relation_evidence로 재구축: 문서 span 연결 가능한 것만 승격, 나머지 격리 |
| 3-3 | 산업 온톨로지 2~3개(예: AI 인프라, 반도체, 전력) + 버전 관리 규칙 엔진 + impact_path |
| 3-4 | `analytics.asset_feature_snapshot` 가동 (candidate_context_features 0건 대체) + 시장 확인 계층 |
| 3-5 | 자산 분석 스냅샷·테마 멤버십(core/adjacent/speculative)·커뮤니티 요약 배치 |
| 3-6 | 반대 근거 검색 의무화 + contradicts 링크 |

게이트: 노출 영향 경로의 edge 단위 근거 추적 100%, 골든셋 관계 품질 통과, 자산·테마 페이지 사전 계산 제공 (Baseline Phase 2 완료조건).

### Wave 4 — 개인화 (Baseline Phase 3)

| # | 작업 |
|---|---|
| 4-1 | `personalization` 스키마 이관: user_profile / user_asset_affinity / user_feed_item |
| 4-2 | 후보 생성 + relevance_score + explanation_codes + 다양성 제약 (05 §4) |
| 4-3 | 기존 user_feed_index/v_user_feed_dedup → 신규 피드 빌더로 전환, 콜드스타트·필터버블 정책 |

게이트: 피드 생성 성공률 목표, 설명 코드 100%, 부정 위험 콘텐츠 미소실, 사용자별 LLM 0회 (Baseline Phase 3 완료조건).

### Wave 5 — 증분 이벤트·평가 고도화 (Baseline Phase 4)

| # | 작업 |
|---|---|
| 5-1 | 이벤트 중요도 트리거 + 증분 브리프 + 계보 기반 선택 재계산 |
| 5-2 | calibration_profiles 가동: Brier/log score, reliability, horizon/시장별 scorecard API |
| 5-3 | 모델·프롬프트 골든셋 평가와 승격 게이트, LLM 비용 예산 큐 |
| 5-4 | 정정·철회·재발행 워크플로 (supersedes + 정정 배지) |

게이트: 중요 사건 목표 시간 내 갱신, 오염 영향 범위 자동 식별, 모델 변경 무회귀 배포 (Baseline Phase 4 완료조건).

### Wave 6 — 확장 검토 (Baseline Phase 5)

관측된 병목에만 전문 인프라(그래프 DB, Lakehouse, Kafka, 검색엔진) 도입. 기술 도입 자체는 완료 조건이 아니다.

## 6. Wave 공통 사전 게이트

1. 착수 전 동일 probe 재실측 (이 문서 수치는 2026-07-18 snapshot)
2. DB 변경은 additive 우선, 기존 테이블 drop/rename은 parity 게이트 후 별도 변경
3. 빌드·배포·스키마 적용은 주인님 명시 승인 후 시작
4. 각 Wave 종료 시 독립 리뷰(HIGH 0) + 실측 readback

## 7. 금지사항 (Baseline §2.2 + 기존 로드맵 §14 통합)

- LLM 생성 관계를 검증 없이 사실 그래프에 반영
- 웹 요청마다 그래프 탐색·벡터 검색·LLM 생성 실행
- 근거 없는 종목 추천·확정적 가격 예측·자동 주문
- 최신 수정값으로 과거 스냅샷 재구성 (look-ahead)
- Granger/상관을 `causes` 관계로 저장
- horizon 전 outcome으로 모델 승격, 만기 전 verdict를 최종 성과로 집계
- source 없는 숫자를 UI `available`로 표시
- cron rc=0을 업무 성공으로 해석
- PG major upgrade와 destructive 스키마 이관을 한 변경으로 묶기
- GBrain을 research_app에 병합하거나 수치 정본으로 사용
- 라이브봇 원장·주문 경로를 이 프로그램에 포함
- `latest` image tag로 production 전환

## 8. KPI / SLO (Baseline §17.3 채택 + 실측 초기값)

| SLI | 현재 실측 | 초기 SLO |
|---|---|---|
| 인용 가능한 핵심 주장 비율 | 발행 레코드 클릭가능 출처 5.3% | 100% (사실형 문장) |
| 자산 분석 스냅샷 커버리지 | KR 13.9% / US 31.4% (API 기준) | Universe 95% 이상 |
| 필수 소스 수집 성공률 | 워터마크 3종만 계측 | 일 99% (전 데이터셋) |
| 정시 발행률 | silent-skip 이력 존재 | 월 98% + skip=incident |
| 시점 재현성 | forecast PIT 위반 0 (유지) | cutoff 이후 데이터 혼입 0 |
| 평가 성숙도 | final 7.3% | maturity 도달 후보의 final 평가 100% |
| 읽기 API | serving 계층 없음 | 캐시 적중 p95 300ms / 월 99.9% |
