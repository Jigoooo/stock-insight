# 06 — 오케스트레이션·품질·관측성·보안

> Baseline: §14(스케줄링), §16(품질), §17(관측성), §18(오류·복구), §19(보안), §20(비용), §21(테스트)
> 실측 결합: systemd timer·flock·job_run·quality.runs 현행 체계에서의 전환

---

## 1. 워크플로 오케스트레이션 (Baseline §14)

### 1.1 현행 → 목표

| 현행 | 문제 (실측) | 목표 |
|---|---|---|
| cron/systemd 고정 시각 연쇄 | 과거 발행 silent-skip, 시각 역전 이력 | 크론은 시작 신호만, 오케스트레이터가 의존성·재시도·백필 관리 |
| flock + exit 75 | 경합 마스킹은 방지됨 (유지) | 오케스트레이터의 동시성 제한으로 흡수 |
| ops.job_run 5-stage | gbrain stage 29건 pending 방치 | 기대 산출물 미충족 = 실패로 기록 + 알림 |
| 시각 기반 발행 | 데이터 없을 때도 시작 | ready 조건 게이트 (§14.4) |

### 1.2 작업 계층 (Baseline §14.2 채택)

```text
market_calendar
  └─ ingestion_watermarks
      ├─ price_financial_features
      ├─ document_knowledge_pipeline
      └─ event_detection
          ├─ graph_inference
          ├─ theme_community_update
          └─ evidence_pack_build
              ├─ global_report_generation
              ├─ asset_snapshot_generation
              └─ theme_snapshot_generation
                  └─ personalized_feed_build
                      └─ publish_and_cache_invalidate
```

### 1.3 마감 조건 (§14.4)

```text
ready = required_price_sources_complete
    AND official_disclosures_watermark >= cutoff
    AND critical_feature_jobs_success
    AND knowledge_pipeline_lag <= allowed_lag
```

미충족 시: 발행 지연 대기 / 비필수 섹션 제외 `partial` 발행 / 이전 스냅샷 사용(기준 시각 명시) / 필수 소스 누락 시 미발행+기존 유지.

### 1.4 도구 선정

Baseline은 Dagster/Airflow/Temporal 계열을 권장. 단일 호스트(WSL)·소규모 팀 조건에서 1순위 후보는 **Dagster OSS 단일 프로세스** (asset lineage·partition·backfill 내장, PG 메타스토어 공용 가능). 확정·도입은 Wave 1 착수 시 별도 승인. 도입 전까지 현행 systemd timer 유지 + ready 게이트를 스크립트 수준에서 선적용.

### 1.5 증분 재계산 (§14.5)

`changed document → affected claims/events → graph neighborhood → content packs → reports → user feeds` — 각 단계 입력 ID·버전 기록 (lineage). Wave 5에서 활성화.

## 2. 실행 컨텍스트 표준 (Baseline §17.1)

모든 로그·메트릭·job_run에: `run_id, job_name, partition_key, source_id, document_id, event_id, knowledge_snapshot_id, feature_snapshot_id, report_run_id, report_id, model_version, prompt_version, pipeline_version, user_partition_id`.

현행 migration_runs/job_run은 run_id·job_name만 있음 → 컬럼 추가는 additive.

## 3. 품질 게이트 (Baseline §16)

### 3.1 계층별 게이트 (§16.2)

- Raw: 해시·URI 존재, 수집 메타 보존, 파싱 실패도 원본 유지
- Silver: 스키마·단위, entity 연결 임계치, 중복·시간대, claim/event 원문 위치
- Gold: 피처 워터마크·버전, 경로 edge 근거, 반대 근거 검색 수행, 리포트 숫자·인용 자동 검증

### 3.2 품질 점수 정책 (§16.3)

`>= publish_threshold` 자동 발행 / `review~publish` 내부 검수·제한 발행 / `< review` 격리+기존 유지 / 필수 계약 위반은 점수 무관 차단.

현행 quality.runs(warn/fail)와 결합: 현재 stock=warn 상태에서 발행이 계속되는 구조 → warn의 의미를 "제한 발행(배지)"로 정식화하고 fail은 포인터 미교체로 강제.

### 3.3 드리프트 (§16.4)

레코드 수·필드 분포·언어 비율 / 엔티티 미해결률·신규 급증 / predicate 빈도 급변 / NLI 중립·모순 비율 / JSON·인용 실패율. 감지 시 원본 샘플+추출 결과+모델 버전 재현 패키지 생성.

## 4. 관측성·SLO (Baseline §17)

