import type { HTMLAttributes } from 'react';

import styles from './research-workspace-shell.module.css';

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export function ResearchWorkspaceShell({
  children,
  className,
  ...props
}: Readonly<HTMLAttributes<HTMLElement>>) {
  return (
    <main className={classNames(styles.shell, className)} data-workspace-shell {...props}>
      {children}
    </main>
  );
}
