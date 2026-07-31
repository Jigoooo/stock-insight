# Task 5 report — OpenHuman-style authentication shell

## Status

Complete and locally verified. Login and signup now share one restrained, system-theme authentication
shell while preserving the existing validation, pending, availability, enrollment-code, and redirect
contracts.

## Changed behavior and structure

- Added `AuthShell`, a shared public-auth composition with a text-only `Futur Insight` wordmark,
  approximately 420px card, 16px radius, thin semantic border, and low shadow.
- Replaced the previous marketing-led auth backdrop with a restrained financial grid and
  desaturated blue/green market glows. There is no logo icon, eyebrow, chip, gradient text,
  decorative badge, theme toggle, or large promotional heading.
- Login and signup now use the same card, field rhythm, footer navigation, and shared Motion-backed
  button primitives.
- Login keeps username/password validation, first-invalid-field focus, password visibility,
  pending state, server feedback, and sanitized redirect behavior.
- Signup keeps the enrollment-code availability request and the
  `checking`/`available`/`unavailable`/`error` state machine. Available enrollment transitions to
  the account form inside the same card.
- `Effect` provides the shell entrance and `PresenceRegion` owns signup status/form replacement.
  Auth transitions are opacity-only so `prefers-reduced-motion` never leaves transformed initial
  geometry behind.
- The page follows the OS light/dark preference without adding a manual theme control.

## TDD evidence

### RED

Command:

`pnpm --filter @stock-insight/web exec node --test test/login-page-structure.test.ts test/signup-page-structure.test.ts`

Observed before production edits:

- 11 tests
- 9 passed
- 2 failed
- Failures required the missing shared `auth-shell.tsx` and the signup `PresenceRegion` contract.

The first browser visual gate also failed 8/8 because reduced motion could retain the Effect's
initial `translateY(12px)`. The shell and signup state transition were narrowed to opacity-only
motion; the same gate then passed 8/8.

### Review fix — unique signup heading reference

The first implementation used the default synchronous presence transition. During the 180ms
crossfade, the exiting and entering views both exposed `id="signup-form-heading"`, so the
`main[aria-labelledby]` reference temporarily resolved to two elements.

A browser mutation probe was added before the production fix for each
`checking` → `available`/`unavailable`/`error` path. It observed RED at 0/3 passed, including the
duplicate reference. `PresenceRegion` now uses `mode="wait"`, retaining the exiting heading until
it is removed and only then mounting the next heading. The same probe passes 6/6 across desktop
and mobile, and verifies every recorded `aria-labelledby` resolution has a count of exactly one.

### GREEN

- Focused auth/root structure suite: 19 passed, 0 failed.
- Full web unit suite: 462 passed, 0 failed.
- Login/signup desktop and mobile E2E: 26 passed, 0 failed, 4 credential-gated tests skipped,
  including six unique-heading transition probes.
- Auth visual/Axe gate: 8 passed, 0 failed across desktop/mobile, light/dark, and reduced motion.
- Available-signup visual fixture: 2 passed, 0 failed.

## Browser evidence

Stable screenshots are stored in `/private/tmp/stock-insight-auth-visuals`:

- `login-desktop-light-reduced.png`
- `login-desktop-dark-reduced.png`
- `login-mobile-light-reduced.png`
- `login-mobile-dark-reduced.png`
- `signup-desktop-light-reduced.png`
- `signup-desktop-dark-reduced.png`
- `signup-mobile-light-reduced.png`
- `signup-mobile-dark-reduced.png`
- `signup-available-desktop-light-reduced.png`
- `signup-available-mobile-dark-reduced.png`

The available-signup browser fixture returns a TanStack-compatible serialized server-function
response and is active only inside the opt-in visual test.

## Validation

- `pnpm --filter @stock-insight/web format:check` — passed
- `pnpm exec oxfmt --check e2e/auth-login.spec.ts e2e/auth-signup.spec.ts e2e/auth-visual.spec.ts`
  — passed
- `pnpm --filter @stock-insight/web lint` — passed
- `pnpm exec oxlint e2e/auth-login.spec.ts e2e/auth-signup.spec.ts e2e/auth-visual.spec.ts`
  — passed
- `pnpm --filter @stock-insight/web typecheck` — passed
- `pnpm --filter @stock-insight/web build` — passed
- `git diff --check` — passed

## Risks and boundaries

- Credential lifecycle E2E remains skipped when the dedicated enrollment/login environment
  variables are absent; static, unit, browser, accessibility, type, lint, and build gates pass.
- The visual available-state mock verifies presentation and state replacement only. Production
  enrollment networking and response parsing are unchanged.
- `graphify update .` could not rebuild inside this worktree because its watcher returned
  `Operation not permitted`; no graph output was committed.
- No OpenHuman GPL source or Animate UI package code was copied. The implementation uses the
  project-owned shell, CSS Modules, and shared Motion primitives.
