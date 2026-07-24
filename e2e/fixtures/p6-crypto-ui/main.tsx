import { createRoot } from 'react-dom/client';

import { cryptoWorkspaceFixture } from './fixture';
import { CryptoWorkspaceView } from '@/pages/research-workspace/ui/views/crypto-workspace-view';

createRoot(document.getElementById('root')!).render(
  <main style={{ maxWidth: 1440, margin: '0 auto', padding: 24 }}>
    <CryptoWorkspaceView data={cryptoWorkspaceFixture} />
  </main>,
);
