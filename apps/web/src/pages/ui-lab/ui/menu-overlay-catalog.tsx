import type { ReactElement } from 'react';

export function MenuOverlayCatalog(): ReactElement {
  return (
    <section aria-labelledby="menu-overlay-title" data-slot="menu-overlay-catalog">
      <h2 id="menu-overlay-title">Menu & Overlay</h2>
      <p>메뉴와 패널 오버레이의 세 가지 디자인 언어를 비교합니다.</p>
    </section>
  );
}
