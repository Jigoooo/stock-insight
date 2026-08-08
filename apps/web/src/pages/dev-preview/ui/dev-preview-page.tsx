import type { DevPreviewPageProps, StocksPreviewScenario } from '../model/dev-preview-request';
import { resolveHistoryPreview } from '../model/history-preview-fixture';
import { resolveMarketConnectionsPreview } from '../model/market-connections-preview-fixture';
import { loadPreviewStockBriefing } from '../model/stock-deep-dive-preview-fixture';
import {
  stocksBriefingPreviewFixture,
  stocksPreviewFixture,
} from '../model/stocks-preview-fixture';
import { loadTodayPreviewRecord, todayPreviewFixture } from '../model/today-preview-fixture';

import {
  AdminInvitationPage,
  type IssueInvitationAction,
  type LogoutAction,
  type RevokeInvitationAction,
} from '@/pages/admin-invitations/ui/admin-invitation-page';
import type {
  StockBriefingLoader,
  StocksBriefingModel,
} from '@/pages/research-workspace/model/stock-briefing';
import type { ResearchWorkspaceViewPayload } from '@/pages/research-workspace/model/workspace-view-payload';
import { ResearchWorkspacePage } from '@/pages/research-workspace/ui/research-workspace-page';
import type { AdminInvitation } from '@/server/auth/admin-invitations';

type StocksPreviewPayload = Extract<ResearchWorkspaceViewPayload, { view: 'stocks' }>;

const watchedOnlyPreviewFixture = {
  ...stocksPreviewFixture,
  shell: { ...stocksPreviewFixture.shell, watchlistCount: 4 },
  stocks: {
    ...stocksPreviewFixture.stocks,
    data: stocksPreviewFixture.stocks.data.filter(({ isHolding }) => !isHolding),
  },
} satisfies StocksPreviewPayload;

const watchedOnlyBriefingFixture = {
  ...stocksBriefingPreviewFixture,
  summary: {
    holdingCount: 0,
    connectedNewsCount: null,
    riskCount: null,
    analyzedAt: null,
  },
  priorityHoldings: [],
} satisfies StocksBriefingModel;

const emptyStocksPreviewFixture = {
  ...stocksPreviewFixture,
  shell: { ...stocksPreviewFixture.shell, watchlistCount: 0 },
  stocks: { ...stocksPreviewFixture.stocks, data: [] },
} satisfies StocksPreviewPayload;

const emptyStocksBriefingFixture = {
  summary: {
    holdingCount: 0,
    connectedNewsCount: 0,
    riskCount: 0,
    analyzedAt: null,
  },
  priorityHoldings: [],
  watchlistChanges: [],
} satisfies StocksBriefingModel;

const loadFailedPreviewStockBriefing: StockBriefingLoader = async () => {
  throw new Error('개발 미리보기에서 종목 상세를 불러오지 못했습니다.');
};

function resolveStocksPreview(scenario: StocksPreviewScenario) {
  if (scenario === 'no-holdings') {
    return {
      briefing: watchedOnlyBriefingFixture,
      data: watchedOnlyPreviewFixture,
      loader: loadPreviewStockBriefing,
    };
  }
  if (scenario === 'empty') {
    return {
      briefing: emptyStocksBriefingFixture,
      data: emptyStocksPreviewFixture,
      loader: loadPreviewStockBriefing,
    };
  }
  return {
    briefing: stocksBriefingPreviewFixture,
    data: stocksPreviewFixture,
    loader: scenario === 'detail-error' ? loadFailedPreviewStockBriefing : loadPreviewStockBriefing,
  };
}

const initialPreviewInvitations: AdminInvitation[] = [
  {
    invitationId: 'f915c667-2b15-4ecb-99de-f0de3cb29a24',
    label: '리서치 멤버 초대',
    maxUses: 2,
    usedCount: 1,
    expiresAt: '2026-08-06T09:00:00.000Z',
    revokedAt: null,
    revokedReason: null,
    createdAt: '2026-08-02T09:00:00.000Z',
    createdByUsername: 'owner',
    status: 'active',
  },
  {
    invitationId: '15347c03-b9c7-4f3e-9ba7-a5c93385912d',
    label: '이전 테스트 코드',
    maxUses: 1,
    usedCount: 0,
    expiresAt: '2026-08-01T09:00:00.000Z',
    revokedAt: null,
    revokedReason: null,
    createdAt: '2026-07-30T09:00:00.000Z',
    createdByUsername: 'owner',
    status: 'expired',
  },
];

