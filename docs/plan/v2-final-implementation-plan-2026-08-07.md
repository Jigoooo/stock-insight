# V2 Final Canonical — 구현 계획 (2026-08-07)

> **이 문서는 정본이 아니다.** `docs/plan/stock-crypto-investment-context-world-model-v2-final/`
> 의 `canonical/` 과 `contracts/` 가 정본이고, 이 문서는 그 정본을 **2026-08-07 실측 시스템에
> 투영한 파생 문서**다. 충돌하면 정본을 따른다. 이 문서는 어떤 의미도 소유하지 않는다.
>
> 실측 근거는 `docs/architecture/stock-insight-as-built-2026-08-07.md` 와, 이 문서를 쓰며
> 라이브 `research_app` 카탈로그에 직접 던진 읽기 전용 조회다. **주석을 근거로 삼은 항목은 없다.**
>
> 날짜가 파일명에 있다. 낡으면 고치지 말고 새 날짜로 새로 써라.

---

## 0. 요약 — 왜 이 계획이 이런 모양인가

정본(v2-final freeze)은 이미 **구현 순서(11 §1)** 와 **출시 범위(11 §2)** 와
**전환 절차(11 §5)** 를 동결해 뒀다. 그러므로 이 계획의 일은 새 로드맵을 발명하는 것이
아니라, **동결된 순서를 실측 위에 겹쳐 놓고 각 칸에 "지금 무엇이 있고 무엇이 없는가"를
채우는 것**이다.

그리고 실측이 하나의 사실을 아주 크게 말한다:

> **표는 있는데 0행인 것이 25개 이상이다.**

이것이 이 계획의 지배적 설계 근거다. 자세한 것은 §2.

---

## 1. 격차 지도 — 3계층

정본 대비 현재 상태는 "있다/없다"의 2분법으로 읽으면 **반드시 틀린다.** 세 계층이다.

### T3 — 실동 (표 + 데이터 + 읽는 코드)

정본이 KEEP 하라고 지목한 것(11 §5)이 대부분 여기 있다. **이 기반은 강하다.**

```
ingestion   source 39 · source_revision 4,759 · raw_object 4,400 · story 4,466
            source_contract 6 · source_contract_revision 69
            source_contract_current_v1 (뷰) 39   → F01 Source & Evidence
core        entity 1,448 · entity_identifier 2,080 · listing 325 · entity_alias 564
            Company 325 = Stock 325, ISSUED_BY 254 로 연결   → F02 Identity (회사≠증권 ✅)
knowledge   document 7,712 · document_chunk 8,990 · claim 360 · event 4,466
            relation_identity 9,881 · relation_revision 38,861
            relation_evidence_ledger 64,699 · predicate_ontology_revision 28
            → F01/F05, 추가 전용 3겹 게이트 원장 ✅
world       event 4,466 · event_revision 4,466 · event_participant 3,261  → F04 ✅
analytics   graph_snapshot 33 (**sealed 2**) · graph_snapshot_edge 175,028
            impact_path 55,402 · impact_path_v2 241,188 · impact_path_step 258,854
            graph_community 206 · relation_measurement 4,583
            asset_feature_snapshot 12,397 · calibration_profile 120
governance  coverage_ledger 4,765                → 03 §7 coverage ✅
serving     content_pack 17,085 · content_pack_item 3,283,491
```

> **재측정 시 확인할 두 가지 (as-built 와 어긋나거나 오해하기 쉬운 것):**
>
> 1. **graph_snapshot** — as-built §5 는 "스냅샷 37 · status=sealed" 로 적었다. 같은 날
>    재측정은 **총 33 · sealed 2** 다. `servable` 이 `snapshot.status='sealed'` 를 요구하므로
>    (as-built §7) sealed 2 는 servable 612/17,085 와 정합한다.
> 2. **source contract 39 vs 6** — as-built §10 의 감사 결과 *"활성 출처 39 · 계약 39 ·
>    미커버 0"* 은 **뷰** `source_contract_current_v1`(39)을 센 것이다. 기본 표
>    `ingestion.source_contract` 는 **6행**이고 distinct source_id 도 6이다. 커버리지는
>    revision(69)을 거쳐 뷰에서 해소된다. **기본 표만 세면 "33개 출처에 계약이 없다"는
>    잘못된 결론에 도달한다.**

### T2 — 표는 있으나 **0행**

**정본이 요구하는 의미층의 핵심이 대부분 여기 있다.** 마이그레이션은 통과했고, 감사도
통과했고(빈 표는 reachability 감사에서 "31개는 비어 있음"으로 넘어간다), 아무것도
실패하지 않았는데 **아무것도 안 들어 있다.**

**단, 비어 있는 이유가 하나가 아니다.** §2 가 이것을 A/B/C 세 유형으로 가른다.
**섞어 읽으면 반드시 틀린 계획이 나온다** — 어떤 것은 채워야 하고, 어떤 것은
채우면 정본 위반이다.

유형은 §2 의 A(물고 있는 게이트) / B(배선 누락) / C(미착수)다.

| 표 | 행 | 유형 | 정본 근거 | 무엇이 막혀 있는가 |
| --- | ---: | :---: | --- | --- |
| `knowledge.assertion` | **0** | C | kernel §4 | REQ-KERN-030 (polarity/modality 구분) 자체가 불가능 |
| `world.numeric_fact` | **0** | C | kernel §4 | REQ-EVD-004 (숫자 재실행) 불가능 |
| `analytics.impact_shock` | **0** | **A** | 05 §3 | primitive shock — 발명 금지로 보류 |
| `analytics.impact_exposure_revision` | **0** | **A** | 05 §3 | **의도된 공백** (§2 ① 참조) |
| `analytics.impact_score_component` | **0** | **A** | 05 §3 | 위와 동반 |
| `analytics.method_estimate` / `_assumption` / `_diagnostic` | **0** | C | 05 §5 | analysis protocol 미가동. `methodology_template` 7행은 있다 |
| `analytics.conformal_interval` | **0** | C | 05 §5 | |
| `analytics.scenario_set` / `_branch` / `_invalidation` | **0** | C | 05 §7 | scenario 미가동 |
| `analytics.shadow_experiment_run` / `shadow_metric` / `candidate_score` | **0** | **B** | 11 §3 | writer 는 있고 **프로덕션 호출자 0개** |
| `analytics.pit_universe_membership` | **0** | C | REQ-PIT-002 | backtest universe 복원 불가 |
| `analytics.product_classification` / `industry_firm_allocation` / `io_industry_linkage` / `trade_route` | **0** | C | 05 §5 | production network 미가동 |
| `core.security_corporate_action` | **0** | C | 03 §6 | **corporate action 연속성이 비어 있다** |
| `knowledge.conflict_set` / `_member` | **0** | C | 05 §7 | competing hypothesis 기반 없음 |
| `knowledge.resolution_candidate` / `_decision` / `_feature` | **0** | C | 10 §1 | entity resolution 평가 불가 |
| `analytics.spatial_impact_path` / `_step` | **0** | C | 07 §2 | |
| `analytics.precompute_cache_entry` / `_invalidation` | **0** | C | 09 | |
| `ingestion.content_artifact`, `core.taxonomy_crosswalk`, `knowledge.ontology_crosswalk`, `knowledge.relation_evidence` | **0** | C | | |

읽는 코드가 없는 것들도 같은 부류다 — `analytics.theme` 138 · `theme_membership` 396 ·
`core.security_master` 297 (as-built §12, database-ownership.md).

### T1 — 표조차 없다 (라이브 카탈로그 0건으로 확인)

