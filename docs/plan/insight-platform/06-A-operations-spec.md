# 06-A — 운영 심화: 오케스트레이터 자산 그래프·Ready 게이트·DR 런북·테스트 매트릭스

> 상위 문서: `06-operations-quality-security.md`
> 성격: 운영 전환의 구현 명세 + 런북. 도입 항목은 전부 승인 후 실행.

---

## 1. 오케스트레이터 도입 설계 (Wave 1)

### 1.1 선정 기준 채점 (단일 WSL 호스트 · 1인 운영 전제)

| 기준 | Dagster OSS | Airflow | Temporal |
|---|---|---|---|
| asset lineage·partition·backfill 내장 | ◎ (핵심 모델) | △ (DAG 중심) | △ (워크플로 중심) |
| 단일 프로세스 경량 운영 | ◎ (`dagster dev`/daemon) | △ (스케줄러+웹+워커) | △ (서버+워커) |
| PG 메타스토어 공용 | ◎ | ◎ | ◎ |
| Python 수집기 혼용 | ◎ | ◎ | ○ |
| TS 워커 혼용 | ○ (Pipes/subprocess) | ○ | ◎ (TS SDK) |
| 학습·운영 비용 | 중 | 중상 | 상 |

**권고: Dagster OSS 단일 데몬** — 자산(asset) 모델이 Baseline §14.2 계층과 1:1 대응. Temporal은 이벤트 드리븐 요구(Wave 5 증분)가 커지면 재평가. 확정은 주인님 승인.

### 1.2 자산 그래프 정의 (Dagster asset 매핑)

```python
# 개념 명세 (실 코드 아님)
assets = {
  # ingestion (소스별 partition: daily)
  "raw_rss": {"partitions": "30m", "runner": "connector.rss"},
  "raw_ohlcv_kr": {"partitions": "daily-KRX-calendar"},
  "raw_ohlcv_us": {"partitions": "daily-US-calendar"},
  "raw_opendart": {"partitions": "daily"},
  "raw_sec": {"partitions": "daily"},
  # knowledge
  "documents": {"deps": ["raw_rss","raw_opendart","raw_sec"]},
  "doc_entities": {"deps": ["documents","core_entities"]},
  "claims_events": {"deps": ["doc_entities"]},
  "relations": {"deps": ["claims_events"]},
  # analytics
  "feature_snapshots": {"deps": ["ohlcv","financial_facts","macro_vintage"], "partitions": "daily-per-market"},
  "impact_paths": {"deps": ["relations","claims_events","feature_snapshots"]},
  "theme_snapshots": {"deps": ["relations","impact_paths"], "partitions": "daily"},
  # content
  "evidence_packs": {"deps": ["impact_paths","feature_snapshots","claims_events"]},
  "report_daily_stock_kr": {"deps": ["evidence_packs"], "ready_gate": True},
  "report_daily_crypto": {"deps": ["evidence_packs"], "ready_gate": True},
  # personalization / serving
  "user_feeds": {"deps": ["report_*"], "partitions": "user-hash-16"},
  "gbrain_ingest": {"deps": ["report_*"], "failure": "propagate"},   # pending 방치 금지
}
```

전환 전략: 기존 systemd timer는 **트리거만** Dagster sensor/schedule로 위임. 커넥터 스크립트는 subprocess로 그대로 호출 (재작성 없음) → 안정 후 asset 함수로 흡수. 전환 기간 이중 실행 방지: flock 유지 + Dagster 쪽 동시성 1.

### 1.3 실행 컨텍스트 통일

Dagster run_id → `ops.job_run.run_id` 기록, partition_key·asset_key를 summary에. 기존 `expected_output` 검사(count 기대치)는 asset check로 이식.

## 2. Ready 게이트 구현 (오케스트레이터 도입 전 선적용 가능)

### 2.1 게이트 스크립트 규격 (`scripts/ready_gate.ts`)

