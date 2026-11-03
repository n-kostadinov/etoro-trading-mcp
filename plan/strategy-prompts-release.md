# Add strategy-prompt tools, sync to Swagger v1.408.0, release v1.4.0

## Goal

**Intended outcome.** Unblock the daily job after today's scheduled failure
(`41623433927`): re-align the package with eToro's current Swagger **v1.408.0**,
which added two operations under the existing `Data` tag — `listStrategyPrompts`
(`GET /api/v1/data/strategy-prompts`) and `getStrategyPrompt`
(`GET /api/v1/data/strategy-prompts/{id}`), both non-deprecated — growing the
`data` toolset 5→7 and the catalog to **159 operations across 26 toolsets**, and
publish it as **v1.4.0** through the existing tag-driven Release workflow (npm
with provenance + GitHub release with CHANGELOG-driven notes). Per the
maintainer's decision, **the pinned-baseline design stays as is** — this run only
updates the pin values.

**Observable success criteria.**

1. All pinned baselines match the regenerated catalog (159 operations / 26
   toolsets / empty warnings); `npm run verify` passes.
2. A `workflow_dispatch` Swagger-sync run on `main` completes successfully with
   `action: none` — today's `expected 157, got 159` failure is resolved and the
   daily job is healthy.
3. `npm run release:validate -- v1.4.0` prints `"valid": true` on the release
   commit; CI is green on `main`.
4. Release workflow succeeds for tag `v1.4.0`: GitHub release published
   non-draft with the generated notes (changelog section + baseline: v1.408.0,
   SHA-256, 159 ops / 26 toolsets, surfaces consistent);
   `npm view etoro-trading-mcp@1.4.0` returns metadata with provenance.

**Scope.**

1. **Preparation commit on `main`** (single commit, the established playbook):
   force-add the approved plan; update every pinned baseline in the five test
   files to the live v1.408.0 values — `tests/unit/generated-catalog.test.ts`
   (unique IDs 157→159 at line 30, operations 157→159 at line 38, **warnings pin
   back to `toEqual([])`** at line 41 — the portal documents have caught up:
   `getClubs` and both new ops are now in the core portal doc, so the
   publication warning disappears); `tests/unit/compile-tool-catalog.test.ts:76`
   (157→159); `tests/unit/cli-inspection.test.ts:40,59` (157→159);
   `tests/integration/stdio-contract.test.ts:342-343,357-358` (157→159).
   Unchanged pins verified against the live documents: toolsets 26, deprecated
   15, sourceDeprecated 3, max-ID-length 87.
2. **The update:** `npm run sync:swagger` on a clean tree → downloads v1.408.0,
   regenerates (guard passes: tag set unchanged), internal verify passes first
   try, pushes `swagger/v1.408.0/<hash>`, opens the sync PR; review
   `artifacts/swagger-diff.md` (expect `+listStrategyPrompts`,
   `+getStrategyPrompt`, no removals, parameter/schema churn from the skipped
   v1.406/v1.407, publication sets consistent); merge manually.
3. **Release commit on `main`:** dated `CHANGELOG.md` `[1.4.0] - 2026-11-03`
   section (Added: the two strategy-prompt tools under `data`; Changed: catalog
   refreshed v1.405.0 → v1.408.0, 159 tools / 26 toolsets, publication surfaces
   consistent again after the portal documents caught up); `package.json` + both
   lockfile fields → 1.4.0; hand-maintained docs — `README.md` (line 25 tool
   count **156→159**, table `data` row 5→7, `npx@1.4.0`, "Current release" →
   1.4.0 / v1.408.0), `INSTALL.md` (all version refs → 1.4.0 **and** the stale
   `catalogOperationCount: 156` / "28 of 156" → 159, missed since v1.3.0),
   `server.json` (both `version` fields → 1.4.0, description tool count
   157→159).
4. **Cut the release:** push, `release:validate`, tag `v1.4.0` on `main` HEAD,
   push only the tag, monitor the workflow, verify notes/npm; then the dispatch
   verification run.

**Non-goals.** No change to the pinned-baseline test design or the sync
script's verify-inside-sync gate (maintainer decision: pins stay); no
runtime/`src` changes beyond generated files; no rewrite of the v1.3.0
changelog entry (its "absent from portal documents" statement was true at its
publication time).

**Constraints, assumptions, decisions.**

- Same release machinery as the three prior releases: tag-driven only, local
  `npm publish` forbidden, `NPM_TOKEN`/`production` proven.
- **Version 1.4.0 (minor):** purely additive upstream change; consistent with
  the repo's minor-bump precedent for catalog growth.
- Accepted transient: between the preparation commit and the sync merge, `main`
  CI is red (pins expect 159 while the on-disk catalog is 157) — the
  established window.
- Research-verified (2026-11-03, live fetches of all three documents): swagger
  v1.408.0 with 159 ops; core portal has `getClubs` + both new ops (unclassified
  set empty → warnings `[]`); no removals; tag set unchanged at 26; example
  toolset count 28 unaffected (new ops are `data`).
