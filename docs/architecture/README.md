# Stock Insight 아키텍처 문서 묶음

이 폴더는 **외부로 그대로 내보낼 수 있는 자립 묶음**이다. 이 폴더 밖의 문서를 읽지 않아도
시스템이 어떻게 설계됐고 어디까지 지어졌는지 알 수 있다.

---

## ⚠️ 이 묶음을 읽기 전에 — 설계와 구현은 다르다

**이 폴더의 문서 중 절반은 목표를 현재형으로 쓴 설계 문서다.** 특히
`stock-insight-e2e-layers.md` 는 *"로드맵이 모두 구현 완료된 시점을 가정한"* 문서이고,
표와 본문이 마치 전부 지어진 것처럼 서술한다. **그대로 믿으면 안 된다.**

무엇이 실제로 지어졌는지는 **§구현 대조표**(아래)와
`stock-insight-as-built-2026-08-07.md` 가 답한다. 이 둘만 실측 기반이다.

| 문서 | 성격 | 시제 | 믿어도 되는가 |
| --- | --- | --- | --- |
| `stock-insight-as-built-2026-08-07.md` | **실측** | 2026-08-07 현재 | ✅ 코드·DB 를 직접 잼 |
| 이 README 의 구현 대조표 | **실측** | 2026-08-07 현재 | ✅ 아래 근거 참조 |
| `stock-insight-e2e-layers.md` | 목표 정본 | **미래 완료 가정** | ❌ 설계 의도로만 |
| `stock-crypto-insight-platform-architecture.md` | 기준선 계획 | 계획 | ❌ 설계 의도로만 |
| `stock-insight-v2-enhancement-plan.md` | 고도화 계획 | 계획 | ❌ 설계 의도로만 |
| `v2-enhancement-master-roadmap.md` | 로드맵 | 계획 | ❌ 설계 의도로만 |
| `backend-db-master-plan.md` | 백엔드 DB 계획 | 계획 | ❌ 설계 의도로만 |
| `adr/ADR-00*.md` | 결정 기록 | 결정 시점 | ✅ 결정 자체는 유효 |
| `operations/*.md` | 운영 런북 | 사건 시점 | ✅ 날짜 확인 후 |

---

## 구현 대조표 — 계층별 설계 대 실제

`stock-insight-e2e-layers.md` §1 레이어 카탈로그가 지목한 표와 코드를 **전수 대조**했다.
근거는 `pg_class` 조회와 파일 존재 확인, 행 수는 읽기 전용 조회다. **2026-08-07 측정.**

### 본 계층 L0–L8

| | 설계된 것 | 실제 | 상태 |
| --- | --- | --- | --- |
| **L0** 원천 소스 | DART·SEC·ETF·거래소·뉴스·코인 수집기 | 활성 출처 **39**, 계약 커버 39/39, 승인 37 · 잠정 2 · 과도기 면제 6 | ✅ **구현** |
| **L1** 수집·불변 원본 | `ingestion.raw_object` · `source_revision` · `source_contract_*` · 코드 `raw-object-store` `source-revision-store` `evidence-acquisition` | 표 4종 전부 존재. raw_object **4,392** · source_revision **4,751**. 코드 2/3 존재 — **`evidence-acquisition.ts` 는 없다** | ⚠️ **대부분 구현** |
| **L2** 정체성·분류 | 회사≠주식 분리 · issuer bridge · 버전 관리 분류 | `core.entity` **1,448**(Company 325 = Stock 325, `ISSUED_BY` 254로 연결) · 식별자 **2,080** · taxonomy 표 존재 | ✅ **구현** |
| **L3** 검증 지식 추출 | LLM 추출 + 기계 검증기 span 대조 | `document_chunk` **8,880** · `claim` **356** · 인용문 결합 검증 가동(패리티 테스트 보유) | ✅ **구현** |
| **L4** 시간 관계 원장 | 덮어쓰기 없음 · 과거 시점 복원 | 원장 3표 + DELETE/UPDATE 거부 트리거. 서술어 **24종** · 증거 **64,699** | ✅ **구현** |
| **L5** 그래프 분석 | 다중 홉 경로 · 커뮤니티 · 시장 검증값 | `impact_path_v2` **241,188** · `graph_community` **206** · `relation_measurement` **4,583** · 스냅샷 37 sealed | ✅ **구현** ※ |
| **L6** 서빙 팩 | "웹이 읽는 유일한 형태" | 팩 경로는 **2개 표면뿐**(관계 그래프 · impact brief). 나머지 화면은 `serving.*` 뷰 **11곳**을 직접 읽고, 크립토는 별도 스키마 | ❌ **설계와 다름** |
| **L7** 읽기 API | 유일한 소비 창구 · 경계 검증 | `graph-read-model-v2` 존재 · 글로벌 인증 가드(예외 `/health` `/v1/meta` 둘) · `BEGIN READ ONLY` + 트랜잭션 로컬 스코프 | ✅ **구현** |
| **L8** 웹 UI | Obsidian형 탐색 · 코드 `relationship-graph-view.tsx` | 그래프 뷰 존재하나 파일명이 다르다 — 실제는 **`relation-sigma-graph.tsx`** | ⚠️ **구현, 명칭 불일치** |

