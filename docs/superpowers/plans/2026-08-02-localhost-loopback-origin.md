# Localhost loopback origin implementation plan

**Goal:** Allow authenticated mutations from either `localhost` or `127.0.0.1` during local live development without weakening production origin checks.

**Architecture:** Keep the configured application origin as a single canonical value. Extend only the shared CSRF comparator so canonical loopback origins with matching protocol and port can use equivalent loopback hostname aliases.

**Tech stack:** TypeScript, Node test runner, pnpm workspace checks.

---

### Task 1: Capture loopback alias behavior

**File:** `apps/web/test/csrf-origin.test.ts`

1. Add assertions for `localhost` and `127.0.0.1` in both directions.
2. Add rejection assertions for a different port, protocol, non-loopback host, and lookalike hostname.
3. Run the focused test and confirm the new positive assertions fail with the current exact-match implementation.

### Task 2: Implement bounded loopback equivalence

**File:** `apps/web/src/server/auth/csrf-origin.ts`

1. Preserve canonical-origin validation for both inputs.
2. Return true immediately for exact matches.
3. Otherwise require matching protocol and port and require both hostnames to be recognized loopback aliases.
4. Run the focused test and confirm all cases pass.

### Task 3: Verify and publish

1. Run the web test suite, formatting check, lint, typecheck, and build.
2. Run `graphify update .` and `git diff --check`.
3. Review the final diff for unrelated or secret-bearing changes.
4. Commit only the approved Stock Insight changes on `master` and push `master`.
