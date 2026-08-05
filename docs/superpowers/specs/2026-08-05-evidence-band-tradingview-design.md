# Evidence Band TradingView 전환 설계

## 결정

Evidence Band A/B/C의 가격선, 근거 marker, 조건 구간을 모두 TradingView Lightweight Charts의 동일 좌표계 안에서 렌더링한다. 기존 Bklit 기반 Evidence Band와 HTML 차트 내부 범례는 폐기한다.

## 구성

- 가격 경로: TradingView `AreaSeries`
- 사건 근거: `createSeriesMarkers`
- 시간+가격 조건 구간: series primitive가 canvas에 직접 렌더링
- 조건 구간 라벨: 구간 이름과 실제 하한·상한 가격을 같은 primitive canvas에 표시
- 선택 근거: native price line·가격축 라벨·고정 crosshair로 사건 시점의 가격을 연결
- 근거 목록: 키보드 접근과 상세 문맥을 위한 차트 외부 제어면으로 유지
- A/B/C: 동일 데이터와 선택 상태를 공유하되 grid, 선 굵기, marker 강조, 목록 배치만 다르게 유지

## 경계

Market Tape의 Bklit 구현과 Candle Ledger의 TradingView 구현은 변경하지 않는다. Evidence Band A/B/C는 모두 사용자 채택되었으며, 디테일 보강과 검증 이후 공개 chart API와 제품 사용처 감사를 진행한다.

## 접근성·모바일

canvas만으로 내용을 전달하지 않도록 근거 목록과 데이터 표를 유지한다. 390px에서는 차트와 근거 목록을 세로로 쌓고 수평 overflow를 만들지 않는다.