const waitForPreviewAction = () =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, 560);
  });

const issuePreviewInvitation: IssueInvitationAction = async ({ data }) => {
  await waitForPreviewAction();
  return {
    ok: true as const,
    code: 'preview-only-invitation-code-not-connected-to-live-data',
    invitation: {
      invitationId: crypto.randomUUID(),
      label: data.label,
      maxUses: data.maxUses,
      usedCount: 0,
      expiresAt: new Date(Date.now() + Number(data.expiresInHours) * 60 * 60 * 1_000).toISOString(),
      revokedAt: null,
      revokedReason: null,
      createdAt: new Date().toISOString(),
      createdByUsername: 'preview-owner',
      status: 'active',
    },
  };
};

const revokePreviewInvitation: RevokeInvitationAction = async () => {
  await waitForPreviewAction();
  return { ok: true as const };
};
const previewLogout: LogoutAction = async () => ({ ok: true as const });

export function DevPreviewPage(props: DevPreviewPageProps) {
  const surface = props.surface ?? 'workspace';
  if (props.surface === 'history') {
    const preview = resolveHistoryPreview(props.scenario ?? 'default');
    return (
      <div data-testid="dev-preview-page">
        <p role="note">개발 전용 미리보기 · 실제 계정 및 서버 데이터와 연결되지 않습니다.</p>
        <ResearchWorkspacePage
          data={preview.data}
          navigationMode="static"
          canManageInvitations={false}
          onLogout={async () => false}
          onPrefetchSection={() => undefined}
          onUrlStateChange={async () => undefined}
          urlState={{ view: 'history' }}
        />
      </div>
    );
  }
  if (props.surface === 'market-connections') {
    const preview = resolveMarketConnectionsPreview(props.scenario ?? 'default');
    return (
      <div data-testid="dev-preview-page">
        <p role="note">개발 전용 미리보기 · 실제 계정 및 서버 데이터와 연결되지 않습니다.</p>
        <ResearchWorkspacePage
          data={preview.data}
          marketConnections={preview.marketConnections}
          loadMarketConnectionDetail={preview.loader}
          navigationMode="static"
          canManageInvitations={false}
          onLogout={async () => false}
          onPrefetchSection={() => undefined}
          onUrlStateChange={async () => undefined}
          urlState={{ view: 'radar' }}
        />
      </div>
    );
  }

  const stocksPreview = resolveStocksPreview(props.scenario ?? 'default');
  return (
    <div data-testid="dev-preview-page">
      <p role="note">개발 전용 미리보기 · 실제 계정 및 서버 데이터와 연결되지 않습니다.</p>
      {surface === 'admin-invitations' ? (
        <AdminInvitationPage
          accountRole="owner"
          initialInvitations={initialPreviewInvitations}
          issueInvitationAction={issuePreviewInvitation}
          logoutAction={previewLogout}
          revokeInvitationAction={revokePreviewInvitation}
        />
      ) : surface === 'today' ? (
        <ResearchWorkspacePage
          data={todayPreviewFixture}
          loadResearchRecord={loadTodayPreviewRecord}
          navigationMode="static"
          canManageInvitations={false}
          onLogout={async () => false}
          onPrefetchSection={() => undefined}
          urlState={{ view: 'today' }}
        />
      ) : (
        <ResearchWorkspacePage
          data={stocksPreview.data}
          loadStockBriefingDetail={stocksPreview.loader}
          stocksBriefing={stocksPreview.briefing}
          navigationMode="static"
          canManageInvitations={false}
          onLogout={async () => false}
          onPrefetchSection={() => undefined}
          onUrlStateChange={async () => undefined}
          urlState={{ view: 'stocks' }}
        />
      )}
    </div>
  );
}
