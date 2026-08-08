# V2 Canonical Kernel 실행 로그 (K0 · K1 · K2 · K3 · K5)

> **이어서 하려면 이 절만 읽으면 된다.** 아래 본문은 시간순 append 라 **낡은 서술이
> 정정보다 먼저 나온다.** 본문과 이 절이 어긋나면 **이 절이 맞다.**
>
> 계획 정본 [`v2-final-implementation-plan-2026-08-07.md`](./v2-final-implementation-plan-2026-08-07.md) ·
> 아키텍처 정본 [`stock-crypto-investment-context-world-model-v2-final/`](./stock-crypto-investment-context-world-model-v2-final/)

## ⭐ 현재 상태 (2026-08-08 기준, 이 절이 최종 권위)

### 완료 — 전부 라이브 적용됨

| 단계 | 내용 | 라이브 결과 |
| --- | --- | --- |
| **K0** | 결정을 산출물로 (freeze 커밋 · contracts · availability 봉투) | 완료 |
| **K1** | Canonical Kernel (078–080) | governance 스키마 1 → 13 relation |
| **K5** | Release / Safety / SLO (081–083) | safety NORMAL · SLO 8개 report-only |
| **K2-a** | metric definition 레지스트리 (084) | 6,100 |
| **K2-b** | numeric_fact writer | **168,417** · 패리티 11,139 전건 일치 |
| **K2-c** | economic_claim (086) | 297 (판정 2 / 미판정 295) |
| **K2-d** | 청구권 연속성 bridge | 483 (분할 380 / 역분할 103) |
| **K2-e** | truth class 바인딩 (085) | 340만 항목 해소 |
| **K2-f** | assertion writer | 첫 적재 **253** · chunk 계보 6,113 → **증가 중** |
| **K3** | 섹터 playbook (087) | playbook 1 · driver 8 · 배정 10 |

마이그레이션 **087/87 적용, pending 0.** 브레인 healthy · RestartCount 0 ·
이미지 `sha256:06865eddd8c2…`.

> 위 수치는 **첫 적재 시점**이다. 러너를 전부 파이프라인에 배선했으므로 증분이 계속
> 붙는다 — 2026-08-08 재확인 시 assertion 253 → **255**, chunk 계보 6,113 → **6,157**
> 로 늘어 있었다. 배선이 실제로 돌고 있다는 뜻이므로 수치가 커진 것은 정상이다.
> 줄었거나 그대로면 그때 의심하라.
>
> 현재 수치를 직접 세는 쿼리:
>
> ```sql
> SELECT 'numeric_fact', count(*) FROM world.numeric_fact
> UNION ALL SELECT 'metric_definition', count(*) FROM governance.metric_definition
> UNION ALL SELECT 'economic_claim', count(*) FROM core.economic_claim
> UNION ALL SELECT 'corporate_action', count(*) FROM core.security_corporate_action
> UNION ALL SELECT 'truth_class_binding', count(*) FROM governance.truth_class_binding
> UNION ALL SELECT 'assertion', count(*) FROM knowledge.assertion
> UNION ALL SELECT 'chunk lineage', count(*) FROM knowledge.document_chunk
>          WHERE source_revision_id IS NOT NULL
> UNION ALL SELECT 'playbook_assignment', count(*) FROM governance.playbook_assignment
> UNION ALL SELECT 'impact_exposure_revision', count(*) FROM analytics.impact_exposure_revision;
> ```

### ⚠️ 본문에서 이미 정정된 것 — 낡은 서술을 믿지 마라

| 본문 서술 | 실제 |
| --- | --- |
| "K2-f assertion writer **차단**" (§남은 K2, §K2 최종 상태) | **틀렸다.** URL 다리를 안 봤을 뿐이다. §"K2-f — 차단이 아니었다" 참조. 완료됨 |
| "브레인 크래시루프 미해결" (옛 꼬리말) | 2026-08-08 해소. 재시작 1,357회 → 0 |
| "다음 세션: 브레인 복구 + K2" (옛 꼬리말) | 둘 다 완료 |
| `governance.slo_*` 가 정본 이탈 (083 SQL 주석) | 이탈 아니다. 정본은 SLO 스키마명을 정하지 않는다. `index.ts` 의 084 설명에 정정 있음 |

### 남은 것 — K4 부터

| 단계 | 내용 | 상태 |
| --- | --- | --- |
| **K4** | Market Intelligence Minimum | **다음.** 계획서가 "가장 값어치 큼 · 가장 위험" |
| K6 | Personalization & Geo | 미착수 |
| K7 | `run-v2-graph-publish.ts` 를 temporal kernel 로 이전 | 미착수 (121KB, 단독 슬라이스) |
| K8 | Crypto plane | 미착수 |

