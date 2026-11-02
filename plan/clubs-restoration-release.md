# Restore `clubs` toolset, sync to Swagger v1.405.0, release v1.3.0

## Goal

**Intended outcome.** Unblock task 7 of `plan/clubs-withdrawal-release.md` (Blocked):
re-align the package with eToro's current Swagger **v1.405.0**, which **reinstated**
the Clubs API (`Clubs` tag + `getClubs`, not deprecated) that v1.404.0 had withdrawn
— restoring the `clubs` toolset (1 current tool) alongside the `data` toolset's
`getStockbackPayments` — and publish it as **v1.3.0** through the existing
tag-driven Release workflow (npm with provenance + GitHub release with the
CHANGELOG-driven release notes).

**Observable success criteria.**

1. `openapi/policy-overrides.json` maps `"Clubs": "clubs"` again; all seven
   generated artifacts reflect v1.405.0 (**157 operations, 26 toolsets**);
   `npm run verify` passes.
2. A `workflow_dispatch` Swagger-sync run on `main` completes successfully with
   `action: none` — the guard failure (`missing=Clubs`, run `41446390279`) is
   resolved and the daily job is healthy.
3. `npm run release:validate -- v1.3.0` prints `"valid": true` on the release
   commit; CI is green on `main`.
4. Release workflow succeeds for tag `v1.3.0`: GitHub release published non-draft
   with the generated notes (changelog section + baseline: v1.405.0, SHA-256,
   157 ops / 26 toolsets); `npm view etoro-trading-mcp@1.3.0` returns metadata
   with provenance.

**Scope.**

1. **Preparation commit on `main`** (single commit, avoiding last run's aborted
   first sync): approved plan file (`git add -f`, per tracked-plan convention),
   re-add `"Clubs": "clubs"` to `openapi/policy-overrides.json` (alphabetical slot
   after `"Cash Accounts"`), and pre-update the pinned baselines in
   `tests/unit/generated-catalog.test.ts` — toolsets 25→26 (line 37), operations
   156→157 (lines 30, 38); unchanged: deprecated 15, sourceDeprecated 3,
   max-ID-length 87, `data` count 5 (verified against the live document:
   `getClubs` is the sole operation delta, not deprecated).
2. **The update:** `npm run sync:swagger` on a clean tree → downloads v1.405.0,
   regenerates (guard passes: tag and mapping agree), internal `npm run verify`
   passes first try, pushes `swagger/v1.405.0/<hash>`, opens the sync PR. Review
   `artifacts/swagger-diff.md` (expect: +`getClubs`, no removals, schema churn
   ~26 added/1 removed); merge manually.
