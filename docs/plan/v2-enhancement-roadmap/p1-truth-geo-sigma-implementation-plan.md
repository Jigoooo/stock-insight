# P1 Truth·Geo + Sigma 관계 그래프 구현계획

> **For Hermes:** 이 문서는 구현 승인이 아니다. 별도의 구현 승인을 받은 뒤에만 코드·스키마·의존성·빌드·배포를 변경한다.

**목표:** P1-1~21의 진실·시간·지리 인프라를 additive migration으로 완성하면서, 현재 검증된 관계 API를 Sigma.js 기반의 인터랙티브 관계 그래프로 먼저 제품화하고 이후 P1 의미 계약을 점진 연결한다.

**아키텍처:** 기존 `knowledge.event`와 temporal relation ledger를 삭제하지 않는다. 새 canonical truth 계층을 `knowledge`, `world`, `governance`, `geo` 스키마에 추가하고 legacy 데이터를 backfill한 뒤 호환 read path를 유지한다. UI는 현재 `EntityRelationGraph` 계약으로 먼저 Sigma tracer bullet을 완성하고, P1 API가 추가하는 assertion/event/geo metadata는 additive DTO로 연결한다.

**기술 스택:** PostgreSQL 16, TimescaleDB, PostGIS, TypeScript, Node test runner, Zod, React 19, TanStack Start, Sigma 3.0.3, Graphology 0.26.0, Graphology ForceAtlas2 0.10.1, Playwright.

**기준 트리:** `origin/master@90a43add5b6c01f6e2ff3b2dc6056db265b33f2e`

**격리 작업공간:** `/tmp/stock-insight-p1`

---

## 승인된 방향

- B안: P1 진실 인프라와 Sigma 제품 tracer bullet을 병렬 수직 슬라이스로 진행한다.
- 기존 main worktree와 운영 컨테이너는 final release gate 전까지 변경하지 않는다.
- Sigma 공식 Storybook의 node drag, hover reducer, camera animation을 채택한다.
- Storybook의 빈 stage 클릭→임의 node 생성은 금융 데이터 진실성을 훼손하므로 채택하지 않는다.
- PostGIS가 현재 `pg_available_extensions`에 없으므로 JSON 좌표 fallback을 만들지 않는다. TimescaleDB+PostGIS 호환 이미지 rehearsal을 별도 prerequisite로 둔다.
- 운영 DB 적용·컨테이너 교체·배포는 코드와 rehearsal이 GREEN이고 독립 리뷰가 끝난 뒤 별도 승인받는다.

---

## 전체 구현 지도

```text
Wave S  Sigma tracer bullet (현재 verified relation API)
Wave 1  P1-1·3·5·6·7 — assertion/numeric/derivation/coverage/conflict
Wave 2  P1-2·4·8·9·10·11·13 — world event/time/source policy
Wave 3  P1-12·19·21 — entity resolution/ontology control
Wave 4  P1-14·15·17·18 — PostGIS/geo/location machine gate
Wave 5  P1-16·20 — geo exposure/PIT universe
Wave 6  serving API/backfill/compatibility/integration release gate
```

---

## Task 0 — 격리 worktree와 기준선

**목적:** 병렬 개발이 운영 main tree를 오염시키지 않도록 exact 기준 트리를 고정한다.

**파일:** 변경 없음.

**단계:**
1. `git status --short`, `git rev-parse HEAD`, `git rev-parse origin/master`를 확인한다.
2. `/tmp/stock-insight-p1` worktree를 `origin/master`에서 생성한다.
3. 기존 test/typecheck/lint/build 결과를 JSON gate receipt로 보존한다.
4. 현재 운영 App/API 이미지 digest와 rollback tag를 read-only로 기록한다.

**검증:** 기준 트리 SHA가 `90a43ad...`, main tree clean, worktree 분리.

---

## Task S1 — Sigma 의존성·순수 graph builder TDD

**목적:** API DTO를 Graphology graph로 결정론적으로 변환한다.

