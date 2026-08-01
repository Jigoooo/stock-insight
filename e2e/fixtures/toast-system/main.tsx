import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../../apps/web/public/styles/index.css';
import '../../../apps/web/public/styles/profiles/market-graphite.css';
import './fixture.css';

import { Button } from '@/shared/ui/button';
import { DeferredToastHost, notify, type ProgressToastController } from '@/shared/ui/toast';

const wait = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

function Fixture() {
  const progressRef = useRef<ProgressToastController | undefined>(undefined);
  const [progressReady, setProgressReady] = useState(false);

  const triggerAll = async () => {
    await Promise.all([
      notify.success('관심 후보를 저장했습니다.', {
        description: '오늘 리서치 목록에 반영됐습니다.',
        duration: 900,
      }),
      notify.action('필터를 초기화했습니다.', {
        action: { label: '되돌리기', onClick: () => undefined },
        description: '직전 조건으로 복원할 수 있습니다.',
        duration: Number.POSITIVE_INFINITY,
      }),
      notify.error('데이터 연결을 확인하지 못했습니다.', {
        description: '연결 상태를 확인한 뒤 다시 시도하세요.',
        duration: Number.POSITIVE_INFINITY,
        retry: {
          label: '다시 시도',
          pendingLabel: '다시 시도 중',
          successTitle: '연결을 복구했습니다.',
          successDescription: '최신 데이터로 다시 연결됐습니다.',
          onRetry: async () => wait(320),
        },
      }),
    ]);
    progressRef.current = await notify.progress('리서치 데이터를 불러오는 중입니다.', {
      description: '종목과 뉴스의 연결을 확인하고 있습니다.',
    });
    setProgressReady(true);
  };

  return (
    <main className="fixture-shell">
      <p>Shared feedback system</p>
      <h1>Sonner custom toast fixture</h1>
      <div className="fixture-actions">
        <Button onClick={triggerAll}>네 가지 Toast 열기</Button>
        <Button
          variant="secondary"
          onClick={() =>
            notify.action('필터를 초기화했습니다.', {
              action: { label: '되돌리기', onClick: () => undefined },
              duration: Number.POSITIVE_INFINITY,
            })
          }
        >
          Action Toast 열기
        </Button>
        <Button
          disabled={!progressReady}
          variant="outline"
          onClick={() =>
            progressRef.current?.success(
              '리서치 데이터를 불러왔습니다.',
              '최신 연결 상태가 반영됐습니다.',
            )
          }
        >
          Progress 완료
        </Button>
      </div>
      <DeferredToastHost />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
