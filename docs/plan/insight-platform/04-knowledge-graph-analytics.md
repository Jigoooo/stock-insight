# 04 — 지식화·그래프·분석 계층

> Baseline: §8(지식화), §9(그래프 모델과 추론), §10(Feature Store), §21.3(골든셋)
> 실측 결합: market_signals 13,269(근거 0)·graph_evidence 25,332(source 0)·feature 0·calibration 0의 재건 계획

---

## 1. 지식화 파이프라인 (Baseline §8 채택)

```text
정규화 문서 → 분류·Chunking → Entity Linking → Claim·Event·Relation 후보 추출
→ Schema Validation → NLI → Cross-source Corroboration → 품질 판정
→ {확정 그래프 | Claim Store | Hypothesis Queue | Quarantine}
```

### 1.1 엔티티 해소 규칙 (Baseline §8.1)

1. 심볼·공식 식별자(CIK/corp_code/contract) 우선
2. 이름+별칭+국가+거래소+산업+문맥 점수화
3. 임계치 미달·상위 후보 근접 시 자동 연결 금지 → 검수 큐
4. 신규 엔티티는 임시 상태로 생성 후 승격
5. 회사↔주식, 프로토콜↔토큰, 체인↔브리지 자산 구분

현재 자산 재사용: RSS entity 링크 0건 문제는 이 파이프라인 최초 적용 대상. 기존 시그널 생성기의 제목-정확일치 매칭(성공 0)은 폐기하고 entity linking으로 대체.

### 1.2 Claim/사실 구분 (Baseline §8.2~8.3)

- `수요가 강할 것으로 예상` → claim_type=guidance, 발화 주체=회사, 사실 아님
- 모순 문서는 덮어쓰지 않고 `contradicts` 링크로 병존
- 승자 판정: 최신성 단독 금지. 출처 권위·직접성·독립 출처 수·공식 정정 여부

### 1.3 커밋 기준 (Baseline §8.4 표 채택)

| 결과 | 조건 | 저장 |
|---|---|---|
| 직접 사실 | 공식 출처 또는 강한 교차 검증 | claim(asserted) + relation |
| 보고된 주장 | 발화 주체·원문 확인 | claim |
| 추출 관계 | 문서 함의 + 엔티티 확정 | extracted relation |
| 규칙 파생 | 규칙 버전 + 입력 관계 존재 | rule_derived relation |
| 통계 관계 | 방법·기간·표본 기록 | statistical relation |
| LLM 후보 | 근거 미충족 | hypothesis queue (자동 승인 금지) |

### 1.4 기존 데이터 이관

| 대상 | 처리 |
|---|---|
| market_signals 13,269 | ① 제목 정규화 매칭으로 문서 복구 시도 → event/claim 승격 ② 수치성(flow/기술지표) → analytics feature 입력으로 재분류 ③ 잔여 → `untrusted_legacy` 격리, 근거 수 집계 제외 |
| graph_evidence 25,332 | evidence로 인정하지 않음. relation 이관 시 evidence_key 재생성, 문서 span 확보분만 relation_evidence 생성 |
| news_comention_obs 168 | 재현 가능(방법·기간 기록)하면 statistical relation으로 승격, 아니면 폐기 |
| GBrain 아카이브 | 역이관 금지 (후행 아카이브 역할 유지) |

## 2. 세 개의 논리 그래프 (Baseline §9.1)

| 그래프 | 내용 | 현재 대응 | 이관 |
|---|---|---|---|
| Structural | Company–Product–Technology–Industry–Supply, Protocol–Chain–Token | SAME_INDUSTRY/PEER_OF 등 일부 | relation_kind='structural'로 이관 + 온톨로지로 확충 |
| Event | 실적·수주·규제·해킹·언락·거시 충격 | 없음 (신설) | knowledge.event 기반 |
| Market | 상관·베타·동조·수급 흐름 | NEWS_COMENTION·flow 신호 | relation_kind='statistical', 유효기간·방법 필수 |

구분 원칙: Market Graph를 Structural로 오인하지 않도록 `relation_kind + 계산 방법 + 유효기간` 필수 (Baseline §9.1).

## 3. Predicate 통제어휘 (Wave 2, 20~40개)

초기 셋 (Baseline §9 예시 + 현재 도메인):

