# V2 Canonical Kernel 실행 로그 (K0 + K1 + K5)

> **이어서 하려면 여기부터 읽어라.** 이 문서는 진행 중 계속 갱신된다.
> 계획 정본은 [`v2-final-implementation-plan-2026-08-07.md`](./v2-final-implementation-plan-2026-08-07.md),
> 아키텍처 정본은 [`stock-crypto-investment-context-world-model-v2-final/`](./stock-crypto-investment-context-world-model-v2-final/).

## 어디서 작업 중인가

```
worktree   /home/jigoo/.hermes/worktrees/stock-insight-v2-kernel
branch     feat/v2-canonical-kernel                   → master 병합 완료 (6734a8c)
           fix/live-database-guard-timescale-chunks   → master 병합 완료 (dad8652)
본 체크아웃  /home/jigoo/.hermes/workspace/stock-insight  ← P5 이후 master 가 최신
```

## 🔧 브레인 크래시루프 — 해소 (2026-08-08)

P5 에서 발견한 24시간짜리 장애(§아래)를 고쳤다. 사용자 결정: **근본 수정**.

| 단계 | 상태 |
| --- | --- |
| probe 에서 TimescaleDB 청크 제외 (`TIMESCALE_CHUNK_EXCLUSION`) | ✅ `e127680` |
| 다이제스트 4개 재핀 (reader/writer × relation/rls) | ✅ 도구 검증 **14개 전부 일치** |
| repin 도구의 `$'` 치환 확장 결함 수정 | ✅ 함수 치환 + 미해소 플레이스홀더 검사 |
| `live-database-guard.test.ts` 픽스처 갱신 | ✅ |
| master 병합 | ✅ `dad8652` |
| 이미지 빌드 → 배포 → 부팅 확인 | ✅ **복구 완료** |

**복구 확인 (2026-08-08 01:53 KST)**

```
이미지        stock-insight-api:dad8652  sha256:0ba24b96c049…
              (이전 핀 sha256:1264b009… 은 archive/PREVIOUS_API_IMAGE_PIN.txt 에 보존)
컨테이너      Up (healthy) · RestartCount=0 · ExitCode=0
로그          "listening on http://0.0.0.0:6200"
              "live database verification failed" 0건 — 가드는 활성 상태로 통과
BFF → 브레인  {"ok":true,"db":{"status":"ok","latencyMs":1}}
사용자 경로   /  307 · /login  200
```

**롤백 경로:** `.env.docker` 의 `STOCK_INSIGHT_API_IMAGE` 를 이전 핀으로 되돌리고
`docker compose --env-file .env.docker -f docker-compose.prod.yml up -d api`.
단 이전 이미지는 옛 핀을 갖고 있으므로 되돌리면 다시 크래시루프한다 — 롤백은
가드 변경 자체가 잘못됐다고 판단될 때만 의미가 있고, 그때는 마이그레이션 074 의
GRANT 를 되돌리는 쪽이 맞다.

**핵심 수치:** 새 relation 배열은 **248 항목, 청크 0개**. 이전 핀은 773 항목 중 527개가
청크였다. 청크는 하이퍼테이블이 자라면 자동 생성되므로 이전 구조에서는 핀이 유지될 수
없었다 — 065 재핀(08-05) 이후 이틀 만에 둘이 생겼다.

**가드를 약화시키지 않는 근거:** 앱이 읽는 것은 하이퍼테이블(`market_ts.ohlcv`)이고 청크는
그 아래 저장 파티션이며 GRANT 는 하이퍼테이블의 기계적 귀결이다. `_timescaledb_internal`
의 나머지 14개(연속 집계 내부, 잡 통계 뷰)는 범위에 남는다.

**픽스처가 이 장애를 못 잡은 이유도 기록해 뒀다** — `live-database-guard.test.ts` 는
가드가 *그 값과 일치하는 행* 을 받아들이는지만 단언하므로, 라이브와 어긋난 핀도 통과하고
부팅에서만 실패한다. 잡을 수 있었던 것은 라이브 대상 repin 도구뿐이다.

**왜 worktree 인가:** `ops/systemd/user/*.service` 의 `WorkingDirectory` 가 본 체크아웃
절대경로다. 타이머는 master 만 실행하므로 worktree 작업은 운영에 영향이 0이다.
본 체크아웃의 tracked tree hash 가 안 움직이는 것을 매 커밋 후 확인한다.

