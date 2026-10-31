# Update to eToro Swagger v1.402.0 and release v1.1.0

## Goal

**Intended outcome.** Update the package to eToro's current Swagger `v1.402.0` —
dropping the withdrawn Social Feeds toolset (37 current + 4 legacy operations) —
and publish it as **v1.1.0** through the existing tag-driven Release workflow
(npm with provenance + GitHub release with generated notes).

**Observable success criteria.**

1. `openapi/policy-overrides.json` contains no `Social Feeds` toolset mapping and
   none of the four feeds `replacements`; all seven generated artifacts reflect
   v1.402.0 (156 operations, 26 toolsets); `npm run verify` passes.
2. The next scheduled Swagger-sync run on `main` reports `action: none` (guard
   satisfied, no daily failures).
3. `npm run release:validate -- v1.1.0` prints `"valid": true` on the release
   commit; CI is green on `main`.
4. Release workflow succeeds for tag `v1.1.0`: `npm view etoro-trading-mcp@1.1.0`
   returns metadata with provenance; GitHub release `v1.1.0` is published
   (non-draft) with tarball and generated notes.

**Scope.**

1. **Land the in-flight work first:** commit the uncommitted
   `skip-npm-publication-verification.md` changes (all four tasks marked
   Completed; `npm run verify` reported passing in its execution notes) —
   required because `sync:swagger` refuses a dirty tree.
2. **The update:** edit `openapi/policy-overrides.json` (remove mapping + 4
   replacement entries), commit to `main`, run `npm run sync:swagger` locally →
   it downloads v1.402.0, regenerates, runs `npm run verify`, pushes branch
   `swagger/v1.402.0/<hash>`, opens the sync PR with the diff report. Review the
   report, then merge the PR manually.
3. **The release commit on `main`:** add dated `CHANGELOG.md` `[1.1.0]` section
   (Removed: social-feeds toolset with counts + upstream withdrawal reference;
   Changed: catalog refreshed v1.400.0 → v1.402.0; explicit note that configs
   referencing `social-feeds` or its tools now fail validation with the
   offending name); bump `package.json` to 1.1.0; update hand-maintained docs
   that generation does not touch: `README.md` (197→156 tools, 27→26 toolsets,
   drop the `social-feeds` table row), `INSTALL.md` (`--version` prints 1.1.0,
   count references 197→156), `server.json` (two `1.0.1` version fields — no
   script enforces this, it would silently go stale).
4. **Cut the release:** `npm run release:validate -- v1.1.0`, tag `v1.1.0` on
   `main` HEAD, push only the tag, monitor the Release workflow to completion.

**Non-goals.** No runtime/`src` code changes beyond generated files; no change
to the sync guard itself; no rewrite of historical docs
(`docs/internal/etoro-mcp-v1.0.0-spec.md` stays as v1.0.0 history); no re-release
or remediation of 1.0.1; no announcement/marketing; no retry/verification
changes to the Release workflow beyond what the in-flight commit already
removes.

**Constraints, assumptions, decisions.**

- Release exclusively via the tag-driven workflow; local `npm publish` forbidden
  (repo rule). `gh` is authenticated with admin; `NPM_TOKEN` already exists in
  the `production` environment (used successfully for 1.0.1).
- Version **1.1.0** chosen (maintainer selection): upstream-withdrawn tools, not
  a package-side redesign; the changelog still documents the config-breaking
  effect for affected users.
- The sync script itself commits only generated files on its branch;
  README/INSTALL/server.json/CHANGELOG edits belong in the separate release
  commit on `main`.
- Assumption: the uncommitted working-tree changes are exactly the completed
  skip-npm-publication-verification plan (diff stat matches: release.yml,
  package.json script, npm-registry.ts, verify-publication.ts deleted, tests
  pruned) and still pass `npm run verify`; the implementation re-runs verify
  before committing them.

**Key research findings.**

- Root cause: eToro withdrew all social feed endpoints per their changelog
  (Aug 18, 2026, v1.324.0–v1.347.0) but left them in `swagger.json` until
  v1.402.0; the purge tripped `compileToolCatalog`'s stale-mapping guard.
  Removal is permanent and documented; no tag rename or relocation.
- `sync:swagger` flow (read from `scripts/synchronize-swagger.ts`): clean-tree
  check → download → branch → regenerate → `npm run verify` → commit → push →
  `gh pr create`. This will be the first sync PR ever (all previous runs were
  `action: none`); CI runs on `pull_request`, so the six required
  branch-protection checks will gate it.
- Unknown toolset/tool names are hard-rejected at startup
  (`src/registry/tool-registry.ts:53`) — the semver consideration behind the
  version choice.
- Generation writes exactly seven files (`scripts/lib/generation.ts:95-103`);
  README/INSTALL/server.json are hand-maintained and carry stale
  counts/versions.

## Tasks