**K4 는 K3 없이 시작하지 않는다** — 이건 지켜졌다. playbook 이 sign·materiality·
magnitude 를 공급해야 exposure 를 발명 없이 쓸 수 있고, 그 playbook 이 이제 있다.

K4 착수 시 반드시 아는 상태:

```
analytics.impact_exposure_revision      0행   ← K4 의 본 과녁
analytics.impact_shock                  0행
analytics.impact_score_component        0행
analytics.impact_path_v2          248,236행   전부 direction='unknown'
governance.entity_playbook_current_v1   10행   ← K4 가 인용할 것
governance.business_driver               8행   방향 포함
```

`run-portfolio-snapshot.ts:18` 이 exposure 채우기를 명시적으로 보류한다 —
*"filling it would mean inventing sign, materiality and economic magnitude."*
K4 의 게이트는 **모든 exposure 행이 playbook revision + source-grounded driver 를
인용**하는 것이다. 인용 없는 행은 INSERT 거부. 단순 `count > 0` 게이트는 쓰지 않는다.

### 아직 충족되지 않은 REQ (충족 *가능*해졌을 뿐)

| REQ | 상태 |
| --- | --- |
| `REQ-SEM-010` truth class 를 UI 에서 구분 | 데이터 원천(`content_pack_item_truth_v1`) 생성됨. **UI 가 아직 안 읽는다** — 도달성 감사의 "안 읽히는 뷰" 16개에 있음 |
| `REQ-DOM-001` KPI 선택이 playbook revision 인용 | 인용 대상 생성됨. **인용을 강제하는 검사 없음** — KPI 선택 코드가 K4 |

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

### K2 · K3 (2026-08-08)

| 10 | `fea0ac4` | K2 착수 전 실측 조사 — **이 커밋의 assertion 차단 결론은 나중에 틀린 것으로 판명됨** |
| 11 | `2219848` | feat(backfill): DART 재무제표 → world.numeric_fact 순수 매핑 (K2-b 1/2) |
| 12 | `d8a5bfe` | feat(backfill): DART 팩트 계획 — restatement 키와 comparability group 결정 (K2-b 2/3) |
| 13 | `20dea52` | docs: market.financial_fact 와의 관계를 K2 조사에 기록 — 중복이 아니라 접기 전후 |
| 14 | `e1238ac` | feat(kernel): DART 신고를 world.numeric_fact 로 적재하는 러너 (K2-b) |
| 15 | `d4792fc` | docs: K2-b 실행 로그 — dry-run 이 잡아낸 결함 셋과 084 선행 조건 |
| 16 | `0f64017` | docs: K2-b 착지 절차 — 다이제스트 재핀을 절차에 박는다 |
| 17 | `b0e5d10` | feat(kernel): 적재 경로 실증 — 제약 검사·배치 적재·리허설 (K2-b) |
| 18 | `d4deb3f` | docs: 적재 경로 실증 결과를 로그에 기록 |
| 19 | `a167eb3` | feat(kernel): 청구권 연속성 bridge — core.security_corporate_action (K2-d) |
| 20 | `2dddf4e` | feat(kernel): truth class 메타데이터 — 마이그레이션 085 (K2-e) |
| 21 | `7e77c9e` | feat(kernel): core.economic_claim — 마이그레이션 086 과 writer (K2-c) |
| 22 | `bb220e1` | test(kernel): 086 을 커널 리허설에 추가 |
| 23 | `424d2c6` | fix(api-server): 마이그레이션 085 를 위한 부팅 다이제스트 재핀 |
| 24 | `951aaf6` | docs: K2 라이브 착지 기록 — 재핀 증명, 소요 시간, 남은 것 |
| 25 | `30bc2d4` | fix(kernel): economic_claim 이 판정을 나중에 받아들이게 한다 |
| 26 | `ac1f0e5` | fix(api-server): 재핀에 맞춰 다이제스트 픽스처 갱신 |
| 27 | `cafb914` | docs: 착지 후 고친 결함 둘과 릴리즈 게이트 결과 |
| 28 | `87d024a` | feat(kernel): news assertion — 계보 다리를 찾아 K2-f 를 연다 (K2-f) |
| 29 | `1f3887f` | docs: K2-f 는 차단이 아니었다 — 기록 정정 |
| 30 | `6687b04` | feat(kernel): 섹터 playbook 과 반도체 v1 — 마이그레이션 087 (K3) |
| 31 | `e69cb02` | docs: K3 착지 기록 — 배정이 별도 표여야 했던 실측 근거 |
| 32 | `af93f8e` | docs: 실행 로그를 이어받을 수 있는 형태로 정리 |

---

## 환경 메모 (이어받을 때 필요)

- **worktree 에는 `node_modules` 가 없다.** 새로 만들었으면 `pnpm install --frozen-lockfile`
  부터 해야 한다. 안 하면 기존 테스트까지 전부 실패해서 원인을 오해하게 된다
