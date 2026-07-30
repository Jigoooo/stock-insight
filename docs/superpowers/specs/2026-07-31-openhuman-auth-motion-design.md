# OpenHuman authentication and Motion migration design

## Global constraints

- Reproduce the approved OpenHuman-like authentication composition without copying OpenHuman GPL source.
- Do not install SaaS UI, Chakra UI, Tailwind CSS, Animate UI, Radix UI, Base UI, or Headless UI.
- Install `motion` and import React animation APIs from `motion/react`.
- Use `MotionConfig reducedMotion="user"` as the only global animation configuration.
- Remove every JavaScript GSAP use and remove `gsap` plus `@gsap/react` after migration.
- Keep simple CSS color/border transitions and loading-spinner keyframes.
- Preserve all authentication validation, submission, enrollment, availability, and redirect behavior.
- Keep the authentication wordmark text-only: `Futur Insight`.
- Follow the OS light/dark preference without an authentication theme toggle.
- Keep public-auth startup free of authenticated workspace and toast code.
- Preserve existing shared component APIs where practical.
- Restyle and recompose the complete shared control layer with SaaS UI-style anatomy and Animate UI-style Motion, so product call sites inherit one coherent system instead of page-local replicas.
- Implement tests before production changes and observe each targeted test fail for the intended reason.
- Keep Animate UI MIT attribution in any file that substantially copies source rather than independently reproducing its public behavior.

## Task 1: Motion foundation and local Animate UI primitives

- Add failing structural and behavior tests for the `motion` dependency, root `MotionConfig`, `MotionButton`, `Effect`, `Effects`, and `PresenceRegion`.
- Add `motion` to `apps/web`; do not remove GSAP yet.
- Add `MotionConfig reducedMotion="user"` at the web application root without pulling authenticated-only code into public auth startup.
- Implement local Motion primitives under `shared/ui/motion`:
  - `MotionButton` extends `HTMLMotionProps<"button">` with `hoverScale` and `tapScale`.
  - Defaults are hover `1.012`, tap `0.978`, and a short spring.
  - `Effect` supports fade, slide, zoom, blur, delay, in-view, once, and margin.
  - `Effects` staggers direct React-element children.
  - `PresenceRegion` wraps keyed conditional content in `AnimatePresence`.
- Export the new primitives from the local motion boundary.
- Run the focused tests, web typecheck, and web lint.

## Task 2: Provider-free SelectBox and Combobox

- Add failing behavior and structure tests for keyboard navigation, selection, filtering, empty results, disabled options, dismissal, and accessible relationships.
- Implement local, Provider-free `SelectBox` and `Combobox` primitives using React, semantic tokens, CSS Modules, and Motion.
- Use a shared option type with `value`, `label`, optional `description`, and optional `disabled`.
- `SelectBox` supports controlled and uncontrolled single selection and native form submission through a hidden input.
- `Combobox` supports controlled query/value, local label filtering by default, custom filtering, clear behavior, and an explicit empty state.
- Follow the WAI-ARIA combobox/listbox keyboard model: Arrow keys, Home, End, Enter, Escape, Tab, and type/search input.
- Replace the two native selects on the admin invitation form with `SelectBox` without changing submitted field names or values.
- Do not replace unrelated workspace search inputs.
- Run focused unit tests, admin invitation tests, typecheck, lint, and the relevant browser accessibility check.

## Task 3: Whole-product SaaS UI and Animate UI control adoption

- Update the primitive adoption and UI structure tests first so they fail until the whole shared control layer uses the new anatomy and Motion foundation.
- Recompose and restyle the shared `Button`, `IconButton`, `TextInput`, `Textarea`, `Field`, `SearchField`, `Switch`, `Toggle`, `SegmentedTabs`, `TextLink`, `SelectBox`, and `Combobox` primitives:
  - Use explicit root/control/label/description/error/indicator anatomy where the control type needs it.
  - Use semantic tokens and CSS Modules; do not introduce a theme Provider or utility-CSS runtime.
  - Use `MotionButton`, `Effect`, `PresenceRegion`, or declarative Motion props for interactive and presence behavior.
  - Keep established public props and APG behavior unless an additive compatibility prop is required.
  - Keep target sizes, focus visibility, forced-colors behavior, reduced-motion behavior, and disabled/pending truth.
- Remove page-local visual duplication where a shared primitive owns the same behavior, but do not flatten deliberate page composition or change product copy.
- Run primitive, control, segmented-tab, design-hard, auth structure, typecheck, lint, and focused Playwright accessibility tests.

## Task 4: Whole-product feedback, surface, and adoption cleanup

- Update primitive adoption tests first so they fail until shared feedback and surface components use the new anatomy and Motion foundation.
- Recompose and restyle `Card`, `StatusBadge`, `DataQualityPopover`, `EmptyState`, `ErrorState`, `Skeleton`, and toast surfaces with semantic tokens, restrained depth, and local Motion.
- Remove page-local visual duplication where a shared primitive owns the same behavior, but preserve deliberate page composition and product copy.
- Ensure all product control call sites use shared primitives; raw HTML controls are allowed only inside primitive implementations or where native semantics are intentionally required and documented.
- Keep truthful availability/source semantics, existing test ids, loading-delay behavior, toast pause/dismiss/swipe behavior, and public-auth lazy loading.
- Run primitive adoption, product design system, design-hard, root startup, workspace structure, typecheck, lint, build, and focused browser accessibility tests.

## Task 5: OpenHuman-style login and signup

- Add failing structure/browser assertions for the shared auth shell, text-only wordmark, absence of legacy marketing chrome and theme toggle, responsive card, and Motion presence behavior.
- Replace the split authentication layout with a shared centered shell:
  - Max card width approximately 420px.
  - 16px radius, thin semantic border, restrained soft shadow.
  - Low-contrast financial grid and desaturated market glow.
  - No eyebrow, chip, badge, gradient text, large marketing headline, or decorative logo icon.
- Preserve login fields, custom validation, focus-first-invalid behavior, password visibility, pending state, errors, redirect, and signup link.
- Preserve signup availability states and all four signup fields; switch states inside the same card with `AnimatePresence`.
- Use `MotionButton`, `Effect`, and `PresenceRegion`; reduced motion keeps opacity feedback and removes transform/layout movement.
- Run auth unit tests, login/signup Playwright suites at desktop and 390px, dark mode, reduced motion, and Axe.

## Task 6: Shared GSAP migration

- Update existing motion/controller tests first so they fail on GSAP ownership and describe Motion ownership.
- Migrate shared interaction motion, motion regions, control motion, field halo, and toast motion to Motion while preserving public APIs and interaction recipes.
- Keep fine-pointer hover gating, disabled/inert guards, interruptibility, quiet opacity feedback, and reduced-motion normalization.
- Preserve lazy toast startup and Sonner behavior.
- Run the focused motion, primitive, root-startup, toast, typecheck, and lint checks.

## Task 7: Research workspace GSAP migration and cleanup

- Update workspace motion tests first to require Motion and preserve existing transition/state contracts.
- Migrate append reveal, relation crossfade, and overlay motion to Motion without changing authoritative navigation, focus, inert, or mounted-through-exit semantics.
- Keep overlays free of scale, blur, backdrop-filter, and layout animation.
- Remove all remaining GSAP imports, then remove `gsap` and `@gsap/react` from the package and lockfile.
- Update repository motion documentation from CSS/GSAP to CSS/Motion.
- Run `graphify update .`.
- Run format check, lint, typecheck, unit tests, build, full E2E, and `git diff --check`.
