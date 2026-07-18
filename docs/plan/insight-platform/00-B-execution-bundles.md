# 00-B — 실행 번들 구성: Wave 대신 "한 번에 승인·실행하는 세트"

> 상위 문서: `00-master-roadmap.md`, `00-A-wave0-execution.md`
> 목적: 잘게 쪼갠 Wave/WBS를 **승인 1회 → 연속 실행 → 통합 검증 1회**가 가능한 큰 세트로 재편성.
> 원칙: 세트 내부는 체크포인트로 관리(중단·롤백 가능), 세트 간에는 명확한 인수물 경계.

---

## 0. 재편성 기준

1. **같은 표면을 건드리는 작업은 같은 세트로**: 같은 파일/스키마를 두 번 열지 않는다
2. 세트 하나 = 승인 1회 + 브랜치 1개 + 통합 검증 1회 + 보고 1회
3. 세트 내부 실패 시 체크포인트 단위 롤백 (세트 전체 무효화 아님)
4. 세트 간 의존은 단방향 (되돌아가서 수정하지 않도록 산출물 고정)

## 1. 세트 구성 총괄

```text
SET A ─ 데이터 정직화 + API 확장 (구 Wave 0 전체 통합)          [코드+DB뷰, 배포 1회]
SET B ─ 정본 기반: core·ingestion·운영 인프라 (구 Wave 1 + DR)   [스키마+백필+인프라]
SET C ─ 시장 데이터 풍부화 (구 Wave 2~3 market 계열 선행 분리)    [수집기 신설 묶음]
SET D ─ 지식화 + 리포트 생산 체계 (구 Wave 2 knowledge/content)   [워커+발행 전환]
SET E ─ 그래프 추론 + Feature + 시장확인 (구 Wave 3)              [분석 계층]
SET F ─ 개인화 + 평가 고도화 (구 Wave 4~5)                        [사용자 계층]

의존: A → B → (C ∥ D) → E → F     C와 D는 병렬 가능
```

| 세트 | 승인 범위 | 규모(감) | 완료 게이트 |
|---|---|---|---|
| A | DB 뷰·컬럼 추가 + 수집기 3종 패치 + read-model 개편 + NestJS cutover 배포 | 중 | G1~G6 (00-A) |
| B | 신규 스키마 2종 + 백필 + WAL·role + 오케스트레이터 + raw 저장소 | 대 | B-게이트 (아래) |
| C | 신규 커넥터 5종 + 백필 5종 | 대 | C-게이트 |
| D | knowledge/content 스키마 + 추출 워커 + 발행 전환 | 대 | D-게이트 |
| E | relation 이관 + 온톨로지 + feature + impact path | 대 | E-게이트 |
| F | personalization + calibration + 증분 브리프 | 중 | F-게이트 |

## 2. SET A — 데이터 정직화 + API 확장 (승인 시 즉시 착수 가능)

구 W0-1~6 전체를 **한 승인**으로 묶는다. 내부 체크포인트 3개:

```text
A-1 [DB만]   serving 스키마+뷰 3종, watermark 컬럼·12종 확대, 오염 격리(진단행·fiscal_year=0),
             rss provider 27종 정책 등록, 수집기 3종 watermark upsert 패치
             └ 체크포인트: /api 무영향 (뷰만 추가) — 검증 후 A-2
A-2 [코드]   stocks read-model universe 교체(entities 기반) + latest_price/price_series 연결
             + GET /api/stocks/:key/prices 신설 + status 12종 노출
             └ 체크포인트: 로컬 golden diff + 브라우저 QA — 검증 후 A-3
A-3 [배포]   NestJS api-server cutover (병행 기동 → diff 0 → 전환 → 24h 관찰)
             └ 롤백: fetch base 원복 5분
```

- 승인 1회에 포함되는 것: migration 1개(1xx_serving_wave0), 수집기 패치 3파일, read-model·contracts·컨트롤러 수정, compose 변경
- 통합 게이트: G1~G6 + 커버리지 before/after 리포트
- 예상 리스크: 00-A §4 R1~R6 그대로

## 3. SET B — 정본 기반 (스키마 + 인프라 통합)

구 Wave 1 + 06-A의 인프라 항목(WAL·role·오케스트레이터)을 통합. **인프라 재시작 창 1회로 몰아서 처리**하는 것이 핵심 이득.

