import { Outlet, createFileRoute, useParams } from '@tanstack/react-router';

import { isAssetTabId } from '@/pages/asset-deep-dive/model/asset-tabs';
import { loadAssetBriefing } from '@/pages/asset-deep-dive/model/load-asset-briefing';
import { AssetDeepDivePage } from '@/pages/asset-deep-dive/ui/asset-deep-dive-page';
import boundaryStyles from '@/pages/research-workspace/ui/workspace-route-boundary.module.css';
import { Button } from '@/shared/ui/button';
import { ErrorState } from '@/shared/ui/feedback';

// Asset Deep Dive 레이아웃 + 로더 + above-the-fold.
//
// `_authenticated/workspace` 의 **자식**이다. 그래서 `validateSearch`, 폰트
// preload, 에러 경계를 상속하고 워크스페이스 안에서의 이동이 클라이언트 전환으로
// 남는다. 형제 라우트로 빼면 셋을 전부 다시 만들어야 하고 진입 경로에 홉이
// 붙는다(CLAUDE.md 성능 노트).
//
// 하위 탭은 `assets.$entityKey.$tab.tsx` 가 경로 세그먼트로 갖는다. 검색
// 파라미터가 아닌 이유는 `asset-tabs.ts` 헤더에 적었다 — 세그먼트여야
// `shared/ui/route-tabs` 가 진짜 앵커로 동작한다.
export const Route = createFileRoute('/_authenticated/workspace/assets/$entityKey')({
  loader: ({ params }) => loadAssetBriefing({ data: { entityKey: params.entityKey } }),
  head: () => ({ meta: [{ title: '종목 상세 | Stock Insight' }] }),
  errorComponent: AssetRouteError,
  component: AssetDeepDiveRoute,
});

function AssetDeepDiveRoute() {
  // 로더는 실패를 던지지 않고 `AssetBriefingResult` 로 돌려준다. 세 갈래를 가르는
  // 자리는 페이지 하나뿐이고, 셋 다 `WorkspaceShell` 안에서 그려진다.
  const result = Route.useLoaderData();
  // 자식 라우트가 붙어 있으면 그 탭이 활성이다. 부모가 자식 파라미터를 읽는
  // 정식 경로는 `strict: false` 조회다 — 자식이 없을 때 `undefined` 를 돌려준다.
  const childParams = useParams({ strict: false });
  const tab =
    typeof childParams.tab === 'string' && isAssetTabId(childParams.tab) ? childParams.tab : null;

  return (
    <AssetDeepDivePage activeTab={tab} result={result}>
      <Outlet />
    </AssetDeepDivePage>
  );
}

// 최후의 그물이다. **정상 경로의 404 는 여기 오지 않는다** — 로더가 그것을
// `{ status: 'not_found' }` 값으로 돌려주고 페이지가 셸 안에서 그린다. 여기 오는
// 것은 로더가 잡을 수 없는 것뿐이다: 렌더 단계에서 컴포넌트가 던진 예외, 또는
// 라우트 자체를 세우지 못한 경우. 그때는 셸도 못 믿으므로 자체 `<main>` 이 맞다.
//
// 지우면 안 된다. 지우면 렌더 단계 throw 가 상위 경계까지 올라가 워크스페이스
// 전체가 날아간다.
function AssetRouteError() {
  return (
    <main className={boundaryStyles.boundary}>
      <ErrorState className={boundaryStyles.surface} testId="asset-deep-dive-route-error">
        <h1>종목 상세를 불러오지 못했습니다</h1>
        <p>데이터 연결을 확인하지 못했습니다. 빈 결과로 처리하지 않았습니다.</p>
        <Button motion="pressable" type="button" onClick={() => window.location.reload()}>
          다시 시도
        </Button>
      </ErrorState>
    </main>
  );
}
