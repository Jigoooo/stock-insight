import { loadPreviewStockDeepDive } from '../model/stock-deep-dive-preview-fixture';
import { stocksPreviewFixture } from '../model/stocks-preview-fixture';

import { ResearchWorkspacePage } from '@/pages/research-workspace/ui/research-workspace-page';

export function DevPreviewPage() {
  return (
    <div data-testid="dev-preview-page">
      <p role="note">개발 전용 미리보기 · 실제 계정 및 서버 데이터와 연결되지 않습니다.</p>
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
    </div>
  );
}
