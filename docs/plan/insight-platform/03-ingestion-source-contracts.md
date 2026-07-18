# 03 — 수집 파이프라인과 소스 계약

> Baseline: §7(수집 파이프라인), §12(리포트별 데이터 요구), §26 체크리스트(데이터)
> 실측 결합: 현재 가동/정지 수집기 목록과 "불필요할 정도로 풍부하게" 확장 카탈로그

---

## 1. 현재 수집기 상태와 처분

| 수집기 | 상태 (실측) | 처분 |
|---|---|---|
| RSS news (30분, 15+ 피드) | 가동. 제목만 수집, 본문·entity 링크 없음 | 유지 + 본문/snippet·entity 링크 확장 (Wave 2) |
| 뉴스 한국어 번역 (Gemini) | title_ko 121, summary_ko 0 (원문 summary 부재가 원인) | 본문 확보 후 재가동 |
| yfinance OHLCV (일) | 가동. 256 심볼 1D | 유지 + 교차검증 소스 추가. Tier 재분류(비공식) |
| OpenDART 연간재무 (일) | 가동. 151행 | filing-fact 단위로 재설계 + 분기 확장 |
| SEC EDGAR companyfacts (일) | 가동 (403 시 캐시 fallback) | 〃 + submissions/acceptance 추가 |
| 'all' 통합 러너 (snapshots/macro) | 가동 | 유지, 진단행 분리 |
| 개별 collector (us_macro/kdi/eiec) | 5/3 이후 정지 | 통합 러너로 공식 대체 선언 또는 재가동 결정 (Wave 1) |
| institutional_holdings | 6/29 정지, 250행 | 13F 파이프라인으로 재구축 (Wave 3) |
| news_comention/R-빌더 일부 | 6/29 정지 | knowledge 그래프 재구축에 흡수 (Wave 3) |
| market_signals 생성기 | 가동하나 근거 링크 0 | claim/event 추출 파이프라인으로 대체 (Wave 2) |

## 2. Source Contract 규약 (Baseline §7.1)

모든 소스는 `ingestion.source_contract`에 다음을 명시해야 수집 자격을 얻는다.

```json
{
  "provider_key": "sec-edgar",
  "tier": 1,
  "schedule": {"cadence": "daily", "window_kst": "05:00-07:00", "max_lag_hours": 24},
  "required_fields": ["cik", "accession", "period_end", "filed_at"],
  "quality": {"expected_records": {"min": 30, "max": 500}, "monotonic_keys": ["filed_at"]},
  "revision_policy": "new_version",
  "license": {"status": "conditional", "redistribution": "derived_only", "attribution": true},
  "rate_limit": {"rps": 5, "user_agent_required": true}
}
```

규칙:

- 신규 수집기는 contract 등록 + 라이선스 승인 전 운영 적재 금지 (기존 감사 원칙 승계)
- rss:* 27+ provider 일괄 등록 (Wave 0-6)
- 재배포 불가 원문은 hash/URI/허용 snippet만 보관·노출 (Baseline §19.3)
- credential은 비밀 저장소 주입, 코드·로그 금지 (Baseline §19.4)

## 3. 소스 계층화와 확장 카탈로그

Baseline §7.1 Tier 체계로 현재+신규 소스를 배치한다. **모든 신규 소스는 도입 전 약관·라이선스 재확인 필수** (이번 조사에서 웹 검색 백엔드 장애로 최신 약관 미검증).

### Tier 1 — 사실·수치의 기준 (Must)

| 소스 | 데이터 | 대상 Wave |
|---|---|---|
| SEC EDGAR (submissions/companyfacts/13F/N-PORT) | US 재무 fact, filing acceptance, 기관 보유 | 2~3 |
| OpenDART (재무 XBRL·접수·정정) | KR 재무 fact, 공시 이벤트, corp_code | 2~3 |
| KRX (시장 데이터·corporate action) | KR corporate action, 세션 calendar, 지수 구성 | 2 |
| 거래소 공식 calendar | 휴장·세션 | 2 |
| FRED/ALFRED | US macro vintage·release calendar | 3 |
| BOK ECOS | KR macro (기가동, vintage 개념 보강) | 3 |
| 미 재무부 FiscalData / NY Fed | 금리·재정 (기가동 소량) | 3 |
| 코인: 체인 원장/공식 노드 지표 | 온체인 사실 | 3+ |

### Tier 2 — 사건 발견·교차 검증 (Should)

| 소스 | 데이터 |
|---|---|
| 현행 RSS 15+ 피드 (본문 확장) | 뉴스 이벤트 후보 |
| FINRA daily short sale volume | US 수급 보조 (short interest와 구분 저장) |
| CFTC COT | 파생 포지셔닝 |
| yfinance/pykrx | 가격 교차검증 (canonical 승격 금지, Tier 2 유지) |
| CoinGecko (기가동) | 코인 시세·메타 |
| 기업 IR 페이지/보도자료 | 이벤트 확인 |

