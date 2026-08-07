# Research & Source Anchors

> Status: **REFERENCE / VERIFY AGAIN AT IMPLEMENTATION TIME**
> These anchors were frozen from the 2026-08-07 master design. Source availability, pricing, licensing, quota and API shape must be re-verified before implementation.

# Part XXII. References / Research Anchors

이 문서는 특정 논문 하나를 그대로 구현하지 않는다. 아래 자료는 방법 선택의 연구·표준 anchor다.

### Provenance / Ontology / Identity

- W3C, **PROV-O: The PROV Ontology** — provenance/derivation 표준 참고.
- EDM Council, **Financial Industry Business Ontology (FIBO)** — 금융 개념 mapping 참고.
- GLEIF, **LEI Level 2 Relationship Data** — legal-entity parent/relationship 보강.
- XBRL International, **XBRL 2.1 / Dimensions** — financial facts의 unit, period, dimensions 구조.

### Official Data Infrastructure

- U.S. SEC, **EDGAR APIs / Company Facts** — submissions 및 XBRL data.
- Federal Reserve Bank of St. Louis, **FRED Real-Time Period / Vintage Dates** — PIT macro data.
- OECD, **Inter-Country Input-Output (ICIO) Tables** — 글로벌 production/trade flow.

### Financial KG / Event / Recommendation Research

- **Agentic Construction and Evaluation of Financial Knowledge Graphs**, arXiv:2508.17906 — SEC 10-K 기반 schema-guided KG construction.
- **FinKario: Event-Enhanced Automated Construction of Financial Knowledge Graph**, arXiv:2508.00961 — event-enhanced financial KG/RAG.
- **THEME: Enhancing Thematic Investing with Semantic Stock Representations and Temporal Dynamics**, arXiv:2508.16936 — semantic theme representation + temporal market dynamics.
- **StockMem: An Event-Reflection Memory Framework for Stock Prediction**, arXiv:2512.02720 — structured event sequence memory / historical event retrieval 연구 참고.
- **Parallel and Multi-Stage Knowledge Graph Retrieval for Behaviorally Aligned Financial Asset Recommendations**, arXiv:2511.11583 — market/user KG를 분리한 recommendation retrieval 참고.
- **Can News Predict the Market? Limits of Zero-Shot Financial NLP and the Role of Explainable AI**, arXiv:2606.12210 — zero-shot news signal의 한계와 uncertainty/explainability 중요성 참고.
- **Modeling the Evolutionary Modes of Financial Markets**, arXiv:2602.11918 — narrative evolution을 시장 동학으로 보는 연구 트랙 참고.
- **A Statistical Framework for Detecting Emergent Narratives**, arXiv:2602.20939 — narrative emergence/change detection 연구 참고.

- **Point-in-Time Financial RAG with Frozen LLMs and Market-Feedback Adaptive Retrieval**, arXiv:2605.31201 — evidence utility를 event type·horizon·market context별로 학습하는 source-memory 연구 참고.
- **TRACE: Temporal Rule-Anchored Chain-of-Evidence on Knowledge Graphs for Interpretable Stock Movement Prediction**, arXiv:2603.12500 — temporally valid typed path와 explicit evidence chain 연구 참고.
- **Towards Better Evolution Modeling for Temporal Knowledge Graphs**, arXiv:2602.08353 — co-occurrence shortcut, knowledge obsolescence, temporal benchmark 편향 경고.
- **Deep FinResearch Bench**, arXiv:2604.21006 — 전문 투자 리서치의 qualitative rigor·quantitative forecasting/valuation·claim verifiability 평가 축 참고.
- **FrontierFinance**, arXiv:2604.05912 — 3-statement/DCF/lender 등 장기 금융모델의 구조적 일관성과 expert-rubric 평가 참고.
- **When Summaries Distort Decisions: Information Fidelity in LLM-Compressed Financial Analysis**, arXiv:2606.29251 — 요약이 의사결정 관련 증거를 선택적으로 소실할 수 있다는 fidelity gate 연구 참고.
- **Reflexivity as Prompt**, arXiv:2606.00061 — 가격과 펀더멘털의 양방향 feedback을 별도 모델링해야 하는 연구 트랙 참고.
- **Detecting Unusual Trading Patterns on Cryptocurrency Exchanges by Means of Complexity Measures**, arXiv:2607.13916 — 거래소별 시장데이터 이상/인위적 거래 가능성에 대한 venue-quality 탐지 참고.
- **Can LLM-based Financial Investing Strategies Outperform the Market in Long Run?**, KDD 2026 / arXiv:2505.07078 — 긴 기간·넓은 universe·regime-aware 평가와 survivorship/look-ahead/data-snooping 통제 참고.

### Method Families

- Event Study
- Local Projections
- Difference-in-Differences
- Synthetic Control
- Double/Debiased Machine Learning
- Input-Output / Leontief production network
- Bayesian/Markov regime models and online change-point detection
- Conformal prediction / sequential calibration
- PathSim / NBFNet / HGT / TGN — candidate ranking only

---

## 217. 최근 연구에서 가져온 경고

이번 Red-Team은 특정 논문 하나를 설계 정답으로 사용하지 않는다. 다만 다음 연구는 현재 architecture gate가 왜 필요한지를 지지하는 **경고용 anchor**로 사용한다.