- 핵심 메트릭: 수집(성공률·지연·rate-limit·중복), 지식화(연결률·추출 처리량·NLI 비율·관계 생성/만료/충돌), 분석·생성(피처 신선도·LLM 토큰/비용/스키마 실패·인용 실패·부분 재생성), 서빙(p95·캐시 적중·포인터 연령·피드 커버리지)
- SLO 초기값: 00 문서 §8 표 참조
- 알림 표준: 원인+영향 범위 포함 (`온체인 벤더 B 워터마크 47분 지연, 3개 섹션 영향, 이전 리포트 유지 중` 형식)
- 대시보드: 워크플로 상태·워터마크 히트맵·신선도·발행 현황·LLM 비용·격리 큐·피드 커버리지 (§17.4)
- 운영 알림 채널: Discord/local 전용 (Telegram은 대화 전용 — 기존 규칙 유지)

## 5. 오류 처리·복구 (Baseline §18)

- 장애 대응 표(§18) 채택: 소스 지연=제한 발행+배지 / 가격 기준 소스 누락=검증된 대체 또는 발행 차단 / LLM 실패=백오프·블록 재시도 / 그래프 폭발=allowlist·홉 제한 / 캐시 장애=PG 폴백 / 품질 실패=포인터 미교체
- 재처리 단위 최소화 (§18.1): 문서/claim/그래프 이웃/Content Pack/리포트 섹션/사용자 파티션
- 데드레터 (§18.2): 원본+오류+버전+시도 횟수와 함께 격리, 같은 멱등 키 재처리
- 백업·DR (§18.3):
  - 현행 실측: `archive_mode=off`, 최신 백업 5일+ (기존 PG18 감사에서 확인) → **연속 아카이빙(WAL) + 정기 스냅샷 도입이 Wave 1 필수 과제**
  - 온톨로지·규칙·프롬프트·모델 레지스트리를 같은 복구 단위로 보존
  - 분기별 복구 훈련 + 과거 리포트 재생성으로 계보 완전성 확인
  - RPO 15분/RTO 4시간은 초기 예시 — 단일 호스트 현실에 맞춰 확정

## 6. 보안·컴플라이언스 (Baseline §19)

- 권한 분리: 수집(원본 쓰기만)/지식화(포트폴리오 접근 금지)/개인화(최소 노출도)/읽기 API(발행 모델만)/관리자(감사 로그) — DB role 분리로 구현
- 민감 데이터: 매입가·수량 암호화 또는 노출도만 전달, 로그·프롬프트에 계좌 식별자 금지, 개인화 탈퇴 처리
- 비밀 관리: 키는 비밀 저장소 주입 (기존 규칙: 시크릿 미기록, 일회성 키 승인 가능)
- 콘텐츠: 사실/전망/가설 구분 배지, 확정 권유 차단, 고지사항 (05 문서 §5)

## 7. 성능·비용 (Baseline §20)

- LLM: 대표 문서만 1차 처리, 저비용 모델로 분류·추출 + 고성능 모델은 검증·서술, Evidence Pack+프롬프트 버전 캐시, 변경 섹션만 생성, 일일 토큰 예산 큐
- 그래프: predicate allowlist, 타입별 최대 홉, 고차수 노드 budget, 이웃 사전 계산, 만료 통계관계 기본 제외
- DB: 시계열·문서·관계 파티셔닝, `(subject, object, predicate, valid)` 복합 인덱스, 벡터 검색 전 메타 필터, 리포트 JSONB는 발행본 위주
- 확장 분리 기준 (§20.4): 그래프 p95 초과·시계열 간섭·FTS 한계·큐 용량 초과가 **관측될 때만** AGE/ClickHouse/검색엔진/Kafka 검토

## 8. 테스트 전략 (Baseline §21)

- 단위: 정규화·엔티티 점수·규칙 엔진·경로 점수·순위/다양성·상태 머신
- 계약: 외부 API 스키마·rate limit·수정 데이터, 모델 구조화 출력, API 버전 호환
- 골든셋: 04 문서 §7
- **시간 재현 테스트 (§21.4)**: 과거 컷오프로 파이프라인 재실행, 이후 데이터 혼입 0 검사 — forecast 원장 PIT 검사(현재 위반 0)를 전 계층으로 확대
- 부하·복원력: 뉴스 폭증·벤더 중단·LLM rate limit·중복 트리거
- 발행 전 회귀: 수치 원천 연결 100%, 인용 없는 사실형 문장 0, 라벨 분리, 위험 섹션 존재, 저품질 자동 대체 금지

## 9. Hermes 운영 접점 (환경 특화)

- cron 작업은 Hermes cron이 아니라 systemd/오케스트레이터 소관 유지 (성능·운영위험 있는 runtime 변경 회피 원칙)
- GBrain ingest는 발행 DAG의 마지막 stage로 유지하되 실패 전파 (현재 pending 방치 해소)
- 서브에이전트 대형 감사는 600s 타임아웃 이력 다수 → 검증은 직접 표적 실측 우선