```text
입력: report_definition.schedule_policy.ready
평가:
  for (dataset, rule) in required_watermarks:
      actual = ops.dataset_watermark[dataset].watermark_at
      required = eval(rule, market_calendar)        # 'market_close+2h' | 'cutoff-30m'
      if actual < required: missing.append(...)
  required_jobs: ops.job_run 최근 성공 여부
출력: {ready: bool, missing: [...], decision: proceed|wait|partial|abort}
정책: max_wait 내 재평가(5분 간격) → timeout 시 on_timeout(partial_publish|keep_previous)
기록: quality.events (gate_name='ready', status, details)
```

market_calendar: `market.trading_calendar` 확보 전 임시로 KRX/US 고정 휴장표 상수 + TODO 마커.

### 2.2 발행 스케줄 재설계 (현행 시각 → 게이트)

| 리포트 | 현행 | 목표 |
|---|---|---|
| stock 아침 브리핑 | 08:00 고정 (과거 skip 사고 이력) | KR pre-open: ready(전일 US close + KR macro) 충족 시 06:30~07:30 창 |
| stock 저녁 | 21:30 | KR close ready 충족 시 17:30~19:00 창 |
| crypto | 08:20/21:45 | 00:00 UTC cutoff ready 충족 시 09:10~10:00 KST 창 |
| 웹 발행 sync | 22:05 (upstream 22:00 의존) | briefing_saved asset 성공 이벤트 직후 (시각 결합 제거) |

## 3. 품질 게이트 운영 규칙 (§16.3 구체화)

| decision | 조건 | 발행 동작 | 알림 |
|---|---|---|---|
| pass | score ≥ 0.85 AND hard gates 통과 | published + 포인터 교체 | 없음(일일 요약만) |
| warn | 0.6 ≤ score < 0.85 | published + `quality_status='partial'` 배지, 섹션 제외 목록 표기 | Discord 요약 |
| fail | score < 0.6 OR hard gate 위반 | 포인터 미교체, report=quarantined | Discord 즉시 (원인+영향) |
| contract-violation | 필수 데이터 계약 위반 | 점수 무관 차단 | 〃 |

hard gates: 사실형 인용 100% / action-advice 0 / cutoff purity / 숫자-Evidence 일치.
현행 quality.runs(warn 연속) → 이 표의 warn 의미로 정식 승격, fail 4건(7/6 이력) 재발 시 포인터 보호가 자동 적용되는지 fault injection으로 검증.

## 4. 관측성 구현 (Wave 1~2)

- 메트릭 저장: 초기에는 PG (`ops.metric_point(name, labels JSONB, value, ts)` hypertable) — 외부 스택(Prometheus) 도입은 병목 관측 후
- 대시보드: 기존 웹 status 화면 확장 (datasets/coverage API 재사용) — ① 워터마크 히트맵 ② 발행 정시성 ③ LLM 비용(일 토큰) ④ 격리 큐 길이
- 알림 라우팅: severity=fail/contract-violation → Discord 즉시, warn → 일일 다이제스트. 알림 문구 표준: `[대상] [원인] [영향 범위] [현재 상태(이전 버전 유지 등)]`
- LLM 비용 계측: report_run에 `token_usage JSONB` (모델별 in/out) — 일일 예산 초과 시 저우선 섹션 생성 보류

## 5. 백업·DR 런북 (Wave 1 필수 — 현행 archive_mode=off)

### 5.1 목표 구성

```text
1) WAL 아카이빙: archive_mode=on, archive_command → /backup/wal/ (로컬 디스크, 주 1회 외부 매체/원격 동기화)
2) 일일 base backup: pg_basebackup 또는 pg_dump(현행 1.36GB — dump 계속 가능 규모)
3) raw-objects: 일별 manifest 체크섬 + 주 1회 rsync 미러
4) 레지스트리(온톨로지·규칙·프롬프트): git repo가 정본 (DB는 캐시) — repo push가 곧 백업
RPO 목표: DB 15분(WAL) / raw 24h. RTO: 4h (단일 호스트 재구축 기준, 실측 후 확정)
```

