import { loadPreviewStockDeepDive } from '../model/stock-deep-dive-preview-fixture';
import { stocksPreviewFixture } from '../model/stocks-preview-fixture';
import { todayPreviewFixture } from '../model/today-preview-fixture';

import {
  AdminInvitationPage,
  type IssueInvitationAction,
  type LogoutAction,
  type RevokeInvitationAction,
} from '@/pages/admin-invitations/ui/admin-invitation-page';
import { ResearchWorkspacePage } from '@/pages/research-workspace/ui/research-workspace-page';
import type { AdminInvitation } from '@/server/auth/admin-invitations';

type DevPreviewSurface = 'workspace' | 'today' | 'admin-invitations';

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

export function DevPreviewPage({ surface = 'workspace' }: { surface?: DevPreviewSurface }) {
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
          navigationMode="static"
          canManageInvitations={false}
          onLogout={async () => false}
          onPrefetchSection={() => undefined}
          urlState={{ view: 'today' }}
        />
      ) : (
        <ResearchWorkspacePage
          data={stocksPreviewFixture}
          loadStockDeepDive={loadPreviewStockDeepDive}
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