| # | 없는 것 | 정본 근거 | 닫히는 REQ |
| --- | --- | --- | --- |
| 1 | Analysis Information Set | kernel §1 | REQ-KERN-001·002, REQ-PIT-001·004 |
| 2 | Semantic Snapshot | kernel §9 | REQ-REL-001 |
| 3 | Release Manifest | 09 §3 | REQ-REL-001 |
| 4 | Safety State | 00 §8 | REQ-SAFE-001·002·003 |
| 5 | Metric Definition + Comparability | kernel §7 | REQ-PROD-020·021 |
| 6 | Economic Claim | 03 §2 | — (F02 완성) |
| 7 | Truth Class 메타데이터 | 00 §4 | REQ-SEM-010 |
| 8 | Expectation Ledger | 05 §1 | REQ-EXP-001 |
| 9 | Valuation Registry | 05 §6 | — |
| 10 | Common Asset View | 06 §2 | REQ-REC-001 |
| 11 | Opportunity / Candidate / Rejection Ledger | 06 §3·§7 | REQ-REC-020 |
| 12 | `ops.slo_*` | 09 §5 / X4 | REQ-SAFE-002 의 **입력** |
| 13 | Sector Playbook / Domain Adapter | 04 §1·§2 | REQ-DOM-001 |
| 14 | Rights Matrix 10필드 (부분) | 08 §7 | 아래 참조 |

**14 는 부분 존재다.** 정본 08 §7 이 요구하는 10개 독립 필드 중 현재 있는 것:

```
있음   ingestion.source              license_status · redistribution · enforcement · tier
       source_contract_revision      license_policy · redistribution_policy
                                     raw_retention_policy · cutoff_policy
없음   can_fetch · can_extract_facts · can_train_or_evaluate
       can_show_short_excerpt · can_show_full_text · can_export
       rights_document_hash / review date
```

정본은 이들이 **독립 필드**일 것을 요구한다 — `can_store_raw` 와 `can_show_full_text` 는
다른 질문이다. 현재는 정책 문자열로 뭉쳐 있다. `RIGHTS_REVIEW` 상태 전이도 없다.

> **주의 — 이름이 맞아도 남의 것이다.** `ops.analysis_run_contract`(84행)은 Information Set
> 과 이름이 비슷하고 `cutoff_at`·`source_watermark_at` 컬럼까지 있지만
> **research-app-db 소유**다(`operations/database-ownership.md` L33). 재사용 금지.
> `ops.model_registry`·`ops.forecast_outcome_ledger`·`ops.pipeline_edge` 도 같다.

---

## 2. 가장 중요한 발견 두 가지

이 둘이 이 계획 전체의 방향을 정한다.

### ① impact path 는 exposure 가 아니라 graph edge 위에서 돈다

```
analytics.impact_path            55,402  ← 차 있다
analytics.impact_path_v2        241,188  ← 차 있다
analytics.impact_exposure_revision    0  ← 비어 있다
analytics.impact_shock                0  ← 비어 있다
analytics.impact_score_component      0  ← 비어 있다
```

경로는 `graph_snapshot_edge` 를 읽어 만들어진다(as-built §5). 즉 현재 제품이 서빙하는
"영향 경로"는 **관계가 존재한다**는 사실 위에 서 있고, 정본이 요구하는
**economic exposure/materiality** 위에 서 있지 않다.

정본이 정확히 이것을 금지한다:

- `REQ-WORLD-010` — recommendation eligibility 는 관계 존재 여부가 아니라 economic
  materiality/exposure policy 를 **별도로** 통과해야 한다.
- `REQ-PROD-030` — embedding proximity 만으로 "관련 기업"이나 economic exposure 라고
  표현하지 않는다.
- `06 §9 NO-GO` — graph similarity / common-owner / ETF 만으로 추천.

그리고 실측이 이 위험을 정량화한다. 경로 스텝 서술어 분포(as-built §5)에서
**SAME_ETF_BASKET 112,555 + PRODUCT_SIMILARITY 108,383 + COMMON_OWNER 2,584** 가 압도적이다.
이 셋은 전부 정본이 "약한 신호"로 분류한 association 계열이다. COMMON_OWNER 는 as-built §12
가 이미 측정해 뒀다 — 13F 42종목 중 39개가 *"대형 인덱스 펀드 4곳이 둘 다 보유"* 다.

#### 그런데 exposure 가 빈 것은 **실수가 아니라 의도**다 — 이것이 이 발견의 핵심

`run-portfolio-snapshot.ts:18-20` 의 주석이 이유를 명시한다:

> *"Scope note: this fills the snapshot, not the exposure. impact-read-model.ts also reads
> `analytics.impact_exposure_revision`, which **stays empty on purpose** — filling it would
> mean **inventing sign, materiality and economic magnitude per holding.**"*

**이 판단은 옳았고, 정본이 같은 말을 한다.** `REQ-IMP-001`(evidence confidence × economic
magnitude 를 하나로 접지 말 것), `REQ-WORLD-010`(관계 존재 ≠ economic materiality),
`06 §9 NO-GO`(LLM 이 빈 데이터 필드를 서술로 보충). 근거 없이 채웠으면 전부 위반이었다.

그러므로 이 표는 **부채가 아니라 물고 있는 게이트**다 — as-built §3 이 격리 서술어 14종에
대해 내린 판정과 정확히 같은 부류다.

> **결론이 달라진다.** 할 일은 "빈 표를 채워라"가 아니라
> **"sign · materiality · economic magnitude 를 발명하지 않고 도출할 수 있는 입력을 먼저
> 만들어라"** 다. 그 입력이 정확히 정본 04(Sector Playbook + Business Driver Bridge)다.
>
> 그래서 이 계획에서 **K3(도메인 어댑터)는 K4(exposure)의 선행조건이지 장식이 아니다.**
> playbook 이 "이 업종에서 무엇이 얼마나 중요한가"를 versioned 정의로 고정해 줄 때 비로소
> exposure 를 발명 없이 쓸 수 있다.

#### 그리고 이 빈 표가 제품 표면에 닿아 있다 — 다만 정확히 적어야 한다

`impact-read-model.ts` 는 `impact_exposure_revision` 과 `impact_shock` 에 **INNER JOIN** 한다
(L61·L67). 두 표가 0행이므로 결과는 항상 0행이고, 코드는 그때 `null` 을 돌린다
(`if (!first) return null`). 컨트롤러가 그것을 404 로 바꾼다:

```
apps/api-server/src/personalization/personalization.controller.ts:77
  if (!result) throw apiError('portfolio_impact_not_found', 404)
```

> **정정 — 이것은 as-built §11 의 조용한 실패 ②("0을 측정값인 양 읽는다")가 아니다.**
> 사용자는 "영향 없음"이라는 **주장**을 받는 게 아니라 404 를 받는다. 404 는 적어도 없는
> 사실을 단언하지 않는다. 이 구분을 흐리면 안 된다.

그래도 정본 기준으로는 부족하다. `REQ-SRC-001` 은 **없음과 모름을 구분**하라고 요구하고,
404 `portfolio_impact_not_found` 는 *"당신 포트폴리오에 해당 임팩트가 없다"* 로 읽힌다.
정확한 상태는 **"아직 계산하지 않음"** 이다.

그리고 이 엔드포인트는 형제들과 다르다 — `personalizationThesisSchema` 등은
`availability: 'available'|'missing'|'stale'|'error'` 봉투를 쓰는데
`portfolio-impact` 만 404 를 쓴다.

> **비용 주의 — 이것은 "한 줄"이 아니다.** as-built §11 이 선례를 적어뒀다: 서술어 문구를
> 넣을 때 *"계약 enum · 서버 맵 · 웹 레이블 **셋에** 넣고서야 통과했다."* 여기도
> `packages/contracts/src/personalization.ts` 의 봉투 + `api-server` 컨트롤러 + 웹 표면
> **셋을 같이** 고쳐야 한다. `availability` enum 에 상태를 추가한다면 기존 4값을 쓰는 다른
> 스키마도 함께 본다. **작지만 한 줄은 아니다.**

### ② derivation 은 계보용이지 typed DAG 가 아니다

