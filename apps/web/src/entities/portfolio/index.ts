/*
  가짜 데이터가 이 배럴의 **첫 export** 였다 — `export { stocks } from
  './data/mock-stocks'`. 공개 API 뒤에 mock 이 서 있으면 새로 오는 사람이
  그것을 진짜 데이터로 읽고 import 한다. 실제로 그 일이 있었다:
  `pages/dashboard/model/dashboard-bootstrap.ts` 가 네 mock 을 전부 불러
  실제 contract 스키마로 parse 하고 있었고, 그래서 진짜처럼 보였다.

  그 유일한 소비자가 죽은 트리 안에 있었으므로 mock 과 함께 지웠다. 남은 것은
  타입뿐이다.
*/
export type { PortfolioSnapshot } from './model/types';