```
기준 tree hash (master, 불변이어야 함)
ccb1ddb5818e69fc28bfc62bd753f9a87bae99321e2c2765b5f4f2a37ccd0e1d
```

재확인 명령:
```bash
cd /home/jigoo/.hermes/workspace/stock-insight
git ls-files -z | while IFS= read -r -d '' f; do sha256sum --binary "$f"; done | sha256sum
```

---

## 진행 체크리스트

### P0 — 격리 ✅ 완료

- [x] **P0-1** worktree 격리 증명 — `BEFORE = AFTER = ccb1ddb5…` 일치 확인
- [x] **P0-1b** `git worktree prune` (prunable 20개 정리)
- [x] **P0-1c** worktree 생성 `feat/v2-canonical-kernel`
- [x] **P0-2** 마이그레이션 번호 선점 확인 — **078~083 비어 있음** (전 브랜치 조회 결과 0건, 현재 최대 077)
- [x] `docs/plan/` 을 worktree 로 복사 (untracked 라 worktree 에 안 따라옴)

### P1 — K0: 결정을 산출물로 🔄 진행 중

- [x] **K0-1a** `reference/pre-freeze-split-package.zip` 삭제
- [x] **K0-1b** `SHA256SUMS.txt` · `MANIFEST.json` 에서 zip 항목 제거
- [x] **K0-1b2** `reference/README.md` 에 제거 사유 기록 + 연쇄 체크섬 갱신
- [x] **K0-1c** 무결성 검증 — `sha256sum -c` **31/31 OK**, MANIFEST 30개 항목 디스크 일치
- [x] **K0-1d** freeze 패키지 커밋 → **`600e419`**
- [x] **K0-1e** `docs/architecture/README.md` 를 freeze 패키지로 재지시 → **`fc19147`**
- [x] **K0-1f** superseded-by 헤더 3개 파일 → **`fc19147`**
      (`e2e-layers.md` · `v2-enhancement-master-roadmap.md` · `stock-insight-v2-enhancement-plan.md`)
- [x] **K0-2a** `packages/contracts/src/analysis-information-set.ts` 신규 → **`f1247e1`**
- [x] **K0-2b** `truth-visual-language.ts` truth class 14종 층 추가 → **`f1247e1`**
- [x] **K0-3** portfolio-impact 404 → `not_computed` 봉투 → **`5d35599`**
      (계약 enum + read model 폴백 조회 + 웹 3분기 — 예상대로 한 줄이 아니었다)
- [x] **K0-4** 계획서 §9 에 실행 모델 반영 → **`5d35599` 이후 커밋**

### ✅ P1(K0) 완료 — 게이트 통과 증거

```
typecheck   11/11 태스크
test        10/10 태스크 (contracts 103, api·web·api-server 포함)
lint        통과
format:check 통과
본 체크아웃 tree hash  ccb1ddb5… 불변 (타이머 무영향)
```

**K0-2 에서 내린 결정 (되짚지 말 것):**
- `temporal.ts` 는 **건드리지 않았다.** 읽기 표면 계약으로 유지하고
  `informationSetFromTemporalQuery` 하나만 다리로 둔다
- epistemic class 6종 렌더 스펙은 **바이트 단위로 불변** (테스트가 강제)
- truth class 어휘의 단일 소유자는 `truth-visual-language.ts`.
  `analysis-information-set.ts` 는 어휘를 갖지 않는다 — freeze 스키마가
  `allowedInformationClasses` 를 plain string 으로 규정하기 때문
- **contracts/src 에는 상호 import 선례가 없다.** 공용 모듈로 빼면 `.ts` 확장자를
  tsc 는 거부(TS5097)하고 Node ESM 은 요구해 소비자 tsconfig 까지 번진다. 시도했다가
  되돌렸으니 다시 시도하지 말 것

### P2 — K1: Canonical Kernel ✅ 완료