```
knowledge.derivation        3,283,491
knowledge.derivation_input  3,283,491
knowledge.derivation_step   3,283,491
serving.content_pack_item   3,283,491   ← 정확히 같다
knowledge.assertion                  0
```

세 수가 팩 항목 수와 **정확히 일치**한다. 즉 derivation 은 "팩 항목 하나당 계보 하나"로
쓰이고 있고, kernel §6 이 요구하는 *"assertion A + assertion B → normalized contract"* 같은
**복수 typed input 의 DAG** 로는 쓰이지 않는다. 입력이 될 assertion 이 0행이니 당연하다.

`REQ-KERN-040`(derivation DAG 는 acyclic 이고 모든 input 이 semantic type 규칙을 통과)은
현재 **공허하게 참**이다. 검사할 typed input 이 없다.

> **결론:** assertion → numeric_fact 를 채우는 것이 kernel 작업의 실질이다. 표를 더 만드는
> 게 아니라 **이미 있는 표에 writer 를 붙이는 것**이다.

### 이 둘이 합쳐서 말하는 것

빈 표 25개는 **한 가지 원인이 아니다.** 섞어 읽으면 반드시 틀린다.

| 유형 | 뜻 | 예 | 할 일 |
| --- | --- | --- | --- |
| **A. 물고 있는 게이트** | 근거 없이 채우면 정본 위반이라서 **일부러** 비워 뒀다 | `impact_exposure_revision` · `impact_shock` · `impact_score_component` | **입력을 먼저 만든다.** 표를 채우는 게 아니라 채울 자격을 만든다 (K3→K4) |
| **B. 배선 누락** | writer 코드가 있는데 어떤 파이프라인도 안 부른다 | `shadow_experiment_run` — `experimental/shadow-artifact-writer.ts` 의 **프로덕션 호출자 0개** (as-built §12 의 `insertOutboxEvent` 와 같은 부류) | 파이프라인에 붙인다. 싸다 |
| **C. 미착수** | 애플리케이션 코드가 **한 줄도** 없다. 마이그레이션과 테스트만 참조 | `knowledge.assertion` · `world.numeric_fact` · `core.security_corporate_action` | writer 를 새로 쓴다 (K2) |

C 를 실측으로 확인했다 — `knowledge.assertion` 과 `world.numeric_fact` 를 언급하는 파일은
마이그레이션 031·036·062 와 테스트 1개뿐이고, `apps/` 아래 애플리케이션 코드는 **0건**이다.

그리고 **셋 다 아무것도 실패시키지 않는다.** 빈 표는 reachability 감사에서 게이지로만 잡히고
실행을 실패시키지 않는다(as-built §10 구멍 ②).

사용자가 *"중간에 또 멈추지 말라"* 고 한 것의 정체가 B·C 다. 그래서 이 계획의
**완료 정의를 바꾼다**:

> **표를 만드는 것은 단계의 완료가 아니다.**
> writer 가 있고, reader 가 있고, **0행이 아님을 게이트가 매일 강제**할 때 완료다.
>
> 단, **A 에는 이 규칙을 적용하지 않는다.** A 를 "0행이면 실패"로 만들면 정본이 금지한
> 발명을 강요하게 된다. A 의 완료 조건은 *"입력이 갖춰졌고 그래서 채워졌다"* 이지
> *"채워졌다"* 가 아니다.

---

## 3. 시작 전에 결정할 것 세 가지 (K0)

전부 코드가 아니라 결정이다. 안 하면 이후 모든 세션이 같은 논쟁을 반복한다.

### K0-1. 문서 거버넌스 — 목표 정본이 둘이고, **정본이 git 에 없다**

#### 문제 ①: 목표 정본이 둘이다

`docs/architecture/README.md` 는 `stock-insight-e2e-layers.md` 를 목표 정본으로 지목하고
*"목표가 바뀌면 e2e-layers.md 를 고쳐라"* 라고 못박는다. 그런데 v2-final freeze 는
`docs/plan/` 에 있고 **README 는 그 존재를 언급조차 하지 않는다.** freeze 는 스스로를
IMPLEMENTATION CANONICAL 로 선언한다.

#### 문제 ②: freeze 패키지가 **추적되지 않는다** ← 이게 먼저다

```
$ git status --short
?? docs/plan/

$ git check-ignore -v docs/plan/      → (매칭 없음. 무시된 게 아니라 그냥 커밋 안 됨)
$ git ls-files docs/ | wc -l          → 27   (docs/architecture 는 전부 추적됨)
```

**추적된 문서가 추적되지 않은 디렉터리에 정본을 위임할 수 없다.** 새로 clone 하면 정본이
존재하지 않고, `git clean -fd` 는 정본과 이 계획서를 함께 지운다.

#### 문제 ③: 그런데 그냥 `git add` 하면 **SHA256SUMS 가 깨진다**

```
.gitignore:47   docs/**/*.zip
     ↓ 매칭
docs/plan/.../reference/pre-freeze-split-package.zip

그런데 그 zip 은
  SHA256SUMS.txt:30   13d06027…  reference/pre-freeze-split-package.zip
  MANIFEST.json:150   "path": "reference/pre-freeze-split-package.zip"
```

`git add docs/plan/` 하면 zip 만 빠지고 나머지가 들어간다 → **fresh clone 에서 체크섬 검증
실패.** 그리고 그 `.gitignore` 줄은 실수가 아니다. 주석이 근거를 적어뒀다 —
*"외부 반출용 압축본 — 저장소에 넣지 않는다 (2026-08-07 실수로 f16b43a 에 섞였음)."*

**이건 결정이지 우회할 문제가 아니다.** 선택지:

| 안 | 내용 | 대가 |
| --- | --- | --- |
| **A (권고)** | zip 을 패키지에서 제거하고 `SHA256SUMS.txt`·`MANIFEST.json` 에서 해당 줄을 뺀 뒤 커밋 | 정본이 자기충족적이 된다. zip 은 비정본 `reference/` 의 보존본일 뿐이라(freeze README 규칙 2) 정본성에 영향 없음 |
| B | `.gitignore` 에 이 zip 하나만 negation 예외 | 2026-08-07 에 의식적으로 세운 규칙을 되돌린다. 근거가 약하다 |
| C | 추적하지 않고 둔다 | **K0-1 이 성립하지 않는다.** 이 선택지는 이 계획을 무효화한다 |

#### 해결 순서

```
1. 안 A/B/C 결정  (사용자 판단 필요 — .gitignore 는 의도적으로 세운 규칙이다)
2. SHA256SUMS 검증 후 freeze 패키지 커밋
3. docs/architecture/README.md 를 freeze 패키지로 재지시
4. e2e-layers.md · v2-enhancement-master-roadmap.md
   · stock-insight-v2-enhancement-plan.md 에 superseded-by 헤더
```

**코드 0줄.** 다만 2~4 는 `git add`/`commit` 이므로 §4 의 착지 절차를 **반드시** 탄다 —
이것이 `source_tree_hash` 가 바뀌는 첫 작업이고, 이 계획을 실행하는 사람이 처음 만나는
지점이다.

### K0-2. contract 이름 충돌 두 건 — 확장인가 신규인가

| 기존 | 정본 | 충돌 |
| --- | --- | --- |
| `contracts/temporal.ts` `informationSet: as_known\|point_in_time\|latest` (3값) | Analysis Information Set: `mode 4값 + cutoff 5종 + allowed_information_classes[] + market_calendar + semantic_snapshot_id` | **같은 이름, 다른 것** |
| `contracts/truth-visual-language.ts` epistemic class **6종** | `truth-classes.json` **14종** | 부분집합 |

`temporal.ts` 는 이미 출시된 읽기 계약이다. 여기에 9필드를 밀어넣으면 기존 API 소비자가
깨진다.

