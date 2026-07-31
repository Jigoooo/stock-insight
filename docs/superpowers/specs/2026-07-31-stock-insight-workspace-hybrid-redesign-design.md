# Stock Insight workspace A+B hybrid redesign

## Goal

Extend the approved OpenHuman-like authentication language across every authenticated product
surface without changing route, data, authorization, or research semantics.

The internal application uses the approved A+B hybrid:

- B is the default: a quiet 210px text sidebar with grouped navigation.
- A is the compact state: a 68px icon rail that preserves the same route order and active state.
- Mobile removes the persistent rail and opens navigation in an Animate UI Sheet.
- The C direction, a global horizontal tab bar without a sidebar, is excluded.

The finished application must feel like one product from login through the eight research views,
evidence detail, administration, loading, empty, error, and pending states.

## Current source audit

- The current authentication and Motion work lives on `codex/openhuman-auth-motion`, which is 19
  commits ahead of and 2 commits behind `master`. It is not merged.
- The branch also has an uncommitted Tailwind v4, shadcn source, Animate UI Button, auth token, and
  authentication polish change set. This must be committed and integrated before the workspace
  redesign starts.
- The authenticated workspace has eight route-owned views: today, radar, stocks, crypto, themes,
  research, history, and status. The invitation administration page is the other authenticated
  product surface.
- `research-workspace-page.tsx` is 1,182 lines and its CSS module is 3,181 lines. Shell, navigation,
  panels, rows, tables, graphs, detail surfaces, overlay styling, and view-specific rules are
  coupled in that module.
- Authentication already proves the intended integration model: Tailwind utilities and official
  registry source for primitives, CSS Modules for page composition, semantic design-profile
  tokens, and no UI Provider.
- Login and signup feedback currently switch pending and error text through conditional rendering
  inside a stable slot, but they do not have keyed presence behavior. That state change is the
  source of the perceived blink.

## Design system decision

### Source hierarchy

1. OpenHuman defines composition, restraint, surface tone, and typography.
2. Animate UI official registry source defines motion and interactive component behavior.
3. shadcn official source supplies unanimated structural primitives when Animate UI does not own
   the component.
4. SaaS UI is an anatomy reference for AppShell, Page, Toolbar, Property, StructuredList,
   DataTable, EmptyState, and feedback composition. No SaaS UI or Chakra code, dependency, theme
   Provider, or runtime is added.

The existing Tailwind v4 setup remains build-time only with Preflight disabled. Official registry
files retain upstream attribution. Page-specific layout and visualization styling stays in CSS
Modules. No second component library or Provider is introduced.

### Visual language

- Use the current neutral `calm-market` profile: off-black or off-white canvas, one warm-neutral
  gray family, low-chroma sage as the only supporting accent, thin borders, and shallow tinted
  shadows.
- Use `Stock Insight` on visible authentication, workspace, administration, and route-title
  branding. Internal package names and API contracts do not change.
- Use 10px to 12px radii for controls and inner surfaces and 14px to 16px radii only for major
  containers. Avoid pill styling except where the semantics require a compact status.
- Prefer structured rows, property lists, tables, and spacing over repeated generic cards.
- Keep financial values tabular, copy sentence-cased, and disclosure wording read-only and
  non-advisory.

## Application shell

### Desktop and compact behavior

- At 1240px and wider, render the 210px text sidebar by default.
- From 768px through 1239px, render the 68px compact rail by default.
- A shell toggle switches between expanded and compact states without remounting navigation or
  route content. The override lasts for the mounted authenticated shell and resets to the
  responsive default after a full reload.
- The collapsed rail exposes every label through Animate UI Tooltip and retains counts, active
  state, pending state, focus order, and real route links.
- The content column always uses the space released by the rail. The shell transition is a short
  Motion width transition with no spring overshoot. Reduced motion applies the final width
  immediately.

### Mobile behavior

- Below 768px, remove the persistent sidebar from layout and open the same navigation content in
  an Animate UI Radix Sheet.
- Preserve the current focus trap, inert, Escape, scrim, return-focus, and route-link behavior.
- Closing the Sheet and committing a route must not animate the page content or create a duplicate
  navigation tree.

### Top bar and page frame

- Keep one 56px to 60px top bar for the current section label, navigation status, search, and
  contextual actions.
- Keep the workspace view keyed by the committed route. Route pending state appears in the top bar
  and does not fade or translate the entire page.
- Standardize each view on `PageHeader`, optional `MetricStrip`, then one or more `Panel` or
  `DetailSurface` regions.

## Component architecture

### Registry-backed primitives

Import or refresh official source for the components required by the product:

- Animate UI Button, Radix Sidebar, Tabs, Sheet, Tooltip, Collapsible or Accordion, Popover, and
  restrained Fade, Slide, and AutoHeight effects.
- shadcn Input, InputGroup, Field, Label, Card anatomy, Table anatomy, Separator, ScrollArea,
  Skeleton, Badge, and supporting utility functions.

Registry source keeps its public API and upstream license notice. Product wrappers may set
semantic variants and calm motion values but must not fork primitive behavior through page CSS.

### Product compositions

Build repository-owned compositions over those primitives:

- `WorkspaceShell`: expanded, compact, and mobile navigation ownership.
- `WorkspaceNavigation`: route items, grouping, counts, active and pending truth, Tooltip labels.
- `WorkspaceTopbar`: current section, search, route progress, and contextual actions.
- `PageHeader`, `MetricStrip`, `Panel`, `PanelHeader`, and `DetailSurface`.
- `DataTable`, `StructuredList`, `PropertyList`, `Timeline`, and `StatusSummary`.
- `WorkspaceState`: loading, empty, error, stale, partial, and unavailable states.
- `AuthFeedbackRegion`: idle, pending, and error presence within a fixed geometry.