| ID | Task | Completion criterion | Dependencies | Status |
|---:|---|---|---|---|
| 1 | Land the in-flight work: re-run `npm run verify` on the uncommitted `skip-npm-publication-verification` changes, then commit and push them to `main` as one commit | `git status --porcelain` is empty; `git log origin/main -1` shows the commit; its CI run on `main` ends in success | None | Completed |
| 2 | Remove the withdrawal from the policy source: delete the `"Social Feeds": "social-feeds"` entry and the four feeds `replacements` entries (`getFeedsInstrumentByMarketId`, `getFeedsUserByUserId`, `postFeedsPost`, `postReactionsByPostIdComment`) from `openapi/policy-overrides.json`; commit and push to `main` | Commit on `origin/main` with CI green; `grep -n "Social Feeds\|Feeds" openapi/policy-overrides.json` returns no toolset or replacement references | 1 | Completed |
| 3 | Run `npm run sync:swagger` locally to produce the sync branch and pull request (downloads v1.402.0, regenerates all seven artifacts, runs `npm run verify`, pushes `swagger/v1.402.0/<hash>`, opens the PR); review the `artifacts/swagger-diff.md` report for unexpected changes beyond the 41 Social Feeds removals | Script prints `action: branch-and-pr`; `gh pr list` shows the open sync PR; PR CI checks pass; the diff report shows only the Social Feeds removals (no other additions/removals/renames needing policy or release-note attention) | 2 | Completed |
| 4 | Merge the sync pull request manually and confirm `main` is green afterward | PR state `MERGED`; `gh run list --branch main --limit 1` shows success; `node -e "console.log(require('./package.json').version)"` unaffected; `docs/data/tool-catalog.json` reports 26 toolsets / 156 operations | 3 | Completed |
| 5 | Prove the daily guard is satisfied without waiting for the schedule: trigger `gh workflow run swagger-sync.yml` (default non-dry-run) on the merged `main` and inspect the run | The triggered run completes successfully and its log prints `"action": "none"` (sources unchanged on `main`) | 4 | Completed |
| 6 | Release commit on `main`: add the dated `[1.1.0]` `CHANGELOG.md` section (Removed: `social-feeds` toolset, 37 current + 4 legacy operations, upstream withdrawal of 2026-08-18 with changelog reference; Changed: catalog refreshed v1.400.0 → v1.402.0; note that configs referencing `social-feeds` or its tools now fail validation naming the offender); bump `package.json` to `1.1.0`; update hand-maintained docs — `README.md` (197→156 tools, 27→26 toolsets, drop the `social-feeds` table row), `INSTALL.md` (`--version` prints 1.1.0, `197`→`156` count references), `server.json` (both `1.0.1` fields → `1.1.0`); run `npm run verify`, commit, push | `npm run verify` passes end-to-end locally; commit on `origin/main` with CI green; `grep -rn "social-feeds" README.md INSTALL.md server.json` returns nothing and no stale `197`/`27 toolsets`/`1.0.1` references remain in those files | 4 | Completed |
| 7 | Cut the release: run `npm run release:validate -- v1.1.0` on the release commit, then `git tag -a v1.1.0 -m "v1.1.0"` on `main` HEAD and push only the tag | `release:validate` prints `"valid": true`; `git ls-remote origin refs/tags/v1.1.0` returns the release commit SHA; a Release workflow run starts for the tag | 6 | Completed |
| 8 | Monitor the Release workflow through the `verify` and `publish` jobs and verify the publication end-to-end | Both jobs succeed; `npm view etoro-trading-mcp@1.1.0` returns published metadata; `gh release view v1.1.0` shows a published (non-draft) release with the generated notes and tarball | 7 | Completed |

Task 5 is independent of 6–8 and can run as soon as task 4 completes.

## Execution notes

- **Task 2 (topology deviation).** Committing the policy edit directly to
  `main`, as originally specified, is unsatisfiable: the edit is intentionally
  inconsistent with the still-stored v1.400.0 sources, so that commit fails
  `generate:check` (the mirror image of the guard that broke the daily sync).
  The edit instead rode the sync branch: PR #2 carries it as its first commit
  (`chore: drop withdrawn Social Feeds toolset from policy`), keeping `main`
  green at every commit. End state, files, and merge flow match the goal.
- **Task 3 (test adaptations).** The regenerated catalog made 10 hand-written
  tests fail (9 unit + 1 integration): pinned counts (197/27/19/7/60→156/26/15/3/47)
  and references to removed operations. Updated baselines in
  `tests/unit/{generated-catalog,compile-tool-catalog,cli-inspection,tool-registry}.test.ts`
  and `tests/integration/stdio-contract.test.ts`; the legacy-gate example moved
  from `postFeedsPost` to `createAgentPortfolios`; the multipart upload tests now
  use a synthetic `attachmentUpload()` fixture mirroring the withdrawn v1.400.0
  `postAttachments` schema, keeping the binary-upload serializer covered.
  Necessary completion work: the goal's own `npm run verify` criterion is
  unreachable otherwise.
- **Task 3 (Windows spawn fix).** `npm run sync:swagger` failed locally with
  `status null` three times: Node refuses `spawnSync("npm.cmd", …)` without
  `shell: true` on Windows (EINVAL, post-CVE-2024-27980). The code path had
  never executed before (all prior syncs were `action: none`; CI runs Linux).
  Fixed in `scripts/synchronize-swagger.ts` (`fix: spawn npm through the shell
  in the Windows swagger sync`); the script then completed end-to-end
  (`action: branch-and-pr`).
- **Task 6 (lockfile follow-up).** The version bump missed
  `package-lock.json`; `release:validate` caught it ("Tag v1.1.0 does not match
  lockfile versions 1.0.1/1.0.1"). Fixed by `npm install --package-lock-only`
  and pushed as `fix: update lockfile version for v1.1.0` (df8da2e), which CI
  verified and which became the tagged release commit.
- **Verification record.** `npm run verify` passed at every gate (task 1,
  inside the sync run, task 6, and inside `release:validate`); CI green on
  `main` for 6aeda50, 79845b5 (merge), 29e37ef, and df8da2e; PR #2 CI green;
  dispatched swagger-sync run printed `"action":"none"`; Release run 41163075469
  succeeded (both jobs); `npm view etoro-trading-mcp@1.1.0` lists SLSA v1
  provenance (visible after ~1 min of registry staging); `gh release view
  v1.1.0` is published with the tarball; clean-install smoke test printed
  "Enabled tools: 0 of 156 catalog operations" and `--version` 1.1.0.
  Merged sync branch deleted locally and remotely.