- 커밋 전 `pnpm --filter <pkg> format` 을 돌린다. `format:check` 가 게이트다

### DB 접속 — 자격증명은 커밋하지 않는다

라이브 DSN 은 `apps/api/scripts/run_analytics_pipeline.sh` **6행** 에 `DB_URL=` 로 있다.

```bash
DB_URL=$(sed -n '6s/^DB_URL=//p' apps/api/scripts/run_analytics_pipeline.sh | tr -d '"')
```

**이 DSN 에는 비밀번호가 없다** — `~/.pgpass` 를 쓴다. 그리고 `.pgpass` 항목이
`db=research_app` 하나로 고정돼 있어서 **폐기용 DB 이름에는 안 맞는다.** 리허설 하니스에
넘길 admin DSN 은 호출 시점에 조립한다:

```bash
export DB_URL
ADMIN_URL=$(node -e '
const fs=require("fs");
const l=fs.readFileSync(process.env.HOME+"/.pgpass","utf8").trim().split("\n")[0].split(":");
const u=new URL(process.env.DB_URL); u.password=l[4]; u.pathname="/postgres";
process.stdout.write(u.toString());')
```

안 하면 `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string` 로 죽는다.
**`.pgpass` 를 고치지 마라.**

### 리허설 하니스와 필요한 환경변수

| 하니스 | 환경변수 | 무엇을 검증 |
| --- | --- | --- |
| `apps/api/scripts/run-kernel-db-rehearsal.mjs` | `KERNEL_REHEARSAL_ADMIN_DATABASE_URL` | 078–087 마이그레이션 SQL |
| `apps/api/scripts/run-dart-numeric-fact-rehearsal.mjs` | `DART_REHEARSAL_ADMIN_DATABASE_URL` + `DATABASE_URL` | numeric_fact 적재 경로 |
| `pnpm test:p6:db` | `P6_REHEARSAL_ADMIN_DATABASE_URL` | p6 |
| `pnpm test:xg:db` | `XG_REHEARSAL_ADMIN_DATABASE_URL` | **리더 권한 회귀** — GRANT 를 바꿨으면 필수 |

`pnpm verify:release` 는 이것들을 포함하므로 환경변수 없이 돌리면 `Invalid URL` 로 죽는다.
코드 실패가 아니다.

### 러너 규약 — 이 시리즈에서 만든 것들

전부 `dry-run` 기본 · `--rehearse`(쓰고 ROLLBACK) · `--apply`.

```
backfill:dart-numeric-fact:{dry-run,rehearse,apply}
backfill:corporate-action-bridge:{dry-run,rehearse,apply}
backfill:economic-claim:{dry-run,rehearse,apply}
backfill:news-assertion:{dry-run,rehearse,apply}
backfill:playbook-assignment:{dry-run,rehearse,apply}
rehearse:dart-numeric-fact:db
```

**새 러너를 만들면 반드시 파이프라인에 배선한다.** `job-wiring-inventory` 테스트가
배선 안 된 잡을 잡는다. 일회성 백필이면 그 테스트의 면제 목록에 이유와 함께 넣는다.

파이프라인 단계를 추가하면 `core-identity-sync-runner.test.ts` 의 단계 순서 테스트도
같이 고쳐야 한다. **명령과 영수증은 인접해야 한다** — 명령 사이에 끼워 넣으면 깨진다.

### 마이그레이션을 추가할 때 — 부팅 다이제스트

`apps/api-server/src/db/live-database-guard.ts` 의 `EXPECTED_CATALOG_DIGESTS` 는 소스에
하드코딩된 상수다. **앱 롤(`stock_insight_app_reader`/`_writer`)에 GRANT 하면 다이제스트가
움직이고 다음 부팅에 브레인이 죽는다.** 2026-08-03 에 059 가, 2026-08-07 에 074 가 그렇게
했다(후자는 24시간 크래시루프).

절차:

```bash
# 1. 적용 후 지체 없이
DATABASE_URL="$DB_URL" node ops/scripts/repin-live-database-digests.mjs
# 2. 움직인 다이제스트를 내 마이그레이션으로 설명할 수 있는지 증명한다.
#    방법: 내가 추가한 관계만 제외하고 배열을 다시 계산해 이전 핀이 바이트 단위로
#    재현되는지 본다. 재현되면 설명된 것이고, 아니면 중단한다.
# 3. 상수 갱신 + apps/api-server/test/live-database-guard.test.ts 픽스처도 함께 갱신
#    (픽스처는 상수의 문자 그대로 복제다. 실패가 장치다 — import 로 바꾸지 마라)
# 4. 이미지 빌드 → .env.docker 의 STOCK_INSIGHT_API_IMAGE 갱신 → compose up -d api
# 5. 부팅 확인
```

