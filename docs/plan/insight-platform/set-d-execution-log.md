# SET D 실행 기록 — 지식화 + 리포트 생산 체계

> 실행일: 2026-07-18, SET C(`015fa66`) 이후
> 계획 근거: `00-B-execution-bundles.md` §5, `02-A §5`, `04-A`, `05-A`

## D-1 스키마 (migration 011, 멱등 확인)

- `knowledge`: document(+legacy anchor·processing_status) / document_chunk / document_entity / claim(+claim_type 8종·verification 6종) / claim_evidence / event(+dedupe_key)
- `content`: report_definition / report_run(+snapshot·model·pipeline version) / report(상태머신 draft→validating→approved→published→superseded→quarantined) / report_evidence
- `serving.latest_report_pointer` (원자 교체 대상)
- 워커·앱 role GRANT. embedding 컬럼은 model_registry 등록 후 별도 migration (차원 하드코딩 금지 원칙)

## D-2 문서 승격 (migration 012)

- `public.source_documents` 3,190 → `knowledge.document` **2,540 승격**
- 미이관 650건 = **전부 content-hash 중복 dedup** (의도됨: UNIQUE(source_id, content_hash) — 479건 선행 문서 승격, 171건 동일 그룹 내 타 문서 승격)
- raw_object_uri는 `legacy:pg-source_documents/{id}` 표기 (신규 수집분부터 실제 파일 URI)

## D-3 결정적 entity linking

| 방법 | 링크 | 문서 | 엔티티 |
|---|---|---|---|
| legacy_key (기존 entity_key 승계, conf 0.95) | 187 | 187 | 43 |
| alias_exact (KR 회사명 in 제목, conf 0.80) | 21 | 21 | 9 |
| symbol_exact (US 티커 word-boundary, conf 0.85) | 3 | 3 | 3 |

한계: 뉴스 제목만으로는 링크율이 낮음(rss 본문 미수집) — 본문 수집 확장 시 재실행으로 증가.

## D-4 market_signals 3분류 (13,738건)

| 분류 | 건수 | 처리 |
|---|---|---|
| 이벤트 승격 (sec_8k/insider/policy/analyst/disclosure) | **2,971** → knowledge.event | verification='unverified', metadata.provenance='legacy_no_document' — 근거 문서 없음을 명시 |
| 수치 신호 (magnitude 보유) | 4,236 → `v_signal_numeric` 뷰 | analytics feature 입력 전용, 지식 근거 아님 |
| 격리 (무근거 서술형) | 6,530 → `v_signal_quarantine` 뷰 | untrusted_legacy — 근거 수 집계 영구 제외 |

## D-5 LLM claim/event 추출 워커 (`run-knowledge-extraction.ts`)

- Gemini structured output, 04-A 계약 준수: predicate allowlist 12종 / claim_type 6종 / event_type 10종, **quote 원문 존재 검증(V1)**, mention은 결정적 해소기로 entity 매핑, 해소 실패 시 저장 거부
- 실측 (100 문서 apply): claims 29 추출 → **8 저장** (21 rejected: unresolved_subject — 게이트가 의도대로 무근거 저장 차단), events 28 추출 → **28 저장** (전부 문서 인용 보유)
- claim evidence coverage: **8/8 = 100%**

## D-6 발행 골격 (`run-report-publish.ts`)

- report_definition v1 시드(daily_market_stock) + 근거 우선 template 생성기(LLM 서술은 후속)
- hard gate 실측: 초안의 "매수/매도" 문구를 **action-advice 게이트가 실제 차단** → 문구 수정 후 통과 (게이트 동작 증명)
- 원자 발행 실측: 1회차 report#1 published → 2회차 report#2 published + report#1 **superseded** + pointer 원자 교체 — 상태머신·supersession 체인 동작
- 발행물 인용 커버리지: fact/reported_claim 블록 20개 중 **인용 누락 0**

## 게이트 요약

| 게이트 | 결과 |
|---|---|
| 문서 손실 0 (dedup 제외) | ✅ 650건 전수 원인 규명 |
| 사실형 문장 인용 100% | ✅ 20/20 |
| 무근거 claim 저장 0 | ✅ 21건 거부 실측 |
| 발행 원자성·supersession | ✅ 2회 발행 실측 |
| 멱등성 | ✅ migration 재실행 no-op |

## 남긴 것 (이월)

| 항목 | 사유 |
|---|---|
| RSS 본문 수집 확장 | 매체별 라이선스 게이트 (03-A §2.1) — 링크율·추출율 개선의 전제 |
| chunk + embedding | model_registry 임베딩 모델 등록 후 (02-A §5) |
| NLI(V2)·cross-source(V3) 검증 | 추출량 축적 후 — 현재 V1(schema+quote)만 가동 |
| LLM 서술 섹션·Evidence Pack 확장 | 발행 골격 위에 05-A §1 순차 적용 |
| 기존 briefing 파이프라인 병행→대체 | 2주 병행 후 판단 (00-B §5 D-5) |
| 추출 워커 정기 스케줄 | systemd 등록 = 별도 승인 |
| v1 리포트 조회 API | serving pointer 소비 라우트 — SET E API 트랜치와 함께 |
