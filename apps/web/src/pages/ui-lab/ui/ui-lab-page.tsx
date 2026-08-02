import { InputActionCatalog } from './input-action-catalog';
import { NavigationTabsCatalog } from './navigation-tabs-catalog';
import styles from './ui-lab-page.module.css';

const futureBatches = ['메뉴와 오버레이', '데이터와 피드백'];

export function UiLabPage() {
  return (
    <main className={styles.page} data-testid="ui-lab-page">
      <section className={styles.shell} aria-labelledby="ui-lab-title">
        <header className={styles.header}>
          <p className={styles.kicker}>Market Graphite</p>
          <h1 id="ui-lab-title">Stock Insight UI Lab</h1>
          <p>제품 화면과 분리된 공용 컴포넌트 목업 비교 공간입니다.</p>
        </header>
        <InputActionCatalog />
        <NavigationTabsCatalog />
        <div className={styles.grid} aria-label="향후 배치">
          {futureBatches.map((batch, index) => (
            <article className={styles.placeholder} key={batch}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{batch}</strong>
              <small>향후 배치에서 시안을 비교합니다.</small>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
