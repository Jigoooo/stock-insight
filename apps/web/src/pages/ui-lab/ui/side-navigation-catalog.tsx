import { motion } from 'motion/react';
import { useState } from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';

import styles from './side-navigation-catalog.module.css';

import type { RouteTabId } from './navigation-tabs-catalog';

const panelItems = [
  {
    id: 'summary',
    label: '리서치 요약',
    title: '핵심 리서치',
    body: '오늘 확인할 근거와 연결된 기업을 한 곳에서 정리합니다.',
  },
  {
    id: 'evidence',
    label: '근거 기록',
    title: '근거와 출처',
    body: '판단에 사용한 기사와 공시의 맥락을 다시 확인합니다.',
  },
  {
    id: 'company',
    label: '기업 메모',
    title: '기업별 메모',
    body: '종목별로 남긴 관찰과 확인할 리스크를 이어서 봅니다.',
  },
] as const;

const routeItems = [
  { id: 'today', label: '오늘', summary: '오늘의 리서치 흐름' },
  { id: 'holdings', label: '보유 종목', summary: '보유 기업과 연결된 근거' },
  { id: 'themes', label: '테마', summary: '시장 테마와 기업 연결' },
] as const;

export type SideRouteId = (typeof routeItems)[number]['id'];

const tabVariants = [
  {
    id: 'hairline-rail',
    label: 'A · Hairline Rail',
    title: '세로 레일',
    description: '얇은 기준선과 짧은 선택선만 남기는 가장 가벼운 패널 전환입니다.',
  },
  {
    id: 'soft-inset',
    label: 'B · Soft Inset',
    title: '낮은 선택 면',
    description: '낮은 배경 안에서 선택 면이 이동해 현재 패널을 빠르게 구분합니다.',
  },
  {
    id: 'framed-stack',
    label: 'C · Framed Stack',
    title: '연속 셀',
    description: '연속된 셀로 경계를 분명히 하되 카드처럼 분절되지 않게 유지합니다.',
  },
] as const;

const listVariants = [
  {
    id: 'quiet-rows',
    label: 'A · Quiet Rows',
    title: '조용한 행',
    description: '행 사이의 얇은 선과 현재 경로의 명도 차이만 사용하는 목록입니다.',
  },
  {
    id: 'soft-surface',
    label: 'B · Soft Surface',
    title: '낮은 표면',
    description: '하나의 낮은 표면 안에 경로를 묶고 현재 위치만 면으로 구분합니다.',
  },
  {
    id: 'compact-rail',
    label: 'C · Compact Rail',
    title: '압축 레일',
    description: '좁은 사이드바를 위해 여백을 줄이고 왼쪽 레일로 현재 경로를 표시합니다.',
  },
] as const;

interface SideNavigationCatalogProps {
  initialRouteTab: RouteTabId;
  initialSideRoute: SideRouteId;
}

export function SideNavigationCatalog({
  initialRouteTab,
  initialSideRoute,
}: SideNavigationCatalogProps) {
  const [activePanel, setActivePanel] = useState<(typeof panelItems)[number]['id']>('summary');

  return (
    <section className={styles.catalog} aria-labelledby="side-navigation-title">
      <header className={styles.catalogHeader}>
        <div>
          <span>Batch 3B · Side Navigation</span>
          <h2 id="side-navigation-title">Side Tab · Side List</h2>
        </div>
        <p>패널 전환과 경로 이동을 나누고 같은 정보 밀도에서 표면 차이만 비교합니다.</p>
      </header>

      <section
        className={styles.comparison}
        data-catalog="side-tabs"
        aria-labelledby="side-tabs-title"
      >
        <header className={styles.comparisonHeading}>
          <h3 id="side-tabs-title">같은 화면의 패널 전환</h3>
          <p>선택 상태만 바뀌며 현재 URL은 유지됩니다.</p>
        </header>

        <div className={styles.comparisonGrid}>
          {tabVariants.map((variant) => (
            <article className={styles.variantCard} data-variant={variant.id} key={variant.id}>
              <header>
                <span>{variant.label}</span>
                <h4>{variant.title}</h4>
                <p>{variant.description}</p>
              </header>
              <div className={styles.previewSurface}>
                <TabsPrimitive.Root
                  className={styles.sideTabFrame}
                  orientation="vertical"
                  value={activePanel}
                  onValueChange={(value) =>
                    setActivePanel(value as (typeof panelItems)[number]['id'])
                  }
                >
                  <TabsPrimitive.List
                    className={styles.sideTabList}
                    aria-label={`패널 전환 · ${variant.title}`}
                  >
                    {panelItems.map((item) => (
                      <TabsPrimitive.Trigger
                        className={styles.sideTab}
                        key={item.id}
                        value={item.id}
                      >
                        {activePanel === item.id ? (
                          <motion.span
                            aria-hidden="true"
                            className={styles.activeIndicator}
                            layoutId={`side-tab-indicator-${variant.id}`}
                            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
                          />
                        ) : null}
                        <span>{item.label}</span>
                      </TabsPrimitive.Trigger>
                    ))}
                  </TabsPrimitive.List>

                  {panelItems.map((item) => (
                    <TabsPrimitive.Content className={styles.panel} key={item.id} value={item.id}>
                      <motion.div
                        key={`${variant.id}-${item.id}`}
                        initial={{ opacity: 0, y: 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.16, ease: 'easeOut' }}
                      >
                        <span>현재 패널</span>
                        <strong>{item.title}</strong>
                        <p>{item.body}</p>
                      </motion.div>
                    </TabsPrimitive.Content>
                  ))}
                </TabsPrimitive.Root>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        className={styles.comparison}
        data-catalog="side-lists"
        aria-labelledby="side-lists-title"
      >
        <header className={styles.comparisonHeading}>
          <h3 id="side-lists-title">실제 경로 이동</h3>
          <p>각 항목은 직접 열 수 있는 링크이며 현재 경로를 다시 진입해도 유지합니다.</p>
        </header>

        <div className={styles.comparisonGrid}>
          {listVariants.map((variant) => {
            const currentRoute =
              routeItems.find((item) => item.id === initialSideRoute) ?? routeItems[0];

            return (
              <article className={styles.variantCard} data-variant={variant.id} key={variant.id}>
                <header>
                  <span>{variant.label}</span>
                  <h4>{variant.title}</h4>
                  <p>{variant.description}</p>
                </header>
                <div className={styles.previewSurface}>
                  <div className={styles.sideListFrame}>
                    <nav className={styles.sideList} aria-label={`경로 목록 · ${variant.title}`}>
                      {routeItems.map((item) => {
                        const current = item.id === initialSideRoute;
                        const href = `/__ui-lab?route-tab=${initialRouteTab}&side-route=${item.id}`;

                        return (
                          <a aria-current={current ? 'page' : undefined} href={href} key={item.id}>
                            <span>{item.label}</span>
                          </a>
                        );
                      })}
                    </nav>
                    <div className={styles.routePanel}>
                      <span>현재 경로</span>
                      <strong>{currentRoute.label}</strong>
                      <p>{currentRoute.summary}</p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}
