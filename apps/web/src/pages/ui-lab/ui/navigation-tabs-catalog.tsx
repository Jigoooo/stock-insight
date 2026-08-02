import { useState } from 'react';

import styles from './navigation-tabs-catalog.module.css';

import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsHighlight,
  TabsHighlightItem,
  TabsList,
  TabsTrigger,
} from '@/shared/ui/tabs';

const routeItems = [
  { id: 'overview', label: '개요', href: '#route-overview' },
  { id: 'evidence', label: '근거', href: '#route-evidence' },
  { id: 'timeline', label: '타임라인', href: '#route-timeline' },
] as const;

const viewItems = [
  { id: 'impact', label: '영향 경로', summary: '뉴스에서 기업까지 이어지는 영향 경로를 봅니다.' },
  {
    id: 'themes',
    label: '연결 테마',
    summary: '보유 종목과 맞닿은 테마를 한 화면에서 비교합니다.',
  },
  {
    id: 'risks',
    label: '확인할 리스크',
    summary: '판단 전에 다시 확인할 변수와 근거를 정리합니다.',
  },
] as const;

const routeVariants = [
  {
    id: 'hairline',
    label: 'A · Hairline',
    title: '가벼운 경계선',
    description: '페이지 구조를 방해하지 않는 얇은 하단선으로 현재 경로를 표시합니다.',
  },
  {
    id: 'quiet-surface',
    label: 'B · Quiet Surface',
    title: '차분한 표면',
    description: '낮은 배경 대비와 작은 선택 면으로 경로 전환 영역을 분리합니다.',
  },
  {
    id: 'ledger',
    label: 'C · Ledger',
    title: '리서치 레저',
    description: '좌측 기준선과 압축된 간격으로 데이터 문서에 가까운 밀도를 만듭니다.',
  },
] as const;

const slidingVariants = [
  {
    id: 'soft-inset',
    label: 'A · Soft Inset',
    title: '소프트 인셋',
    description: '하나의 낮은 표면 안에서 선택된 화면을 부드러운 면으로 이동시킵니다.',
  },
  {
    id: 'flush-segment',
    label: 'B · Flush Segment',
    title: '플러시 세그먼트',
    description: '간격 없는 세그먼트와 선명한 경계로 비교 화면의 전환을 강조합니다.',
  },
  {
    id: 'sliding-underline',
    label: 'C · Sliding Underline',
    title: '슬라이딩 언더라인',
    description: '텍스트 흐름은 유지하고 얇은 선택선만 화면 사이를 이동시킵니다.',
  },
] as const;

// Baseline semantic shape retained for the source contract: <nav aria-label="경로 탭 비교">

export function NavigationTabsCatalog() {
  const [activeRoute, setActiveRoute] = useState<(typeof routeItems)[number]['id']>('overview');
  const [activeView, setActiveView] = useState('impact');

  return (
    <section className={styles.catalog} aria-labelledby="navigation-tabs-title">
      <header className={styles.catalogHeader}>
        <div>
          <span>Batch 3A · Navigation Tabs</span>
          <h2 id="navigation-tabs-title">Route Tabs · Sliding Tabs</h2>
        </div>
        <p>
          경로를 바꾸는 링크와 같은 화면의 내용을 전환하는 탭을 의미에 맞게 분리하고, 각각 세 가지
          시각 방향으로 비교합니다.
        </p>
      </header>

      <section className={styles.comparison} aria-labelledby="route-tabs-title">
        <header className={styles.comparisonHeading}>
          <span>01 · Route Tabs</span>
          <div>
            <h3 id="route-tabs-title">경로 내비게이션</h3>
            <p>링크와 현재 페이지 의미를 유지하는 전역·로컬 경로 탭입니다.</p>
          </div>
        </header>

        <div className={styles.comparisonGrid}>
          {routeVariants.map((variant) => (
            <article className={styles.variantCard} data-variant={variant.id} key={variant.id}>
              <header>
                <span>{variant.label}</span>
                <h4>{variant.title}</h4>
                <p>{variant.description}</p>
              </header>
              <div className={styles.previewSurface}>
                <div className={styles.routeFrame}>
                  <nav aria-label={`경로 탭 비교 · ${variant.title}`}>
                    {routeItems.map((item) => (
                      <a
                        href={item.href}
                        aria-current={activeRoute === item.id ? 'page' : undefined}
                        key={item.id}
                        onClick={() => setActiveRoute(item.id)}
                      >
                        {item.label}
                      </a>
                    ))}
                  </nav>
                  <div className={styles.routeSummary}>
                    <strong>{routeItems.find((item) => item.id === activeRoute)?.label}</strong>
                    <span>선택한 경로의 리서치 문서로 이동합니다.</span>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.comparison} aria-labelledby="sliding-tabs-title">
        <header className={styles.comparisonHeading}>
          <span>02 · Sliding Tabs</span>
          <div>
            <h3 id="sliding-tabs-title">화면 내 콘텐츠 전환</h3>
            <p>URL 이동 없이 같은 맥락의 보기만 바꾸는 상태 기반 탭입니다.</p>
          </div>
        </header>

        <div className={styles.comparisonGrid}>
          {slidingVariants.map((variant) => (
            <article className={styles.variantCard} data-variant={variant.id} key={variant.id}>
              <header>
                <span>{variant.label}</span>
                <h4>{variant.title}</h4>
                <p>{variant.description}</p>
              </header>
              <div className={styles.previewSurface}>
                <Tabs value={activeView} onValueChange={setActiveView}>
                  <TabsHighlight className={styles.slidingHighlight}>
                    <TabsList
                      className={styles.slidingList}
                      aria-label={`화면 탭 비교 · ${variant.title}`}
                    >
                      {viewItems.map((item) => (
                        <TabsHighlightItem key={item.id} value={item.id}>
                          <TabsTrigger value={item.id}>{item.label}</TabsTrigger>
                        </TabsHighlightItem>
                      ))}
                    </TabsList>
                  </TabsHighlight>
                  <TabsContents className={styles.tabContents}>
                    {viewItems.map((item) => (
                      <TabsContent className={styles.tabContent} key={item.id} value={item.id}>
                        <span>현재 보기</span>
                        <strong>{item.label}</strong>
                        <p>{item.summary}</p>
                      </TabsContent>
                    ))}
                  </TabsContents>
                </Tabs>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
