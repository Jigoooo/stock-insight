# Personalized Insight Home IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat feature menu with a four-step research journey and rebuild Today as a five-part personal market briefing.

**Architecture:** Keep every existing route and API contract, but add navigation presentation metadata so only four primary jobs and one separated data-reliability utility are shown. Derive headline, curated, remaining, and connection collections from the existing `WorkspaceToday` payload in a pure model, while isolating clearly labelled sample market indicators in the frontend.

**Tech Stack:** React 19, TypeScript 6, TanStack Router, CSS Modules, Node test runner, existing Stock Insight workspace primitives.

## Global Constraints

- The product remains read-only and must not add order execution or buy/sell advice.
- Do not change database schemas, migrations, ingestion jobs, or API response contracts.
- Preserve every existing `/workspace/*` URL, loader, evidence inspector, lane switch, and pagination behavior.
- Hardcoded market indicators must be labelled `샘플 데이터` and must not claim to be live.
- Do not add dependencies, UI providers, or animation runtimes.
- Hidden crypto and merged legacy views remain directly addressable even though they leave primary navigation.

---

### Task 1: Research-journey navigation

**Files:**
- Modify: `apps/web/src/features/workspace-navigation/model/sections.ts`
- Modify: `apps/web/src/widgets/workspace-shell/ui/workspace-navigation.tsx`
- Modify: `apps/web/src/widgets/workspace-shell/ui/workspace-shell.module.css`
- Test: `apps/web/test/workspace-shell-current-contract.test.ts`

**Interfaces:**
- Consumes: existing `WorkspaceSectionId`, route URLs, and navigation counts.
- Produces: `WorkspaceNavigationItem.navigationGroup: 'primary' | 'utility' | 'hidden'` and visible labels `오늘`, `내 종목`, `시장 연결`, `복기`, `데이터 신뢰도`.

- [ ] **Step 1: Write the failing navigation contract test**

```ts
assert.match(sections, /id: 'today', label: '오늘'.*navigationGroup: 'primary'/s);
assert.match(sections, /id: 'stocks', label: '내 종목'.*navigationGroup: 'primary'/s);
assert.match(sections, /id: 'radar', label: '시장 연결'.*navigationGroup: 'primary'/s);
assert.match(sections, /id: 'research', label: '복기'.*navigationGroup: 'primary'/s);
assert.match(sections, /id: 'status', label: '데이터 신뢰도'.*navigationGroup: 'utility'/s);
assert.match(sections, /id: 'crypto'.*navigationGroup: 'hidden'/s);
assert.match(navigation, /item\.navigationGroup !== 'hidden'/);
```

- [ ] **Step 2: Run the targeted test and confirm it fails**

Run: `pnpm --filter @stock-insight/web exec node --test test/workspace-shell-current-contract.test.ts`

Expected: FAIL because navigation groups and new labels do not exist.

- [ ] **Step 3: Add navigation presentation metadata**

Keep all nine route records in `workspaceSections`, rename the four representative records, mark `status` as utility, and mark `market-topic-news`, `crypto`, `themes`, and `history` as hidden. Filter hidden records only inside `WorkspaceNavigation`, and add a utility separator class without removing records from top-bar lookup or route navigation.

- [ ] **Step 4: Run the targeted test**

Run: `pnpm --filter @stock-insight/web exec node --test test/workspace-shell-current-contract.test.ts`

Expected: PASS.

### Task 2: Today briefing derivation model

**Files:**
- Create: `apps/web/src/pages/research-workspace/model/today-briefing.ts`
- Test: `apps/web/test/today-briefing.test.ts`

**Interfaces:**
- Consumes: `WorkspaceToday`, the currently visible `ResearchFeedItem[]`, and `ResearchFeedItem.recordKey`.
- Produces: `sampleMarketIndicators`, `deriveTodayBriefing(data, visibleItems)` returning `{ headlineItems, curatedItems, listItems, connectionItems }` with no repeated record key between headline, curated, and list collections.

- [ ] **Step 1: Write failing pure-model tests**

```ts
const result = deriveTodayBriefing(workspace, selectedLaneItems);
assert.deepEqual(result.headlineItems.map(({ recordKey }) => recordKey), ['must-1', 'must-2']);
assert.deepEqual(result.curatedItems.map(({ recordKey }) => recordKey), ['for-you-1']);
assert.deepEqual(result.listItems.map(({ recordKey }) => recordKey), ['list-1']);
assert.ok(sampleMarketIndicators.every((item) => item.dataState === 'sample'));
```

Also cover empty lanes and a `for_you` item already selected as a headline so deduplication is proven.

