# 04-A — 지식화·분석 심화: 추출 스키마·검증 파이프라인·규칙 엔진·Feature Spec·Calibration

> 상위 문서: `04-knowledge-graph-analytics.md`
> 성격: 지식화 워커·규칙 엔진·feature 계산기의 구현 명세.

---

## 1. LLM 추출 워커 (knowledge-workers)

### 1.1 추출 출력 스키마 (structured output — 저장 전 zod/JSON-schema 검증)

```json
{
  "document_id": 123,
  "extraction_run_id": "ext-2026...",
  "model_id": "<ops.model_registry>",
  "prompt_version": 3,
  "entities": [
    {"mention": "삼성전자", "candidate_identifiers": [{"type":"LOCAL_TICKER","value":"005930"}],
     "span": {"chunk_id": 5, "start": 10, "end": 14}, "confidence": 0.97}
  ],
  "claims": [
    {"subject_mention": "삼성전자", "predicate": "GUIDES",
     "object_value": {"metric":"hbm_capacity","direction":"increase","period":"2026H2"},
     "claim_type": "guidance", "speaker": "company", "polarity": 1,
     "quote": {"chunk_id": 5, "start": 3, "end": 88}, "confidence": 0.82}
  ],
  "events": [
    {"event_type": "CAPEX_INCREASE", "actor_mention": "...", "target_mention": "AI_DATA_CENTER",
     "occurred_at": null, "announced_at": "2026-07-17T09:00:00Z",
     "magnitude": 20000000000, "magnitude_unit": "USD",
     "quote": {"chunk_id": 2, "start": 0, "end": 120}, "confidence": 0.9}
  ],
  "relation_candidates": [
    {"subject_mention": "A사", "predicate": "SUPPLIES", "object_mention": "B사",
     "quote": {...}, "confidence": 0.7}
  ]
}
```

규칙:

- mention은 텍스트 그대로 — entity_id 해소는 LLM이 아니라 **결정적 해소기**가 수행 (아래 §2)
- predicate는 allowlist 밖이면 전체 배치 거부가 아니라 해당 항목만 hypothesis 라우팅
- quote(span) 없는 claim/event는 저장 거부 (Quarantine)
- 비용 계층: 1차 분류·추출=저비용 모델, 애매 케이스 재추출=상위 모델 (Baseline §20.1)

### 1.2 워커 처리 단위와 멱등

- 처리 단위: document 1건 (chunk 배열 포함), `idempotency_key = (document_id, extraction_pipeline_version)`
- 재실행 시 이전 extraction_run 결과는 supersede (claim.extraction_run_id 교체가 아니라 신규 run + 구 run 비활성)

## 2. 엔티티 해소기 (deterministic resolver)

점수 함수 (Baseline §8.1 구체화):

```text
score(mention, candidate) =
    1.00 · exact_identifier_match      (티커·CIK·contract 주소)
  + 0.60 · exact_alias_match           (언어별 alias)
  + 0.25 · name_similarity             (trigram/정규화 편집거리)
  + 0.10 · context_market_match        (문서 시장/언어와 상장시장)
  + 0.10 · context_industry_match      (문서 산업 키워드와 industry)
결정: top1 >= 0.8 AND (top1-top2) >= 0.15 → auto-link
      0.5 <= top1 < 0.8               → review queue (document_entity.link_method='context_scored', 미확정)
      top1 < 0.5                       → unresolved (신규 entity 후보: provisional 생성 규칙 §2.1)
```

### 2.1 신규 엔티티 생성 게이트

- provisional 생성 조건: Tier 1~2 문서에서 2회 이상 독립 관측 + identifier 후보 1개 이상
- 승격(active): 공식 identifier 확인 또는 수동 검수
- Company/Stock/Token/Protocol 구분 실패 시 생성 보류 (혼합 오염 방지)

## 3. 검증 파이프라인 (V1→V3)

