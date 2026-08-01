import { getLiveDataEnvironmentLabel } from './live-data-environment';
import styles from './live-data-environment.module.css';

export function LiveDataEnvironmentBanner() {
  const label = getLiveDataEnvironmentLabel(import.meta.env.VITE_STOCK_INSIGHT_DATA_ENV);
  if (!label) return null;

  return (
    <output className={styles.banner} aria-label="운영 DB 실제 쓰기 환경">
      <strong>{label.environment}</strong>
      <span aria-hidden="true">·</span>
      <span>{label.writeMode}</span>
    </output>
  );
}