### Tier 3 — 산업 구조·전망 (Could)

- KDI/EIEC 정책자료 (기존 수집분 재활용), BIS/OECD SDMX, UN Comtrade
- 산업 리서치·전문 매체 → claim으로만 저장, 시점 명시

### Tier 4 — 후보 신호 (사실 승격 금지)

- 커뮤니티·소셜 attention (도입 시 별도 라벨, Baseline §7.1)

### 유료·계약 필요 (Later, ROI 승인 후)

- OPRA/Cboe options, consensus estimates/revisions, securities lending, licensed news full-text, 상용 공급망 데이터

## 4. 파이프라인 표준 7단계 (Baseline §7.2 채택)

```text
Fetch → Persist Raw → Register → Deduplicate → Normalize → Validate Contract → Publish Watermark
```

현재 대비 신설 포인트:

1. **Persist Raw**: 원본+헤더를 객체 저장소에 (현재 없음 — 최우선 구조 변경)
2. **Register**: `(source_id, content_hash)` unique + fetch_run 연결 (revision ledger는 기가동, 승계)
3. **Deduplicate**: 재배포 기사와 동일 문서 구분 — 정규화 본문 해시 + 이벤트 키
4. **Normalize**: 인코딩·시간대·통화·단위·심볼 표준화 (현재 ticker 정규식 산재 → 공용 정규화 모듈 1곳)
5. **Validate Contract**: 필수 필드·범위·레코드 수 급변 검사 (현재 없음)
6. **Publish Watermark**: 소스별 `watermark_at` + 누락 구간 기록 → `ops.dataset_watermark` 확대판으로 집계

멱등 키 (Baseline §7.3): 수집 `(source_id, source_document_id, version)`, 내용 `content_hash`, 이벤트 `dedupe_key`, 가격 `(venue, instrument_id, interval, ts)` — OHLCV upsert는 현행 `(exchange,symbol,timeframe,ts)` 충돌 처리와 호환.

## 5. 지연 데이터 정책 (Baseline §7.4 채택)

| 상황 | 처리 |
|---|---|
| 컷오프 후 도착, 중요도 낮음 | 다음 정기 리포트 포함 |
| 중요도 높음 | 증분 이벤트 브리프 (Wave 5) |
| 기존 결론 뒤집음 | 해당 리포트 정정 배지 + 새 버전 (supersedes) |
| 가격·재무 수정 | 계보 따라 선택 재계산 (lineage 기반, Wave 5) |

## 6. 도메인별 목표 수집 매트릭스 ("불필요할 정도로 풍부")

### 주식 (KR/US)

| 카테고리 | 항목 | 주기 |
|---|---|---|
| 가격 | 일봉(raw+adjusted), 주봉 파생, 관심종목 인트라데이(도입 검토), FX | 일 / 분(검토) |
| 재무 | 분기·연간 filing-fact, 정정 이력, 가이던스(claim) | 공시 이벤트 |
| 자본 | 발행주식·시총·자사주, 13F/N-PORT, insider, 주요주주 | 분기/이벤트 |
| 수급 | KR 외국인/기관 (기존 KR 신호 재구조화), US short volume | 일 |
| 이벤트 | 공시·실적·수주·규제·소송·리콜 | 이벤트 |
| 일정 | 실적 발표일, 경제지표 발표일, 휴장일 | 주 |

### 코인 (Baseline §12.2 요구 반영)

| 카테고리 | 항목 | 주기 |
|---|---|---|
| 시세 | 현물/선물, 펀딩비, 베이시스, OI | 일→분 단계 확대 |
| 온체인 | 수수료, 활성 주소, TVL, 스테이블 공급, 거래소 순유입 | 일 |
| 프로토콜 | 업그레이드, 거버넌스, 언락 일정, 해킹 | 이벤트 |
| 구조 | Token↔Protocol↔Chain, 브리지·오라클·담보 의존 | 저빈도 |

### 거시

- KR 100 + US 21 시리즈 → US 시리즈 확충 (금리·고용·물가·소비 코어셋), vintage·release calendar 필수

## 7. 수집 우선순위 (Wave 정렬)

1. **Wave 0**: 기존 수집기 정합 (진단행 분리, provider 등록, 워터마크 확대)
2. **Wave 1**: 객체 저장소 + fetch_run 통합 + Source Contract 등록
3. **Wave 2**: RSS 본문, KRX/거래소 corporate action + calendar, 재무 filing-fact (KR/US), 실적 일정
4. **Wave 3**: macro vintage, 13F/N-PORT, FINRA/CFTC, KR 수급 재구조화, 온체인 코어
5. **Later**: 유료·계약형