- **Fin-RATE (arXiv:2602.07294)**: 단일 문서보다 longitudinal/cross-entity 금융 분석에서 time/entity mismatch와 comparison hallucination이 크게 어려워짐. 따라서 Metric Comparability, Temporal Query Kernel, Entity/Claim identity를 별도 gate로 둔다.
- **FinTradeBench (arXiv:2603.19225)**: textual fundamentals retrieval만 좋아져도 trading-signal/time-series reasoning 문제가 자동 해결되지 않음. 따라서 LLM retrieval과 quantitative market-state engine을 분리한다.
- **Towards Better Evolution Modeling for Temporal Knowledge Graphs (arXiv:2602.08353)**: temporal benchmark에서도 단순 co-occurrence shortcut이 강하게 작동할 수 있음을 보여준다. Graph ML은 anti-shortcut baseline을 반드시 통과해야 한다.
- **FinAbstain (arXiv:2607.24875)**: 금융 의사결정에서 point answer보다 calibration·risk-coverage·abstention을 함께 평가하는 방향을 참고한다. 본 설계의 `INSUFFICIENT_DATA`와 Product Safety State를 강화하는 근거다.

이 연구들은 제품 성능 보증이 아니라 **검증 항목을 설계하는 참고자료**다.

---

# Part XLIV. 4차 Red-Team 이후 최종 구조 축약

# Part LVI. 5차 검증에 사용한 2026-08-07 Source Anchors

이 목록은 vendor lock-in 계약이 아니라 **2026-08-07에 실제 이용 가능성이 확인된 source family의 anchor**다. 실제 구현 시 약관·가격·quota·endpoint를 다시 확인한다.

## 미국/글로벌 공시·시장

- SEC EDGAR APIs — https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- SEC data APIs — https://data.sec.gov/
- FINRA Developer Center — https://developer.finra.org/docs
- FINRA Short Sale Volume — https://www.finra.org/finra-data/browse-catalog/short-sale-volume-data
- OCC Open Interest — https://www.theocc.com/market-data/market-data-reports/volume-and-open-interest/open-interest
- Cboe Historical Options — https://www.cboe.com/us/options/market_statistics/historical_data/
- CFTC COT — https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm

## 한국

- OpenDART — https://opendart.fss.or.kr/
- KRX Data Marketplace — https://data.krx.co.kr/
- 금융위원회 기업기본정보 — https://www.data.go.kr/data/15043184/openapi.do
- 금융위원회 공시정보 — https://www.data.go.kr/data/15059649/openapi.do
- 금융위원회 주식발행정보 — https://www.data.go.kr/data/15043423/openapi.do
- KOSIS — https://kosis.kr/
- ECOS — https://ecos.bok.or.kr/

## 법·정책·제재

- Federal Register API — https://www.federalregister.gov/developers/documentation/api/v1
- Regulations.gov API — https://open.gsa.gov/api/regulationsgov/
- OFAC Sanctions List Service — https://ofac.treasury.gov/sanctions-list-service
- BIS — https://www.bis.gov/
- 국가법령정보 공동활용 — https://open.law.go.kr/LSO/openApi/guideList.do
- EUR-Lex Webservice — https://eur-lex.europa.eu/content/help/data-reuse/webservice.html

## 거시

- FRED/ALFRED — https://fred.stlouisfed.org/docs/api/fred/
- BLS API — https://www.bls.gov/developers/home.htm
- BEA API — https://apps.bea.gov/api/signup/
- U.S. Fiscal Data API — https://fiscaldata.treasury.gov/api-documentation/
- IMF API — https://data.imf.org/en/Resource-Pages/IMF-API
- ECB Data Portal API — https://data.ecb.europa.eu/help/api/overview
- Eurostat API — https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access
- World Bank API — https://api.worldbank.org/

## 법인·무역·정부수요

- GLEIF API — https://www.gleif.org/en/lei-data/gleif-api
- UN Comtrade — https://comtradeapi.un.org/
- OECD ICIO — https://www.oecd.org/en/data/datasets/inter-country-input-output-tables.html
- USAspending API — https://api.usaspending.gov/
- SAM.gov Opportunities API — https://open.gsa.gov/api/get-opportunities-public-api/

## Domain/Physical

- ClinicalTrials.gov API — https://clinicaltrials.gov/data-api/api
- openFDA — https://open.fda.gov/apis/drug/
- EIA Open Data — https://www.eia.gov/opendata/
- USPTO Open Data Portal — https://data.uspto.gov/
- USGS Earthquake API — https://earthquake.usgs.gov/fdsnws/event/1/
- NASA FIRMS — https://firms.modaps.eosdis.nasa.gov/api/
- NOAA NCEI — https://www.ncei.noaa.gov/support/access-data-service-api-user-documentation

## Crypto/Software

- Ethereum JSON-RPC — https://ethereum.org/developers/docs/apis/json-rpc/
- Solana RPC docs — https://solana.com/docs/rpc
- Coin Metrics API — https://docs.coinmetrics.io/api/v4/
- CoinGecko API — https://docs.coingecko.com/
- GitHub REST API — https://docs.github.com/en/rest

## Commercial expectation anchors

- FactSet Estimates API — https://developer.factset.com/api-catalog/factset-estimates-api
- LSEG Estimates API — https://developers.lseg.com/en/api-catalog/refinitiv-data-platform/estimates-API
- S&P Capital IQ Estimates — https://www.spglobal.com/market-intelligence/en/solutions/capital-iq-estimates

---

