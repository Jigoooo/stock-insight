import { Maximize2, PanelRight } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import styles from './detail-inspector-frame.module.css';

import {
  clampDetailInspectorWidth,
  detailInspectorDefaultWidth,
  detailInspectorMaxWidth,
  detailInspectorMinWidth,
  parseStoredDetailInspectorWidth,
} from '@/pages/research-workspace/model/detail-inspector-layout';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';

export type DetailInspectorPresentation = 'drawer' | 'modal' | 'mobile';

type DetailInspectorFrameProps = {
  bodyClassName?: string;
  children: (presentation: DetailInspectorPresentation) => ReactNode;
  closeLabel: string;
  description: string;
  detailKey: string | null;
  mobile: boolean;
  onClose: () => void;
  open: boolean;
  resizerLabel: string;
  storageKey: string;
  testId: string;
  title: string;
  titleIcon: ReactNode;
};

export function DetailInspectorFrame({
  bodyClassName,
  children,
  closeLabel,
  description,
  detailKey,
  mobile,
  onClose,
  open,
  resizerLabel,
  storageKey,
  testId,
  title,
  titleIcon,
}: DetailInspectorFrameProps) {
  const [desktopPresentation, setDesktopPresentation] = useState<'drawer' | 'modal'>('drawer');
  const [drawerWidth, setDrawerWidth] = useState(detailInspectorDefaultWidth);
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef<{
    pointerId: number;
    startWidth: number;
    startX: number;
  } | null>(null);
  const presentation: DetailInspectorPresentation = mobile ? 'mobile' : desktopPresentation;
  const dialogPresentation = mobile
    ? 'bottom-sheet'
    : desktopPresentation === 'modal'
      ? 'modal'
      : 'inspector';

  useEffect(() => {
    if (!open) return;
    const resetFrame = window.requestAnimationFrame(() => setDesktopPresentation('drawer'));
    return () => window.cancelAnimationFrame(resetFrame);
  }, [detailKey, open]);

  const commitDrawerWidth = useCallback(
    (nextWidth: number) => {
      const clamped = clampDetailInspectorWidth(nextWidth, window.innerWidth);
      setDrawerWidth(clamped);
      try {
        window.sessionStorage.setItem(storageKey, String(clamped));
      } catch {
        // The in-memory width remains usable in privacy-restricted contexts.
      }
    },
    [storageKey],
  );

  useEffect(() => {
    let restoreFrame = 0;
    try {
      const storedWidth = parseStoredDetailInspectorWidth(
        window.sessionStorage.getItem(storageKey),
        window.innerWidth,
      );
      restoreFrame = window.requestAnimationFrame(() => setDrawerWidth(storedWidth));
    } catch {
      // The default width already covers storage-restricted contexts.
    }
    return () => window.cancelAnimationFrame(restoreFrame);
  }, [storageKey]);

  useEffect(() => {
    const clampToViewport = () => {
      setDrawerWidth((current) => clampDetailInspectorWidth(current, window.innerWidth));
    };
    window.addEventListener('resize', clampToViewport);
    return () => window.removeEventListener('resize', clampToViewport);
  }, []);

  const finishResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    resizeRef.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <Dialog
      modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setDesktopPresentation('drawer');
          onClose();
        }
      }}
    >
      <DialogContent
        className={styles.inspector}
        closeLabel={closeLabel}
        composition="detail"
        data-inspector-presentation={presentation}
        data-resizing={resizing || undefined}
        data-testid={testId}
        portalled
        presentation={dialogPresentation}
        showOverlay
        motionPreset="quick"
        overlayTone="light"
        size="lg"
        style={{ '--detail-inspector-width': `${drawerWidth}px` } as CSSProperties}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {!mobile && desktopPresentation === 'drawer' && (
          <div
            aria-label={resizerLabel}
            aria-orientation="vertical"
            aria-valuemax={detailInspectorMaxWidth}
            aria-valuemin={detailInspectorMinWidth}
            aria-valuenow={drawerWidth}
            className={styles.inspectorResizer}
            role="separator"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') {
                event.preventDefault();
                commitDrawerWidth(drawerWidth + 16);
              }
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                commitDrawerWidth(drawerWidth - 16);
              }
            }}
            onPointerCancel={finishResize}
            onPointerDown={(event) => {
              resizeRef.current = {
                pointerId: event.pointerId,
                startWidth: drawerWidth,
                startX: event.clientX,
              };
              setResizing(true);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = resizeRef.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              commitDrawerWidth(drag.startWidth - (event.clientX - drag.startX));
            }}
            onPointerUp={finishResize}
          />
        )}
        <DialogHeader className={styles.inspectorHeader}>
          <DialogTitle asChild>
            <strong className={styles.inspectorTitle}>
              {titleIcon}
              <span>{title}</span>
            </strong>
          </DialogTitle>
          <DialogDescription className={styles.inspectorDescription}>
            {description}
          </DialogDescription>
          {!mobile && (
            <Button
              className={styles.inspectorPresentationToggle}
              motion="quiet"
              size="sm"
              type="button"
              variant="secondary"
              onClick={() =>
                setDesktopPresentation((current) => (current === 'drawer' ? 'modal' : 'drawer'))
              }
            >
              {desktopPresentation === 'drawer' ? (
                <>
                  <Maximize2 aria-hidden="true" />
                  <span>넓게 보기</span>
                </>
              ) : (
                <>
                  <PanelRight aria-hidden="true" />
                  <span>옆에서 보기</span>
                </>
              )}
            </Button>
          )}
        </DialogHeader>
        <DialogBody className={bodyClassName} data-inspector-presentation={presentation}>
          {children(presentation)}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