- [x] `078_semantic_snapshot` → `governance.semantic_snapshot` → **`421ca90`**
- [x] `079_analysis_information_set` → `governance.analysis_information_set` → **`421ca90`**
- [x] `080_source_pit_quality` → `governance.source_pit_quality` (+current 뷰) → **`421ca90`**
- [x] `packages/contracts/src/semantic-type-guard.ts` → **`1b8db11`**
- [x] `apps/api/src/ops/run-pit-now-audit.ts` → **`1b8db11`** (analytics 파이프라인 13번째 스테이지)
- [x] `apps/api/src/kernel/temporal-kernel.ts` → **`1b8db11`**
- [x] `packages/db-schema/test/canonical-kernel-migration.test.ts` (정적 27개)
- [x] `apps/api/scripts/run-kernel-db-rehearsal.mjs` (실DB 리허설)

> `run-v2-graph-publish.ts`(121KB)는 **열지 않았다.** K7 소관.

**K1 에서 계획과 달라진 것 (근거 있음):**

| 변경 | 이유 |
| --- | --- |
| 078↔079 번호 교체 | information set 이 semantic_snapshot 을 FK 로 참조. 번호는 의존 순서를 따른다 |
| PIT 등급을 `source_contract_revision` 컬럼이 아니라 **별도 원장**으로 | 그 표에 `source_contract_revision_immutable` 트리거가 있고 각 행이 자기 계약에 대한 `content_hash` 를 갖는다. 백필하면 실패하거나 hash 가 내용을 기술하지 않는 리비전 69개가 남는다 |
| **다이제스트 재핀 불필요** | guard 의 probe 가 전부 `has_table_privilege(current_user,…)` 로 걸린다 → app 롤에 GRANT 안 하면 핀이 안 움직인다. 리허설이 `noAppRoleReach: true` 로 실증 |
| PIT 감사에 **알려진 예외 목록** | `run-v2-graph-publish.ts:1696-1697` 이 실제 위반인데 K7 소관. 순수 실패면 파이프라인을 즉시 깬다. 예외는 이유·담당과 함께 기록하고 신규 위반은 실패시키며, 예외 부패도 검사한다 |

**리허설이 정적 테스트가 놓친 결함 2개를 잡았다:**
1. `ARRAY(SELECT DISTINCT unnest(...))` — PostgreSQL 은 CHECK 안 서브쿼리 금지.
   SQL 텍스트로는 멀쩡하고 실제 DB 가 표를 만들 때만 실패 → IMMUTABLE 함수로 분리
2. 그 함수 파라미터명 `values` — 예약어라 SQL 함수 본문에서 식별자 불가

**`job-wiring-inventory` 가 신규 감사 잡의 미배선을 즉시 잡았다** — 탐지기 층이 설계대로
작동. analytics 파이프라인 스테이지 12 → 13, `core-identity-sync-runner.test.ts` 의
목록도 함께 갱신.

### P3 — K5: Release / Safety / SLO ✅ 완료 (`0ad6649`)

- [x] `081_release_manifest` → `governance.release_manifest` + `release_component` + `release_current_v1`
- [x] `082_safety_state` → `governance.safety_state_transition` + `safety_state_current_v1`
- [x] `083_slo_ledger` → `governance.slo_definition` + `slo_observation` + `slo_current_v1` (seed 8)
- [x] `run-table-reachability-audit.ts` 에 뷰 스캔 추가

**뷰 스캔 실측 (라이브 dry-run):** 소유 뷰 27개 중 **9개 미읽힘**.
as-built 의 serving 7개를 확인하고 3개 추가 발견
(`knowledge.v_signal_numeric`·`v_signal_quarantine`·`world.v_event_legacy_bridge_v1`).
`serving.relation_current_v1` 은 이제 읽힌다.

> **`governance.slo_*` 는 정본(`ops.slo_*`) 대비 의도적 이탈.** 사유를 083 주석과
> index.ts description 에 남겼다.

### P4 — 검증 ✅ 완료

```
db-schema 정적 테스트   53/53 (078~083)
리허설 DB               078~083 전 항목 true · roleStateRestored true
                        digestSafety: governance 관계 24개, app 롤 도달 0
typecheck               11/11 태스크
test                    10/10 태스크
build                   7/7 태스크
lint · format:check     통과
test:xg:db              reader/writer surface verified · role state restored
schema:status           pending = 정확히 우리 6개 (078~083). 남의 것 없음
```

### P5 — 착지 (라이브) ✅ 완료