**권고:** `temporal.ts` 는 **읽기 표면 계약으로 그대로 두고**(이름 유지), Analysis Information
Set 은 `contracts/analysis-information-set.ts` 로 **새로 만든다.** 둘 사이는 명시적 어댑터
하나로 잇는다 — `resolveTemporalQuery()` 결과가 어떤 information set 으로 승격되는지 한 곳에서만
정한다. 정본의 JSON Schema(`contracts/analysis-information-set.schema.json`)가 이미 있으므로
그것을 zod 로 옮긴다.

`truth-visual-language.ts` 는 6→14 **확장**한다. 기존 6종의 렌더 스펙은 건드리지 않고 8종을
추가하므로 하위호환이다. REQ-SEM-010(UI 시각 구분)이 이걸로 닫힌다.

> `REQ-ARCH-011`("병렬 truth store 금지")은 **원장**에 대한 규칙이지 contract 파일에 대한
> 규칙이 아니다. 위 분리는 위반이 아니다.

### K0-3. 새 표를 어느 스키마에 둘 것인가

`REQ-ARCH-010` — 12 family 는 논리 분류이고 **12개 신규 스키마를 뜻하지 않는다.**
그리고 `research_app` 은 네 프로젝트 공유다.

**stock-insight 소유 스키마** (database-ownership.md): `analytics` `knowledge` `world`
`governance` `ingestion` `serving` `personalization` `content` `core` `crypto_*`
`cross_domain` `geo` `market`

**`ops` 는 표 단위로 갈린다.** 새 표를 `ops` 에 넣기 전에 반드시 ownership 문서를 확인한다.

배치 결정:

```
governance.analysis_information_set     kernel §1
governance.semantic_snapshot            kernel §9
governance.release_manifest             09 §3
governance.safety_state                 00 §8
governance.metric_definition            kernel §7
governance.metric_comparability         kernel §7
governance.sector_playbook              04 §1
core.economic_claim                     03 §2
analytics.expectation_revision          05 §1
analytics.valuation_estimate            05 §6
serving.common_asset_view               06 §2
analytics.opportunity_candidate         06 §7
analytics.opportunity_rejection         06 §7
ops.slo_definition / ops.slo_observation   ← ownership 확인 후. 충돌 시 governance.slo_*
```

`governance` 는 현재 표 **1개**(`coverage_ledger`)뿐이고 우리 소유이며, 정본의 F11
(Definition/Policy/Provenance)과 F12(Operations/Release/Safety)에 정확히 대응한다. 새 스키마를
만들 이유가 없다.

---

## 4. 작업 단위의 모양 — "파일 편집 = 배포"

as-built §1: 타이머가 `WorkingDirectory` = 체크아웃 경로를 직접 실행한다.
**이 레포에서 파일을 고치는 것이 곧 배포다.**

as-built §9: 완료 UPDATE 가 `source_tree_hash` 일치를 요구한다. 실행 중 트리가 바뀌면
그 실행은 `completed` 로 닫히지 못한다.

**실측으로 확인한 정확한 조건** (`pipeline_common.sh:133-140`):

```bash
git -C "$repo_root" ls-files -z | while ...; do sha256sum ...; done | sha256sum
```

`git ls-files` 는 **추적된 파일만** 센다. 두 절반을 반드시 같이 기억한다:

| 행위 | `source_tree_hash` | 안전한가 |
| --- | --- | --- |
| 추적되지 않은 새 파일 **작성** | 불변 | ✅ 안전 (이 계획 문서 자체가 그랬다) |
| 추적된 파일 **수정** | **변한다** | ❌ 실행 중이면 그 실행이 `completed` 로 못 닫힌다 |
| **`git add`** (새 파일을 추적으로 승격) | **변한다** | ❌ 위와 같다 |
| `git commit` | (이미 add 에서 변함) | ❌ |

> **K0-1 이 정확히 `git add` 다.** 이 계획을 실행하는 사람이 처음 하는 일이 가장 위험한
> 부류에 속한다. "작성은 안전"만 기억하고 착지 절차를 건너뛰면 첫 단계에서 파이프라인을 깬다.

### 타이머 창

```
news               30분마다            ← 가장 좁다. 창이 거의 항상 닫혀 있다
knowledge          2시간마다 :45       (타임존 미지정 — 호스트 TZ 의존)
ohlcv              07:10 KST
market-enrichment  05:20 KST
analytics          07:45 KST
fundamentals       일요일 03:30 KST
```

### 착지 절차 (모든 단계 공통)

```bash
# 1. 어디에 서 있는지
git status --short --branch

# 2. 도는 게 있는지 (0행이어야 한다)
docker exec research-app-postgres psql -U postgres -d research_app -tAc \
  "SELECT natural_run_key, claim_status FROM ops.pipeline_run_claim
    WHERE claim_status='claimed' AND lease_expires_at > now();"
docker exec research-app-postgres psql -U postgres -d research_app -tAc \
  "SELECT job_name, status FROM public.migration_runs
    WHERE job_name LIKE 'stock-insight%' AND status='running';"

# 3. news 타이머 직후(짝수 :01 / :31 근처)에 커밋한다

# 4. 착지 후 감사
npx tsx apps/api/src/ops/run-schema-migrations.ts
npx tsx apps/api/src/ops/run-table-reachability-audit.ts
npx tsx apps/api/src/ops/run-source-contract-audit.ts
pnpm lint && pnpm typecheck && pnpm test
```

### 단계의 불변 형태

각 단계는 **혼자 착지하고 혼자 되돌릴 수 있어야** 한다.

```
① 추가 마이그레이션 (078+, 적용된 것은 절대 수정 금지 — 체크섬 드리프트 거부)
② writer  (shadow write — 제품 읽기 경로는 손대지 않는다)
③ 0행 아님을 강제하는 게이트  ← 이것이 없으면 T2 스캐폴딩이 하나 더 늘 뿐이다
④ 패리티/불변조건 테스트
⑤ (다음 단계에서) shadow read → 제품 읽기 전환 → 옛 투영 은퇴
```

정본 11 §5 의 전환 순서 그대로다. **③이 이 계획이 추가한 유일한 것**이고, §2 에서 본
반복 실패에 대한 답이다.

---

## 5. 단계 계획

정본 11 §1 의 동결된 순서 A~I 를 그대로 따른다. 각 단계에 `REQ-COST-001` 을 위한 추정치를
넣는다. 유니버스는 정본 11 §6 의 **첫 vertical deep universe 50~100 종목**을 쓴다.

> **⚠ 각 단계의 "비용" 숫자는 측정값이 아니라 추정이다.**
> 이 문서의 다른 모든 수치(§1 격차 지도, §2 발견)는 2026-08-07 라이브 카탈로그 실측이다.
> **비용 숫자만 다르다.** 전부 아래 가정에서 나온 산술이고 검증되지 않았다:
>
> ```
> deep universe        100 종목            (정본 11 §6 의 50~100 중 상한)
> 종목당 metric        ~40개
> 이력 깊이            12 분기
> exposure channel     종목당 ~10개        (05 §3 채널 17종 중 해당분)
> expectation vintage  horizon 4 × 분기당 8
> ```
>
> `REQ-COST-001` 이 요구하는 것은 estimate 이므로 추정으로 충분하다. 다만 **실측처럼 읽히면
> 안 된다.** 각 단계 착수 시 첫 배치로 실측하고 이 표를 갱신한다.

---

### K1 — Canonical Kernel  (정본 A)

**목표:** Information Set · Semantic Type 강제 · Temporal Kernel 수렴.