`si_*` 파이프라인 롤에만 GRANT 하면 다이제스트는 안 움직인다 — 078–084·086·087 이 그랬다.
움직인 것은 085 하나뿐이고 뷰 하나 때문이었다.

### 이 시리즈에서 반복적으로 옳았던 것

- **dry-run 은 어떤 행이 될지만 증명한다.** 문장은 트랜잭션이 열려야 돈다. 트랜잭션 전
  제약 검사를 넣어라 — 168K 배치 안에서 CHECK 가 깨지면 전체가 롤백되고 한 행만 보고된다.
  이 검사가 `definition_key` 128자 초과 89건을 잡았다
- **실 데이터가 정적 테스트보다 많이 잡는다.** 가짜 정정 1,587건, 패리티 날짜 밀림,
  key 길이 초과, 갱신 불가 writer — 전부 dry-run 이나 조언으로 나왔다
- **거부를 세어라.** 채울 수 없으면 이유와 함께 세고, 발명하지 마라. 그게 정본이
  요구하는 정직함이고 다음 사람이 무엇이 없는지 알 수 있는 유일한 방법이다

---

*이 꼬리말은 P5 시점의 것이고 낡았다. 최신 상태는 문서 맨 위 **⭐ 현재 상태** 를 보라.*

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
| K2-f | assertion writer | ~~차단~~ → **이 판정은 틀렸다.** ✅ 완료 (253건) |

### 적재 경로 실증 (커밋 `b0e5d10`)

dry-run 은 어떤 행이 될지만 증명한다. 그 행을 나르는 문장은 트랜잭션이 열리기 전까지
한 번도 안 돈다. 셋으로 메웠다.

**① 트랜잭션 전 제약 검사.** 168,417 fact + 6,100 definition 전부를 031·084 의 CHECK 에
대조한다. **즉시 진짜 결함을 잡았다** — `definition_key` 89개가 128자 제한 초과(최장
160자). 이것 없이 `--apply` 했으면 첫 적재가 통째로 롤백되고 한 행만 보고됐다.
128자 초과 시 앞을 자르고 head 해시를 붙인다(자르기만 하면 긴 접두를 공유하는 IFRS
개념들이 충돌한다).

**② revision 단계별 배치 적재.** revision N 이 대체할 대상은 전부 N-1 에 있고, 한 단계
안에서 같은 그룹이 둘일 수 없다(UNIQUE). 그래서 한 단계가 한 문장으로 들어간다.

**③ 폐기용 DB 리허설** — `pnpm --filter @stock-insight/api rehearse:dart-numeric-fact:db`

```
13개 검사 전부 통과 (612행)
  적재 수치 = 표 수치 · 현재 뷰 해소 · 재실행 0행(멱등)
  revision↔supersedes 일치 · known_at >= available_at
  612/612 가 접수일 기준 (수집 시각 아님)
```

`--rehearse` 는 실제로 쓰고 ROLLBACK 한다. `--limit N` 으로 트랜잭션을 줄일 수 있다.

> 리허설 DB 접속은 `.pgpass` 가 `db=research_app` 하나로 고정돼 있어 새 DB 이름에 안
> 맞는다. 호출할 때 admin DSN 을 조립해 `DART_REHEARSAL_ADMIN_DATABASE_URL` 로 넘긴다.
> `.pgpass` 를 고치지 않는다.

### K2-b 착지 절차 — 순서를 바꿀 수 없다

계획 §P4.5 가 부팅 다이제스트를 "이 계획에서 가장 위험한 지점"으로 잡았고, 2026-08-08 에
실제로 그 부류의 크래시루프(재시작 1,357회)를 고쳤다. 084 는 표 2개와 뷰 1개를 만든다.

```bash
# 1. 백업
ops/scripts/backup-research-app-logical.sh && ops/scripts/verify-research-app-restore.sh

# 2. pending 이 084 하나인지 확인 — 아니면 중단(공유 DB, 남의 마이그레이션일 수 있다)
pnpm --filter @stock-insight/api schema:status

# 3. 병합 후 적용
pnpm --filter @stock-insight/api schema:apply

# 4. 다이제스트 재핀 — 지체 없이 이어서 한다
DATABASE_URL="$DB_URL" node ops/scripts/repin-live-database-digests.mjs
#    → diff 판독. 084 의 표/뷰로 설명되면 상수 갱신 후 커밋.
#      설명 안 되는 변경이 하나라도 있으면 중단 — tripwire 가 일하는 중이다.

# 5. api-server 재시작하고 부팅 성공 확인
curl -sS localhost:<port>/health

# 6. 첫 적재는 손으로. 타이머에 맡기지 않는다.
#    --rehearse 로 한 번 확인하고(쓰고 롤백) --apply 한다. 경과 시간을 이 문서에 적는다.
DATABASE_URL="$DB_URL" node apps/api/src/backfill/run-dart-numeric-fact.ts --rehearse
DATABASE_URL="$DB_URL" node apps/api/src/backfill/run-dart-numeric-fact.ts --apply
```

