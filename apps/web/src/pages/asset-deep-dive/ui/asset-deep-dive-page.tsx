import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useState, type MouseEvent, type ReactNode } from 'react';

import { AssetAboveTheFold } from './asset-above-the-fold';
import styles from './asset-deep-dive.module.css';

import { workspaceSections } from '@/features/workspace-navigation';
import { readIdentity, indexBlocks } from '@/pages/asset-deep-dive/model/asset-packet';
import { ASSET_TABS, type AssetTabId } from '@/pages/asset-deep-dive/model/asset-tabs';
import type {
  AssetBriefing,
  AssetBriefingResult,
} from '@/pages/asset-deep-dive/model/load-asset-briefing';
import { logout } from '@/pages/auth/model/auth-functions';
import { marketLabel } from '@/pages/research-workspace/ui/workspace-presenters';
import { RouteTab, RouteTabs } from '@/shared/ui/route-tabs';
import { AvailabilityNotice, PageHeader, WorkspaceState } from '@/shared/ui/workspace';
import { WorkspaceShell } from '@/widgets/workspace-shell';

/**
 * Asset Deep Dive — drawer 가 아니라 페이지.
 *
 * ## 왜 페이지인가
 *
 * 정본 01 §3 은 above-the-fold 10항목과 하위 섹션 11개를 요구하고, 그것이
 * 390px drawer 에 들어가지 않는다(UX 헌법 4번은 릴리스를 막는다).
 * `REQ-PROD-003` 의 5분 예산에는 공유되고 뒤로 갈 수 있는 목적지가 필요하다.
 *
 * ## drawer 는 그대로 둔다
 *
 * `stock-briefing-inspector.tsx` 는 30초 답변으로 남고, 헤더의 "자세히 보기" 가
 * 여기로 보낸다. drawer 를 페이지 이동으로 대체하면 목록에서 종목 하나를
 * 훑어보는 데 원점 왕복 1회(Cloudflare PoP 경유 약 600ms)가 더 붙는다.
 *
 * ## 탭은 링크지만 이동은 클라이언트 전환이다
 *
 * `RouteTab` 이 진짜 `<a href>` 라 키보드·가운데클릭·새 탭이 공짜로 따라오고,
 * 평범한 좌클릭만 가로채 `navigate()` 로 넘긴다. 기본 동작에 맡기면 전체
 * 문서를 다시 받아 오고 그것이 정확히 CLAUDE.md 가 피하라고 한 왕복이다.
 *
 * ## 워크스페이스 셸 **안**에서 그린다
 *
 * 이 화면은 처음에 셸 밖에 있었고, 그 결과가 세 가지였다.
 *
 * 1. `DepthModeToggle` 은 `workspace-shell.tsx`(데스크톱 상단바)와
 *    `workspace-topbar.tsx`(모바일 시트 푸터) 두 곳에서만 나온다. 셸 밖이면
 *    **깊이 게이트가 가장 많이 걸린 화면에서 사용자가 모드를 바꿀 수 없다** —
 *    `asset-section.tsx` 의 모든 섹션과 학습 카드 불릿이 `DepthGate` 뒤에 있는데
 *    그것을 여는 손잡이가 화면에 없었다. `REQ-PROD-002` 가 여기서 도달 불가였다.
 * 2. 사이드바가 없으니 워크스페이스의 다른 화면으로 돌아갈 길이 페이지 안의
 *    "내 종목으로" 링크 하나뿐이었다.
 * 3. `e2e/workspace-visual.spec.ts` 의 harness 가 첫 단언으로
 *    `research-workspace-v3` 를 찾는데 그 testid 는 셸만 내보낸다.
 *
 * 셸에 넣으면 셋이 한 번에 풀린다. 호출 형태는 `admin-invitation-page.tsx` 와
 * 같은 최소형이다 — `navigationMode` 기본값 `'route'` 에서 사이드바 항목이 진짜
 * `<Link>` 라 `onNavigate` 없이도 이동한다.
 *
 * `activeSection` 은 `'stocks'` 다. 이 화면은 "내 종목" 에서 들어오는 자식
 * 화면이고, 셸 union 에 `'asset'` 을 새로 넣어 봤자 사이드바에 대응하는 항목이
 * 없어 아무 곳도 활성으로 표시되지 않는다.
 *
 * **자식은 정확히 하나**여야 한다. `WorkspaceShell` 은 `Children.toArray()` 의
 * 첫 원소만 `workspace-content` 안에 넣고 나머지는 오버레이로 **밖에** 둔다.
 *
 * ## 셋 다 셸 안이다
 *
 * 로더는 실패를 던지지 않고 `AssetBriefingResult` 로 돌려준다. 던졌다면
 * TanStack 이 라우트 **밖**의 `errorComponent`(셸 없이 제 랜드마크를 세우는
 * 화면)를 그리고, 위에 적은 세 가지가 실패 상태에서 그대로 되돌아간다.
 * 그래서 `<WorkspaceShell>` 은
 * 갈래 **바깥**에 한 번만 두고 안쪽 내용만 가른다:
 *
 * - `ready` → 본문
 * - `not_found` → `kind="empty"`. 297 패킷이 아직 다루지 않는 종목이다.
 * - `failed` → `kind="error"`. 연결을 확인하지 못한 것이지 없는 것이 아니다.
 *
 * 뒤의 둘은 **문구도 announcement 도 갈라져 있어야 한다**. `WorkspaceState` 가
 * `empty` 는 `aria-live="off"`, `error` 는 `role="alert"` + `assertive` 로
 * 내보내므로, 오류를 `empty` 로 그리면 화면뿐 아니라 스크린리더에서도 부재로
 * 위장된다 — UX 헌법 6번이 정확히 금지하는 것이다.
 *
 * 부재/실패에서는 `children`(=`<Outlet/>`)을 그리지 않는다. 하위 탭은 패킷을
 * 읽는 화면이라 briefing 없이는 그릴 것이 없고, 부모가 이미 이유를 말했다.
 *
 * 부재 문구는 "데이터가 없습니다" 로 쓰지 않는다. 본문 안의
 * `AvailabilityNotice availability="missing"`(= 패킷이 아직 지어지지 않음)과
 * 낱말이 겹치면 서로 다른 두 사실이 한 낱말로 보인다 —
 * `comparability-notice.tsx` 의 "동종" 이 겪은 것과 같은 모양이다. 여기서는
 * **다루는 종목 범위**에 대해 말한다.
 *
 * 두 갈래는 `entityKey` 밖에 갖고 있지 않고, 그 원문(`KR:005930`)은 화면에
 * 내보내지 않는다(UX 헌법 7번). 내부 식별자를 그대로 보여 주느니 범위를
 * 설명하는 편이 읽는 사람에게 쓸모 있다.
 */

