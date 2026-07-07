import type { ThemeNode } from '@/entities/theme/model/types';

export const themes: ThemeNode[] = [
  {
    id: 'ai',
    title: 'AI',
    description: 'AI 서버 투자와 클라우드 인프라 확장',
    strength: 92,
  },
  {
    id: 'hbm',
    title: 'HBM',
    description: '고대역폭 메모리와 후공정 장비 수요',
    strength: 86,
  },
  {
    id: 'power',
    title: '전력 인프라',
    description: '데이터센터 전력 병목과 변압기/전선 투자',
    strength: 78,
  },
  {
    id: 'cooling',
    title: '냉각',
    description: '고밀도 서버 랙에 따른 열관리 관심 확산',
    strength: 54,
  },
];