**④를 건너뛰면 안 된다.** 084 의 GRANT 는 `si_*` 파이프라인 롤 전용이고
(`si_knowledge`·`si_analytics`·`si_publisher`·`si_readapi`), 앱 롤
(`stock_insight_app_reader`/`_writer`)에는 아무것도 주지 않는다. 078–083 이 같은 이유로
다이제스트를 안 움직였으므로 084 도 무변동이 예상된다. **그래도 실행한다** — 계획이
"②를 무조건 실행하고 결과로 판단한다"로 못박았고, 065 는 표 하나를 추가했는데 움직였다.

**⑥이 손이어야 하는 이유.** `stock-insight-market-enrichment.timer` 는 매일 05:20 KST,
유닛 예산은 `TimeoutStartSec=90min` 이고 그 안에서 DART 수집·SEC·FINRA 가 이미 돈다.
첫 적재는 168,417행 단일 트랜잭션이라 예산을 잠식할 수 있고, 타임아웃으로 죽으면
롤백된 뒤 다음 날 같은 168K 를 다시 시도한다. 084 적용과 다음 타이머 발화 사이에
손으로 한 번 돌리고 **경과 시간을 이 문서에 기록한다.** 그 뒤 타이머가 도는 것은
증분뿐이다.

---

## K2 완료 — 라이브 착지 (2026-08-08)

병합 `e5d1a95`, 재핀 `424d2c6`. 게이트 전부 통과.

### 라이브 상태

```
world.numeric_fact              168,417   (0 → 168,417)
governance.metric_definition      6,100
governance.truth_class_binding        5
core.security_corporate_action      483   (0 → 483)
core.economic_claim                 297   (판정 2 / 미판정 295)
schema_migration                  86/86, pending 0
```

`serving.content_pack_item_truth_v1` 해소 결과 — UI 가 받게 될 것:

```
SOURCE       1,730,287
RELATION       912,988
(미분류)       551,832   not_a_truth_object
HYPOTHESIS     207,486
```

합이 3,402,593 으로 파생 그래프 전체와 일치한다.

### 다이제스트 재핀 — 예측대로 하나만 움직였다

`stock_insight_app_reader.relation_privileges_digest` 하나. 085 가 예고한 그대로다.
`rls_contract_digest` 는 안 움직였다 — 뷰가 자기 정책을 갖지 않는다.

**증명**(065 재핀과 같은 방식): 라이브에서 reader 로 배열을 다시 계산하되
`serving.content_pack_item_truth_v1` 만 제외하면 이전 핀 `ae1c09cdc…a9914` 가 바이트
단위로 재현된다. 248 → 249. 084·086 은 `si_*` 롤에만 GRANT 해서 안 움직인다.

새 이미지 `sha256:06865eddd8c2…` 배포, 부팅 성공, RestartCount=0, healthy.

### 첫 적재 소요 시간

| 잡 | 행 | 시간 |
| --- | --- | --- |
| numeric_fact | 168,417 | **9초** |
| 연속성 bridge | 483 | 0초 |
| economic claim | 297 | 0초 |

**계획이 걱정한 90분 예산 잠식은 없다.** revision 단계별 배치 적재가 168K 를 9초로
줄였다. 손으로 돌린 것은 여전히 옳은 선택이었지만 — 시간을 모른 채 타이머에 맡기는
것과 알고 맡기는 것은 다르다. 이제 알았으니 이후 증분 실행은 타이머가 해도 된다.

### 사후 감사

```
run-schema-migrations        exit 0
run-source-contract-audit    exit 0
run-pit-now-audit            exit 0   (REQ-PIT-003 위반 0)
run-table-reachability-audit 안 읽히는 뷰 16개 보고
```

### 남은 것 — 정직하게

**REQ-SEM-010 은 충족 *가능*해졌을 뿐 충족되지 않았다.** `content_pack_item_truth_v1`
이 도달성 감사의 '안 읽히는 뷰' 16개에 들어 있다. 데이터 원천은 생겼지만 UI 가 아직
소비하지 않는다. 이걸 "REQ-SEM-010 완료"로 적으면 거짓이다.

새로 만든 다른 뷰들도 같은 상태다 — `economic_claim_coverage_v1`,
`metric_definition_current_v1`, `release_current_v1`, `safety_state_current_v1`,
`slo_current_v1`, `source_pit_quality_current_v1`. K1·K5 가 세운 계약을 K6 이후가
소비하게 돼 있으므로 예정된 순서지만, 지금 시점의 사실로 기록해 둔다.

### K2 최종 상태