- [ ] **Step 2: Run the targeted test and confirm it fails**

Run: `pnpm --filter @stock-insight/web exec node --test test/today-briefing.test.ts`

Expected: FAIL because the model does not exist.

- [ ] **Step 3: Implement the pure derivation**

Use at most three `must_know` items as headlines, at most four direct or related `for_you` items as curated content, remove their record keys from the current list, and use up to three personalized or headline records as connection summaries. Keep the sample KOSPI, NASDAQ, and gold values in a readonly exported array with an explicit sample state and non-live basis label.

- [ ] **Step 4: Run the targeted model test**

Run: `pnpm --filter @stock-insight/web exec node --test test/today-briefing.test.ts`

Expected: PASS.

### Task 3: Five-part Today composition

**Files:**
- Modify: `apps/web/src/pages/research-workspace/ui/views/today-view.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/feed-ledger.module.css`
- Create: `apps/web/test/today-view-structure.test.ts`

**Interfaces:**
- Consumes: `deriveTodayBriefing`, `sampleMarketIndicators`, existing `onSelectRecord`, lane controls, pagination, `WorkspaceState`, `Panel`, and `StructuredList`.
- Produces: five ordered sections with test IDs `today-market-summary`, `today-headline-news`, `today-curated-news`, `today-news-list`, and `today-connection-summary`.

- [ ] **Step 1: Write the failing structure test**

```ts
const ids = [
  'today-market-summary',
  'today-headline-news',
  'today-curated-news',
  'today-news-list',
  'today-connection-summary',
];
const offsets = ids.map((id) => source.indexOf(`data-testid="${id}"`));
assert.ok(offsets.every((offset) => offset >= 0));
assert.deepEqual(offsets, [...offsets].sort((a, b) => a - b));
assert.match(source, /샘플 데이터/);
assert.match(source, /deriveTodayBriefing/);
```

- [ ] **Step 2: Run the targeted structure test and confirm it fails**

Run: `pnpm --filter @stock-insight/web exec node --test test/today-view-structure.test.ts`

Expected: FAIL because the new sections are absent.

- [ ] **Step 3: Implement Today sections in the approved order**

Replace the generic metric-first layout with:

1. a labelled sample market strip;
2. two-to-three selectable headline cards;
3. a personalized curated list with a truthful empty state;
4. the existing lane tabs and pagination over deduplicated remaining items;
5. a compact relationship and risk summary using `whySurfaced`, affected entity keys, confidence, relationship count, and source count.

Use existing buttons and semantic list primitives so every news item still opens the evidence inspector. Preserve lane switch, load-more, selected record, and append reveal behavior.

- [ ] **Step 4: Add responsive CSS**

Use a three-column market strip and headline card grid on wide screens, collapse to two and one columns at existing breakpoints, maintain stable card heights, wrap long Korean titles, and avoid horizontal overflow. Use the existing neutral surfaces and accent tokens.

- [ ] **Step 5: Run Today and workspace tests**

Run: `pnpm --filter @stock-insight/web exec node --test test/today-briefing.test.ts test/today-view-structure.test.ts test/research-workspace-v3-structure.test.ts test/workspace-shell-current-contract.test.ts`

Expected: PASS.

### Task 4: Product verification and graph refresh

**Files:**
- Modify only if required by verification: tests or implementation files from Tasks 1–3.
- Refresh local graph: `graphify-out/` (ignored output).

**Interfaces:**
- Consumes: completed navigation and Today implementation.
- Produces: browser evidence and release-gate evidence.

- [ ] **Step 1: Run formatting and static checks**

Run: `pnpm format:check && pnpm lint && pnpm typecheck`

Expected: all commands pass; existing lint warnings may remain if they are unchanged.

- [ ] **Step 2: Run tests and build**

Run: `pnpm test && pnpm build`

Expected: PASS.

- [ ] **Step 3: Refresh the knowledge graph**

Run: `graphify update .`

Expected: graph update completes; `graphify-out/` remains ignored.

- [ ] **Step 4: Verify the real UI in the in-app browser**

Open the existing local app, authenticate only if a reusable local session is already available, and inspect desktop plus mobile widths. Confirm navigation grouping, the 1–5 section order, sample labelling, no horizontal overflow, and evidence-detail opening. If authentication is unavailable, use the repository's credential-free preview or structural browser gates and report the gap explicitly.

- [ ] **Step 5: Run the full release gate and inspect the diff**

Run: `pnpm verify:release && git diff --check && git status --short`

Expected: release gate passes, diff check is clean, and only the approved docs, navigation, Today model/view, CSS, and tests are changed.