※ L5 에 대해: `e2e-layers.md` **부록 A 는 "path/community/measurement 0건"이라고 적어뒀는데
이는 2026-07-20 기준이고 완전히 낡았다.** 위 수치가 현재다.

### 교차 계층 X1–X4

| | 설계된 것 | 실제 | 상태 |
| --- | --- | --- | --- |
| **X1** 오케스트레이션 | `ops.pipeline_definition` · `_dependency` · `_run_claim` · `_stage_attempt` 로 **"외부 오케스트레이터 없이 PostgreSQL DAG 실행"** | **`pipeline_run_claim` 하나만 존재.** `pipeline_definition`·`_dependency`·`_stage_attempt` 는 **DB 에 없다.** 실제 실행은 systemd 타이머 6개 + bash 래퍼이고, 실행 추적은 두 갈래로 갈려 있다 — claim 표는 **전 이력에서 데이터셋 2종뿐**(`analytics.l5_producers_v2`, `serving.entity_relation_graph_v2`, 2026-07-19~ 각 32회), 나머지 파이프라인은 `public.migration_runs` 의 wrapper 행으로 추적 | ❌ **미구현** |
| **X2** 이벤트·전달 | `ops.outbox` · `outbox_delivery` · `dead_letter` · 원자성 + 최소 1회 전달 | 표는 존재(이름은 `outbox_event`). event **4,751** · delivery **4,746** · dead_letter **0**. 다만 **실제 writer 는 DB 트리거 하나뿐**이고 선언된 엣지 2개는 라이터가 없다. TypeScript `insertOutboxEvent` 는 **프로덕션 호출자 0개** | ⚠️ **부분 구현** |
| **X3** 개인화 | `personalization.*` · 비LLM ranker · UUID fail-closed | 스키마 **10표** 존재 · `run-feed-build.ts` 존재 · UUID 강제 확인됨 | ✅ **구현** |
| **X4** 운영 관측 | **`ops.slo_*`** 로 신선도·비용·지연·품질 SLO 를 DB 자체로 계측 | **`ops.slo_*` 표가 하나도 없다.** 관측은 `migration_runs` 감사 행 + 파이프라인 readback 단언 + 감사 잡 3종으로 대체돼 있다 | ❌ **미구현 (대체 수단 존재)** |

### 요약

```
✅ 구현       L0 · L2 · L3 · L4 · L5 · L7 · X3          7개
⚠️ 부분·불일치 L1(코드 1개 없음) · L8(명칭) · X2(라이터 없음)  3개
❌ 미구현·상이 L6(설계와 다른 모양) · X1(DAG 실행기) · X4(SLO)  3개
```

