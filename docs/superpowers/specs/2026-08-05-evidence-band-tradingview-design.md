# Evidence Band TradingView 전환 설계

## 결정

Evidence Band A/B/C의 가격선, 근거 marker, 조건 구간을 모두 TradingView Lightweight Charts의 동일 좌표계 안에서 렌더링한다. 기존 Bklit 기반 Evidence Band와 HTML 차트 내부 범례는 폐기한다.

## 구성

- 가격 경로: TradingView `AreaSeries`
- 사건 근거: `createSeriesMarkers`
- 시간+가격 조건 구간: series primitive가 canvas에 직접 렌더링
- 근거 목록: 키보드 접근과 상세 문맥을 위한 차트 외부 제어면으로 유지
- A/B/C: 동일 데이터와 선택 상태를 공유하되 grid, 선 굵기, marker 강조, 목록 배치만 다르게 유지

## 경계

Market Tape의 Bklit 구현과 Candle Ledger의 TradingView 구현은 변경하지 않는다. 이번 전환은 UI Lab 목업이며 사용자 시각 승인 전에는 공개 chart API나 제품 화면에 연결하지 않는다.

## 접근성·모바일

canvas만으로 내용을 전달하지 않도록 근거 목록과 데이터 표를 유지한다. 390px에서는 차트와 근거 목록을 세로로 쌓고 수평 overflow를 만들지 않는다.