- [x] 논리 백업 (exit 0, `logical-20260807T162655Z`)
- [x] in-flight 0 확인
- [x] master 병합 `6734a8c` (01:32 KST, news 창 안)
- [x] `schema:apply` — 078~083 전부 적용, **pending 0 / 83 applied**
- [x] 다이제스트 확인 — **내 변경으로 인한 이동 0** (바이트 동일, 773 항목)
- [x] 사후 감사 4종 통과

**라이브 실측 (적용 직후)**

```
governance 관계        1 → 13 (신규 12: 표 8 + 뷰 4)
source_pit_quality     39행  A:1 B:3 C:13 D:5 E:17
safety_state           NORMAL (recommendation_allowed=true)
slo_definition         8행 (전부 report-only)
semantic_snapshot      0행 ┐
analysis_information_set 0행 ├ writer 는 K2+ 소관 (shadow 단계 설계대로)
release_manifest       0행 ┘
schema:status          83/83 applied · pending 0
PIT 감사               violation 0 · stale 0 · 알려진 예외 2
source contract 감사   uncovered 0 · violations 0
reachability           표 171 · 뷰 31 · 미읽힘 뷰 13 (신규 4 포함, 아직 소비자 없음)
```

> **내 §2 기준으로 정직하게:** 신규 8표 중 **3표는 실데이터**(source_pit_quality 39 ·
> slo_definition 8 · safety_state_transition 1), **5표는 writer 대기**(유형 C). K1·K5 는
> 계약과 게이트를 세우는 shadow 단계로 명시 범위였으므로 설계대로지만, "완료" 를
> "0행이 아님" 으로 읽으면 안 된다.

---

## ✅ P4.5 다이제스트 — 재핀 불필요로 판명

**리허설이 실증했다: `noAppRoleReach: true` (governance 관계 24개, app_reader/writer 도달 0건).**

guard 의 probe(`live-database-guard.ts`)는 relation·column·sequence·schema·RLS 배열을
전부 `has_table_privilege(current_user, …)` / `has_schema_privilege` 로 거른다. 078~083 은
파이프라인 롤(si_*)에만 GRANT 하고 app 롤 상속 체인
(`app_reader → stock_insight_reader`, `app_writer → stock_insight_writer → reader`) 밖이므로
핀이 움직이지 않는다.

**그래도 P5 에서 repin 도구를 무조건 실행한다** — 예상이 아니라 결과로 판단한다.
diff 가 비어야 정상이고, 비어 있지 않으면 중단 조건 #10 이다.

<details><summary>원래 계획 (참고용)</summary>

`apps/api-server/src/db/live-database-guard.ts:79` 의 `EXPECTED_CATALOG_DIGESTS` 는
소스 하드코딩 상수다. api-server 는 `listen` 전에 라이브 카탈로그를 해싱해 대조하고
불일치면 죽는다.

`ops/scripts/repin-live-database-digests.mjs` 헤더에 사고 이력이 있다 — 마이그레이션 059 가
2026-08-03 에 **브레인을 크래시루프**시켰고 그래서 이 도구가 생겼다. guard 주석은 065 가
**표 하나** 추가로 `relation_privileges_digest` 를 움직였다고 적는다(773 entries 중 1).

**우리는 표를 6개 추가한다.**

```
① schema:apply
② DATABASE_URL=… node ops/scripts/repin-live-database-digests.mjs
③ diff 가 우리 6개 표로 설명되는지 판독   ← 설명 안 되면 중단
④ live-database-guard.ts 상수 갱신 후 커밋
⑤ api-server 재시작 성공 확인

②~④ 사이에 api-server 를 재시작하지 않는다.
```
</details>

---

## 🚨 P5 에서 발견한 것 — 기존 다이제스트 드리프트 (내 변경 아님)

적용 **전에** repin 도구를 돌린 결과, 핀이 이미 어긋나 있었다.

```
stock_insight_app_reader   relation_privileges_digest ≠ · rls_contract_digest ≠
stock_insight_app_writer   relation_privileges_digest ≠ · rls_contract_digest ≠
```

**즉 지금 api-server 를 재시작하면 이미 크래시루프한다.** 내 작업 이전부터 그렇다.

### 원인 — 바이트 단위로 증명됨

정확히 세 관계를 제외하면 핀 `f3a18fad…` 이 773 항목으로 재현된다:

| 관계 | 원인 |
| --- | --- |
| `market.scheduled_event` | 마이그레이션 074 가 app_reader 에 GRANT 하고 **재핀하지 않았다** |
| `_timescaledb_internal._hyper_1_826_chunk` | **TimescaleDB 가 자동 생성** |
| `_timescaledb_internal.compress_hyper_2_825_chunk` | 〃 |

### 두 번째가 구조적 결함이다

guard 의 probe 는 `nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'` 만 거른다.
`_timescaledb_internal` 은 걸러지지 않고, 청크 **775개 중 531개가 app_reader 도달 가능**하다.

시계열 데이터가 늘면 청크가 자동으로 생기므로 **핀은 코드·마이그레이션 변경이 전혀 없어도
스스로 어긋난다.** 재핀은 고침이 아니라 러닝머신이다. 제품이 읽는 것은 하이퍼테이블
(`market_ts.ohlcv`)이지 개별 청크가 아니므로, 올바른 수정은 probe 에서
`_timescaledb_internal` 을 제외하는 것이다.

### 🔴 적용 후 확인: 브레인이 이미 크래시루프 중이었다 (약 24시간)

```
stock-insight-api-1   Restarting (1)   RestartCount=1357
로그                  "live database verification failed for stock_insight_app_reader"
컨테이너 생성          2026-08-03
```

**타임라인**

| 시각 (KST) | 사건 |
| --- | --- |
| 2026-08-07 01:32 | 마이그레이션 **074** 적용 — app_reader 에 GRANT, 재핀 없음 |
| (그 이후 어느 재시작) | 브레인이 부팅 검증에 실패하기 시작 |
| 2026-08-08 01:33 | 내 마이그레이션 078~083 적용 |
| 2026-08-08 01:40 | 발견. RestartCount **1357** |

**1357회 재시작은 5분 만에 쌓일 수 없다.** 074 적용(24시간 전)이 기점이다.

**내 변경이 원인이 아님을 두 번 증명했다:**
1. 적용 **전** repin 도구 실행 → 이미 어긋나 있었음
2. 적용 **후** 다이제스트가 바이트 동일 (773 항목, `f3a18fad…`) — 신규 12개 관계 전부
   app 롤 도달 불가

**복구에 필요한 것 — 내 범위 밖**

`stock-insight-api-1` 은 소스 마운트가 아니라 **핀된 이미지**(`sha256:1264b009…`)로 돈다.
즉 `live-database-guard.ts` 의 상수를 고치는 것만으로는 복구되지 않고 **이미지 재빌드 +
재배포**가 필요하다. 보안 크리티컬한 브레인의 배포 작업이고 K0/K1/K5 와 별건이다.

그리고 재핀만으로는 재발한다 — Timescale 청크가 자동으로 늘어나기 때문이다.
**올바른 수정은 probe 에서 `_timescaledb_internal` 을 제외하는 것**이고, 그것은 보안 가드의
검사 범위를 바꾸는 설계 결정이라 사람의 판단이 필요하다.