function isPlainActivation(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.defaultPrevented
  );
}

export type AssetDeepDiveLogoutAction = (
  ...args: Parameters<typeof logout>
) => ReturnType<typeof logout>;

export function AssetDeepDivePage({
  activeTab,
  children,
  logoutAction = logout,
  result,
}: {
  activeTab: AssetTabId | null;
  children: ReactNode;
  logoutAction?: AssetDeepDiveLogoutAction;
  result: AssetBriefingResult;
}) {
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const outcome = await logoutAction();
      if (outcome.ok) window.location.assign('/login');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <WorkspaceShell
      activeSection="stocks"
      navigationItems={workspaceSections}
      navigationPending={null}
      onLogout={() => void handleLogout()}
    >
      <div className={styles.page} data-testid="asset-deep-dive">
        {/* 셋 다 여기서 나갈 길이 있어야 한다. 링크는 갈래 밖이다. */}
        <Link className={styles.backLink} to="/workspace/stocks">
          <ArrowLeft aria-hidden="true" size={14} />
          내 종목으로
        </Link>

        {result.status === 'ready' ? (
          <AssetDeepDiveBody activeTab={activeTab} briefing={result.briefing}>
            {children}
          </AssetDeepDiveBody>
        ) : result.status === 'not_found' ? (
          // 부재. 브레인이 404 로 답한 경우이고, 297 패킷 밖 종목이 그 경로로
          // 흔하게 들어온다 — 사고가 아니라 다루는 범위의 사실이다.
          // `kind="empty"` 라 `aria-live="off"` 이고, 아래 `failed` 와 낱말도
          // announcement 도 갈라진다(UX 헌법 6번).
          <WorkspaceState
            kind="empty"
            title="아직 다루지 않는 종목입니다"
            description="이 화면은 정리가 끝난 종목만 열 수 있습니다. 정리 범위에 들어오면 같은 주소에서 상세가 보입니다. 내 종목 목록에서 다른 종목을 선택해 주세요."
          />
        ) : (
          // 실패. 연결·응답을 확인하지 못한 것이지 없는 것이 아니다. 위
          // `not_found` 와 같은 낱말을 쓰면 오류가 부재로 위장된다(헌법 6번).
          // `kind="error"` 는 `role="alert"` + `aria-live="assertive"` 다.
          <WorkspaceState
            kind="error"
            title="종목 상세를 확인하지 못했습니다"
            description="자료 연결이 응답하지 않아 이 화면을 채우지 못했습니다. 빈 결과로 처리하지 않았습니다. 잠시 후 이 화면을 다시 열어 주세요."
          />
        )}
      </div>
    </WorkspaceShell>
  );
}

