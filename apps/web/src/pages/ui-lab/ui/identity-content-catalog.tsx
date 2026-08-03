import { useState, type ReactElement } from 'react';

import styles from './identity-content-catalog.module.css';
import {
  identityContentTabs,
  type ContentItemId,
  type IdentityContentTabId,
} from './identity-content-model';
import { IdentityContentPreviews } from './identity-content-previews';

import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsHighlight,
  TabsHighlightItem,
  TabsList,
  TabsTrigger,
} from '@/shared/ui/tabs';

export function IdentityContentCatalog(): ReactElement {
  const [activeTab, setActiveTab] = useState<IdentityContentTabId>('avatar');
  const [selectedId, setSelectedId] = useState<ContentItemId>('ai-infrastructure');

  return (
    <section
      aria-labelledby="identity-content-title"
      className={styles.catalog}
      data-slot="identity-content-catalog"
    >
      <header className={styles.catalogHeader}>
        <div>
          <span>05 · Identity & Content</span>
          <h2 id="identity-content-title">각 역할에 맞춘 독립 비교</h2>
        </div>
        <p>컴포넌트를 하나씩 선택해 같은 데이터의 A/B/C 구조와 표현 차이를 확인합니다.</p>
      </header>

      <Tabs
        className={styles.componentTabs}
        value={activeTab}
        variant="sliding-underline"
        onValueChange={(value) => setActiveTab(value as IdentityContentTabId)}
      >
        <TabsHighlight className={styles.componentTabViewport}>
          <TabsList
            aria-label="Identity & Content 목업 종류"
            className={styles.componentTabList}
            data-slot="identity-content-tabs"
          >
            {identityContentTabs.map((tab) => (
              <TabsHighlightItem value={tab.id} key={tab.id}>
                <TabsTrigger className={styles.componentTab} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              </TabsHighlightItem>
            ))}
          </TabsList>
        </TabsHighlight>

        <TabsContents>
          {identityContentTabs.map((tab) => (
            <TabsContent value={tab.id} key={tab.id}>
              <IdentityContentPreviews
                component={tab.id}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </TabsContent>
          ))}
        </TabsContents>
      </Tabs>
    </section>
  );
}
