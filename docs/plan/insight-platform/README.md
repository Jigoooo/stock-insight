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

읽는 순서: 00 → 01 → 02 → (03·04·05 병렬) → 06.
구현 착수 전 각 Wave의 사전 게이트(00 §6)와 실측 재검증을 반드시 수행한다.