3. **Release commit on `main`:** dated `CHANGELOG.md` `[1.3.0] - 2026-11-02`
   section (Added: `clubs` toolset restored — eToro reinstated
   `GET /api/v1/clubs` (`getClubs`) in Swagger v1.405.0 after withdrawing it in
   v1.404.0, released hours earlier as 1.2.0; Changed: catalog refreshed
   v1.404.0 → v1.405.0, 157 tools across 26 toolsets); `package.json` + both
   `package-lock.json` fields → 1.3.0 (`npm version --no-git-tag-version`);
   hand-maintained docs: `README.md` (toolset count 25→26 in three places, table
   rebalanced back to 13/13 with the `clubs` 1/0 row, `npx@1.3.0` refs,
   "Current release" line → **1.3.0** / **v1.405.0**), `INSTALL.md` (all 7
   version refs → 1.3.0), `server.json` (both `version` fields **and** the
   description's tool count 156 → 157).
4. **Cut the release:** push, `npm run release:validate -- v1.3.0`, tag `v1.3.0`
   on `main` HEAD, push only the tag, monitor the workflow, verify the published
   notes; then the task-7 verification dispatch run.

**Non-goals.** No runtime/`src` changes beyond generated files; no change to the
sync guard (the double flip in one day is upstream churn, not a guard defect); no
re-release or changelog edits for 1.2.0 (it was a coherent v1.404.0-snapshot
release); no guard "tolerance" mechanism for flip-flopping tags.

**Constraints, assumptions, decisions.**

- Same release machinery constraints as before: tag-driven workflow only, local
  `npm publish` forbidden, `NPM_TOKEN`/`production` environment proven.
- **Version 1.3.0 (minor):** restoring a toolset is additive functionality
  (SemVer minor); the repo's precedent gives toolset add/remove cycles minor
  bumps (1.1.0, 1.2.0). Patch (1.2.1) would mislabel added functionality as a
  bug fix.
- Known accepted transient: between the preparation commit and the sync merge,
  `main` CI is red (`generate:check` sees the `Clubs` mapping without the tag on
  the v1.404.0 disk snapshot; the updated test pins also mismatch the old
  catalog) — same window both precedents accepted; minimize it by proceeding
  directly to the sync.
- Research-verified (2026-11-02, live fetch): v1.405.0 current and stable in
  consecutive checks; sole operation delta `+getClubs` (GET `/api/v1/clubs`, tag
  `Clubs`, `deprecated: false`); 26 schemas added (Clubs DTOs + avatar renames),
  1 removed (`Avatar`); `getStockbackPayments` retained.
- Assumption: v1.405.0 stays published through execution; if it changes again,
  re-verify the live delta before running the sync (one curl + node check) — a
  materially different delta returns to this goal gate.

**Test level.** No new tests. The only test changes are the baseline pins in
task 1 (unit level, existing suite) — they protect the generated-catalog baseline
that task 3's merge criterion re-checks; the full unit + integration suites run
inside `npm run verify` at tasks 2, 3, and 4.

## Tasks

| ID | Task | Completion criterion | Dependencies | Status |
|---:|---|---|---|---|
| 1 | Preparation commit on `main` (single commit): force-add the approved plan file, re-add `"Clubs": "clubs"` to `openapi/policy-overrides.json`, pre-update the pinned baselines in `tests/unit/generated-catalog.test.ts` (toolsets 25→26; operations 156→157 in both assertions) so the sync's internal verify passes first try | `git log origin/main` shows the commit; policy parses with 26 mappings including `Clubs`; test file contains `toHaveLength(26)` and `toBe(157)`; `git status` clean | None | Completed |
| 2 | Run `npm run sync:swagger` on the clean tree: download v1.405.0, regenerate, push `swagger/v1.405.0/<hash>`, open the sync PR; review `artifacts/swagger-diff.md` — expect exactly `+getClubs`, no removals, ~26 schema additions / 1 removal, publication sets consistent | PR titled `chore: sync eToro Swagger v1.405.0` exists; script's internal `npm run verify` passes on the first attempt; diff report matches expectations; all 6 PR CI checks pass | 1 | In progress |
| 3 | Merge the sync PR manually and update local `main` | `main` HEAD contains the sync commit; `node` check on `docs/data/tool-catalog.json` reports `sourceVersion: v1.405.0`, 157 operations, 26 toolsets, `clubs` present with `getClubs` non-deprecated; `npm run verify` passes on `main` | 2 | Pending |
| 4 | Release commit on `main`: dated `CHANGELOG.md` `[1.3.0]` section (Added/Changed per approved goal); `package.json` + both `package-lock.json` version fields → 1.3.0 via `npm version --no-git-tag-version`; `README.md` (toolset count 25→26 in three places, table rebalanced to 13/13 with `clubs` 1/0 row, `npx@1.3.0` refs, "Current release" line → 1.3.0 / v1.405.0); `INSTALL.md` (all 7 version refs → 1.3.0); `server.json` (both `version` fields → 1.3.0 and description tool count 156 → 157) | On the release commit: `npm run verify` green; greps confirm the `clubs` row is back in `README.md`, no `1.2.0` remains in `README.md`/`INSTALL.md`/`server.json`, both lockfile version fields are 1.3.0 | 3 | Pending |
| 5 | Push the release commit to `origin/main`, then `npm run release:validate -- v1.3.0` | Command prints `"valid": true` (tag/lockfile/changelog/registry-unpublished/main-ancestry checks all pass) | 4 | Pending |
| 6 | Tag `v1.3.0` on `main` HEAD, push only the tag, monitor the Release workflow to completion, verify the published artifacts | Workflow run for tag `v1.3.0` succeeds; `gh release view v1.3.0` is non-draft with the 1.3.0 changelog section and baseline (v1.405.0, SHA-256, 157 ops / 26 toolsets); `npm view etoro-trading-mcp@1.3.0` returns version + `dist.attestations.provenance` (retry for up to ~5 minutes — registry propagation lag observed on v1.2.0) | 5 | Pending |
| 7 | Unblock verification of the daily job: trigger a `workflow_dispatch` Swagger-sync run on `main` | The run completes successfully with `action: none`; `gh run list --workflow "Swagger sync"` shows the new green run superseding the `missing=Clubs` failures | 3 | Pending |