주의: archive_mode 변경은 PG 재시작 필요 → **컨테이너 재시작 창 승인 필수**, surge 등 동거 스키마 영향 공지 후 실행.

### 5.2 복구 훈련 절차 (분기 1회)

```text
[1] 별도 컨테이너에 최신 base+WAL 복원 (PITR 임의 시점)
[2] 검증: 테이블 count parity + 최신 report 1건 재렌더 (payload→마크다운) 일치
[3] 계보 검증: 해당 report의 evidence→document→raw_object 역추적 성공
[4] 결과 기록: ops.quality_incidents (훈련 태그)
```

## 6. 보안 구현 체크리스트 (Wave 1~4 분산)

| 항목 | Wave | 구현 |
|---|---|---|
| DB role 6종 분리 (02-A §9) | 1 | 신규 워커부터 적용 |
| published-only read (si_readapi) | 2 | content.report RLS 또는 `v_published_reports` 뷰 한정 GRANT |
| 포트폴리오 민감 컬럼 | 4 | avg_price/quantity → 노출도 계산 뷰만 개인화 워커에 GRANT |
| 프롬프트/로그 PII 금지 | 2 | report-workers 입력 조립기에서 user 원시 데이터 미주입 (설계상 차단) |
| 감사 로그 | 1+ | admin 재처리·규칙 변경 → ops.audit_log(actor, action, target, before/after hash) |
| secret | 상시 | env 주입 유지, 신규 키는 1Password/secret 파일 경로 통일, repo secret scan |

## 7. 테스트 매트릭스 (Baseline §21 → 실행 항목)

| 계층 | 테스트 | 도구·위치 | CI 게이트 |
|---|---|---|---|
| 정규화 | 심볼·통화·시간대 순수함수 | vitest `connectors/shared` | PR 필수 |
| 계약 | 외부 API 응답 스키마 (record fixture) | vitest + fixture 갱신 스크립트 | PR 필수 |
| 해소기 | 골든셋 entity-resolution | goldensets CI | 회귀 차단 |
| 추출 | claim/NLI/dedupe 골든셋 | 〃 (LLM 호출은 recorded replay 우선) | 회귀 차단 |
| 규칙 엔진 | 규칙별 입력→출력·억제 조건 | vitest | PR 필수 |
| feature | as_of 재현성 (같은 입력→같은 출력) | vitest + DB fixture | PR 필수 |
| 시간 재현 | 과거 cutoff 파이프라인 재실행, 미래 데이터 혼입 0 | 주간 job (`pit_replay --as-of`) | 주간 리포트 |
| 발행 | 상태 머신·포인터 원자성·부분 재생성 | vitest + 통합(트랜잭션 테스트) | PR 필수 |
| API | v1 envelope 계약 + golden diff | 기존 parity 스크립트 확장 | 배포 게이트 |
| 부하 | 뉴스 폭증(×10)·LLM 지연 주입·중복 트리거 | 시나리오 스크립트 (반기) | 리포트 |
| 복원력 | 포인터 보호 fault injection·데드레터 재처리 | 통합 테스트 | Wave 2 게이트 |

## 8. 운영 이관 일정 요약

| 시점 | 상태 |
|---|---|
| Wave 0 | 현행 systemd 유지 + 워터마크 확대 + 알림 문구 표준화 |
| Wave 1 | WAL 아카이빙(승인) + role 분리 + 오케스트레이터 도입(승인) + ready 게이트 선적용 |
| Wave 2 | 품질 게이트-포인터 연동 + 관측 대시보드 v1 + 골든셋 CI |
| Wave 3+ | lineage 기반 선택 재계산 + 비용 예산 큐 + 분기 복구 훈련 정례화 |