| 작업 | 종류 | 산출 |
| --- | --- | --- |
| `governance.analysis_information_set` | 신규 표 | mode 4값 + cutoff 5종 + allowed classes + calendar + snapshot FK |
| `contracts/analysis-information-set.ts` | 신규 계약 | 정본 JSON Schema → zod |
| `governance.semantic_snapshot` | 신규 표 | ontology/metric/resolution/model/prompt/source-contract revision 고정 |
| semantic type 검사기 | 신규 코드 | `contracts/semantic-type-rules.json` 을 읽어 derivation input 을 판정 |
| **PIT quality class** | **추가 컬럼** | `ingestion.source_contract_revision` 에 `PIT_A_NATIVE_VINTAGE … PIT_E_UNKNOWN` (kernel §3) |
| Temporal Kernel 수렴 | 리팩터 | 흩어진 `RELATION_PIT_SQL` · `v_pit_universe_current_v1` · `v_truth_assertion_pit_v1` 을 7 연산으로 모음 |
| REQ-PIT-003 감사 | 신규 테스트 | business SQL 에서 `now()` 를 cutoff 로 쓰는 곳 전수 검출 |

> **PIT quality class 는 빠뜨리기 쉬운데 `REQ-KERN-020` 으로 동결돼 있다** — PIT_D/E 데이터를
> 과거 ex-ante 평가의 핵심 입력으로 소급 사용 금지. 이것이 K4·K8 의 backtest 정직성을 떠받친다.
> 기존 39개 출처를 A~E 로 분류하는 것이 실제 작업이고, `market.macro_vintage` 의
> `vintage_quality`(realtime / approx_collected, as-built §4)가 이미 같은 발상의 선례다.

**게이트 (③):**
- 새 파이프라인 실행은 `analysis_information_set_id` 없이 artifact 를 쓸 수 없다 (트리거).
- `run-pit-now-audit` 이 위반 발견 시 **exit != 0** (source-contract 감사와 같은 부류).
- semantic type 위반 derivation input 은 INSERT 거부.

**REQ:** KERN-001·002·010·**020**, PIT-001·003·004, SEM-001·002

**비용:** information_set 행은 실행당 1개 → 하루 ~20행. snapshot 은 온톨로지/모델 변경시만
→ 월 ~5행. 무시 가능. 검사기는 derivation input INSERT 경로에 붙으므로 **기존 3.28M 경로에
트리거가 붙는 것에 주의** — 신규 input 에만 적용하도록 범위를 자른다.

**되돌리기:** 트리거 DROP + 새 표 무시. 제품 읽기 경로 무변경.

> **주의:** Temporal Kernel "수렴"은 리팩터다. `run-v2-graph-publish.ts` 는 **121KB** 다.
> 이 단계에서 그 파일을 열지 않는다 — 새 호출자만 kernel 을 쓰고, 기존 호출자는 K7 에서 옮긴다.

---

### K2 — Truth Foundation  (정본 B)  ★ 최우선

**§2 ②의 답.** 표를 만드는 게 아니라 **비어 있는 표를 채운다.**

| 작업 | 종류 | 대상 |
| --- | --- | --- |
| assertion writer | 신규 코드 | `knowledge.claim`(360) · `document_chunk`(8,990) → `knowledge.assertion` |
| numeric_fact writer | 신규 코드 | DART/SEC XBRL → `world.numeric_fact` (source cell + XBRL locator 필수) |
| `governance.metric_definition` | 신규 표 | canonical concept · numerator/denominator · period basis · GAAP 여부 · comparability group |
| `governance.metric_comparability` | 신규 표 | `COMPARABLE\|NORMALIZABLE\|PARTIALLY_COMPARABLE\|NOT_COMPARABLE\|UNKNOWN` |
| `core.economic_claim` | 신규 표 | seniority · voting/dividend/cash-flow · conversion · dilution · venue |
| corporate action 채우기 | 신규 코드 | `core.security_corporate_action`(0행) 을 채운다 |
| truth_class 메타 | 추가 컬럼 | assertion/fact/event/relation 에 14종 중 하나 |

**게이트 (③):**
- `assertion > 0` 이고 매일 증가 — 아니면 실패.
- `numeric_fact > 0` 이고 **모든 행이 source cell 또는 XBRL locator 를 가진다** (REQ-EVD-004).
- 정의가 다른 두 metric 의 YoY 계산은 거부 (04 §6 definition drift).
- `NOT_COMPARABLE` 인 KPI 를 비교 API 가 반환하면 실패 (REQ-PROD-021).

**REQ:** KERN-030·031·040, EVD-001·004, ID-001·002·003, PROD-020·021

**비용:** deep universe 100종목 기준
```
numeric_fact   100 × 40 metric × 12 분기 = ~48,000 초기 · +4,000/분기
assertion      기존 document 7,712 중 유니버스 해당분 → ~15,000 초기 · +200/일
economic_claim 100 종목 × ~1.5 claim = ~150행
metric_definition ~400행 (정의 자체)
```
현재 `content_pack_item` 3.28M · `ohlcv` 2.66M 대비 **무시 가능**하다.

**되돌리기:** writer 를 끄면 표가 다시 안 자란다. 읽는 쪽이 없으므로 제품 영향 0.

---

### K3 — Semiconductor Domain Adapter v1  (정본 C)

**greenfield.** 레포 전체에 playbook/adapter 인프라가 없다.

| 작업 | 산출 |
| --- | --- |
| `governance.sector_playbook` | versioned 정의 — value chain · KPI · 재무 bridge · valuation method · peer dimension · source 요구 |
| Adapter interface | 04 §2 의 8개 필수 인터페이스 |
| 반도체 playbook v1 | product generation/node · design win · capacity/HBM · 고객 집중도 · backlog 품질 |
| business driver bridge | 04 §3 의 Demand×Price×Mix → Revenue → Margin → FCF |
| acceptance fixture | 10 §3 의 golden fixture 중 이 도메인 것 |

**게이트:** `REQ-DOM-001` — LLM 이 매 실행마다 "이 업종에서 뭐가 중요한가"를 재발명하지
않는다. 검사 방법: KPI 선택이 playbook revision id 를 인용하지 않으면 거부.

**비용:** playbook 은 정의 데이터다. ~50행. driver bridge 는 100종목 × ~8 driver = 800행.

---

### K4 — Market Intelligence Minimum  (정본 D)  ★ 가장 값어치 큼 · 가장 위험

**§2 ①의 답. K3 없이는 착수하지 않는다** — playbook 이 sign·materiality·magnitude 를
versioned 정의로 공급해야 exposure 를 발명 없이 쓸 수 있다. 이것이 유형 A 를 푸는 유일한
합법 경로다.

| 작업 | 종류 | 대상 |
| --- | --- | --- |
| exposure writer | 신규 코드 | `analytics.impact_shock`(0) · `impact_exposure_revision`(0) · `impact_score_component`(0) 을 **playbook 근거로** 채운다 |
| `analytics.expectation_revision` | 신규 표 | consensus/guidance/implied/prior-model/policy/scheduled 구분 · as-of · horizon · distribution · dispersion |
| surprise 계산 | 신규 코드 | `Actual - Expected` + historical percentile + dispersion + direction + materiality |
| `analytics.valuation_estimate` | 신규 표 | method registry 기반. reverse valuation 은 range 로만 |
| outcome 연결 | 코드 | +1d/+5d/+20d abnormal return → 기존 calibration 에 연결 |

**게이트 (③) — 이 단계의 게이트가 가장 중요하다:**
- **모든 exposure 행이 playbook revision + source-grounded driver 를 인용한다.**
  인용 없는 행은 INSERT 거부. → 유형 A 를 "채웠다"가 아니라 **"발명 없이 채웠다"** 로 닫는다.
  (단순 `count > 0` 게이트를 쓰지 않는 이유가 이것이다 — §2 ① 참조)
- **impact path 의 각 스텝이 exposure 를 인용한다.** 인용 없는 스텝은 서빙 금지
  → `REQ-WORLD-010` 을 기계로 강제.
- 개인화 포트폴리오 임팩트 표면이 404 가 아니라 **"미계산"** 봉투를 반환한다
  → `REQ-SRC-001`. **K0 에서 미리 처리한다**(§2 ①) — K4 를 기다릴 이유가 없고,
  K4 가 exposure 를 채우면 같은 봉투가 자연히 `available` 로 바뀐다.
