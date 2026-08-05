# Evidence Band TradingView 전환 실행 계획

1. Evidence 전용 TradingView 내부 어댑터를 추가한다.
2. 사건은 native series marker, 조건 구간은 series primitive로 같은 chart pane에 렌더링한다.
3. Evidence Band A/B/C를 새 어댑터로 교체하고 Bklit Evidence 전용 코드를 제거한다.
4. 소스 계약, 기존 차트 Playwright 3건, typecheck와 변경 파일 정적 검사를 수행한다.
5. UI Lab에서 데스크톱·390px 실제 화면을 확인하고 진행 원장에 결과를 기록한다.