**설계 문서가 현재형으로 서술한 것 중 셋은 지어지지 않았다.** X1 의 "PostgreSQL DAG 실행기"와
X4 의 "SLO 계측"은 표조차 없고, L6 의 "웹이 읽는 유일한 형태"는 실제 모양이 다르다.
외부에 이 묶음을 내보낼 때 이 세 줄을 빼면 안 된다.

---

## 읽는 순서

```
1. 이 README 의 구현 대조표        ← 무엇이 진짜인지
2. stock-insight-as-built-2026-08-07.md
     §3 원장(중심 설계) · §11 실패하는 방식
3. stock-insight-e2e-layers.md    ← 설계 의도. 위 대조표를 옆에 두고 읽어라
4. adr/                            ← 왜 그렇게 정했나
5. operations/                     ← 실제로 어떻게 돌리나
```

---

## 파일 목록

### 실측
- `stock-insight-as-built-2026-08-07.md` — 지금 어떻게 지어져 있는가. 1,000줄, 12절

### 설계 (목표·계획)
- `stock-insight-e2e-layers.md` — 목표 아키텍처 정본 L0–L8 · X1–X4
- `stock-crypto-insight-platform-architecture.md` — Phase 0~5 기준선
- `stock-insight-v2-enhancement-plan.md` — 고도화 계획. 목표 정본이 §27 을 규범적으로 편입
- `v2-enhancement-master-roadmap.md` — V2 로드맵
- `backend-db-master-plan.md` — 백엔드 DB 마스터 플랜
- `backend-db-gates.json` — 기계 판독 게이트 정의. **`knowledge-backlog-gate.test.ts` 가 읽는다**

### 결정 기록
- `adr/ADR-001-v2-naming-freeze.md` — 명칭·계약 동결
- `adr/ADR-002-source-contract-approval-policy.md` — 출처 계약 승인 정책
- `ontology-rfc-process.md` — 서술어 온톨로지 변경 절차
- `postgis-runtime-prerequisite-runbook.md` — PostGIS 런타임 전제

### 운영
- `operations/database-ownership.md` — **공유 DB 소유권 지도.** 코드 4곳이 인용
- `operations/impact-plane-v1-v2.md` — v1 평면이 비어 있는 이유. 코드 7곳이 인용
- `operations/schema-migration-ledger.md` · `pipeline-rerun.md` · `edge-and-login-performance.md`
- `operations/live-production-db-external-development-setup.md`
- `operations/analytics-pipeline-outage-2026-08.md` — 2026-08-03 장애 기록
- `operations/data-ecosystem-artifact.html` · `data-health-baseline.json`

---

## 이 묶음 밖에 남겨둔 것

디자인 시스템 문서는 **테스트가 파일을 직접 읽으므로** 옮기지 않았다:

```
docs/design/ux-constitution.md         apps/web/test/design-governance.test.ts 가 읽는다
docs/futur_insight_design_system.md    같은 테스트가 읽는다
docs/design/profiles/*.md
docs/stock_info_recommendation_app_design.md   CLAUDE.md 가 "intact" 로 못박음
docs/futur_insight_mockups.html                같음
```

## 유지 규칙

- **실측 문서는 수정 대상이 아니라 재작성 대상이다.** 낡으면 새 날짜로 새 파일을 만들고
  옛 파일은 그대로 둬라. 그래야 "그날엔 이랬다"가 계속 참으로 남는다.
- **목표가 바뀌면 `e2e-layers.md` 를 고쳐라.** 실측 문서가 아니다.
- **이 README 의 대조표는 실측 문서를 새로 쓸 때마다 같이 다시 재라.** 대조표가 낡으면
  이 묶음 전체가 "설계를 구현으로 읽히는" 바로 그 함정이 된다.

재측정 명령은 `stock-insight-as-built-2026-08-07.md` 부록 B 에 있다.