- `impact_score_component` 가 **분해된 채로** 남는다. 단일 score 로 접으면 실패
  → `REQ-IMP-001`.
- `REQ-EXP-001` — actual 이 좋고 surprise 가 나쁜 케이스가 **동시에 표현되는** fixture 통과.
- 원인 미상 움직임에 causal story 를 만들면 실패 → `REQ-MKT-001`.

**REQ:** IMP-001, EXP-001, MKT-001, WORLD-010, PROD-030

**비용:**
```
impact_shock          사건당 ~1 → 하루 ~30행
impact_exposure_rev   100 종목 × ~10 channel = ~1,000 초기 · 변경시 append
expectation_revision  100 × 4 horizon × ~8 vintage/분기 = ~3,200/분기
valuation_estimate    100 × ~3 method × 일간 = ~300/일
```

**되돌리기:** 게이트는 **shadow 로 먼저 켠다** — 위반을 기록만 하고 실패시키지 않는 모드로
1주 관측 후 강제 전환. 그래야 55,402개 기존 경로가 하루아침에 서빙에서 사라지지 않는다.

> **이 단계가 기존 제품을 깨뜨릴 수 있는 유일한 단계다.** exposure 인용을 강제하면 현재
> 서빙 중인 경로 대부분이 자격을 잃는다. **shadow → 관측 → 전환** 3박자를 반드시 지킨다.

---

### K5 — 교차: Release / Safety / SLO  (정본 09·00 §8)

**K4 이전에 착수해도 되고, K1 과 병행 가능하다.** 다만 K6 이전에는 반드시 끝나야 한다.

| 작업 | 산출 |
| --- | --- |
| `governance.release_manifest` | projection snapshot id/digest/version/freshness 묶음 |
| `governance.safety_state` | `NORMAL→CAUTION→INFORMATION_ONLY→HALTED` |
| `ops.slo_definition` / `ops.slo_observation` | semantic SLO — 기대 artifact 수 · coverage delta · freshness · parser drift |
| release 단위 읽기 포인터 전환 | 09 §3 — pack kind 간 스냅샷 불일치 창 제거 |

**왜 SLO 가 여기 있는가:** `REQ-SAFE-002` 는 semantic SLO/coverage/freshness/invariant 실패가
safety state 를 낮춘다고 규정한다. **SLO 없이는 safety_state 가 장식이다.** X4 가 미구현이라는
as-built 의 지적이 여기서 실제 blocker 가 된다. 둘은 같이 나간다.

**게이트:** `REQ-SAFE-001` — exit 0 이 건강을 뜻하지 않는다. as-built §11 의 조용한 실패 8종
중 최소 ②(구조적으로 빈 뷰를 0으로 읽음)와 ③(어댑터 조용한 skip)을 SLO 로 계측한다.

**비용:** slo_observation 은 지표당 하루 1행 × ~40지표 = ~40행/일. 무시 가능.

---

### K6 — Common Asset View  (정본 E)

`serving.common_asset_view` — 06 §2 의 12블록을 담은 deterministic structured packet.

**게이트:**
- `REQ-REC-001` — private user data 0. `personalization.*` 조인이 있으면 실패.
- `REQ-REL-001` — 같은 surface 의 view/impact/theme 가 **호환 release manifest** 를 쓴다.
- 10 §2 anti-shortcut: **private portfolio 를 바꿔도 common asset view 가 불변**.

**비용:** 100종목 × 1/일 = 100행/일, 연 36,500. 팩 대비 무시 가능.

**주의:** 기존 `apps/api/src/product/read-model.ts` 와 `run-v2-graph-publish.ts`(121KB)에
가장 가까운 표면이다. **새 빌더로 만들고 기존 경로는 건드리지 않는다.** 전환은 K7.

---

### K7 — Product Surface  (정본 G)

Asset Deep Dive · Market Home · Theme 을 common asset view 위로 옮긴다.

- `truth-visual-language.ts` 6→14종 확장 → `REQ-SEM-010`
- `REQ-PROD-010` — 홈은 기사량이 아니라 information gain × economic materiality
- `REQ-PROD-011` — 같은 root 반복 노출 제한 (effective independent roots 사용)
- `REQ-PROD-001` — 재배포 기사 → 하나의 canonical event
- L6 정합: as-built 는 팩 경로가 2표면뿐이고 나머지 11곳이 `serving.*` 를 직접 읽는다고
  측정했다. 이 단계에서 **release manifest 단위로 통일**한다.

여기서 비로소 기존 `run-v2-graph-publish.ts` 를 연다. K1~K6 이 전부 shadow 로 끝났기 때문에
이 시점에는 전환할 대상이 명확하다.

---

### K8 — Recommendation Shadow  (정본 F)  → 이후 H·I

`analytics.shadow_experiment_run`(0) · `shadow_metric`(0) · `candidate_score`(0) 를 채운다.
**표도 있고 writer 도 있다** — `experimental/shadow-artifact-writer.ts` 의
`appendShadowExperimentArtifact()`. 없는 것은 **호출자**다(유형 B, 프로덕션 호출자 0개).
파이프라인에 붙이는 것이 이 단계에서 가장 싼 작업이고, `job-wiring-inventory` 테스트가
이미 이 부류를 잡도록 설계돼 있다.

- `analytics.opportunity_candidate` / `opportunity_rejection` 신규
- `REQ-REC-020` — **선택된 후보만 평가 금지.** 탈락 후보도 outcome 을 붙인다.
- 06 §6 coverage-aware gate → 미달 시 `RESEARCH_CANDIDATE/WATCH/PARTIAL_COVERAGE/
  INFORMATION_ONLY/INSUFFICIENT_DATA`
- `REQ-SAFE-003` — safety state 가 허용할 때만 발행 (K5 선행 필수)

**H(제한적 추천)·I(개인화)는 이 계획의 범위 밖이다.** 정본 11 §1 이 calibration/capacity/
safety gate 통과를 선행 조건으로 걸었고, 그 게이트가 K5·K8 의 산출이다. **K8 결과를 보고
다시 계획한다.**

---

### K 대조 — Launch Slice MUST 전수 확인

정본 11 §2 는 첫 vertical 에서 **반드시** 구현할 것을 열거한다. 빠뜨린 것이 없는지
한 줄씩 대조한다. **조용한 누락이 이 계획이 막으려는 실패 그 자체이므로**, 범위 밖인 것도
근거와 함께 명시한다.

| 11 §2 MUST 항목 | 담당 | 비고 |
| --- | :---: | --- |
| source contracts (SEC/DART/IR/market/macro) | ✅ 이미 있음 | 활성 출처 39 · `source_contract_current_v1` 39 |
| **company web crawler minimal** | **K2** | 08 §5. IR/실적/가이던스 페이지. K4 의 guidance expectation 이 여기 의존 |
| raw / source revision + **PIT quality** | **K1** | PIT 분류가 K1 에 추가됨 (위) |
| company / security / **economic claim** identity | **K2** | |
| comparable numeric fact + **definition registry** | **K2** | |
| event / assertion / **conflict** | **K2**(assertion) + **K4**(conflict_set) | `knowledge.conflict_set` 0행 → 05 §7 competing hypothesis 의 기반이라 K4 소유 |
| expectation / guidance (consensus 는 shadow) | **K4** | |
| semiconductor product/segment/capacity/customer exposure | **K3** | |
| business-driver financial bridge | **K3** | |
| event→shock→exposure→financial impact path | **K4** | |
| basic valuation + market-implied state | **K4** | |
| common asset view | **K6** | |
| asset deep dive | **K7** | |
| outcome ledger | **K4** | 기존 `calibration_profile` 120 · `probability_calibration_snapshot` 35 에 연결 |
| semantic / release / safety gates | **K5** | |
| **rights matrix 완성 + `RIGHTS_REVIEW` 상태** | **K5** | 08 §7. **K8 의 선행조건** — 06 §6 coverage gate 가 rights state 를 최소 요건으로 요구한다 |