/**
 * `ready` 갈래의 본문. 셸과 나가는 길은 부모가 이미 그렸다.
 *
 * 여기 있는 값들(`packet`·`stockDetail`·`identity`·`title`)은 briefing 이 있어야
 * 계산되므로, 좁힌 뒤에 계산한다. 부모에서 계산하려면 세 갈래 전부에서
 * `briefing` 이 있는 척해야 한다.
 */
function AssetDeepDiveBody({
  activeTab,
  briefing,
  children,
}: {
  activeTab: AssetTabId | null;
  briefing: AssetBriefing;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const packet = briefing.commonAssetView;
  const stockDetail = briefing.stockDetail?.data ?? null;
  const identity = packet ? readIdentity(indexBlocks(packet).identity_economic_claim) : null;
  const stock = stockDetail?.stock;
  const title = stock?.displayName ?? identity?.displayName ?? '종목 상세';

  return (
    <>
      <PageHeader
        eyebrow="종목 상세"
        title={title}
        description="정본이 요구하는 열 가지를 한 화면에서 확인합니다. 채워지지 않은 항목은 이유와 함께 표시됩니다."
        asOf={briefing.stockDetail?.meta.generatedAt ?? null}
      />

      {stock ? (
        <p className={styles.identityLine}>
          <span>{marketLabel(stock.market)}</span>
          <strong>{stock.ticker}</strong>
        </p>
      ) : null}

      {/*
        UX 헌법 6번: 실패를 빈 결과로 위장하지 않는다. **세 갈래이고 서로
        배타적이어야 한다.**

        계약 헤더가 못 박은 대로 `commonAssetView` 가 `null` 인 것은 두 가지를
        뜻할 수 있고 "후자만 실패다": 패킷이 아직 지어지지 않았거나, 조회가
        실패해 `partialFailures.commonAssetView` 가 채워졌거나. 즉 **실패했을 때도
        패킷은 `null` 이다.**

        그래서 두 조건을 따로 쓰면 실패 한 번에 "확인하지 못했습니다" 와
        "현재 사용할 수 없는 데이터입니다" 가 나란히 그려진다. 뒤엣것이 앞엣것의
        실패 위에 정상적 부재를 덧씌우고, `aria-live` 두 개가 동시에 읽힌다 —
        헌법 6번이 정확히 막는 뒤섞임이다. 실패가 먼저고, 부재는 실패가
        아닐 때만이다.
      */}
      {briefing.partialFailures.commonAssetView ? (
        <AvailabilityNotice availability="error" />
      ) : packet === null ? (
        <AvailabilityNotice availability="missing" />
      ) : null}

      {packet === null ? null : (
        <AssetAboveTheFold
          packet={packet}
          // `DataQualityPopover` 가 "원천" 줄에 쓰는 값. 봉투가 없으면 화면이
          // 원천을 아는 척하지 않도록 fallback 으로 둔다.
          source={briefing.stockDetail?.meta.source ?? 'fallback'}
          stockDetail={stockDetail}
        />
      )}

      <div className={styles.tabStrip}>
        <RouteTabs aria-label="종목 상세 하위 항목">
          {ASSET_TABS.map((tab) => (
            <RouteTab
              key={tab.id}
              active={activeTab === tab.id}
              href={`/workspace/assets/${encodeURIComponent(briefing.entityKey)}/${tab.id}`}
              onClick={(event) => {
                if (!isPlainActivation(event)) return;
                event.preventDefault();
                void navigate({
                  to: '/workspace/assets/$entityKey/$tab',
                  params: { entityKey: briefing.entityKey, tab: tab.id },
                });
              }}
            >
              {tab.label}
            </RouteTab>
          ))}
        </RouteTabs>
      </div>

      {children}
    </>
  );
}
