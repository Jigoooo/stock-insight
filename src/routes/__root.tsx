/// <reference types="vite/client" />

import { createRootRoute } from '@tanstack/react-router';
import type { LinkHTMLAttributes } from 'react';

import { RootComponent, RootDocument, RootNotFound } from '@/pages/root';
import { colorTokens } from '@/shared/theme/tokens';
import nativeScrollbarUrl from '@/shared/ui/scroll/native-scrollbar.css?url';

const styleLinks = [
  { rel: 'preload', href: '/styles/font.css', as: 'style' },
  { rel: 'preload', href: '/styles/index.css', as: 'style' },
  { rel: 'preload', href: nativeScrollbarUrl, as: 'style' },
  { rel: 'stylesheet', href: '/styles/font.css' },
  { rel: 'stylesheet', href: '/styles/index.css' },
  { rel: 'stylesheet', href: nativeScrollbarUrl },
] satisfies LinkHTMLAttributes<HTMLLinkElement>[];

export const Route = createRootRoute({
  head: () => ({
    links: styleLinks,
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'Futur Insight - Research Feed' },
      {
        name: 'description',
        content:
          'Futur Insight는 보유종목과 시장 이슈를 연결해 설명하는 조회 전용 개인화 투자 리서치 피드 목업입니다.',
      },
      { name: 'theme-color', content: colorTokens.background },
      { name: 'color-scheme', content: 'light' },
      { property: 'og:title', content: 'Futur Insight - Research Feed' },
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