| # | 작업 | 상태 |
| --- | --- | --- |
| K2-a | metric_definition 레지스트리 (084) | ✅ 라이브, 6,100건 |
| K2-b | numeric_fact writer | ✅ 라이브, 168,417건 |
| K2-c | economic_claim (086) | ✅ 라이브, 297건 (판정 2) |
| K2-d | 연속성 bridge | ✅ 라이브, 483건 |
| K2-e | truth class 바인딩 (085) | ✅ 라이브, 340만건 해소 |
| K2-f | assertion writer | ~~❌ 차단~~ → **이 판정은 틀렸다.** ✅ 완료 (253건) |

### ~~K2-f 를 여는 조건~~ — 아래 진단은 틀렸다 (2026-08-08 정정)

> **이 절의 "만족시킬 방법이 없다"는 결론은 틀렸다.** 다리를 두 개만 시도했고
> 기사 URL 을 안 봤다. §"K2-f — 차단이 아니었다" 를 보라. 아래는 당시 무엇을 믿었는지의
> 기록으로 남긴다.

`knowledge.document` 7,746행이 전부 `legacy:` 접두이고 원천이 `public.source_documents`
(남의 표)다. `document_chunk.source_revision_id` 9,041행 전부 NULL 이고 채울 값이 없다.
`assertion.source_revision_id` 는 NOT NULL 이라 만족시킬 방법이 없다.

**완화하지 마라.** REQ-EVD-001·004 를 정면으로 어긴다. 필요한 것은 별도 슬라이스다 —
`ingestion` 스택이 수집한 rss-news-bundle raw object 가 `knowledge.document` 가 되게
하고 레거시는 레거시로 남기는 것. canonical/11 §2 가 *"raw/source revision + PIT quality"*
다음에 *"event/assertion/conflict"* 를 둔 이유와 같다.

### 착지 후 발견하고 고친 것 둘

**① economic_claim 이 갱신 불가였다** (`30bc2d4`). 첫 판은 열린 claim 이 있는 종목을
통째로 건너뛰어, 미판정 295행이 영구 동결이었다. `etf:` 문서가 231건이고 계속 느는데
분류 못 하던 종목에 스냅샷이 도착해도 FUND_UNIT 판정이 버려진다. 쿼리가
`claim_type_state` 를 SELECT 하고 한 번도 안 읽는 것이 증거였다.

전이를 두 가지로 나눴다. **미판정 → 판정**은 제자리 갱신 — claim 은 안 변했고 우리
지식이 변했다. 닫고 오늘부터 새 구간을 열면 '오늘 펀드 지분이 됐다'는 거짓이 된다.
**판정 → 다른 판정**은 보고하고 거부한다. 지금 규칙으로는 나올 수 없고, 나오면 원인이
상류에 있으며 조용히 덮어쓰는 것이 최악의 대응이다.

라이브 dry-run 이 이제 `unchanged: 297` 로 정직하게 보고한다. UPDATE 는 롤백
트랜잭션으로 실증했다 — `valid_from` 이 2026-07-06 그대로 유지된다.

**② 재핀 커밋이 테스트를 깨뜨린 채 나갔다** (`ac1f0e5`). `424d2c6` 을 커밋할 때
`pnpm test` 를 안 돌렸다. `live-database-guard.test.ts` 픽스처가 가드 상수를 문자 그대로
복제하므로 핀이 움직이면 실패한다. **그게 결함이 아니라 장치다** — 재핀이 아무도 안 본
채 나가는 것을 막는 마지막 검문이고 이번에 그대로 작동했다. import 로 바꾸지 않는다.
그러면 항상 통과해 검문이 사라진다.

### 릴리즈 게이트

```
lint · typecheck · test(10/10) · build(7/7)   통과
typecheck:p6:fixture · test:design:hard        통과
test:p6:db · test:xg:db                        통과   ← 리더 권한 리허설
```

`test:xg:db` 가 085 GRANT 와 직결된다. 브라우저/비주얼 게이트는 실행하지 않았다 —
구동 중인 앱이 필요하고 이번 변경은 제품 읽기 경로를 건드리지 않는다.

> 두 DB 리허설은 admin DSN 환경변수를 요구한다: `P6_REHEARSAL_ADMIN_DATABASE_URL`,
> `XG_REHEARSAL_ADMIN_DATABASE_URL`, `KERNEL_REHEARSAL_ADMIN_DATABASE_URL`.
> 비어 있으면 `Invalid URL` 로 죽는다. `.pgpass` 는 `db=research_app` 하나로 고정돼
> 있으니 호출 시점에 조립해 넘긴다.

### 제품 읽기 경로 무변경 — 확인

`stock_insight_app_reader` 로 `BEGIN READ ONLY` 상태에서 실측:

```
serving.content_pack_item          팩 18692(22) · 18691(3) · 18690(15) 정상
serving.content_pack_item_truth_v1 팩 18692 → HYPOTHESIS 22   (reader 가 읽는다)
governance.truth_class_binding     has_table_privilege = f    (막혀 있다)
브레인                              running · healthy · RestartCount=0
```