Keep semantic HTML and existing accessibility contracts inside these compositions. Do not create
visual wrappers that hide native table, list, details, navigation, or form semantics.

### CSS ownership

- Split the 3,181-line workspace stylesheet into shell/navigation, shared workspace surfaces, and
  view-specific modules.
- Tailwind classes own registry component states and variants.
- CSS Modules own responsive grids, page composition, visualization canvases, and product-specific
  data density.
- Page CSS must not redefine registry button transforms, input focus rings, Sheet transitions, or
  Tabs indicators.

## View conversion

Apply the shared shell and surface system to all authenticated routes in one implementation branch:

- Today: metric strip, Animate UI Tabs for lanes, structured feed rows, stable load-more feedback,
  and the evidence detail surface.
- Radar: mode tabs, signal ledger, strength visuals, tables, timeline, map shell, and mode-specific
  empty or unavailable states.
- Stocks: research table, selected-row state, responsive deep-dive region, property groups, and
  relation detail.
- Crypto: summary, research panels, evidence and limitation surfaces, and unsupported states.
- Themes: theme structured list, selected theme state, relation graph frame, text fallback, and
  evidence disclosure.
- My research: watchlist, personalization and decision-support panels, property lists, and
  read-only boundaries.
- History: timeline or structured rows, pagination, status and retrospective details.
- Status: health summaries, source coverage, freshness and limitation properties.
- Invitation administration: page shell, form fields, SelectBox, table or structured list, one-time
  code disclosure, empty, pending, success, and error states.

Business copy, route URLs, loaders, API calls, query parameters, focus restoration, test IDs, and
authorization behavior remain unchanged unless visible branding currently says `Futur Insight`.

## Motion and feedback

- Motion intensity is restrained. Use motion only for navigation width, Sheet presence, Tabs
  indicator movement, disclosure height, overlay presence, row append reveal, relation
  crossfade, toast, and explicit state feedback.
- Buttons use the calm authentication scale: hover `1.01`, tap `0.985`. Small icon, disclosure,
  table-row, and navigation controls use opacity or background feedback without scale.
- Panels and cards do not independently rise, bounce, or animate on every render.
- Loading spinners and finite skeleton effects remain bounded and respect reduced motion.

### Authentication feedback

Replace the separate pending and conditional error nodes with `AuthFeedbackRegion`.

- The slot keeps a fixed minimum height so buttons and fields never shift.
- Presence keys are `idle`, `pending`, and `error`; pending-to-error transitions crossfade in the
  same grid cell.
- Normal motion uses opacity plus a 2px vertical offset over 140ms to 170ms with ease-out. Exit is
  shorter than enter and never flashes the background.
- Reduced motion removes translation and either uses a short opacity-only transition or commits
  immediately when the operating system requests minimal motion.
- Error uses one assertive live region. Pending uses one polite status. Hidden or exiting content
  must not be announced twice.
- Login and signup share the component and preserve validation, pending, enrollment, availability,
  redirect, and focus-first-invalid behavior.

## Integration and delivery

1. Finish the current authentication branch before workspace implementation:
   - commit the uncommitted registry and auth polish change set;
   - merge the two current `master` commits into `codex/openhuman-auth-motion`;
   - resolve the README and root package overlap while preserving both development launcher and UI
     release scripts;
   - run the full branch gate;
   - merge the verified branch into `master` with a merge commit.
2. Create `codex/workspace-openhuman-redesign` from the updated `master`.
3. Implement the entire internal redesign on that branch through reviewable internal checkpoints:
   foundation, shell, shared surfaces, route views, administration and auth feedback, then final
   cleanup.
4. Do not merge a partially converted workspace into `master`. The final merge happens only after
   every authenticated route passes the shared visual, behavioral, accessibility, and
   reduced-motion gates.

## Verification

- Lock existing route, loader, query, authorization, form, focus, overlay, table, graph, and
  pagination behavior before visual conversion where coverage is missing.
- Add component tests for expanded or compact navigation, responsive defaults, Tooltip labels,
  mobile Sheet focus and inert behavior, Tabs keyboard behavior, stable feedback geometry, and
  reduced motion.
- Add visual comparisons at 1440px expanded, 1180px compact, 768px boundary, and 390px mobile in
  light and dark modes.
- Exercise all eight workspace routes plus invitation administration for overflow, scroll
  ownership, selected states, loading, empty, error, partial, stale, and unavailable states.
- Verify login and signup pending-to-error transitions do not move the submit button, do not
  duplicate live-region announcements, and do not replay transform motion under reduced motion.
- Run Axe on authentication, every workspace route, the evidence inspector, mobile Sheet, stock
  deep dive, relation text fallback, and invitation administration.
- Final gate: format check, lint, typecheck, all unit tests, build, authentication E2E, workspace
  E2E, administration E2E, visual E2E, motion performance, `git diff --check`, and
  `graphify update .`.

## Explicit exclusions

- No SaaS UI, Chakra UI, Aceternity, Animata, Smooth UI, or other UI runtime.
- No change to APIs, schemas, database behavior, authentication contracts, route URLs, or
  read-only product boundaries.
- No horizontal global navigation direction from option C.
- No broad marketing page, public 404, or unrelated copy redesign.
- No full Tailwind rewrite of visualization or page-layout CSS.
- No new user preference persistence or server-side layout setting in this pass.
