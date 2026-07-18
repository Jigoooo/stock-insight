# Insight Platform 실행계획 문서 세트

> 기준 설계: `docs/plan/stock-crypto-insight-platform-architecture.md` (Baseline v1.0, 2026-07-18)
> 실측 기준선: 2026-07-18 03:53 KST, `master@7034d77`, research_app (PG 16.14 / TimescaleDB 2.28.2 / pgvector 0.8.1)
> 성격: 로드맵/설계 전용. 이 문서 세트는 코드·DB·운영 변경을 포함하지 않는다.

| 문서 | 내용 |
|---|---|
| `00-master-roadmap.md` | 총괄 로드맵, 갭 스코어카드, Wave 계획과 완료 게이트, 금지사항, KPI |
| `01-current-vs-target-gap.md` | Baseline 계층 ↔ 현재 운영 DB/코드 실측 매핑과 갭 상세 |
| `02-data-architecture-migration.md` | 목표 스키마(9계층) 채택안, 시간 규약, 기존 테이블 이관 전략 |
| `03-ingestion-source-contracts.md` | 소스 카탈로그·Tier·Source Contract·수집 파이프라인 고도화 |
| `04-knowledge-graph-analytics.md` | 지식화(Claim/Event), 3-그래프, 온톨로지 추론, Feature/예측/캘리브레이션 |
| `05-content-personalization-serving.md` | 리포트 생산 파이프라인, 개인화, serving 읽기모델, NestJS API 계약 |
| `06-operations-quality-security.md` | 오케스트레이션, 품질 게이트, 관측성/SLO, 복구, 보안 |

심화 설계 (구현 착수 가능 수준 — 각 상위 문서의 A-부록):

| 문서 | 내용 |
|---|---|
| `00-A-wave0-execution.md` | Wave 0 실행 WBS(W0-1~6), 게이트 G1~G6, 의존성, 리스크 레지스터, 승인 포인트 |
| `01-A-field-level-mapping.md` | 컬럼 단위 이관 매핑(실측 컬럼 기준) + parity 검증 쿼리 V1~V8 + 이관 순서·정지 조건 |
| `02-A-ddl-and-migration-spec.md` | 마이그레이션 파일 구성, Wave별 전체 DDL·인덱스, DB role 6종, 이관 스크립트 규격, 용량 계획 |
| `03-A-connector-specs.md` | 커넥터 모듈 표준 구조, 소스 11종 contract JSON, 스케줄 맵, 백필 계획, 품질 계측 |
| `04-A-knowledge-analytics-spec.md` | LLM 추출 스키마, 엔티티 해소 점수식, NLI 파이프라인, 규칙 포맷, feature spec(fs_v1), calibration |
| `05-A-content-serving-spec.md` | Report Definition 3종 실값, 블록 zod 스키마, Evidence Pack 빌더, 발행 트랜잭션, v1 API 계약, cutover 런북 |
| `06-A-operations-spec.md` | 오케스트레이터 채점·자산 그래프, ready 게이트 스크립트, DR 런북(WAL), 보안 체크리스트, 테스트 매트릭스 |

읽는 순서: 00 → 01 → 02 → (03·04·05 병렬) → 06.
구현 착수 전 각 Wave의 사전 게이트(00 §6)와 실측 재검증을 반드시 수행한다.
