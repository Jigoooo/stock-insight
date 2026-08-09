/// <reference types="vite/client" />

import { createRootRouteWithContext } from '@tanstack/react-router';
import type { LinkHTMLAttributes } from 'react';

// Public auth is server-rendered. TanStack's route CSS manifest only promotes
// direct route imports into the render-blocking root boundary. Keep every
// stylesheet used by that SSR DOM here so a cold first paint cannot use native
// control dimensions and resize the entire auth card after hydration.
import '@/shared/ui/auth-critical-styles.module.css';
import '@/shared/ui/tailwind.css';
import '@/pages/auth/auth-page.module.css';
import { RootComponent, RootDocument, RootNotFound } from '@/pages/root';
import type { StockInsightRouterContext } from '@/router';
import { activeDesignProfile } from '@/shared/theme/design-profile-contract';
import { nativeScrollbarUrl } from '@/shared/ui/scroll';

const styleLinks = [
  { rel: 'preload', href: '/styles/font.css', as: 'style' },
  { rel: 'preload', href: '/styles/index.css', as: 'style' },
  { rel: 'preload', href: activeDesignProfile.cssHref, as: 'style' },
  { rel: 'preload', href: nativeScrollbarUrl, as: 'style' },
  { rel: 'stylesheet', href: '/styles/font.css' },
  { rel: 'stylesheet', href: '/styles/index.css' },
  {
    rel: 'stylesheet',
    href: activeDesignProfile.cssHref,
  },
  { rel: 'stylesheet', href: nativeScrollbarUrl },
] satisfies LinkHTMLAttributes<HTMLLinkElement>[];

export const Route = createRootRouteWithContext<StockInsightRouterContext>()({
  head: () => ({
    links: styleLinks,
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'Stock Insight - Research Feed' },
      {
        name: 'description',
        content:
          'Stock Insight는 보유종목과 시장 이슈를 연결해 설명하는 조회 전용 개인화 투자 리서치 피드 목업입니다.',
      },
      {
        name: 'theme-color',
        content: activeDesignProfile.themeColors.light,
        media: '(prefers-color-scheme: light)',
      },
      {
        name: 'theme-color',
        content: activeDesignProfile.themeColors.dark,
        media: '(prefers-color-scheme: dark)',
      },
      { name: 'color-scheme', content: 'light dark' },
      { property: 'og:title', content: 'Stock Insight - Research Feed' },
      {
        property: 'og:description',
        content: '매수·매도 지시 없이 종목, 뉴스, 테마, 포트폴리오 맥락을 연결합니다.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:locale', content: 'ko_KR' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
  notFoundComponent: RootNotFound,
});
