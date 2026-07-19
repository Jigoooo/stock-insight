# Stock-Insight Backend/DB 강화 Implementation Plan

> **For Hermes:** 새 세션에서는 먼저 `NEW-SESSION-GOAL.md`와 이 문서를 읽고 해시·live 상태를 재검증한다. 구현 승인 후 `subagent-driven-development`와 `test-driven-development`를 사용해 bundle별 RED→GREEN→독립 리뷰를 수행한다.

**Goal:** UI를 동결한 채 Stock-Insight의 backend·PostgreSQL을 근거·시간·계보·관계 중심의 금융 데이터 운영체계로 완성하고, 승인된 Universe·Source Contract·관계 유형에 대해 machine gate 100%를 달성한다.

**Architecture:** PostgreSQL을 단일 Source of Truth로 유지하고 `core → ingestion → knowledge → analytics → content/personalization → serving → ops`를 불변 revision과 bitemporal 계약으로 연결한다. 회사·주식·섹터·테마·밸류체인·공급망·소유·통계 관계를 하나의 점수로 섞지 않고 typed relation identity/revision/evidence와 목적별 measurement로 저장한다. Kafka·Graph DB·Redis는 broker/runtime를 성급히 설치하지 않되 event envelope, transactional outbox/inbox, graph API/export, cache version 계약을 지금 완성해 이후 무재설계 전환이 가능하도록 한다.

**Tech Stack:** PostgreSQL 16, TimescaleDB 2.28, pgvector 0.8, TypeScript/Node/Nest, pnpm/turbo, Docker, systemd host supervision, Dagster(도입 승인 후 data orchestration), OpenLineage semantics, PostgreSQL transactional outbox.

**Authoritative baseline:** `docs/plan/stock-crypto-insight-platform-architecture.md`는 근거 문서이지만 이 문서가 backend/DB 강화 실행 정본이다. 기존 `docs/plan/insight-platform/`은 A~G 이력·현황 근거로 보존하며 수정하지 않는다.

**Document state (2026-07-19 15:32 KST checkpoint):** B0~B5는 `master@f4e4ede`로 Live PostgreSQL/API에 배포·readback·push 완료했다. B6~B9, UI integration, T2/T3, 통합배포는 주인님이 한 트랙으로 명시 승인했고 현재 current-state 재측정 단계다.

**B6 checkpoint (2026-07-19 18:00 KST):** B6 코드 계약 완료 — relation-policy(승격정책·superhub cap·promotionEligible), builder 6종(official-sector/supply-chain/ownership/etf-overlap/news-relation/product-similarity) + builder-core, relation-candidate-store(evidence-before-revision·policy-status 이중 게이트). migration 024 확장: source_revision evidence FK + 승격 가능 8개 predicate approved ontology 멱등 시드(NEWS_COMENTION 의도적 제외). 검증: api 223 pass/0 fail·typecheck·oxlint 0, rehearsal DB(`b3_rehearsal_20260719`) 2회 재적용·evidence 254 불변·DB 직접 공격 3종(무근거 accepted/비승인 predicate/잘못된 payload hash) 전부 차단 실증. 독립 리뷰 BLOCKER 0/HIGH 0. 적대 프로브로 발견한 payloadHash 입력순서 의존성(validFrom first-seen)은 earliest-validFrom 정규화로 수정하고 determinism 회귀 테스트로 고정. **B7 이월 항목(MEDIUM)**: builder는 per-hub cap만 집계하며 cross-hub 누적 degree(한 종목이 여러 ETF/owner에 걸친 총 degree)는 미집계 — B7 graph measurement에서 snapshot 단위 degree 계측으로 처리한다. Live DB 적용·commit은 통합배포 게이트에서 일괄 수행.

**B7 checkpoint (2026-07-19 18:10 KST):** B7 코드 계약 완료 — migration 025(graph_snapshot digest+dual-time·snapshot_edge exact relation_revision FK·snapshot_degree cross-hub 계측[B6 이월 해소]·impact_path_v2/step 배열 컬럼 0·relation_measurement model_config 필수 5종 한정·graph_community/member) 레지스트리 등록, rehearsal 2회 재적용 멱등·legacy impact_path 7,708행 불변. analytics 모듈 4종: graph-snapshot(digest 결정론·float32 REAL round-trip 안전 toFixed(6) 정규화·superhub flag), impact-path-builder(bounded walk·cycle 금지·maxHops 하드캡 4·step FK 100%), graph-community(membership-digest stable key·theme 분리), relation-measurement(PIT lookahead 거부·event study 사전지정 window 내용 검증[빈 배열/역전/비숫자/사후 estimation window 거부]). 검증: api 259 pass/0 fail·typecheck·oxlint 0, db-schema 14 pass. 독립 리뷰 BLOCKER 0/HIGH 0, MEDIUM 3건(digest float 정밀도·maxHops 상한·event study shape-only) 전부 즉시 수정·회귀 테스트 고정. Live DB 적용·commit은 통합배포 게이트에서 일괄 수행.

**B8 checkpoint (2026-07-19 18:15 KST):** B8 코드 계약 완료 — migration 026(`serving.content_pack` sealed-snapshot FK·pack_digest·freshness envelope·published_at CHECK, `content_pack_item` one-anchor+kind-match CHECK, `v_relation_graph_freshness` published+sealed+fresh만 servable) 레지스트리 등록·rehearsal 2회 멱등. content-pack-builder(one-anchor 강제·중복 거부·rank 전순서 정렬·maxItems 후 digest·순서무관 결정론), graph-read-model-v2(view servable+in-process freshness 이중 게이트·명시적 unavailable·read-time anchor 재검증). DB 직접 공격 5종(무published_at·역전 freshness·이중 anchor·kind 불일치·unsealed 비서빙) rehearsal 차단 실증. 검증: api 277 pass/0 fail·typecheck·oxlint 0, db-schema 14 pass. 독립 리뷰 BLOCKER 0/HIGH 0 (LOW: displayPayload 키순서 digest 민감 — 호출자 정규화 책임 문서화). Legacy `ops.temporal_graph_edge` read path 미접촉 — cutover는 배포 게이트 결정. Live DB 적용·commit은 통합배포 게이트에서 일괄 수행.