**범위 밖으로 명시하는 것** (정본 11 §4 DEFER 를 그대로 따른다):
HGT/TGN/NBFNet 프로덕션 의존 · causal discovery 를 제품 causal truth 로 사용 ·
contextual bandit · offline RL · 위성/원격탐사 · 3D 지구본 · 복잡한 다기간 포트폴리오
옵티마이저 · 전 체인 self-hosted archive node · 4+ hop 전수 precompute.

**이 계획이 추가로 미루는 것** (DEFER 목록에 없지만 이 계획에서 다루지 않음):
CUSIP/13F 전체 유니버스 확장(§6 한계 9) · `public.entities` 이관(as-built §12) ·
X1 PostgreSQL DAG executor(§6 한계 3) · 락 경합 감사 구멍(§6 한계 6).

---

## 6. 한계와 해결

사용자가 명시적으로 요구한 절이다. 실측으로 확인된 것만 적는다.

| # | 한계 | 왜 막히는가 | 해결 |
| --- | --- | --- | --- |
| 1 | **exposure 강제가 기존 경로 대부분을 무효화** | 경로 스텝의 압도적 다수가 association 서술어(SAME_ETF_BASKET 112K·PRODUCT_SIMILARITY 108K) | K4 에서 게이트를 **shadow 모드로 먼저** 켠다. 위반을 기록만 하고 1주 관측 → 실제 손실 규모를 재고 전환. 절대 한 번에 켜지 않는다 |
| 1b | **exposure 를 채우려면 sign·materiality·magnitude 를 알아야 하는데 그 근거가 없다** | 코드 주석이 명시적으로 보류한 이유(§2 ①). 근거 없이 채우면 REQ-IMP-001·REQ-WORLD-010 위반 | **K3 을 선행조건으로 못박는다.** Sector Playbook 이 versioned 정의로 공급한다. K3 없이 K4 를 시작하면 정본을 어기게 된다 — 이 계획에서 순서를 바꿀 수 없는 유일한 지점 |
| 1c | **빈 exposure 가 404 `portfolio_impact_not_found` 로 나간다** | INNER JOIN → 0행 → `return null` → 404. "없다"와 "아직 계산 안 했다"가 구분되지 않는다 (REQ-SRC-001) | **K4 를 기다리지 않고 먼저 고친다.** 단 **한 줄이 아니다** — 계약 봉투 + 컨트롤러 + 웹 셋을 같이 고쳐야 한다(as-built §11 선례). 착지 창을 넉넉히 잡는다 |
| 2 | **X4 `ops.slo_*` 부재가 safety_state 를 장식으로 만든다** | REQ-SAFE-002 의 입력이 SLO | K5 에서 **둘을 같이** 낸다. 분리 불가 |
| 3 | **X1 DAG executor 부재** | `pipeline_definition`·`_dependency`·`_stage_attempt` 가 DB 에 없다 | **막지 않는다.** 정본 09 §4 가 *"현재 systemd/wrapper 기반은 단계적으로 수렴한다"* 로 명시 허용. systemd 유지가 정본 준수다 |
| 4 | **`run-v2-graph-publish.ts` 121KB** | Common Asset View 가 이 근처에 착지 | K1~K6 을 전부 신규 경로로 짓고 이 파일은 **K7 까지 열지 않는다.** 리팩터를 이 계획에 끼워 넣지 않는다 |
| 5 | **공유 DB — `ops` 는 표 단위로 갈린다** | `ops.analysis_run_contract` 처럼 이름이 맞아도 남의 것 | 신규 표는 전부 `governance`/`core`/`analytics`/`serving` 에. `ops` 에 넣어야 하면 database-ownership.md 확인 후 `verify-table-ownership.sh` 예외 등록 |
| 6 | **락 경합이 감사 행을 안 남긴다** (조용한 실패 ①) | `pipeline_acquire_lock` 이 `start_wrapper_attempt` 보다 먼저 | 이 계획이 추가하는 모든 스테이지가 이 성질을 상속한다. **고치지 않는다** — 별건. K5 의 SLO 에 "기대 실행 횟수 대비 실제" 지표를 넣어 우회 계측 |
| 7 | **빈 표가 감사를 통과한다** (구멍 ②) | reachability 감사는 게이지지 실패가 아니다 | 각 단계의 게이트 ③이 **exit != 0** 으로 동작. source-contract 감사와 같은 부류로 만든다 |
| 8 | **뷰는 감사 대상이 아니다** | `run-table-reachability-audit` 이 `pg_tables` 만 스캔 | K5 에서 `pg_views` 를 스캔 범위에 추가. 안 읽히는 뷰 7개가 그때 처음 게이지에 잡힌다 |
| 9 | **CUSIP 이 `identifier_type` CHECK 에 없다** | 13F 전체 유니버스 확장 차단 | **별도 프로젝트.** as-built §12 가 이미 그렇게 판정. 이 계획은 50~100 deep universe 로 간다 |
| 10 | **`market_ts.ohlcv` UPSERT 에 `source_id` 가 conflict target 에 없다** | 남의 행을 덮어쓸 수 있다 | 이 계획이 건드리지 않는 영역. 다만 K2 의 numeric_fact writer 가 가격을 참조하면 이 표를 읽게 되므로 **읽기만** 한다 |
| 11 | **knowledge 타이머만 타임존 미지정** | analytics 의 4시간 창 대비 위상이 호스트 TZ 의존 | 이 계획이 knowledge 파이프라인에 스테이지를 추가하므로(K2 assertion writer) **K2 에서 같이 고친다.** 한 줄 |
| 12 | **`e2e-layers.md` 와 freeze 가 둘 다 목표 정본 주장** | 문서 거버넌스 | K0-1. 코드 0줄 |

---

## 7. 완료 판정

정본 11 §7 의 Definition of Done 을 그대로 쓴다. **"더 좋아 보인다"가 아니라 실측이다.**

```
□ canonical family 12개로 vertical fixture 표현 가능
□ PIT/information-set leak 0                      ← K1 의 run-pit-now-audit
□ unsupported accepted truth 0                    ← 기존 3겹 게이트가 이미 강제
□ core numeric calculation replay 100%            ← K2 의 numeric_fact + XBRL locator
□ recommendation input 이 association-only graph 에 의존하지 않음  ← K4 의 exposure 게이트
□ selected/rejected recommendation counterfactual 평가 가능  ← K8
□ source coverage/rights 상태 노출 가능           ← coverage_ledger 4,765 ✅ + rights 10필드
□ release manifest / safety degradation 작동      ← K5
□ 첫 반도체 golden fixture 가 source→view→outcome 까지 통과   ← 북극성
```

**마지막 줄이 북극성이다.** 반도체 golden fixture 하나가 원문에서 outcome 까지 관통하지
못하면 K1~K6 은 전부 T2 스캐폴딩이 하나 더 늘어난 것에 불과하다.

10 §3 의 파괴적 fixture 16종 중 이 계획이 게이트로 삼는 것:

| fixture | 게이트 단계 |
| --- | --- |
| ① 장 마감 후 실적 + 이후 기사 (ex-post leakage) | K1 |
| ② spin-off + 특별배당 + 티커 변경 | K2 |
| ③ 정기 공시 KPI 가 사라짐 | K2 |
| ⑫ 유료 consensus 이력을 최신 스냅샷이 덮어씀 | K4 |
| ⑬ 정부 계약 ceiling 을 매출로 오인 | K2 |
| ⑦ 저유동성 마이크로캡이 1위 | K8 |
| ⑯ source 장애가 부분 저하만 일으킴 | K5 |

나머지 9종은 해당 단계에서 채운다.

---

## 8. 순서 요약