```text
구조: PRODUCES, SUPPLIES, USES, REQUIRED_BY, COMPETES_WITH, OWNS, SUBSIDIARY_OF,
      LISTED_ON, TOKEN_OF, DEPLOYED_ON, BRIDGES_TO, COLLATERAL_OF, MEMBER_OF_INDUSTRY, EXPOSED_TO_THEME
이벤트: ANNOUNCED, INCREASES_DEMAND_FOR, DECREASES_DEMAND_FOR, CHANGES_SUPPLY_OF,
        AFFECTS_REGION, REGULATES, HACKED, UNLOCKS, GUIDES
시장: CORRELATES_WITH, LEADS, CO_MENTIONED_WITH, FLOW_PRESSURE_ON
파생: POTENTIALLY_BENEFITS_FROM, POTENTIALLY_HARMED_BY
```

규칙: allowlist 밖 predicate는 hypothesis queue로만. `causes`는 영구 금지 (기존 원칙).

## 4. 온톨로지와 규칙 추론 (Baseline §9.2~9.4)

- Wave 3에서 산업 온톨로지 2~3개로 시작: **AI 인프라(데이터센터→GPU/HBM/전력/냉각), 반도체 공급망, 전력·유틸리티** (현재 watchlist·테마 실측과 겹치는 영역 우선)
- 규칙은 버전 관리 + 입력 edge ID + 신뢰도 내역 + 만료 + 억제 조건 기록 (Baseline §9.4)
- 추론 7단계와 path_score 공식(§9.3) 원안 채택. 점수 구성 요소별 기여도 저장 (개인화·화면 설명 재사용)
- path_score는 가격 상승 확률이 아니라 **산업적 연결 강도** — UI 라벨도 이에 맞춤

## 5. GraphRAG의 배치형 역할 (Baseline §9.5)

- Local expansion (자산·이벤트 2~4 hop), Community detection(일/주), Community summary(장기), Narrative change detection, Evidence pack retrieval
- 웹 요청 시 GraphRAG 직접 실행 금지 — Content Pack·읽기모델 경유
- Community summary는 relation 근거로 역사용 금지 (기존 감사 원칙과 합치)
- pgvector: evidence_embedding 0건 → chunk/claim 임베딩부터 재구축. 모델·차원은 `ops.model_registry` 등록 후 사용. 3,072d 채택 시 halfvec HNSW (기존 검토 결과 승계)

## 6. Feature Store와 시장 확인 (Baseline §10)

### 6.1 피처 범주 (§10.1 채택)

주식: 가격·모멘텀 / 유동성·수급 / 펀더멘털 / 밸류에이션 / 이벤트 / 관계(산업 노출·공급망 집중)
코인: 수익률·펀딩비·베이시스 / 거래소 순유입·대형지갑 / 수수료·활성주소·TVL / FDV·시총/TVL / 업그레이드·언락 / 체인·브리지·오라클 의존

### 6.2 계산 원칙 (§10.2)

- `as_of` 시점 가용 데이터만 (available_at 게이트)
- 수정 재무·소급값 혼입 금지 (vintage 사용)
- 분할·denomination 표준화 (corporate_action 테이블 의존)
- 피처마다 계산 버전 + 입력 워터마크 + 결측 여부
- 결측은 `data_unavailable`, 추정 대체 금지

### 6.3 시장 확인 계층 (§10.3)

리포트 3축 분리 표기: `산업 연결 강도` / `시장 확인 정도` / `밸류에이션·기대 반영도`. 하나의 예측 점수로 합산 금지.

계산 항목: 서사 대비 가격·거래량 반응, 동종 대비 초과성과, 기대 선반영도, 펀더멘털/온체인 동행 여부, 구조 없는 단기 상관 여부.

### 6.4 기존 예측 원장과의 결합

- forecast issuance/outcome 원장(3,554/8,283)은 유지하고, feature_snapshot_id를 issuance에 연결 (현재 없음)
- calibration: matured final 3,083건으로 Brier/log/reliability 초기 프로파일 생성 가능 → Wave 5에서 `calibration_profiles` 가동 + scorecard API
- `stock.evaluations`는 interim mark로 재라벨. 만기 전 verdict의 최종 집계 금지 (기존 불변식 유지)

## 7. 골든 데이터셋 (Baseline §21.3)

Wave 2부터 유지하는 고정 평가 세트:

1. KR/US/코인 엔티티 해소 사례 (동명이인·구명칭 포함)
2. 부정문·전망·조건문 claim 추출
3. `공급 중` vs `개발 중` NLI 사례
4. 재배포 기사 vs 독립 출처
5. 산업 영향 경로와 반례
6. 사실·추론·위험 분리 리포트 샘플

모델·프롬프트·규칙 변경 시 정확도·재현율·인용 정확도·비용·지연 회귀 비교 후 승격.
