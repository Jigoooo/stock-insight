import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useLayoutEffect, useReducer, useRef, type ReactNode } from 'react';

import styles from './workspace-view-region.module.css';
import {
  createWorkspaceViewState,
  reduceWorkspaceViewState,
} from './workspace-view-transition-state';
import { useMotionPreferences } from '@/shared/ui/motion/use-motion-preferences';

type WorkspaceViewRegionProps = {
  children: ReactNode;
  className?: string;
  viewKey: string;
};

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export function WorkspaceViewRegion({
  children,
  className,
  viewKey,
}: Readonly<WorkspaceViewRegionProps>) {
  const { reducedMotion } = useMotionPreferences();
  const [layers, updateLayers] = useReducer(
    reduceWorkspaceViewState<ReactNode>,
    createWorkspaceViewState(viewKey, children),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  const exitingRef = useRef<HTMLDivElement>(null);
  const transitionTokenRef = useRef(0);

  useLayoutEffect(() => {
    updateLayers({ layer: { content: children, key: viewKey }, type: 'sync' });
  }, [children, viewKey]);

  useGSAP(
    (_context, contextSafe) => {
      if (!contextSafe || !layers.exiting) return;
      const current = currentRef.current;
      const exiting = exitingRef.current;
      if (!current || !exiting) return;

      const activeKey = layers.active.key;
      const transitionToken = ++transitionTokenRef.current;
      const focusCurrent = contextSafe(() => {
        const focusTarget = current.querySelector<HTMLElement>('[data-workspace-view-heading]');
        (focusTarget ?? current).focus({ preventScroll: true });
      });
      const finish = contextSafe(() => {
        if (transitionTokenRef.current !== transitionToken) return;
        gsap.killTweensOf([current, exiting]);
        gsap.set([current, exiting], { clearProps: 'opacity,transform' });
        updateLayers({ activeKey, type: 'finish' });
      });

      gsap.killTweensOf([current, exiting]);
      focusCurrent();

      if (reducedMotion) {
        gsap.set([current, exiting], { opacity: 1, x: 0, y: 0 });
        gsap.to(current, { duration: 0, onComplete: finish });
      } else {
        gsap.fromTo(
          current,
          { opacity: 0, y: 6 },
          {
            duration: 0.22,
            ease: 'power2.out',
            opacity: 1,
            overwrite: 'auto',
            y: 0,
            onComplete: finish,
          },
        );
        gsap.to(exiting, {
          duration: 0.18,
          ease: 'power1.out',
          opacity: 0,
          overwrite: 'auto',
          x: -6,
        });
      }

      return () => {
        transitionTokenRef.current += 1;
        gsap.killTweensOf([current, exiting]);
        gsap.set([current, exiting], { clearProps: 'opacity,transform' });
      };
    },
    {
      dependencies: [layers.active.key, layers.exiting?.key, reducedMotion],
      revertOnUpdate: true,
      scope: rootRef,
    },
  );

  return (
    <div ref={rootRef} className={classNames(styles.region, className)} data-workspace-view-region>
      {layers.exiting ? (
        <div
          key={layers.exiting.key}
          ref={exitingRef}
          className={classNames(styles.layer, styles.exitingLayer)}
          data-workspace-view-layer="exiting"
          aria-hidden="true"
          inert
        >
          {layers.exiting.content}
        </div>
      ) : null}
      <div
        key={layers.active.key}
        ref={currentRef}
        className={styles.layer}
        data-workspace-view-layer="current"
        tabIndex={-1}
      >
        {layers.active.content}
      </div>
    </div>
  );
}
