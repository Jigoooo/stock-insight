import styles from './workspace.module.css';

function formatAsOf(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export function PageHeader({
  eyebrow,
  title,
  description,
  asOf,
}: Readonly<{
  eyebrow?: string;
  title: string;
  description?: string;
  asOf?: string | null;
}>) {
  return (
    <header className={styles.pageHeader}>
      <div>
        {eyebrow ? <span>{eyebrow}</span> : null}
        <h1 data-workspace-view-heading tabIndex={-1}>
          {title}
        </h1>
        {description ? <p>{description}</p> : null}
      </div>
      {asOf ? (
        <time dateTime={asOf}>
          기준 시각<strong>{formatAsOf(asOf)}</strong>
        </time>
      ) : null}
    </header>
  );
}
