# 05-A — 콘텐츠·서빙 심화: Report Definition·블록 스키마·API 계약·Cutover 런북

> 상위 문서: `05-content-personalization-serving.md`
> 성격: report-workers·NestJS 구현 명세 + Wave 0 cutover 실행 런북.

---

## 1. Report Definition 초기 3종 (실제 값)

### 1.1 daily_market_stock (KR 예시 — US는 universe·cutoff만 다름)

```json
{
  "report_type": "daily_market_stock",
  "audience_type": "global",
  "version": 1,
  "schedule_policy": {
    "trigger": "ready_gate",
    "ready": {
      "required_watermarks": {"ohlcv_1d": "market_close+2h", "market_snapshots": "cutoff", "rss_news": "cutoff-30m"},
      "required_jobs": ["feature_snapshot_build"],
      "max_wait_minutes": 90,
      "on_timeout": "partial_publish"
    },
    "market": "KR", "cutoff_rule": "KRX close 15:30 KST + 2h"
  },
  "section_policy": {
    "sections": [
      {"key": "market_summary",  "generator": "template", "required": true},
      {"key": "macro_drivers",   "generator": "llm", "evidence_budget": 8, "max_chars": 900},
      {"key": "top_events",      "generator": "llm", "evidence_budget": 12, "max_items": 8, "required": true},
      {"key": "theme_changes",   "generator": "llm", "evidence_budget": 8, "max_items": 5},
      {"key": "asset_watch",     "generator": "llm", "evidence_budget": 10, "max_items": 10},
      {"key": "calendar_risks",  "generator": "template", "required": true},
      {"key": "counter_evidence_gaps", "generator": "llm", "required": true}
    ],
    "coverage_limits": {"events": 12, "themes": 8, "assets": 20},
    "diversity": {"max_share_per_entity": 0.25, "min_negative_slots": 1, "dedupe_vs_previous_days": 3}
  },
  "quality_policy": {
    "minimum_source_tier": 2,
    "publish_threshold": 0.85, "review_threshold": 0.6,
    "hard_gates": ["citation_coverage_1.0_for_facts", "no_action_advice", "cutoff_purity"]
  },
  "language": "ko-KR"
}
```

### 1.2 daily_global_crypto — cutoff `09:00 KST (00:00 UTC)` 고정, 섹션은 Baseline §12.2의 7종, ready에 온체인 워터마크 포함.

### 1.3 asset_snapshot — trigger: `weekly(watchlist 전 종목) + event_importance >= threshold(개별)`. 섹션: 개요(template)/최근 변화(llm)/재무·가격 확인(template+metric)/영향 경로(llm)/촉매·위험·반대근거(llm)/출처.

## 2. 블록 스키마 (zod — packages/contracts 신설 `report-content.ts`)

```ts
const blockTypeSchema = z.enum(['fact','reported_claim','metric','inference',
  'market_signal','counter_evidence','risk','unknown','methodology_note']);

const reportBlockSchema = z.object({
  block_id: z.string(),                       // 부분 재생성 단위
  block_type: blockTypeSchema,
  text: z.string().min(1).max(2000),
  citation_ids: z.array(z.string()).default([]),      // block_type=fact/metric/reported_claim이면 min(1)
  impact_path_ids: z.array(z.number()).default([]),   // inference이면 min(1)
  metric_refs: z.array(z.object({ fact_id: z.number(), rendered: z.string() })).default([]),
  confidence: z.number().min(0).max(1),
}).superRefine((b, ctx) => {
  if (['fact','metric','reported_claim'].includes(b.block_type) && b.citation_ids.length === 0)
    ctx.addIssue({code:'custom', message:'사실형 블록은 인용 필수'});
  if (b.block_type === 'inference' && b.impact_path_ids.length === 0)
    ctx.addIssue({code:'custom', message:'추론 블록은 impact_path 필수'});
});

const reportPayloadSchema = z.object({
  title: z.string(), thesis: z.string(),
  sections: z.array(z.object({ section_key: z.string(), blocks: z.array(reportBlockSchema) })),
  risks: z.array(reportBlockSchema), unknowns: z.array(reportBlockSchema),
  freshness: z.record(z.string()),            // 섹션별 데이터 기준시각
  citation_map: z.record(z.object({ document_id: z.number(), quote: z.string().optional(), url: z.string().nullable() })),
});
```

