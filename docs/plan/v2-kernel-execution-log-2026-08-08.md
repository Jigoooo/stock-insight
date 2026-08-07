# V2 Canonical Kernel 실행 로그 (K0 + K1 + K5)

> **이어서 하려면 여기부터 읽어라.** 이 문서는 진행 중 계속 갱신된다.
> 계획 정본은 [`v2-final-implementation-plan-2026-08-07.md`](./v2-final-implementation-plan-2026-08-07.md),
> 아키텍처 정본은 [`stock-crypto-investment-context-world-model-v2-final/`](./stock-crypto-investment-context-world-model-v2-final/).

## 어디서 작업 중인가

```
worktree   /home/jigoo/.hermes/worktrees/stock-insight-v2-kernel
branch     feat/v2-canonical-kernel   (base: e8938d4 on master)
본 체크아웃  /home/jigoo/.hermes/workspace/stock-insight  ← 손대지 않는다 (P5 까지)
```

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

### P3 — K5: Release / Safety / SLO ⬜ 대기

- [ ] `081_release_manifest` → `governance.release_manifest`
- [ ] `082_safety_state` → `governance.safety_state`
- [ ] `083_slo_ledger` → `governance.slo_definition` + `governance.slo_observation`
- [ ] `run-table-reachability-audit.ts` 에 `pg_views` 스캔 추가 (as-built §10 구멍 ①)

> **`governance.slo_*` 는 정본(`ops.slo_*`) 대비 의도적 이탈.** `ops` 는 research-app-db 와
> 표 단위로 갈려 있다. 사유를 마이그레이션 주석에 남긴다.

### P4 — 검증 ⬜ 대기

- [ ] `pnpm --filter @stock-insight/db-schema test`
- [ ] 리허설 DB (`run-kernel-db-rehearsal.mjs` 신규, p6 패턴 복제)
- [ ] `pnpm format:check && lint && typecheck && test && build`
- [ ] `pnpm test:xg:db` (리더 권한 회귀)
- [ ] `schema:status` — pending 이 정확히 우리 6개인지

### P5 — 착지 (라이브) ⬜ 대기

- [ ] 백업 + 복원 검증
- [ ] in-flight 파이프라인 0 확인
- [ ] news 타이머 직후(:01/:31) master 병합
- [ ] `schema:apply`
- [ ] **다이제스트 재핀** ← 가장 위험. 아래 참조
- [ ] 사후 감사 4종

---

## ⚠️ P4.5 다이제스트 — 잊으면 브레인이 죽는다

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

---

## 중단 조건 (11개)

승인을 묻지 않는다. 아래만 멈추고 보고한다.

| # | 조건 | 상태 |
| --- | --- | --- |
| 1 | P4 검증 실패 | — |
| 2 | 리허설 DB 생성 불가 | 실측상 `research_app` = `createdb:true` |
| 3 | 백업/복원 검증 실패 | — |
| 4 | `schema:status` 에 우리 6개 외 pending | — |
| 5 | in-flight 파이프라인 15분 초과 | — |
| 6 | 마이그레이션이 non-additive | — |
| 7 | freeze 체크섬 실패 | ✅ 통과 (31/31) |
| 8 | 본 체크아웃 tree hash 이동 | ✅ 불변 확인 |
| 9 | 078~083 번호 충돌 | ✅ 없음 |
| 10 | 다이제스트 변경이 설명 안 됨 | — |
| 11 | 재핀 후 api-server 부팅 실패 | — |

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

---

## 환경 메모 (이어받을 때 필요)

- **worktree 에는 `node_modules` 가 없다.** 새로 만들었으면 `pnpm install --frozen-lockfile`
  부터 해야 한다. 안 하면 기존 테스트까지 전부 실패해서 원인을 오해하게 된다
- 리허설 DB admin DSN 은 `apps/api/scripts/run_analytics_pipeline.sh` 의 `DB_URL` 에서
  database 만 `postgres` 로 바꾸면 된다 (`research_app` 롤이 `createdb=true super=true`)
- 커밋 전 `pnpm --filter <pkg> format` 을 돌린다. `format:check` 가 게이트다

---

*최종 갱신: **P1(K0)·P2(K1) 완료.** 다음은 P3(K5 Release/Safety/SLO) — 마이그레이션 081 부터*
