import type { Insight } from '@/entities/insight/model/types';

export const insights: Insight[] = [
  {
    id: 'power-infra',
    title: 'AI 데이터센터 전력 수요',
    context: 'LS ELECTRIC · HD현대일렉트릭 연결',
    impact: '높음',
    icon: 'bolt',
  },
  {
    id: 'hbm-forecast',
    title: 'HBM 전망 상향',
    context: '삼성전자 · SK하이닉스 동시 체크',
    impact: '높음',
    icon: 'cpu',
  },
  {
    id: 'macro-risk',
    title: '환율 상승과 수입 원가',
    context: '반도체·전력기기 원가 민감도 점검',
    impact: '중간',
    icon: 'triangle-alert',
  },
];
