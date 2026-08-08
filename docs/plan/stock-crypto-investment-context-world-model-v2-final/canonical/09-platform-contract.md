# 09. Storage, Serving, Orchestration, Security & Retrieval Contract

**Owner:** Platform Engineering  
**Depends on:** Canonical Kernel + Data Acquisition  
**Produces:** durable storage, serving projections, DAG, secure API, retrieval/LLM runtime

## 1. Storage Roles

- PostgreSQL: entity/assertion/event/relation/derivation metadata, policy, release pointers — canonical operational truth.
- content-addressed object storage: raw bytes, parsed artifacts, model I/O archives; 최소 2 physical copy + offsite backup.
- time-series/columnar projection: 고용량 가격/feature/backtest. 필요 시 Timescale/Parquet+DuckDB/ClickHouse 계열.
- vector/graph indexes: 재생성 가능한 derived index.

`REQ-PLAT-001` “PostgreSQL이 정본”은 모든 byte와 모든 analytics intermediate를 PG에 넣는다는 뜻이 아니다.

## 2. Serving Projection

L6를 `Versioned Serving Projections`로 정의한다.

- content/report packs.
- common asset views.
- theme views.
- market/feature projections.
- geo tiles/projections.
- private decision packets.

모든 surface는 compatible semantic/release manifest를 사용한다.

## 3. Release Manifest

release는 관련 projection의 snapshot IDs/digests/versions/freshness를 묶는다. 다른 pack kind가 서로 다른 snapshot을 보이는 window를 사용자 surface에서 허용하지 않도록 read pointer를 release 단위로 전환한다.

## 4. Orchestration

현재 systemd/wrapper 기반은 단계적으로 공통 DAG control plane으로 수렴한다.

원칙:

- external fetch/LLM을 장기 DB transaction으로 감싸지 않는다.
- immutable input manifest → immutable output artifact → 짧은 DB commit.
- lease/fencing.
- idempotency.
- backfill namespace 분리.
- stage attempt에 code commit/image/config/source-tree hash.
- dependency gate는 시각순서가 아니라 DB/manifest condition으로 강제.

## 5. Silent Failure Detection

조용한 실패를 1급 위험으로 본다.

- expected row/artifact growth.
- source semantic watermark.
- coverage delta.
- stale latest pointer.
- empty read model where upstream has data.
- skipped/filtered adapter counts.
- lock contention attempt 기록.
- view reachability audit.

`REQ-OPS-001` “프로세스 exit 0”만으로 pipeline success를 선언하지 않는다.

## 6. Outbox

현재 PG outbox는 요구 범위 내 at-least-once 전달이며 Kafka와 동일한 장기 replay/다수 consumer isolation 보증이라고 표현하지 않는다. relation/content/semantic invalidation producers가 필요할 때 additive로 확장한다.

## 7. Security & Privacy

- Web/BFF는 DB 자격증명 없음.
- API/brain이 DB query 경계 소유.
- internal context는 path/method/identity/time에 결속; nonce/jti 또는 short-window replay policy 명시.
- PostgreSQL RLS for private user data.
- reader/writer role identity boot verification.
- no superuser/BYPASSRLS.
- secrets rotation.
- SSRF/parser sandbox/untrusted content isolation.
- portfolio/lot/profile은 encrypted/minimized/audited.
- model prompt/tool injection 방어.

## 8. Retrieval & LLM

Intent router:

```text
factual → entity/assertion/source span
numeric → comparable fact + executable program
relation/path → typed graph traversal
global/theme → community/theme summaries + source sampling
impact/scenario → exposure + estimates + scenario
contradiction → conflict chronology
research → bounded evidence acquisition
```

LLM 허용:

- extraction candidate.
- entity/concept candidate.
- research planning.
- evidence-bound summary/explanation.
- counterargument/unknown suggestion.

금지:

- accepted truth 생성.
- 숫자 임의 계산/변경.
- trade action 변경.
- link prediction을 현실 관계로 표현.
- self-confidence를 calibrated probability로 표현.

## 9. Graph ML

PathSim/NBFNet/HGT/TGN/PCMCI 등은 candidate ranking/shadow research에만 사용하고 accepted truth와 물리 분리한다.
