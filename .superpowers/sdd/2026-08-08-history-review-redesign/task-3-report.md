# Task 3 implementation report

- Added one History detail inspector on the shared `DetailInspectorFrame`: desktop uses the existing 420–760px drawer with 520px default and wide modal, while mobile resolves only to the shared bottom sheet. History width memory uses its own `stock-insight:history-inspector-width` session-storage key.
- Lifted History selection, detail state, and exact opener ownership into `ResearchWorkspacePage`. Every History surface sends the same `historyId` and item to that owner; overlay/Escape closure leaves the selection/detail intact and restores focus to the connected opener, including DOM-programmatic button activation.
- Live History detail is built synchronously from the already loaded item and makes no request. Development preview alone injects a deterministic local loader; `detail-error` rejects its first attempt, preserves the selected base detail, and succeeds on retry. Drawer/modal presentation switching remains inside the frame and does not invoke the loader.
- Judgment detail follows `요약 → 당시 판단 → 당시 근거 → 지금 달라진 점 → 근거 상태 → 다음 확인 조건`; wide modal compares the original judgment/evidence and current change/state in two columns. Automatic observations use only `감지된 변화 → 연결 근거 → 확인 상태` and are never labelled as user judgments.
- Optional sections are omitted, evidence/change failures stay localized, and evidence/news anchors are emitted only for valid HTTPS URLs.
- RED: `pnpm --filter @stock-insight/web exec node --test test/history-briefing-inspector.test.ts` failed 8/8 because the inspector, CSS, independent key, and page wiring did not exist.
- GREEN: the same focused inspector test passed 8/8. The final focused History/shared-frame plus proportional Today/Stocks/Market Connections command passed 72/72; development preview routing passed 14/14.
- Static verification: `pnpm --filter @stock-insight/web typecheck` passed; changed-file `oxlint`, changed-file `oxfmt --check`, and `git diff --check` passed.
- Graph verification: `graphify update .` completed with the repository's pre-existing skill-version, SQL-parser, and large-graph warnings; ignored graph output was not staged.