**파일:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/src/pages/research-workspace/model/relation-graphology.ts`
- Create: `apps/web/test/relation-graphology.test.ts`

**단계:**
1. node/edge 변환, root 고정, relation weight/evidence display attribute를 단언하는 RED 테스트를 작성한다.
2. `pnpm --filter @stock-insight/web add sigma@3.0.3 graphology@0.26.0 graphology-layout-forceatlas2@0.10.1`로 버전을 고정한다.
3. 기존 `layoutRelationNodes` 좌표를 Sigma 초기 위치로 정규화하는 순수 builder를 구현한다.
4. node id는 `entityKey`, edge id는 계약의 `edgeId`를 그대로 사용한다.
5. 임의 node/edge 생성 API가 production component에서 호출되지 않음을 구조 테스트로 잠근다.

**검증:** `node --test apps/web/test/relation-graphology.test.ts` PASS.

---

## Task S2 — Sigma React 수명주기와 마우스 인터랙션

**목적:** 정적 SVG를 실제 WebGL 관계 그래프로 대체한다.

**파일:**
- Create: `apps/web/src/pages/research-workspace/ui/relation-sigma-graph.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/views/themes-view.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/research-workspace-page.module.css`
- Create: `apps/web/test/relation-sigma-structure.test.ts`

**동작 계약:**
- `downNode`: drag 시작, node 고정/highlight, camera state update 차단.
- `moveBody`: `viewportToGraph`로 1:1 좌표 이동, `preventSigmaDefault`.
- `upNode/upStage`: drag state 해제. root는 계속 고정, 나머지는 worker에 재합류.
- `enterNode/leaveNode`: node reducer로 이웃 외 node를 낮은 명도로, edge reducer로 연결 edge만 강조.
- `clickNode`: `camera.animate`로 중심 이동 후 `onSelectEntity(entityKey)` 실행.
- graph 변경: 기존 renderer/worker를 kill하고 새 graph로 교체. stale listener/worker 0.

**검증:** source contract + browser event test, cleanup 뒤 worker/renderer 잔존 0. SHA-256 receipt로 고정한
production `.output/server/index.mjs` 문서에 실제 edge CSP(`worker-src blob:`)를 적용해 normal mode의
blob worker 생성 성공, `securitypolicyviolation`·worker console error 0, reduced-motion worker 생성 0을
계측한다.

---

## Task S3 — 카메라·검색·접근성·reduced-motion

**목적:** 탐색 가능한 관계 그래프를 완성한다.

**파일:**
- Modify: `relation-sigma-graph.tsx`
- Modify: `themes-view.tsx`
- Modify: `research-workspace-page.module.css`
- Create: `e2e/relation-sigma.spec.ts`

**구성:**
- node label 검색/선택: 공식 reducer 예시처럼 일치 node 강조 + camera 이동.
- zoom in/out/reset: 실제 SVG 아이콘을 가진 44px native button.
- keyboard node list: canvas 옆 visually-hidden/compact list에서 focus·Enter로 동일 선택 동작.
- textual evidence `<details>` fallback 유지.
- `prefers-reduced-motion`: ForceAtlas2 worker·camera tween을 끄고 결정론적 ring layout·즉시 camera set.
- 모바일: pan/zoom/tap 우선, drag threshold와 camera bound 적용.

**검증:** desktop/mobile drag·hover·search·zoom·reset·focus·reduced-motion E2E.

---

## Task 1 — Migration 031 Truth Kernel (P1-1·3·5·6·7)

**목적:** relation에 과적재된 사실을 assertion/numeric/derivation/coverage/conflict로 분리한다.

**파일:**
- Create: `packages/db-schema/src/migrations/031_truth_kernel.ts`
- Modify: `packages/db-schema/src/index.ts`
- Create: `apps/api/test/truth-kernel-migration.test.ts`

**DDL:**
- `knowledge.assertion`, `knowledge.assertion_revision`, `knowledge.assertion_evidence`
- polarity, modality, attribution, quotation, span locator, parser version, verification state
- `world.numeric_fact`, `world.numeric_fact_revision`: value, unit, period, dimensions, restatement, XBRL/cell locator
- `knowledge.derivation_anchor`, `knowledge.derivation_step`, `knowledge.derivation_input`
- `governance.coverage_ledger`: covered/absent/unknown/not_applicable/stale
- `knowledge.conflict_set`, `knowledge.conflict_member`, typed supersession relation

**불변식:**
- accepted assertion은 evidence + exact span + known time 필수.
- numeric fact는 unit/period/source locator 없이는 accepted 불가.
- 발행 pack item은 정확히 한 derivation anchor.
- derivation DAG cycle 차단.
- conflict/supersession은 동일 statement domain을 벗어나면 차단.

**검증:** fresh DB 2회 replay, invalid insert 직접 공격, forward/reverse digest 일치.

---

## Task 2 — Migration 032 World Event·4시간·출처 정책 (P1-2·4·8~11·13)

**목적:** 사건을 n-ary stateful object로 만들고 시간·출처 lineage를 완성한다.

**파일:**
- Create: `packages/db-schema/src/migrations/032_world_event_temporal_lineage.ts`
- Create: `apps/api/test/world-event-migration.test.ts`
- Modify: event read model/contract files identified by tracer map.

**DDL:**
- `world.event`, `world.event_revision`, `world.event_participant`
- state machine: rumored→announced→confirmed→effective→expired/repealed
- participant role + event location role(source/actual/jurisdiction/target/affected 등)
- Contract/Regulation reified object + participant/product/amount/period/status
- published/available/known + valid interval
- story cluster/syndication/publisher/near-duplicate/independent source group
- translation/raw artifact/parser/OCR/cell locator lineage

**호환:** legacy `knowledge.event`를 destructive rename하지 않고 additive backfill + compatibility read path.

**검증:** invalid state transition, future-known leak, orphan participant, translation without original anchor 차단.

---

## Task 3 — Temporal API contract (P1-8)

**목적:** 모든 truth read에서 시간 기준을 명시한다.

**파일:**
- Modify: `packages/contracts/src/*`의 관련 query/response schema
- Modify: `apps/api/src/*` read models/routes
- Modify: `packages/api-client/src/*`
- Add matching API/web tests.

**계약:**
- `validAt`, `knownAt`, `informationSet`
- `asOf`는 compatibility alias이며 내부에서 두 시간으로 분해.
- market session/vintage 정보 포함.
- response meta에 적용된 temporal filters와 ontology revision 반환.

**검증:** knownAt 이전 정보 누출 0, alias parity, cursor/detail/relation snapshot continuity.

---

## Task 4 — Migration 033 Entity Resolution·Ontology RFC (P1-12·19·21)

**목적:** entity 연결과 ontology 변경을 감사 가능하게 만든다.

**파일:**
- Create: `packages/db-schema/src/migrations/033_entity_resolution_ontology.ts`
- Create: `apps/api/test/entity-resolution-ontology.test.ts`
- Create: `docs/architecture/ontology-rfc-process.md`

**DDL/계약:**
- candidate pair, blocking key, feature evidence, classifier score, graph-check 결과
- auto/review/non-link decision + reviewer/audit
- LEI Level 1/2·FIBO mapping
- organization/person/legal/financial/economic/physical/industry/institution/event 최소 타입
- ontology revision/RFC/compatibility/migration ledger

**검증:** ambiguous candidate 강제 선택 금지, predicate drift compatibility failure.

---

## Task 5 — PostGIS runtime prerequisite

**목적:** PG16+TimescaleDB 운영 능력을 유지하면서 PostGIS를 제공한다.

**파일:**
- Create/Modify: DB image/compose assets discovered in `research-app-db` workspace
- Create: rehearsal script and rollback runbook

**단계:**
1. 현재 DB image digest·extension·Timescale version을 동결한다.
2. 동일 PG16 계열의 TimescaleDB+PostGIS image를 build한다.
3. production snapshot clone에 2회 기동·extension create·restore rehearsal.
4. Timescale hypertable/vector/pgcrypto/pg_trgm compatibility 검증.
5. 운영 image 교체는 별도 승인 전 금지.

**검증:** restore hash/count, extension availability, existing app query parity, rollback image boot.

---

## Task 6 — Migration 034 Geo Foundation (P1-14·15·17·18)

**목적:** 위치를 역할·정밀도·시간·근거가 있는 canonical object로 관리한다.

**파일:**
- Create: `packages/db-schema/src/migrations/034_geo_foundation.ts`
- Create: `apps/api/test/geo-foundation-migration.test.ts`

**DDL:**
- `geo.entity`, identifier/name/geometry/hierarchy revision
- `geo.location_mention`, candidate, resolution decision
- boundary policy + disputed geometry handling
- ISO 3166, UN M49, GeoNames, UN/LOCODE, IANA timezone mapping
- gold set + machine gate result

**불변식:** accepted location은 evidence, precision class, role, valid/known time 필수. abstention 허용, 강제 선택 금지.

---

## Task 7 — Migration 035 Geo Exposure·PIT Universe (P1-16·20)

**목적:** 기업의 국가·시설 노출과 시점별 security universe를 보존한다.

**파일:**
- Create: `packages/db-schema/src/migrations/035_geo_exposure_pit_universe.ts`
- Create: `apps/api/test/geo-exposure-pit.test.ts`

**DDL:**
- `geo.entity_exposure_revision`: REVENUE/ASSET/PRODUCTION/SUPPLY 등, numerator/denominator/period/source
- derivation priority + evidence
- security master identity/listing/share class/ticker history/corporate action
- delisting/split/merger/ticker reuse/macroeconomic vintage

**검증:** denominator 없는 비율 차단, overlapping ticker tenure 차단, future constituent leak 0.

---

## Task 8 — Migration 036 Serving·Backfill·Compatibility

**목적:** 새 truth/geo 계층을 제품 API와 기존 데이터에 안전하게 연결한다.

**파일:**
- Create: `packages/db-schema/src/migrations/036_truth_geo_serving.ts`
- Create: backfill scripts under `apps/api/src/ops/`
- Modify: API read models/contracts/client consumers
- Add live opt-in integration tests.

**단계:**
1. legacy relation/event/numeric source를 candidate 상태로 backfill.
2. evidence/span/locator gate를 통과한 행만 accepted.
3. counts/hash/lineage manifest 보존.
4. Sigma DTO에 optional truth state/event/location/exposure metadata 추가.
5. 기존 consumer는 additive field를 무시해 호환 유지.

---

## Task 9 — 통합 검증·조화 패스·독립 리뷰

**코드 게이트:**
- full test/typecheck/lint/build
- fresh disposable DB migration replay 2회
- DB 직접 공격 + temporal leak + geo invalid insert + DAG cycle
- backfill before/after count/hash invariant

**UI 게이트:**
- 실제 인증 계정으로 관계 그래프 desktop/mobile E2E; 320/390px에서 44px touch target·overlay 비중첩
- SHA-256 receipt로 고정한 production artifact에 `deploy/stock-edge/security-headers.conf`의 실제 CSP 적용
- drag 중 camera 정지, release 후 settle, hover neighbors, click focus, search, zoom/reset
- normal mode `blob:` ForceAtlas2 worker 생성 > 0, reduced-motion worker 생성 = 0 및 camera tween off
- 검증 상태 fail-closed, directed/undirected 텍스트 fallback, keyboard path
- `securitypolicyviolation`·console error 0, worker/listener leak 0
- Windows 100/125/150%에서 1px hairline noise/정렬 확인

**디자인 게이트:**
- 렌더 스크린샷 기준 dominance map, accent budget, alignment spine, squint test
- 기존 white canvas·sidebar·panel rhythm 유지
- 액센트는 root/active path에만 집중

**리뷰:**
- frozen commit hash 기준 DB/temporal/geo reviewer와 UI/motion/accessibility reviewer 분리
- BLOCKER 0 / HIGH 0까지 수정·재검증

---

## Task 10 — Release·Rollback (별도 실행 승인)

**운영 적용 전:**
- exact image tag, DB dump, 현재 DB image rollback tag, compose env snapshot
- candidate DB/image 2회 rehearsal
- migration no-destructive diff 확인

**운영 적용 후:**
- health, login, private API, temporal query, geo query, Sigma live screen
- old/new count/hash readback
- rollback 미사용/사용 여부 기록

**금지:** 별도 승인 없이 운영 DB migration, DB image 교체, App/API container 배포를 실행하지 않는다.

---

## P1-1~21 추적표

| 로드맵 | 구현 Task |
|---|---|
| P1-1 assertion | Task 1 |
| P1-2 event/n-ary/location role | Task 2 |
| P1-3 numeric fact | Task 1 |
| P1-4 Contract/Regulation | Task 2 |
| P1-5 derivation DAG | Task 1 |
| P1-6 coverage ledger | Task 1 |
| P1-7 conflict/supersession | Task 1 |
| P1-8 4시간/API | Task 2·3 |
| P1-9 story lineage | Task 2 |
| P1-10 translation | Task 2 |
| P1-11 artifact provenance | Task 2 |
| P1-12 entity resolution | Task 4 |
| P1-13 news policy | Task 2·8 |
| P1-14 Geo | Task 5·6 |
| P1-15 location resolution | Task 6 |
| P1-16 geo exposure | Task 7 |
| P1-17 standards | Task 6 |
| P1-18 geo gold/machine gate | Task 6 |
| P1-19 ontology expansion | Task 4 |
| P1-20 PIT universe | Task 7 |
| P1-21 ontology control | Task 4 |

---

## 승인 경계

- 이 계획 파일 저장: 승인됨.
- 코드·테스트·의존성·migration source 구현: 별도 구현 승인 필요.
- PostGIS/DB image build·설정 변경: 구현 승인 범위에 명시적으로 포함되어야 함.
- 운영 DB/image/App/API 배포: final gate 뒤 별도 실행 승인.
- commit/push: 구현 승인과 별개이며 사용자가 명시적으로 요청할 때만 수행.
