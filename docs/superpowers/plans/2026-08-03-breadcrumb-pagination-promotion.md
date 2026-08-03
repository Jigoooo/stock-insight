# Breadcrumb + Pagination Shared UI Promotion Plan

**Goal:** Promote the user-approved 3C Breadcrumb A/B/C and Pagination A/B/C UI Lab designs into reusable `shared/ui` components, migrate the catalog to those public APIs, and audit real product adoption without inventing route hierarchy or page totals.

**Approved variants:**

- Breadcrumb: `hairline`, `soft-inset`, `ledger`
- Pagination: `hairline`, `soft-inset`, `ledger`
- Pagination ellipsis uses the canonical shared `Select` with a compact trigger and `popupMinWidth`.

**Global constraints:**

- Preserve current local-only UI Lab selection behavior and existing query string.
- Preserve the current cursor APIs, data fetching, append behavior, error states, and product information architecture.
- Do not fabricate breadcrumb hierarchy or numeric page totals in product screens.
- Shared components own selected, focus, disabled, responsive, and reduced-motion visuals. UI Lab CSS owns only catalog layout.
- No provider, dependency, Tailwind Preflight, or animation runtime changes.
- Keep all existing dirty worktree edits; do not revert or overwrite unrelated user changes.

## Task 1: Shared Breadcrumb and Pagination public APIs

**Files:**

- Create `apps/web/src/shared/ui/breadcrumb/breadcrumb.tsx`
- Create `apps/web/src/shared/ui/breadcrumb/breadcrumb.module.css`
- Create `apps/web/src/shared/ui/breadcrumb/index.ts`
- Create `apps/web/src/shared/ui/pagination/pagination.tsx`
- Create `apps/web/src/shared/ui/pagination/pagination.module.css`
- Create `apps/web/src/shared/ui/pagination/index.ts`
- Modify `e2e/fixtures/control-public-props/main.tsx`
- Create or modify a focused Node contract test under `apps/web/test/`

**Required API:**

- Breadcrumb: `Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbPage`, `BreadcrumbSeparator`, `BreadcrumbEllipsis`, `BreadcrumbVariant`.
- Pagination: `Pagination`, `PaginationList`, `PaginationItem`, `PaginationLink`, `PaginationPrevious`, `PaginationNext`, `PaginationEllipsis`, `PaginationStatus`, `CursorPagination`, `CursorPaginationMessage`, `CursorPaginationAction`, `PaginationVariant`.
- Link/action primitives must support `asChild` composition so TanStack links or local buttons can preserve semantics.
- Pagination `soft-inset` owns a Motion layout indicator with a root-scoped layout id; reduced motion removes interpolation.
- Desktop targets remain compact; 390px interactive targets are at least 44px.

**Verification:**

- Start with failing public API/fixture contracts.
- Run focused Node tests, fixture typecheck, web typecheck, oxlint, oxfmt, and `git diff --check`.

## Task 2: UI Lab migration and product-use audit

**Files:**

- Modify `apps/web/src/pages/ui-lab/ui/breadcrumb-mockup.tsx`
- Modify `apps/web/src/pages/ui-lab/ui/pagination-mockup.tsx`
- Modify `apps/web/src/pages/ui-lab/ui/location-navigation-catalog.module.css`
- Modify `e2e/ui-lab-location-navigation.spec.ts`
- Modify `docs/superpowers/UI-SYSTEM-ROLLOUT.md`

**Requirements:**

- Replace mockup-owned breadcrumb and pagination structure/state styling with `@/shared/ui/breadcrumb` and `@/shared/ui/pagination` imports.
- Keep all approved A/B/C previews and current local selection interactions.
- Keep the canonical shared Select page picker and the 38px compact option contract.
- Remove UI Lab selectors that own current, focus, disabled, indicator, and target state.
- Audit route hierarchy and record `no suitable product breadcrumb use yet` because no visible hierarchy owner exists.
- Replace the duplicated Today, Radar, and History cursor footer layout with `CursorPagination`, `CursorPaginationMessage`, and `CursorPaginationAction` while preserving each handler, opaque cursor contract, label, test id, loading, error, disabled, and retry behavior. Do not introduce numeric totals.

**Verification:**

- Run the focused 3C Playwright suite for desktop/mobile, Axe, reduced motion, mobile targets, and URL stability.
- Run focused Node tests, web typecheck, oxlint, oxfmt, and `git diff --check`.

## Task 3: Rollout closure

- Mark 3C `검증 완료`, record approved variants, shared APIs, product-use audit, browser evidence, and targeted test evidence.
- In the existing Codex in-app browser tab, verify all six variants, Select page jump, keyboard behavior, mobile layout, and no page overflow.
- Run `graphify update .`.
- Leave 3D Stepper + CommandPalette as the next active mockup bundle.