설계대로다 — reader 는 해소된 뷰만 보고 바인딩 표는 못 본다.

### 알아둘 것 (지금 고치지 않음)

`run-dart-numeric-fact.ts` 의 `EXISTING_FACTS_SQL` 이 `world.numeric_fact` 전체를 무제한
읽는다. 오늘 168,417행이면 괜찮지만 DART 수집마다 는다. 멱등 판정에 fact_key 집합이
필요해서 그런데, 커지면 `source_revision_id` 범위로 좁혀야 한다.

---

## K2-f — 차단이 아니었다 (2026-08-08)

커밋 `87d024a`. **이 로그와 조사 문서가 앞서 "차단"으로 적은 것은 틀렸다.**

### 왜 틀렸나

조사가 다리를 둘만 시도했다: `content_hash` 와
`source_record_identity.provider_record_key`. 둘 다 0건이라 "다리가 없다"로 결론냈다.
**양쪽 스택이 모두 들고 있는 기사 URL 을 시도하지 않았다** —
`knowledge.document.canonical_url` 과 rss-news-bundle raw object 안 각 항목의 `url`.

```
canonical_url 로 보관 번들에 닿는 chunk        6,794
  chunk 본문이 title+summary 로 정확 재구성    6,196 (91.2%)
  다른 캡처 (발행사가 헤드라인 수정)              598 (8.8%)
evidence 를 가진 claim 374 중 재구성됨          332
```

레거시 행과 우리 번들은 **한 번의 수집에 대한 두 기록**이었다.

### 정확 재구성이 핵심

URL 공유만으로는 "같은 기사"일 뿐 "그 바이트에서 나왔다"가 아니다. RSS 는 수정된다 —
실측된 한 쌍은 같은 URL 에 `"18 tech stocks ... 30%"` 와
`"19 (mostly) tech stocks ... 25%"` 다. 거기 source revision 을 붙이면 REQ-EVD-004
재실행 가능성을 거짓으로 약속한다. **조사가 발명을 거부한 것은 옳았다.** 틀린 것은
"이을 수 없다"였다.

그래서 chunk 마다 재구성을 다시 계산하고, 재현되는 것만 잇고, 재구성 해시를
`content_metadata` 에 남겨 나중에 재검증할 수 있게 한다.

### 라이브 상태

```
knowledge.document_chunk.source_revision_id   0 → 6,113 / 9,217
knowledge.assertion                           0 → 253
  factual 176 · forecast 59 · alleged 18
```

### REQ-EVD-004 끝까지 증명

```
assertion → source_revision → raw_object → 디스크 파일
  → title+summary 재구성 == 저장된 chunk    true
  → 기록된 해시와 일치                      true
```

### 253 < 332 인 이유 — modality

opinion 41 · reported_claim 39 는 정본의 다섯 단어
(factual·planned·possible·alleged·forecast)에 자리가 없어 **거부한다.**

- **opinion** — 진술된 견해는 가능성에 대한 주장이 아니라 `possible` 이 오기술이고
  나머지 넷도 더 가깝지 않다. canonical/00 §4 에서 의견은 NARRATIVE 로 읽히며 이 표가
  담는 객체가 아니다.
- **reported_claim** — modality 는 명제에 대한 것이고 누가 보도했는지는
  `attribution_entity_id` 의 몫이다. 정확히 보도된 사실과 근거 없는 보도가 같은
  claim_type 을 쓰므로 어느 modality 를 줘도 한쪽을 오표기한다.

잘못된 modality 는 **출처 자신의 태도로 읽히고**, 아래에서는 그게 매핑 기본값이었는지
알 수 없다.

### 그 밖의 판단

- `quotation_scope = 'summary'` — 보관한 것이 RSS 제목·요약이지 기사 본문이 아니다.
  `direct` 는 갖고 있지 않은 인용을 약속하는 것이다.
- `verification_state = 'extracted'` — claim 의 `corroborated` 를 옮기지 않는다.
  assertion 의 상태는 span·semantics 검사를 가리키는데 그건 아직 돌지 않았다.
  상류 상태는 metadata 에 남긴다.
- `predicate_ontology_revision_id` 는 대부분 NULL — 12개 predicate 중 승인된 온톨로지
  revision 이 있는 것이 1개뿐이다. 미승인 revision 을 가리키면 아무도 안 한 온톨로지
  결정을 주장하는 것이 된다.

### 남은 것

```
chunk 3,104건이 아직 계보 없음
  canonical_url 없음                     1,710
  보관된 번들 항목 없음                    713
  다른 캡처 (재현 안 됨)                    681
claim 121건이 아직 assertion 아님
  modality 자리 없음                        80
  evidence chunk 에 계보 없음                42 (중복 포함)
```