- **Found defect corrected en route (non-material):** `README.md:25` ("156
  fine-grained MCP tools") and `INSTALL.md:107,191` (`catalogOperationCount:
  156`, "28 of 156") went stale at v1.3.0 (catalog 157) because both plans swept
  only version strings; this release's count sweep fixes them at 159.
- Assumption: v1.408.0 stays published through execution (stable across checks
  ~30 minutes apart); a materially different live delta returns to this goal
  gate.

**Test level.** No new tests. Task 1 updates existing baseline pins (unit +
integration, existing suites) to values verified against the live documents;
the full suites run inside `npm run verify` at tasks 2, 3, and 4.

## Tasks

| ID | Task | Completion criterion | Dependencies | Status |
|---:|---|---|---|---|
| 1 | Preparation commit on `main` (single commit): force-add the approved plan; update all pinned baselines to the live v1.408.0 values — `generated-catalog.test.ts` lines 30/38 (157→159) and line 41 (warnings pin → `toEqual([])`); `compile-tool-catalog.test.ts:76`, `cli-inspection.test.ts:40,59`, `stdio-contract.test.ts:342-343,357-358` (all 157→159) — plus a `grep -rn "157" tests/` sweep proving no count pin remains | `git log origin/main` shows the commit; `grep` sweep returns no catalog-count `157` pins; `git status` clean | None | Completed |
| 2 | Pre-flight the live document (version, 159 ops, empty unclassified set), then run `npm run sync:swagger` on the clean tree: download v1.408.0, regenerate, push `swagger/v1.408.0/<hash>`, open the sync PR; review `artifacts/swagger-diff.md` — expect `+listStrategyPrompts`, `+getStrategyPrompt`, no removals, publication sets consistent | PR titled `chore: sync eToro Swagger v1.408.0` exists; script's internal `npm run verify` passes on the first attempt; diff report matches expectations; all 6 PR CI checks pass | 1 | Completed |
| 3 | Merge the sync PR manually and update local `main` | `main` HEAD contains the sync commit; `node` check on `docs/data/tool-catalog.json` reports `sourceVersion: v1.408.0`, 159 operations, 26 toolsets, `data` = 7, `warnings: []`; `npm run verify` passes on `main` | 2 | Completed |
| 4 | Release commit on `main`: dated `CHANGELOG.md` `[1.4.0]` section (Added/Changed per approved goal); `package.json` + both `package-lock.json` version fields → 1.4.0 via `npm version --no-git-tag-version`; `README.md` (line 25 tool count 156→159, table `data` row 5→7, `npx@1.4.0` refs, "Current release" → 1.4.0 / v1.408.0); `INSTALL.md` (all version refs → 1.4.0, `catalogOperationCount` 156→159, "28 of 156"→"28 of 159"); `server.json` (both `version` fields → 1.4.0, description 157→159) | On the release commit: `npm run verify` green; greps confirm `data` row shows 7, no `156`/`157` count refs remain in README/INSTALL/server.json, no `1.3.0` remains in README/INSTALL/server.json, both lockfile fields 1.4.0 | 3 | Completed |
| 5 | Push the release commit to `origin/main`, then `npm run release:validate -- v1.4.0` | Command prints `"valid": true` (tag/lockfile/changelog/registry-unpublished/main-ancestry checks all pass) | 4 | Completed |
| 6 | Tag `v1.4.0` on `main` HEAD, push only the tag, monitor the Release workflow to completion, verify the published artifacts | Workflow run for tag `v1.4.0` succeeds; `gh release view v1.4.0` is non-draft with the 1.4.0 changelog section and baseline (v1.408.0, SHA-256, 159 ops / 26 toolsets, consistent surfaces); `npm view etoro-trading-mcp@1.4.0` returns version + `dist.attestations.provenance` (retry up to ~5 minutes for registry propagation) | 5 | Completed |
| 7 | Unblock verification of the daily job: trigger a `workflow_dispatch` Swagger-sync run on `main` | The run completes successfully with `action: none`; `gh run list --workflow "Swagger sync"` shows the green run superseding today's scheduled failure `41623433927` | 3 | Completed |

## Execution notes

- **Task 1** — the pin sweep and single-commit preparation worked as planned;
  the sync's internal verify then passed on the first attempt (task 2), unlike
  the two previous runs, validating the pre-update-the-pins playbook.
- **Untracked `AGENTS.md`** (created in a prior session task, left uncommitted
  at the time): `git status --porcelain` counts untracked files, so the sync's
  dirty-tree guard would have refused. Committed as
  `569f69d docs: add agent guidance...` before the sync — consistent with its
  intended checked-in status.
- **Task 5 environment hiccup** — the first `release:validate` run died inside
  its `npm ci` (Windows file-permission error, likely a transient lock), which
  also left `node_modules` without `tsx`. Restored with a manual `npm ci`, then
  `release:validate` printed `"valid": true` on the retry (its own internal
  `npm ci` + full verify then passed). No repository change was involved.
- **Task 6** — npm registry propagated v1.4.0 after ~60 seconds;
  `dist.attestations.provenance` (SLSA v1) confirmed. The release notes read
  "Publication surfaces are consistent." — the v1.3.0 portal-lag warning
  resolved exactly as predicted from the live portal-document check.
- **Task 7** — dispatch run `41628516313` printed
  `{"action":"none","reason":"canonical sources unchanged"}`, superseding
  today's scheduled failure `41623433927`.
