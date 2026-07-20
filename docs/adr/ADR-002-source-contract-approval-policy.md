# Source Contract 승인 정책 (P0-7)

> 정본: 이 문서가 source contract `policy_status` 심사의 기준이다.
> 근거: `docs/plan/stock-insight-v2-enhancement-plan.md` §20.3 (데이터 권리), 로드맵 P0-7.
> 시행: 2026-07-20. 심사 결과는 `ingestion.source_contract_revision`에 append-only revision으로 기록한다.

## 승인 티어

| 티어 | policy_status | 허용 범위 | 조건 |
|---|---|---|---|
| T1 공식·공개 데이터 | `approved` | accepted 사실·관계의 근거, 사용자 재표시(출처 표기) | 정부·중앙은행·규제기관·거래소 공식 API 또는 공개 라이선스 명시 |
| T2 내부 파생 스냅샷 | `approved` | 시스템 내부 근거 (원천 lineage가 이미 T1/T3로 소급) | 원본 소스 revision 참조가 보존됨 |
| T3 시장 데이터 서드파티 | `approved_internal_research` | 내부 연구·검증(measurement)·모델 입력. **원문 재배포·대량 재표시 금지** | ToS상 재배포 제약이 있는 무료 시장 API |
| T4 뉴스·언론 RSS | `approved_candidate_evidence` | assertion/event **후보** 근거, 짧은 인용(span)+링크 재표시. 전문 재게시 금지. accepted 승격은 §10.2 사다리(공식 확인) 필요 | 공개 RSS. 저작권 원문은 내부 검증 사본만 |
| T5 내부 운영 아티팩트 | `approved_internal_ops` | 파이프라인 운영 기록 전용. 사실 근거 사용 금지 | env·오류 로그·briefing 파생물 |

## 소스별 배정 (32건 전건)

| provider_key | 티어 |
|---|---|
| internal-company-profile-snapshot, internal-etf-holdings-snapshot, internal-industry-classification-snapshot | T2 (기승인) |
| bok-ecos, fred, ny-fed, opendart, treasury-fiscaldata, kdi-eiec-policy-materials | T1 |
| pykrx (KRX 공개 데이터) | T1 |
| yfinance, coingecko, coingecko-global, alternative-me | T3 |
| rss:* (12개), rss-news-bundle | T4 |
| briefing-markdown, stock-candidate, crypto-candidate, env, yfinance-error | T5 |

## 공통 의무 (모든 티어)

- 원문 보존: 내부 검증·감사용 사본 + SHA-256 (crypto-shredding 대상 지정 가능해야 함)
- 삭제 요청(legal takedown) 처리 절차: restricted vault 이동 후 payload shred, lineage 메타는 보존
- 계약 만료·변경 시 새 revision append (기존 revision 수정 금지)
- `approved`가 아닌 티어의 데이터는 accepted 구조 관계의 단독 근거가 될 수 없다

## 시행 기록

- 2026-07-20: 전 32건 심사 완료, 위 배정대로 revision append (`p0-7-source-contract-approval` 스크립트).
