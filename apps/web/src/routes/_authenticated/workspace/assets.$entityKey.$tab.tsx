import { createFileRoute, getRouteApi, notFound } from '@tanstack/react-router';

import { assetTabFor, isAssetTabId } from '@/pages/asset-deep-dive/model/asset-tabs';
import { AssetTabPanel } from '@/pages/asset-deep-dive/ui/asset-tab-panel';
import { WorkspaceState } from '@/shared/ui/workspace';

// 하위 탭 하나. 데이터는 **부모 로더가 이미 가져온 것을 그대로 읽는다** —
// 탭마다 다시 부르면 탭 전환마다 원점 왕복이 하나씩 붙고, 열한 개 탭이 있는
// 화면에서 그것은 열한 번의 600ms 다(CLAUDE.md 성능 노트).
export const Route = createFileRoute('/_authenticated/workspace/assets/$entityKey/$tab')({
  // 알 수 없는 탭 이름은 404 다. 임의 세그먼트를 조용히 첫 탭으로 돌리면
  // 오타 난 주소가 정상처럼 보이고, 공유된 링크가 다른 내용을 연다.
  beforeLoad: ({ params }) => {
    if (!isAssetTabId(params.tab)) throw notFound();
  },
  notFoundComponent: UnknownTab,
  component: AssetTabRoute,
});

/** 부모 라우트의 로더 데이터를 타입까지 살아 있는 채로 읽는 정식 경로. */
const parentRoute = getRouteApi('/_authenticated/workspace/assets/$entityKey');

function AssetTabRoute() {
  const { tab } = Route.useParams();
  const result = parentRoute.useLoaderData();

  // **방어 코드가 아니라 타입 좁힘이다.** 로더 결과는 이제
  // `ready | not_found | failed` 유니언이고, 부모는 `ready` 가 아니면 `<Outlet/>`
  // 을 아예 그리지 않는다(`asset-deep-dive-page.tsx`). 즉 이 컴포넌트가 실행되는
  // 시점에 상태는 반드시 `ready` 다 — 여기서 무언가를 그리면 부모가 이미 말한
  // 부재/실패 위에 두 번째 고지가 겹친다. 그래서 `null` 이고, 값을 좁히는
  // 목적만 갖는다.
  if (result.status !== 'ready') return null;
  const briefing = result.briefing;
  const packet = briefing.commonAssetView;

  if (!isAssetTabId(tab)) return <UnknownTab />;
  // 부모와 같은 순서로 가른다. 조회 실패일 때도 패킷은 `null` 이므로, 실패를
  // 먼저 묻지 않으면 오류가 "아직 없음" 으로 위장된다(UX 헌법 6번).
  if (briefing.partialFailures.commonAssetView) {
    return (
      <WorkspaceState
        kind="error"
        title="이 항목의 자료를 확인하지 못했습니다"
        description="빈 결과로 처리하지 않았습니다. 잠시 후 이 화면을 다시 열어 주세요."
      />
    );
  }
  if (packet === null) {
    return (
      <WorkspaceState
        kind="unavailable"
        title="이 종목의 공통 자산 패킷이 아직 없습니다"
        description="패킷이 만들어지면 이 탭에 항목별 상태와 근거가 표시됩니다."
      />
    );
  }

  return (
    <AssetTabPanel
      packet={packet}
      stockDetail={briefing.stockDetail?.data ?? null}
      tab={assetTabFor(tab)}
    />
  );
}

function UnknownTab() {
  return (
    <WorkspaceState
      kind="empty"
      title="없는 항목입니다"
      description="주소의 항목 이름을 확인해 주세요. 위 탭에서 다시 선택할 수 있습니다."
    />
  );
}