검증기(report-workers 내):

1. zod parse → 실패 블록 목록
2. metric_refs의 fact_id가 Evidence Pack에 존재하는지 (숫자 위조 차단)
3. citation quote가 원문 chunk에 실제 존재하는지 (substring/fuzzy)
4. action-advice sanitizer (기존 `containsActionAdvice` 재사용·강화)
5. cutoff purity: 인용 문서의 available_at <= data_cutoff
6. 실패 블록만 재생성 큐 (block_id 단위, 최대 2회 → 이후 섹션 제외 or 격리)

## 3. Evidence Pack 빌더

입력: (topic: event|theme|asset, as_of, budget) → 출력: Baseline §11.4 구조.

선정 알고리즘:

```text
1. topic 직접 연결 claim/event/fact (Tier·verification 순 정렬)
2. impact_path 상위 (path_score)
3. metric: feature_snapshot + financial_fact에서 topic 관련 수치
4. counter: contradicts 링크 + 반대 방향 path + saturation 신호 — 의무 검색, 없으면 "unknowns"에 기록
5. citation_map 구성: document_id → 대표 quote + url(nullable)
6. retrieval_trace 기록 (policy_version, candidate/selected count)
budget 규칙: 섹션 evidence_budget 초과분은 relevance 순 절단, 절단 사실을 trace에 남김
```

## 4. 발행 트랜잭션 (Baseline §11.7 구현 시퀀스)

```text
BEGIN;
  INSERT content.report (status='draft', content_hash=...);
  INSERT content.report_evidence (...);
  UPDATE content.report SET status='validating' → 검증기 실행(트랜잭션 밖 계산, 결과만 기록)
  -- 게이트 통과 시:
  UPDATE content.report SET status='published', published_at=now();
  UPDATE content.report SET status='superseded' WHERE report_id = 이전 포인터 대상;
  UPSERT serving.latest_report_pointer (report_type, scope_key) → 신규 report_id;
COMMIT;
→ 캐시 무효화 이벤트 (버전 키 회전)
실패 시: ROLLBACK — 이전 포인터 유지, report는 draft/quarantined로 보존
```

멱등: `UNIQUE (report_run_id, report_type, scope)` — 재시도 시 기존 draft 재사용.

## 5. NestJS v1 API 상세 계약

### 5.1 공통 envelope (기존 v3 meta와 병렬)

```ts
const v1EnvelopeSchema = <T>(payload: T) => z.object({
  as_of: z.string().datetime(),
  data_cutoff: z.string().datetime().nullable(),
  freshness: z.record(z.enum(['fresh','stale','partial','missing'])),
  quality_status: z.enum(['complete','partial','degraded']),
  version: z.string(),                        // report/content 버전 키 (캐시 키와 동일)
  payload,
  disclosures: z.array(z.string()),           // 고지 문구
});
```

### 5.2 라우트·원천·페이지네이션

| 라우트 | 원천 | 캐시 키 | 비고 |
|---|---|---|---|
| GET /v1/reports/global | latest_report_pointer → content.report | `rpt:{type}:{scope}:{version}` | date 파라미터 시 과거 버전 |
| GET /v1/reports/{id}/evidence | report_evidence + citation_map | `ev:{id}` | 불변 — 장기 캐시 |
| GET /v1/assets/{key}/analysis | latest_asset_snapshot | `asset:{key}:{version}` | 스냅샷 없으면 availability=collecting |
| GET /v1/assets/{key}/prices | price_series read-model | 짧은 TTL | range=1M/3M/1Y/5Y, cursor 없음(범위형) |
| GET /v1/assets/{key}/fundamentals | financial_fact (concept pivot) | `fin:{key}:{maxFactId}` | 분기/연간 토글 |
| GET /v1/assets/{key}/events | knowledge.event | cursor=(occurred_at,event_id) | keyset 페이지네이션 |
| GET /v1/assets/{key}/forecasts | forecast 원장 + scorecard | `fc:{key}:{date}` | 한계 문구 필수 |
| GET /v1/themes/{id}/analysis | latest_theme_snapshot | 〃 | |
| GET /v1/graph/paths/{id} | impact_path + relation + evidence | 불변 캐시 | |
| GET /v1/datasets/coverage | dataset_watermark 확장판 | 60s TTL | 운영·UI 공용 |