**B9 checkpoint (2026-07-19 18:25 KST):** B9 code-contract 완료 — pipeline-dag(결정론 Kahn topo sort·cycle fail-closed·selective recompute 정확 closure·producer coverage), pipeline-registry(canonical dataset 11·edge 14 선언·coverage 100%·freshness SLO 평가기 fail-closed), migration 027(`ops.pipeline_run_claim` natural-run-key UNIQUE·fencing token + `claim_pipeline_run()` 원자 claim). rehearsal 실증: claim 5종 시나리오(첫 winner token1→live loser→terminal takeover token2→expired takeover token3→invalid lease 거부) 전부 통과, 2회 재적용 멱등. 독립 리뷰 BLOCKER 0/**HIGH 1**(measurement→content_pack edge 누락으로 measurement-only 변경 시 recompute 과소) — RED 재현 후 edge 추가·회귀 테스트 고정, 재검증 296 pass/0 fail. plpgsql ON CONFLICT alias 결함 1건도 rehearsal 실행에서 발견·수정. Dagster 설치·systemd 교체 등 운영 cutover는 별도 승인 스코프로 미포함. Live DB 적용·commit은 통합배포 게이트에서 일괄 수행.

**병행 작업 기록:** 이 세션과 병행으로 repo가 `c02d82b`→`78f3ff2`(feat(edge): isolate Stock Insight ingress)로 전진했고 기존 dirty UI/web 파일들이 해당 커밋들로 흡수되어 web tree는 clean. 주인님이 병행 작업 중지를 확인(2026-07-19 18:2x)했으므로 UI integration은 현 HEAD 기준으로 진행.

### 0.0 Live checkpoint and revised follow-up sequence

- B0~B5: migrations 018~023 적용, Live API image `stock-insight-api:b0-b5-f4e4ede`, core gate 33/33, independent BLOCKER 0/HIGH 0.
- Live canonical relation: `ISSUED_BY` accepted 254. 기존 `COMMON_OWNER` 1,062, `SAME_INDUSTRY` 418, `SUPPLY_CHAIN` 169, `NEWS_COMENTION` 68, `OWNS` 64, `SAME_ETF_BASKET` 26은 source-revision-bound evidence가 없어 quarantine 상태다.
- B6 입력 자산은 존재하지만 transitional이다: `public.institutional_holdings` 250, `public.etf_holdings` 1,901, `public.news_comention_obs` 168, 별도 `research-app-db` Python builder 6개. 이 builder들은 mutable `public.graph_edges`를 직접 `approved=true`로 갱신하므로 canonical relation producer로 재사용하지 않는다. 파서·정규화 fixture만 이식한다.
- migration 023은 정확한 `ingestion.source_revision` FK를 relation evidence에 담지 못한다. applied migration을 수정하지 않고 B6 migration 024에서 additive evidence/source/builder-run 계약을 확장한다.
- B7은 기존 `analytics.impact_path` 7,708건의 array FK·legacy relation dependency를 대체한다. 따라서 graph snapshot analytics는 migration 025로 이동한다.
- B8 serving v2는 migration 026으로 이동하며, 현재 `apps/api/src/relations/read-model.ts`가 읽는 `ops.temporal_graph_edge`를 canonical relation revision/snapshot으로 전환한다.
- B9 operational closure는 필요 시 migration 027을 사용한다. 현재 Stock-Insight 전용 systemd/Dagster schedule은 없으며 기존 Node worker가 behavior owner다. Kafka/Redis/Graph DB는 측정된 도입 trigger가 없으면 설치하지 않는다.
- UI에는 114개 tracked/untracked 변경이 있다. reset/stash/clean 금지. backend contract를 먼저 freeze한 뒤 현재 bytes를 보존한 상태에서 API adapter→view integration→browser QA 순으로 합친다.
- Revised execution: B6(024) → B7(025) → B8(026) → B9(027 if required) → UI integration → T2 current-tree review → T3 artifact/rehearsal/browser consensus → exact migration/API/UI deploy.

---

## 0. 신뢰 순서와 승인 경계

### 0.1 신뢰 순서

1. 새 세션의 live 파일·git·DB·runtime readback
2. 이 계획의 현재 SHA-256이 handoff에 기록된 값과 일치하는지
3. 이 계획
4. `NEW-SESSION-GOAL.md`
5. 기존 A~G execution logs와 과거 대화·memory

계획과 live 상태가 다르면 live를 우선하며, 변경 원인을 보고한 뒤 계획을 갱신하거나 구현 범위를 재승인받는다.

### 0.2 승인 경계

별도 명시승인 전 금지:

- migration apply, DB data backfill/repair/quarantine
- 소스코드·config·Docker·systemd 수정
- build, service restart, deploy
- commit, push, rebase, reset, clean, stash
- Kafka/Redpanda/Dagster/Redis/Graph DB 설치·기동
- 외부 API key·WebSocket·crypto collector·cron/timer 변경

계획 승인과 구현 승인은 다르다. 코드 계약 구현 승인과 운영 cutover 승인도 분리한다.

### 0.3 작업공간 보호와 계획 신뢰 앵커

- 현재 repo에는 다른 UI 작업이 dirty/untracked 상태다.
- 구현 세션은 `git reset/clean/stash`를 금지한다.
- handoff 내부 SHA-256은 변경 감지용이며, untracked 두 파일만으로 승인 신뢰 앵커가 되지 않는다.
- 구현 전 사용자가 **plan-only checkpoint**를 별도 승인해야 한다. 권장안은 이 폴더만 포함한 Git commit/tree를 고정하는 것이며, commit이 불가하면 두 파일의 해시를 외부 승인 기록에 남기고 동일 bytes를 보존한다.
- 별도 clean worktree는 위 checkpoint가 생긴 뒤 그 commit/tree에서 만들거나, 외부 승인 해시와 bytes를 검증해 두 문서를 새 worktree에 복제한 뒤 다시 해시를 확인한다. HEAD에서 바로 worktree를 만들면 untracked 정본이 누락되므로 금지한다.
- plan-only checkpoint는 구현·migration·배포·commit/push 일반 승인을 뜻하지 않는다.
- backend 작업 전 별도 clean worktree 또는 UI 변경 정리 중 하나를 사용자가 승인해야 한다.
- 이 계획·handoff 파일만 이번 세션에서 새로 작성한다.

---

## 1. 현재 기준선과 핵심 결함

아래 수치는 2026-07-19 read-only 실측이며 구현 전 반드시 다시 측정한다.

| 항목                                |             기준선 |
| ----------------------------------- | -----------------: |
| PostgreSQL DB 크기                  |             약 4GB |
| core entity                         |              1,176 |
| Stock / Company                     |          254 / 254 |
| identifier                          |              1,679 |
| official `INDUSTRY_CODE` identifier |                  0 |
| knowledge document                  |              2,568 |
| document chunk                      |                  0 |
| claim / event                       |         16 / 3,041 |
| verified event                      |                  0 |
| relation                            |              3,312 |
| relation evidence                   |                  0 |
| impact path                         |              7,708 |
| theme membership                    | 396, 전부 adjacent |
| theme 없는 Stock                    |                 73 |
| source / source contract            |             29 / 0 |
| raw object registry                 |                 25 |
| model / prompt registry             |              0 / 0 |

### 1.1 Stop-the-line 결함

1. `unverified` event가 report·brief에서 `fact`로 발행된다.
2. 동일 일자 report 재실행이 과거 `report_run_id`, cutoff, snapshot metadata를 재사용한다.
3. impact path의 `path_edges` 존재를 source-backed edge evidence로 오판한다.
4. product API는 오래된 row가 남으면 `available`로 표시할 수 있다.
5. knowledge runner는 news만 처리하지만 비뉴스 pending 2,241건을 wrapper가 성공으로 본다.
6. Company와 Stock을 별도 entity로 만들었지만 canonical `ISSUED_BY` 연결이 없다.
7. `BIGINT[]` path/rationale와 polymorphic `evidence_type/evidence_id`가 FK 무결성을 보장하지 못한다.

B0 완료 전 새 관계·리포트의 외부 제품 노출을 확대하지 않는다.

---

## 2. 설계 원칙

1. **관측과 추론 분리:** 공시·계약·보유·공식 분류만 canonical structural relation이 될 수 있다.
2. **시간 분리:** `occurred/effective`, `published`, `available`, `ingested`, `known/system` 시간을 분리한다.
3. **stable identity + append-only revision:** 수정은 과거 row 덮어쓰기가 아니라 closure + 새 revision이다.
4. **근거는 immutable source revision:** canonical URL이나 현재 문서만 가리키지 않는다.
5. **한 점수 금지:** 출처 품질, 추출 신뢰, 검증 상태, 경제적 중요도, 시장 확인, 불확실성을 별도 축으로 저장한다.
6. **경로는 산출물:** impact path는 사실 relation이 아니라 재현 가능한 analytics artifact다.
7. **unknown은 정당한 상태:** 미관측·미공개를 관계 없음으로 변환하지 않는다.
8. **PIT 우선:** 공시 전·availability 전 데이터가 과거 snapshot·backtest에 들어가면 hard fail이다.
9. **UI는 projection:** canonical graph에 좌표·색상·화면 문구를 섞지 않는다.
10. **미래 runtime은 port/contract로 준비:** Kafka·Graph DB·Redis를 지금 설치하지 않아도 나중에 무재설계 전환한다.

---

## 3. Target data architecture

### 3.1 Core identity

필수 구조:

- `core.entity`: Company, LegalEntity, Security/Stock, ETF, Token, Protocol, Blockchain, Exchange, Product, Technology, Industry, Theme, ValueChainStage, Index, Regulation, RiskFactor 등.
- `core.security_issuance`: issuer↔security/share class/ADR 유효·기록시간.
- `core.listing`: security↔exchange↔ticker/currency.
- `core.identifier_revision`: CIK, DART, LEI, ISIN, MIC, ticker, chain contract의 source-backed history.
- `core.entity_alias_revision`: 다국어 별칭, 출처, ambiguity, valid/known range.
- `core.entity_merge_ledger`: 중복 병합·분할·사명변경과 redirect history.

불변식:

- Company financial/disclosure는 issuer에 붙고 Stock read model은 `security_issuance`를 통해 상속한다.
- 상장종목·ADR·우선주를 같은 instrument로 합치지 않는다.
- identifier의 `valid_from` 미상은 현재 시각으로 날조하지 않고 `unknown` 상태와 근거를 기록한다.

### 3.2 Taxonomy and sector

- `core.taxonomy_scheme`: SIC, KSIC, NAICS, INTERNAL_PRODUCT_NETWORK, INTERNAL_THEME, VALUE_CHAIN과 version·license policy.
- `core.taxonomy_node`: hierarchy node와 optional display entity.
- `core.taxonomy_edge`: `PARENT_OF`, `UPSTREAM_OF`, `COMPLEMENTS`, `SUBSTITUTES`.
- `core.entity_classification_revision`: entity↔taxonomy node bitemporal membership.
- `core.classification_evidence`: source revision, quote/fact, method, confidence axes.
- `core.taxonomy_crosswalk_revision`: 서로 다른 scheme의 불완전한 대응을 confidence·근거와 함께 보존.

공식 sector, 제품 유사성, 테마, 시장 community를 같은 taxonomy로 합치지 않는다.

### 3.3 Source and provenance

- `ingestion.source_contract_revision`: `(source_id, revision_no)` UNIQUE, cadence, cutoff, delay, correction, required fields, license, redistribution, raw retention, quality gate, effective/known range와 `supersedes_contract_revision_id`.
- `ingestion.source_record_identity`: provider의 stable external record이며 `(source_id, provider_record_key)` UNIQUE.
- `ingestion.source_revision`: `(source_record_identity_id, revision_no)` UNIQUE, immutable payload/metadata, `available_at`, content hash, `raw_object_id` FK, `source_contract_revision_id` FK, optional `supersedes_source_revision_id` self-FK.
- `ingestion.raw_object`: hash-addressed bytes와 object URI/readback status이며 source revision과 동일 hash를 재검증한다.
- source correction은 기존 revision UPDATE가 아니라 동일 identity의 다음 revision INSERT다. exact retry만 최신 동일 hash revision을 재사용한다.
- `ops.job_definition`, `ops.run`, `ops.dataset`, `ops.run_input`, `ops.run_output`, `ops.lineage_event`: OpenLineage의 Job/Run/Dataset 의미를 relational ledger로 구현.

PROV 매핑:

- Entity: source revision, document, claim, relation, feature, report.
- Activity: fetch/extract/verify/analyze/publish run.
- Agent: provider, code SHA, model, prompt, rule/policy version.

OpenLineage는 ETL 계보이며 claim/relation 의미 provenance를 대체하지 않는다.

#### 공통 temporal/PIT 계약

- 모든 기간은 하한 포함·상한 제외 `[)`로 정의한다. open end는 SQL infinity 또는 NULL 중 하나를 ADR로 고정하고 전 테이블·view에서 혼용하지 않는다.
- `effective/valid`는 현실의 유효 시간, `published/available`은 시스템이 합법적으로 사용할 수 있게 된 시간, `known/system`은 DB가 해당 revision을 알고 있던 시간을 뜻한다.
- `unknown` 시각을 ingestion 시각으로 대체하지 않는다. unknown/open-end 정책을 enum과 별도 필드로 기록한다.
- 중앙 SQL helper/view의 공통 PIT predicate는 최소 `available_at <= :cutoff AND valid_range @> :as_of AND system_range @> :known_at`이다. claim/event/feature/relation/path/report가 자체 변형 predicate를 만들지 않는다.
- closure와 다음 revision INSERT는 하나의 transaction과 동일 identity lock 안에서 수행한다. 두 range의 동시 중첩과 미래정보 혼입을 DB constraint와 test가 함께 차단한다.

### 3.4 Knowledge assertion

- document는 source revision을 참조한다.
- chunk는 immutable document revision에 종속한다.
- claim/event candidate와 verified projection을 분리하거나 상태 머신을 DB gate로 강제한다.
- `asserted_fact`, `reported_claim`, `forecast`, `opinion`, `guidance`, `rumor`, `derived_claim`, `model_hypothesis`를 혼합하지 않는다.
- exact quote, span, quote hash, source independence cluster를 저장한다.
- `verified` 승격은 relation/claim type별 policy function을 통해서만 허용한다.
- correction/retraction은 append-only revision과 `supersedes/retracts`로 처리한다.

### 3.5 Temporal relation ledger

#### Relation type registry

`knowledge.relation_type` 최소 필드:

- predicate, assertion class
- directed/symmetric/inverse/transitive 여부
- allowed subject/object entity types
- self-loop 허용 여부
- source tier, evidence 필수 여부, TTL
- auto-promotion policy version
- public exposure policy

#### Stable identity

`knowledge.relation_identity`:

- stable public ID
- canonical subject/predicate/object
- symmetric edge의 canonical endpoint ordering
- natural relation key/hash

#### Revision

기존 `knowledge.relation`을 append-only revision으로 승격하거나 shadow v2 table을 만든 뒤 parity 후 전환한다. 필수 필드:

- identity_id, revision_no
- valid range, system/known range
- assertion class: observed/reported/derived/statistical/hypothesis
- verification state: pending/corroborated/verified/contested/retracted/rejected/untrusted_legacy
- source quality, extraction confidence, economic materiality, uncertainty
- model/prompt/rule/policy/run/version
- content hash

동시 active bitemporal revision 중첩은 DB가 차단한다. 구현 전 `btree_gist + EXCLUDE`와 deferred constraint trigger를 migration clone에서 비교한다.

#### Evidence and derivation

`knowledge.relation_evidence`:

- 반드시 `relation_revision_id` FK를 가진다. stable relation identity에만 붙이거나 current revision을 간접 추론하지 않는다.
- `source_revision_id`, `document_id`, `chunk_id`, `claim_revision_id`는 typed FK이며 relation type별 policy가 허용한 집합에서 **정확히 하나(exact-one)** 또는 명시된 조합만 허용한다. generic `evidence_type/evidence_id`는 사용하지 않는다.
- document/chunk/claim FK를 사용할 때 모두 같은 source revision chain에 속하는지 deferred validator가 확인한다.
- support/contradict/context/qualify
- quote + location + hash
- entailment/contradiction score
- independent source cluster
- source/license policy revision

`knowledge.relation_derivation_input`:

- derived relation·measurement·path가 사용한 exact input artifact IDs.

`knowledge.relation_review`:

- validator/model/human-exception decision, calibration set, abstention, rejection reason.

legacy relation은 가짜 evidence를 만들지 않고 `unverified_legacy`로 보존한다.

### 3.6 Relationship measurement

`analytics.relation_measurement`는 relation identity와 다음을 시계열로 연결한다.

- ownership percentage
- customer sales share
- contract value/revenue ratio
- common-owner FCAP
- ETF overlap/AUM/activity
- product text similarity
- news sentence relation probability
- correlation/partial correlation
- lead-lag/FEVD spillover
- market confirmation

모든 measurement는 raw numerator/denominator, unit/currency, window, as-of/cutoff, formula version, input fact IDs를 저장한다.

### 3.7 Graph snapshot, community and impact path

- `analytics.graph_snapshot`: as-of, known-at, cutoff, node/edge set digest, method/policy version.
- `analytics.graph_snapshot_member`: snapshot↔relation revision.
- `analytics.community_assignment`: Leiden seed/resolution/version, community ID, stability metrics(예: 월별 ARI).
- `analytics.impact_path`: path-level trigger/target/direction/horizon/method/status.
- `analytics.impact_path_step`: ordinal, from/to entity, exact relation revision, contribution components, evidence summary.
- `analytics.theme_exposure_snapshot`: structural, revenue, event attention, market validation, uncertainty 축.
- `analytics.theme_membership_evidence`: 배열 대신 FK 연결.

community는 `DERIVED_COMMUNITY`이며 공식 sector로 승격하지 않는다. impact path는 인과관계가 아니라 근거 기반 가설로 표시한다.

### 3.8 Content evidence

`content.report_evidence`의 polymorphic `evidence_type/evidence_id`를 typed FK 또는 정확히 하나의 typed artifact를 요구하는 integrity contract로 교체한다. 공개 `fact` block은 verified claim/event 또는 계산 lineage만 허용한다.

### 3.9 Serving and deferred UI integration contract

**현재 금지:** B0~B9 backend/data gates와 별도 UI 실행 승인이 끝날 때까지 React component, route, CSS, browser flow, API-client 연결을 수정하지 않는다.

**지금 명시할 것:** backend 완료 후 어떤 기존 화면이 어떤 v2 API·relation snapshot으로 바뀌고, 어떤 신규 화면이 생기며, 어떤 사용자 진실성 규칙을 지킬지는 이 계획에서 고정한다.

#### Backend endpoints

- `GET /v1/entities/{id}/relationships`
- `GET /v1/entities/{id}/subgraph`
- `GET /v1/sectors/{id}/members`
- `GET /v1/sectors/{id}/subgraph`
- `GET /v1/themes/{id}/analysis`
- `GET /v1/themes/{id}/value-chain`
- `GET /v1/relations/{id}`
- `GET /v1/relations/{id}/evidence`
- `GET /v1/graph/snapshots/{id}`
- `GET /v1/graph/subgraph?anchor=&asOf=&knownAt=&types=&depth=`
- `GET /v1/events/{id}/impact-paths`
- `GET /v1/reports/{id}` 및 `/evidence`
- `GET /v1/status/datasets` — feature/relation/path/report/feed/calibration 포함

모든 response는 `as_of`, `data_cutoff`, `known_at`, `freshness`, `quality_status`, `snapshot_id`, `version`, `disclosures`를 포함한다. edge DTO는 stable relation ID, revision ID, type/direction, assertion/verification class, valid/system range, 각 score 축, support/contradict count, source badge, method/formula version을 포함한다.

#### 기존 UI에서 변경할 표면

| 현재 표면          | backend 완료 후 변경                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `stock-detail.tsx` | 공식 SIC/KSIC hierarchy, issuer/security identity, 관련 종목 다축 카드, value-chain stage, event impact path, evidence/freshness를 추가 |
| Research Workspace | 기존 `ops.internal_web_publication_records`와 신규 Content Pack 이중 경로를 제거하고 canonical v2 serving projection으로 통합           |
| 테마 관계 화면     | 단순 SAME_THEME/adjacent를 core·adjacent·speculative, revenue exposure, structural path, market confirmation, counterevidence로 교체    |
| 관계 그래프        | evidence count만 보여주지 않고 edge type·검증 상태·유효시간·원문·반대근거·계산법을 펼칠 수 있게 변경                                    |
| 데이터 상태        | legacy dataset만이 아니라 source revision, entity/taxonomy, claim/event, relation evidence, graph snapshot, report/feed 상태를 표시     |
| 판단 이력·리포트   | fact/reported/derived/statistical/hypothesis 배지와 report revision·supersedes·cutoff를 표시                                            |

#### 향후 신규 UI 표면

1. **종목 관계 분석 탭**
   - 사업/산업, 공급망, 소유·ETF, 테마, 뉴스, 시장동조를 축별로 필터.
   - 한 개 relatedness 점수 대신 구조강도·경제적 중요도·시장확인·근거품질·불확실성을 나란히 표시.
   - “왜 연결됐나”에서 relation revision과 exact evidence로 이동.

2. **섹터·산업 페이지**
   - SIC/KSIC scheme과 version, hierarchy, 구성 회사·증권, product-similarity peers, upstream/downstream stage.
   - 공식 sector와 Leiden market community를 다른 색·legend로 분리.

3. **테마·밸류체인 페이지**
   - Theme→Stage→Product/Technology→Company→Stock 경로.
   - 실제 매출·계약 노출, core/adjacent/speculative, 반대논거, 붕괴조건, 시장 반영도를 표시.

4. **Obsidian형 Graph Explorer**
   - anchor 확장, relation type filter, 1~2 hop bounded 탐색, as-of/known-at time slider, snapshot 비교.
   - 클릭 시 node/edge detail, 근거 drawer, contradiction, change history.
   - layout position은 presentation snapshot이며 canonical relation을 수정하지 않음.

5. **Event Impact Explorer**
   - event→industry/theme/value-chain→asset path를 step 단위로 표시.
   - 각 step의 rule·relation revision·source·기여요소를 노출하고 인과가 아닌 hypothesis임을 표시.

6. **Evidence/Lineage Inspector**
   - raw source revision→document/chunk→claim/event→relation→feature/path→report까지 역추적.
   - source license상 공개 불가한 원문은 허용된 snippet·metadata만 표시.

7. **Data Quality & Freshness Dashboard**
   - stale/partial/unavailable, source lag, unresolved entity, unverified relation, snapshot age, correction/retraction 상태.

#### 향후 UI 코드 연결 후보 — 지금 생성·수정 금지

- Modify: `packages/api-client/src/client.ts` — v2 typed methods.
- Create: `packages/contracts/src/relations.ts`, `taxonomy.ts`, `graph.ts`, `evidence.ts`, `freshness.ts` 또는 기존 contract 구조에 맞춘 동등 파일.
- Modify: `apps/web/src/entities/stock/ui/stock-detail.tsx`.
- Modify: `apps/web/src/pages/research-workspace/ui/research-workspace-page.tsx`.
- Create future pages/widgets: `apps/web/src/pages/graph-explorer/`, `sector-analysis/`, `theme-analysis/`, `event-impact/`, `apps/web/src/widgets/evidence-inspector/`.
- Add authenticated route loaders and browser E2E only after backend GO.

#### UI 연결 순서와 acceptance

1. v2 contract/API snapshot을 freeze하고 typed client만 shadow 구현.
2. old/new read-model payload parity와 의도된 semantic differences를 기록.
3. 종목 상세 하나를 tracer surface로 연결하고 feature flag로 shadow comparison.
4. evidence·freshness·fact/hypothesis badge E2E 통과.
5. 테마/섹터→graph explorer→event impact→workspace/content 순으로 전환.
6. 각 surface rollback은 old route/read model pointer로 가능해야 하며 canonical data를 되돌리지 않는다.

UI gate:

- source 없는 structural edge를 fact 형태로 표시한 건수 0
- stale/partial/unavailable 숨김 0
- statistical/community/hypothesis를 official sector/causal relation으로 표시한 건수 0
- relation detail에서 revision/evidence/time 접근 가능 100%
- web request 중 LLM·전체 graph traversal·대규모 vector search 0
- auth·모바일·키보드·screen reader·reduced-motion·production browser E2E GREEN

#### Export

- Cytoscape/React Flow JSON
- GraphML
- JSON-LD/Nanopublication projection
- Obsidian Markdown + stable `[[wikilink]]`
- Parquet
- optional graph layout snapshot(algorithm/version/seed/x/y)

export/layout은 canonical truth가 아니다. UI implementation은 backend GO 후 별도 계획·명시승인 대상이다.

---

## 4. 종목 관계 방법론

### 4.1 공식 산업

- US: SEC SIC, 필요 시 NAICS.
- KR: DART/공식 KSIC.
- GICS는 라이선스·재배포 계약 확인 전 canonical source로 사용하지 않는다.
- 서로 다른 scheme을 강제로 일대일 매핑하지 않는다.

### 4.2 제품 유사성

Hoberg–Phillips TNIC를 참고해 10-K 사업·제품 설명과 DART `사업의 내용`에서 시점별 제품 유사성을 계산한다. `PRODUCT_SIMILARITY`는 statistical relation이며 공식 sector·공급망·인과관계가 아니다.

### 4.3 구조·밸류체인 관계

우선 관계 유형:

- `ISSUED_BY`, `LISTED_ON`, `SUBSIDIARY_OF`, `OWNS`
- `SUPPLIES`, `CUSTOMER_OF`, `PARTNERS_WITH`, `JOINT_VENTURE_WITH`, `LICENSES_TO`, `COMPETES_WITH`
- `CLASSIFIED_AS`, `PRODUCES`, `EXPOSED_TO`, `PARTICIPATES_IN_STAGE`
- `HELD_BY`, `COMMON_OWNER`, `SAME_ETF_BASKET`, `INDEX_MEMBER`
- crypto 후속: `DEPLOYED_ON`, `ISSUED_BY`, `BRIDGED_TO`, `USES_ORACLE`, `COLLATERALIZES`

관계 없음은 공개·수집 범위 내에서만 판정한다. 공급망 비공개는 `unknown/not_disclosed`다.

### 4.4 뉴스 관계

Hilt–Schwenkler 방식처럼 문장 단위 관계를 분류하되 단순 co-mention을 구조관계로 승격하지 않는다. syndication cluster로 Reuters 복제본 등을 독립 corroboration으로 중복 계산하지 않는다.

### 4.5 소유·ETF 관계

- Antón–Polk FCAP: active common ownership.
- Da–Shive ETF: holdings weight, AUM, activity, overlap.
- 광범위 시장 ETF와 universal holder가 완전그래프를 만들지 않도록 exclusion/degree cap을 policy로 고정한다.
- 13F·holdings는 filing `available_at` 이전에 사용하지 않는다.

### 4.6 시장 검증

- Diebold–Yilmaz FEVD, correlation, partial correlation, lead-lag, event study.
- 구조관계를 검증·가중할 뿐 canonical structural edge를 만들지 않는다.
- event study/DiD는 정확한 공시시각, 사전 지정 window/benchmark, 비중첩 event, pre-trend/anticipation 검사를 통과해야 한다.

### 4.7 고급 모델 제한

RotatE·TGN·HGT·RSR은 현재 canonical relation 생성 권한이 0이다. 미래 도입 gate:

1. source revision·PIT universe·변경/삭제 history 완성
2. 유형별 mature label과 time-split holdout
3. type-aware negative sampling
4. 신규 시점·종목 OOS에서 단순 rule/embedding baseline 초과
5. regime별 Brier/log-loss/ECE·conformal coverage/abstention 공개
6. 결과는 `HYPOTHESIS` 후보만 생성

---

## 5. Event-driven architecture: 지금 준비, broker는 조건부

### 5.1 지금 구현할 계약

- `ops.event_schema_registry`
- `ops.outbox_event`
- `ops.outbox_delivery`
- `ops.consumer_inbox`
- `ops.dead_letter`
- deterministic event/delivery identity
- aggregate version·partition key·ordering contract
- retry·lease token·ACK·bounded DLQ
- broker-neutral `EventPublisher` port
- process hard-crash/replay tests

Domain mutation과 outbox insert는 같은 PostgreSQL outer transaction에 있어야 한다. Consumer inbox와 projection도 같은 transaction이어야 한다.

- `ops.outbox_event`는 `(aggregate_type, aggregate_id, aggregate_version)` UNIQUE와 deterministic `event_id`를 가진다. 동일 aggregate/version에서 다른 payload hash는 conflict로 격리한다.
- `ops.consumer_inbox`의 PK는 `(consumer_id, event_id)`다. fan-out consumer마다 독립 receipt를 가지며 workspace 전체 dedup이나 event_id 단독 PK로 다른 consumer의 처리를 누락시키지 않는다.
- projection state가 versioned aggregate라면 동일 transaction에서 expected aggregate version을 검사하고 stale/out-of-order event를 명시적으로 기록한다.
- B2~B8의 모든 durable mutation task는 mutation→outbox atomicity, event-schema coverage, consumer-inbox projection atomicity gate를 가진다. 이 producer coverage가 전부 GREEN이 되기 전 dispatcher나 broker를 활성화하지 않는다.

### 5.2 Event envelope

필수 필드:

- event_id, event_type, schema_version
- aggregate_type, aggregate_id, aggregate_version
- partition_key
- occurred_at, available_at, produced_at
- producer, trace_id, causation_id, correlation_id
- payload, payload_hash

권장 partition key:

- entity: entity_id
- relation: relation_identity_id
- document: source_record_identity/document_identity
- report: report_definition + scheduled_for
- personal: user_partition_id

### 5.3 Kafka/Redpanda runtime trigger

다음 중 하나가 live SLO로 확인될 때 broker 도입을 승인 검토한다.

- 독립 consumer가 여러 개로 증가해 PostgreSQL fan-out이 병목
- outbox lag/DB contention이 SLO 위반
- 초 단위 이벤트를 여러 서비스가 동시에 처리
- consumer별 독립 replay/retention 필요
- 여러 서버·지역 worker 분리
- PostgreSQL queue의 backpressure 한계

### 5.4 전환 절차

1. PostgreSQL outbox를 authoritative queue로 유지.
2. Kafka adapter shadow publish.
3. event ID/hash/order parity.
4. shadow consumer projection parity.
5. consumer 하나씩 전환.
6. dual observation.
7. 실패 시 PostgreSQL dispatcher rollback.

Kafka의 exactly-once 표기를 end-to-end exactly-once로 해석하지 않는다. DB side effect는 inbox/idempotent projection이 계속 책임진다.

---

## 6. 기술 도입 결정

| 기술                    |              계약 지금 |   runtime 지금 | 정책                          |
| ----------------------- | ---------------------: | -------------: | ----------------------------- |
| PostgreSQL outbox/inbox |                   필수 |           필수 | B1부터                        |
| Dagster                 |                   필수 |      도입 권장 | B1~B4 contract 후 별도 승인   |
| OpenLineage semantics   |                   필수 | DB emitter부터 | 별도 backend는 불필요         |
| OpenTelemetry           |                   필수 | 최소 계측 권장 | trace/run/dataset correlation |
| pgvector                |                   필수 |      설치 완료 | model registry 후 사용        |
| Kafka/Redpanda          |                   필수 |         조건부 | broker만 보류                 |
| Redis                   | cache version/key 계약 |         조건부 | DB p95 실패 시                |
| Neo4j/AGE               |  graph API/export 계약 |         조건부 | bounded query 병목 시         |
| Lakehouse               |  snapshot/Parquet 계약 |         조건부 | 분석 규모·비용 병목 시        |
| RDF/SHACL runtime       |            의미만 적용 |         미도입 | SQL validator/gate로 번역     |

---

## 7. Machine-readable 100% completion contract

100%는 전 세계 관계 완전성이 아니라 **승인된 Universe·Source Contract·relation type에 대해 아래 gate가 모두 GREEN**이라는 뜻이다.

Zero-tolerance gates:

1. active source 중 source contract revision 누락 0
2. decision-grade document의 raw object/source revision 누락 0
3. Company↔Security↔Listing canonical 연결 누락 0
4. 대상 entity의 sector state가 classified 또는 명시적 unknown/review_required
5. public structural relation의 immutable source evidence 누락 0
6. unverified claim/event의 public fact 발행 0
7. cutoff/available_at PIT violation 0
8. active relation duplicate/dangling/금지 endpoint/self-loop 0
9. impact path step의 exact relation revision/evidence 누락 0
10. contradiction/correction/retraction 미반영 public projection 0
11. idempotent replay duplicate 0
12. source correction 후 과거 as-of result mutation 0
13. stale dataset의 `available` 표시 0
14. run/input/output lineage 누락 0
15. projection source mismatch 0
16. cross-user/unauthenticated personal exposure 0
17. forecast mature 이전 final score 0
18. graph snapshot rebuild digest mismatch 0
19. backup restore 후 historical graph/report 재현 실패 0
20. Stock-Insight와 downstream consumer의 relation/snapshot identity mismatch 0

Quality gates(초기 제안, implementation plan 승인 때 denominator를 고정):

- auto-approved extracted relation precision lower bound ≥95% per market/language/type stratum
- relation classifier abstention·quarantine coverage 100%
- latest asset snapshot universe coverage ≥95%, remainder explicit unavailable
- bounded subgraph proposed p95: 1-hop <150ms, 2-hop <300ms at target fixture
- required source daily success ≥99%

B0에서 두 계층을 분리해 만든다.

- `backend-db-gates.json`: immutable versioned gate definition. gate ID, SQL/test command, query hash, numerator/denominator semantics, threshold, NULL/empty policy, required snapshot axes, policy/formula version, exit semantics를 가진다.
- `ops.quality_gate_run` 또는 동등 append-only ledger: gate definition SHA, code SHA, migration head, DB identity, query hash, snapshot/run IDs, as-of/cutoff/known-at, numerator, denominator, raw result hash, status, started/finished time를 저장한다.

Fail-closed 규칙:

- SQL error, timeout, missing row, NULL, non-finite value, denominator 0, definition/query hash mismatch, stale snapshot, incomplete required axes는 GREEN이 아니라 `error/blocked`다.
- gate run은 definition·code·DDL·DB snapshot과 hash로 결속한다. 재실행 결과가 달라지면 새 run을 append하며 과거 GREEN을 덮어쓰지 않는다.
- 운영 GO는 exact candidate artifact에서 생성된 gate run만 인정한다.

---

## 8. Execution bundles

각 bundle은 plan → explicit approval → RED → minimal GREEN → targeted/full test → DB/readback → independent review → commit approval → optional operational GO 순서다. 구현과 commit/push는 자동 승인되지 않는다.

B1에서 `producer-coverage.json` 또는 동등 machine contract를 만들고 B2~B8마다 갱신한다. 각 durable mutation entrypoint는 `producer_id`, emitted event type/schema, aggregate identity/version, owning transaction, consumer/projection, atomicity test, crash test, rollout 상태를 가져야 한다. 새 mutation이 outbox row 없이 commit되거나 outbox가 domain mutation 없이 남는 적대 테스트를 bundle별로 실행한다. B2~B8 producer coverage 100%, consumer inbox/projection atomicity GREEN 전에는 live dispatcher·Dagster event trigger·Kafka shadow broker를 활성화하지 않는다.

### B0 — Product truth stop-line

**Objective:** 현재 발행·계보·freshness 오류를 차단한다.

**Likely files:**

- Create: `packages/db-schema/src/migrations/018_backend_truth_gate.ts`
- Modify: `packages/db-schema/src/index.ts`
- Modify: `apps/api/src/publish/run-report-publish.ts`
- Modify: `apps/api/src/publish/run-event-brief.ts`
- Modify: `apps/api/src/product/read-model.ts`
- Modify: `apps/api/src/analytics/run-graph-inference.ts`
- Modify: `apps/api/scripts/run_knowledge_pipeline.sh`
- Create tests under `apps/api/test/backend-truth-gate.test.ts`, `report-lineage.test.ts`, `graph-evidence-gate.test.ts`, `knowledge-backlog-gate.test.ts`
- Create: `docs/plan/insight-platform-backend-db-v2/backend-db-gates.json`

**RED cases:** unverified→fact, same-day run metadata reuse, source-less path publication, stale available, non-news pending masked.

**Gate:** five defects reproduce RED, minimal fixes GREEN, published pointer remains atomic, old data quarantined only after separate data approval.

### B1 — Provenance, event contract, outbox/inbox

**Objective:** future Kafka-ready crash-consistent event and OpenLineage-compatible run/dataset contract를 만든다.

**Likely files:**

- Create: `packages/db-schema/src/migrations/019_provenance_outbox.ts`
- Modify: `packages/db-schema/src/index.ts`
- Create: `apps/api/src/events/event-envelope.ts`
- Create: `apps/api/src/events/outbox-store.ts`
- Create: `apps/api/src/events/outbox-dispatcher.ts`
- Create: `apps/api/src/events/consumer-inbox.ts`
- Create: `apps/api/test/outbox-atomicity.test.ts`
- Create: `apps/api/test/outbox-crash-recovery.test.ts`
- Create: `apps/api/test/consumer-inbox-atomicity.test.ts`

**RED cases:** domain commit/outbox rollback split, send-before-ACK hard crash, two claimers race, projection failure after inbox insert, schema version mismatch.

**Gate:** deterministic identity, lease fencing, retries/DLQ, no missing/duplicate durable projection.

### B2 — Source contracts and immutable revisions

**Objective:** 모든 승인 source의 raw→revision→document lineage를 완성한다.

**Likely files:**

- Create: `packages/db-schema/src/migrations/020_source_revision_contracts.ts`
- Modify: `packages/db-schema/src/index.ts`
- Modify: `apps/api/src/ingest/raw-object-store.ts`
- Create: `apps/api/src/ingest/source-revision-store.ts`
- Create tests: `source-contract-integrity.test.ts`, `source-revision-pit.test.ts`, `raw-object-readback.test.ts`

**Gate:** source_contract coverage 100%, immutable hash/readback, correction appends revision, source availability respected.

### B3 — Identity and taxonomy

**Objective:** Company↔Security↔Listing과 SIC/KSIC/internal taxonomy를 정본화한다.

**Likely files:**

- Create: `packages/db-schema/src/migrations/021_identity_taxonomy.ts`
- Modify: `packages/db-schema/src/index.ts`
- Create: `apps/api/src/identity/security-issuance.ts`
- Create: `apps/api/src/taxonomy/classification.ts`
- Create tests: `issuer-security-identity.test.ts`, `taxonomy-temporal.test.ts`, `identifier-revision.test.ts`, `entity-merge-ledger.test.ts`

**Gate:** target universe identity coverage, no instrument-class collapse, classification state explicit, bitemporal overlap blocked.

### B4 — Verified knowledge

**Objective:** document chunk·entity link·claim/event verification과 correction/retraction을 완성한다.

**Likely files:**

- Create: `packages/db-schema/src/migrations/022_verified_knowledge.ts`
- Modify: `packages/db-schema/src/index.ts`
- Modify: `apps/api/src/ingest/run-knowledge-extraction.ts`
- Create: `apps/api/src/knowledge/verification-policy.ts`
- Create: `apps/api/src/knowledge/source-independence.ts`
- Create tests: `claim-verification.test.ts`, `event-verification.test.ts`, `syndication-corroboration.test.ts`, `knowledge-pit.test.ts`

**Gate:** exact quote/source revision, verification state machine, no unverified public fact, all source types processed or explicitly unsupported.

### B5 — Temporal relation ledger

**Objective:** relation type registry, stable identity, append-only revision, evidence·derivation·review를 완성한다.

**Likely files:**

- Create: `packages/db-schema/src/migrations/023_temporal_relation_ledger.ts`
- Modify: `packages/db-schema/src/index.ts`
- Create: `apps/api/src/relations/relation-policy.ts`
- Create: `apps/api/src/relations/relation-store.ts`
- Create: `apps/api/src/relations/relation-verifier.ts`
- Create tests: `relation-type-shapes.test.ts`, `relation-bitemporal.test.ts`, `relation-evidence.test.ts`, `relation-correction.test.ts`, `relation-concurrency.test.ts`

**Gate:** endpoint/domain-range, no active overlap, evidence mandatory, legacy unverified, contradiction/retraction safe.

### B6 — Sector, value chain and relationship builders

**Objective:** 공식 sector, product similarity, supply/customer, ownership, ETF, news relation을 type별 builder로 생성한다.

**Likely files:**

- Create: `apps/api/src/relations/builders/official-sector.ts`
- Create: `apps/api/src/relations/builders/product-similarity.ts`
- Create: `apps/api/src/relations/builders/supply-chain.ts`
- Create: `apps/api/src/relations/builders/ownership.ts`
- Create: `apps/api/src/relations/builders/etf-overlap.ts`
- Create: `apps/api/src/relations/builders/news-relation.ts`
- Create test fixtures under `apps/api/test/fixtures/relations/`
- Create tests: `relation-builders-golden.test.ts`, `relation-builder-pit.test.ts`, `relation-superhub-safety.test.ts`

**Gate:** relation-type golden precision, source timing, no co-mention promotion, ETF/universal owner superhub exclusion, unknown semantics.

### B7 — Graph analytics and impact paths

**Objective:** reproducible graph snapshot, Leiden community, measurement, bounded path와 시장 검증을 만든다.

**Likely files:**

- Create: `packages/db-schema/src/migrations/024_graph_snapshot_analytics.ts`
- Modify: `packages/db-schema/src/index.ts`
- Replace/modify: `apps/api/src/analytics/run-graph-inference.ts`
- Create: `apps/api/src/analytics/graph-snapshot.ts`
- Create: `apps/api/src/analytics/relation-measurement.ts`
- Create: `apps/api/src/analytics/impact-path-builder.ts`
- Create tests: `graph-snapshot-reproducibility.test.ts`, `impact-path-step-integrity.test.ts`, `community-stability.test.ts`, `market-validation-pit.test.ts`

Python graph analytics worker는 ADR과 별도 build approval 전까지 추가하지 않는다.

**Gate:** snapshot digest replay, step FK evidence 100%, bounded graph, community label 분리, market relation not structural.

### B8 — Content, personalization and backend serving

**Objective:** canonical Content Pack과 relation/evidence/graph API를 만들고 legacy/new read path를 통합한다. UI는 연결하지 않는다.

**Likely files:**

- Create: `packages/db-schema/src/migrations/025_backend_serving_v2.ts`
- Modify: `packages/db-schema/src/index.ts`
- Modify: `apps/api/src/product/read-model.ts`
- Modify: `apps/api/src/server/index.ts`
- Create: `apps/api/src/relations/graph-read-model-v2.ts`
- Create: `packages/contracts/src/graph.ts`
- Create tests: `graph-api-contract.test.ts`, `evidence-api-contract.test.ts`, `serving-freshness.test.ts`, `content-pack-lineage.test.ts`

**Gate:** typed evidence FK, freshness envelope, no web runtime graph compute, old/new projection parity, auth boundary.

### B9 — Orchestration and operational closure

**Objective:** dependency DAG, backfill, selective recompute, lineage, SLO, DR을 완성하고 broker/runtime 도입 여부를 측정한다.

**Code-contract scope:**

- Create Dagster project only after explicit build/config approval.
- Existing Node workers remain behavior owners; orchestration first cut invokes them without rewrite.
- systemd remains host supervisor; Dagster가 data dependency/partition/backfill owner가 된다.
- outbox dispatcher, OpenLineage emitter, OTel trace/run context, DLQ monitor.

**Operational-cutover scope — 별도 승인:**

- Dagster install/start/service units
- systemd timer replacement/disable
- migration apply/backfill
- live outbox dispatcher activation
- Kafka/Redpanda shadow broker
- Redis/Graph DB deployment

**Scheduler cutover runbook — job별 승인:**

1. legacy와 신규 scheduler가 공유하는 durable natural run key·claim 함수·fencing token을 먼저 배포하고 두 경로가 같은 claim 없이는 worker를 실행하지 못하게 한다.
2. 대상 legacy timer를 pause하되 unit을 삭제하지 않는다. 이미 claimed/running인 작업을 deadline 안에 drain하고 terminal ledger를 확인한다.
3. B0 fail-closed truth/freshness gates, B2~B8 producer coverage, migration/schema readback이 GREEN인지 확인한다.
4. 신규 Dagster schedule/sensor를 한 job·한 partition에 shadow 활성화하고 실제 domain mutation은 shared claim winner만 허용한다.
5. run identity, input/output dataset, outbox event, row/hash, watermark, latency를 legacy 기대값과 정해진 관찰 횟수 동안 비교한다.
6. parity GREEN 후 신규 scheduler를 owner로 승격하고 legacy timer는 `disable --now`하되 unit·환경·rollback 명령을 보존한다.
7. dispatcher는 producer coverage 100%·consumer inbox atomicity·DLQ/lag monitor GREEN 후 별도 활성화한다.
8. 이상 시 역순 rollback: 신규 trigger pause→in-flight drain/fence→dispatcher pause→legacy unit enable/start→shared claim/readback→B0 truth/freshness gate 확인. 중복 run이나 상태 불명확이면 둘 다 fail-closed 정지하고 기존 published pointer만 유지한다.
9. 각 단계는 exact command, unit name, environment file, timeout, expected terminal status, rollback command를 별도 cutover artifact에 고정한다.

**Gate:** bounded whole-run deadlines, SIGTERM terminal outcome, duplicate trigger prevention, selective recompute, clone restore/rebuild, source/graph/report readback, BLOCKER 0/HIGH 0 independent operational and data-contract audits.

---

## 9. Verification ladder

각 bundle 공통:

1. Exact target repo/branch/status readback.
2. Migration/code contract RED test.
3. Minimal implementation GREEN.
4. `pnpm --filter @stock-insight/db-schema test` 또는 실제 package test 명령 확인 후 실행.
5. `pnpm --filter @stock-insight/api test` — executed test count 확인.
6. `pnpm --filter @stock-insight/api typecheck`.
7. `pnpm lint`과 관련 package build.
8. PostgreSQL clone migration apply→reapply→rollback/reapply rehearsal.
9. Live DB에는 apply 승인 전 read-only preflight만.
10. hard-crash/concurrency test는 temporary/clone DB에서만.
11. exact SQL gate readback.
12. fresh independent review: operational feasibility와 data-contract integrity를 분리.
13. BLOCKER/HIGH가 있으면 RED 재현 후 수정·재리뷰.
14. commit/push는 별도 승인.
15. 운영 GO는 code commit과 별도 승인.

전체 release command `pnpm verify:release`는 현재 UI dirty 작업과 충돌할 수 있으므로 backend bundle에서 무조건 실행하지 않는다. clean worktree와 UI 상태가 정리된 final integration gate에서만 실행한다.

---

## 10. Migration and rollback strategy

- 모든 migration additive-first.
- 기존 `knowledge.relation`, legacy graph, current serving API는 shadow v2 parity 동안 유지.
- relation backfill은 `unverified_legacy`; evidence 날조 금지.
- unique/exclusion 생성 전 duplicate preflight, 자동 삭제 금지.
- repair가 필요하면 원본 PK/hash/run ID를 quarantine하고 별도 data approval.
- v2 serving pointer/view cutover는 transaction으로 수행.
- rollback은 v1 pointer/view로 복귀하고 v2 immutable ledger는 삭제하지 않는다.
- migration file을 applied 후 수정하지 않는다. 후속 수정은 새 migration.
- DDL owner는 Stock-Insight `packages/db-schema` 하나다. downstream repo는 adapter/test만 가진다.

---

## 11. ADR backlog

구현 전 one-decision-per-file ADR을 `docs/plan/insight-platform-backend-db-v2/adr/`에 만든다.

P0 Accepted 후보:

1. PostgreSQL single SoT
2. Company/Security/Listing identity separation
3. Taxonomy schemes and licensing
4. Stable relation identity + append-only revisions
5. Bitemporal overlap enforcement mechanism
6. Immutable source revision/evidence
7. Assertion classes and promotion policy
8. Structural/Event/Market physical separation
9. Impact path as derived artifact
10. Transactional outbox/inbox
11. Event envelope/partition/ordering
12. OpenLineage vs domain provenance boundary
13. Dagster ownership boundary
14. Serving freshness envelope
15. Typed report evidence integrity
16. Personal data partition/RLS
17. Shadow migration/cutover/rollback
18. Graph export and Obsidian projection

P1 Accepted-deferred 후보:

19. Kafka/Redpanda runtime trigger
20. Redis cache trigger
21. AGE/Neo4j trigger
22. Lakehouse/search engine trigger
23. TGN/HGT/RotatE/RSR research gate
24. Crypto universe/source contracts

---

## 12. Academic and standards basis

- Cohen & Frazzini, _Economic Links and Predictable Returns_: https://doi.org/10.1111/j.1540-6261.2008.01379.x
- Hoberg & Phillips, TNIC: https://www.nber.org/papers/w15991
- Antón & Polk, _Connected Stocks_: https://doi.org/10.1111/jofi.12149
- Da & Shive, ETF correlations: https://doi.org/10.1111/eufm.12137
- Hilt & Schwenkler, news-implied networks: https://doi.org/10.2139/ssrn.4946066
- Diebold & Yilmaz, connectedness: https://www.nber.org/papers/w17490
- Leiden community: https://doi.org/10.1038/s41598-019-41695-z
- Snorkel weak supervision: https://arxiv.org/abs/1711.10160
- Conformal prediction: https://arxiv.org/abs/2107.07511
- Temporal Graph Networks: https://arxiv.org/abs/2006.10637
- Heterogeneous Graph Transformer: https://arxiv.org/abs/2003.01332
- Relational Stock Ranking: https://arxiv.org/abs/1809.09441
- W3C PROV-O: https://www.w3.org/TR/prov-o/
- W3C SHACL: https://www.w3.org/TR/shacl/
- OpenLineage object model: https://openlineage.io/docs/spec/object-model/
- FIBO: https://edmcouncil.org/financial-industry-business-ontology/
- Nanopublication guidelines: https://nanopub.net/guidelines/working_draft/

---

## 13. Final GO definition

Backend/DB 100% GO는 다음을 모두 만족할 때만 선언한다.

- B0~B9의 code-contract gates GREEN.
- `backend-db-gates.json` zero-tolerance gates 전부 0 또는 명시 denominator threshold 충족.
- clone migration/reapply/restore/rebuild GREEN.
- production candidate image/hash와 tested artifact 동일.
- operational feasibility audit: BLOCKER 0/HIGH 0.
- data-contract integrity audit: BLOCKER 0/HIGH 0.
- 사용자 승인으로 migration apply·runtime cutover·commit/push를 각각 분리 실행.
- UI 작업은 별도 계획·승인 전까지 미연결.

전 세계 관계의 완전성, 인과 확정, 미공개 공급망 발견은 GO 조건이 아니다. 대신 해당 영역의 coverage와 `unknown/not_disclosed/not_covered` 상태가 정직하게 기록되는 것이 GO 조건이다.
