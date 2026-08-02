# Navigation Tabs Mockups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `__ui-lab`에 Route Tabs와 Sliding Tabs 각각 세 가지 비교 목업을 상호작용 가능한 상태로 제공한다.

**Architecture:** 목업 데이터와 상태는 새 `NavigationTabsCatalog`가 소유한다. Route Tabs는 링크와 query 동기화를, Sliding Tabs는 기존 `shared/ui/tabs`의 Radix·Motion 구조를 사용하며 시각 차이는 UI Lab 전용 CSS로 격리한다.

**Tech Stack:** React 19, TanStack Start, Radix Tabs, Motion, CSS Modules, Node test

## Global Constraints

- 제품 화면과 `shared/ui` 공개 API는 변경하지 않는다.
- Route Tabs는 `nav`, 링크, `aria-current="page"` 의미를 유지한다.
- Sliding Tabs는 동일 화면의 상태 전환만 담당한다.
- 390px에서는 줄바꿈 없이 가로 스크롤하고 최소 44px 상호작용 영역을 제공한다.
- 새 패키지와 UI Provider를 추가하지 않는다.
- 전체 E2E와 production build는 실행하지 않는다.

---

### Task 1: UI Lab 목업 계약

**Files:**
- Create: `apps/web/test/navigation-tabs-catalog.test.ts`

**Interfaces:**
- Consumes: `UiLabPage`, `NavigationTabsCatalog`, `@/shared/ui/tabs`
- Produces: Route 3안과 Sliding 3안의 의미·모션·반응형 소스 계약

- [ ] **Step 1: 실패하는 계약 테스트 작성**

```ts
assert.match(catalog, /aria-label="경로 탭 비교"/);
assert.match(catalog, /aria-current=\{activeRoute === item\.id \? 'page' : undefined\}/);
assert.match(catalog, /<TabsHighlight/);
assert.match(css, /@media \(max-width: 520px\)/);
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test apps/web/test/navigation-tabs-catalog.test.ts`
Expected: 새 catalog 파일을 찾지 못해 실패

### Task 2: Route Tabs와 Sliding Tabs 비교 목업

**Files:**
- Create: `apps/web/src/pages/ui-lab/ui/navigation-tabs-catalog.tsx`
- Create: `apps/web/src/pages/ui-lab/ui/navigation-tabs-catalog.module.css`
- Modify: `apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx`

**Interfaces:**
- Consumes: `Tabs`, `TabsHighlight`, `TabsHighlightItem`, `TabsList`, `TabsTrigger`, `TabsContents`, `TabsContent`
- Produces: `NavigationTabsCatalog(): JSX.Element`

- [ ] **Step 1: Route Tabs 구현**

```tsx
<nav aria-label="경로 탭 비교">
  {routeItems.map((item) => (
    <a aria-current={activeRoute === item.id ? 'page' : undefined} href={item.href}>
      {item.label}
    </a>
  ))}
</nav>
```

- [ ] **Step 2: Sliding Tabs 구현**

```tsx
<Tabs value={activeView} onValueChange={setActiveView}>
  <TabsHighlight>
    <TabsList aria-label="화면 탭 비교">
      {viewItems.map((item) => (
        <TabsHighlightItem key={item.id} value={item.id}>
          <TabsTrigger value={item.id}>{item.label}</TabsTrigger>
        </TabsHighlightItem>
      ))}
    </TabsList>
  </TabsHighlight>
</Tabs>
```

- [ ] **Step 3: 여섯 variant와 반응형 CSS 구현**

각 카드의 `data-variant`가 `hairline|quiet-surface|ledger|soft-inset|flush-segment|sliding-underline`를 소유한다. 선택 표시의 transition은 위치·색상만 사용하고 모바일에서는 `overflow-x: auto`, `min-height: 44px`를 적용한다.

- [ ] **Step 4: UI Lab 연결**

`InputActionCatalog` 뒤에 `<NavigationTabsCatalog />`를 추가하고 향후 배치의 내비게이션 placeholder를 제거한다.

- [ ] **Step 5: 계약 테스트 통과 확인**

Run: `node --test apps/web/test/navigation-tabs-catalog.test.ts`
Expected: PASS

### Task 3: 정상 범위 검증과 진행 원장 갱신

**Files:**
- Modify: `docs/superpowers/UI-SYSTEM-ROLLOUT.md`

**Interfaces:**
- Consumes: 완성된 UI Lab 목업
- Produces: 3A 사용자 비교 대기 상태

- [ ] **Step 1: 정적 검증**

Run: `pnpm --filter @stock-insight/web typecheck`
Expected: PASS

Run: `pnpm --filter @stock-insight/web format:check`
Expected: PASS

- [ ] **Step 2: Codex 인앱 브라우저 확인**

`http://127.0.0.1:6100/__ui-lab`에서 각 Route·Sliding 탭 선택, URL query, moving highlight, 390px overflow를 확인한다.

- [ ] **Step 3: 진행 원장 갱신**

3A 상태는 사용자 선택 전까지 `목업`으로 유지하고 완료 기록에 여섯 비교안과 실행한 검증만 기록한다.

- [ ] **Step 4: 구현 커밋**

```bash
git add apps/web/src/pages/ui-lab/ui/navigation-tabs-catalog.tsx \
  apps/web/src/pages/ui-lab/ui/navigation-tabs-catalog.module.css \
  apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx \
  apps/web/test/navigation-tabs-catalog.test.ts \
  docs/superpowers/UI-SYSTEM-ROLLOUT.md
git commit -m "feat(ui): 내비게이션 탭 비교 목업 추가"
```