```text
B-1 [인프라 창 1회] archive_mode=on(컨테이너 재시작) + DB role 6종 생성 + raw-objects 디렉터리
B-2 [스키마]        core 4테이블 + ingestion 5테이블 + ops.model/prompt_registry (migration 2개)
B-3 [백필]          entities→core 분해(KR151+US102+코인 상위) + source_documents→document 매핑
                    + provider 15+27종→ingestion.source
B-4 [오케스트레이터] Dagster OSS 도입, 기존 systemd 트리거 위임(커넥터는 subprocess 유지)
                    + ready 게이트 스크립트 선적용
B-5 [검증]          V1~V6 쿼리 + 계보 추적 1건 실연(raw→document) + PITR 복구 리허설 1회
```

게이트: 원본→정규화 계보 100%, 재실행 무중복, WAL 아카이브 실측, Dagster에서 기존 잡 1주 무사고.
의존: A 완료 (serving 뷰가 B-3 백필의 호환 검증 기준).

## 4. SET C — 시장 데이터 풍부화 (커넥터 일괄 신설)

"수집기 하나 만들 때마다 승인" 대신 **커넥터 5종 + 백필을 한 세트로**. D와 병렬 가능 (서로 다른 표면).

```text
C-1 krx: corporate_action + trading_calendar (+KOSPI/KOSDAQ 정본)   ← 약관 확인 선행
C-2 재무 filing-fact: opendart 분기+정정 / sec companyfacts 분기 재설계 + concept 사전
C-3 ohlcv 확장: 5y 백필 + adjusted 재계산(C-1 의존) + US 마감 슬롯 분리
C-4 macro vintage: fred/alfred 코어 시리즈 + release calendar (ecos는 조사 후)
C-5 수급: finra short volume + KR 투자자별 매매동향 재구조화
```

게이트: 각 커넥터 contract-runtime 통과 + 백필 후 커버리지 표(전 종목 5y bar, 8분기 재무, vintage 10y) + PIT 필드(available_at) 전수.
의존: B (core.listing·ingestion 규격). C-1 약관 검토만 세트 착수 전 선행.

## 5. SET D — 지식화 + 리포트 생산 체계

구 Wave 2의 knowledge/content 전체 + RSS 본문 확장을 한 세트로.

```text
D-1 스키마: knowledge 6테이블 + content 5테이블 + latest_report_pointer
D-2 수집 확장: rss 본문/snippet + 번역 재가동 (매체별 라이선스 게이트)
D-3 워커: entity linking → claim/event 추출 → NLI → corroboration (골든셋 30케이스 동시 구축)
D-4 이관: market_signals 3분류 + source_documents→document 승격
D-5 발행 전환: report_definition 3종 + evidence pack + 구조화 JSON + 원자 발행
             (기존 briefing은 병행 발행 2주 후 대체)
```

게이트: 사실형 문장 인용 100%, 발행 실패 시 이전 버전 유지 fault injection 통과, 골든셋 기준선 확정.
의존: B. (C 없이도 착수 가능 — 뉴스·공시 기반이므로)

## 6. SET E — 그래프 추론 + Feature + 시장확인

```text
E-1 relation 이관(temporal_graph_edge→knowledge.relation) + evidence 재구축
E-2 온톨로지 3종(AI인프라/반도체/전력) + 규칙 엔진 + impact_path
E-3 feature fs_v1 (asset_feature_snapshot) + 시장확인 3축
E-4 theme 객체화 + 커뮤니티 배치
E-5 자산·테마 스냅샷 발행 + serving 뷰 + v1 API (assets/themes/graph)
```

게이트: 경로 edge 근거 100%, 골든셋 impact-path 통과, 자산 페이지 사전계산 제공.
의존: C(feature 입력) + D(claim/event·발행 체계).

## 7. SET F — 개인화 + 평가 고도화

```text
F-1 personalization 스키마 + 순위화 + explanation_codes + 다양성 (feed dual-run → 대체)
F-2 calibration_profiles + scorecard API + feature_snapshot_id 연결
F-3 증분 이벤트 브리프 + lineage 선택 재계산 + 정정·재발행 워크플로
```

게이트: 피드 성공률·설명 100%·사용자별 LLM 0, calibration 최소표본 규칙 준수, 중요 사건 목표 시간 내 갱신.

## 8. 승인·보고 프로토콜 (전 세트 공통)

1. 세트 착수 승인 1회 (이 문서의 세트 범위 기준, 범위 이탈 시 재승인)
2. 체크포인트마다 진행 heartbeat (완료한 것/다음)
3. 세트 종료: 통합 게이트 실측 + 독립 리뷰(HIGH 0) + readback + 커밋/푸시 여부 확인
4. 세트 중단 조건: hard gate 실패, 데이터 손상 징후, 라이선스 게이트 미통과

## 9. 전체 순서 요약

```text
지금: SET A 승인 대기 (즉시 착수 가능)
     ↓
SET B (인프라 창 1회 포함)
     ↓
SET C ∥ SET D (병렬)
     ↓
SET E → SET F
```