| 단계 | 구현 | 통과 기준 |
|---|---|---|
| V1 Schema | zod + predicate allowlist + span 존재 + 단위·통화 정규화 | 실패 항목 quarantine |
| V2 NLI | 초기: LLM-as-NLI (저비용 모델, quote ↔ claim 문장 entailment 스코어). 로컬 NLI 모델 도입은 비용 관측 후 | entailment ≥ 0.7 저장, contradiction ≥ 0.6이면 contradicts 링크 생성 |
| V3 Cross-source | dedupe_key 기반 동일 사건 탐색 + 독립 출처 수 계산 (재배포 클러스터=1) | Tier1 출처 1 or 독립 Tier2 ≥ 2 → verified |

commit 라우팅은 Baseline §8.4 표 그대로. verification_status 어휘: `unverified → corroborated → verified | contradicted | retracted | untrusted_legacy`.

## 4. 규칙 엔진 (graph inference)

### 4.1 규칙 정의 포맷 (버전 관리, DB 저장)

```json
{
  "rule_id": "capex_to_supplier_benefit",
  "version": 2,
  "when": [
    {"edge": "?e INCREASES_DEMAND_FOR ?industry", "kind": "event"},
    {"edge": "?product REQUIRED_BY ?industry", "kind": "structural", "min_confidence": 0.6},
    {"edge": "?company PRODUCES ?product", "kind": "structural", "min_confidence": 0.6}
  ],
  "then": {"predicate": "POTENTIALLY_BENEFITS_FROM", "subject": "?company", "object": "?e",
            "relation_kind": "rule_derived", "horizon": "1q"},
  "suppress": [
    {"exists": "?company EXPOSED_TO_THEME ?saturated_theme AND saturation_penalty > 0.7"},
    {"exists": "contradicting_evidence(?company, ?e)"}
  ],
  "confidence_formula": "product(edge_confidence) * hop_decay^(hops-1) * exposure_ratio",
  "expiry": "event.expected_end_at + 90d"
}
```

실행 기록: `inference_run_id + rule_id/version + 입력 relation_ids + 산출 relation/impact_path` (Baseline §9.4). 입력 edge가 supersede되면 산출물 자동 만료 (lineage 전파, Wave 5).

### 4.2 path_score 구현 파라미터 초기값

| 항목 | 초기값 | 비고 |
|---|---|---|
| hop_decay | 0.7 | 최대 홉 4 |
| max_paths_per_event | 50 | 후보, 발행은 상위 N |
| exposure_ratio | 매출 비중(재무 segment 확보 전: 0.5 고정 + 'exposure_unknown' 플래그) | segment 데이터 확보 후 실값 |
| saturation_penalty | 최근 20일 수익률 z-score > 2 → 0.5 | 시장 확인 계층과 공유 |
| corroboration_bonus | 독립 출처 수 log 스케일, 상한 1.3 | |
| freshness | 이벤트 후 경과일 exp 감쇠 (반감기 14d) | |

기여도 저장: `impact_path.explanation = {factor: value}` — 개인화·UI 설명 재사용.

## 5. 임베딩·검색 파이프라인

- 대상: document_chunk (본문), claim(정규화 문장), theme summary
- 모델: `ops.model_registry` 등록 후 확정. 코어 후보 1536d (pgvector HNSW 기본 한계 내). 3072d 채택 시 halfvec
- 인덱스: `HNSW (embedding vector_cosine_ops) WITH (m=16, ef_construction=64)` 초기값 — recall 벤치 후 조정
- 검색 API(내부 전용): 메타 필터(시장·언어·기간·source tier) 선행 → 벡터 top-k → (Wave 3+) rerank
- 용도 제한: Evidence Pack retrieval·중복 탐지·유사 사건 회상. **웹 요청 경로 사용 금지**

## 6. Feature Spec (analytics.asset_feature_snapshot)

### 6.1 feature_set_version=fs_v1 (주식)

