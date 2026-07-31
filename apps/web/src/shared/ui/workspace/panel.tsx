import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import styles from './workspace.module.css';

import { cn } from '@/shared/lib/utils';
import { Card, CardHeader } from '@/shared/ui/card';

type SurfaceElement = 'aside' | 'section';

type PanelProps = HTMLAttributes<HTMLElement> & {
  as?: SurfaceElement;
  children: ReactNode;
};

export const Panel = forwardRef<HTMLElement, PanelProps>(function Panel(
  { as = 'section', children, className, ...props },
  ref,
) {
  const Component = as;
  return (
    <Component
      ref={ref}
      className={cn(styles.panel, className)}
      data-workspace-panel="true"
      {...props}
    >
      <Card className={styles.panelCard}>{children}</Card>
    </Component>
  );
});

export const DetailSurface = forwardRef<HTMLElement, PanelProps>(function DetailSurface(
  { as = 'aside', children, className, ...props },
  ref,
) {
  const Component = as;
  return (
    <Component
      ref={ref}
      className={cn(styles.detailSurface, className)}
      data-workspace-detail-surface="true"
      {...props}
    >
      <Card className={styles.detailCard}>{children}</Card>
    </Component>
  );
});

export function PanelHeader({
  as = 'header',
  children,
  className,
  meta,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'header';
  children: ReactNode;
  meta?: ReactNode;
}) {
  const Component = as;
  return (
    <Component {...props}>
      <CardHeader className={cn(styles.panelHeader, className)}>
        <div>{children}</div>
        {meta ? <div className={styles.panelHeaderMeta}>{meta}</div> : null}
      </CardHeader>
    </Component>
  );
}