```
K0   결정 3건 (freeze 를 git 에 · contract 충돌 · 스키마 배치)   코드 0줄
      │                                        ⚠ K0-1 이 첫 `git add` 다 — 착지 절차 필수
      ├─ (병행) portfolio-impact 404 → "미계산" 봉투
      │         계약 + 컨트롤러 + 웹 셋. 작지만 한 줄 아님. K4 를 기다리지 않는다
      ↓
K1   Canonical Kernel        ─┐
K5   Release / Safety / SLO  ─┴ 병행 가능 (SLO 와 safety_state 는 분리 불가)
      ↓
K2   Truth Foundation      ★ 유형 C — assertion · numeric_fact writer 를 새로 쓴다
      ↓
K3   Semiconductor Adapter v1
      ↓                      ⚠ 순서를 바꿀 수 없는 유일한 지점
K4   Market Intelligence    ★ 유형 A — playbook 근거로 exposure 를 "발명 없이" 채운다
      ↓
K6   Common Asset View
      ↓
K7   Product Surface        ← 여기서 처음 121KB 파일을 연다
      ↓
K8   Recommendation Shadow  ← 유형 B. writer 는 있고 호출자만 붙이면 된다
      ↓
    (H · I 는 K8 결과를 보고 다시 계획한다)
```

**한 번에 하지 않는다.** 각 K 는 혼자 착지하고 혼자 되돌아간다.

각 K 의 완료 조건은 유형에 따라 다르다:

```
유형 C (미착수)      게이트가 매일 "0행 아님"을 강제한다
유형 B (배선 누락)   job-wiring-inventory 가 호출자 존재를 강제한다
유형 A (물고 있음)   게이트가 "발명 없이 채워졌음"을 강제한다
                     — 절대 count > 0 으로 닫지 않는다
```

**"표를 만들었다"는 어떤 유형에서도 완료가 아니다.**

---

## 9. 실행 모델 — 무중단 자율 실행을 가능하게 하는 것

*2026-08-08 K0+K1+K5 실행에서 확립. 이후 모든 K 단계가 같은 모델을 쓴다.*

### 9.1 worktree 격리 — "파일 편집 = 배포" 를 개발 중에는 무력화한다

```
ops/systemd/user/*.service
  WorkingDirectory=/home/jigoo/.hermes/workspace/stock-insight   ← 절대경로, 본 체크아웃
```

타이머는 **본 체크아웃만** 실행한다. 그러므로 별도 worktree 에서 작업하면 as-built §1 의
제약이 개발 중에는 적용되지 않는다. 착지 창 계산이 필요한 것은 master 병합 순간 한 번뿐이다.

**착수 전에 반드시 증명한다** — 이 모델 전체가 이 한 가지 가정 위에 서 있다:

```bash
BEFORE=$(git ls-files -z | while IFS= read -r -d '' f; do sha256sum --binary "$f"; done | sha256sum)
git worktree add <path> -b <branch>
AFTER=$(...)   # BEFORE 와 같아야 한다
```

2026-08-08 측정: `ccb1ddb5…` 불변 확인.

### 9.2 `git ls-files` 는 추적된 파일만 센다

| 행위 | `source_tree_hash` | 안전한가 |
| --- | --- | --- |
| 추적되지 않은 새 파일 작성 | 불변 | ✅ |
| 추적된 파일 수정 | 변한다 | ❌ 실행 중이면 그 실행이 못 닫힌다 |
| **`git add`** (새 파일을 추적으로 승격) | **변한다** | ❌ |

"작성은 안전"만 기억하고 `git add` 를 안전으로 착각하면 첫 단계에서 파이프라인을 깬다.

### 9.3 레포는 이미 자율 실행에 맞게 설계돼 있다

`schema:status`/`schema:apply` · `backfill:*`/`:apply` · `ingest:*:dry-run`/`:apply` —
**안전한 쪽이 기본값**이다. 사고를 내려면 명시적으로 `--apply` 를 써야 한다.

리허설 DB 하니스도 있다(`run-p6-db-rehearsal.mjs`): 폐기용 DB 를 만들고 마이그레이션을
적용한 뒤 역할 상태 복원까지 확인하고 DROP 한다. 라이브 적용 전 검증 경로다.
admin DSN 은 `run_analytics_pipeline.sh` 의 `DB_URL` 에서 database 만 `postgres` 로 바꾼다
(`research_app` 롤 실측: `createdb=true`).

### 9.4 ⚠️ 부팅 다이제스트 — 마이그레이션마다 반드시 따라오는 절차

`apps/api-server/src/db/live-database-guard.ts` 의 `EXPECTED_CATALOG_DIGESTS` 는 **소스
하드코딩 상수**다. api-server 는 `listen` 이전에 라이브 카탈로그를 해싱해 대조하고,
불일치면 죽는다.

`ops/scripts/repin-live-database-digests.mjs` 헤더에 사고 이력이 있다 — 마이그레이션 059 가
2026-08-03 에 **브레인을 크래시루프**시켰고 그래서 이 도구가 생겼다. guard 주석은 065 가
**표 하나** 추가로 `relation_privileges_digest` 를 움직였다고 적는다(773 entries 중 1개).
그리고 *"this array is about **which tables exist** and what policies they carry"*.

```
① schema:apply
② DATABASE_URL=… node ops/scripts/repin-live-database-digests.mjs
③ diff 가 내 마이그레이션으로 설명되는지 판독   ← 설명 안 되면 중단
④ live-database-guard.ts 상수 갱신 후 커밋
⑤ api-server 재시작 성공 확인

②~④ 사이에 api-server 를 재시작하지 않는다. 죽는 것은 다음 부팅이다.
```

`pnpm test:xg:db`(리더 권한 리허설)를 P4 게이트에 넣는 이유도 이것이다.

### 9.5 되돌리기 — "마이그레이션 롤백" 은 이 레포에 없는 연산이다

마이그레이션은 추가 전용이고 `down` 이 없다. 적용된 것을 고치면 체크섬 드리프트로 거부된다.

```
1. 병합 커밋을 git revert       ← 코드만 되돌린다
2. 새 표는 그대로 둔다           ← 비어 있고 아무도 안 읽는다. 무해
3. 다이제스트 재핀은 되돌리지 않는다  ← 표가 남아 있으므로 재핀 값이 여전히 맞다
```

제품 읽기 경로를 바꾸지 않는 단계(K0·K1·K5)는 이것으로 충분하다.

### 9.6 중단 조건 — 이것만 멈춘다

| # | 조건 |
| --- | --- |
| 1 | 검증(테스트·lint·typecheck·format) 실패 |
| 2 | 리허설 DB 생성 불가 → 검증되지 않은 마이그레이션을 공유 운영 DB 에 적용하지 않는다 |
| 3 | 백업/복원 검증 실패 |
| 4 | `schema:status` 에 내 것 외 pending 존재 (공유 DB — 남의 마이그레이션일 수 있다) |
| 5 | in-flight 파이프라인이 15분 넘게 안 끝남 |
| 6 | 마이그레이션이 non-additive (DROP / 기존 컬럼 ALTER) |
| 7 | worktree 격리 증명 실패 (`BEFORE ≠ AFTER`) |
| 8 | 마이그레이션 번호 충돌 |
| 9 | 다이제스트 변경이 내 마이그레이션으로 설명 안 됨 |
| 10 | 재핀 후 api-server 부팅 실패 |

그 외 — 린트 실패, 타입 에러, 테스트 수정, 마이그레이션 재작성 — 은 전부 자율 처리한다.

### 9.7 진행 기록

각 실행의 진행 상태는 날짜별 실행 로그에 남긴다. 다른 세션에서 이어받을 수 있도록
worktree 경로·브랜치·기준 tree hash·완료 항목·커밋 해시·환경 메모를 담는다.
첫 사례: [`v2-kernel-execution-log-2026-08-08.md`](./v2-kernel-execution-log-2026-08-08.md)