오류 규약: 404(존재하지 않는 자산), 409(스냅샷 재생성 중 — Retry-After), 400(검증 실패 코드 목록). 인증: 현행 세션 체계 유지, `/v1/reports/personalized/*`만 로그인 필수.

### 5.3 v3→v1 병행 정책

- v3(workspace/feed/...) 계약 동결 (버그픽스만)
- v1은 additive 신규 — 웹 화면 단위로 점진 전환, 화면 전환 완료 시 해당 v3 라우트 deprecation 헤더 → 2단계 후 제거 (contract 테스트로 소비자 0 확인)

## 6. 개인화 파이프라인 구현 (personalization-workers)

```text
입력: published report set + user_asset_affinity + 최근 노출 이력
1. 후보 생성: (a) 보유·관심 직접 (b) 테마 멤버십 (c) relation 1~3hop (v_user_feed_dedup 로직 이관)
             (d) 시장 필수 (editorial 정책 플래그)
2. 점수: relevance_score = 1.0·explicit + 0.8·portfolio_exposure + 0.5·graph_proximity(1/hops)
                          + 0.6·event_materiality + 0.7·risk_relevance + 0.3·novelty
                          + 0.3·evidence_quality − 0.5·repetition − 0.4·low_confidence
   (초기 가중치 — 골든 사용자 시나리오로 튜닝, 계수는 config 버전 관리)
3. 다양성: max_share_per_entity 0.3, negative slot ≥ 1, market 필수 슬롯 상단 고정
4. 산출: user_feed_item (rank, explanation_codes[], generated_at)
파티션: user_id 해시 16파티션, 파티션별 재시도 (Baseline §18)
```

explanation_codes 어휘(초기): `WATCHLIST_DIRECT, HOLDING_DIRECT, THEME_MEMBER, SUPPLY_CHAIN_{n}HOP, CONCENTRATION_RISK, MARKET_ESSENTIAL, NEGATIVE_ON_HOLDING, NEW_NARRATIVE`.

## 7. Wave 0 Cutover 런북 (W0-1 상세)

```text
[사전] 승인 확인 → 이미지 빌드 (tag=git SHA) → compose에 api-server 서비스 추가 (내부 포트, 외부 미노출)
[1] 병행 기동: docker compose up -d stock-insight-api → /api/health·/api/meta 200 확인
[2] golden diff: scripts/parity-diff.ts — 레거시:8091 vs api-server:내부포트, 23라우트 × (정상+오류) 케이스
    통과 기준: 응답 바디 diff 0 (타임스탬프 필드 제외), 상태코드 일치 100%
[3] 전환: web SSR fetch base(STOCK_INSIGHT_API_BASE_URL) → api-server로 변경 or nginx /api/* 라우팅 전환
[4] 검증: 브라우저 QA (dashboard/stocks/detail/portfolio/workspace 5화면, console error 0)
         + curl 스모크 (200/401/404 각 1)
[5] 관찰: 24h 병행 유지, 오류율·p95 비교
[6] 종료: 레거시 API 핸들러 비활성 커밋 (별도 승인)
[롤백] 3단계 역방향 (fetch base 원복) — 5분 내
```

## 8. 웹 화면 영향 요약

- 종목 목록: 53→253 확대 (availability 뱃지 다수) — 목록 가상화·필터 기본값 재검토
- 종목 상세: prices API로 차트 신설 여지 (기존 lazy chart chunk 주의)
- status 화면: 데이터셋 12종 표기 — dataset 단위 stale 표기로 재구성
- 신규 v1 화면(리포트 뷰어·evidence 카드·graph path)은 Wave 2~3 산출물과 동기