(근거: 제품이 읽는 것은 하이퍼테이블 `market_ts.ohlcv` 이지 개별 청크가 아니다. 청크는
하이퍼테이블 GRANT 가 자동 전파된 저장 구현이고, 청크 단위 항목은 "앱이 의미상 무엇에
도달하는가" 에 대해 아무 신호도 더하지 않는다.)

### 이번 실행에서 한 판단

- **재핀하지 않는다.** 내가 만들지 않은 변경을 승인하는 것이고, 청크 때문에 어차피 다시
  어긋난다. 도구 주석이 요구하는 규율 그대로 — *"설명할 수 없는 다이제스트 변경은 tripwire 가
  일하는 중이다"* — 여기서는 설명이 되지만, 그 설명이 재핀보다 큰 문제를 드러낸다
- **내 마이그레이션은 적용한다.** app 롤 도달을 바꾸지 않으므로(리허설 실증) 이 문제를
  악화시키지 않고, 적용이 api-server 재시작을 요구하지도 않는다
- **guard probe 수정은 이번 범위 밖이다** — 보안 가드 변경이고 K0/K1/K5 와 별건이다

---

## 중단 조건 (11개)

승인을 묻지 않는다. 아래만 멈추고 보고한다.

| # | 조건 | 상태 |
| --- | --- | --- |
| 1 | P4 검증 실패 | ✅ 전부 통과 |
| 2 | 리허설 DB 생성 불가 | ✅ 생성·검증·정리 완료 |
| 3 | 백업/복원 검증 실패 | — |
| 4 | `schema:status` 에 우리 6개 외 pending | ✅ 정확히 6개 |
| 5 | in-flight 파이프라인 15분 초과 | — |
| 6 | 마이그레이션이 non-additive | ✅ 정적 테스트가 강제 |
| 7 | freeze 체크섬 실패 | ✅ 통과 (31/31) |
| 8 | 본 체크아웃 tree hash 이동 | ✅ 불변 확인 |
| 9 | 078~083 번호 충돌 | ✅ 없음 |
| 10 | 다이제스트 변경이 설명 안 됨 | ✅ 리허설상 변경 없음 예상 |
| 11 | 재핀 후 api-server 부팅 실패 | 🔴 **재핀 전부터 크래시루프 중** — 074 가 기점, 내 변경 무관 (§P5 발견 참조). 이미지 재배포 필요 = 범위 밖 |

---

## 되돌리기

**"마이그레이션 롤백"은 이 레포에 없는 연산이다** — 추가 전용이고 `down` 이 없다.

```
1. 본 체크아웃에서 병합 커밋 git revert   ← 코드만 되돌린다
2. 표 078~083 은 그대로 둔다              ← 비어 있고 아무도 안 읽는다
3. 다이제스트 재핀은 되돌리지 않는다       ← 표가 남아 있으므로 재핀 값이 여전히 맞다
```

K0+K1+K5 는 제품 읽기 경로를 바꾸지 않으므로 이것으로 충분하다.

---

## 커밋 이력

| # | 해시 | 내용 |
| --- | --- | --- |
| 1 | `600e419` | freeze 패키지 편입 — zip 제거로 자립화 |
| 2 | `fc19147` | 목표 정본 재지시 + 대체된 계획문서 3개 SUPERSEDED |
| 3 | `f1247e1` | analysis information set 계약 + truth class 14종 시각 구분 |
| 4 | `5d35599` | portfolio-impact 404 → not_computed 봉투 (계약+서버+웹) |
| 5 | `45a99bc` | 계획서 §9 실행 모델 + 실행 로그 |
| 6 | `421ca90` | 마이그레이션 078~080 |
| 7 | `1b8db11` | semantic type guard · PIT 감사 · temporal kernel |
| 8 | `5a13f0f` | K1 완료 로그 |
| 9 | `0ad6649` | 마이그레이션 081~083 + reachability 뷰 스캔 |

---

## 환경 메모 (이어받을 때 필요)

- **worktree 에는 `node_modules` 가 없다.** 새로 만들었으면 `pnpm install --frozen-lockfile`
  부터 해야 한다. 안 하면 기존 테스트까지 전부 실패해서 원인을 오해하게 된다
- 리허설 DB admin DSN 은 `apps/api/scripts/run_analytics_pipeline.sh` 의 `DB_URL` 에서
  database 만 `postgres` 로 바꾸면 된다 (`research_app` 롤이 `createdb=true super=true`)
- 커밋 전 `pnpm --filter <pkg> format` 을 돌린다. `format:check` 가 게이트다

---

*최종 갱신: **P0~P5 전부 완료.** K0+K1+K5 라이브 적용 완료.*
*🔴 미해결(범위 밖): 브레인 크래시루프 — 마이그레이션 074 의 재핀 누락 + Timescale 청크 드리프트.*
*다음 세션: (1) 브레인 복구 결정 (2) K2 Truth Foundation*

---

## K2-b — numeric_fact writer (완료, 라이브 미적용)

커밋 `2219848`(순수 매핑) · `d8a5bfe`(계획 모듈) · `20dea52`(조사 기록) · `e1238ac`(러너).
게이트 전부 통과: format · lint · typecheck · test(10/10 태스크, api 951건) · build(7/7).

### 산출

| 파일 | 역할 |
| --- | --- |
| `apps/api/src/backfill/dart-numeric-fact.ts` | 순수 매핑 — 기간·개념·셀 주소·시간축 |
| `apps/api/src/backfill/dart-numeric-fact-plan.ts` | 순수 계획 — fact/definition 행, revision 배정, 패리티 |
| `apps/api/src/backfill/run-dart-numeric-fact.ts` | I/O 만 |
| `apps/api/scripts/run_market_enrichment.sh` | DART 단계 뒤에 배선 |
| 테스트 3개 | 64건 |

`pnpm --filter @stock-insight/api backfill:dart-numeric-fact:dry-run` / `:apply`

### dry-run 실측 (2026-08-08, 라이브 읽기 전용)

```
신고 1,362건 · 발행사 86 · fact 168,417 · definition 6,100 · 정정 0
패리티 11,139건 비교 → 전부 일치, 불일치 0
```

### dry-run 이 잡아낸 결함 셋

정적 테스트가 못 잡고 실 데이터가 잡았다. 셋 다 고쳤고 회귀 테스트를 붙였다.

1. **정정 1,005건이 가짜였다.** 같은 신고서가 손익계산서와 포괄손익계산서에 같은
   `ProfitLoss` 를 같은 값으로 싣는다. `restatement_group_key` 에 명세서 구분을 넣었다.
2. **남은 599건도 가짜였다.** 비표준 계정의 한국어 이름이 한 명세서 안에서 유일하지
   않다. 충당부채가 ord 40 에 12.9억, ord 51 에 830억(유동/비유동). 549건은 값도 다르다.
   비표준 계정에만 `statementOrdinal` 차원을 넣었다.
3. **패리티가 0건 비교였다.** `date` 를 JS `Date` 로 받아 `toISOString()` 하면 UTC 동쪽
   시간대에서 하루가 밀린다. SQL 에서 `to_char` 로 뽑는다.

### 정본 대비 판단

| 판단 | 분류 | 근거 |
| --- | --- | --- |
| numeric_fact 를 raw object 에서 채움 | **A** | K2 조사 결론 그대로 |
| `market.financial_fact` 재사용 안 함 | **A** | 접힌 표로는 definition registry 를 못 만든다 |
| `available_at` 을 `rcept_no` 에서 도출 | **B** | `source_revision.available_at` 은 수집 시각. 그대로 쓰면 컬럼이 무의미 |
| 결산월을 profile snapshot 에서 읽음 | **A** | `public` 은 우리 소유 스키마가 아니다 |
| 정정 그룹에 명세서 구분 추가 | **B** | 실 데이터가 가짜 정정 988건을 만들었다 |
| 비표준 계정에 ordinal 차원 추가 | **B** | 실 데이터가 서로 다른 항목 599쌍을 합쳤다 |
| 분기 CF/SCE 거부 | **A** | 실측: 111,935행 중 누적 필드 보유 0건 |
| `run_market_enrichment.sh` 에 배선 | **A** | 일회성 백필이 아니다. `job-wiring-inventory` 가 강제 |

### 다음이 알아야 할 것

- **084 가 라이브에 미적용이다.** `schema:status` pending = `084_metric_definition_registry`
  하나. 러너는 `governance.metric_definition` 에 쓰므로 084 적용이 선행돼야 한다.
  파이프라인에 배선해 뒀으니 **084 없이 병합하면 매 실행 실패한다** — 병합과 084 적용은
  같은 착지에서 함께 해야 한다.
- 첫 `--apply` 는 168,417행 단일 트랜잭션이다. 이후 실행은 fact_key 로 멱등이라 작다.
- `world.numeric_fact` 현재 0행. `governance.metric_definition` 은 표 자체가 없다.
- 기존 `periodEndFor`(run-dart-financial-facts.ts)는 12월 결산을 하드코딩하고
  `_fiscalClose` 를 안 쓴다. 지금은 194/194 가 12월이라 무해. K2 범위 밖 — 고치지 않았다.

### 남은 K2

| # | 작업 | 상태 |
| --- | --- | --- |
| K2-a | metric_definition 레지스트리 | 마이그레이션 084 작성 완료, **라이브 미적용** |
| K2-b | numeric_fact writer | **완료**, 라이브 미적용 |
| K2-c | `core.economic_claim` | 미착수 |
| K2-d | corporate action 백필 | 미착수 (원천 미확인) |
| K2-e | truth_class 메타데이터 | 미착수 |
| K2-f | assertion writer | **차단** — 계보 스택 연결이 별도 슬라이스 |