**681건은 영구적으로 이을 수 없다** — 발행사가 원문을 바꿨고 우리는 바뀐 쪽 바이트를
갖고 있지 않다. 나머지는 수집 범위가 늘면 줄어든다.

### K2 최종

| # | 작업 | 상태 |
| --- | --- | --- |
| K2-a | metric_definition (084) | ✅ 6,100 |
| K2-b | numeric_fact writer | ✅ 168,417 |
| K2-c | economic_claim (086) | ✅ 297 |
| K2-d | 연속성 bridge | ✅ 483 |
| K2-e | truth class (085) | ✅ 340만 해소 |
| K2-f | assertion writer | ✅ **253** (차단 아니었음) |

---

## K3 — 섹터 playbook (2026-08-08)

커밋 `6687b04`. 마이그레이션 087 라이브 적용. **다이제스트 무변동** — `si_*` 롤 전용.

### 라이브 상태

```
governance.sector_playbook        1   semiconductor@1
governance.business_driver        8   정본 04 §3 사슬 전체
governance.playbook_assignment   10   taxonomy 9 / curated 1
```

REQ-DOM-001 이 인용을 요구하는 대상:

```
taxonomy  NVIDIA · AMD · Intel · Broadcom · Marvell · Micron · Arm · TSMC ADR · SK하이닉스
curated   삼성전자
```

driver 사슬:

```
demand         demand_units      → revenue  increases
demand         backlog_quality   → revenue  increases
price          asp               → margin   increases
mix            product_mix       → margin   increases
variable_cost  wafer_cost        → margin   decreases
fixed_cost     fab_fixed_cost    → margin   decreases
working_capital inventory_position → fcf    decreases
capex          capex_cycle       → fcf      decreases
```

### 배정이 별도 표인 이유 — 실측이 강제했다

라이브 분류가 스스로 보여줬다:

```
SIC  3674   Broadcom · Micron · TSMC · AMD · Intel · Marvell · NVIDIA · Arm
KSIC 2612   SK하이닉스
KSIC 264    삼성전자      ← 통신·방송장비. 세계 최대 메모리 제조사다
KSIC 2621   LG디스플레이   ← 디스플레이 패널
KSIC 2622   삼성전기      ← 수동부품·기판
KSIC 26299  한화시스템     ← 방산 전자
KSIC 26429  인텔리안테크   ← 위성 안테나
```

코드로만 붙이면 **세계 최대 메모리 제조사를 빼고 방산 전자업체를 넣는다.** 그래서
배정은 `taxonomy` 와 `curated` 로 갈리고, curated 는 문장으로 이유를 적는다. 붙이지
않은 근처 4건도 러너가 이유와 함께 보고한다 — 부재는 나중 독자가 볼 수 있는 결정이
아니다.

curated 항목이 우주에서 사라지면 러너가 **실패한다**(`staleCurations`). 조용히 아무도
지배하지 않게 되는 것보다 시끄럽게 죽는 게 낫다.

### driver 는 정의고 관측이 아니다

정본 04 §3 이 각 driver 에 source·definition·horizon·sensitivity·lag·regime·
uncertainty 를 준다. 그건 개념의 속성이다. 회사의 *값* 을 같은 행에 넣으면 정의와
관측을 뒤섞는다. 관측은 K4 의 exposure 작업이고, **K3 없이 K4 를 시작하지 않는 이유가
바로 K4 가 인용할 것이 있어야 하기 때문이다.**

계획서는 "driver bridge 는 100종목 × ~8 driver = 800행"으로 잡았다. 그건 회사별 인스턴스
얘기인데 지금 그걸 채울 데이터가 없다. 정의 8행을 만들고 인스턴스는 K4 로 넘긴다.
이건 정본을 따른 것이지 축소가 아니다 — §3 은 driver 를 정의로 규정한다.

### playbook 은 볼 것을 말하고 결론을 말하지 않는다

테스트가 `undervalued`·`overvalued`·`buy`·`sell`·`attractive` 를 금지한다. 견해를 담은
playbook 은 REQ-DOM-001 이 막으려는 발명이 revision 번호를 달고 있는 것이다.

### 게이트 상태 — 정직하게

**REQ-DOM-001 은 아직 강제되지 않는다.** 인용할 대상은 생겼지만, "KPI 선택이 playbook
revision id 를 인용하지 않으면 거부"하는 검사는 없다. 그 검사는 KPI 를 선택하는 코드가
있어야 붙일 수 있고, 그 코드가 K4 다. 지금 상태는 **인용 가능**이지 **인용 강제**가
아니다.

### 리허설

폐기용 DB 9/9 통과: seed 적용, driver 가 사슬을 덮음, 모든 bridge 에 방향 있음,
반쪽 adapter 거부, 빈 지표 거부, 고아 revision 거부, taxonomy 배정이 노드를 요구,
curated 가 코드와 불일치 가능, 현재 뷰 해소.