| feature | 정의 | 입력 | 결측 처리 |
|---|---|---|---|
| ret_1d/5d/20d/60d | 로그수익률 | ohlcv(adjusted 확보 전 raw+분할경고 플래그) | null |
| vol_20d | 수익률 표준편차 연율화 | ohlcv | null |
| rsi_14, ma20_gap, ma50_gap | 기술 | ohlcv | null |
| volume_z_20d | 거래량 z-score | ohlcv | null |
| rel_strength_market_20d | 시장(KOSPI/SPX proxy) 대비 초과수익 | ohlcv + market_proxy | null |
| flow_net_7d (KR) | 외국인+기관 순매수 | kr-flow 재구조화 후 | data_unavailable |
| short_vol_ratio_5d (US) | short/total volume | finra 도입 후 | data_unavailable |
| earnings_surprise_last | 최근 실적 서프라이즈 | financial_fact + 컨센서스(Later) | data_unavailable |
| val_per/val_pbr | 밸류에이션 | financial_fact + 시총 | null |
| event_count_7d | 관련 event 수 | knowledge.event | 0 |
| graph_theme_exposure | 테마 노출도 | theme_membership + path_score | 0 |

completeness_score = 가용 feature 비율. **리포트 필수 feature 결측 시 추정 대체 금지, `data_unavailable`** (Baseline §10.2).

### 6.2 fs_v1 (코인) — Wave 3+

ret/vol/volume_z 공통 + funding_rate, basis, exchange_netflow, tvl_change, active_addr_change, unlock_within_30d. 온체인 소스 확정 전 data_unavailable.

### 6.3 계산 규약

- `as_of` = 시장별 컷오프, 입력은 `available_at <= as_of`만 (macro는 vintage 조인)
- `input_watermark` JSONB에 소스별 워터마크 스냅샷 기록
- 재계산: feature_set_version 불변, 같은 (asset, as_of, version) upsert 금지 — 입력 정정 시 신규 snapshot + lineage

## 7. 시장 확인 계층 (3축 출력)

리포트·자산 페이지에 전달되는 표준 구조:

```json
{
  "industry_link_strength": {"score": 0.72, "top_paths": [901, 907]},
  "market_confirmation": {"score": 0.4, "evidence": ["rel_strength_20d=+3.2%", "volume_z=1.8"]},
  "expectation_priced_in": {"score": 0.65, "evidence": ["ret_20d z=2.1", "val_per pct=88%"]},
  "verdict_label": "연결 강함 · 시장 부분 확인 · 기대 상당 반영"
}
```

세 축 합산 단일 점수 금지 (Baseline §10.3). verdict_label은 룰 기반 템플릿 (LLM 아님).

## 8. 예측·평가·Calibration (Wave 5)

### 8.1 기존 원장 연결

- `ops.forecast_issuance_ledger` + `feature_snapshot_id`(additive) — 발행 시 스냅샷 고정
- `stock.evaluations`/`forecast_evaluation_ledger` interim은 mark로만, final(matured)만 점수화 (현행 3,083 final outcome이 초기 표본)

### 8.2 calibration_profiles 스펙

```sql
-- 초기 계산 job (일 1회)
-- 그룹: (market, horizon_days, forecast_kind, confidence_label)
-- 지표: n, brier, log_score, hit_rate, avg_predicted_p, reliability_bins(10구간), ece
INSERT INTO public.calibration_profiles (group_key, metrics_json, sample_from, sample_to, computed_at) ...
```

최소 표본 규칙: 그룹 n < 30 → 프로파일 생성하되 `insufficient_sample=true`, scorecard API에서 회색 처리. 사전 등록된 표본 계획 없이 결과 좋은 그룹만 골라 노출 금지 (multiple testing 통제 — White RC/MCS는 모델 비교 도입 시).

### 8.3 scorecard API 산출

`GET /v1/forecasts/scorecard?market=&horizon=`: calibration 프로파일 + 최근 추이 + 한계 문구(표본·구간) 필수 동봉.

## 9. 골든셋 운영 (§21.3 구체화)

- 위치: `packages/goldensets/{entity-resolution, claims, nli, dedupe, impact-paths, reports}/*.jsonl`
- 각 케이스: input + expected + 판정 기준 + reviewer + 승인일
- 실행: 추출·해소·NLI 파이프라인 변경 PR마다 CI에서 정확도/재현율/인용 정확도 비교, 회귀 시 차단
- 초기 규모: 도메인당 30~50케이스 (KR/US/코인 각 포함), Wave 2 산출물로 시작
