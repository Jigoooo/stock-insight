import { Archive, BookOpen, Copy, GitBranch, Info, Menu, MousePointer2 } from 'lucide-react';
import { Fragment, useState, type ReactElement } from 'react';

import styles from './menu-overlay-catalog.module.css';
import {
  menuOverlayVariants,
  panels,
  researchActions,
  resolveResearchActionResult,
  type ResearchAction,
} from './menu-overlay-model';

import { Button } from '@/shared/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/menu-overlay';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/ui/sheet';

function ActionIcon({ action }: { action: ResearchAction }): ReactElement {
  const iconProps = { 'aria-hidden': true, size: 15 } as const;

  switch (action.id) {
    case 'evidence':
      return <BookOpen {...iconProps} />;
    case 'impact':
      return <GitBranch {...iconProps} />;
    case 'copy-link':
      return <Copy {...iconProps} />;
    case 'archived':
      return <Archive {...iconProps} />;
  }
}

export function MenuOverlayCatalog(): ReactElement {
  const [lastAction, setLastAction] = useState<string | null>(null);

  const runAction = (action: ResearchAction) => {
    const result = resolveResearchActionResult(action);
    if (result) setLastAction(result);
  };

  return (
    <section
      aria-labelledby="menu-overlay-title"
      className={styles.catalog}
      data-slot="menu-overlay-catalog"
    >
      <header className={styles.catalogHeader}>
        <div>
          <span>04 · Menu & Overlay</span>
          <h2 id="menu-overlay-title">하나의 언어, 여섯 개 표면</h2>
        </div>
        <p>같은 리서치 액션과 패널 내용을 유지한 채 경계, 표면, 정보 밀도만 비교합니다.</p>
      </header>

      <div className={styles.variantGrid}>
        {menuOverlayVariants.map((variant) => {
          const variantCode = variant.label.slice(0, 1);

          return (
            <article className={styles.variantCard} data-variant={variant.id} key={variant.id}>
              <header>
                <span>{variant.label}</span>
                <h3>{variant.description}</h3>
              </header>

              <section className={styles.previewGroup} aria-label={`${variant.label} 메뉴 비교`}>
                <div className={styles.groupHeading}>
                  <span>Menu</span>
                  <small>동일 액션 공유</small>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label={`DropdownMenu ${variantCode} 열기`}
                      className={styles.previewTrigger}
                      variant="outline"
                    >
                      <Menu aria-hidden="true" size={16} />
                      DropdownMenu
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent variant={variant.id}>
                    {researchActions.map((action, index) => (
                      <Fragment key={action.id}>
                        {index === researchActions.length - 1 ? <DropdownMenuSeparator /> : null}
                        <DropdownMenuItem
                          disabled={'disabled' in action && action.disabled}
                          shortcut={action.shortcut || undefined}
                          onSelect={() => runAction(action)}
                        >
                          <ActionIcon action={action} />
                          <span>{action.label}</span>
                        </DropdownMenuItem>
                      </Fragment>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <button
                      aria-label={`ContextMenu ${variantCode} 대상`}
                      className={styles.contextTarget}
                      type="button"
                    >
                      <MousePointer2 aria-hidden="true" size={16} />
                      <span>ContextMenu 대상</span>
                      <small>우클릭 · Shift+F10</small>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent variant={variant.id}>
                    {researchActions.map((action, index) => (
                      <Fragment key={action.id}>
                        {index === researchActions.length - 1 ? <ContextMenuSeparator /> : null}
                        <ContextMenuItem
                          disabled={'disabled' in action && action.disabled}
                          shortcut={action.shortcut || undefined}
                          onSelect={() => runAction(action)}
                        >
                          <ActionIcon action={action} />
                          <span>{action.label}</span>
                        </ContextMenuItem>
                      </Fragment>
                    ))}
                  </ContextMenuContent>
                </ContextMenu>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      aria-label={`Popover ${variantCode} 열기`}
                      className={styles.previewTrigger}
                      variant="outline"
                    >
                      <Info aria-hidden="true" size={16} />
                      Popover
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent variant={variant.id}>
                    <span className={styles.popoverLabel}>선택 근거</span>
                    <strong className={styles.popoverTitle}>삼성전자</strong>
                    <p className={styles.popoverCopy}>
                      최근 공시와 시장 변화를 같은 기준 시점으로 확인합니다.
                    </p>
                  </PopoverContent>
                </Popover>
              </section>

              <section className={styles.previewGroup} aria-label={`${variant.label} 패널 비교`}>
                <div className={styles.groupHeading}>
                  <span>Panel</span>
                  <small>같은 내용 · 다른 진입 방향</small>
                </div>
                <div className={styles.panelTriggers}>
                  {panels.map((panel) => (
                    <Sheet key={panel.kind}>
                      <SheetTrigger asChild>
                        <Button
                          aria-label={`${panel.label} ${variantCode} 열기`}
                          className={styles.panelTrigger}
                          variant="outline"
                        >
                          {panel.label}
                        </Button>
                      </SheetTrigger>
                      <SheetContent
                        className={styles.panelContent}
                        data-overlay-kind={panel.kind}
                        side={panel.side}
                        variant={variant.id}
                      >
                        <SheetHeader>
                          <span className={styles.panelEyebrow}>{variant.label}</span>
                          <SheetTitle>{panel.label} · 선택 근거</SheetTitle>
                          <SheetDescription>
                            최근 공시와 시장 변화를 같은 기준 시점으로 확인합니다.
                          </SheetDescription>
                        </SheetHeader>
                        <div className={styles.panelBody}>
                          <strong>삼성전자</strong>
                          <dl>
                            <div>
                              <dt>근거</dt>
                              <dd>최근 공시 3건</dd>
                            </div>
                            <div>
                              <dt>영향 경로</dt>
                              <dd>반도체 · 공급망</dd>
                            </div>
                          </dl>
                        </div>
                      </SheetContent>
                    </Sheet>
                  ))}
                </div>
              </section>
            </article>
          );
        })}
      </div>

      <p aria-live="polite" className={styles.result} data-slot="menu-overlay-result">
        {lastAction ?? '아직 실행한 메뉴 액션이 없습니다.'}
      </p>
    </section>
  );
}
